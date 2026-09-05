/**
 * History artifact contracts (client-safe, pure types).
 *
 * Deep Research and Thesis Synthesized are artifact stages. They deliberately
 * carry NO since / peak / drawdown / win-rate field, because no stage-relative
 * outcome baseline was captured for them.
 */

export interface HistoryArtifactIdentity {
  mint: string;
  symbol: string | null;
  name: string | null;
  pairAddress: string | null;
}

export interface DeepResearchArtifact extends HistoryArtifactIdentity {
  reportId: string;
  runId: string;
  completedAt: string | null;
  narrativeResolved: boolean;
  oneSentenceNarrative: string | null;
  sourceCount: number | null;
  independentSourceCount: number | null;
  coveragePct: number | null;
  researchPolicyVersion: string | null;
  searchVersion: string | null;
  dossierVersion: string | null;
  modelProvider: string | null;
  modelIdentifier: string | null;
  promptVersion: string | null;
}

export interface ThesisArtifact extends HistoryArtifactIdentity {
  reportId: string;
  synthesizedAt: string | null;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  verdict: string | null;
  bearCaseSeverity: string | null;
  oneSentenceThesis: string | null;
  strongestBearCase: string | null;
  qualifiedAsOpportunity: boolean;
  thesisPolicyVersion: string | null;
  rubricVersion: string | null;
  promptVersion: string | null;
  modelProvider: string | null;
  modelIdentifier: string | null;
}

export interface HistoryArtifacts {
  deepResearch: DeepResearchArtifact[];
  thesis: ThesisArtifact[];
}

/** Shown wherever an artifact stage would otherwise imply a return series. */
export const ARTIFACT_NO_BASELINE_NOTE =
  "Historical performance baseline not captured for this artifact version.";
