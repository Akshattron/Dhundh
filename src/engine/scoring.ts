import { brier, calibrationAlignment } from "./calibration";
import { evaluateDecision, realizedUtility } from "./decision";
import type {
  BeliefSnapshot,
  DecisionPointDef,
  DecisionRecord,
  Quadrant,
  ScenarioDef,
  SimState,
  VerificationRecord,
} from "./types";

export interface VerificationAssessment {
  assetId: string;
  atSec: number;
  evsi: number;
  net: number;
  evpi: number;
  belief: Record<string, number>;
}

export interface ScoreComponents {
  dq: number;
  outcome: number;
  infoUtil: number;
  timeliness: number;
  verifyEff: number;
  calibration: number;
  trainingScore: number;
  quadrant: Quadrant;
  realizedUtility: number;
  brierUser: number | null;
  brierSystem: number;
  verificationEfficiency: {
    selectedAssetId: string | null;
    evaluationAtSec: number;
    netVoi: number;
    evpi: number;
    usedVerificationId: string | null;
    belief: Record<string, number>;
  };
}

function clipped(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function outcomeScore(
  utility: number,
  scale: ScenarioDef["outcomeScale"],
): number {
  if (
    !Number.isFinite(utility) ||
    !Number.isFinite(scale.min) ||
    !Number.isFinite(scale.max) ||
    scale.min >= scale.max
  ) {
    throw new RangeError("Outcome inputs are invalid");
  }
  return clipped((utility - scale.min) / (scale.max - scale.min));
}

export function informationUtilization(
  belief: BeliefSnapshot,
  state: SimState,
  scenario: ScenarioDef,
  decision: DecisionRecord,
): number {
  let total = 0;
  let opened = 0;
  for (const [hypothesisId, hypothesis] of Object.entries(
    belief.perHypothesis,
  )) {
    for (const contribution of hypothesis.contributions) {
      const magnitude = Math.abs(contribution.llr);
      total += magnitude;
      const inspected = Object.values(state.reports).some(
        (report) =>
          report.status === "DELIVERED" &&
          report.def.hypothesisId === hypothesisId &&
          report.def.evidenceGroup === contribution.group &&
          report.def.issuedAtSec <= decision.atSec &&
          scenario.channels.some(
            (channel) =>
              channel.id === report.def.channel &&
              channel.visibleTo.includes(decision.role),
          ) &&
          state.inspections.some(
            (inspection) =>
              inspection.reportId === report.def.id &&
              inspection.role === decision.role &&
              inspection.atSec <= decision.atSec,
          ),
      );
      if (inspected) opened += magnitude;
    }
  }
  return total === 0 ? 1 : clipped(opened / total);
}

function unionLength(intervals: Array<[number, number]>): number {
  const ordered = intervals
    .filter(([start, end]) => end > start)
    .sort(([leftStart], [rightStart]) => leftStart - rightStart);
  let total = 0;
  let active: [number, number] | null = null;
  for (const interval of ordered) {
    if (!active) {
      active = [...interval];
    } else if (interval[0] <= active[1]) {
      active[1] = Math.max(active[1], interval[1]);
    } else {
      total += active[1] - active[0];
      active = [...interval];
    }
  }
  if (active) total += active[1] - active[0];
  return total;
}

export function effectiveLatencySeconds(
  decision: DecisionRecord,
  dp: DecisionPointDef,
  verifications: VerificationRecord[],
  requestAssessments: Map<string, VerificationAssessment>,
): number {
  const intervals: Array<[number, number]> = [];
  for (const verification of verifications) {
    if (
      verification.role !== decision.role ||
      verification.decisionPointId !== dp.id
    ) {
      continue;
    }
    const assessment = requestAssessments.get(verification.id);
    if (!assessment || assessment.net < 0) continue;
    intervals.push([
      Math.max(dp.openSec, verification.requestedAtSec),
      Math.min(decision.atSec, verification.deliversAtSec),
    ]);
  }
  return decision.atSec - dp.openSec - unionLength(intervals);
}

function verificationEfficiency(
  dp: DecisionPointDef,
  decision: DecisionRecord,
  verifications: VerificationRecord[],
  requestAssessments: Map<string, VerificationAssessment>,
  candidateAssessments: Map<string, VerificationAssessment>,
): ScoreComponents["verificationEfficiency"] {
  if (dp.assets.length === 0) {
    return {
      selectedAssetId: null,
      evaluationAtSec: decision.atSec,
      netVoi: 0,
      evpi: 0,
      usedVerificationId: null,
      belief: {},
    };
  }
  const firstUsed = verifications.find(
    (record) =>
      record.role === decision.role && record.decisionPointId === dp.id,
  );
  if (firstUsed) {
    const assessment = requestAssessments.get(firstUsed.id);
    if (!assessment) {
      throw new Error(
        "Accepted verification is missing its request assessment",
      );
    }
    return {
      selectedAssetId: firstUsed.assetId,
      evaluationAtSec: assessment.atSec,
      netVoi: assessment.net,
      evpi: assessment.evpi,
      usedVerificationId: firstUsed.id,
      belief: assessment.belief,
    };
  }
  const candidates = dp.assets
    .map((assetId) => candidateAssessments.get(assetId))
    .filter((candidate): candidate is VerificationAssessment => !!candidate);
  if (candidates.length === 0) {
    return {
      selectedAssetId: null,
      evaluationAtSec: decision.atSec,
      netVoi: 0,
      evpi: 0,
      usedVerificationId: null,
      belief: {},
    };
  }
  const selected = candidates.reduce<VerificationAssessment | null>(
    (best, candidate) =>
      best === null || candidate.net > best.net ? candidate : best,
    null,
  );
  if (!selected) {
    throw new Error(
      "No legal verification candidate exists for this decision point",
    );
  }
  return {
    selectedAssetId: selected.assetId,
    evaluationAtSec: selected.atSec,
    netVoi: selected.net,
    evpi: selected.evpi,
    usedVerificationId: null,
    belief: selected.belief,
  };
}

export function scoreDecision(input: {
  scenario: ScenarioDef;
  dp: DecisionPointDef;
  belief: BeliefSnapshot;
  stateAtCut: SimState;
  decision: DecisionRecord;
  decisionTruth: Record<string, boolean>;
  requestAssessments: Map<string, VerificationAssessment>;
  candidateAssessments: Map<string, VerificationAssessment>;
}): ScoreComponents {
  const {
    scenario,
    dp,
    belief,
    stateAtCut,
    decision,
    decisionTruth,
    requestAssessments,
    candidateAssessments,
  } = input;
  const evaluation = evaluateDecision(
    dp,
    belief,
    decision.atSec,
    scenario.hypotheses,
    decision.actionId,
    scenario.model,
  );
  const acceptedVerifications = stateAtCut.verifications.filter(
    (record) => record.decisionPointId === dp.id,
  );
  const utility =
    realizedUtility(dp, decisionTruth, decision.actionId, decision.atSec) -
    acceptedVerifications.reduce((sum, record) => sum + record.costUnits, 0);
  const outcome = outcomeScore(utility, scenario.outcomeScale);
  const infoUtil = informationUtilization(
    belief,
    stateAtCut,
    scenario,
    decision,
  );
  const timeliness = decision.timedOut
    ? 0
    : clipped(
        1 -
          effectiveLatencySeconds(
            decision,
            dp,
            acceptedVerifications,
            requestAssessments,
          ) /
            (dp.closeSec - dp.openSec),
      );
  const verification = verificationEfficiency(
    dp,
    decision,
    acceptedVerifications,
    requestAssessments,
    candidateAssessments,
  );
  const verifyEff =
    verification.evpi === 0
      ? 1
      : 1 -
        Math.min(
          1,
          Math.max(
            0,
            verification.usedVerificationId
              ? -verification.netVoi
              : verification.netVoi,
          ) / verification.evpi,
        );
  const primary = scenario.hypotheses.find((hypothesis) => hypothesis.primary);
  if (!primary) throw new Error("Scenario has no primary hypothesis");
  const pSys = belief.perHypothesis[primary.id]?.p;
  if (pSys === undefined) throw new Error("Primary belief is unavailable");
  const primaryEstimate = decision.estimates[primary.id];
  const calibration =
    primaryEstimate === undefined
      ? 0
      : calibrationAlignment(primaryEstimate, pSys);
  const realizedTruth = decisionTruth[primary.id];
  if (realizedTruth === undefined) {
    throw new Error(`Decision truth is missing ${primary.id}`);
  }
  const sound = evaluation.dq >= 0.8;
  const goodOutcome = outcome >= 0.6;
  const quadrant: Quadrant = sound
    ? goodOutcome
      ? "SOUND_SUCCESS"
      : "SOUND_UNLUCKY"
    : goodOutcome
      ? "LUCKY"
      : "POOR";
  const weights = scenario.scoreWeights;
  const trainingScore =
    100 *
    (weights.decisionQuality * evaluation.dq +
      weights.informationUtilization * infoUtil +
      weights.outcome * outcome +
      weights.timeliness * timeliness +
      weights.verificationEfficiency * verifyEff +
      weights.calibration * calibration);
  return {
    dq: evaluation.dq,
    outcome,
    infoUtil,
    timeliness,
    verifyEff,
    calibration,
    trainingScore,
    quadrant,
    realizedUtility: utility,
    brierUser:
      primaryEstimate === undefined
        ? null
        : brier(primaryEstimate, realizedTruth),
    brierSystem: brier(pSys, realizedTruth),
    verificationEfficiency: verification,
  };
}
