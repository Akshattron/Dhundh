import styles from "./EvidenceWaterfall.module.css";

export interface WaterfallContribution {
  reportId: string;
  group: string;
  channel: string;
  claim: string;
  gradeLabel: string;
  ageSec: number;
  effectiveAccuracy: number | null;
  llr: number | null;
  inspected: boolean;
}

export interface WaterfallHypothesis {
  id: string;
  label: string;
  priorLogOdds: number;
  currentLogOdds: number;
  contributions: WaterfallContribution[];
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function EvidenceWaterfall({
  hypotheses,
  onOpen,
}: {
  hypotheses: WaterfallHypothesis[];
  onOpen?: (reportId: string) => void;
}) {
  return (
    <div className={styles.root}>
      {hypotheses.map((hypothesis) => {
        const contributions = hypothesis.contributions;
        const maxMagnitude = Math.max(
          0,
          ...contributions.map((item) => Math.abs(item.llr ?? 0)),
        );
        const height = Math.max(72, 32 + contributions.length * 34);
        return (
          <section className={styles.hypothesis} key={hypothesis.id}>
            <h3>{hypothesis.label}</h3>
            <p className={styles.anchorText}>
              Prior log-odds {hypothesis.priorLogOdds.toFixed(3)} → current{" "}
              {hypothesis.currentLogOdds.toFixed(3)}
            </p>
            <svg
              className={styles.chart}
              viewBox={`0 0 720 ${height}`}
              role="img"
              aria-labelledby={`waterfall-title-${hypothesis.id} waterfall-desc-${hypothesis.id}`}
            >
              <title id={`waterfall-title-${hypothesis.id}`}>
                Evidence waterfall for {hypothesis.label}
              </title>
              <desc id={`waterfall-desc-${hypothesis.id}`}>
                Signed log-likelihood contributions by evidence group. Positive
                values extend right of the prior log-odds anchor; negative
                values extend left. Unopened reports have no signed bar.
              </desc>
              <defs>
                <pattern
                  id={`waterfall-unopened-${hypothesis.id}`}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="6" height="6" fill="var(--surface-2)" />
                  <path
                    d="M-1 1L1-1M0 6L6 0M5 7L7 5"
                    stroke="var(--text-muted)"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <line
                x1="360"
                x2="360"
                y1="24"
                y2={height - 8}
                className={styles.anchor}
              />
              <text x="364" y="17" className={styles.anchorLabel}>
                prior
              </text>
              {contributions.map((item, index) => {
                const y = 37 + index * 34;
                const magnitude = Math.abs(item.llr ?? 0);
                const barWidth =
                  maxMagnitude === 0 ? 0 : (magnitude / maxMagnitude) * 235;
                const x =
                  item.llr !== null && item.llr < 0 ? 360 - barWidth : 360;
                const known = item.llr !== null && item.inspected;
                const label = known
                  ? `${item.reportId}, ${item.claim}, source grade ${item.gradeLabel}, age ${clock(item.ageSec)}, effective accuracy ${item.effectiveAccuracy === null ? "unavailable" : `${(item.effectiveAccuracy * 100).toFixed(1)} percent`}, contribution ${item.llr?.toFixed(3)} nats, evidence group ${item.group}`
                  : `${item.reportId}, ${item.claim}, evidence group ${item.group}. Open report to inspect its signed contribution.`;
                return (
                  <g
                    key={`${item.group}-${item.reportId}`}
                    className={`${styles.row} ${known ? styles.inspected : styles.unopened} ${item.llr !== null && item.llr < 0 ? styles.negative : ""}`}
                    tabIndex={0}
                    role={known ? "img" : "button"}
                    aria-label={label}
                    aria-describedby={`waterfall-summary-${hypothesis.id}`}
                    onClick={() => {
                      if (!known) onOpen?.(item.reportId);
                    }}
                    onKeyDown={(event) => {
                      if (
                        !known &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        onOpen?.(item.reportId);
                      }
                    }}
                  >
                    <title>{label}</title>
                    {known ? (
                      <rect
                        x={x}
                        y={y}
                        width={Math.max(2, barWidth)}
                        height="14"
                        rx="2"
                        className={styles.bar}
                      />
                    ) : (
                      <rect
                        x="352"
                        y={y}
                        width="16"
                        height="14"
                        rx="2"
                        fill={`url(#waterfall-unopened-${hypothesis.id})`}
                        className={styles.unknown}
                      />
                    )}
                    <text x="10" y={y + 11} className={styles.reportId}>
                      {item.reportId}
                    </text>
                    <text x="72" y={y + 11} className={styles.group}>
                      {item.group}
                    </text>
                    <text x="385" y={y + 11} className={styles.value}>
                      {known
                        ? `${item.llr! >= 0 ? "+" : ""}${item.llr!.toFixed(3)} nats`
                        : "Open to inspect"}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p
              id={`waterfall-summary-${hypothesis.id}`}
              className={styles.summary}
            >
              {contributions.length === 0
                ? "No delivered evidence groups contribute yet."
                : `${contributions.length} contributing evidence group${contributions.length === 1 ? "" : "s"}; prior log-odds ${hypothesis.priorLogOdds.toFixed(3)}, posterior log-odds ${hypothesis.currentLogOdds.toFixed(3)}. Positive evidence extends right; negative evidence extends left.`}
            </p>
          </section>
        );
      })}
    </div>
  );
}
