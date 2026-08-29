/**
 * Provider cost telemetry.
 *
 * Records how many calls each provider capability cost per scan so we can work
 * out how often Wingman can economically run. Never records credentials, URLs
 * with keys, or response bodies.
 */
import type { ProviderCallTelemetry } from "./types";

export class TelemetryRecorder {
  private readonly entries = new Map<string, ProviderCallTelemetry>();

  private entry(provider: string, capability: string): ProviderCallTelemetry {
    const key = `${provider}:${capability}`;
    let found = this.entries.get(key);
    if (!found) {
      found = { provider, capability, requests: 0, successes: 0, failures: 0, durationMs: 0 };
      this.entries.set(key, found);
    }
    return found;
  }

  /** Times a call and records success/failure without swallowing the error. */
  async track<T>(provider: string, capability: string, fn: () => Promise<T>): Promise<T> {
    const entry = this.entry(provider, capability);
    entry.requests += 1;
    const start = Date.now();
    try {
      const result = await fn();
      entry.successes += 1;
      return result;
    } catch (error) {
      entry.failures += 1;
      throw error;
    } finally {
      entry.durationMs += Date.now() - start;
    }
  }

  snapshot(): ProviderCallTelemetry[] {
    return [...this.entries.values()].map((e) => ({ ...e }));
  }

  totalRequests(): number {
    return this.snapshot().reduce((sum, e) => sum + e.requests, 0);
  }
}
