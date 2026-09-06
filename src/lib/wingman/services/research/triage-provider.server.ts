/**
 * Model/provider abstraction for AI triage (server-only).
 *
 * Product semantics never depend on a vendor: triage policy, prompt and model
 * are versioned independently, and the orchestrator only ever sees this
 * deterministic input/output contract. Secrets stay server-side.
 */

export interface AiTriageProviderRequest {
  system: string;
  user: string;
}

export interface AiTriageProviderResponse {
  /** Raw model text. The orchestrator parses + validates it, never the provider. */
  text: string;
  /** Safe server-side diagnostics (status, finish reason, usage). No secrets. */
  diagnostics: Record<string, unknown>;
}

export interface AiTriageProvider {
  readonly provider: string;
  readonly model: string;
  complete(request: AiTriageProviderRequest): Promise<AiTriageProviderResponse>;
}

import { TRIAGE_MODEL } from "../ai/models";

export const DEFAULT_TRIAGE_MODEL = TRIAGE_MODEL;

/** Lovable AI Gateway implementation. */
export function createLovableTriageProvider(options: {
  apiKey: string;
  model?: string;
}): AiTriageProvider {
  const model = options.model ?? DEFAULT_TRIAGE_MODEL;
  return {
    provider: "lovable-ai-gateway",
    model,
    async complete({ system, user }) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": options.apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `AI triage provider failed (${res.status}): ${detail.slice(0, 500) || res.statusText}`,
        );
      }

      const body = (await res.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: Record<string, unknown>;
      };
      const text = body.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) throw new Error("AI triage provider returned an empty response.");
      return {
        text,
        diagnostics: {
          status: res.status,
          finishReason: body.choices?.[0]?.finish_reason ?? null,
          usage: body.usage ?? null,
        },
      };
    },
  };
}

/** Tolerant JSON extraction: some models still wrap JSON in a fenced block. */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
