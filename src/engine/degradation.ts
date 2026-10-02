import type { ChannelRuntime, ReportRuntime, SimSeconds } from "./types";

export function issueReport(
  report: ReportRuntime,
  channel: ChannelRuntime,
  baseDelaySec: SimSeconds,
  atSec: SimSeconds,
): ReportRuntime {
  if (report.status !== "SCHEDULED") return report;
  if (
    channel.mode === "DROPOUT" ||
    (channel.mode === "BURST" && channel.untilSec === null)
  ) {
    return {
      ...report,
      status: "DROPPED",
      deliveredAtSec: null,
      droppedReason: "DROPOUT",
      healthAtIssue: channel.healthMultiplier,
    };
  }

  let deliveredAtSec = atSec + baseDelaySec;
  if (channel.mode === "DELAY") {
    deliveredAtSec += channel.extraDelaySec;
  } else if (channel.mode === "BURST" && channel.untilSec !== null) {
    deliveredAtSec = channel.untilSec;
  }
  if (!Number.isSafeInteger(deliveredAtSec) || deliveredAtSec < atSec) {
    throw new RangeError(
      "Report delivery must be a current or future integer second",
    );
  }
  return {
    ...report,
    status: "IN_TRANSIT",
    deliveredAtSec,
    droppedReason: null,
    healthAtIssue: channel.healthMultiplier,
  };
}
