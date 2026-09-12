import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning" | "critical" | "strong" | "mock";
  className?: string;
}) {
  const tones = {
    neutral: "border-border text-muted",
    warning: "border-warning/30 text-warning",
    critical: "border-critical/30 text-critical",
    strong: "border-strong/30 text-strong",
    mock: "border-border text-muted",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
