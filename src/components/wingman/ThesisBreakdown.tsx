import { THESIS_CATEGORIES } from "@/lib/wingman/config";
import type { ThesisScoreBreakdown } from "@/lib/wingman/types";

export function ThesisBreakdown({ breakdown }: { breakdown: ThesisScoreBreakdown }) {
  return (
    <ul className="space-y-2.5">
      {THESIS_CATEGORIES.map((cat) => {
        const value = breakdown[cat.key];
        const pct = (value / cat.weight) * 100;
        return (
          <li key={cat.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-muted-foreground">{cat.label}</span>
              <span className="tabular text-xs font-medium">
                {value}
                <span className="text-muted-foreground"> / {cat.weight}</span>
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary/80 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
