import { cn } from "@/lib/utils";
import {
  HISTORY_SETUP_FILTERS,
  type HistorySetupFilter,
} from "@/lib/wingman/services/history/setup-filter";

/**
 * Shared History SETUP filter (`history_setup_filter/v1`).
 *
 * Visually distinct from POPULATION selectors and SORT controls: it always
 * renders with its own `SETUP` label and outlined pill group.
 */
export function SetupFilterBar({
  value,
  onChange,
  className,
}: {
  value: HistorySetupFilter;
  onChange: (next: HistorySetupFilter) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 rounded border border-border-strong/70 bg-surface-2/40 px-2 py-1",
        className,
      )}
    >
      <span className="label-xs mr-1 text-muted-foreground">Setup</span>
      {HISTORY_SETUP_FILTERS.map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            "rounded border px-2.5 py-1 font-mono text-[10px] tracking-wide transition-colors",
            value === key
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border-strong text-muted-foreground hover:text-foreground",
          )}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
