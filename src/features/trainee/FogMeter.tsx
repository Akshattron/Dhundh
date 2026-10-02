import styles from "./FogMeter.module.css";

export function FogMeter({ value }: { value: number }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className={styles.root}
      role="img"
      aria-label={`Fog Index ${percent} percent. Average uncertainty across hypotheses. Zero percent is certain; one hundred percent is a coin flip.`}
      title="Average uncertainty across hypotheses. 0% = certain, 100% = coin flip."
    >
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className={styles.track} cx="22" cy="22" r="17" />
        <circle
          className={styles.value}
          cx="22"
          cy="22"
          r="17"
          pathLength="100"
          strokeDasharray={`${percent} 100`}
        />
      </svg>
      <span>
        <strong>Fog · {percent}%</strong>
        <small>Average uncertainty</small>
      </span>
    </div>
  );
}
