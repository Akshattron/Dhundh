import { contradictionSummary } from "./contradiction";
import { binaryEntropy, fogIndex } from "./entropy";
import type {
  BeliefSnapshot,
  ChannelId,
  EvidenceContribution,
  HypothesisId,
  ReportRuntime,
  ScenarioDef,
  SimSeconds,
  SimState,
  Stance,
} from "./types";

export function effectiveAccuracy(
  rho: number,
  ageSec: number,
  tauSec: number,
  m: number,
): number {
  if (
    !Number.isFinite(rho) ||
    rho <= 0.5 ||
    rho >= 1 ||
    !Number.isSafeInteger(ageSec) ||
    ageSec < 0 ||
    !Number.isFinite(tauSec) ||
    tauSec <= 0 ||
    !Number.isFinite(m) ||
    m < 0 ||
    m > 1
  ) {
    throw new RangeError("Accuracy inputs are outside their valid ranges");
  }
  const decay = Math.exp(-(ageSec / 60) / (tauSec / 60));
  return 0.5 + (rho - 0.5) * decay * m;
}

export function llr(accuracy: number, stance: Stance): number {
  if (
    !Number.isFinite(accuracy) ||
    accuracy < 0.5 ||
    accuracy >= 1 ||
    (stance !== -1 && stance !== 0 && stance !== 1)
  ) {
    throw new RangeError("Likelihood inputs are outside their valid ranges");
  }
  if (stance === 0 || accuracy === 0.5) return 0;
  return stance * Math.log(accuracy / (1 - accuracy));
}

export function logistic(x: number): number {
  if (!Number.isFinite(x)) {
    throw new RangeError("Log-odds must be finite");
  }
  if (x >= 0) {
    const inverse = Math.exp(-x);
    return 1 / (1 + inverse);
  }
  const odds = Math.exp(x);
  return odds / (1 + odds);
}

function preferReport(
  candidate: ReportRuntime,
  current: ReportRuntime,
): boolean {
  return (
    candidate.def.issuedAtSec > current.def.issuedAtSec ||
    (candidate.def.issuedAtSec === current.def.issuedAtSec &&
      candidate.sequence > current.sequence)
  );
}

function chooseGroupReport(
  reports: ReportRuntime[],
  scenario: ScenarioDef,
  tSec: SimSeconds,
): ReportRuntime {
  const stances = new Set(reports.map((report) => report.def.stance));
  if (stances.size > 1) {
    return reports.reduce((latest, report) =>
      preferReport(report, latest) ? report : latest,
    );
  }
  return reports.reduce((strongest, report) => {
    const accuracy = (candidate: ReportRuntime) => {
      const channel = scenario.channels.find(
        (item) => item.id === candidate.def.channel,
      );
      if (!channel)
        throw new Error("Belief report references an unknown channel");
      return Math.abs(
        llr(
          effectiveAccuracy(
            candidate.def.rho,
            tSec - candidate.def.issuedAtSec,
            channel.tauSec,
            candidate.healthAtIssue,
          ),
          candidate.def.stance,
        ),
      );
    };
    const nextStrength = accuracy(report);
    const currentStrength = accuracy(strongest);
    return nextStrength > currentStrength ||
      (nextStrength === currentStrength && preferReport(report, strongest))
      ? report
      : strongest;
  });
}

export function computeBelief(
  scenario: ScenarioDef,
  state: SimState,
  tSec: SimSeconds,
  opts?: {
    visibleChannels?: ChannelId[];
    extraReports?: ReportRuntime[];
    excludeReportIds?: string[];
  },
): BeliefSnapshot {
  if (!Number.isSafeInteger(tSec) || tSec < 0) {
    throw new RangeError(
      "Belief evaluation time must be a nonnegative integer",
    );
  }
  const channels = new Map(
    scenario.channels.map((channel) => [channel.id, channel]),
  );
  const visible = opts?.visibleChannels
    ? new Set(opts.visibleChannels)
    : undefined;
  const excluded = new Set(opts?.excludeReportIds ?? []);
  const reportsById = new Map<string, ReportRuntime>(
    Object.values(state.reports).map((report) => [report.def.id, report]),
  );
  for (const report of opts?.extraReports ?? []) {
    reportsById.set(report.def.id, report);
  }
  const eligible = [...reportsById.values()].filter((report) => {
    const deliveredAt = report.deliveredAtSec;
    return (
      !excluded.has(report.def.id) &&
      report.status === "DELIVERED" &&
      deliveredAt !== null &&
      deliveredAt <= tSec &&
      report.def.issuedAtSec <= tSec &&
      report.def.hypothesisId !== null &&
      report.def.stance !== 0 &&
      (!visible || visible.has(report.def.channel))
    );
  });

  const perHypothesis: BeliefSnapshot["perHypothesis"] = {};
  const probabilities: number[] = [];
  for (const hypothesis of scenario.hypotheses) {
    const grouped = new Map<string, ReportRuntime[]>();
    for (const report of eligible) {
      if (report.def.hypothesisId !== hypothesis.id) continue;
      const group = grouped.get(report.def.evidenceGroup) ?? [];
      group.push(report);
      grouped.set(report.def.evidenceGroup, group);
    }
    const selected = [...grouped.values()].map((reports) =>
      chooseGroupReport(reports, scenario, tSec),
    );
    const contributions: EvidenceContribution[] = selected.map((report) => {
      const channel = channels.get(report.def.channel);
      if (!channel)
        throw new Error("Belief report references an unknown channel");
      const ageSec = tSec - report.def.issuedAtSec;
      const accuracy = effectiveAccuracy(
        report.def.rho,
        ageSec,
        channel.tauSec,
        report.healthAtIssue,
      );
      return {
        reportId: report.def.id,
        group: report.def.evidenceGroup,
        channel: report.def.channel,
        stance: report.def.stance,
        rho: report.def.rho,
        ageSec,
        effectiveAccuracy: accuracy,
        llr: llr(accuracy, report.def.stance),
        weight: 0,
      };
    });
    const maximum = contributions.reduce(
      (largest, contribution) => Math.max(largest, Math.abs(contribution.llr)),
      0,
    );
    contributions.forEach((contribution) => {
      contribution.weight =
        maximum === 0 ? 0 : Math.abs(contribution.llr) / maximum;
    });
    const priorOdds = Math.log(hypothesis.prior / (1 - hypothesis.prior));
    const logOdds = Math.max(
      -scenario.model.llrClamp,
      Math.min(
        scenario.model.llrClamp,
        priorOdds +
          contributions.reduce(
            (sum, contribution) => sum + contribution.llr,
            0,
          ),
      ),
    );
    const probability = logistic(logOdds);
    const entropyBits = binaryEntropy(probability);
    const contradiction = contradictionSummary(
      contributions,
      scenario.model.contradictionMinNats,
      scenario.model.contradictionThreshold,
    );
    perHypothesis[hypothesis.id as HypothesisId] = {
      p: probability,
      logOdds,
      entropyBits,
      contributions,
      positiveNats: contradiction.positiveNats,
      negativeNats: contradiction.negativeNats,
      contradictionIndex: contradiction.index,
      contradicted: contradiction.contradicted,
    };
    probabilities.push(probability);
  }
  return { atSec: tSec, perHypothesis, fogIndex: fogIndex(probabilities) };
}
