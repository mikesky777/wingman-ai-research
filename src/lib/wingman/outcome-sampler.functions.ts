/**
 * Outcome collection server functions.
 *
 * Read surface for History plus a prioritized (rate-limited) sampler request.
 * No UI path fans out provider requests: everything goes through the sampler
 * and the centralized DexScreener controller.
 */
import { createServerFn } from "@tanstack/react-start";

export const readMarketObservations = createServerFn({ method: "POST" })
  .inputValidator((input: { addresses: string[] }) => ({
    addresses: Array.isArray(input?.addresses) ? input.addresses.map(String) : [],
  }))
  .handler(async ({ data }) => {
    const { readPersistedMarkets } = await import(
      "./services/outcomes/observation-read.server"
    );
    return readPersistedMarkets(data.addresses);
  });

/**
 * Manual "Refresh now": enqueue prioritized sampling for stale relevant mints
 * and run ONE bounded sampler pass through the shared rate-limit controller.
 */
export const requestOutcomeSample = createServerFn({ method: "POST" })
  .inputValidator((input: { addresses: string[] }) => ({
    addresses: Array.isArray(input?.addresses) ? input.addresses.map(String) : [],
  }))
  .handler(async ({ data }) => {
    const { requestPrioritySampling, runOutcomeSampler } = await import(
      "./services/outcomes/sampler.server"
    );
    const requested = await requestPrioritySampling(data.addresses);
    const run = await runOutcomeSampler({
      trigger: "PRIORITY",
      mints: data.addresses,
      maxBatches: 2,
    });
    return { requested, run };
  });

export const getOutcomeSamplerHealth = createServerFn({ method: "GET" }).handler(async () => {
  const { getSamplerHealth } = await import("./services/outcomes/sampler.server");
  return getSamplerHealth();
});
