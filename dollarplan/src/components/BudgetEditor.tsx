"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ProgressBar, RemainingBadge } from "@/components/ProgressBar";
import { formatMoney } from "@/lib/format";
import type { BudgetLineView, MonthSummary } from "@/lib/services/budget";

type EditableIncome = { name: string; plannedAmount: number; payDay: number | null };
type EditableLine = {
  groupName: string;
  name: string;
  plannedAmount: number;
  dueDay: number | null;
  isSinkingFund: boolean;
};

const DEFAULT_GROUPS = [
  "Giving",
  "Saving",
  "Housing",
  "Transportation",
  "Food",
  "Personal",
  "Lifestyle",
  "Health",
  "Insurance",
  "Debt",
];

export function BudgetEditor({ initial }: { initial: MonthSummary }) {
  const router = useRouter();
  const [incomes, setIncomes] = useState<EditableIncome[]>(
    initial.incomeLines.map((i) => ({
      name: i.name,
      plannedAmount: i.plannedAmount,
      payDay: i.payDay,
    })),
  );
  const [lines, setLines] = useState<EditableLine[]>(
    initial.budgetLines.map((l) => ({
      groupName: l.groupName,
      name: l.name,
      plannedAmount: l.plannedAmount,
      dueDay: l.dueDay,
      isSinkingFund: l.isSinkingFund,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const spentByIndex = useMemo(() => {
    return initial.budgetLines.map((l) => l.spent);
  }, [initial.budgetLines]);

  const groupedLines = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { line: EditableLine; index: number }[]>();

    for (const [index, line] of lines.entries()) {
      const group = line.groupName.trim() || "Other";
      if (!map.has(group)) {
        map.set(group, []);
        order.push(group);
      }
      map.get(group)?.push({ line, index });
    }

    return order.map((groupName) => ({
      groupName,
      items: map.get(groupName) ?? [],
    }));
  }, [lines]);

  const plannedIncome = incomes.reduce((s, i) => s + i.plannedAmount, 0);
  const plannedExpenses = lines.reduce((s, l) => s + l.plannedAmount, 0);
  const left = Math.round((plannedIncome - plannedExpenses + Number.EPSILON) * 100) / 100;

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/months/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incomeLines: incomes, budgetLines: lines }),
    });
    setSaving(false);
    if (!res.ok) {
      setMessage("Save failed.");
      return;
    }
    setMessage("Budget saved.");
    router.refresh();
  }

  async function copyPrevious() {
    setSaving(true);
    const res = await fetch(`/api/months/${initial.id}?action=copy-previous`, { method: "POST" });
    setSaving(false);
    if (!res.ok) return;
    const data = (await res.json()) as { summary: MonthSummary };
    setIncomes(
      data.summary.incomeLines.map((i) => ({
        name: i.name,
        plannedAmount: i.plannedAmount,
        payDay: i.payDay,
      })),
    );
    setLines(
      data.summary.budgetLines.map((l) => ({
        groupName: l.groupName,
        name: l.name,
        plannedAmount: l.plannedAmount,
        dueDay: l.dueDay,
        isSinkingFund: l.isSinkingFund,
      })),
    );
    setMessage("Copied from previous month.");
    router.refresh();
  }

  function addLine(groupName = "Personal") {
    setLines([
      ...lines,
      { groupName, name: "New item", plannedAmount: 0, dueDay: null, isSinkingFund: false },
    ]);
  }

  function toggleGroup(groupName: string) {
    setCollapsed((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="ed-btn-primary">
          {saving ? "Saving…" : "Save budget"}
        </button>
        <button type="button" onClick={copyPrevious} disabled={saving} className="ed-btn-secondary">
          Copy previous month
        </button>
        {message && <span className="text-sm text-plan-muted">{message}</span>}
        <span
          className={`num ml-auto text-sm font-semibold ${left === 0 ? "text-plan-green" : left > 0 ? "text-plan-warn" : "text-plan-nogo"}`}
        >
          {left === 0 ? "Balanced" : `${formatMoney(left)} to budget`}
        </span>
      </div>

      {/* Income group — EveryDollar style */}
      <section className="panel overflow-hidden">
        <button
          type="button"
          onClick={() => toggleGroup("__income__")}
          className="flex w-full items-center justify-between ed-group-header text-left"
        >
          <span>Income</span>
          <span className="num text-plan-green">{formatMoney(plannedIncome)}</span>
        </button>
        {!collapsed["__income__"] && (
          <>
            <div className="ed-col-header grid grid-cols-[1fr_5.5rem] gap-2">
              <span>Item</span>
              <span className="text-right">Planned</span>
            </div>
            {incomes.map((inc, idx) => (
              <div key={idx} className="ed-budget-row-income">
                <input
                  className="field-input border-0 bg-transparent px-0 py-0 shadow-none focus:ring-0"
                  value={inc.name}
                  onChange={(e) => {
                    const next = [...incomes];
                    next[idx] = { ...inc, name: e.target.value };
                    setIncomes(next);
                  }}
                />
                <input
                  type="number"
                  step="0.01"
                  className="field-input num text-right"
                  value={inc.plannedAmount || ""}
                  placeholder="0.00"
                  onChange={(e) => {
                    const next = [...incomes];
                    next[idx] = { ...inc, plannedAmount: Number(e.target.value) || 0 };
                    setIncomes(next);
                  }}
                />
              </div>
            ))}
          </>
        )}
      </section>

      {/* Expense groups */}
      {groupedLines.map(({ groupName, items }) => {
        const groupPlanned = items.reduce((s, { line }) => s + line.plannedAmount, 0);
        const groupSpent = items.reduce((s, { index }) => s + (spentByIndex[index] ?? 0), 0);
        const groupRemaining = Math.round((groupPlanned - groupSpent + Number.EPSILON) * 100) / 100;

        return (
          <section key={groupName} className="panel overflow-hidden">
            <button
              type="button"
              onClick={() => toggleGroup(groupName)}
              className="flex w-full items-center justify-between ed-group-header text-left"
            >
              <span className="flex items-center gap-2">
                <Chevron open={!collapsed[groupName]} />
                {groupName}
              </span>
              <span className="num text-sm text-plan-muted">
                {formatMoney(groupSpent)} / {formatMoney(groupPlanned)}
                <span className="ml-2 text-plan-text-secondary">({formatMoney(groupRemaining)} left)</span>
              </span>
            </button>

            {!collapsed[groupName] && (
              <div className="overflow-x-auto">
                <div className="ed-col-header ed-budget-row">
                  <span>Item</span>
                  <span className="text-right">Planned</span>
                  <span className="text-right">Spent</span>
                  <span className="text-right">Remaining</span>
                </div>

                {items.map(({ line, index }) => {
                  const spent = spentByIndex[index] ?? 0;
                  const remaining = Math.round((line.plannedAmount - spent + Number.EPSILON) * 100) / 100;

                  return (
                    <div key={index} className="border-b border-plan-border/50 px-4 py-3 last:border-b-0">
                      <div className="ed-budget-row !border-0 !px-0 !py-0">
                        <div>
                          <input
                            className="field-input border-0 bg-transparent px-0 py-0 font-medium shadow-none focus:ring-0"
                            value={line.name}
                            onChange={(e) => {
                              const next = [...lines];
                              next[index] = { ...line, name: e.target.value };
                              setLines(next);
                            }}
                          />
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-plan-muted">
                            <input
                              className="w-24 border-0 bg-transparent p-0 text-xs text-plan-muted outline-none focus:text-plan-text"
                              value={line.groupName}
                              onChange={(e) => {
                                const next = [...lines];
                                next[index] = { ...line, groupName: e.target.value };
                                setLines(next);
                              }}
                            />
                            {line.isSinkingFund && <span className="rounded bg-plan-green-light px-1.5 py-0.5 text-plan-green">Fund</span>}
                          </div>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          className="field-input num text-right"
                          value={line.plannedAmount || ""}
                          placeholder="0.00"
                          onChange={(e) => {
                            const next = [...lines];
                            next[index] = { ...line, plannedAmount: Number(e.target.value) || 0 };
                            setLines(next);
                          }}
                        />
                        <span className="num text-right text-sm text-plan-text-secondary">{formatMoney(spent)}</span>
                        <div className="text-right">
                          <RemainingBadge remaining={remaining} />
                        </div>
                      </div>
                      <ProgressBar planned={line.plannedAmount} spent={spent} />
                    </div>
                  );
                })}

                <div className="border-t border-plan-border bg-plan-panel2 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => addLine(groupName)}
                    className="text-sm font-medium text-plan-green hover:text-plan-green-dark"
                  >
                    + Add item to {groupName}
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <span className="self-center text-sm text-plan-muted">Add group:</span>
        {DEFAULT_GROUPS.filter((g) => !groupedLines.some((gl) => gl.groupName === g)).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => addLine(g)}
            className="rounded-full border border-plan-border bg-plan-panel px-3 py-1 text-xs font-medium text-plan-text-secondary hover:border-plan-green hover:text-plan-green"
          >
            + {g}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-plan-muted transition-transform ${open ? "rotate-90" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}
