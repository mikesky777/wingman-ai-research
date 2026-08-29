import { STRUCTURAL_MULTIPLIERS, sizingBandFor } from "./config";
import type { StructuralRiskKey } from "./types";

export interface PositionFrameworkResult {
  thesisScore: number;
  bandLabel: string;
  baseExposure: string;
  structuralLabel: string;
  multiplier: number | null;
  adjustedExposure: string;
  initialDeployment: string;
  starterExample: string;
  noTrade: boolean;
}

/** Parses "10–15% max" style exposure strings into numeric bounds. */
function parseBand(exposure: string): [number, number] | null {
  const match = exposure.match(/(\d+)[–-](\d+)%/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

export function buildPositionFramework(
  thesisScore: number,
  structuralRisk: StructuralRiskKey,
  bankrollUsd = 10_000,
): PositionFrameworkResult {
  const band = sizingBandFor(thesisScore);
  const structural = STRUCTURAL_MULTIPLIERS[structuralRisk];
  const bounds = parseBand(band.exposure);
  const noTrade = structural.multiplier === null;

  let adjustedExposure = "No exposure";
  let starterExample = "—";

  if (!noTrade && bounds) {
    const m = structural.multiplier ?? 1;
    const lo = bounds[0] * m;
    const hi = bounds[1] * m;
    adjustedExposure = `${lo.toFixed(lo % 1 ? 1 : 0)}–${hi.toFixed(hi % 1 ? 1 : 0)}%`;
    const starterLo = (bankrollUsd * lo * 0.6) / 100;
    const starterHi = (bankrollUsd * hi * 0.7) / 100;
    starterExample = `$${Math.round(starterLo).toLocaleString()}–$${Math.round(starterHi).toLocaleString()} on a $${bankrollUsd.toLocaleString()} dedicated bankroll`;
  }

  return {
    thesisScore,
    bandLabel: band.label,
    baseExposure: band.exposure,
    structuralLabel: structural.label,
    multiplier: structural.multiplier,
    adjustedExposure,
    initialDeployment: "60–70% of intended maximum",
    starterExample,
    noTrade,
  };
}
