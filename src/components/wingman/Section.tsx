import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function KeyValue({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode; tone?: "default" | "positive" | "warning" | "danger" }[];
  columns?: 2 | 3 | 4;
}) {
  const cols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[columns];
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3", cols)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2"
        >
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd
            className={cn(
              "tabular text-sm font-medium",
              item.tone === "positive" && "text-positive",
              item.tone === "warning" && "text-warning",
              item.tone === "danger" && "text-destructive",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
