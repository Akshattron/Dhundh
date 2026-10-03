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
  const historyUnavailable = error !== null && entries.length === 0;

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
        {historyUnavailable ? (
          <p className={styles.empty}>
            History is unavailable. No saved summaries have been cleared.
          </p>
        ) : (
          <>
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
                <strong>
                  {meanBrier === null ? "—" : meanBrier.toFixed(3)}
                </strong>
                <small>
                  {entries.filter((entry) => entry.brierUser !== null).length}{" "}
                  {entries.filter((entry) => entry.brierUser !== null)
                    .length === 1
                    ? "run"
                    : "runs"}{" "}
                  with recorded estimates
                </small>
              </div>
            </div>
            {entries.length > 0 && <HistoryTrend entries={entries} />}
          </>
        )}
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
        {historyUnavailable ? (
          <p className={styles.caption}>
            Resolve the storage error or explicitly clear the unreadable
            history.
          </p>
        ) : entries.length === 0 ? (
          <div className={styles.empty}>
            <p>Completed AARs will appear here after they are opened.</p>
            <Button onClick={() => navigate("/scenarios")}>
              Choose an exercise
            </Button>
          </div>
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
        scenario truth are not saved to history. Verification habits and
        per-decision quadrant classifications are not retained in these
        summaries; inspect them in the completed AAR.
      </p>
    </article>
  );
}

function HistoryTrend({ entries }: { entries: SessionHistoryEntry[] }) {
  const runs = [...entries].reverse();
  const x = (index: number) =>
    runs.length === 1 ? 300 : (index / (runs.length - 1)) * 600;
  const scorePoints = runs
    .map(
      (entry, index) =>
        `${x(index)},${160 - (entry.trainingScore / 100) * 160}`,
    )
    .join(" ");
  const qualityPoints = runs
    .map((entry, index) => `${x(index)},${160 - entry.decisionQuality * 160}`)
    .join(" ");
  return (
    <figure className={styles.trend}>
      <figcaption>
        <h3>Score and decision quality</h3>
        <span>
          {" "}
          Recorded run order · {runs.length}{" "}
          {runs.length === 1 ? "observation" : "observations"}
        </span>
      </figcaption>
      <div className={styles.trendLegend}>
        <span>
          <i className={styles.scoreLine} /> Training score / 100
        </span>
        <span>
          <i className={styles.qualityLine} /> Decision quality %
        </span>
      </div>
      <div className={styles.trendPlot}>
        <div className={styles.trendAxis} aria-hidden="true">
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
        <svg
          viewBox="-6 -6 612 172"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Score and decision quality across ${runs.length} recorded runs. Full values are listed below.`}
        >
          {[0, 80, 160].map((y) => (
            <line
              key={y}
              x1="0"
              x2="600"
              y1={y}
              y2={y}
              className={styles.trendGrid}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <polyline
            points={scorePoints}
            className={styles.scoreSeries}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={qualityPoints}
            className={styles.qualitySeries}
            vectorEffect="non-scaling-stroke"
          />
          {runs.map((entry, index) => (
            <g key={entry.id}>
              <title>{`Run ${index + 1} · ${entry.scenarioTitle}: training score ${entry.trainingScore.toFixed(1)} / 100; decision quality ${formatPercent(entry.decisionQuality, 1)}`}</title>
              <circle
                cx={x(index)}
                cy={160 - (entry.trainingScore / 100) * 160}
                r="4"
                className={styles.scorePoint}
              />
              <rect
                x={x(index) - 3}
                y={160 - entry.decisionQuality * 160 - 3}
                width="6"
                height="6"
                className={styles.qualityPoint}
              />
            </g>
          ))}
        </svg>
      </div>
      <div className={styles.trendDates}>
        <span>{new Date(runs[0]!.completedAt).toLocaleDateString()}</span>
        <span>{new Date(runs.at(-1)!.completedAt).toLocaleDateString()}</span>
      </div>
      <p className={styles.caption}>
        {runs.length === 1
          ? "One recorded run; more completions are needed to compare change."
          : "Connected points show stored runs, not predictions or validated improvement. Different scenarios and difficulty profiles are not controlled comparisons."}
      </p>
    </figure>
  );
}
