import { runDeepResearch } from "@/lib/wingman/services/research/deep/deep-research.server";
const res = await runDeepResearch({ mode: "calibration", limit: 3 });
console.log(JSON.stringify(res, null, 2));
