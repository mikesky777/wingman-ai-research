/**
 * Model abstraction for Thesis Synthesis (server-only).
 *
 * Vendor-neutral: the rubric, prompt and report schema are versioned
 * independently of whichever model performs the synthesis pass.
 */

export interface ThesisProviderRequest {
  system: string;
  user: string;
}

export interface ThesisProviderResponse {
  text: string;
  diagnostics: Record<string, unknown>;
}

export interface ThesisProvider {
  readonly provider: string;
  readonly model: string;
  complete(request: ThesisProviderRequest): Promise<ThesisProviderResponse>;
}

export const DEFAULT_THESIS_MODEL = "google/gemini-3.7-flash";

export function createLovableThesisProvider(options: {
  apiKey: string;
  model?: string;
}): ThesisProvider {
  const model = options.model ?? DEFAULT_THESIS_MODEL;
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
          `Thesis synthesis provider failed (${res.status}): ${detail.slice(0, 500) || res.statusText}`,
        );
      }

      const body = (await res.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: Record<string, unknown>;
      };
      const text = body.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) throw new Error("Thesis synthesis provider returned an empty response.");
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

/** Tolerant JSON extraction from a model response. */
export function parseThesisJson(text: string): unknown {
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
