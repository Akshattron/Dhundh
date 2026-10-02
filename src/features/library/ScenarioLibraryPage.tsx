import { ArrowRight, Clock3, Layers3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { ScenarioBadge } from "@/components/ui/ScenarioBadge";
import { scenarios } from "@/scenarios";
import { formatClock } from "@/utils/format";
import styles from "./ScenarioLibraryPage.module.css";

export default function ScenarioLibraryPage() {
  const navigate = useNavigate();
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
        <ScenarioBadge />
      </div>
      <div className={styles.list}>
        {scenarios.map((scenario) => (
          <article className={styles.scenario} key={scenario.meta.id}>
            <div className={styles.scenarioMain}>
              <div className={styles.scenarioTitle}>
                <span className={styles.index}>
                  0{scenario.meta.difficulty}
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
                  {scenario.decisionPoints.length} decision point
                </span>
                <span>Difficulty {scenario.meta.difficulty}/5</span>
              </div>
              <div className={styles.tags}>
                {scenario.meta.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
            <div className={styles.launch}>
              <Button
                variant="primary"
                onClick={() =>
                  navigate(`/scenario/${scenario.meta.id}/briefing`)
                }
                data-testid="scenario-launch"
              >
                View briefing <ArrowRight size={15} aria-hidden="true" />
              </Button>
              <span>Validated synthetic scenario · fictional</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
