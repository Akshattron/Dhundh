import { useEffect, useState } from "react";
import { ArrowLeft, ChartNoAxesColumnIncreasing, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import {
  clearSessionHistory,
  readSessionHistory,
  type SessionHistoryEntry,
} from "@/session/history";
import { formatPercent } from "@/utils/format";
import styles from "./HistoryPage.module.css";

function average(
  entries: SessionHistoryEntry[],
  select: (entry: SessionHistoryEntry) => number | null,
): number | null {
  const values = entries.flatMap((entry) => {
    const value = select(entry);
    return value === null ? [] : [value];
  });
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<SessionHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setEntries(readSessionHistory());
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Session history could not be loaded.",
      );
    }
  }, []);

  const clear = () => {
    if (!window.confirm("Clear all locally saved session summaries?")) return;
    try {
      clearSessionHistory();
      setEntries([]);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Session history could not be cleared.",
      );
    }
  };

  const meanQuality = average(entries, (entry) => entry.decisionQuality);
  const meanOutcome = average(entries, (entry) => entry.outcome);
  const meanBrier = average(entries, (entry) => entry.brierUser);

  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>
            Local learning record · synthetic only
          </p>
          <h1>Session history</h1>
          <p>
            Compare decision process and outcome across completed exercises;
            one-run metrics are noisy and are not predictions.
          </p>
        </div>
        <Button variant="quiet" onClick={() => navigate("/")}>
          <ArrowLeft size={15} /> Home
        </Button>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <section className={styles.analytics} aria-label="Learning analytics">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Across completed sessions</p>
            <h2>Learning signals</h2>
          </div>
          <ChartNoAxesColumnIncreasing size={19} aria-hidden="true" />
        </div>
        <div className={styles.metrics}>
          <div>
            <span>Recorded runs</span>
            <strong>{entries.length}</strong>
          </div>
          <div>
            <span>Mean decision quality</span>
            <strong>
              {meanQuality === null ? "—" : formatPercent(meanQuality, 1)}
            </strong>
          </div>
          <div>
            <span>Mean outcome</span>
            <strong>
              {meanOutcome === null ? "—" : formatPercent(meanOutcome, 1)}
            </strong>
          </div>
          <div>
            <span>Mean estimate Brier</span>
            <strong>{meanBrier === null ? "—" : meanBrier.toFixed(3)}</strong>
          </div>
        </div>
        <p className={styles.caption}>
          Decision quality evaluates choices against information available at
          commitment. Outcome is reported separately; realized luck does not
          replace process quality.
        </p>
      </section>

      <section className={styles.history}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Most recent first · up to 100 runs</p>
            <h2>Completed exercises</h2>
          </div>
          <Button
            size="sm"
            variant="quiet"
            disabled={entries.length === 0 && !error}
            onClick={clear}
          >
            <Trash2 size={14} /> Clear history
          </Button>
        </div>
        {entries.length === 0 ? (
          <p className={styles.empty}>
            Completed AARs will appear here after they are opened.
          </p>
        ) : (
          <div className={styles.list}>
            {entries.map((entry) => (
              <article className={styles.entry} key={entry.id}>
                <div className={styles.entryTitle}>
                  <div>
                    <h3>{entry.scenarioTitle}</h3>
                    <p>
                      {new Date(entry.completedAt).toLocaleString()} ·{" "}
                      {entry.source === "NETWORKED"
                        ? "team session"
                        : "local session"}{" "}
                      · Difficulty {entry.difficultyLevel}
                    </p>
                  </div>
                  <strong>{entry.trainingScore.toFixed(1)} / 100</strong>
                </div>
                <div className={styles.entryMetrics}>
                  <span>
                    {entry.decisionCount} decision
                    {entry.decisionCount === 1 ? "" : "s"}
                  </span>
                  <span>
                    Decision quality {formatPercent(entry.decisionQuality)}
                  </span>
                  <span>Outcome {formatPercent(entry.outcome)}</span>
                  <span>
                    Information use {formatPercent(entry.informationUse)}
                  </span>
                  <span>
                    Brier{" "}
                    {entry.brierUser === null
                      ? "not recorded"
                      : entry.brierUser.toFixed(3)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className={styles.caption}>
        Only aggregate scores and scenario metadata are stored in this
        browser&apos;s local storage. Raw logs, estimates, rationale, and hidden
        scenario truth are not saved to history.
      </p>
    </article>
  );
}
