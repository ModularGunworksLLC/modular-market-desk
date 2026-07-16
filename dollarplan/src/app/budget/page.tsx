import { BalanceHero } from "@/components/BalanceHero";
import { BudgetEditor } from "@/components/BudgetEditor";
import { TransactionPanel } from "@/components/TransactionPanel";
import { currentYearMonth } from "@/lib/format";
import { getMonthSummary, getOrCreateMonth } from "@/lib/services/budget";
import { listTransactionsForMonth } from "@/lib/services/transactions";

export default async function BudgetPage() {
  const { year, month } = currentYearMonth();
  const monthId = await getOrCreateMonth(year, month);
  const summary = await getMonthSummary(monthId);
  if (!summary) return null;

  const transactions = await listTransactionsForMonth(monthId);

  return (
    <div className="space-y-4">
      <BalanceHero summary={summary} compact />

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <BudgetEditor initial={summary} />
        </div>
        <div className="w-full shrink-0 xl:sticky xl:top-[4.5rem] xl:w-[380px] xl:max-h-[calc(100vh-6rem)]">
          <TransactionPanel
            monthId={monthId}
            summary={summary}
            initialTransactions={transactions}
            variant="sidebar"
          />
        </div>
      </div>
    </div>
  );
}
