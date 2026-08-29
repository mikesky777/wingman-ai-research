import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Section } from "@/components/wingman/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/wingman/format";
import { evaluateContractAddress } from "@/lib/wingman/workbench.functions";
import { formatAge, formatNum, formatRatioPct, laneLabel } from "./shared";

/**
 * Manual contract-address comparison. Runs the SAME deterministic evaluation a
 * live scan runs — it never injects the token into any scan ranking.
 */
export function ManualCheck() {
  const [address, setAddress] = useState("");
  const evaluate = useServerFn(evaluateContractAddress);
  const check = useMutation({
    mutationFn: (contractAddress: string) => evaluate({ data: { contractAddress } }),
  });
  const result = check.data;
  const candidate = result?.candidate;

  return (
    <Section
      title="Manual Contract Check"
      description="Paste a token Wingman missed and see exactly how the current rules judge it."
    >
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim()) check.mutate(address.trim());
        }}
      >
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Solana contract address"
          className="max-w-md flex-1 font-mono text-xs"
        />
        <Button type="submit" size="sm" disabled={check.isPending}>
          {check.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Evaluate"}
        </Button>
      </form>

      {result && !result.ok ? (
        <p className="mt-3 text-xs text-warning">
          {result.message ?? "Evaluation unavailable for this address."}
        </p>
      ) : null}

      {candidate ? (
        <div className="mt-4 space-y-2 rounded-md border border-border bg-surface/60 p-3 text-xs">
          <p className="text-sm font-medium">
            {result?.name ?? "Unknown token"}{" "}
            <span className="text-muted-foreground">{result?.symbol ?? ""}</span>
          </p>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <span>
              Market cap:{" "}
              <span className="tabular">
                {candidate.token.marketCap === null ? "—" : formatUsd(candidate.token.marketCap)}
              </span>{" "}
              ({result?.bucket})
            </span>
            <span>
              Age: <span className="tabular">{formatAge(candidate.metrics.age.minutes)}</span> (
              {candidate.metrics.age.basis})
            </span>
            <span>
              Turnover 24h:{" "}
              <span className="tabular">
                {formatRatioPct(candidate.metrics.volumeToMarketCap24h)}
              </span>
            </span>
            <span>
              Activity: <span className="font-mono">{candidate.signals.activityState}</span>
            </span>
            <span>
              Persistence: <span className="font-mono">{candidate.signals.persistenceSignal}</span>
            </span>
            <span>
              Extension: <span className="font-mono">{candidate.signals.extensionRisk}</span>
            </span>
          </div>

          <p>
            Hard filters:{" "}
            {candidate.passedHardFilters ? (
              <span className="text-positive">passed</span>
            ) : (
              <span className="text-destructive">
                rejected — {candidate.rejection?.reason} ({candidate.rejection?.detail})
              </span>
            )}
          </p>
          <p>
            Lanes:{" "}
            {candidate.lanes.length === 0
              ? "none qualified"
              : candidate.lanes.map(laneLabel).join(", ")}
          </p>
          {Object.entries(candidate.laneRejections).length > 0 ? (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {Object.entries(candidate.laneRejections).map(([lane, reason]) => (
                <li key={lane}>
                  {laneLabel(lane)} — {reason}
                </li>
              ))}
            </ul>
          ) : null}
          <p>
            Quantitative priority:{" "}
            <span className="tabular font-semibold">
              {candidate.quantitativePriority === null
                ? "not ranked"
                : formatNum(candidate.quantitativePriority, 1)}
            </span>
          </p>
          {candidate.extensionReasons.length > 0 ? (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {candidate.extensionReasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}
