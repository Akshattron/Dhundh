import { effectiveAccuracy, llr } from "./belief";
import { replayLog } from "./simulation";
import type { Intent, ReportRuntime, ScenarioDef, SessionLog } from "./types";

export interface TeamMetrics {
  informationSharingRate: number | null;
  estimateConvergence: number | null;
  medianRelayDelayMin: number | null;
  medianCoordinationLatencySec: number | null;
}

export interface TeamRelayResponse {
  reportId: string;
  relayReportId: string;
  hypothesisId: string | null;
  requestedAtSec: number;
  originalDeliveredAtSec: number;
  scheduledDeliveryAtSec: number;
  deliveredAtSec: number | null;
  meaningfulAtReceipt: boolean;
  response: {
    intentIndex: number;
    type: "OPEN_REPORT" | "SET_ESTIMATE" | "VERIFY" | "DECIDE";
    atSec: number;
  } | null;
  latencySec: number | null;
  status:
    | "MATCHED"
    | "NO_RESPONSE"
    | "AFTER_DECISION"
    | "NOT_DELIVERED"
    | "NOT_MEANINGFUL";
}

export interface TeamDecisionMetrics {
  decisionPointId: string;
  atSec: number;
  timedOut: boolean;
  primaryHypothesisId: string;
  primaryHypothesisLabel: string;
  metrics: TeamMetrics;
  counts: {
    analystReportsDelivered: number;
    meaningfulReports: number;
    meaningfulReportsRelayed: number;
    relayIntents: number;
    relayReceipts: number;
    meaningfulReceiptsBeforeDecision: number;
    matchedResponses: number;
    unansweredReceipts: number;
    primaryEstimateIntents: number;
    pairedEstimates: number;
  };
  opportunities: Array<{
    reportId: string;
    deliveredAtSec: number;
    llrAtDecision: number;
    relayedBeforeDecision: boolean;
  }>;
  convergence: Array<{
    intentIndex: number;
    atSec: number;
    role: "COMMANDER" | "ANALYST";
    commander: number;
    analyst: number;
    convergence: number;
  }>;
  initialConvergence: number | null;
  convergenceChange: number | null;
  relays: TeamRelayResponse[];
}

export interface TeamMetricReport {
  metrics: TeamMetrics;
  decisionMetrics: TeamDecisionMetrics[];
  metricDefinitions: Record<keyof TeamMetrics, string>;
  metricLimitations: string[];
}

const definitions: TeamMetricReport["metricDefinitions"] = {
  informationSharingRate:
    "Unique analyst-channel reports relayed before commitment with absolute LLR at the decision cut >= 0.3, divided by all such reports delivered by that cut. Null if none. Sending counts here; receipt is reported separately.",
  estimateConvergence:
    "1 minus the absolute difference between the Commander's and Analyst's final predecision primary-hypothesis estimates. Null unless both roles estimated. The trajectory starts only when both estimates exist.",
  medianRelayDelayMin:
    "Median (actual relay receipt minus original report receipt), in simulated minutes, for relays sent before the decision and delivered by completion. Includes late receipts; it is not a measure of decision use.",
  medianCoordinationLatencySec:
    "Median simulated seconds from a meaningful relay receipt to its first matching Commander action by commitment. A matching action opens that relay, estimates or verifies its hypothesis, or explicitly cites it in the decision. Each action matches at most one receipt, oldest first.",
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function reportLlr(
  scenario: ScenarioDef,
  report: ReportRuntime,
  atSec: number,
): number {
  if (report.def.hypothesisId === null) return 0;
  const channel = scenario.channels.find(
    (item) => item.id === report.def.channel,
  );
  if (!channel)
    throw new Error("Team metric report references an unknown channel");
  return llr(
    effectiveAccuracy(
      report.def.rho,
      atSec - report.def.issuedAtSec,
      channel.tauSec,
      report.healthAtIssue,
    ),
    report.def.stance,
  );
}

function responseMatches(
  intent: Intent,
  relay: TeamRelayResponse,
  scenario: ScenarioDef,
): intent is Extract<
  Intent,
  { type: "OPEN_REPORT" | "SET_ESTIMATE" | "VERIFY" | "DECIDE" }
> {
  if (intent.role !== "COMMANDER") return false;
  switch (intent.type) {
    case "OPEN_REPORT":
      return intent.reportId === relay.relayReportId;
    case "SET_ESTIMATE":
      return intent.hypothesisId === relay.hypothesisId;
    case "VERIFY":
      return (
        scenario.assets.find((asset) => asset.id === intent.assetId)
          ?.hypothesisId === relay.hypothesisId
      );
    case "DECIDE":
      return (
        intent.rationale?.citedReportIds.includes(relay.relayReportId) === true
      );
    default:
      return false;
  }
}

export function buildTeamMetrics(
  scenario: ScenarioDef,
  log: SessionLog,
): TeamMetricReport {
  const completed = replayLog(scenario, log);
  if (log.mode !== "NETWORKED" || completed.phase !== "COMPLETE") {
    throw new Error("Team metrics require a completed network-session replay");
  }
  const primary = scenario.hypotheses.find((hypothesis) => hypothesis.primary);
  if (!primary) throw new Error("Team metrics require a primary hypothesis");
  const analystChannels = new Set(
    scenario.channels
      .filter((channel) => channel.visibleTo.includes("ANALYST"))
      .map((channel) => channel.id),
  );
  const voluntaryIndices = log.intents.flatMap((intent, index) =>
    intent.type === "DECIDE" ? [index] : [],
  );
  let voluntaryIndex = 0;

  const decisionMetrics = completed.decisions.map(
    (decision): TeamDecisionMetrics => {
      let limit: number;
      if (decision.timedOut) {
        const index = log.intents.findIndex(
          (intent) => intent.t >= decision.atSec,
        );
        limit = index < 0 ? log.intents.length : index;
      } else {
        const index = voluntaryIndices[voluntaryIndex++];
        if (index === undefined)
          throw new Error("Team decision has no accepted intent");
        limit = index;
      }
      const prefix = log.intents.slice(0, limit);
      const cut = replayLog(
        scenario,
        { ...log, intents: prefix },
        { upToSec: decision.atSec },
      );
      const delivered = Object.values(cut.reports).filter(
        (report) =>
          report.origin !== "RELAY" &&
          analystChannels.has(report.def.channel) &&
          report.status === "DELIVERED" &&
          report.deliveredAtSec !== null,
      );
      const shared = new Set(cut.relays.map((relay) => relay.reportId));
      const opportunities = delivered.flatMap((report) => {
        const contribution = reportLlr(scenario, report, decision.atSec);
        if (Math.abs(contribution) < 0.3 || report.deliveredAtSec === null)
          return [];
        return [
          {
            reportId: report.def.id,
            deliveredAtSec: report.deliveredAtSec,
            llrAtDecision: contribution,
            relayedBeforeDecision: shared.has(report.def.id),
          },
        ];
      });
      const relays = cut.relays.map((record): TeamRelayResponse => {
        const original = completed.reports[record.reportId];
        const relay = completed.reports[record.relayReportId];
        if (
          !original ||
          original.deliveredAtSec === null ||
          !relay ||
          relay.deliveredAtSec === null
        ) {
          throw new Error(
            "Team metrics encountered an invalid authoritative relay",
          );
        }
        const receipt =
          relay.status === "DELIVERED" ? relay.deliveredAtSec : null;
        const meaningful =
          receipt !== null &&
          Math.abs(reportLlr(scenario, relay, receipt)) >= 0.3;
        return {
          reportId: record.reportId,
          relayReportId: record.relayReportId,
          hypothesisId: relay.def.hypothesisId,
          requestedAtSec: record.atSec,
          originalDeliveredAtSec: original.deliveredAtSec,
          scheduledDeliveryAtSec: relay.deliveredAtSec,
          deliveredAtSec: receipt,
          meaningfulAtReceipt: meaningful,
          response: null,
          latencySec: null,
          status:
            receipt === null
              ? "NOT_DELIVERED"
              : receipt > decision.atSec
                ? "AFTER_DECISION"
                : !meaningful
                  ? "NOT_MEANINGFUL"
                  : "NO_RESPONSE",
        };
      });
      // The voluntary DECIDE may itself cite a relay. A timeout is not a trainee response.
      const responseIntents = log.intents.slice(
        0,
        limit + (decision.timedOut ? 0 : 1),
      );
      responseIntents.forEach((intent, intentIndex) => {
        const relay = relays.find(
          (item) =>
            item.status === "NO_RESPONSE" &&
            item.deliveredAtSec !== null &&
            item.deliveredAtSec <= intent.t &&
            responseMatches(intent, item, scenario),
        );
        if (
          !relay ||
          relay.deliveredAtSec === null ||
          !responseMatches(intent, relay, scenario)
        )
          return;
        relay.response = { intentIndex, type: intent.type, atSec: intent.t };
        relay.latencySec = intent.t - relay.deliveredAtSec;
        relay.status = "MATCHED";
      });

      let commander: number | null = null;
      let analyst: number | null = null;
      let estimateCount = 0;
      const convergence: TeamDecisionMetrics["convergence"] = [];
      prefix.forEach((intent, intentIndex) => {
        if (
          intent.type !== "SET_ESTIMATE" ||
          intent.hypothesisId !== primary.id ||
          (intent.role !== "COMMANDER" && intent.role !== "ANALYST")
        )
          return;
        estimateCount += 1;
        if (intent.role === "COMMANDER") commander = intent.p;
        else analyst = intent.p;
        if (commander !== null && analyst !== null) {
          convergence.push({
            intentIndex,
            atSec: intent.t,
            role: intent.role,
            commander,
            analyst,
            convergence: 1 - Math.abs(commander - analyst),
          });
        }
      });
      const finalConvergence = convergence.at(-1)?.convergence ?? null;
      const initialConvergence = convergence[0]?.convergence ?? null;
      const relayedCount = opportunities.filter(
        (report) => report.relayedBeforeDecision,
      ).length;
      const metrics: TeamMetrics = {
        informationSharingRate: opportunities.length
          ? relayedCount / opportunities.length
          : null,
        estimateConvergence: finalConvergence,
        medianRelayDelayMin: median(
          relays.flatMap((relay) =>
            relay.deliveredAtSec === null
              ? []
              : [(relay.deliveredAtSec - relay.originalDeliveredAtSec) / 60],
          ),
        ),
        medianCoordinationLatencySec: median(
          relays.flatMap((relay) =>
            relay.latencySec === null ? [] : [relay.latencySec],
          ),
        ),
      };
      return {
        decisionPointId: decision.decisionPointId,
        atSec: decision.atSec,
        timedOut: decision.timedOut,
        primaryHypothesisId: primary.id,
        primaryHypothesisLabel: primary.label,
        metrics,
        opportunities,
        convergence,
        initialConvergence,
        convergenceChange:
          initialConvergence === null || finalConvergence === null
            ? null
            : finalConvergence - initialConvergence,
        relays,
        counts: {
          analystReportsDelivered: delivered.length,
          meaningfulReports: opportunities.length,
          meaningfulReportsRelayed: relayedCount,
          relayIntents: relays.length,
          relayReceipts: relays.filter((relay) => relay.deliveredAtSec !== null)
            .length,
          meaningfulReceiptsBeforeDecision: relays.filter(
            (relay) =>
              relay.status === "MATCHED" || relay.status === "NO_RESPONSE",
          ).length,
          matchedResponses: relays.filter((relay) => relay.status === "MATCHED")
            .length,
          unansweredReceipts: relays.filter(
            (relay) => relay.status === "NO_RESPONSE",
          ).length,
          primaryEstimateIntents: estimateCount,
          pairedEstimates: convergence.length,
        },
      };
    },
  );
  const last = decisionMetrics.at(-1);
  if (!last) throw new Error("Completed team replay has no decision");
  return {
    metrics: last.metrics,
    decisionMetrics,
    metricDefinitions: { ...definitions },
    metricLimitations: [
      "Descriptive diagnostics of this synthetic exercise, not scientifically validated learning-transfer measures. No composite team score.",
      "Each decision uses cumulative history from the start through its causal cut, excluding later same-second intents. Scheduled receipts at commitment precede the decision; timeout-second trainee intents are excluded.",
      "Sharing counts distinct original reports and accepted sends, not delivery, opening, independent evidence groups, or comprehension. Duplicate sends cannot increase the sharing rate.",
      "Latency requires absolute LLR >= 0.3 at receipt; sharing uses strength at commitment. Matching is an explicit, oldest-receipt-first association, not proof of causation. Each Commander action matches at most one receipt.",
      "Late, absent, immaterial, and unanswered receipts do not become zero latency. No missing estimate is replaced by a prior; convergence is agreement, not correctness. Relay delay includes observed post-decision delivery.",
    ],
  };
}
