"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  defaultDealerDefaults,
  loadDealerDefaults,
  saveDealerDefaults,
  type DeskDealerDefaults,
} from "@/lib/desk-defaults";

const NAV = [
  { href: "/", label: "Evaluate" },
  { href: "/batch", label: "Batch" },
  { href: "/deals", label: "Wholesale" },
  { href: "/import", label: "Import" },
] as const;

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-desk-accent/20 text-desk-text"
          : "text-desk-muted hover:bg-desk-panel2 hover:text-desk-text"
      }`}
    >
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState<DeskDealerDefaults>(defaultDealerDefaults);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDefaults(loadDealerDefaults());
  }, []);

  function persist(next: DeskDealerDefaults) {
    setDefaults(next);
    saveDealerDefaults(next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
    window.dispatchEvent(new CustomEvent("desk-defaults-changed", { detail: next }));
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-desk-border bg-desk-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold tracking-tight text-desk-text">
              Gun Value Desk
            </Link>
            <nav className="flex flex-wrap items-center gap-1">
              {NAV.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)}
                />
              ))}
            </nav>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-desk-border bg-desk-panel2 px-3 py-1.5 text-xs font-medium text-desk-text hover:border-desk-accent"
          >
            Settings
          </button>
        </div>
      </header>

      {children}

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close settings"
            onClick={() => setOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-desk-border bg-desk-panel shadow-xl">
            <div className="flex items-center justify-between border-b border-desk-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-desk-text">Dealer defaults</h2>
                <p className="text-[11px] text-desk-muted">Applied to new Evaluate sessions.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-desk-muted hover:text-desk-text"
              >
                Close
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <label className="field-label">Default sell channel</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => persist({ ...defaults, sellChannel: "local" })}
                    className={`rounded-md border px-3 py-2 text-xs ${
                      defaults.sellChannel === "local"
                        ? "border-desk-accent bg-desk-accent/15 text-desk-text"
                        : "border-desk-border text-desk-muted"
                    }`}
                  >
                    Local
                  </button>
                  <button
                    type="button"
                    onClick={() => persist({ ...defaults, sellChannel: "gunbroker" })}
                    className={`rounded-md border px-3 py-2 text-xs ${
                      defaults.sellChannel === "gunbroker"
                        ? "border-desk-accent bg-desk-accent/15 text-desk-text"
                        : "border-desk-border text-desk-muted"
                    }`}
                  >
                    GunBroker
                  </button>
                </div>
              </div>

              <div>
                <label className="field-label">Min profit ($)</label>
                <input
                  className="field-input"
                  value={defaults.targetProfit}
                  onChange={(e) => setDefaults((d) => ({ ...d, targetProfit: e.target.value }))}
                  onBlur={() => persist(defaults)}
                />
              </div>

              <div>
                <label className="field-label">Local sales tax %</label>
                <input
                  className="field-input"
                  value={defaults.salesTaxPct}
                  onChange={(e) => setDefaults((d) => ({ ...d, salesTaxPct: e.target.value }))}
                  onBlur={() => persist(defaults)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">GB outbound ship ($)</label>
                  <input
                    className="field-input"
                    value={defaults.outboundShip}
                    onChange={(e) => setDefaults((d) => ({ ...d, outboundShip: e.target.value }))}
                    onBlur={() => persist(defaults)}
                  />
                </div>
                <div>
                  <label className="field-label">GB listing fees ($)</label>
                  <input
                    className="field-input"
                    value={defaults.listingUpgrades}
                    onChange={(e) => setDefaults((d) => ({ ...d, listingUpgrades: e.target.value }))}
                    onBlur={() => persist(defaults)}
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Default buyer&apos;s premium %</label>
                <input
                  className="field-input"
                  value={defaults.buyerPremiumPct}
                  onChange={(e) => setDefaults((d) => ({ ...d, buyerPremiumPct: e.target.value }))}
                  onBlur={() => persist(defaults)}
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-desk-text">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={defaults.buyerPaysOutboundShip}
                  onChange={(e) => persist({ ...defaults, buyerPaysOutboundShip: e.target.checked })}
                />
                <span>Buyer pays outbound shipping (default)</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-desk-text">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={defaults.buyerPaysCardFee}
                  onChange={(e) => persist({ ...defaults, buyerPaysCardFee: e.target.checked })}
                />
                <span>Buyer pays card / CC fees (default)</span>
              </label>

              {savedFlash && <p className="text-xs text-desk-go">Saved.</p>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
