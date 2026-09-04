/**
 * External source acquisition for Deep Research (server-only).
 *
 * Provider-abstracted: the orchestrator only sees `WebSearchProvider` and
 * `PageFetcher`, so a keyed search vendor can replace the keyless default
 * later without touching research policy.
 *
 * Nothing here interprets evidence. It only retrieves and records what was
 * actually returned, with fetch timestamps.
 */

export interface SearchHit {
  url: string;
  title: string | null;
  snippet: string | null;
  query: string;
}

/**
 * Raised when the search provider itself could not answer (network error,
 * rate limit, bot challenge). Distinct from "the provider answered, nothing
 * matched" — an unavailable provider never proves an absence of evidence.
 */
export class SearchProviderUnavailableError extends Error {
  constructor(readonly detail: string) {
    super(`Search provider unavailable: ${detail}`);
    this.name = "SearchProviderUnavailableError";
  }
}

export interface WebSearchProvider {
  readonly name: string;
  search(query: string, limit: number): Promise<SearchHit[]>;
}

export interface FetchedPage {
  url: string;
  title: string | null;
  text: string;
  fetchedAt: string;
}

export interface PageFetcher {
  readonly name: string;
  fetchPage(url: string, maxChars: number): Promise<FetchedPage | null>;
}

const UA =
  "Mozilla/5.0 (compatible; WingmanResearch/1.0; +https://lovable.dev) AppleWebKit/537.36 Chrome/120 Safari/537.36";

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve DuckDuckGo redirect wrappers to the real destination. */
function normalizeResultUrl(href: string): string | null {
  try {
    const url = href.startsWith("//") ? `https:${href}` : href;
    const parsed = new URL(url, "https://duckduckgo.com");
    if (parsed.pathname.includes("/l/")) {
      const target = parsed.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
      return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (/duckduckgo\.com$/.test(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Keyless default search provider. Best-effort: on failure it returns no hits
 * and the orchestrator records an explicit evidence gap rather than guessing.
 */
export function createDuckDuckGoSearchProvider(options: { timeoutMs?: number } = {}): WebSearchProvider {
  const timeoutMs = options.timeoutMs ?? 12_000;
  return {
    name: "duckduckgo-html",
    async search(query, limit) {
      const html = await withTimeout(async (signal) => {
        const res = await fetch("https://html.duckduckgo.com/html/", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": UA,
            Accept: "text/html",
          },
          body: new URLSearchParams({ q: query }).toString(),
          signal,
        });
        if (res.status !== 200) throw new SearchProviderUnavailableError(`http ${res.status}`);
        const body = await res.text();
        // DuckDuckGo answers bot challenges with a 200/202 shell that carries no
        // result markup at all. Treat that as unavailability, not as zero results.
        if (!/result__a|result__snippet|results_links/.test(body)) {
          throw new SearchProviderUnavailableError("no result markup (challenge page)");
        }
        return body;
      }, timeoutMs).catch((error: unknown) => {
        if (error instanceof SearchProviderUnavailableError) throw error;
        throw new SearchProviderUnavailableError(
          error instanceof Error ? error.message : String(error),
        );
      });

      const hits: SearchHit[] = [];
      const anchor = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippets = [...html.matchAll(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)].map(
        (m) => stripTags(m[1] ?? ""),
      );
      let match: RegExpExecArray | null;
      let index = 0;
      while ((match = anchor.exec(html)) && hits.length < limit) {
        const url = normalizeResultUrl(match[1] ?? "");
        index += 1;
        if (!url) continue;
        if (hits.some((h) => h.url === url)) continue;
        hits.push({
          url,
          title: stripTags(match[2] ?? "") || null,
          snippet: snippets[index - 1] ?? null,
          query,
        });
      }
      return hits;
    },
  };
}

export function createHttpPageFetcher(options: { timeoutMs?: number } = {}): PageFetcher {
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    name: "http-text",
    async fetchPage(url, maxChars) {
      try {
        const { html, finalUrl } = await withTimeout(async (signal) => {
          const res = await fetch(url, {
            headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
            signal,
            redirect: "follow",
          });
          if (!res.ok) throw new Error(`fetch ${res.status}`);
          const type = res.headers.get("content-type") ?? "";
          if (!/text\/html|text\/plain|application\/xhtml/.test(type)) {
            throw new Error(`unsupported content-type ${type}`);
          }
          return { html: (await res.text()).slice(0, 400_000), finalUrl: res.url || url };
        }, timeoutMs);

        const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
        const text = stripTags(html).slice(0, maxChars);
        if (!text) return null;
        return {
          url: finalUrl,
          title: title ? stripTags(title) : null,
          text,
          fetchedAt: new Date().toISOString(),
        };
      } catch {
        return null;
      }
    },
  };
}
