import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ENTRY_STATES } from "@/lib/wingman/config";
import type { EntryState } from "@/lib/wingman/types";

const TONE: Record<string, string> = {
  positive: "border-positive/40 bg-positive/12 text-positive",
  acceptable: "border-primary/40 bg-primary/12 text-primary",
  neutral: "border-border-strong bg-secondary text-muted-foreground",
  warning: "border-warning/45 bg-warning/12 text-warning",
  danger: "border-destructive/50 bg-destructive/12 text-destructive",
};

export function EntryStateBadge({
  state,
  className,
  size = "sm",
}: {
  state: EntryState;
  className?: string;
  size?: "sm" | "lg";
}) {
  const meta = ENTRY_STATES[state];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center rounded-md border font-mono font-medium tracking-wide whitespace-nowrap",
            size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-[11px]",
            TONE[meta.tone],
            className,
          )}
        >
          {meta.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{meta.tooltip}</TooltipContent>
    </Tooltip>
  );
}
