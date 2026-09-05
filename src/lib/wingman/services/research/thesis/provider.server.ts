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

/* ------------------------------------------------------------------ *
 * Benchmark provider: OpenAI Responses API (calibration use only).
 * The rubric, prompt and report schema are untouched; only the model
 * performing the synthesis pass differs.
 * ------------------------------------------------------------------ */

/** Preferred benchmark model, then the explicit documented fallback. */
export const OPENAI_THESIS_MODEL_PREFERENCE = ["gpt-6-astra", "gpt-5.6-sol"] as const;
export const OPENAI_THESIS_REASONING_EFFORT = "high" as const;

export class OpenAiThesisModelUnavailableError extends Error {
  readonly code = "OPENAI_THESIS_MODEL_UNAVAILABLE";
  constructor(readonly attempts: OpenAiModelAccessAttempt[]) {
    super("OPENAI_THESIS_MODEL_UNAVAILABLE");
    this.name = "OpenAiThesisModelUnavailableError";
  }
}

export interface OpenAiModelAccessAttempt {
  model: string;
  available: boolean;
  status: number | null;
  reason: string | null;
}

export interface OpenAiThesisAccessResult {
  selectedModel: string | null;
  usedFallback: boolean;
  attempts: OpenAiModelAccessAttempt[];
}

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/**
 * Explicit access preflight. Tries the preferred model first and only falls
 * back when the account genuinely cannot use it; the attempt trail is
 * recorded either way so the benchmark can report which model ran.
 */
export async function preflightOpenAiThesisModels(options: {
  apiKey: string;
  models?: readonly string[];
}): Promise<OpenAiThesisAccessResult> {
  const models = options.models ?? OPENAI_THESIS_MODEL_PREFERENCE;
  const attempts: OpenAiModelAccessAttempt[] = [];
  for (const model of models) {
    try {
      const res = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: "reply with ok",
          max_output_tokens: 16,
          reasoning: { effort: "low" },
        }),
      });
      if (res.ok) {
        await res.text().catch(() => "");
        attempts.push({ model, available: true, status: res.status, reason: null });
        return {
          selectedModel: model,
          usedFallback: attempts.length > 1,
          attempts,
        };
      }
      const detail = await res.text().catch(() => "");
      attempts.push({
        model,
        available: false,
        status: res.status,
        reason: detail.slice(0, 300) || res.statusText,
      });
    } catch (error) {
      attempts.push({
        model,
        available: false,
        status: null,
        reason: error instanceof Error ? error.message.slice(0, 300) : "network error",
      });
    }
  }
  return { selectedModel: null, usedFallback: false, attempts };
}

/**
 * Reasoning models routinely run for minutes, so every call streams; the
 * final text is accumulated server-side because nothing renders live here.
 */
export function createOpenAiThesisProvider(options: {
  apiKey: string;
  model: string;
  reasoningEffort?: "low" | "medium" | "high";
}): ThesisProvider {
  const effort = options.reasoningEffort ?? OPENAI_THESIS_REASONING_EFFORT;
  return {
    provider: "openai",
    model: options.model,
    async complete({ system, user }) {
      const startedAt = Date.now();
      const res = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          stream: true,
          reasoning: { effort, summary: "auto" },
          text: { format: { type: "json_object" } },
          input: [
            { role: "system", content: [{ type: "input_text", text: system }] },
            { role: "user", content: [{ type: "input_text", text: user }] },
          ],
        }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `Thesis benchmark provider failed (${res.status}): ${detail.slice(0, 500) || res.statusText}`,
        );
      }

      let text = "";
      let usage: unknown = null;
      let status: string | null = null;
      let reasoningChars = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(payload) as Record<string, unknown>;
          } catch {
            continue;
          }
          const type = event["type"] as string | undefined;
          if (type === "response.output_text.delta") {
            text += (event["delta"] as string) ?? "";
          } else if (type === "response.reasoning_summary_text.delta") {
            reasoningChars += ((event["delta"] as string) ?? "").length;
          } else if (type === "response.completed" || type === "response.incomplete") {
            const response = event["response"] as Record<string, unknown> | undefined;
            usage = response?.["usage"] ?? null;
            status = (response?.["status"] as string) ?? null;
            if (!text) {
              const outputText = response?.["output_text"];
              if (typeof outputText === "string") text = outputText;
            }
          } else if (type === "error" || type === "response.failed") {
            throw new Error(
              `Thesis benchmark provider stream error: ${JSON.stringify(event).slice(0, 400)}`,
            );
          }
        }
      }

      if (!text.trim()) throw new Error("Thesis benchmark provider returned an empty response.");
      return {
        text,
        diagnostics: {
          provider: "openai",
          model: options.model,
          reasoningEffort: effort,
          responseStatus: status,
          reasoningSummaryChars: reasoningChars,
          latencyMs: Date.now() - startedAt,
          usage,
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
