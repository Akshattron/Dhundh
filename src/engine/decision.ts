import { enumerateStates } from "./scenarioLoader";
import type {
  ActionId,
  DecisionPointDef,
  HypothesisDef,
  HypothesisId,
  ModelParams,
  Posture,
} from "./types";
import type { BeliefSnapshot } from "./types";

type TruthState = Record<HypothesisId, boolean>;

function stateProbability(
  state: TruthState,
  belief: BeliefSnapshot,
  hypotheses: HypothesisDef[],
): number {
  return hypotheses.reduce((probability, hypothesis) => {
    const p = belief.perHypothesis[hypothesis.id]?.p;
    if (p === undefined) throw new Error(`Missing belief for ${hypothesis.id}`);
    return probability * (state[hypothesis.id] ? p : 1 - p);
  }, 1);
}

function matchingUtility(
  dp: DecisionPointDef,
  actionId: ActionId,
  truth: TruthState,
): number {
  const action = dp.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error(`Unknown decision action "${actionId}"`);
  const rule = action.utility.find((candidate) =>
    Object.entries(candidate.when).every(
      ([hypothesis, value]) => truth[hypothesis] === value,
    ),
  );
  if (!rule) throw new Error(`No utility rule covers action "${actionId}"`);
  return rule.value;
}

function utilityAt(
  dp: DecisionPointDef,
  actionId: ActionId,
  truth: TruthState,
  tSec: number,
): number {
  const action = dp.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error(`Unknown decision action "${actionId}"`);
  const delayCost = action.delayCostApplies
    ? dp.delayCostPerMin * Math.max(0, (tSec - dp.departureSec) / 60)
    : 0;
  return matchingUtility(dp, actionId, truth) - delayCost;
}

function bestNumericalValue(values: Record<ActionId, number>): number {
  return Math.max(...Object.values(values));
}

export function expectedUtilities(
  dp: DecisionPointDef,
  belief: BeliefSnapshot,
  tSec: number,
  hypotheses: HypothesisDef[],
): Record<ActionId, number> {
  const states = enumerateStates(hypotheses);
  return Object.fromEntries(
    dp.actions.map((action) => [
      action.id,
      states.reduce(
        (expected, truth) =>
          expected +
          stateProbability(truth, belief, hypotheses) *
            utilityAt(dp, action.id, truth, tSec),
        0,
      ),
    ]),
  );
}

export function evaluateDecision(
  dp: DecisionPointDef,
  belief: BeliefSnapshot,
  tSec: number,
  hypotheses: HypothesisDef[],
  chosen: ActionId,
  model: ModelParams,
): {
  eu: Record<ActionId, number>;
  bestActionId: ActionId;
  isTie: boolean;
  regret: number;
  maxRegret: number;
  dq: number;
  posture: Posture;
  evpi: number;
} {
  if (!Number.isFinite(model.tieEpsilon) || model.tieEpsilon < 0) {
    throw new RangeError("Tie epsilon must be finite and nonnegative");
  }
  if (!dp.actions.some((action) => action.id === chosen)) {
    throw new Error(`Unknown decision action "${chosen}"`);
  }
  const eu = expectedUtilities(dp, belief, tSec, hypotheses);
  const values = dp.actions.map(
    (action) => eu[action.id] ?? Number.NEGATIVE_INFINITY,
  );
  const numericalMaximum = Math.max(...values);
  const sorted = [...values].sort((left, right) => right - left);
  const isTie =
    sorted.length > 1 && (sorted[0] ?? 0) - (sorted[1] ?? 0) < model.tieEpsilon;
  const displayedWinner = dp.actions.find(
    (action) =>
      numericalMaximum - (eu[action.id] ?? Number.NEGATIVE_INFINITY) <
      model.tieEpsilon,
  );
  if (!displayedWinner) throw new Error("No best action could be selected");
  const minimum = Math.min(...values);
  const regret = numericalMaximum - (eu[chosen] ?? numericalMaximum);
  const maxRegret = numericalMaximum - minimum;
  const dq =
    maxRegret > 0 ? Math.max(0, Math.min(1, 1 - regret / maxRegret)) : 1;
  const cautious = chosen === dp.timeoutActionId;
  const posture: Posture =
    regret > model.tieEpsilon && chosen !== displayedWinner.id
      ? cautious
        ? "OVER_CAUTIOUS"
        : "OVER_COMMITTED"
      : "BALANCED";
  const states = enumerateStates(hypotheses);
  const expectedPerfectUtility = states.reduce((total, truth) => {
    const bestInState = Math.max(
      ...dp.actions.map((action) => utilityAt(dp, action.id, truth, tSec)),
    );
    return total + stateProbability(truth, belief, hypotheses) * bestInState;
  }, 0);
  const evpi = Math.max(0, expectedPerfectUtility - numericalMaximum);
  return {
    eu,
    bestActionId: displayedWinner.id,
    isTie,
    regret,
    maxRegret,
    dq,
    posture,
    evpi,
  };
}

export function realizedUtility(
  dp: DecisionPointDef,
  truth: Record<HypothesisId, boolean>,
  actionId: ActionId,
  tSec: number,
): number {
  return utilityAt(dp, actionId, truth, tSec);
}
