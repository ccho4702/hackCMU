"use client";

import { HelpCircle } from "lucide-react";
import { METRIC_HELP, METRIC_LABELS } from "@/lib/types/analysis";
import { cn } from "@/lib/utils";

export function MetricHint({ metric, side = "bottom" }) {
  const help = METRIC_HELP[metric];
  if (!help) return null;
  return (
    <span className="group/hint relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={`${METRIC_LABELS[metric]} score`}
        className="grid size-4 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:bg-slate-100 focus-visible:outline-none"
      >
        <HelpCircle className="size-3" strokeWidth={2} />
      </button>
      <span
        className={cn(
          "pointer-events-none absolute z-30 hidden w-56 rounded-xl bg-slate-900 px-3 py-2 text-left text-[11px] leading-snug font-normal text-white/90 shadow-lg group-hover/hint:block group-focus-within/hint:block",
          side === "right"
            ? "left-full top-1/2 ml-2 -translate-y-1/2"
            : side === "top"
              ? "left-0 bottom-[calc(100%+6px)]"
              : "left-0 top-[calc(100%+6px)]",
        )}
      >
        <span className="mb-0.5 block font-medium text-white">{METRIC_LABELS[metric]}</span>
        {help}
      </span>
    </span>
  );
}
