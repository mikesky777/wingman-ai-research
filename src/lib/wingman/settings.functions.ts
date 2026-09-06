/**
 * Settings server functions. Read-only: Settings never configures or triggers
 * a production stage.
 */
import { createServerFn } from "@tanstack/react-start";

export const loadProviderHealthFn = createServerFn({ method: "GET" }).handler(async () => {
  const { loadProviderHealth } = await import("./services/settings/provider-health.server");
  return loadProviderHealth();
});
