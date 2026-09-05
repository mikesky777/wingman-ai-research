import { generatePacketsForRunSafely } from "@/lib/wingman/services/scanner/pipeline.server";
const r = await generatePacketsForRunSafely("7549dac5-8e60-4bd8-a0c4-afef6030c29d");
console.log(JSON.stringify(r));
