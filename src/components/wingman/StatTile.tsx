import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  detail,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "primary" | "positive" | "warning" | "danger";
  className?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    positive: "text-positive",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];

  return (
    <div className={cn("panel px-4 py-3.5", className)}>
      <p className="label-xs">{label}</p>
      <p className={cn("tabular mt-1.5 text-2xl leading-none font-semibold", toneClass)}>{value}</p>
      {detail ? <p className="mt-1.5 text-[11px] text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
