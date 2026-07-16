import type { TransactionSource } from "@/lib/db/schema";

export type IngestTransactionInput = {
  householdId: number;
  monthId: number | null;
  date: string;
  amount: number;
  payee: string;
  memo?: string;
  source: TransactionSource;
  pending?: boolean;
  plaidTransactionId?: string | null;
  plaidAccountId?: string | null;
};

/**
 * Adapter boundary for transaction ingestion.
 * Manual UI and future Plaid sync both call the same service.
 */
export interface TransactionIngestAdapter {
  readonly source: TransactionSource;
  ingest(input: IngestTransactionInput): Promise<number>;
}
