"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatMoney, todayIso } from "@/lib/format";
import type { BudgetLineView, MonthSummary } from "@/lib/services/budget";
import type { TransactionView } from "@/lib/services/transactions";

type Props = {
  monthId: number;
  summary: MonthSummary;
  initialTransactions: TransactionView[];
  variant?: "page" | "sidebar";
};

export function TransactionPanel({ monthId, summary, initialTransactions, variant = "page" }: Props) {
  const router = useRouter();
  const [txns, setTxns] = useState(initialTransactions);
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [lineId, setLineId] = useState<number | "">("");
  const [date, setDate] = useState(todayIso());
  const [showForm, setShowForm] = useState(variant === "page");

  const lines = summary.budgetLines;
  const unassigned = txns.filter((t) => !t.assigned);

  async function refreshTransactions() {
    const list = await fetch(`/api/transactions?monthId=${monthId}`);
    const data = (await list.json()) as { transactions: TransactionView[] };
    setTxns(data.transactions);
    router.refresh();
  }

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault();
    const amt = -Math.abs(Number(amount));
    if (!payee || !Number.isFinite(amt)) return;

    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monthId,
        date,
        amount: amt,
        payee,
        budgetLineId: lineId === "" ? undefined : lineId,
      }),
    });
    if (!res.ok) return;
    setPayee("");
    setAmount("");
    setLineId("");
    if (variant === "sidebar") setShowForm(false);
    await refreshTransactions();
  }

  async function assign(txnId: number, budgetLineId: number, txnAmount: number) {
    const res = await fetch(`/api/transactions?id=${txnId}&monthId=${monthId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        splits: [{ budgetLineId, amount: Math.abs(txnAmount) }],
      }),
    });
    if (!res.ok) return;
    await refreshTransactions();
  }

  if (variant === "sidebar") {
    return (
      <aside className="ed-sidebar flex h-full flex-col">
        <div className="border-b border-plan-border px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-plan-text">Transactions</h2>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="text-sm font-medium text-plan-green hover:text-plan-green-dark"
            >
              {showForm ? "Cancel" : "+ Add"}
            </button>
          </div>
          {unassigned.length > 0 && (
            <p className="mt-1 text-xs text-plan-warn">
              {unassigned.length} need{unassigned.length === 1 ? "s" : ""} to be assigned
            </p>
          )}
        </div>

        {showForm && (
          <form onSubmit={addTransaction} className="space-y-3 border-b border-plan-border p-4">
            <div>
              <label className="field-label">Payee</label>
              <input className="field-input" value={payee} onChange={(e) => setPayee(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="field-input num"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="field-label">Date</label>
                <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="field-label">Budget line</label>
              <select
                className="field-input"
                value={lineId}
                onChange={(e) => setLineId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Choose category…</option>
                {lines.map((l: BudgetLineView) => (
                  <option key={l.id} value={l.id}>
                    {l.groupName} › {l.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="ed-btn-primary w-full">
              Save transaction
            </button>
          </form>
        )}

        <div className="flex-1 overflow-y-auto">
          {txns.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-plan-text">No transactions yet</p>
              <p className="mt-1 text-xs text-plan-muted">Add expenses manually — bank sync comes later.</p>
            </div>
          ) : (
            <ul className="divide-y divide-plan-border">
              {txns.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-plan-text">{t.payee}</p>
                      <p className="text-xs text-plan-muted">{t.date}</p>
                    </div>
                    <span className="num shrink-0 text-sm font-semibold text-plan-text">
                      {formatMoney(t.amount)}
                    </span>
                  </div>
                  <div className="mt-2">
                    {t.assigned ? (
                      <span className="inline-block rounded-full bg-plan-green-light px-2 py-0.5 text-xs font-medium text-plan-green">
                        {t.splits.map((s) => s.lineName).join(", ")}
                      </span>
                    ) : (
                      <select
                        className="field-input py-1.5 text-xs"
                        defaultValue=""
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          if (id) void assign(t.id, id, t.amount);
                        }}
                      >
                        <option value="">Assign to budget line…</option>
                        {lines.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.groupName} › {l.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addTransaction} className="panel grid gap-4 md:grid-cols-2">
        <div>
          <label className="field-label">Date</label>
          <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Payee</label>
          <input className="field-input" value={payee} onChange={(e) => setPayee(e.target.value)} required />
        </div>
        <div>
          <label className="field-label">Amount (spend)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="field-input num"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label">Budget line (optional)</label>
          <select
            className="field-input"
            value={lineId}
            onChange={(e) => setLineId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Unassigned</option>
            {lines.map((l: BudgetLineView) => (
              <option key={l.id} value={l.id}>
                {l.groupName} › {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <button type="submit" className="ed-btn-primary">
            Add transaction
          </button>
        </div>
      </form>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-plan-border text-left text-plan-muted">
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Payee</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Assigned</th>
              <th className="px-4 py-3 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t.id} className="border-b border-plan-border/60">
                <td className="num px-4 py-3">{t.date}</td>
                <td className="px-4 py-3 font-medium">{t.payee}</td>
                <td className="num px-4 py-3 text-right">{formatMoney(t.amount)}</td>
                <td className="px-4 py-3">
                  {t.assigned ? (
                    <span className="rounded-full bg-plan-green-light px-2 py-0.5 text-xs font-medium text-plan-green">
                      {t.splits.map((s) => s.lineName).join(", ")}
                    </span>
                  ) : (
                    <select
                      className="field-input py-1 text-xs"
                      defaultValue=""
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        if (id) void assign(t.id, id, t.amount);
                      }}
                    >
                      <option value="">Assign…</option>
                      {lines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 capitalize text-plan-muted">{t.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {txns.length === 0 && (
          <p className="py-10 text-center text-sm text-plan-muted">No transactions this month.</p>
        )}
      </div>
    </div>
  );
}
