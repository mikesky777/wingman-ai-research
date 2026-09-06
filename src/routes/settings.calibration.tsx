import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route. The primary Calibration destination is /calibration; this
 * path permanently redirects so there is only one Calibration page.
 */
export const Route = createFileRoute("/settings/calibration")({
  beforeLoad: () => {
    throw redirect({ to: "/calibration" });
  },
});
