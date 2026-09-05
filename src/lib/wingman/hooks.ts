import { useQuery } from "@tanstack/react-query";
import { OutcomeService, ResearchService, ScannerService } from "./services";
import { getLiveCalls } from "./live-calls.functions";
import { getLiveCallSizing } from "./sizing.functions";

/** Query keys for every backend-read surface. */
export const wingmanKeys = {
  latestScan: ["wingman", "latest-scan"] as const,
  latestFunnel: ["wingman", "latest-funnel"] as const,
  candidates: (runId: string) => ["wingman", "candidates", runId] as const,
  rankedCandidates: (runId: string) => ["wingman", "ranked-candidates", runId] as const,
  workbenchCandidates: (runId: string) => ["wingman", "workbench-candidates", runId] as const,
  runDiagnostics: (runId: string) => ["wingman", "run-diagnostics", runId] as const,
  opportunities: ["wingman", "opportunities"] as const,
  opportunity: (id: string) => ["wingman", "opportunity", id] as const,
  outcomes: ["wingman", "outcomes"] as const,
  watchlist: ["wingman", "watchlist"] as const,
  liveCalls: ["wingman", "live-calls"] as const,
  liveCallSizing: ["wingman", "live-call-sizing"] as const,
};

/**
 * Official production Live Calls — immutable THESIS_CALL records only.
 * Never includes shortlists, synthesized-only theses, or calibration data.
 */
export function useLiveCalls() {
  return useQuery({
    queryKey: wingmanKeys.liveCalls,
    queryFn: () => getLiveCalls(),
  });
}

/**
 * Deterministic sizing/v1 for official production calls only.
 * With zero THESIS_CALLs this returns an honest empty result.
 */
export function useLiveCallSizing() {
  return useQuery({
    queryKey: wingmanKeys.liveCallSizing,
    queryFn: () => getLiveCallSizing(),
  });
}

/**
 * Live lifecycle: current monitoring state plus the append-only ledger of
 * activations, deactivations and monitoring-status changes.
 */
export function useLiveLifecycle() {
  return useQuery({
    queryKey: wingmanKeys.liveLifecycle,
    queryFn: () => getLiveLifecycle(),
  });
}

export function useLatestScan() {
  return useQuery({
    queryKey: wingmanKeys.latestScan,
    queryFn: () => ScannerService.latestCompletedScan(),
  });
}

/** Scanner v1 funnel counts for the most recent completed run. */
export function useLatestFunnel() {
  return useQuery({
    queryKey: wingmanKeys.latestFunnel,
    queryFn: () => ScannerService.latestFunnel(),
  });
}

export function useRankedCandidates(runId: string | undefined) {
  return useQuery({
    queryKey: wingmanKeys.rankedCandidates(runId ?? "none"),
    queryFn: () => ScannerService.rankedCandidates(runId!),
    enabled: Boolean(runId),
  });
}

/** Full workbench candidate set: survivors plus near misses. */
export function useWorkbenchCandidates(runId: string | undefined) {
  return useQuery({
    queryKey: wingmanKeys.workbenchCandidates(runId ?? "none"),
    queryFn: () => ScannerService.workbenchCandidates(runId!),
    enabled: Boolean(runId),
  });
}

/** Bucket + lane calibration diagnostics for one run. */
export function useRunDiagnostics(runId: string | undefined) {
  return useQuery({
    queryKey: wingmanKeys.runDiagnostics(runId ?? "none"),
    queryFn: () => ScannerService.runDiagnostics(runId!),
    enabled: Boolean(runId),
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
