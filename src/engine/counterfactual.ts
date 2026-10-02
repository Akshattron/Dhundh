import { computeBelief } from "./belief";
import {
  evaluateDecision,
  expectedUtilities,
  realizedUtility,
} from "./decision";
import { applyIntent, replayLog } from "./simulation";
import { scoreDecision, type VerificationAssessment } from "./scoring";
import { netVoi } from "./voi";
import type {
  ActionId,
  AssetDef,
  DecisionPointDef,
  DecisionRecord,
  HypothesisId,
  Intent,
  ReportRuntime,
  RoleId,
  ScenarioDef,
  SessionLog,
  SimState,
} from "./types";
import type { AarDecision } from "./aar";

export const COUNTERFACTUAL_LABEL =
  "COUNTERFACTUAL — simulated, not what happened" as const;

export interface CounterfactualPolicyAssumption {
  kind: "MODEL_ESTIMATE";
  role: RoleId;
  hypothesisId: HypothesisId;
  atSec: number;
  p: number;
  label: "COUNTERFACTUAL POLICY ASSUMPTION - not a trainee statement";
}

export type Counterfactual =
  | {
      id: "CF_ACTIONS";
      policyAssumptions: CounterfactualPolicyAssumption[];
      alternatives: {
        actionId: ActionId;
        expectedUtility: number;
        realizedUtility: number;
        consequenceHeadline: string;
      }[];
    }
  | {
      id: "CF_VERIFY_EARLIER";
      policyAssumptions: CounterfactualPolicyAssumption[];
      assetId: string;
      requestedAtSec: number;
      resultAtSec: number;
      result: AarDecision;
    }
  | {
      id: "CF_DECIDE_EARLIER";
      policyAssumptions: CounterfactualPolicyAssumption[];
      atSec: number;
      result: AarDecision;
    }
  | {
      id: "CF_NO_LOSS";
      policyAssumptions: CounterfactualPolicyAssumption[];
      belief: Record<HypothesisId, number>;
      bestActionId: ActionId;
      evpi: number;
      choiceChanged: boolean;
    };

const policyLabel =
  "COUNTERFACTUAL POLICY ASSUMPTION - not a trainee statement" as const;

function makeLog(log: SessionLog, intents: Intent[]): SessionLog {
  return { ...log, intents };
}

function replayAt(
  scenario: ScenarioDef,
  log: SessionLog,
  atSec: number,
  intentLimit = log.intents.length,
): SimState {
  const intents = log.intents
    .slice(0, intentLimit)
    .filter((intent) => intent.t <= atSec);
  return replayLog(scenario, makeLog(log, intents), { upToSec: atSec });
}

function cutIndex(log: SessionLog, decision: DecisionRecord): number {
  const index = log.intents.findIndex(
    (intent) =>
      intent.type === "DECIDE" &&
      intent.t === decision.atSec &&
      intent.actionId === decision.actionId &&
      intent.role === decision.role,
  );
  return index < 0 ? log.intents.length : index;
}

function visibleChannels(scenario: ScenarioDef, role: RoleId) {
  return scenario.channels
    .filter((channel) => channel.visibleTo.includes(role))
    .map((channel) => channel.id);
}

function beliefsAt(
  scenario: ScenarioDef,
  log: SessionLog,
  atSec: number,
  role: RoleId,
  intentLimit = log.intents.length,
  extraReports?: ReportRuntime[],
) {
  const state = replayAt(scenario, log, atSec, intentLimit);
  return computeBelief(scenario, state, atSec, {
    visibleChannels: visibleChannels(scenario, role),
    ...(extraReports ? { extraReports } : {}),
  });
}

function consequenceHeadline(
  dp: DecisionPointDef,
  actionId: ActionId,
  truth: Record<string, boolean>,
): string {
  const action = dp.actions.find((item) => item.id === actionId);
  const consequence = action?.consequences.find((item) =>
    Object.entries(item.when).every(([id, value]) => truth[id] === value),
  );
  if (!consequence)
    throw new Error(`No consequence covers counterfactual action ${actionId}`);
  return consequence.headline;
}

function hypotheticalReports(
  scenario: ScenarioDef,
  completed: SimState,
  decision: DecisionRecord,
): ReportRuntime[] {
  const visible = new Set(visibleChannels(scenario, decision.role));
  return Object.values(completed.reports)
    .filter(
      (report) =>
        report.def.issuedAtSec <= decision.atSec &&
        visible.has(report.def.channel) &&
        (report.status === "DROPPED" ||
          (report.deliveredAtSec !== null &&
            report.deliveredAtSec > decision.atSec)),
    )
    .map((report) => ({
      ...report,
      status: "DELIVERED",
      deliveredAtSec: report.def.issuedAtSec,
      droppedReason: null,
    }));
}

function modelEstimateIntents(
  scenario: ScenarioDef,
  dp: DecisionPointDef,
  role: RoleId,
  atSec: number,
  belief: ReturnType<typeof computeBelief>,
  alreadyEstimated: Set<string>,
): { intents: Intent[]; assumptions: CounterfactualPolicyAssumption[] } {
  const intents: Intent[] = [];
  const assumptions: CounterfactualPolicyAssumption[] = [];
  for (const hypothesisId of dp.requiredEstimates) {
    if (alreadyEstimated.has(hypothesisId)) continue;
    const p = belief.perHypothesis[hypothesisId]?.p;
    if (p === undefined)
      throw new Error(`Missing model estimate for ${hypothesisId}`);
    intents.push({ type: "SET_ESTIMATE", t: atSec, role, hypothesisId, p });
    assumptions.push({
      kind: "MODEL_ESTIMATE",
      role,
      hypothesisId,
      atSec,
      p,
      label: policyLabel,
    });
  }
  return { intents, assumptions };
}

function candidateAssessments(
  scenario: ScenarioDef,
  dp: DecisionPointDef,
  belief: ReturnType<typeof computeBelief>,
  atSec: number,
): Map<string, VerificationAssessment> {
  const result = new Map<string, VerificationAssessment>();
  for (const assetId of dp.assets) {
    const asset = scenario.assets.find((item) => item.id === assetId);
    if (!asset) throw new Error(`Unknown verification asset ${assetId}`);
    const candidateAt = Math.min(atSec, dp.closeSec - asset.delaySec - 1);
    if (candidateAt < dp.openSec) continue;
    const value = netVoi(dp, belief, candidateAt, asset, scenario.hypotheses);
    const evaluation = evaluateDecision(
      dp,
      belief,
      candidateAt,
      scenario.hypotheses,
      dp.timeoutActionId,
      scenario.model,
    );
    result.set(asset.id, {
      assetId: asset.id,
      atSec: candidateAt,
      evsi: value.evsi,
      net: value.net,
      evpi: evaluation.evpi,
      belief: Object.fromEntries(
        Object.entries(belief.perHypothesis).map(([id, item]) => [id, item.p]),
      ),
    });
  }
  return result;
}

function summarizeBranch(
  scenario: ScenarioDef,
  log: SessionLog,
  decision: DecisionRecord,
  dp: DecisionPointDef,
): AarDecision {
  const index = cutIndex(log, decision);
  const stateAtCut = replayAt(scenario, log, decision.atSec, index);
  const belief = computeBelief(scenario, stateAtCut, decision.atSec, {
    visibleChannels: visibleChannels(scenario, decision.role),
  });
  const requestAssessments = new Map<string, VerificationAssessment>();
  for (const verification of stateAtCut.verifications) {
    const asset = scenario.assets.find(
      (candidate) => candidate.id === verification.assetId,
    );
    if (!asset)
      throw new Error(`Unknown verification asset ${verification.assetId}`);
    const requestIntentIndex = log.intents.findIndex(
      (intent) =>
        intent.type === "VERIFY" &&
        intent.t === verification.requestedAtSec &&
        intent.assetId === verification.assetId,
    );
    const requestState = replayAt(
      scenario,
      log,
      verification.requestedAtSec,
      requestIntentIndex >= 0 ? requestIntentIndex : index,
    );
    const requestBelief = computeBelief(
      scenario,
      requestState,
      verification.requestedAtSec,
      { visibleChannels: visibleChannels(scenario, decision.role) },
    );
    const value = netVoi(
      dp,
      requestBelief,
      verification.requestedAtSec,
      asset,
      scenario.hypotheses,
    );
    const evaluation = evaluateDecision(
      dp,
      requestBelief,
      verification.requestedAtSec,
      scenario.hypotheses,
      dp.timeoutActionId,
      scenario.model,
    );
    requestAssessments.set(verification.id, {
      assetId: asset.id,
      atSec: verification.requestedAtSec,
      evsi: value.evsi,
      net: value.net,
      evpi: evaluation.evpi,
      belief: Object.fromEntries(
        Object.entries(requestBelief.perHypothesis).map(([id, item]) => [
          id,
          item.p,
        ]),
      ),
    });
  }
  const candidates = candidateAssessments(scenario, dp, belief, decision.atSec);
  const scores = scoreDecision({
    scenario,
    dp,
    belief,
    stateAtCut,
    decision,
    decisionTruth: stateAtCut.truth,
    requestAssessments,
    candidateAssessments: candidates,
  });
  const action = dp.actions.find((item) => item.id === decision.actionId);
  if (!action)
    throw new Error(`Unknown counterfactual action ${decision.actionId}`);
  const evaluation = evaluateDecision(
    dp,
    belief,
    decision.atSec,
    scenario.hypotheses,
    decision.actionId,
    scenario.model,
  );
  return {
    decision: {
      decisionPointId: dp.id,
      role: decision.role,
      atSec: decision.atSec,
      timedOut: decision.timedOut,
      truthAtDecision: { ...stateAtCut.truth },
      actionId: decision.actionId,
      actionLabel: action.label,
      belief: Object.fromEntries(
        Object.entries(belief.perHypothesis).map(([id, value]) => [
          id,
          value.p,
        ]),
      ),
      bestActionId: evaluation.bestActionId,
      isTie: evaluation.isTie,
      expectedUtilities: evaluation.eu,
      regret: evaluation.regret,
      maxRegret: evaluation.maxRegret,
      evpi: evaluation.evpi,
      posture: evaluation.posture,
      estimates: {
        first:
          decision.estimates[
            scenario.hypotheses.find((item) => item.primary)?.id ?? ""
          ] ?? null,
        final:
          decision.estimates[
            scenario.hypotheses.find((item) => item.primary)?.id ?? ""
          ] ?? null,
        consultedAid: decision.consultedAid,
      },
      rationale: decision.rationale,
    },
    scores,
  };
}

function executableBranch(
  scenario: ScenarioDef,
  baseLog: SessionLog,
  dp: DecisionPointDef,
  role: RoleId,
  atSec: number,
  actionId: ActionId,
  precedingIntents: Intent[],
): {
  result: AarDecision;
  assumptions: CounterfactualPolicyAssumption[];
} | null {
  const prefixLog = makeLog(baseLog, precedingIntents);
  let branchState = replayLog(scenario, prefixLog, { upToSec: atSec });
  let branchIntents = [...precedingIntents];
  let branchBelief = computeBelief(scenario, branchState, atSec, {
    visibleChannels: visibleChannels(scenario, role),
  });
  const alreadyEstimated = new Set(
    branchState.estimates
      .filter((estimate) => estimate.role === role)
      .map((estimate) => estimate.hypothesisId),
  );
  const policy = modelEstimateIntents(
    scenario,
    dp,
    role,
    atSec,
    branchBelief,
    alreadyEstimated,
  );
  for (const estimate of policy.intents) {
    const applied = applyIntent(branchState, scenario, estimate);
    if (!applied.result.ok) return null;
    branchState = applied.state;
    branchIntents.push(estimate);
  }
  const intent: Intent = {
    type: "DECIDE",
    t: atSec,
    role,
    actionId,
    rationale: null,
  };
  const applied = applyIntent(branchState, scenario, intent);
  if (!applied.result.ok) return null;
  branchState = applied.state;
  branchIntents.push(intent);
  const branchLog = makeLog(baseLog, branchIntents);
  const completed = replayLog(scenario, branchLog);
  const decision = completed.decisions.at(-1);
  if (!decision) return null;
  branchBelief = computeBelief(
    scenario,
    replayAt(scenario, branchLog, atSec, branchIntents.length - 1),
    atSec,
    { visibleChannels: visibleChannels(scenario, role) },
  );
  const actual = summarizeBranch(scenario, branchLog, decision, dp);
  return { result: actual, assumptions: policy.assumptions };
}

export function buildCounterfactuals(
  scenario: ScenarioDef,
  log: SessionLog,
  completed: SimState,
  decision: DecisionRecord,
): Counterfactual[] {
  const dp = scenario.decisionPoints.find(
    (candidate) => candidate.id === decision.decisionPointId,
  );
  if (!dp) throw new Error("Counterfactual decision point does not exist");
  const index = cutIndex(log, decision);
  const decisionState = replayAt(scenario, log, decision.atSec, index);
  const channels = visibleChannels(scenario, decision.role);
  const belief = computeBelief(scenario, decisionState, decision.atSec, {
    visibleChannels: channels,
  });
  const expected = expectedUtilities(
    dp,
    belief,
    decision.atSec,
    scenario.hypotheses,
  );
  const costs = decisionState.verifications
    .filter((verification) => verification.decisionPointId === dp.id)
    .reduce((total, verification) => total + verification.costUnits, 0);
  const alternatives = dp.actions.map((action) => ({
    actionId: action.id,
    expectedUtility: expected[action.id] ?? 0,
    realizedUtility:
      realizedUtility(dp, decisionState.truth, action.id, decision.atSec) -
      costs,
    consequenceHeadline: consequenceHeadline(
      dp,
      action.id,
      decisionState.truth,
    ),
  }));
  const results: Counterfactual[] = [
    { id: "CF_ACTIONS", policyAssumptions: [], alternatives },
  ];

  const extras = hypotheticalReports(scenario, completed, decision);
  if (extras.length > 0) {
    const noLossBelief = computeBelief(
      scenario,
      decisionState,
      decision.atSec,
      {
        visibleChannels: channels,
        extraReports: extras,
      },
    );
    const noLossEvaluation = evaluateDecision(
      dp,
      noLossBelief,
      decision.atSec,
      scenario.hypotheses,
      decision.actionId,
      scenario.model,
    );
    results.push({
      id: "CF_NO_LOSS",
      policyAssumptions: [],
      belief: Object.fromEntries(
        Object.entries(noLossBelief.perHypothesis).map(([id, item]) => [
          id,
          item.p,
        ]),
      ),
      bestActionId: noLossEvaluation.bestActionId,
      evpi: noLossEvaluation.evpi,
      choiceChanged: noLossEvaluation.bestActionId !== decision.actionId,
    });
  }

  if (dp.assets.length > 0) {
    for (
      let candidateAt = Math.ceil(dp.openSec / 60) * 60;
      candidateAt < decision.atSec && candidateAt < dp.closeSec;
      candidateAt += 60
    ) {
      const prefix = log.intents.filter((intent) => intent.t < candidateAt);
      const candidateLog = makeLog(log, prefix);
      const candidateState = replayLog(scenario, candidateLog, {
        upToSec: candidateAt,
      });
      const candidateBelief = computeBelief(
        scenario,
        candidateState,
        candidateAt,
        { visibleChannels: channels },
      );
      let selected: { asset: AssetDef; net: number } | undefined;
      for (const assetId of dp.assets) {
        const asset = scenario.assets.find((item) => item.id === assetId);
        if (!asset) throw new Error(`Unknown verification asset ${assetId}`);
        if (candidateAt + asset.delaySec >= dp.closeSec) continue;
        const value = netVoi(
          dp,
          candidateBelief,
          candidateAt,
          asset,
          scenario.hypotheses,
        );
        if (!selected || value.net > selected.net)
          selected = { asset, net: value.net };
      }
      if (!selected || selected.net < 0) continue;
      const alreadyVerified =
        candidateState.verifications.some(
          (verification) =>
            verification.role === decision.role &&
            verification.decisionPointId === dp.id &&
            verification.requestedAtSec <= candidateAt,
        ) ||
        log.intents.some(
          (intent) =>
            intent.type === "VERIFY" &&
            intent.role === decision.role &&
            intent.t <= candidateAt,
        );
      if (alreadyVerified) break;
      const verifyIntent: Intent = {
        type: "VERIFY",
        t: candidateAt,
        role: decision.role,
        assetId: selected.asset.id,
      };
      const applied = applyIntent(candidateState, scenario, verifyIntent);
      if (!applied.result.ok) continue;
      const resultAtSec = candidateAt + selected.asset.delaySec;
      const resultState = replayLog(
        scenario,
        makeLog(candidateLog, [...prefix, verifyIntent]),
        { upToSec: resultAtSec },
      );
      const resultBelief = computeBelief(scenario, resultState, resultAtSec, {
        visibleChannels: channels,
      });
      const utilities = expectedUtilities(
        dp,
        resultBelief,
        resultAtSec,
        scenario.hypotheses,
      );
      const bestValue = Math.max(...Object.values(utilities));
      const bestAction = dp.actions.find(
        (action) => utilities[action.id] === bestValue,
      );
      if (!bestAction) throw new Error("No counterfactual action is available");
      const branch = executableBranch(
        scenario,
        log,
        dp,
        decision.role,
        resultAtSec,
        bestAction.id,
        [...prefix, verifyIntent],
      );
      if (branch) {
        results.push({
          id: "CF_VERIFY_EARLIER",
          policyAssumptions: branch.assumptions,
          assetId: selected.asset.id,
          requestedAtSec: candidateAt,
          resultAtSec,
          result: branch.result,
        });
      }
      break;
    }
  }

  const earlierAt = dp.openSec;
  if (earlierAt < decision.atSec) {
    const prefix = log.intents.filter((intent) => intent.t < earlierAt);
    const utilities = expectedUtilities(
      dp,
      beliefsAt(scenario, log, earlierAt, decision.role, prefix.length),
      earlierAt,
      scenario.hypotheses,
    );
    const selected = dp.actions.find(
      (action) =>
        utilities[action.id] === Math.max(...Object.values(utilities)),
    );
    if (selected) {
      const branch = executableBranch(
        scenario,
        log,
        dp,
        decision.role,
        earlierAt,
        selected.id,
        prefix,
      );
      if (branch) {
        results.push({
          id: "CF_DECIDE_EARLIER",
          policyAssumptions: branch.assumptions,
          atSec: earlierAt,
          result: branch.result,
        });
      }
    }
  }

  return results;
}
