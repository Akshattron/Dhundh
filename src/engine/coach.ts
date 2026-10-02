import type { Aar } from "./aar";
import { formatClock, formatPercent } from "../utils/format";
import type { BeliefSnapshot, ScenarioDef } from "./types";

export interface AarCoachNote {
  id: string;
  severity: "INFO" | "GOOD" | "ATTENTION";
  text: string;
  evidence: string[];
}

function actionLabel(scenario: ScenarioDef, dpId: string, actionId: string) {
  const action = scenario.decisionPoints
    .find((decisionPoint) => decisionPoint.id === dpId)
    ?.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error(`AAR references unknown action ${actionId}`);
  return action.label;
}

function bestNumericalAction(
  scenario: ScenarioDef,
  decision: Aar["decision"],
): { id: string; label: string; value: number } {
  const dp = scenario.decisionPoints.find(
    (candidate) => candidate.id === decision.decisionPointId,
  );
  if (!dp) throw new Error("AAR decision point does not exist");
  const value = Math.max(...Object.values(decision.expectedUtilities));
  const best = dp.actions.find(
    (action) => decision.expectedUtilities[action.id] === value,
  );
  if (!best) throw new Error("AAR has no numerical maximizing action");
  return { id: best.id, label: best.label, value };
}

function formatTruth(decision: Aar["decision"], scenario: ScenarioDef) {
  return Object.entries(decision.truthAtDecision)
    .map(([id, value]) => {
      const hypothesis = scenario.hypotheses.find((item) => item.id === id);
      if (!hypothesis) throw new Error(`Unknown hypothesis ${id} in AAR`);
      return `${hypothesis.label}: ${value ? hypothesis.trueLabel : hypothesis.falseLabel}`;
    })
    .join("; ");
}

export function buildCoachNotes(
  decision: Aar["decision"],
  scores: Aar["scores"],
  verification: Aar["verification"],
  opened: string[],
  belief: BeliefSnapshot,
  scenario: ScenarioDef,
  reportClaims: ReadonlyMap<string, string>,
  verificationResultArrivedAtSec: number | null,
  verificationResultDropped: boolean,
  whatIfReports: Array<{
    reportId: string;
    whatIfBeliefAtDecision: Record<string, number> | null;
  }> = [],
): AarCoachNote[] {
  const notes: AarCoachNote[] = [];
  const dp = scenario.decisionPoints.find(
    (candidate) => candidate.id === decision.decisionPointId,
  );
  if (!dp) throw new Error("AAR decision point does not exist");
  const time = formatClock(decision.atSec);
  const chosenLabel = actionLabel(scenario, dp.id, decision.actionId);
  const best = bestNumericalAction(scenario, decision);
  const verificationAsset =
    verification?.assetId ?? "no-feasible-verification-asset";
  const chosenValue = decision.expectedUtilities[decision.actionId];
  if (chosenValue === undefined) {
    throw new Error("AAR has no expected utility for its chosen action");
  }

  if (decision.timedOut) {
    notes.push({
      id: "timeout",
      severity: "ATTENTION",
      text: `The decision window expired. ${actionLabel(scenario, dp.id, dp.timeoutActionId)} was recorded automatically; Timeliness is zero.`,
      evidence: [dp.id, "DECISION_TIMEOUT"],
    });
  } else if (scores.quadrant === "SOUND_UNLUCKY") {
    notes.push({
      id: "decision-quality",
      severity: "INFO",
      text: `Sound decision, unfavourable outcome. At ${time}, ${chosenLabel} had expected value ${chosenValue.toFixed(2)}; the highest available was ${best.value.toFixed(2)}, with regret ${decision.regret.toFixed(2)}. The hidden truth was ${formatTruth(decision, scenario)}. Judge the decision by what you knew, not by how it ended.`,
      evidence: [decision.actionId, best.id, `CUT_${decision.atSec}`],
    });
  } else if (scores.quadrant === "LUCKY") {
    notes.push({
      id: "decision-quality",
      severity: "ATTENTION",
      text: `Favourable outcome from a weak decision. ${chosenLabel} had lower expected value (${chosenValue.toFixed(2)}) than ${best.label} (${best.value.toFixed(2)}) given what had arrived. The outcome does not erase that expected-value gap.`,
      evidence: [decision.actionId, best.id, `CUT_${decision.atSec}`],
    });
  } else if (scores.quadrant === "SOUND_SUCCESS") {
    notes.push({
      id: "decision-quality",
      severity: "GOOD",
      text: `Sound decision and favourable outcome: at ${time}, ${chosenLabel} had expected value ${chosenValue.toFixed(2)}; the highest available was ${best.value.toFixed(2)}, with regret ${decision.regret.toFixed(2)}.`,
      evidence: [decision.actionId, best.id, `CUT_${decision.atSec}`],
    });
  } else {
    const contradictionIds = Object.entries(belief.perHypothesis)
      .filter(([, hypothesis]) => hypothesis.contradicted)
      .map(([id]) => id);
    const unopenedIds = Object.values(belief.perHypothesis)
      .flatMap((hypothesis) => hypothesis.contributions)
      .filter(
        (contribution) =>
          !opened.includes(contribution.reportId) &&
          Math.abs(contribution.llr) >= 0.3,
      )
      .map((contribution) => contribution.reportId);
    const evidence = [
      ...(contradictionIds.length > 0
        ? [`Contradictions at the cut: ${contradictionIds.join(", ")}.`]
        : []),
      ...(unopenedIds.length > 0
        ? [`Significant unopened reports: ${unopenedIds.join(", ")}.`]
        : []),
    ].join(" ");
    notes.push({
      id: "decision-quality",
      severity: "ATTENTION",
      text: `Weak decision and unfavourable outcome. Regret under belief was ${decision.regret.toFixed(2)}. Review the evidence available at ${time}.${evidence ? ` ${evidence}` : ""}`,
      evidence:
        contradictionIds.length + unopenedIds.length > 0
          ? [...contradictionIds, ...unopenedIds]
          : [decision.actionId, best.id],
    });
  }

  if (verification?.verdict === "WORTH_IT_SKIPPED") {
    notes.push({
      id: "verification-skipped",
      severity: "ATTENTION",
      text: `${verificationAsset} evaluated at ${formatClock(verification.evalAtSec)} was worth +${verification.netVoiAtEval.toFixed(2)} net. You did not use it.`,
      evidence: [verificationAsset],
    });
  } else if (verification?.used && verification.verdict === "WORTH_IT_USED") {
    const resultTiming = verificationResultDropped
      ? "Its result was dropped and did not arrive."
      : verificationResultArrivedAtSec === null
        ? "Its result was still pending at completion."
        : verificationResultArrivedAtSec > decision.atSec
          ? "Its result arrived after commitment."
          : "Its result arrived before commitment.";
    notes.push({
      id: "verification-used",
      severity: "GOOD",
      text: `${verificationAsset} requested at ${formatClock(verification.evalAtSec)} had net value +${verification.netVoiAtEval.toFixed(2)}. ${resultTiming}`,
      evidence: [verificationAsset],
    });
  } else if (verification?.used) {
    const resultTiming = verificationResultDropped
      ? "Its result was dropped and did not arrive."
      : verificationResultArrivedAtSec === null
        ? "Its result was still pending at completion."
        : verificationResultArrivedAtSec > decision.atSec
          ? "Its result arrived after commitment."
          : "Its result arrived before commitment.";
    notes.push({
      id: "verification-used",
      severity: "ATTENTION",
      text: `Verification cost more than its reference information value at ${formatClock(verification.evalAtSec)} (net ${verification.netVoiAtEval.toFixed(2)}). ${resultTiming}`,
      evidence: [verificationAsset],
    });
  }

  const materialWhatIf = whatIfReports
    .filter((report) => report.whatIfBeliefAtDecision !== null)
    .flatMap((report) =>
      Object.entries(report.whatIfBeliefAtDecision ?? {}).map(
        ([hypothesisId, probability]) => ({
          report,
          hypothesisId,
          probability,
          change: Math.abs(
            probability - (decision.belief[hypothesisId] ?? probability),
          ),
        }),
      ),
    )
    .sort((left, right) => right.change - left.change)[0];
  if (materialWhatIf && materialWhatIf.change >= 0.01) {
    const hypothesis = scenario.hypotheses.find(
      (item) => item.id === materialWhatIf.hypothesisId,
    );
    if (!hypothesis)
      throw new Error("What-if references an unknown hypothesis");
    notes.push({
      id: "dropped-information",
      severity: "ATTENTION",
      text: `Had ${materialWhatIf.report.reportId} arrived at its issue time, the reference belief in "${hypothesis.label}" would have been ${formatPercent(materialWhatIf.probability, 1)} instead of ${formatPercent(decision.belief[materialWhatIf.hypothesisId] ?? 0, 1)} at ${time}. This is a simulated what-if, not what happened.`,
      evidence: [materialWhatIf.report.reportId],
    });
  }

  const allContributions = Object.values(belief.perHypothesis).flatMap(
    (hypothesis) => hypothesis.contributions,
  );
  const totalEvidence = allContributions.reduce(
    (sum, contribution) => sum + Math.abs(contribution.llr),
    0,
  );
  const unopened = allContributions
    .filter(
      (contribution) =>
        !opened.includes(contribution.reportId) &&
        Math.abs(contribution.llr) >= 0.3,
    )
    .sort((left, right) => Math.abs(right.llr) - Math.abs(left.llr));
  for (const contribution of unopened) {
    const claim = reportClaims.get(contribution.reportId);
    if (claim === undefined) continue;
    const weightPct =
      totalEvidence === 0
        ? 0
        : Math.round((Math.abs(contribution.llr) / totalEvidence) * 100);
    notes.push({
      id: `unopened-${contribution.reportId}`,
      severity: "ATTENTION",
      text: `You did not open ${contribution.reportId} ("${claim}"), which carried ${weightPct}% of the evidence weight.`,
      evidence: [contribution.reportId],
    });
  }

  if (decision.posture === "OVER_CAUTIOUS") {
    const chosenAction = dp.actions.find(
      (action) => action.id === decision.actionId,
    );
    const waitingCost =
      chosenAction?.delayCostApplies && dp.delayCostPerMin > 0
        ? ` Waiting also costs ${dp.delayCostPerMin.toFixed(2)} utility per minute for this action.`
        : "";
    notes.push({
      id: "over-cautious",
      severity: "ATTENTION",
      text: `You chose ${chosenLabel} while ${best.label} had higher expected value (${best.value.toFixed(2)}).${waitingCost}`,
      evidence: [best.id],
    });
  }

  if (decision.posture === "OVER_COMMITTED") {
    const contradictions = Object.entries(belief.perHypothesis)
      .filter(([, hypothesis]) => hypothesis.contradicted)
      .map(([id]) => id);
    notes.push({
      id: "over-committed",
      severity: "ATTENTION",
      text: `You committed to ${chosenLabel} while ${best.label} was better under the reference belief (${best.value.toFixed(2)}).${contradictions.length > 0 ? ` Contradictory evidence existed for ${contradictions.join(", ")}.` : ""}`,
      evidence: [best.id, ...contradictions],
    });
  }

  const { first, final } = decision.estimates;
  if (first !== null && final !== null && Math.abs(first - final) >= 0.15) {
    const primary = scenario.hypotheses.find(
      (hypothesis) => hypothesis.primary,
    );
    const pSys = primary ? decision.belief[primary.id] : undefined;
    if (pSys === undefined) throw new Error("AAR primary belief is missing");
    notes.push({
      id: "estimate-revision",
      severity: "INFO",
      text: `You revised your estimate from ${formatPercent(first)} to ${formatPercent(final)}. The reference belief was ${formatPercent(pSys)}.`,
      evidence: [primary?.id ?? "PRIMARY_HYPOTHESIS", `CUT_${decision.atSec}`],
    });
  }

  if (decision.isTie) {
    const recommendation =
      verification?.verdict === "WORTH_IT_SKIPPED"
        ? ` A feasible verification, ${verificationAsset}, had positive net value at that cut.`
        : "";
    notes.push({
      id: "near-tie",
      severity: "INFO",
      text: `The leading actions were within the model's tie threshold at ${time}.${recommendation}`,
      evidence:
        verification?.verdict === "WORTH_IT_SKIPPED"
          ? [verificationAsset]
          : [decision.actionId, best.id, `CUT_${decision.atSec}`],
    });
  }

  const severityRank = { ATTENTION: 0, GOOD: 1, INFO: 2 } as const;
  return notes
    .map((note, order) => ({ note, order }))
    .sort(
      (left, right) =>
        severityRank[left.note.severity] - severityRank[right.note.severity] ||
        left.order - right.order,
    )
    .slice(0, 5)
    .map(({ note }) => note);
}
