import { createFileRoute } from "@tanstack/react-router";
import { CalibrationPage } from "@/components/wingman/research/CalibrationPage";

export const Route = createFileRoute("/calibration")({
  head: () => ({
    meta: [
      { title: "Calibration Lab — Wingman AI" },
      {
        name: "description",
        content:
          "Benchmarks, the Calibration Observatory and dry runs over frozen production evidence. Calibration has no production effect.",
      },
      { property: "og:title", content: "Calibration Lab — Wingman AI" },
      {
        property: "og:description",
        content:
          "Model benchmarks and outcome analysis over frozen decisions — never writes production history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalibrationPage,
});
