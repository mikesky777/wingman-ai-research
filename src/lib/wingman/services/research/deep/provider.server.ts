/**
 * Model abstraction for Deep Research synthesis (server-only).
 *
 * Vendor-neutral by design: research policy, prompt and dossier schema are
 * versioned independently of whichever model performs the synthesis pass.
 */

export interface DeepResearchProviderRequest {
  system: string;
  user: string;
}

export interface DeepResearchProviderResponse {
  text: string;
  diagnostics: Record<string, unknown>;
}

export interface DeepResearchProvider {
  readonly provider: string;
  readonly model: string;
  complete(request: DeepResearchProviderRequest): Promise<DeepResearchProviderResponse>;
}

export const DEFAULT_DEEP_RESEARCH_MODEL = "google/gemini-3.7-flash";

export function createLovableDeepResearchProvider(options: {
  apiKey: string;
  model?: string;
}): DeepResearchProvider {
  const model = options.model ?? DEFAULT_DEEP_RESEARCH_MODEL;
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
          `Deep research provider failed (${res.status}): ${detail.slice(0, 500) || res.statusText}`,
        );
      }

      const body = (await res.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: Record<string, unknown>;
      };
      const text = body.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) throw new Error("Deep research provider returned an empty response.");
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
