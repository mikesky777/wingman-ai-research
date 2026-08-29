import { cn } from "@/lib/utils";

type Variant = "thesis" | "evidence" | "entry";

function toneFor(variant: Variant, pct: number) {
  if (variant === "evidence") {
    if (pct >= 75) return "bg-positive";
    if (pct >= 55) return "bg-warning";
    return "bg-destructive";
  }
  if (pct >= 70) return "bg-primary";
  if (pct >= 45) return "bg-warning";
  return "bg-destructive";
}

export function ScoreMeter({
  label,
  value,
  max,
  variant = "thesis",
  hint,
  className,
  size = "md",
}: {
  label: string;
  value: number;
  max: number;
  variant?: Variant;
  hint?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-xs">{label}</span>
        <span
          className={cn(
            "tabular font-semibold",
            size === "md" ? "text-xl" : "text-sm",
            variant === "evidence" && pct < 55 ? "text-destructive" : "text-foreground",
          )}
        >
          {value}
          <span className="text-xs font-normal text-muted-foreground"> / {max}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full transition-all duration-700", toneFor(variant, pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint ? <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
