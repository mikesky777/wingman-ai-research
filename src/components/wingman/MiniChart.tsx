import { cn } from "@/lib/utils";

export function MiniChart({
  series,
  className,
  label,
}: {
  series: { t: number; v: number }[];
  className?: string;
  label?: string;
}) {
  const values = series.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 34;
  const points = series.map((p, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - ((p.v - min) / range) * h;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const path = `M${points.join(" L")}`;
  const area = `${path} L${w},${h} L0,${h} Z`;

  return (
    <div className={cn("relative overflow-hidden rounded-md border border-border", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label={label ?? "Simulated price structure"}
      >
        <defs>
          <linearGradient id="wm-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#wm-area)" />
        <path
          d={path}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="0.7"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {label ? (
        <span className="absolute top-2 left-3 font-mono text-[10px] tracking-wide text-muted-foreground">
          {label}
        </span>
      ) : null}
    </div>
  );
}
