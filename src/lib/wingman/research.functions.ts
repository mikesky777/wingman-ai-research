/**
 * AI Research server functions (Stage 1 — packet foundation).
 *
 * No LLM call, no web/social research, no thesis score, no recommendation.
 * Everything here is a read plus an append-only packet snapshot.
 */
import { createServerFn } from "@tanstack/react-start";
import type {
  ResearchPacketRunResult,
} from "./services/research/packet.server";
import type { ResearchPacket } from "./services/research/types";

export const generateResearchPacketsForRun = createServerFn({ method: "POST" })
  .inputValidator((input?: { scanRunId?: string | null; persist?: boolean; maxExplorationForAi?: number }) => ({
    scanRunId: input?.scanRunId ?? null,
    persist: input?.persist !== false,
    maxExplorationForAi:
      typeof input?.maxExplorationForAi === "number" ? input.maxExplorationForAi : null,
  }))
  .handler(async ({ data }): Promise<Omit<ResearchPacketRunResult, "packets"> & { packets: ResearchPacket[] }> => {
    const { generateResearchPackets } = await import("./services/research/packet.server");
    const { RESEARCH_UNIVERSE_CONFIG } = await import("./services/research/packet");
    const { recordResearchPacketResult } = await import(
      "./services/scanner/persistence.server"
    );
    try {
      const result = await generateResearchPackets({
        scanRunId: data.scanRunId,
        persist: data.persist,
        config:
          data.maxExplorationForAi === null
            ? RESEARCH_UNIVERSE_CONFIG
            : { maxExplorationForAi: data.maxExplorationForAi },
      });
      if (data.persist) {
        const persisted = result.persistedCount ?? result.packets.length;
        await recordResearchPacketResult(result.scanRunId, {
          status: persisted > 0 ? "READY" : "NOT_STARTED",
          count: persisted,
          error: null,
        }).catch(() => undefined);
      }
      const { packets, ...rest } = result;
      return { ...rest, packets: packets.map((p) => p.packet) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (data.scanRunId && data.persist) {
        await recordResearchPacketResult(data.scanRunId, {
          status: "FAILED",
          count: 0,
          error: message,
        }).catch(() => undefined);
      }
      throw error;
    }
  });


/** Newest persisted packet for one mint, for the drawer calibration section. */
export const getResearchPacket = createServerFn({ method: "POST" })
  .inputValidator((input: { contractAddress: string }) => ({
    contractAddress: String(input?.contractAddress ?? ""),
  }))
  .handler(async ({ data }): Promise<ResearchPacket | null> => {
    if (!data.contractAddress) return null;
    const { loadLatestPacketForMint } = await import("./services/research/packet.server");
    return loadLatestPacketForMint(data.contractAddress);
  });
