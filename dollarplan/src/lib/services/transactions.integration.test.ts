import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bootstrapTestDb, cleanupTestDb } from "@/test/test-db";

describe("transaction service (integration)", () => {
  beforeAll(async () => {
    await bootstrapTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  it("creates manual transaction with assignment", async () => {
    const { getOrCreateMonth, getMonthSummary } = await import("@/lib/services/budget");
    const { createManualTransaction, listTransactionsForMonth } = await import(
      "@/lib/services/transactions"
    );

    const monthId = await getOrCreateMonth(2026, 8);
    const summary = await getMonthSummary(monthId);
    const groceries = summary!.budgetLines.find((l) => l.name === "Groceries");
    expect(groceries).toBeDefined();

    await createManualTransaction({
      monthId,
      date: "2026-08-15",
      amount: -64.2,
      payee: "Publix",
      budgetLineId: groceries!.id,
    });

    const txns = await listTransactionsForMonth(monthId);
    expect(txns).toHaveLength(1);
    expect(txns[0]?.payee).toBe("Publix");
    expect(txns[0]?.assigned).toBe(true);
    expect(txns[0]?.splits[0]?.lineName).toBe("Groceries");

    const updated = await getMonthSummary(monthId);
    const line = updated!.budgetLines.find((l) => l.id === groceries!.id);
    expect(line?.spent).toBe(64.2);
    expect(line?.remaining).toBeCloseTo((line?.plannedAmount ?? 0) - 64.2, 2);
  });

  it("dedupes plaid transactions by plaidTransactionId", async () => {
    const { getOrCreateMonth } = await import("@/lib/services/budget");
    const { ingestExternalTransaction, listPlaidInbox } = await import(
      "@/lib/services/transactions"
    );

    const monthId = await getOrCreateMonth(2026, 9);
    const base = {
      monthId,
      date: "2026-09-01",
      amount: -15.99,
      payee: "Netflix",
      source: "plaid" as const,
      plaidTransactionId: "plaid-txn-unique-001",
    };

    const id1 = await ingestExternalTransaction(base);
    const id2 = await ingestExternalTransaction(base);
    expect(id2).toBe(id1);

    const inbox = await listPlaidInbox(monthId);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.assigned).toBe(false);
  });

  it("assignTransaction links txn to budget line", async () => {
    const { getOrCreateMonth, getMonthSummary } = await import("@/lib/services/budget");
    const {
      assignTransaction,
      createManualTransaction,
      listTransactionsForMonth,
    } = await import("@/lib/services/transactions");

    const monthId = await getOrCreateMonth(2026, 10);
    const summary = await getMonthSummary(monthId);
    const gas = summary!.budgetLines.find((l) => l.name === "Gas");
    expect(gas).toBeDefined();

    const txnId = await createManualTransaction({
      monthId,
      date: "2026-10-05",
      amount: -52.1,
      payee: "Shell",
    });

    await assignTransaction(txnId, [{ budgetLineId: gas!.id, amount: 52.1 }]);

    const txns = await listTransactionsForMonth(monthId);
    const txn = txns.find((t) => t.id === txnId);
    expect(txn?.assigned).toBe(true);
    expect(txn?.splits[0]?.budgetLineId).toBe(gas!.id);
  });
});
