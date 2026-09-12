"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, AudioLines } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/layout/UserMenu";

const NAV = [
  { href: "/live", label: "Live" },
  { href: "/evaluation", label: "Evaluation", keepsRun: true },
  { href: "/practice", label: "Practice", keepsRun: true },
  { href: "/leaderboard", label: "History" },
];

// Sticky header shared by every page (same look as the /streaming live session).
export function AppHeader({ title, subtitle, right, mock, runId }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const query = runId ? `?run=${runId}` : "";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {isHome ? (
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-white shadow-md shadow-primary/30">
              <AudioLines className="size-[18px]" />
            </span>
          ) : (
            <Link
              href="/"
              aria-label="Back to home"
              className="grid size-9 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="size-[18px]" />
            </Link>
          )}
          <div className="min-w-0">
            <p className="text-base font-semibold leading-tight text-slate-900">
              {title ?? "Mellonaires"}
            </p>
            <p className="truncate text-xs text-slate-500">{subtitle ?? "Presentation analysis"}</p>
          </div>
          {mock ? <Badge tone="mock">Mock analyzer</Badge> : null}
        </div>

        <nav
          aria-label="Studio pages"
          className="flex items-center gap-4 text-xs font-medium text-slate-500"
        >
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.keepsRun ? `${item.href}${query}` : item.href}
                aria-current={active ? "page" : undefined}
                className={cn("transition-colors hover:text-slate-900", active && "text-primary")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          {right}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
