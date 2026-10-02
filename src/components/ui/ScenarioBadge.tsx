import styles from "./ScenarioBadge.module.css";

export function ScenarioBadge() {
  return (
    <div className={styles.wrap}>
      <span className={styles.badge}>
        Synthetic scenario — fictional entities
      </span>
      <span className={styles.provenance}>
        Reliabilities and payoffs are authoring assumptions, not doctrine.
      </span>
    </div>
  );
}
