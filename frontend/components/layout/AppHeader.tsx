"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export function AppHeader({
  right,
  mock,
}: {
  right?: React.ReactNode;
  mock?: boolean;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm font-medium tracking-tight">
          Mellonaires
        </Link>
        <span className="hidden text-xs text-muted sm:inline">Presentation analysis</span>
        {mock ? <Badge tone="mock">Mock analyzer</Badge> : null}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">{right}</div>
    </header>
  );
}
