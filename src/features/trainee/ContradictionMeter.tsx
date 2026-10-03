import { useId } from "react";
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
  const suffix = useId().replaceAll(":", "");
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
        <span>{contradicted ? "Evidence is split" : "No conflict flag"}</span>
      </div>
      <div className={styles.masses}>
        <span>
          Supports false <strong>{negativeNats.toFixed(2)} nats</strong>
        </span>
        <span>
          Supports true <strong>{positiveNats.toFixed(2)} nats</strong>
        </span>
      </div>
      <svg
        viewBox="0 0 320 28"
        preserveAspectRatio="none"
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
        <line x1="160" x2="160" y1="0" y2="28" className={styles.spine} />
        <rect
          x="160"
          y="6"
          width={supportWidth}
          height="15"
          rx="3"
          className={styles.positive}
        />
        <rect
          x={160 - opposeWidth}
          y="6"
          width={opposeWidth}
          height="15"
          rx="3"
          fill={`url(#${patternId})`}
          className={styles.negative}
        />
      </svg>
      <details className={styles.interpretation}>
        <summary>Thresholds and interpretation</summary>
        <p id={descriptionId} className={styles.description}>
          {contradicted
            ? "The evidence is split; this describes disagreement among reports, not that the system is wrong."
            : "No contradiction is flagged. The index must meet its threshold and both sides must meet the minimum evidence mass."}{" "}
          Index {index.toFixed(2)} / threshold {threshold.toFixed(2)}; minimum
          mass {minimumNats.toFixed(2)} nats on both sides.
        </p>
      </details>
      <p className="sr-only">
        Supports true: {positiveNats.toFixed(2)} nats · supports false:{" "}
        {negativeNats.toFixed(2)} nats · contradiction index {index.toFixed(2)}
      </p>
    </section>
  );
}
