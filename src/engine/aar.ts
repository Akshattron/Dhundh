import { computeBelief } from "./belief";
import { buildCounterfactuals, type Counterfactual } from "./counterfactual";
import { buildCoachNotes } from "./coach";
import type { AarCoachNote } from "./coach";
import { evaluateDecision } from "./decision";
import { PROFILES, type DifficultyProfile } from "./difficulty";
import { readEvent } from "./events";
import { replayLog } from "./simulation";
import { buildFrames } from "./replay";
import { netVoi } from "./voi";
import { scoreDecision } from "./scoring";
import type { VerificationAssessment } from "./scoring";
import { projectTraineeView } from "./view";
import { projectReferenceModel } from "./view";
import type { ProjectedReport, ReferenceModelView } from "./view";
import type {
  ActionId,
  DecisionPointDef,
  DecisionRecord,
  HypothesisId,
  Quadrant,
  ReportId,
  RoleId,
  ScenarioDef,
  SessionLog,
  SimState,
} from "./types";

const DATA_PROVENANCE =
  "SYNTHETIC SCENARIO — fictional entities; reliabilities and utilities are authoring assumptions" as const;

export interface Aar {
  schemaVersion: 1;
  dataProvenance: typeof DATA_PROVENANCE;
  scenario: {
    id: string;
    version: number;
    title: string;
    hash: string;
    seed: number;
    difficultyLevel: DifficultyProfile["level"];
    difficultyProfile: DifficultyProfile;
  };
  referenceModel: ReferenceModelView;
  participants: Array<{ role: RoleId }>;
  header: {
    completedAtIso: string | null;
    decisionAtSec: number;
    decisionLatencySec: number;
    timedOut: boolean;
  };
  decision: {
    decisionPointId: string;
    role: RoleId;
    atSec: number;
    timedOut: boolean;
    truthAtDecision: Record<HypothesisId, boolean>;
    actionId: ActionId;
    actionLabel: string;
    belief: Record<HypothesisId, number>;
    bestActionId: ActionId;
    isTie: boolean;
    expectedUtilities: Record<ActionId, number>;
    regret: number;
    maxRegret: number;
    evpi: number;
    posture: string;
    estimates: {
      first: number | null;
      final: number | null;
      consultedAid: boolean;
    };
    rationale: DecisionRecord["rationale"];
  };
  scores: {
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
  };
  decisions: AarDecision[];
  truth: Record<HypothesisId, boolean>;
  consequence: { headline: string; narrative: string };
  timeline: Array<{
    atSec: number;
    lane: string;
    kind: string;
    summary: string;
    reportId?: string;
    revealedToTrainee: boolean;
  }>;
  frames: ReturnType<typeof buildFrames>;
  information: {
    delivered: ProjectedReport[];
    opened: string[];
    notOpened: Array<{ reportId: string; llr: number }>;
    waterfall: Array<{
      id: HypothesisId;
      label: string;
      priorLogOdds: number;
      currentLogOdds: number;
      contributions: Array<{
        reportId: string;
        group: string;
        channel: string;
        claim: string;
        gradeLabel: "A" | "B" | "C" | "D";
        ageSec: number;
        effectiveAccuracy: number;
        llr: number;
        inspected: boolean;
      }>;
    }>;
    dropped: Array<{
      reportId: string;
      issuedAtSec: number;
      claim: string;
      whatIfBeliefAtDecision: Record<HypothesisId, number> | null;
    }>;
    lateOrAfterDecision: Array<{
      reportId: string;
      issuedAtSec: number;
      deliveredAtSec: number | null;
      claim: string;
      whatIfBeliefAtDecision: Record<HypothesisId, number> | null;
    }>;
    contradictions: Array<{
      atSec: number;
      hypothesisId: string;
      index: number;
      positiveReportIds: string[];
      negativeReportIds: string[];
    }>;
  };
  verification: null | {
    used: boolean;
    assetId: string | null;
    requestedAtSec?: number;
    deliveredAtSec?: number;
    netVoiAtEval: number;
    evsiAtEval: number;
    evpiAtEval: number;
    evalAtSec: number;
    beliefAtEval: Record<HypothesisId, number>;
    verdict:
      | "WORTH_IT_USED"
      | "WORTH_IT_SKIPPED"
      | "NOT_WORTH_IT_SKIPPED"
      | "NOT_WORTH_IT_USED"
      | "TOO_LATE_OR_UNAVAILABLE";
  };
  counterfactuals: Counterfactual[];
  coachNotes: AarCoachNote[];
  limitations: string[];
  team?: {
    participants: Array<{
      role: Exclude<RoleId, "SOLO">;
      name: string;
      openedReportIds: string[];
      estimates: Array<{
        hypothesisId: HypothesisId;
        p: number;
        atSec: number;
      }>;
      decisions: Array<{
        decisionPointId: string;
        actionId: ActionId;
        atSec: number;
        timedOut: boolean;
      }>;
      verificationCount: number;
      aidRevealedAtSec: number | null;
    }>;
    relays: Array<{
      fromRole: "ANALYST";
      reportId: ReportId;
      relayReportId: ReportId;
      atSec: number;
      deliveredAtSec: number;
      note?: string;
    }>;
    advice: Array<{
      role: "ANALYST";
      atSec: number;
      actionId: ActionId;
      note?: string;
    }>;
  };
}

export interface AarDecision {
  decision: Aar["decision"];
  scores: Aar["scores"];
}

function makeLog(log: SessionLog, intents: SessionLog["intents"]): SessionLog {
  return { ...log, intents };
}

function replayAt(
  scenario: ScenarioDef,
  log: SessionLog,
  horizon: number,
  intentLimit = log.intents.length,
): SimState {
  const intents = log.intents
    .slice(0, intentLimit)
    .filter((intent) => intent.t <= horizon);
  return replayLog(scenario, makeLog(log, intents), { upToSec: horizon });
}

function actionFor(dp: DecisionPointDef, actionId: string) {
  const action = dp.actions.find((candidate) => candidate.id === actionId);
  if (!action)
    throw new Error(`AAR decision references unknown action ${actionId}`);
  return action;
}

function decisionIntentIndex(
  log: SessionLog,
  decision: DecisionRecord,
): number | undefined {
  const index = log.intents.findIndex(
    (intent) =>
      intent.type === "DECIDE" &&
      intent.t === decision.atSec &&
      intent.actionId === decision.actionId &&
      intent.role === decision.role,
  );
  return index >= 0 ? index : undefined;
}

function requestAssessmentsFor(
  scenario: ScenarioDef,
  log: SessionLog,
  decision: DecisionRecord,
  dp: DecisionPointDef,
  intentLimit: number,
): Map<string, VerificationAssessment> {
  const verifications = log.intents
    .slice(0, intentLimit)
    .filter(
      (intent) => intent.type === "VERIFY" && intent.role === decision.role,
    );
  const decisionCut = replayAt(scenario, log, decision.atSec, intentLimit);
  const assessments = new Map<string, VerificationAssessment>();
  for (const record of decisionCut.verifications) {
    if (record.decisionPointId !== dp.id || record.role !== decision.role)
      continue;
    const asset = scenario.assets.find(
      (candidate) => candidate.id === record.assetId,
    );
    if (!asset)
      throw new Error("Verification record references an unknown asset");
    const taskIntent = verifications.find(
      (intent) =>
        intent.type === "VERIFY" &&
        intent.assetId === record.assetId &&
        intent.t === record.requestedAtSec,
    );
    const taskIndex = taskIntent ? log.intents.indexOf(taskIntent) : -1;
    const requestCut = replayAt(
      scenario,
      log,
      record.requestedAtSec,
      taskIndex >= 0 ? taskIndex : intentLimit,
    );
    const belief = computeBelief(scenario, requestCut, record.requestedAtSec, {
      visibleChannels: scenario.channels
        .filter((channel) => channel.visibleTo.includes(decision.role))
        .map((channel) => channel.id),
    });
    const value = netVoi(
      dp,
      belief,
      record.requestedAtSec,
      asset,
      scenario.hypotheses,
    );
    const evaluation = evaluateDecision(
      dp,
      belief,
      record.requestedAtSec,
      scenario.hypotheses,
      dp.timeoutActionId,
      scenario.model,
    );
    assessments.set(record.id, {
      assetId: asset.id,
      atSec: record.requestedAtSec,
      evsi: value.evsi,
      net: value.net,
      evpi: evaluation.evpi,
      belief: Object.fromEntries(
        Object.entries(belief.perHypothesis).map(([id, item]) => [id, item.p]),
      ),
    });
  }
  return assessments;
}

function candidateAssessmentsFor(
  scenario: ScenarioDef,
  log: SessionLog,
  decision: DecisionRecord,
  dp: DecisionPointDef,
  intentLimit: number,
): Map<string, VerificationAssessment> {
  const assessments = new Map<string, VerificationAssessment>();
  for (const assetId of dp.assets) {
    const asset = scenario.assets.find((candidate) => candidate.id === assetId);
    if (!asset) throw new Error("Decision point references an unknown asset");
    const atSec = Math.min(decision.atSec, dp.closeSec - asset.delaySec - 1);
    if (
      atSec < dp.openSec ||
      atSec + asset.delaySec >= dp.closeSec ||
      atSec > decision.atSec
    ) {
      continue;
    }
    const cut = replayAt(scenario, log, atSec, intentLimit);
    const belief = computeBelief(scenario, cut, atSec, {
      visibleChannels: scenario.channels
        .filter((channel) => channel.visibleTo.includes(decision.role))
        .map((channel) => channel.id),
    });
    const value = netVoi(dp, belief, atSec, asset, scenario.hypotheses);
    const evaluation = evaluateDecision(
      dp,
      belief,
      atSec,
      scenario.hypotheses,
      dp.timeoutActionId,
      scenario.model,
    );
    assessments.set(asset.id, {
      assetId: asset.id,
      atSec,
      evsi: value.evsi,
      net: value.net,
      evpi: evaluation.evpi,
      belief: Object.fromEntries(
        Object.entries(belief.perHypothesis).map(([id, item]) => [id, item.p]),
      ),
    });
  }
  return assessments;
}

function timelineFor(
  scenario: ScenarioDef,
  state: SimState,
  role: RoleId,
  log: SessionLog,
): Aar["timeline"] {
  const entries: Aar["timeline"] = [];
  const visible = new Set(
    scenario.channels
      .filter((channel) => channel.visibleTo.includes(role))
      .map((channel) => channel.id),
  );
  for (const internal of state.eventTimeline.slice(
    0,
    state.processedEventCursor,
  )) {
    const event = readEvent(internal);
    if (event.kind === "REPORT_ISSUE") {
      const report = state.reports[event.reportId];
      if (report) {
        entries.push({
          atSec: event.atSec,
          lane: report.def.channel,
          kind: "REPORT_ISSUED",
          summary: report.def.claim,
          reportId: report.def.id,
          revealedToTrainee: visible.has(report.def.channel),
        });
      }
    } else if (event.kind === "REPORT_DELIVER") {
      const report = state.reports[event.reportId];
      if (report) {
        entries.push({
          atSec: event.atSec,
          lane: report.def.channel,
          kind: "REPORT_DELIVERED",
          summary: report.def.claim,
          reportId: report.def.id,
          revealedToTrainee: visible.has(report.def.channel),
        });
      }
    } else if (event.kind === "CHANNEL_DEGRADE") {
      entries.push({
        atSec: event.atSec,
        lane: event.channel,
        kind: "CHANNEL_DEGRADED",
        summary: `${event.channel} link degraded`,
        revealedToTrainee: true,
      });
    } else if (event.kind === "CHANNEL_RESTORE") {
      entries.push({
        atSec: event.atSec,
        lane: event.channel,
        kind: "CHANNEL_RESTORED",
        summary: `${event.channel} link restored`,
        revealedToTrainee: true,
      });
    } else if (event.kind === "TRUTH_CHANGE") {
      entries.push({
        atSec: event.atSec,
        lane: "SYSTEM",
        kind: "WORLD_STATE_CHANGE",
        summary: `${event.hypothesisId} changed`,
        revealedToTrainee: false,
      });
    } else if (event.kind === "CONSEQUENCE_REVEAL") {
      entries.push({
        atSec: event.atSec,
        lane: "SYSTEM",
        kind: "COMPLETE",
        summary: event.consequence.headline,
        revealedToTrainee: true,
      });
    }
  }
  for (const inspection of state.inspections) {
    if (inspection.role === role) {
      entries.push({
        atSec: inspection.atSec,
        lane: "TRAINEE",
        kind: "REPORT_OPENED",
        summary: `Opened ${inspection.reportId}`,
        reportId: inspection.reportId,
        revealedToTrainee: true,
      });
    }
  }
  for (const estimate of state.estimates) {
    if (estimate.role === role) {
      entries.push({
        atSec: estimate.atSec,
        lane: "TRAINEE",
        kind: "ESTIMATE_LOGGED",
        summary: `Estimate recorded: ${estimate.hypothesisId} ${(estimate.p * 100).toFixed(0)}%`,
        revealedToTrainee: true,
      });
    }
  }
  for (const verification of state.verifications) {
    if (verification.role === role) {
      entries.push({
        atSec: verification.requestedAtSec,
        lane: "TRAINEE",
        kind: "VERIFICATION_TASKED",
        summary: `Verification tasked: ${verification.assetId}`,
        revealedToTrainee: true,
      });
    }
  }
  for (const decision of state.decisions) {
    if (decision.role === role) {
      entries.push({
        atSec: decision.atSec,
        lane: "TRAINEE",
        kind: decision.timedOut ? "DECISION_TIMEOUT" : "DECISION_COMMITTED",
        summary: decision.timedOut
          ? "Decision window expired"
          : `Committed ${decision.actionId}`,
        revealedToTrainee: true,
      });
    }
  }
  for (const intent of log.intents) {
    if (intent.type !== "INJECT") continue;
    const preset = scenario.injectPresets.find(
      (candidate) => candidate.id === intent.presetId,
    );
    entries.push({
      atSec: intent.t,
      lane: "INSTRUCTOR",
      kind: "INJECT_PRESET",
      summary: preset
        ? `${preset.label}: ${preset.description}`
        : `Unknown inject preset ${intent.presetId}`,
      revealedToTrainee: true,
    });
  }
  return entries.sort((left, right) => left.atSec - right.atSec);
}

export function buildAar(scenario: ScenarioDef, log: SessionLog): Aar {
  const completed = replayLog(scenario, log);
  if (completed.phase !== "COMPLETE") {
    throw new Error("AAR is available only after the exercise is COMPLETE");
  }
  const last = completed.decisions.at(-1);
  if (!last) throw new Error("Completed exercise has no recorded decision");
  const aar = buildDecisionAar(scenario, log, completed, last);
  if (completed.decisions.length === 1) return aar;
  aar.decisions = completed.decisions.map((record) => {
    if (record === last) return { decision: aar.decision, scores: aar.scores };
    const entry = buildDecisionAar(scenario, log, completed, record);
    return { decision: entry.decision, scores: entry.scores };
  });
  const mean = (key: keyof Aar["scores"]) => {
    const values = aar.decisions.flatMap(({ scores }) => {
      const value = scores[key];
      return typeof value === "number" ? [value] : [];
    });
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  };
  const dq = mean("dq")!;
  const outcome = mean("outcome")!;
  aar.scores = {
    dq,
    outcome,
    infoUtil: mean("infoUtil")!,
    timeliness: mean("timeliness")!,
    verifyEff: mean("verifyEff")!,
    calibration: mean("calibration")!,
    trainingScore: mean("trainingScore")!,
    realizedUtility: mean("realizedUtility")!,
    brierUser: mean("brierUser"),
    brierSystem: mean("brierSystem")!,
    quadrant:
      dq >= 0.8
        ? outcome >= 0.6
          ? "SOUND_SUCCESS"
          : "SOUND_UNLUCKY"
        : outcome >= 0.6
          ? "LUCKY"
          : "POOR",
  };
  return aar;
}

function buildDecisionAar(
  scenario: ScenarioDef,
  log: SessionLog,
  completed: SimState,
  record: DecisionRecord,
): Aar {
  const difficultyProfile = Object.values(PROFILES).find(
    (profile) => profile.level === log.difficultyLevel,
  );
  if (!difficultyProfile) throw new Error("AAR difficulty profile is invalid");
  const dp = scenario.decisionPoints.find(
    (candidate) => candidate.id === record.decisionPointId,
  );
  if (!dp)
    throw new Error("Recorded decision point does not exist in the scenario");
  const intentIndex = decisionIntentIndex(log, record);
  const intentLimit = intentIndex ?? log.intents.length;
  const stateAtCut =
    intentIndex === undefined
      ? replayAt(scenario, log, record.atSec, intentLimit)
      : replayAt(scenario, log, record.atSec, intentIndex);
  const role = record.role;
  const visibleChannels = scenario.channels
    .filter((channel) => channel.visibleTo.includes(role))
    .map((channel) => channel.id);
  const belief = computeBelief(scenario, stateAtCut, record.atSec, {
    visibleChannels,
  });
  const requestAssessments = requestAssessmentsFor(
    scenario,
    log,
    record,
    dp,
    intentLimit,
  );
  const candidateAssessments = candidateAssessmentsFor(
    scenario,
    log,
    record,
    dp,
    intentLimit,
  );
  const score = scoreDecision({
    scenario,
    dp,
    belief,
    stateAtCut,
    decision: record,
    decisionTruth: stateAtCut.truth,
    requestAssessments,
    candidateAssessments,
  });
  const evaluation = evaluateDecision(
    dp,
    belief,
    record.atSec,
    scenario.hypotheses,
    record.actionId,
    scenario.model,
  );
  const projected = projectTraineeView(scenario, stateAtCut, role);
  const primary = scenario.hypotheses.find((hypothesis) => hypothesis.primary);
  if (!primary) throw new Error("Scenario has no primary hypothesis");
  const roleEstimates = stateAtCut.estimates.filter(
    (estimate) =>
      estimate.role === role && estimate.hypothesisId === primary.id,
  );
  const decisionView: Aar["decision"] = {
    decisionPointId: dp.id,
    role,
    atSec: record.atSec,
    timedOut: record.timedOut,
    truthAtDecision: { ...stateAtCut.truth },
    actionId: record.actionId,
    actionLabel: actionFor(dp, record.actionId).label,
    belief: Object.fromEntries(
      Object.entries(belief.perHypothesis).map(([id, value]) => [id, value.p]),
    ),
    bestActionId: evaluation.bestActionId,
    isTie: evaluation.isTie,
    expectedUtilities: evaluation.eu,
    regret: evaluation.regret,
    maxRegret: evaluation.maxRegret,
    evpi: evaluation.evpi,
    posture: evaluation.posture,
    estimates: {
      first: roleEstimates[0]?.p ?? null,
      final: roleEstimates.at(-1)?.p ?? null,
      consultedAid: record.consultedAid,
    },
    rationale: record.rationale,
  };
  const scores: Aar["scores"] = {
    dq: score.dq,
    outcome: score.outcome,
    infoUtil: score.infoUtil,
    timeliness: score.timeliness,
    verifyEff: score.verifyEff,
    calibration: score.calibration,
    trainingScore: score.trainingScore,
    quadrant: score.quadrant,
    realizedUtility: score.realizedUtility,
    brierUser: score.brierUser,
    brierSystem: score.brierSystem,
  };
  const selectedVerification = score.verificationEfficiency;
  const usedRecord = selectedVerification.usedVerificationId
    ? stateAtCut.verifications.find(
        (verification) =>
          verification.id === selectedVerification.usedVerificationId,
      )
    : undefined;
  const usedResult = usedRecord
    ? completed.reports[usedRecord.resultReportId]
    : undefined;
  const selectedNet = selectedVerification.netVoi;
  const verification: Aar["verification"] =
    selectedVerification.selectedAssetId === null
      ? dp.assets.length === 0
        ? null
        : {
            used: false,
            assetId: null,
            netVoiAtEval: 0,
            evsiAtEval: 0,
            evpiAtEval: 0,
            evalAtSec: selectedVerification.evaluationAtSec,
            beliefAtEval: {},
            verdict: "TOO_LATE_OR_UNAVAILABLE",
          }
      : {
          used: !!usedRecord,
          assetId: selectedVerification.selectedAssetId,
          ...(usedRecord
            ? {
                requestedAtSec: usedRecord.requestedAtSec,
                ...(usedResult?.deliveredAtSec !== null &&
                usedResult?.deliveredAtSec !== undefined
                  ? { deliveredAtSec: usedResult.deliveredAtSec }
                  : {}),
              }
            : {}),
          netVoiAtEval: selectedNet,
          evsiAtEval: usedRecord
            ? (requestAssessments.get(usedRecord.id)?.evsi ?? selectedNet)
            : (candidateAssessments.get(selectedVerification.selectedAssetId)
                ?.evsi ?? selectedNet),
          evpiAtEval: selectedVerification.evpi,
          evalAtSec: selectedVerification.evaluationAtSec,
          beliefAtEval: selectedVerification.belief,
          verdict: usedRecord
            ? selectedNet >= 0
              ? "WORTH_IT_USED"
              : "NOT_WORTH_IT_USED"
            : selectedNet >= 0
              ? "WORTH_IT_SKIPPED"
              : "NOT_WORTH_IT_SKIPPED",
        };
  const deliveredAtCut = projected.reports;
  const allReports = Object.values(completed.reports);
  const dropped = allReports
    .filter((report) => report.status === "DROPPED")
    .map((report) => {
      const eligible = report.def.issuedAtSec <= record.atSec;
      const whatIf = eligible
        ? computeBelief(scenario, stateAtCut, record.atSec, {
            visibleChannels,
            extraReports: [
              {
                ...report,
                status: "DELIVERED",
                deliveredAtSec: report.def.issuedAtSec,
                droppedReason: null,
              },
            ],
          })
        : null;
      return {
        reportId: report.def.id,
        issuedAtSec: report.def.issuedAtSec,
        claim: report.def.claim,
        whatIfBeliefAtDecision: whatIf
          ? Object.fromEntries(
              Object.entries(whatIf.perHypothesis).map(([id, item]) => [
                id,
                item.p,
              ]),
            )
          : null,
      };
    });
  const lateOrAfterDecision = allReports
    .filter(
      (report) =>
        report.def.issuedAtSec > record.atSec ||
        (report.status === "DELIVERED" &&
          report.deliveredAtSec !== null &&
          report.deliveredAtSec > record.atSec),
    )
    .map((report) => {
      const eligible =
        report.def.issuedAtSec <= record.atSec &&
        report.deliveredAtSec !== null &&
        report.deliveredAtSec > record.atSec;
      const whatIf = eligible
        ? computeBelief(scenario, stateAtCut, record.atSec, {
            visibleChannels,
            extraReports: [
              {
                ...report,
                status: "DELIVERED",
                deliveredAtSec: report.def.issuedAtSec,
                droppedReason: null,
              },
            ],
          })
        : null;
      return {
        reportId: report.def.id,
        issuedAtSec: report.def.issuedAtSec,
        deliveredAtSec: report.deliveredAtSec,
        claim: report.def.claim,
        whatIfBeliefAtDecision: whatIf
          ? Object.fromEntries(
              Object.entries(whatIf.perHypothesis).map(([id, item]) => [
                id,
                item.p,
              ]),
            )
          : null,
      };
    });
  const opened = projected.inspections;
  const waterfall = scenario.hypotheses.map((hypothesis) => {
    const beliefItem = belief.perHypothesis[hypothesis.id];
    const priorLogOdds = Math.log(hypothesis.prior / (1 - hypothesis.prior));
    const reportsById = new Map(
      projected.reports.map((report) => [report.id, report]),
    );
    return {
      id: hypothesis.id,
      label: hypothesis.label,
      priorLogOdds,
      currentLogOdds: beliefItem?.logOdds ?? priorLogOdds,
      contributions: (beliefItem?.contributions ?? []).flatMap(
        (contribution) => {
          const report = reportsById.get(contribution.reportId);
          if (!report) return [];
          return [
            {
              reportId: contribution.reportId,
              group: contribution.group,
              channel: contribution.channel,
              claim: report.claim,
              gradeLabel: report.gradeLabel,
              ageSec: contribution.ageSec,
              effectiveAccuracy: contribution.effectiveAccuracy,
              llr: contribution.llr,
              inspected: opened.includes(contribution.reportId),
            },
          ];
        },
      ),
    };
  });
  const notOpened = Object.values(belief.perHypothesis).flatMap((hypothesis) =>
    hypothesis.contributions
      .filter((contribution) => !opened.includes(contribution.reportId))
      .map((contribution) => ({
        reportId: contribution.reportId,
        llr: contribution.llr,
      })),
  );
  const contradictions = Object.entries(belief.perHypothesis)
    .filter(([, hypothesis]) => hypothesis.contradicted)
    .map(([hypothesisId, hypothesis]) => ({
      atSec: record.atSec,
      hypothesisId,
      index: hypothesis.contradictionIndex,
      positiveReportIds: hypothesis.contributions
        .filter((contribution) => contribution.llr > 0)
        .map((contribution) => contribution.reportId),
      negativeReportIds: hypothesis.contributions
        .filter((contribution) => contribution.llr < 0)
        .map((contribution) => contribution.reportId),
    }));
  const consequenceEvent = completed.eventTimeline
    .slice(0, completed.processedEventCursor)
    .map(readEvent)
    .reverse()
    .find((event) => event.kind === "CONSEQUENCE_REVEAL");
  if (!consequenceEvent || consequenceEvent.kind !== "CONSEQUENCE_REVEAL") {
    throw new Error("Completed exercise has no consequence reveal event");
  }
  const notes = buildCoachNotes(
    decisionView,
    scores,
    verification,
    opened,
    belief,
    scenario,
    new Map(
      Object.values(completed.reports).map((report) => [
        report.def.id,
        report.def.claim,
      ]),
    ),
    usedResult?.deliveredAtSec ?? null,
    usedResult?.status === "DROPPED",
    dropped,
  );
  return {
    schemaVersion: 1,
    dataProvenance: DATA_PROVENANCE,
    scenario: {
      id: scenario.meta.id,
      version: scenario.meta.version,
      title: scenario.meta.title,
      hash: log.scenarioHash,
      seed: log.seed,
      difficultyLevel: difficultyProfile.level,
      difficultyProfile: { ...difficultyProfile },
    },
    referenceModel: projectReferenceModel(scenario),
    participants: [{ role }],
    header: {
      completedAtIso: null,
      decisionAtSec: record.atSec,
      decisionLatencySec: record.atSec - dp.openSec,
      timedOut: record.timedOut,
    },
    decision: decisionView,
    scores,
    decisions: [{ decision: decisionView, scores }],
    truth: { ...stateAtCut.truth },
    consequence: {
      headline: consequenceEvent.consequence.headline,
      narrative: consequenceEvent.consequence.narrative,
    },
    timeline: timelineFor(scenario, completed, role, log),
    frames: buildFrames(scenario, log),
    information: {
      delivered: deliveredAtCut,
      opened,
      notOpened,
      waterfall,
      dropped,
      lateOrAfterDecision,
      contradictions,
    },
    verification,
    counterfactuals:
      record === completed.decisions.at(-1)
        ? buildCounterfactuals(scenario, log, completed, record)
        : [],
    coachNotes: notes,
    limitations: [
      ...scenario.meta.briefing.filter((paragraph) =>
        paragraph.startsWith("Warning: Seed "),
      ),
      "Hypotheses are binary; evidence groups are treated as conditionally independent.",
      "Reliabilities and utilities are synthetic scenario-authoring assumptions, not empirical measurements or doctrine.",
      "Calibration on a single decision is noisy; no training-transfer validation is claimed.",
      "The flagship has a single decision point; no learning-transfer validation has been conducted.",
      "The committed evaluation uses truth and available information at the decision cut; this transparent baseline is not real doctrine and is not universally correct.",
    ],
  };
}
