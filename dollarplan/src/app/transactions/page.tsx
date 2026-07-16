import { BalanceHero } from "@/components/BalanceHero";
import { TransactionPanel } from "@/components/TransactionPanel";
import { currentYearMonth } from "@/lib/format";
import { getMonthSummary, getOrCreateMonth } from "@/lib/services/budget";
import { listTransactionsForMonth } from "@/lib/services/transactions";

export default async function TransactionsPage() {
  const { year, month } = currentYearMonth();
  const monthId = await getOrCreateMonth(year, month);
  const summary = await getMonthSummary(monthId);
  if (!summary) return null;

  const transactions = await listTransactionsForMonth(monthId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-plan-text">Transactions</h1>
        <p className="mt-1 text-sm text-plan-muted">Track spending and assign every dollar to a budget line.</p>
      </div>
      <BalanceHero summary={summary} compact />
      <TransactionPanel monthId={monthId} summary={summary} initialTransactions={transactions} variant="page" />
    </div>
  );
}
