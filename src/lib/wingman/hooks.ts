import { useQuery } from "@tanstack/react-query";
import { OutcomeService, ResearchService, ScannerService } from "./services";

/** Query keys for every backend-read surface. */
export const wingmanKeys = {
  latestScan: ["wingman", "latest-scan"] as const,
  candidates: (runId: string) => ["wingman", "candidates", runId] as const,
  opportunities: ["wingman", "opportunities"] as const,
  opportunity: (id: string) => ["wingman", "opportunity", id] as const,
  outcomes: ["wingman", "outcomes"] as const,
  watchlist: ["wingman", "watchlist"] as const,
};

export function useLatestScan() {
  return useQuery({
    queryKey: wingmanKeys.latestScan,
    queryFn: () => ScannerService.latestCompletedScan(),
  });
}

export function useScanCandidates(runId: string | undefined) {
  return useQuery({
    queryKey: wingmanKeys.candidates(runId ?? "none"),
    queryFn: () => ScannerService.candidates(runId!),
    enabled: Boolean(runId),
  });
}

export function useOpportunities() {
  return useQuery({
    queryKey: wingmanKeys.opportunities,
    queryFn: () => ResearchService.activeOpportunities(),
  });
}

export function useOpportunity(id: string) {
  return useQuery({
    queryKey: wingmanKeys.opportunity(id),
    queryFn: () => ResearchService.getOpportunity(id),
  });
}

export function useOutcomes() {
  return useQuery({ queryKey: wingmanKeys.outcomes, queryFn: () => OutcomeService.list() });
}
