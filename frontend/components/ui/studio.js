// Building blocks of the blue studio design (see /streaming).

import { AppHeader } from "@/components/layout/AppHeader";
import { cn } from "@/lib/utils";

export function PageShell({ title, subtitle, right, mock, runId, className, children }) {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <AppHeader title={title} subtitle={subtitle} right={right} mock={mock} runId={runId} />
      <main className={cn("mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6", className)}>
        {children}
      </main>
    </div>
  );
}

export function Card({ title, action, children, className }) {
  return (
    <section className={cn("rounded-2xl bg-[#f5f5f7] p-5", className)}>
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatTile({ label, value, unit }) {
  return (
    <div className="rounded-xl bg-white px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
        {unit ? <span className="ml-1 text-xs font-medium text-slate-400">{unit}</span> : null}
      </p>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed",
        checked ? "bg-primary" : "bg-slate-200",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="flex rounded-full bg-slate-200/60 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === option.value
              ? "bg-white text-primary shadow-sm"
              : "text-slate-500 hover:text-slate-900",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Dark rounded video area. `ref` is passed through (React 19 ref-as-prop).
export function Stage({ ref, className, children }) {
  return (
    <section
      ref={ref}
      className={cn(
        "relative aspect-video overflow-hidden rounded-3xl bg-slate-950 shadow-lg shadow-slate-900/10",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function GlassPill({ className, children }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold tracking-wide text-white backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Floating control bar pinned to the bottom of a Stage.
export function ControlBar({ children }) {
  return (
    <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center px-3 sm:bottom-5">
      <div className="flex items-center gap-1.5 rounded-full bg-black/45 p-1 backdrop-blur-md sm:p-1.5">
        {children}
      </div>
    </div>
  );
}

const CONTROL_TONES = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  ghost: "text-white/80 hover:bg-white/10",
  danger: "bg-rose-500 text-white hover:bg-rose-600",
};

export function ControlButton({ tone = "ghost", className, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 sm:px-4 sm:py-2 sm:text-sm",
        CONTROL_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export function GlassSelect({ className, children, ...props }) {
  return (
    <select
      className={cn(
        "rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white outline-none transition-colors hover:bg-white/15 sm:py-2 sm:text-sm [&>option]:text-slate-900",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

// Centered message over a Stage (empty, loading, and error states).
export function StageMessage({ icon, title, description, children }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-[radial-gradient(ellipse_at_center,#132f6b_0%,#020617_75%)] px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        {icon ? (
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/15 text-[#8fb4ff] ring-1 ring-primary/40">
            {icon}
          </div>
        ) : null}
        <div>
          <p className="text-lg font-semibold text-white">{title}</p>
          {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorNote({ children, className }) {
  return (
    <p
      className={cn(
        "rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/30",
        className,
      )}
    >
      {children}
    </p>
  );
}
