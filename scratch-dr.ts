import { runDeepResearch } from "@/lib/wingman/services/research/deep/deep-research.server";
const r = await runDeepResearch({ mode: "calibration", limit: 3, triageRunId: "9169be2f-7e11-40f4-ae5e-ddd22605bd25" });
console.log(JSON.stringify({ code: r.code, completed: r.completed, insufficient: r.insufficient, failed: r.failed, milestonesCreated: (r as any).milestonesCreated, candidates: r.candidates.map(c=>({mint:c.mint,status:c.status,stop:c.stopReason,q:c.queryCount,src:c.sourceCount,cov:c.coveragePct,narr:c.narrativeResolved})) }, null, 2));
