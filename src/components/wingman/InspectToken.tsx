import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Radio, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ingestTokenByAddress } from "@/lib/wingman/ingest.functions";
import type { IngestTokenResult } from "@/lib/wingman/ingest-types";
import { snapshotToEvidence, resolveEvidence } from "@/lib/wingman/services/evidence";
import { formatUsd, formatNumber, shortenAddress, formatTime, tokenAge } from "@/lib/wingman/format";
import { cn } from "@/lib/utils";

/**
 * Inspect Token — live-data verification surface.
 *
 * Verifies the DexScreener ingestion pipeline only: fetch → normalize →
 * persist → display. No thesis score, entry score, report or opportunity is
 * produced here. Values the provider does not supply are labelled
 * "unavailable" — never rendered as zero.
 */

const UNAVAILABLE = "unavailable";

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: "positive" | "negative";
}) {
  const missing = value === null;
  return (
    <div className="rounded-md border border-border bg-surface/60 p-3">
      <p className="label-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular mt-1 text-sm",
          missing && "text-muted-foreground/60 italic",
          !missing && tone === "positive" && "text-positive",
          !missing && tone === "negative" && "text-destructive",
        )}
      >
        {missing ? UNAVAILABLE : value}
      </p>
    </div>
  );
}

const usd = (v: number | null) => (v === null ? null : formatUsd(v));
const pct = (v: number | null) => (v === null ? null : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
const count = (v: number | null) => (v === null ? null : formatNumber(v));

export function InspectToken() {
  const [address, setAddress] = useState("");
  const ingest = useServerFn(ingestTokenByAddress);
  const mutation = useMutation<IngestTokenResult, Error, string>({
    mutationFn: (contractAddress) => ingest({ data: { contractAddress } }),
  });

  const result = mutation.data;
  const evidence = result?.ok ? snapshotToEvidence(result.snapshot, result.pair) : [];
  const resolvedByKey = new Map(
    resolveEvidence(evidence, { now: result?.ok ? result.snapshot.capturedAt : undefined }).map(
      (r) => [r.key, r] as const,
    ),
  );




  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (address.trim()) mutation.mutate(address.trim());
        }}
      >
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Paste a Solana contract address"
          spellCheck={false}
          className="font-mono text-xs"
          aria-label="Solana contract address"
        />
        <Button type="submit" disabled={mutation.isPending || !address.trim()} className="gap-2">
          <Search className="size-4" />
          {mutation.isPending ? "Fetching…" : "Fetch Live Data"}
        </Button>
      </form>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Reads live market data from DexScreener, normalizes it and stores an immutable snapshot. No
        thesis score, entry score or research report is generated here.
      </p>

      {mutation.isError && (
        <p className="text-xs text-destructive">Ingestion failed. Try again shortly.</p>
      )}

      {result && !result.ok && <p className="text-xs text-destructive">{result.message}</p>}

      {result?.ok && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface/60 p-4">
            {result.token.imageUrl ? (
              <img
                src={result.token.imageUrl}
                alt={`${result.token.name} logo`}
                className="size-10 rounded-full border border-border object-cover"
                loading="lazy"
              />
            ) : (
              <div className="grid size-10 place-items-center rounded-full border border-border text-[10px] text-muted-foreground">
                n/a
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {result.token.name}{" "}
                <span className="text-muted-foreground">· {result.token.symbol}</span>
              </p>
              <p className="tabular text-[11px] text-muted-foreground">
                {shortenAddress(result.token.contractAddress, 6, 6)}
              </p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-positive/40 bg-positive/10 px-2.5 py-1 text-[10px] font-medium tracking-wide text-positive uppercase">
              <Radio className="size-3" />
              Live — DexScreener
            </span>
            <span className="text-[11px] text-muted-foreground">
              captured {formatTime(result.snapshot.capturedAt)}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Price" value={result.snapshot.priceUsd === null ? null : `$${result.snapshot.priceUsd}`} />
            <Field label="Market cap" value={usd(result.snapshot.marketCap)} />
            <Field label="FDV" value={usd(result.snapshot.fdv)} />
            <Field label="Liquidity" value={usd(result.snapshot.liquidityUsd)} />

            <Field label="Volume 5m" value={usd(result.snapshot.volume5m)} />
            <Field label="Volume 1h" value={usd(result.snapshot.volume1h)} />
            <Field label="Volume 6h" value={usd(result.snapshot.volume6h)} />
            <Field label="Volume 24h" value={usd(result.snapshot.volume24h)} />

            <Field
              label="Price change 5m"
              value={pct(result.snapshot.priceChange5m)}
              tone={(result.snapshot.priceChange5m ?? 0) < 0 ? "negative" : "positive"}
            />
            <Field
              label="Price change 1h"
              value={pct(result.snapshot.priceChange1h)}
              tone={(result.snapshot.priceChange1h ?? 0) < 0 ? "negative" : "positive"}
            />
            <Field
              label="Price change 6h"
              value={pct(result.snapshot.priceChange6h)}
              tone={(result.snapshot.priceChange6h ?? 0) < 0 ? "negative" : "positive"}
            />
            <Field
              label="Price change 24h"
              value={pct(result.snapshot.priceChange24h)}
              tone={(result.snapshot.priceChange24h ?? 0) < 0 ? "negative" : "positive"}
            />

            <Field label="Buys 5m" value={count(result.snapshot.buys5m)} />
            <Field label="Sells 5m" value={count(result.snapshot.sells5m)} />
            <Field label="Buys 1h" value={count(result.snapshot.buys1h)} />
            <Field label="Sells 1h" value={count(result.snapshot.sells1h)} />

            <Field label="Selected DEX" value={result.pair.dexId} />
            <Field
              label="Selected pair"
              value={result.pair.pairAddress ? shortenAddress(result.pair.pairAddress, 6, 6) : null}
            />
            <Field label="Quote token" value={result.pair.quoteTokenSymbol} />
            <Field
              label="Pair age"
              value={result.pair.pairCreatedAt ? tokenAge(result.pair.pairCreatedAt) : null}
            />

            <Field label="Active boosts" value={count(result.snapshot.promotion.activeBoostCount)} />
            <Field label="Holder count" value={null} />
            <Field label="Unique buyers 1h" value={null} />
            <Field label="Top-10 holders" value={null} />
          </div>

          <details className="rounded-md border border-border bg-surface/60 p-3">
            <summary className="label-xs cursor-pointer text-muted-foreground select-none">
              Normalized Evidence ({evidence.length} observations)
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Key</th>
                    <th className="py-1 pr-3 font-medium">Value</th>
                    <th className="py-1 pr-3 font-medium">Unit</th>
                    <th className="py-1 pr-3 font-medium">Status</th>
                    <th className="py-1 font-medium">Resolution</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {evidence.map((o) => (
                    <tr key={o.key} className="border-t border-border/60">
                      <td className="py-1 pr-3 font-mono">{o.key}</td>
                      <td
                        className={cn(
                          "py-1 pr-3",
                          o.value === null && "text-muted-foreground/60 italic",
                        )}
                      >
                        {o.value === null ? UNAVAILABLE : String(o.value)}
                      </td>
                      <td className="py-1 pr-3 text-muted-foreground">{o.unit ?? "—"}</td>
                      <td className="py-1 pr-3 text-muted-foreground">{o.status}</td>
                      <td className="py-1">
                        <span className="label-xs rounded border border-border px-1.5 py-0.5 text-muted-foreground">
                          {(resolvedByKey.get(o.key)?.resolutionStatus ?? "unavailable")
                            .replace("_", " ")
                            .toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}

                </tbody>
              </table>
            </div>
          </details>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Primary pair chosen by highest USD liquidity ({result.pair.selectionVersion});{" "}
            {result.pair.eligiblePairCount} eligible Solana pool
            {result.pair.eligiblePairCount === 1 ? "" : "s"}, {result.pair.rejectedPairCount}{" "}
            rejected. Holder and unique-wallet metrics are not provided by DexScreener and are
            stored as unavailable, not zero. Paid boosts are descriptive metadata only and are never
            treated as positive evidence.
          </p>

        </div>
      )}
    </div>
  );
}
