export function binaryEntropy(p: number): number {
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new RangeError("Probability must be between 0 and 1");
  }
  if (p === 0 || p === 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

export function fogIndex(probabilities: readonly number[]): number {
  if (probabilities.length === 0) {
    throw new RangeError("Fog requires at least one hypothesis");
  }
  return (
    probabilities.reduce(
      (sum, probability) => sum + binaryEntropy(probability),
      0,
    ) / probabilities.length
  );
}
