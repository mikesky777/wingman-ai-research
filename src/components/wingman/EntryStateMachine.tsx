import { ChevronDown } from "lucide-react";
import { EntryStateBadge } from "./EntryStateBadge";
import { cn } from "@/lib/utils";
import { ENTRY_STATES, ENTRY_STATE_ALTERNATIVES, ENTRY_STATE_FLOW } from "@/lib/wingman/config";
import type { EntryState } from "@/lib/wingman/types";

export function EntryStateMachine({ current }: { current?: EntryState }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <div className="flex flex-col items-center gap-1.5">
        {ENTRY_STATE_FLOW.map((state, i) => (
          <div key={state} className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "rounded-md p-1 transition-all",
                current === state && "ring-2 ring-primary/60 ring-offset-2 ring-offset-card",
              )}
            >
              <EntryStateBadge state={state} size="lg" />
            </div>
            {i < ENTRY_STATE_FLOW.length - 1 ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : null}
          </div>
        ))}
        <div className="mt-4 w-full border-t border-dashed border-border pt-4">
          <p className="label-xs mb-2 text-center">Alternative states</p>
          <div className="flex justify-center gap-2">
            {ENTRY_STATE_ALTERNATIVES.map((state) => (
              <div
                key={state}
                className={cn(
                  "rounded-md p-1",
                  current === state && "ring-2 ring-primary/60 ring-offset-2 ring-offset-card",
                )}
              >
                <EntryStateBadge state={state} size="lg" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(ENTRY_STATES) as EntryState[]).map((state) => {
          const meta = ENTRY_STATES[state];
          return (
            <div
              key={state}
              className={cn(
                "rounded-md border border-border bg-surface/60 px-4 py-3",
                current === state && "border-primary/50",
              )}
            >
              <EntryStateBadge state={state} />
              <p className="mt-2 text-xs text-muted-foreground">{meta.tooltip}</p>
              <ul className="mt-2 space-y-1">
                {meta.examples.map((ex) => (
                  <li key={ex} className="flex gap-2 text-[11px] text-muted-foreground">
                    <span className="text-border-strong">—</span>
                    <span>{ex}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
