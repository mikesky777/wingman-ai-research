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
