export function calibrationAlignment(q: number, pSys: number): number {
  if (
    !Number.isFinite(q) ||
    q < 0 ||
    q > 1 ||
    !Number.isFinite(pSys) ||
    pSys < 0 ||
    pSys > 1
  ) {
    throw new RangeError("Calibration probabilities must be between 0 and 1");
  }
  return 1 - Math.min(1, Math.abs(q - pSys) / 0.5);
}

export function brier(q: number, truth: boolean): number {
  if (!Number.isFinite(q) || q < 0 || q > 1) {
    throw new RangeError("Estimate must be between 0 and 1");
  }
  return (q - (truth ? 1 : 0)) ** 2;
}
