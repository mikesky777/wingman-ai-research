/**
 * Server functions for live external-data ingestion.
 *
 * Thin wrapper module: only imports, types and server-function declarations.
 * All runtime work lives in the adapter + `ingestion.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import type { IngestTokenResult } from "./ingest-types";

export const ingestTokenByAddress = createServerFn({ method: "POST" })
  .inputValidator((input: { contractAddress: string }) => ({
    contractAddress: String(input?.contractAddress ?? "").trim(),
  }))
  .handler(async ({ data }): Promise<IngestTokenResult> => {
    const { runIngestTokenByAddress } = await import("./services/ingest-token.server");
    return runIngestTokenByAddress(data.contractAddress);
  });
