"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioLines } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/layout/UserMenu";

const NAV = [
  { href: "/live", label: "Live" },
  { href: "/evaluation", label: "Evaluation", keepsRun: true },
  { href: "/practice", label: "Practice", keepsRun: true },
  { href: "/leaderboard", label: "History" },
];

// Floating glass navigation bar shared by every page.
export function AppHeader({ title, subtitle, right, mock, runId }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const query = runId ? `?run=${runId}` : "";

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white/75 px-3 py-2 shadow-[0_10px_40px_-18px_rgba(15,23,42,0.35)] ring-1 ring-white/80 backdrop-blur-xl sm:px-4">
        <Link href="/" aria-label="Home" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#172554] to-primary text-white">
            <AudioLines className="size-[18px]" />
          </span>
          <span className="hidden text-[15px] font-bold tracking-tight text-slate-900 sm:block">
            Mellonaires
          </span>
        </Link>

        {!isHome && title ? (
          <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
            <span className="h-6 w-px shrink-0 bg-slate-900/10" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-slate-900">{title}</p>
              {subtitle ? (
                <p className="hidden truncate text-[11px] leading-tight text-slate-500 lg:block">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {mock ? <Badge tone="mock">Mock analyzer</Badge> : null}

        <nav
          aria-label="Studio pages"
          className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto px-1 md:order-none md:mx-0 md:ml-auto md:w-auto md:px-0"
        >
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.keepsRun ? `${item.href}${query}` : item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all",
                  active
                    ? "bg-primary text-white"
                    : "text-slate-500 hover:bg-slate-900/5 hover:text-slate-900",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 md:ml-0">
          {right}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
