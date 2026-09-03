/**
 * Editable setup filters (calibration state only).
 *
 * These thresholds describe observable market behaviour. They are NOT thesis
 * scores, safety ratings or buy signals. Past scans keep their own immutable
 * configuration snapshot and are never re-classified by an edit here.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getStrategySettings,
  resetStrategySettings,
  saveStrategySettings,
} from "@/lib/wingman/strategy.functions";
import type { SetupFilterConfig, StrategySettings as Strategy } from "@/lib/wingman/services/scanner";
import { SETUP_TYPES, type SetupType } from "@/lib/wingman/services/scanner";
import { laneLabel } from "./shared";

type NumericField =
  | "marketCapMin"
  | "marketCapMax"
  | "ageMinMinutes"
  | "ageMaxMinutes"
  | "maxMinutesSinceLastTrade"
  | "minTurnover24h"
  | "minVolume24hUsd"
  | "minBaselineAcceleration";

const FIELDS: { key: NumericField; label: string; hint: string }[] = [
  { key: "marketCapMin", label: "Min market cap ($)", hint: "blank = no limit" },
  { key: "marketCapMax", label: "Max market cap ($)", hint: "blank = no limit" },
  { key: "ageMinMinutes", label: "Min age (minutes)", hint: "blank = no limit" },
  { key: "ageMaxMinutes", label: "Max age (minutes)", hint: "blank = no limit" },
  { key: "maxMinutesSinceLastTrade", label: "Max minutes since last trade", hint: "required" },
  { key: "minTurnover24h", label: "Min 24h turnover (ratio)", hint: "0.12 = 12%" },
  {
    key: "minVolume24hUsd",
    label: "Min 24h volume ($)",
    hint: "blank = no floor; unavailable volume is never treated as zero",
  },
  { key: "minBaselineAcceleration", label: "Min baseline acceleration", hint: "blank = not required" },
];

function toInput(value: number | null): string {
  return value === null ? "" : String(value);
}

function fromInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function coreRange(setup: SetupFilterConfig): string | null {
  if (!setup.marketCapEmphasis) return null;
  const [lo, hi] = setup.marketCapEmphasis;
  return `$${Math.round(lo / 1000)}K–$${Math.round(hi / 1000)}K`;
}

export function StrategySettingsPanel() {
  const queryClient = useQueryClient();
  const load = useServerFn(getStrategySettings);
  const save = useServerFn(saveStrategySettings);
  const reset = useServerFn(resetStrategySettings);
  const [draft, setDraft] = useState<Strategy | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["wingman", "strategy-settings"],
    queryFn: () => load(),
  });

  const strategy = draft ?? data?.settings ?? null;

  const saveMutation = useMutation({
    mutationFn: (settings: Strategy) => save({ data: { settings } }),
    onSuccess: (result) => {
      setDraft(null);
      setNote("Saved. The next scan uses these filters; past scans are unchanged.");
      queryClient.setQueryData(["wingman", "strategy-settings"], result);
    },
    onError: (error: Error) => setNote(error.message),
  });

  const resetMutation = useMutation({
    mutationFn: () => reset(),
    onSuccess: (result) => {
      setDraft(null);
      setNote("Restored Wingman Default v1.");
      queryClient.setQueryData(["wingman", "strategy-settings"], result);
    },
    onError: (error: Error) => setNote(error.message),
  });

  if (!strategy) {
    return <p className="text-xs text-muted-foreground">Loading setup filters…</p>;
  }

  const update = (setup: SetupType, field: NumericField, raw: string) => {
    setDraft({
      ...strategy,
      setups: {
        ...strategy.setups,
        [setup]: { ...strategy.setups[setup], [field]: fromInput(raw) },
      },
    });
  };

  const updateReservation = (setup: SetupType, raw: string) => {
    setDraft({
      ...strategy,
      reservations: { ...strategy.reservations, [setup]: fromInput(raw) ?? 0 },
    });
  };

  return (
    <section>
      <h3 className="label-xs">Setup filters</h3>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
        Observable behaviour thresholds only — never thesis, safety or entry quality. Edits apply to
        future scans; every past scan keeps its own stored configuration.
      </p>

      <div className="grid gap-3 lg:grid-cols-3">
        {SETUP_TYPES.map((setup) => {
          const cfg = strategy.setups[setup];
          const range = coreRange(cfg);
          return (
            <div key={setup} className="rounded-md border border-border bg-surface/60 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs tracking-wide">{laneLabel(setup)}</span>
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) =>
                      setDraft({
                        ...strategy,
                        setups: {
                          ...strategy.setups,
                          [setup]: { ...cfg, enabled: e.target.checked },
                        },
                      })
                    }
                  />
                  enabled
                </label>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{cfg.description}</p>
              {range ? (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  CORE MC RANGE {range} · descriptive only
                </p>
              ) : null}

              <div className="mt-3 space-y-2">
                {FIELDS.map((field) => (
                  <label key={field.key} className="block">
                    <span className="label-xs">{field.label}</span>
                    <input
                      className="tabular mt-1 w-full rounded border border-border-strong bg-background px-2 py-1 text-xs"
                      value={toInput(cfg[field.key])}
                      placeholder={field.hint}
                      onChange={(e) => update(setup, field.key, e.target.value)}
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="label-xs">Reserved survivor slots</span>
                  <input
                    className="tabular mt-1 w-full rounded border border-border-strong bg-background px-2 py-1 text-xs"
                    value={String(strategy.reservations[setup])}
                    onChange={(e) => updateReservation(setup, e.target.value)}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <span className="label-xs">Survivor limit</span>
          <input
            className="tabular w-20 rounded border border-border-strong bg-background px-2 py-1 text-xs"
            value={String(strategy.survivorLimit)}
            onChange={(e) =>
              setDraft({ ...strategy, survivorLimit: fromInput(e.target.value) ?? 1 })
            }
          />
        </label>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate(strategy)}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Save filters"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
        >
          Reset to Wingman Default v1
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {data?.isDefault ? "Wingman Default v1 active" : "Custom filters active"}
        </span>
      </div>
      {note ? <p className="mt-2 text-[11px] text-muted-foreground">{note}</p> : null}
    </section>
  );
}
