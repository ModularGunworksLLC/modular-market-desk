"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/budget", label: "Budget" },
  { href: "/transactions", label: "Transactions" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-plan-border bg-plan-panel shadow-header">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 md:gap-8 md:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-plan-green text-lg font-bold text-white">
            $
          </span>
          <span className="text-lg font-bold tracking-tight text-plan-text">DollarPlan</span>
        </Link>

        <nav className="flex flex-1 items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`ed-nav-link ${active ? "ed-nav-link-active" : ""}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden text-xs text-plan-muted sm:block">Zero-based budgeting</div>
      </div>
    </header>
  );
}
