"use client";

import { Card, Switch } from "@/components/ui/studio";
import { MESH_MODES } from "@/lib/mesh/connections";
import { cn } from "@/lib/utils";

export function OverlayCard({ enabled, onEnabledChange, mode, onModeChange }) {
  return (
    <Card
      title="Face mesh"
      action={<Switch checked={enabled} onChange={onEnabledChange} label="Show face mesh" />}
    >
      <ul className={cn("flex flex-col gap-1 transition-opacity", !enabled && "opacity-40")}>
        {MESH_MODES.map((option) => {
          const selected = option.id === mode;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => onModeChange(option.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed",
                  selected ? "bg-primary/5 font-medium text-primary" : "hover:bg-white",
                )}
              >
                <span
                  className={cn(
                    "grid size-4 place-items-center rounded-full ring-2",
                    selected ? "ring-primary" : "ring-slate-300",
                  )}
                >
                  {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
                </span>
                {option.label}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-400">
        Eyes and mouth light up amber or red when a delivery alert is active.
      </p>
    </Card>
  );
}
