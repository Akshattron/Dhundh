import styles from "./HomePage.module.css";

export default function HomePage() {
  return (
    <main className={styles.foundation}>
      <header>
        <p className={styles.provenance}>Synthetic training environment</p>
        <h1 className={styles.wordmark}>DHUNDH</h1>
        <p className={styles.subtitle}>
          Decision Training Under Degraded Information
        </p>
      </header>
      <section className={styles.status} aria-labelledby="foundation-heading">
        <h2 id="foundation-heading">Gate 0 &mdash; Engineering Foundation</h2>
        <p>
          Application and server tooling only. Scenarios and simulation features
          are not implemented yet.
        </p>
      </section>
      <footer className={styles.disclosure}>
        Fictional, non-operational training. No real-world data or doctrine.
      </footer>
    </main>
  );
}
