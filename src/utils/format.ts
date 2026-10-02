export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatPercent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatAge(ageSec: number): string {
  if (ageSec < 60) return `${Math.floor(ageSec)}s old`;
  const minutes = Math.floor(ageSec / 60);
  const seconds = Math.floor(ageSec % 60);
  return seconds === 0 ? `${minutes}m old` : `${minutes}m ${seconds}s old`;
}
