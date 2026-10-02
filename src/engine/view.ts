import { computeBelief } from "./belief";
import { effectiveAccuracy } from "./belief";
import { readEvent } from "./events";
import type {
  ActionId,
  BeliefSnapshot,
  ChannelId,
  EngineErrorCode,
  Phase,
  ReportRuntime,
  RoleId,
  ScenarioDef,
  ScoreWeights,
  SimSeconds,
  SimState,
} from "./types";

export interface ProjectedReport {
  id: string;
  channel: ChannelId;
  claim: string;
  detail: string | null;
  gradeLabel: "A" | "B" | "C" | "D";
  issuedAtSec: SimSeconds;
  deliveredAtSec: SimSeconds;
  ageSec: SimSeconds;
  delaySec: SimSeconds;
  status: "DELIVERED";
  origin: ReportRuntime["origin"];
  evidenceGroup: string;
  badges: string[];
  effectiveAccuracy: number | null;
  contributionNats: number | null;
  weight: number | null;
  contradicts: string[];
  opened: boolean;
  hypothesisId: string | null;
}

export interface TraineeView {
  role: RoleId;
  phase: Phase;
  nowSec: SimSeconds;
  scenario: {
    id: string;
    version: number;
    title: string;
    subtitle: string;
    summary: string;
    briefing: string[];
    difficulty: number;
    durationSec: SimSeconds;
    synthetic: true;
    tags: string[];
  };
  hypotheses: Array<{
    id: string;
    label: string;
    prior: number;
    primary: boolean;
  }>;
  referenceModel: {
    hypotheses: Array<{
      id: string;
      label: string;
      prior: number;
      priorLogOdds: number;
    }>;
    tauSec: Partial<Record<ChannelId, number>>;
    parameters: ScenarioDef["model"];
    scoreWeights: ScoreWeights;
    limitations: string[];
  };
  channels: Array<{
    id: ChannelId;
    label: string;
    sourceLabel: string;
    health: SimState["channels"][ChannelId]["health"];
    lastDeliveredAtSec: number | null;
    visible: boolean;
  }>;
  reports: ProjectedReport[];
  belief: ProjectedBelief | null;
  beliefHidden: boolean;
  decisionPoint: null | {
    id: string;
    title: string;
    prompt: string;
    openSec: number;
    closeSec: number;
    status: "UPCOMING" | "OPEN" | "CLOSED";
    actions: Array<{
      id: ActionId;
      label: string;
      description: string;
      payoffs: Array<{ when: string; value: number }>;
    }>;
    assets: Array<{
      id: string;
      label: string;
      delaySec: number;
      costUnits: number;
      gradeLabel: "A" | "B" | "C" | "D";
      usesLeft: number;
      feasible: boolean;
      reasonDisabled?: string;
    }>;
    requiredEstimates: string[];
    departureSec: number;
    delayCostPerMin: number;
  };
  estimates: Array<{ atSec: number; hypothesisId: string; p: number }>;
  inspections: string[];
  verifications: Array<{
    assetId: string;
    requestedAtSec: number;
    deliversAtSec: number;
    resultDelivered: boolean;
  }>;
  decisions: Array<{
    atSec: number;
    actionId: ActionId;
    timedOut: boolean;
    rationale: string | null;
    citedReportIds: string[];
  }>;
  pendingConsequence: null | { revealAtSec: number };
  consequence?: { headline: string; narrative: string };
  truth?: Record<string, boolean>;
  postMortemReports?: ProjectedReport[];
  aidMode: SimState["aidMode"];
  aidRevealed: boolean;
  aarReady: boolean;
  engineError?: { code: EngineErrorCode; message: string };
}

export interface ProjectedBelief {
  atSec: number;
  fogIndex: number;
  perHypothesis: Record<
    string,
    {
      p: number;
      logOdds: number;
      entropyBits: number;
      positiveNats: number;
      negativeNats: number;
      contradictionIndex: number;
      contradicted: boolean;
      contributions: Array<{
        reportId: string;
        group: string;
        channel: ChannelId;
        ageSec: number;
        effectiveAccuracy: number | null;
        llr: number | null;
        weight: number;
      }>;
    }
  >;
}

const limitations = [
  "Hypotheses are binary and evidence groups are treated as conditionally independent.",
  "Reliabilities and utilities are synthetic scenario-authoring assumptions, not empirical measurements or doctrine.",
  "The flagship is a single-decision exercise; this reference model has no learning-transfer validation.",
  "A single-event calibration metric is noisy; no training-transfer validation is claimed.",
  "The normative reference baseline is transparent but not universally correct.",
];

export type ReferenceModelView = TraineeView["referenceModel"];

export function projectReferenceModel(
  scenario: ScenarioDef,
): ReferenceModelView {
  return {
    hypotheses: scenario.hypotheses.map(({ id, label, prior }) => ({
      id,
      label,
      prior,
      priorLogOdds: Math.log(prior / (1 - prior)),
    })),
    tauSec: Object.fromEntries(
      scenario.channels.map((channel) => [channel.id, channel.tauSec]),
    ),
    parameters: { ...scenario.model },
    scoreWeights: { ...scenario.scoreWeights },
    limitations: [...limitations],
  };
}

function grade(rho: number): ProjectedReport["gradeLabel"] {
  return rho >= 0.85 ? "A" : rho >= 0.75 ? "B" : rho >= 0.65 ? "C" : "D";
}

function beliefFor(
  scenario: ScenarioDef,
  state: SimState,
  role: RoleId,
  nowSec: SimSeconds,
): BeliefSnapshot {
  const visibleChannels = scenario.channels
    .filter((channel) => channel.visibleTo.includes(role))
    .map((channel) => channel.id);
  const visibleReportIds =
    role === "COMMANDER" || role === "INSTRUCTOR"
      ? state.relays
          .filter((relay) => relay.fromRole === "ANALYST")
          .map((relay) => relay.relayReportId)
      : [];
  return computeBelief(scenario, state, nowSec, {
    visibleChannels,
    visibleReportIds,
  });
}

function projectBelief(
  belief: BeliefSnapshot,
  state: SimState,
  role: RoleId,
): ProjectedBelief {
  return {
    atSec: belief.atSec,
    fogIndex: belief.fogIndex,
    perHypothesis: Object.fromEntries(
      Object.entries(belief.perHypothesis).map(([hypothesisId, item]) => [
        hypothesisId,
        {
          p: item.p,
          logOdds: item.logOdds,
          entropyBits: item.entropyBits,
          positiveNats: item.positiveNats,
          negativeNats: item.negativeNats,
          contradictionIndex: item.contradictionIndex,
          contradicted: item.contradicted,
          contributions: item.contributions.map((contribution) => {
            const inspected = state.inspections.some(
              (inspection) =>
                inspection.reportId === contribution.reportId &&
                inspection.role === role &&
                inspection.atSec <= belief.atSec,
            );
            const aidRevealed =
              state.aidMode === "ALWAYS" ||
              Object.hasOwn(state.aidRevealedAtSecByRole, role);
            return {
              reportId: contribution.reportId,
              group: contribution.group,
              channel: contribution.channel,
              ageSec: contribution.ageSec,
              effectiveAccuracy:
                inspected && aidRevealed
                  ? contribution.effectiveAccuracy
                  : null,
              llr: inspected && aidRevealed ? contribution.llr : null,
              weight: aidRevealed ? contribution.weight : 0,
            };
          }),
        },
      ]),
    ),
  };
}

function projectReport(
  scenario: ScenarioDef,
  state: SimState,
  report: ReportRuntime,
  role: RoleId,
  nowSec: SimSeconds,
  belief: BeliefSnapshot | null,
  completed: boolean,
): ProjectedReport {
  const opened = state.inspections.some(
    (inspection) =>
      inspection.reportId === report.def.id &&
      inspection.role === role &&
      inspection.atSec <= nowSec,
  );
  const channel = scenario.channels.find(
    (candidate) => candidate.id === report.def.channel,
  );
  if (!channel)
    throw new Error("Projected report references an unknown channel");
  const deliveredAtSec = report.deliveredAtSec;
  if (deliveredAtSec === null) {
    throw new Error("Only delivered reports may enter the trainee projection");
  }
  const evidence = report.def.hypothesisId
    ? belief?.perHypothesis[report.def.hypothesisId]?.contributions.find(
        (contribution) => contribution.reportId === report.def.id,
      )
    : undefined;
  const badges: string[] = [];
  if (deliveredAtSec > report.def.issuedAtSec) badges.push("DELAYED");
  if (report.origin === "VERIFY") badges.push("VERIFIED");
  if (report.origin === "INJECT") badges.push("UNCONFIRMED");
  if (report.origin === "RELAY") badges.push("RELAYED");
  if (
    Math.exp(-(Math.max(0, nowSec - report.def.issuedAtSec) / channel.tauSec)) <
    0.6
  ) {
    badges.push("STALE");
  }
  const aidRevealed =
    state.aidMode === "ALWAYS" ||
    Object.hasOwn(state.aidRevealedAtSecByRole, role);
  const canShowMath = completed || (opened && aidRevealed);
  const contradicted =
    belief !== null &&
    belief.perHypothesis[report.def.hypothesisId ?? ""]?.contradicted;
  return {
    id: report.def.id,
    channel: report.def.channel,
    claim: report.def.claim,
    detail: opened || completed ? report.def.detail : null,
    gradeLabel: grade(report.def.rho),
    issuedAtSec: report.def.issuedAtSec,
    deliveredAtSec,
    ageSec: Math.max(0, nowSec - report.def.issuedAtSec),
    delaySec: deliveredAtSec - report.def.issuedAtSec,
    status: "DELIVERED",
    origin: report.origin,
    evidenceGroup: report.def.evidenceGroup,
    badges,
    effectiveAccuracy: canShowMath
      ? effectiveAccuracy(
          report.def.rho,
          Math.max(0, nowSec - report.def.issuedAtSec),
          channel.tauSec,
          report.healthAtIssue,
        )
      : null,
    contributionNats: canShowMath ? (evidence?.llr ?? null) : null,
    weight: aidRevealed ? (evidence?.weight ?? null) : null,
    contradicts:
      aidRevealed && contradicted && evidence
        ? (belief?.perHypothesis[report.def.hypothesisId ?? ""]?.contributions
            .filter(
              (item) =>
                item.group !== report.def.evidenceGroup &&
                Math.sign(item.llr) !== Math.sign(evidence.llr),
            )
            .map((item) => item.reportId) ?? [])
        : [],
    opened,
    hypothesisId: report.def.hypothesisId,
  };
}

function payoffLabel(
  scenario: ScenarioDef,
  when: Record<string, boolean>,
): string {
  const parts = Object.entries(when).map(([hypothesisId, value]) => {
    const hypothesis = scenario.hypotheses.find(
      (candidate) => candidate.id === hypothesisId,
    );
    return `${hypothesis?.label ?? hypothesisId}: ${value ? "true" : "false"}`;
  });
  return parts.length ? parts.join("; ") : "Any state";
}

export function projectTraineeView(
  scenario: ScenarioDef,
  state: SimState,
  role: RoleId,
  engineError?: { code: EngineErrorCode; message: string },
): TraineeView {
  const complete = state.phase === "COMPLETE";
  const aidRevealed =
    state.aidMode === "ALWAYS" ||
    Object.hasOwn(state.aidRevealedAtSecByRole, role);
  const belief = aidRevealed
    ? beliefFor(scenario, state, role, state.nowSec)
    : null;
  const visibleChannels = new Set(
    scenario.channels
      .filter((channel) => channel.visibleTo.includes(role))
      .map((channel) => channel.id),
  );
  const visibleReports = Object.values(state.reports)
    .filter(
      (report) =>
        report.status === "DELIVERED" &&
        report.deliveredAtSec !== null &&
        report.deliveredAtSec <= state.nowSec &&
        (visibleChannels.has(report.def.channel) ||
          ((role === "COMMANDER" || role === "INSTRUCTOR") &&
            report.origin === "RELAY" &&
            report.relayedFrom?.role === "ANALYST")),
    )
    .sort(
      (left, right) =>
        (right.deliveredAtSec ?? 0) - (left.deliveredAtSec ?? 0) ||
        right.sequence - left.sequence,
    );
  const reports = visibleReports.map((report) =>
    projectReport(
      scenario,
      state,
      report,
      role,
      state.nowSec,
      belief,
      complete,
    ),
  );
  const dp = scenario.decisionPoints[state.currentDecisionPointIndex];
  const decisionPoint = dp
    ? {
        id: dp.id,
        title: dp.title,
        prompt: dp.prompt,
        openSec: dp.openSec,
        closeSec: dp.closeSec,
        status:
          state.phase === "RUNNING" &&
          state.nowSec >= dp.openSec &&
          state.nowSec < dp.closeSec
            ? ("OPEN" as const)
            : state.nowSec >= dp.closeSec ||
                state.phase === "CONSEQUENCE" ||
                state.phase === "COMPLETE"
              ? ("CLOSED" as const)
              : ("UPCOMING" as const),
        actions: dp.actions.map((action) => ({
          id: action.id,
          label: action.label,
          description: action.description,
          payoffs: action.utility.map((rule) => ({
            when: payoffLabel(scenario, rule.when),
            value: rule.value,
          })),
        })),
        assets: dp.assets.map((assetId) => {
          const asset = scenario.assets.find(
            (candidate) => candidate.id === assetId,
          );
          if (!asset)
            throw new Error("Decision point references an unknown asset");
          const uses = state.verifications.filter(
            (verification) =>
              verification.decisionPointId === dp.id &&
              verification.assetId === assetId,
          ).length;
          const windowOpen =
            state.phase === "RUNNING" &&
            state.nowSec >= dp.openSec &&
            state.nowSec < dp.closeSec;
          const enoughTime = state.nowSec + asset.delaySec < dp.closeSec;
          const feasible = windowOpen && uses < asset.capacity && enoughTime;
          const reasonDisabled = feasible
            ? undefined
            : uses >= asset.capacity
              ? "Already used"
              : !enoughTime
                ? "Result would arrive at or after the deadline"
                : "Decision window is not open";
          return {
            id: asset.id,
            label: asset.label,
            delaySec: asset.delaySec,
            costUnits: asset.costUnits,
            gradeLabel: grade(asset.rho),
            usesLeft: Math.max(0, asset.capacity - uses),
            feasible,
            ...(reasonDisabled ? { reasonDisabled } : {}),
          };
        }),
        requiredEstimates: [...dp.requiredEstimates],
        departureSec: dp.departureSec,
        delayCostPerMin: dp.delayCostPerMin,
      }
    : null;
  const consequenceEvent = state.eventTimeline
    .slice(0, state.processedEventCursor)
    .map(readEvent)
    .reverse()
    .find((event) => event.kind === "CONSEQUENCE_REVEAL");
  const consequence =
    complete && consequenceEvent?.kind === "CONSEQUENCE_REVEAL"
      ? {
          headline: consequenceEvent.consequence.headline,
          narrative: consequenceEvent.consequence.narrative,
        }
      : null;
  const allReportsAtCompletion = complete
    ? Object.values(state.reports)
        .filter((report) => report.status === "DELIVERED")
        .sort(
          (left, right) =>
            (right.deliveredAtSec ?? 0) - (left.deliveredAtSec ?? 0) ||
            right.sequence - left.sequence,
        )
        .map((report) =>
          projectReport(
            scenario,
            state,
            report,
            role,
            state.nowSec,
            beliefFor(scenario, state, role, state.nowSec),
            true,
          ),
        )
    : null;
  const currentDecision = state.decisions[state.decisions.length - 1];
  return {
    role,
    phase: state.phase,
    nowSec: state.nowSec,
    scenario: {
      id: scenario.meta.id,
      version: scenario.meta.version,
      title: scenario.meta.title,
      subtitle: scenario.meta.subtitle,
      summary: scenario.meta.summary,
      briefing: [...scenario.meta.briefing],
      difficulty: scenario.meta.difficulty,
      durationSec: scenario.meta.durationSec,
      synthetic: true,
      tags: [...scenario.meta.tags],
    },
    hypotheses: scenario.hypotheses.map((hypothesis) => ({
      id: hypothesis.id,
      label: hypothesis.label,
      prior: hypothesis.prior,
      primary: hypothesis.primary,
    })),
    referenceModel: projectReferenceModel(scenario),
    channels: scenario.channels.map((channel) => ({
      id: channel.id,
      label: channel.label,
      sourceLabel: channel.sourceLabel,
      health: state.channels[channel.id].health,
      lastDeliveredAtSec: visibleChannels.has(channel.id)
        ? state.channels[channel.id].lastDeliveredAtSec
        : null,
      visible: visibleChannels.has(channel.id),
    })),
    reports,
    belief: belief ? projectBelief(belief, state, role) : null,
    beliefHidden: !aidRevealed,
    decisionPoint,
    estimates: state.estimates
      .filter((estimate) => estimate.role === role)
      .map(({ atSec, hypothesisId, p }) => ({ atSec, hypothesisId, p })),
    inspections: state.inspections
      .filter((inspection) => inspection.role === role)
      .map((inspection) => inspection.reportId),
    verifications: state.verifications
      .filter((verification) => verification.role === role)
      .map((verification) => ({
        assetId: verification.assetId,
        requestedAtSec: verification.requestedAtSec,
        deliversAtSec: verification.deliversAtSec,
        resultDelivered:
          state.reports[verification.resultReportId]?.status === "DELIVERED",
      })),
    decisions: state.decisions
      .filter((decision) => decision.role === role)
      .map((decision) => ({
        atSec: decision.atSec,
        actionId: decision.actionId,
        timedOut: decision.timedOut,
        rationale: decision.rationale?.text ?? null,
        citedReportIds: decision.rationale?.citedReportIds ?? [],
      })),
    pendingConsequence:
      !complete &&
      state.phase === "CONSEQUENCE" &&
      state.consequenceRevealAtSec !== null
        ? { revealAtSec: state.consequenceRevealAtSec }
        : null,
    ...(consequence ? { consequence } : {}),
    ...(complete ? { truth: { ...state.truth } } : {}),
    ...(allReportsAtCompletion
      ? { postMortemReports: allReportsAtCompletion }
      : {}),
    aidMode: state.aidMode,
    aidRevealed,
    aarReady: complete && currentDecision !== undefined,
    ...(engineError ? { engineError } : {}),
  };
}
