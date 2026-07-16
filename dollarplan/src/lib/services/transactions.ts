import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import type { TransactionSource } from "@/lib/db/schema";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";

const { budgetLines, transactionSplits, transactions } = schema;

export type TransactionView = {
  id: number;
  date: string;
  amount: number;
  payee: string;
  memo: string | null;
  source: TransactionSource;
  pending: boolean;
  assigned: boolean;
  splits: { budgetLineId: number; amount: number; lineName: string | null }[];
};

export async function createManualTransaction(input: {
  monthId: number;
  date: string;
  amount: number;
  payee: string;
  memo?: string;
  budgetLineId?: number;
}): Promise<number> {
  const [txn] = await db
    .insert(transactions)
    .values({
      householdId: DEFAULT_HOUSEHOLD_ID,
      monthId: input.monthId,
      date: input.date,
      amount: input.amount,
      payee: input.payee,
      memo: input.memo ?? null,
      source: "manual",
    })
    .returning();
  if (!txn) throw new Error("Failed to create transaction.");

  if (input.budgetLineId != null) {
    await db.insert(transactionSplits).values({
      transactionId: txn.id,
      budgetLineId: input.budgetLineId,
      amount: Math.abs(input.amount),
    });
  }

  return txn.id;
}

/** Future Plaid sync calls this with source: 'plaid' and plaidTransactionId set. */
export async function ingestExternalTransaction(input: {
  monthId: number | null;
  date: string;
  amount: number;
  payee: string;
  memo?: string;
  source: TransactionSource;
  pending?: boolean;
  plaidTransactionId?: string | null;
  plaidAccountId?: string | null;
}): Promise<number> {
  if (input.plaidTransactionId) {
    const dupe = await db.query.transactions.findFirst({
      where: eq(transactions.plaidTransactionId, input.plaidTransactionId),
    });
    if (dupe) return dupe.id;
  }

  const [txn] = await db
    .insert(transactions)
    .values({
      householdId: DEFAULT_HOUSEHOLD_ID,
      monthId: input.monthId,
      date: input.date,
      amount: input.amount,
      payee: input.payee,
      memo: input.memo ?? null,
      source: input.source,
      pending: input.pending ?? false,
      plaidTransactionId: input.plaidTransactionId ?? null,
      plaidAccountId: input.plaidAccountId ?? null,
    })
    .returning();
  if (!txn) throw new Error("Failed to ingest transaction.");
  return txn.id;
}

export async function assignTransaction(
  transactionId: number,
  splits: { budgetLineId: number; amount: number }[],
): Promise<void> {
  await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId));
  if (splits.length > 0) {
    await db.insert(transactionSplits).values(
      splits.map((s) => ({
        transactionId,
        budgetLineId: s.budgetLineId,
        amount: s.amount,
      })),
    );
  }
}

export async function listTransactionsForMonth(monthId: number): Promise<TransactionView[]> {
  const rows = await db.query.transactions.findMany({
    where: eq(transactions.monthId, monthId),
    orderBy: desc(transactions.date),
  });

  const views: TransactionView[] = [];
  for (const t of rows) {
    const splits = await db
      .select({
        budgetLineId: transactionSplits.budgetLineId,
        amount: transactionSplits.amount,
        lineName: budgetLines.name,
      })
      .from(transactionSplits)
      .leftJoin(budgetLines, eq(budgetLines.id, transactionSplits.budgetLineId))
      .where(eq(transactionSplits.transactionId, t.id));

    views.push({
      id: t.id,
      date: t.date,
      amount: t.amount,
      payee: t.payee,
      memo: t.memo,
      source: t.source as TransactionSource,
      pending: t.pending,
      assigned: splits.length > 0,
      splits: splits.map((s) => ({
        budgetLineId: s.budgetLineId,
        amount: s.amount,
        lineName: s.lineName,
      })),
    });
  }
  return views;
}

export async function listPlaidInbox(monthId: number): Promise<TransactionView[]> {
  const all = await listTransactionsForMonth(monthId);
  return all.filter((t) => !t.assigned && t.source === "plaid");
}
