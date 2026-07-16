import { formatMoney } from "@/lib/format";

export function ProgressBar({
  planned,
  spent,
  className = "",
}: {
  planned: number;
  spent: number;
  className?: string;
}) {
  if (planned <= 0) return null;

  const pct = Math.min(100, Math.round((spent / planned) * 100));
  const overspent = spent > planned;

  return (
    <div className={`mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-plan-border ${className}`}>
      <div
        className={`h-full rounded-full transition-all ${overspent ? "bg-plan-nogo" : "bg-plan-green"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function RemainingBadge({ remaining }: { remaining: number }) {
  const overspent = remaining < 0;
  return (
    <span
      className={`num text-sm font-medium ${overspent ? "text-plan-nogo" : remaining === 0 ? "text-plan-muted" : "text-plan-green"}`}
    >
      {formatMoney(remaining)}
    </span>
  );
}
