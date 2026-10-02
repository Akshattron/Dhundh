import { GitCompareArrows } from "lucide-react";
import styles from "./ContradictionMeter.module.css";

export function ContradictionMeter({
  hypothesis,
  positiveNats,
  negativeNats,
  index,
  threshold,
  minimumNats,
  contradicted,
}: {
  hypothesis: string;
  positiveNats: number;
  negativeNats: number;
  index: number;
  threshold: number;
  minimumNats: number;
  contradicted: boolean;
}) {
  const maximum = Math.max(0.2, positiveNats, negativeNats);
  const supportWidth = (positiveNats / maximum) * 122;
  const opposeWidth = (negativeNats / maximum) * 122;
  const suffix = hypothesis.replaceAll(/[^a-z0-9]/gi, "-");
  const titleId = `conflict-title-${suffix}`;
  const descriptionId = `${titleId}-description`;
  const patternId = `conflict-pattern-${suffix}`;

  return (
    <section
      className={styles.root}
      aria-labelledby={titleId}
      data-conflicted={contradicted}
    >
      <div className={styles.heading}>
        <GitCompareArrows size={16} aria-hidden="true" />
        <strong id={titleId}>Evidence balance · {hypothesis}</strong>
        <span>{contradicted ? "Evidence conflicts" : "No conflict flag"}</span>
      </div>
      <svg
        viewBox="0 0 320 82"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <rect width="6" height="6" fill="var(--surface-2)" />
            <path d="M-1 1L1-1M0 6L6 0M5 7L7 5" stroke="var(--accent-violet)" />
          </pattern>
        </defs>
        <text x="8" y="21" className={styles.label}>
          SUPPORTS TRUE
        </text>
        <text x="8" y="70" className={styles.label}>
          SUPPORTS FALSE
        </text>
        <line x1="160" x2="160" y1="11" y2="72" className={styles.spine} />
        <rect
          x="160"
          y="10"
          width={supportWidth}
          height="15"
          rx="3"
          className={styles.positive}
        />
        <rect
          x={160 - opposeWidth}
          y="55"
          width={opposeWidth}
          height="15"
          rx="3"
          fill={`url(#${patternId})`}
          className={styles.negative}
        />
        <text x="287" y="21" className={styles.mass}>
          {positiveNats.toFixed(2)}
        </text>
        <text x="287" y="70" className={styles.mass}>
          {negativeNats.toFixed(2)}
        </text>
      </svg>
      <p id={descriptionId} className={styles.description}>
        {contradicted
          ? "The evidence is split; this describes disagreement among reports, not that the system is wrong."
          : "No contradiction is flagged. The index must meet its threshold and both sides must meet the minimum evidence mass."}{" "}
        Index {index.toFixed(2)} / threshold {threshold.toFixed(2)}; minimum
        mass {minimumNats.toFixed(2)} nats on both sides.
      </p>
      <p className={styles.textSummary}>
        Supports true: {positiveNats.toFixed(2)} nats · supports false:{" "}
        {negativeNats.toFixed(2)} nats · contradiction index {index.toFixed(2)}
      </p>
    </section>
  );
}
