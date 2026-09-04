/**
 * Compact manual market refresh control.
 *
 * Refresh appends a NEW current-market observation for the exact mint. It does
 * not rerun the scanner, change selection, or modify the stored scan row.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { refreshCandidateMarket } from "@/lib/wingman/workbench.functions";
import {
  MANUAL_REFRESH_COOLDOWN_SECONDS,
  cooldownElapsed,
} from "@/lib/wingman/services/market-refresh";

type Result = Awaited<ReturnType<typeof refreshCandidateMarket>>;

export function useMarketRefresh(contractAddress: string | null) {
  const queryClient = useQueryClient();
  const call = useServerFn(refreshCandidateMarket);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!contractAddress) throw new Error("No contract address");
      return call({ data: { contractAddress } });
    },
    onSuccess: (res) => {
      setResult(res);
      if (res.ok) {
        // Only a successful observation resets the cooldown and refreshes reads.
        setLastAt(res.observedAt ?? new Date().toISOString());
        void queryClient.invalidateQueries({ queryKey: ["wingman"] });
      }
    },
  });

  const ready = cooldownElapsed(lastAt, new Date().toISOString());
  return {
    refresh: () => mutation.mutate(),
    pending: mutation.isPending,
    disabled: !contractAddress || mutation.isPending || !ready,
    result,
    lastAt,
    error: mutation.isError ? "Refresh failed — previous values kept." : (result?.message ?? null),
  };
}

export function formatAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `Updated ${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `Updated ${min} min ago`;
  return `Updated ${Math.floor(min / 60)} h ago`;
}

/** Ticking label so "Updated X ago" stays honest without extra fetches. */
export function UpdatedAgo({ at }: { at: string | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  if (!at) return null;
  return <span className="font-mono text-[10px] text-muted-foreground">{formatAgo(at)}</span>;
}

export function RefreshMarketButton({
  contractAddress,
  pending,
  disabled,
  onClick,
  className,
}: {
  contractAddress: string | null;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={
        contractAddress
          ? `Refresh current market data (${MANUAL_REFRESH_COOLDOWN_SECONDS}s cooldown). Does not rerun the scan.`
          : "No contract address"
      }
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "rounded border border-border-strong p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40",
        className,
      )}
    >
      <RefreshCw className={cn("h-3 w-3", pending && "animate-spin")} />
    </button>
  );
}
