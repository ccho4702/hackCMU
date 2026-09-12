"use client";

import { cn } from "@/lib/utils";

export function AlertNoticeStack({ notices }) {
  if (notices.length === 0) return null;
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20 flex w-[min(280px,calc(100%-32px))] flex-col gap-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={cn(
            "alert-notice rounded-2xl bg-black/55 px-3.5 py-2.5 text-white shadow-lg ring-1 backdrop-blur-md",
            notice.severity === "critical" ? "ring-rose-400/40" : "ring-amber-300/40",
            notice.leaving && "is-leaving",
          )}
        >
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
            <span
              className={cn(
                "size-1.5 rounded-full",
                notice.severity === "critical" ? "bg-rose-400" : "bg-amber-300",
              )}
            />
            <span className={notice.severity === "critical" ? "text-rose-300" : "text-amber-200"}>
              {notice.severity}
            </span>
          </div>
          <div className="mt-1 text-[13px] leading-snug text-white/95">{notice.message}</div>
        </div>
      ))}
    </div>
  );
}
