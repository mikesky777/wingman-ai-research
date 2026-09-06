/**
 * Honest provider status. No static/decorative connectivity states: every row
 * is derived from server-side configuration plus persisted operational
 * evidence. Never displays key material.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Section } from "@/components/wingman/Section";
import { Badge } from "@/components/ui/badge";
import { loadProviderHealthFn } from "@/lib/wingman/settings.functions";

const TONE: Record<string, string> = {
  ACTIVE: "border-positive/45 bg-positive/12 text-positive",
  DEGRADED: "border-warning/45 bg-warning/12 text-warning",
  UNAVAILABLE: "border-destructive/45 bg-destructive/12 text-destructive",
  NOT_CONFIGURED: "border-border bg-surface text-muted-foreground",
  UNKNOWN: "border-border bg-surface text-muted-foreground",
};

export function ProviderHealthCard() {
  const load = useServerFn(loadProviderHealthFn);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["settings", "provider-health"],
    queryFn: () => load(),
    staleTime: 60_000,
  });

  return (
    <Section
      title="Providers & Data Health"
      description="Derived from server configuration and persisted operational activity — not a decorative status list."
    >
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Reading provider health…</p>
      ) : isError || !data ? (
        <p className="text-xs text-muted-foreground">Provider health unavailable right now.</p>
      ) : (
        <ul className="space-y-2">
          {data.providers.map((p) => (
            <li
              key={p.provider}
              className="rounded-md border border-border bg-surface/60 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium">{p.provider}</span>
                <Badge variant="outline" className={`font-mono text-[10px] ${TONE[p.status]}`}>
                  {p.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{p.purpose}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{p.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
