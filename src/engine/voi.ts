import { expectedUtilities } from "./decision";
import type {
  AssetDef,
  DecisionPointDef,
  HypothesisDef,
  HypothesisId,
} from "./types";
import type { BeliefSnapshot } from "./types";

function maximumExpectedUtility(values: Record<string, number>): number {
  return Math.max(...Object.values(values));
}

function posteriorBelief(
  belief: BeliefSnapshot,
  hypothesisId: HypothesisId,
  p: number,
): BeliefSnapshot {
  const current = belief.perHypothesis[hypothesisId];
  if (!current) throw new Error(`Missing belief for ${hypothesisId}`);
  return {
    ...belief,
    perHypothesis: {
      ...belief.perHypothesis,
      [hypothesisId]: {
        ...current,
        p,
      },
    },
  };
}

export function evsi(
  dp: DecisionPointDef,
  belief: BeliefSnapshot,
  tSec: number,
  asset: AssetDef,
  hypotheses: HypothesisDef[],
): number {
  const current = belief.perHypothesis[asset.hypothesisId];
  if (!current) throw new Error(`Missing belief for ${asset.hypothesisId}`);
  const p = current.p;
  const rho = asset.rho;
  const supports = p * rho + (1 - p) * (1 - rho);
  const contradicts = p * (1 - rho) + (1 - p) * rho;
  const baseline = maximumExpectedUtility(
    expectedUtilities(dp, belief, tSec, hypotheses),
  );
  let informedValue = 0;
  if (supports > 0) {
    const posterior = (p * rho) / supports;
    informedValue +=
      supports *
      maximumExpectedUtility(
        expectedUtilities(
          dp,
          posteriorBelief(belief, asset.hypothesisId, posterior),
          tSec,
          hypotheses,
        ),
      );
  }
  if (contradicts > 0) {
    const posterior = (p * (1 - rho)) / contradicts;
    informedValue +=
      contradicts *
      maximumExpectedUtility(
        expectedUtilities(
          dp,
          posteriorBelief(belief, asset.hypothesisId, posterior),
          tSec,
          hypotheses,
        ),
      );
  }
  return Math.max(0, informedValue - baseline);
}

export function netVoi(
  dp: DecisionPointDef,
  belief: BeliefSnapshot,
  tSec: number,
  asset: AssetDef,
  hypotheses: HypothesisDef[],
): {
  evsi: number;
  timeCost: number;
  assetCost: number;
  net: number;
  feasible: boolean;
} {
  const informationValue = evsi(dp, belief, tSec, asset, hypotheses);
  const timeCost = (dp.delayCostPerMin * asset.delaySec) / 60;
  const assetCost = asset.costUnits;
  return {
    evsi: informationValue,
    timeCost,
    assetCost,
    net: informationValue - timeCost - assetCost,
    feasible: tSec >= dp.openSec && tSec + asset.delaySec < dp.closeSec,
  };
}
