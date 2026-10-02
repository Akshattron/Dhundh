import type { EvidenceContribution } from "./types";

export interface ContradictionSummary {
  positiveNats: number;
  negativeNats: number;
  index: number;
  contradicted: boolean;
}

export function contradictionSummary(
  contributions: readonly Pick<EvidenceContribution, "llr">[],
  minimumNats: number,
  threshold: number,
): ContradictionSummary {
  if (
    !Number.isFinite(minimumNats) ||
    minimumNats < 0 ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1
  ) {
    throw new RangeError("Contradiction thresholds are invalid");
  }
  const positiveNats = contributions.reduce(
    (sum, contribution) =>
      contribution.llr > 0 ? sum + contribution.llr : sum,
    0,
  );
  const negativeNats = contributions.reduce(
    (sum, contribution) =>
      contribution.llr < 0 ? sum + Math.abs(contribution.llr) : sum,
    0,
  );
  const total = positiveNats + negativeNats;
  const index =
    total >= 0.2 ? 1 - Math.abs(positiveNats - negativeNats) / total : 0;
  return {
    positiveNats,
    negativeNats,
    index,
    contradicted:
      index >= threshold && Math.min(positiveNats, negativeNats) >= minimumNats,
  };
}
