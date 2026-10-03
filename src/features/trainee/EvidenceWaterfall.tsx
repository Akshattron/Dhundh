import { useEffect, useId, useRef, useState } from "react";
import { formatClock } from "@/utils/format";
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

export function EvidenceWaterfall({
  hypotheses,
  onOpen,
  inspectionEnabled = true,
}: {
  hypotheses: WaterfallHypothesis[];
  onOpen?: (reportId: string) => void;
  inspectionEnabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const instanceId = useId().replaceAll(":", "");

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const measured = element.getBoundingClientRect().width;
      if (measured > 0) setWidth(Math.max(280, Math.floor(measured)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.root} ref={root}>
      {hypotheses.map((hypothesis) => {
        const contributions = hypothesis.contributions;
        const maxMagnitude = Math.max(
          0,
          ...contributions
            .filter((item) => item.inspected)
            .map((item) => Math.abs(item.llr ?? 0)),
        );
        const height = 32 + contributions.length * 56;
        const anchor = width / 2;
        const prefix = `waterfall-${instanceId}-${hypothesis.id}`;
        return (
          <section className={styles.hypothesis} key={hypothesis.id}>
            <h3>{hypothesis.label}</h3>
            <p className={styles.anchorText}>
              Prior log-odds {hypothesis.priorLogOdds.toFixed(3)} → current{" "}
              {hypothesis.currentLogOdds.toFixed(3)}
            </p>
            <div className={styles.chartViewport}>
              <svg
                className={styles.chart}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                role="group"
                aria-labelledby={`${prefix}-title ${prefix}-desc`}
              >
                <title id={`${prefix}-title`}>
                  Evidence waterfall for {hypothesis.label}
                </title>
                <desc id={`${prefix}-desc`}>
                  Signed log-likelihood contributions by evidence group.
                  Positive values extend right of the prior log-odds anchor;
                  negative values extend left. Unopened reports have no signed
                  bar.
                </desc>
                <defs>
                  <pattern
                    id={`${prefix}-unopened`}
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
                  x1={anchor}
                  x2={anchor}
                  y1="24"
                  y2={height}
                  className={styles.anchor}
                />
                <text x="12" y="17" className={styles.axisLabel}>
                  Against
                </text>
                <text x={anchor} y="17" className={styles.anchorLabel}>
                  Prior anchor
                </text>
                <text x={width - 12} y="17" className={styles.value}>
                  For
                </text>
                {contributions.map((item, index) => {
                  const y = 28 + index * 56;
                  const signedValue = item.inspected ? item.llr : null;
                  const known = signedValue !== null;
                  const magnitude = Math.abs(signedValue ?? 0);
                  const barWidth =
                    maxMagnitude === 0
                      ? 0
                      : (magnitude / maxMagnitude) * (anchor - 16);
                  const x =
                    signedValue !== null && signedValue < 0
                      ? anchor - barWidth
                      : anchor;
                  const canOpen =
                    !known && Boolean(onOpen) && inspectionEnabled;
                  const instruction = !onOpen
                    ? "Not inspected at this time; signed contribution withheld."
                    : inspectionEnabled
                      ? "Open report to inspect its signed contribution."
                      : "Inspection unavailable while the clock is not running.";
                  const label = known
                    ? `${item.reportId}, ${item.claim}, source grade ${item.gradeLabel}, age ${formatClock(item.ageSec)}, effective accuracy ${item.effectiveAccuracy === null ? "unavailable" : `${(item.effectiveAccuracy * 100).toFixed(1)} percent`}, contribution ${signedValue.toFixed(3)} nats, evidence group ${item.group}`
                    : `${item.reportId}, ${item.claim}, evidence group ${item.group}. ${instruction}`;
                  return (
                    <g
                      key={`${item.group}-${item.reportId}`}
                      className={`${styles.row} ${canOpen ? styles.openable : ""} ${signedValue !== null && signedValue < 0 ? styles.negative : ""}`}
                      data-channel={item.channel}
                      tabIndex={0}
                      role={!known && onOpen ? "button" : "img"}
                      aria-disabled={
                        !known && onOpen ? !inspectionEnabled : undefined
                      }
                      aria-label={label}
                      aria-describedby={`${prefix}-summary`}
                      onClick={() => {
                        if (canOpen) onOpen?.(item.reportId);
                      }}
                      onKeyDown={(event) => {
                        if (
                          canOpen &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          onOpen?.(item.reportId);
                        }
                      }}
                    >
                      <title>{label}</title>
                      <rect
                        className={styles.hitArea}
                        x="1"
                        y={y}
                        width={width - 2}
                        height="54"
                        rx="4"
                      />
                      <line
                        className={styles.channelMark}
                        x1="4"
                        x2="4"
                        y1={y + 8}
                        y2={y + 32}
                      />
                      {known ? (
                        <rect
                          x={x}
                          y={y + 42}
                          width={barWidth}
                          height="8"
                          rx="2"
                          className={styles.bar}
                        />
                      ) : (
                        <rect
                          x={anchor - 8}
                          y={y + 40}
                          width="16"
                          height="10"
                          rx="2"
                          fill={`url(#${prefix}-unopened)`}
                          className={styles.unknown}
                        />
                      )}
                      <text x="12" y={y + 17} className={styles.reportId}>
                        {item.reportId} · {item.channel}
                      </text>
                      <text x="12" y={y + 33} className={styles.group}>
                        {item.group}
                      </text>
                      <text x={width - 12} y={y + 17} className={styles.value}>
                        {known
                          ? `${signedValue >= 0 ? "+" : ""}${signedValue.toFixed(3)} nats`
                          : !onOpen
                            ? "Not inspected"
                            : inspectionEnabled
                              ? "Open to inspect"
                              : "Inspection paused"}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <p id={`${prefix}-summary`} className={styles.summary}>
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
