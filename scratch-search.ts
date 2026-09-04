import { createDuckDuckGoSearchProvider, createHttpPageFetcher } from "@/lib/wingman/services/research/deep/search.server";
import { buildQueryPlan } from "@/lib/wingman/services/research/deep/contracts";
const plan = buildQueryPlan({ mint: "Ai66LHZG9MCzg1WKdawwqduVAXpNDUuV8M3uyq5ppump", symbol: "CATE", name: "Catecoin" });
const s = createDuckDuckGoSearchProvider();
for (const q of plan) {
  try { const hits = await s.search(q, 4); console.log(q, "->", hits.length, hits.slice(0,2).map(h=>h.url)); }
  catch (e) { console.log(q, "ERR", String(e).slice(0,120)); }
}
