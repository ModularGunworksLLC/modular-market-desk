import Link from "next/link";

import { BalanceHero } from "@/components/BalanceHero";
import { ProgressBar } from "@/components/ProgressBar";
import { currentYearMonth, formatMoney, monthLabel } from "@/lib/format";
import { isPlaidEnabled } from "@/lib/plaid/config";
import { getMonthSummary, getOrCreateMonth } from "@/lib/services/budget";
import { listTransactionsForMonth } from "@/lib/services/transactions";

export default async function HomePage() {
  const { year, month } = currentYearMonth();
  const monthId = await getOrCreateMonth(year, month);
  const summary = await getMonthSummary(monthId);
  if (!summary) return null;

  const transactions = await listTransactionsForMonth(monthId);
  const unassigned = transactions.filter((t) => !t.assigned).length;
  const favorites = summary.budgetLines.filter((l) => l.isFavorite || l.remaining < l.plannedAmount * 0.25);
  const spotlight = favorites.length > 0 ? favorites.slice(0, 4) : summary.budgetLines.filter((l) => l.plannedAmount > 0).slice(0, 4);

  return (
    <div className="space-y-5">
      <BalanceHero summary={summary} />

      {unassigned > 0 && (
        <div className="rounded-lg border border-plan-warn/30 bg-amber-50 px-4 py-3 text-sm text-plan-warn">
          <span className="font-semibold">{unassigned} transaction{unassigned === 1 ? "" : "s"}</span> need to be
          assigned to a budget line.{" "}
          <Link href="/budget" className="font-medium underline">
            Go to Budget
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel">
          <div className="mb-4 flex items-center justify-between border-b border-plan-border pb-3">
            <h2 className="text-base font-semibold text-plan-text">This month</h2>
            <Link href="/budget" className="text-sm font-medium text-plan-green hover:text-plan-green-dark">
              Edit budget →
            </Link>
          </div>
          <ul className="space-y-4">
            {spotlight.map((l) => (
              <li key={l.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-plan-text">
                    {l.name}
                    <span className="ml-1.5 font-normal text-plan-muted">({l.groupName})</span>
                  </span>
                  <span className="num text-plan-text-secondary">
                    {formatMoney(l.spent)} / {formatMoney(l.plannedAmount)}
                  </span>
                </div>
                <ProgressBar planned={l.plannedAmount} spent={l.spent} />
                <p className="mt-1 text-xs text-plan-muted">{formatMoney(l.remaining)} remaining</p>
              </li>
            ))}
            {spotlight.length === 0 && (
              <p className="text-sm text-plan-muted">Set up your {monthLabel(year, month)} budget to get started.</p>
            )}
          </ul>
        </section>

        <section className="panel">
          <div className="mb-4 flex items-center justify-between border-b border-plan-border pb-3">
            <h2 className="text-base font-semibold text-plan-text">Recent transactions</h2>
            <Link href="/transactions" className="text-sm font-medium text-plan-green hover:text-plan-green-dark">
              View all →
            </Link>
          </div>
          {transactions.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-plan-muted">No transactions yet.</p>
              <Link href="/budget" className="mt-2 inline-block text-sm font-medium text-plan-green">
                Add your first transaction
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-plan-border">
              {transactions.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-plan-text">{t.payee}</p>
                    <p className="text-xs text-plan-muted">{t.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="num font-semibold">{formatMoney(t.amount)}</p>
                    {t.assigned ? (
                      <p className="text-xs text-plan-green">{t.splits[0]?.lineName}</p>
                    ) : (
                      <p className="text-xs text-plan-warn">Unassigned</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel">
        <h2 className="mb-2 text-base font-semibold text-plan-text">Bank sync</h2>
        <p className="text-sm text-plan-muted">
          {isPlaidEnabled()
            ? "Plaid credentials detected. Automatic import can be wired when you're ready."
            : "Manual entry for now — just like EveryDollar Free. Connect your bank later with Plaid when you want auto-import."}
        </p>
      </section>
    </div>
  );
}
