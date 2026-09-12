"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export function AppHeader({
  right,
  mock,
  runId,
}: {
  right?: React.ReactNode;
  mock?: boolean;
  runId?: string;
}) {
  const pathname = usePathname();
  const query = runId ? `?run=${runId}` : "";
  return (
    <header className="flex min-h-12 flex-wrap gap-2 py-2 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm font-medium tracking-tight">
          Mellonaires
        </Link>
        <span className="hidden text-xs text-muted sm:inline">Presentation analysis</span>
        {mock ? <Badge tone="mock">Mock analyzer</Badge> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted"><nav aria-label="Studio pages" className="flex items-center gap-3"><Link href="/live" aria-current={pathname === "/live" ? "page" : undefined}>Live</Link><Link href={`/evaluation${query}`} aria-current={pathname === "/evaluation" ? "page" : undefined}>Evaluation</Link><Link href={`/practice${query}`} aria-current={pathname === "/practice" ? "page" : undefined}>Practice</Link></nav>{right}</div>
    </header>
  );
}
