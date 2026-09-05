import { runAiTriage } from "@/lib/wingman/services/research/triage.server";
const r = await runAiTriage({ mode: "PRODUCTION", scanRunId: null });
console.log(JSON.stringify({ code: r.code, status: r.status, scanRunId: r.scanRunId, packets: r.packetCount, deep: r.deepResearchCount, watch: r.watchCount, skip: r.skipCount, blocked: r.blockedCount, milestones: r.shortlistMilestonesCreated, eligibility: r.eligibility, error: r.error }));
