/**
 * Scanner Workbench server functions.
 *
 * Thin wrapper module: imports, types and server-function declarations only.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  evaluateContractAddressManually,
  runHolderCheck,
  saveCalibrationLabel,
  type CalibrationLabel,
  type HolderCheckResult,
  type ManualEvaluationResult,
} from "./services/scanner/workbench.server";
import {
  loadCandleReview,
  type CandleReviewResult,
} from "./services/scanner/candle-review.server";

export const evaluateContractAddress = createServerFn({ method: "POST" })
  .inputValidator((input: { contractAddress: string }) => ({
    contractAddress: String(input?.contractAddress ?? ""),
  }))
  .handler(async ({ data }): Promise<ManualEvaluationResult> =>
    evaluateContractAddressManually(data.contractAddress),
  );

export const checkTokenHolders = createServerFn({ method: "POST" })
  .inputValidator((input: { contractAddress: string; tokenId?: string | null }) => ({
    contractAddress: String(input?.contractAddress ?? ""),
    tokenId: input?.tokenId ?? null,
  }))
  .handler(async ({ data }): Promise<HolderCheckResult> => runHolderCheck(data));

export const setCandidateLabel = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      tokenId: string;
      scanRunId?: string | null;
      label: CalibrationLabel;
      note?: string | null;
    }) => ({
      tokenId: String(input.tokenId),
      scanRunId: input.scanRunId ?? null,
      label: input.label,
      note: input.note ?? null,
    }),
  )
  .handler(async ({ data }) => saveCalibrationLabel(data));

/**
 * Persisted candle history for the calibration chart. Storage read only —
 * opening a candidate never triggers a provider request.
 */
export const getCandidateCandles = createServerFn({ method: "POST" })
  .inputValidator((input: { contractAddress: string; chain?: string | null }) => ({
    contractAddress: String(input?.contractAddress ?? ""),
    chain: input?.chain ?? "solana",
  }))
  .handler(
    async ({ data }): Promise<CandleReviewResult> =>
      loadCandleReview(data.contractAddress, data.chain ?? "solana"),
  );
