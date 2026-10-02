import {
  ArrowRight,
  BookOpen,
  Clock3,
  GitBranch,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { ScenarioBadge } from "@/components/ui/ScenarioBadge";
import { scenarios } from "@/scenarios";
import {
  DemoController,
  DEMO_SCENARIO_ID,
} from "@/features/demo/DemoController";
import { useSessionStore } from "@/state/useSessionStore";
import styles from "./HomePage.module.css";

export default function HomePage() {
  const navigate = useNavigate();
  const setClient = useSessionStore((store) => store.setClient);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const runFlagshipDemo = () => {
    const scenario = scenarios.find(
      (candidate) => candidate.meta.id === DEMO_SCENARIO_ID,
    );
    if (!scenario) {
      setLaunchError("The validated flagship scenario is unavailable.");
      return;
    }
    try {
      const client = new DemoController(scenario).createSession();
      setClient(client, client.getSnapshot(), "DEMO");
      setLaunchError(null);
      navigate("/demo");
    } catch (error) {
      setLaunchError(
        error instanceof Error
          ? error.message
          : "The deterministic flagship demo could not be started.",
      );
    }
  };
  return (
    <div className={styles.home}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <ScenarioBadge />
          <p className={styles.eyebrow}>
            Decision Training Under Degraded Information
          </p>
          <h1>
            Decide on what you know.
            <br />
            Then see what happened.
          </h1>
          <p className={styles.summary}>
            A deterministic training simulator for decisions made while
            information is delayed, incomplete, and sometimes in conflict.
          </p>
          <div className={styles.actions}>
            <Button
              variant="primary"
              size="lg"
              icon={<ArrowRight size={17} />}
              onClick={runFlagshipDemo}
              data-testid="run-flagship-demo"
            >
              RUN FLAGSHIP DEMO
            </Button>
            <Button
              variant="secondary"
              size="lg"
              icon={<BookOpen size={17} />}
              onClick={() => navigate("/scenarios")}
            >
              Browse scenarios
            </Button>
            <Button
              variant="quiet"
              size="sm"
              icon={<Plus size={15} />}
              onClick={() => navigate("/sessions/new")}
            >
              Create network session
            </Button>
            <Button
              variant="quiet"
              size="sm"
              icon={<Users size={15} />}
              onClick={() => navigate("/join")}
            >
              Join with code
            </Button>
          </div>
          {launchError && (
            <p className={styles.launchError} role="alert">
              {launchError} Reload the page or open the scenario library to
              recover.
            </p>
          )}
          <p className={styles.thesis}>
            “Decide on the information you had — then see what actually
            happened.”
          </p>
        </div>
        <div className={styles.heroSignal} aria-label="Training sequence">
          <div className={styles.signalHead}>
            <span>Decision sequence</span>
            <span className={styles.signalDot} />
          </div>
          <div className={styles.signalSequence}>
            {[
              "State",
              "Intelligence",
              "Change",
              "Decision",
              "Consequence",
              "Explanation",
            ].map((step, index) => (
              <div className={styles.signalStep} key={step}>
                <span className={styles.stepIndex}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{step}</span>
                {index < 5 && (
                  <span className={styles.connector} aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
          <div className={styles.signalFoot}>
            <Clock3 size={15} aria-hidden="true" />
            <span>Information-conditioned evaluation</span>
          </div>
        </div>
      </section>

      <section className={styles.principles} aria-label="Product principles">
        <article>
          <GitBranch size={19} aria-hidden="true" />
          <h2>Information fog</h2>
          <p>
            Reports arrive on four channels with authored delay, dropout, and
            reliability.
          </p>
        </article>
        <article>
          <ShieldCheck size={19} aria-hidden="true" />
          <h2>Decision-time scoring</h2>
          <p>
            Decision quality uses the reference belief at commitment, not later
            truth.
          </p>
        </article>
        <article>
          <ArrowRight size={19} aria-hidden="true" />
          <h2>After-action review</h2>
          <p>
            Compare what was known, what was believed, and what actually
            happened.
          </p>
        </article>
      </section>
      <p className={styles.disclosure}>
        The event engine, belief calculations, scoring, and replay are
        deterministic. All scenario content is synthetic; training-transfer
        effectiveness is not claimed.
      </p>
    </div>
  );
}
