import { cn } from "@/lib/utils";

export function Badge({ children, tone = "neutral", className }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-600",
    warning: "bg-amber-50 text-amber-700",
    critical: "bg-rose-50 text-rose-700",
    strong: "bg-emerald-50 text-emerald-700",
    mock: "bg-amber-50 text-amber-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
