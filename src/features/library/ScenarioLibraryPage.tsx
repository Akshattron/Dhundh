import { ArrowRight, Clock3, Layers3, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { ScenarioBadge } from "@/components/ui/ScenarioBadge";
import { scenarios } from "@/scenarios";
import {
  readSessionHistory,
  type SessionHistoryEntry,
} from "@/session/history";
import { ChannelIcon } from "@/features/trainee/ChannelHealthStrip";
import { formatClock } from "@/utils/format";
import styles from "./ScenarioLibraryPage.module.css";

export default function ScenarioLibraryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<SessionHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  useEffect(() => {
    try {
      setHistory(readSessionHistory());
    } catch (cause) {
      setHistoryError(
        cause instanceof Error
          ? cause.message
          : "Local attempt history could not be read.",
      );
    }
  }, []);
  return (
    <section className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.kicker}>Training scenarios</p>
          <h1>Scenario library</h1>
          <p>
            Choose a deterministic exercise built around incomplete information.
          </p>
        </div>
        <div>
          <Button variant="quiet" onClick={() => navigate("/authoring")}>
            Author a synthetic scenario
          </Button>
        </div>
      </div>
      <ScenarioBadge />
      {historyError && (
        <p className={styles.historyError} role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {historyError} Exercises remain available.
        </p>
      )}
      <div className={styles.list}>
        {scenarios.map((scenario, index) => {
          const lastAttempt = history?.find(
            (entry) => entry.scenarioId === scenario.meta.id,
          );
          const focus = scenario.meta.tags.filter(
            (tag) =>
              !["land", "air", "cyber", "ew"].includes(tag.toLowerCase()),
          );
          return (
            <article className={styles.scenario} key={scenario.meta.id}>
              <div className={styles.scenarioMain}>
                <div className={styles.scenarioTitle}>
                  <span className={styles.index}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h2>{scenario.meta.title}</h2>
                    <p>{scenario.meta.subtitle}</p>
                  </div>
                </div>
                <p className={styles.summary}>{scenario.meta.summary}</p>
                <div className={styles.meta}>
                  <span>
                    <Clock3 size={14} aria-hidden="true" />{" "}
                    {formatClock(scenario.meta.durationSec)} exercise horizon
                  </span>
                  <span>
                    <Layers3 size={14} aria-hidden="true" />{" "}
                    {scenario.decisionPoints.length} decision{" "}
                    {scenario.decisionPoints.length === 1 ? "point" : "points"}
                  </span>
                  <span>Difficulty {scenario.meta.difficulty}/5</span>
                </div>
                <div className={styles.tags}>
                  {scenario.channels.map((channel) => (
                    <span key={channel.id} data-channel={channel.id}>
                      <ChannelIcon channel={channel.id} />
                      {channel.id}
                    </span>
                  ))}
                </div>
                {focus.length > 0 && (
                  <p className={styles.focus}>
                    <strong>Training focus</strong>{" "}
                    {focus.map((tag) => tag.replaceAll("-", " ")).join(" / ")}
                  </p>
                )}
              </div>
              <div className={styles.launch}>
                <div className={styles.lastAttempt}>
                  <span>Last attempt</span>
                  {lastAttempt ? (
                    <>
                      <strong>
                        {lastAttempt.trainingScore.toFixed(1)} / 100
                      </strong>
                      <span>
                        <time dateTime={lastAttempt.completedAt}>
                          {new Date(
                            lastAttempt.completedAt,
                          ).toLocaleDateString()}
                        </time>{" "}
                        · Difficulty {lastAttempt.difficultyLevel}
                      </span>
                    </>
                  ) : (
                    <span>
                      {historyError
                        ? "Local record unavailable"
                        : history === null
                          ? "Loading local record..."
                          : "Not attempted in this browser"}
                    </span>
                  )}
                </div>
                <Button
                  variant={index === 0 ? "primary" : "secondary"}
                  onClick={() =>
                    navigate(`/scenario/${scenario.meta.id}/briefing`)
                  }
                  data-testid="scenario-launch"
                >
                  View briefing <ArrowRight size={15} aria-hidden="true" />
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
