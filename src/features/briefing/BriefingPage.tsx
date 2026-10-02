import { ArrowRight, Check, Clock3, Shield } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { ScenarioBadge } from "@/components/ui/ScenarioBadge";
import { createLocalSession } from "@/session/LocalSessionClient";
import { useSessionStore } from "@/state/useSessionStore";
import { scenarios } from "@/scenarios";
import { formatClock } from "@/utils/format";
import styles from "./BriefingPage.module.css";

export default function BriefingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const scenario = scenarios.find((item) => item.meta.id === id);
  const setClient = useSessionStore((store) => store.setClient);

  if (!scenario) {
    return (
      <section className={styles.missing}>
        <h1>Scenario unavailable</h1>
        <p>This scenario is not in the validated local library.</p>
        <Button onClick={() => navigate("/scenarios")}>
          Return to library
        </Button>
      </section>
    );
  }

  const startExercise = () => {
    const client = createLocalSession(scenario, {
      seed: 0,
      difficultyLevel: scenario.meta.difficulty,
      aidMode: "ALWAYS",
      speedSecPerMin: 4,
    });
    client.dispatch({ type: "START" });
    setClient(client, client.getSnapshot());
    navigate(`/session/local/${scenario.meta.id}`);
  };

  return (
    <article className={styles.page}>
      <div className={styles.top}>
        <div>
          <p className={styles.kicker}>Exercise briefing</p>
          <h1>{scenario.meta.title}</h1>
          <p className={styles.subtitle}>{scenario.meta.subtitle}</p>
        </div>
        <ScenarioBadge />
      </div>
      <section className={styles.summary}>
        <h2>Situation</h2>
        <p>{scenario.meta.summary}</p>
        <div className={styles.notice}>
          This is a synthetic training scenario. The reference model is a
          transparent scoring baseline, not real doctrine.
        </div>
      </section>
      <div className={styles.columns}>
        <section className={styles.panel}>
          <h2>Briefing</h2>
          <ol>
            {scenario.meta.briefing.map((paragraph) => (
              <li key={paragraph}>
                <span>
                  <Check size={14} aria-hidden="true" />
                </span>
                {paragraph}
              </li>
            ))}
          </ol>
        </section>
        <section className={styles.panel}>
          <h2>Decision context</h2>
          <div className={styles.metric}>
            <Clock3 size={17} aria-hidden="true" />
            <span>Decision deadline</span>
            <strong>
              {formatClock(scenario.decisionPoints[0]?.closeSec ?? 0)}
            </strong>
          </div>
          <div className={styles.metric}>
            <Shield size={17} aria-hidden="true" />
            <span>Verification assets</span>
            <strong>{scenario.assets.length}</strong>
          </div>
          <div className={styles.actionList}>
            {scenario.decisionPoints[0]?.actions.map((action) => (
              <div key={action.id}>
                <strong>{action.label}</strong>
                <p>{action.description}</p>
              </div>
            ))}
          </div>
          <details className={styles.payoff}>
            <summary>Payoff reference</summary>
            {scenario.decisionPoints[0]?.actions.map((action) => (
              <div key={action.id}>
                <strong>{action.label}</strong>
                {action.utility.map((rule, index) => (
                  <p key={`${action.id}-${index}`}>
                    {Object.keys(rule.when).length
                      ? Object.entries(rule.when)
                          .map(([key, value]) => {
                            const hypothesis = scenario.hypotheses.find(
                              (item) => item.id === key,
                            );
                            return `${hypothesis?.label ?? key}: ${value ? "true" : "false"}`;
                          })
                          .join("; ")
                      : "Any state"}{" "}
                    — {rule.value} points
                  </p>
                ))}
              </div>
            ))}
          </details>
        </section>
      </div>
      <div className={styles.bottom}>
        <span>
          {formatClock(scenario.meta.durationSec)} exercise horizon · local
          deterministic session
        </span>
        <Button
          variant="primary"
          size="lg"
          onClick={startExercise}
          data-testid="start-exercise"
        >
          Start exercise <ArrowRight size={17} aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
