import { formatMoney, monthLabel } from "@/lib/format";
import type { MonthSummary } from "@/lib/services/budget";

export function BalanceHero({ summary, compact = false }: { summary: MonthSummary; compact?: boolean }) {
  const balanced = summary.balanced;
  const left = summary.leftToBudget;

  if (compact) {
    return (
      <div className="ed-hero mb-4">
        <p className="text-xs font-medium text-plan-muted">{monthLabel(summary.year, summary.month)} budget</p>
        <p className={`${balanced ? "text-plan-green" : "text-plan-warn"} text-xl font-bold md:text-2xl`}>
          {balanced ? "$0 left to budget" : `${formatMoney(left)} left to budget`}
        </p>
        <p className="ed-hero-subtitle">
          {balanced
            ? "It's a balanced budget — every dollar has a job."
            : left > 0
              ? "Assign remaining income to your budget lines."
              : "You're over-budgeted. Reduce lines or add income."}
        </p>
      </div>
    );
  }

  return (
    <div className="ed-hero">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-plan-muted">
            {monthLabel(summary.year, summary.month)} budget
          </p>
          <p className={`mt-1 ${balanced ? "ed-hero-title" : "text-2xl font-bold text-plan-warn md:text-3xl"}`}>
            {balanced ? "$0 left to budget" : `${formatMoney(left)} left to budget`}
          </p>
          <p className="ed-hero-subtitle">
            {balanced
              ? "It's a balanced budget — every dollar has a job."
              : left > 0
                ? "Assign remaining income to your budget lines."
                : "You're over-budgeted. Reduce lines or add income."}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 md:gap-8">
          <Stat label="Planned income" value={formatMoney(summary.plannedIncome)} />
          <Stat label="Planned expenses" value={formatMoney(summary.plannedExpenses)} />
          <Stat
            label="Spent so far"
            value={formatMoney(summary.budgetLines.reduce((s, l) => s + l.spent, 0))}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center md:text-right">
      <p className="text-xs text-plan-muted">{label}</p>
      <p className="num mt-0.5 text-base font-semibold text-plan-text md:text-lg">{value}</p>
    </div>
  );
}
