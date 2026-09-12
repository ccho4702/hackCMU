"use client";

import type { DeliveryAlert } from "@/lib/types/analysis";
import { cn } from "@/lib/utils";

export function AlertNoticeStack({
  notices,
}: {
  notices: Array<Pick<DeliveryAlert, "id" | "message" | "severity"> & { leaving?: boolean }>;
}) {
  if (notices.length === 0) return null;
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex w-[min(280px,calc(100%-24px))] flex-col gap-1.5">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={cn(
            "alert-notice rounded-md border bg-card/92 px-3 py-2 shadow-sm backdrop-blur-sm",
            notice.severity === "critical" ? "border-critical/25" : "border-warning/25",
            notice.leaving && "is-leaving",
          )}
        >
          <div
            className={cn(
              "text-[10px] uppercase tracking-[0.12em]",
              notice.severity === "critical" ? "text-critical" : "text-warning",
            )}
          >
            {notice.severity}
          </div>
          <div className="mt-0.5 text-[12px] leading-snug text-foreground">{notice.message}</div>
        </div>
      ))}
    </div>
  );
}
