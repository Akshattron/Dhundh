import { ArrowRight, Clock3, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { ScenarioBadge } from "@/components/ui/ScenarioBadge";
import { ChannelIcon } from "@/features/trainee/ChannelHealthStrip";
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
  const [difficultyLevel, setDifficultyLevel] = useState<number>(
    scenario?.meta.difficulty ?? 3,
  );
  const [seed, setSeed] = useState("0");
  const [aidMode, setAidMode] = useState<"ALWAYS" | "AFTER_ESTIMATE">("ALWAYS");
  const [configurationError, setConfigurationError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (scenario) setDifficultyLevel(scenario.meta.difficulty);
  }, [scenario?.meta.id]);

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
    const parsedSeed = Number(seed);
    if (!Number.isSafeInteger(parsedSeed) || parsedSeed < 0) {
      setConfigurationError(
        "Scenario seed must be a nonnegative safe integer.",
      );
      return;
    }
    setConfigurationError(null);
    const client = createLocalSession(scenario, {
      seed: parsedSeed,
      difficultyLevel,
      aidMode,
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
          <h2>Context and constraints</h2>
          <ol>
            {scenario.meta.briefing.map((paragraph, index) => (
              <li key={paragraph}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {paragraph}
              </li>
            ))}
          </ol>
          <section className={styles.information}>
            <h2>Information available</h2>
            <div className={styles.channels}>
              {scenario.channels.map((channel) => (
                <div key={channel.id} data-channel={channel.id}>
                  <ChannelIcon channel={channel.id} />
                  <strong>{channel.id}</strong>
                  <span>{channel.sourceLabel}</span>
                </div>
              ))}
            </div>
            <p>
              Reports carry their source, issue time and receipt time. Inspect
              them before deciding; delayed or conflicting information may
              change the picture.
            </p>
          </section>
          <section className={styles.scoring}>
            <h2>How evaluation works</h2>
            <dl>
              <div>
                <dt>Decision quality</dt>
                <dd>
                  Evaluated against the information available at commitment, not
                  later truth.
                </dd>
              </div>
              <div>
                <dt>Outcome</dt>
                <dd>
                  Revealed separately after completion. A sound decision can
                  have an unfavourable outcome.
                </dd>
              </div>
              <div>
                <dt>After-action review</dt>
                <dd>
                  Reconstruct your evidence, estimates, verification and
                  rationale at the recorded time.
                </dd>
              </div>
            </dl>
          </section>
        </section>
        <section className={styles.panel}>
          <h2>Prepare the exercise</h2>
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
            <h3>Available actions</h3>
            {scenario.decisionPoints[0]?.actions.map((action) => (
              <div key={action.id}>
                <strong>{action.label}</strong>
                <p>{action.description}</p>
              </div>
            ))}
          </div>
          <div className={styles.variantFields}>
            <label>
              Difficulty profile
              <select
                value={difficultyLevel}
                onChange={(event) =>
                  setDifficultyLevel(Number(event.target.value))
                }
              >
                {[1, 2, 3, 4, 5].map((level) => (
                  <option key={level} value={level}>
                    Level {level}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Deterministic variant seed
              <input
                type="number"
                min={0}
                max={Number.MAX_SAFE_INTEGER}
                step={1}
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                required
              />
            </label>
            <label>
              Reference aid
              <select
                value={aidMode}
                onChange={(event) =>
                  setAidMode(
                    event.target.value === "AFTER_ESTIMATE"
                      ? "AFTER_ESTIMATE"
                      : "ALWAYS",
                  )
                }
              >
                <option value="ALWAYS">Available from start</option>
                <option value="AFTER_ESTIMATE">
                  Reveal after first estimate
                </option>
              </select>
            </label>
            <p className={styles.variantNote}>
              Seed 0 at the authored difficulty retains this scenario; other
              settings produce a validated, repeatable synthetic variant.
            </p>
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
          deterministic session · difficulty {difficultyLevel}
        </span>
        <div className={styles.startAction}>
          {configurationError && (
            <p role="alert" className={styles.configurationError}>
              {configurationError}
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            onClick={startExercise}
            data-testid="start-exercise"
          >
            Start exercise <ArrowRight size={17} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </article>
  );
}
