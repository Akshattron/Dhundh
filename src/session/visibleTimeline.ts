import type { TraineeView } from "../engine/view";

export function visibleTimeline(view: TraineeView, limit = 8) {
  return [
    ...view.reports.map((report) => ({
      atSec: report.deliveredAtSec,
      label: `${report.channel} report ${report.id} delivered`,
    })),
    ...view.verifications.map((verification) => ({
      atSec: verification.requestedAtSec,
      label: `Verification requested: ${verification.assetId}`,
    })),
    ...view.estimates.map((estimate) => ({
      atSec: estimate.atSec,
      label: `Estimate recorded: ${view.hypotheses.find((item) => item.id === estimate.hypothesisId)?.label ?? estimate.hypothesisId}`,
    })),
    ...view.decisions.map((decision) => ({
      atSec: decision.atSec,
      label: `Decision committed: ${decision.actionId}`,
    })),
  ]
    .sort((left, right) => left.atSec - right.atSec)
    .slice(-limit)
    .reverse();
}
