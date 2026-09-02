/**
 * Scanner strategy settings server functions.
 *
 * Thin wrapper module. Setup filters are calibration state only — they never
 * express a thesis, a safety rating or a recommendation.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  loadActiveStrategy,
  resetActiveStrategy,
  saveActiveStrategy,
  type ActiveStrategy,
} from "./services/scanner/settings.server";

export const getStrategySettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActiveStrategy> => loadActiveStrategy(),
);

export const saveStrategySettings = createServerFn({ method: "POST" })
  .inputValidator((input: { settings: unknown }) => ({ settings: input?.settings ?? null }))
  .handler(async ({ data }): Promise<ActiveStrategy> => saveActiveStrategy(data.settings));

export const resetStrategySettings = createServerFn({ method: "POST" }).handler(
  async (): Promise<ActiveStrategy> => resetActiveStrategy(),
);
