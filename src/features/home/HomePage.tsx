import {
  ArrowRight,
  BookOpen,
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
import { LOCAL_ONLY_BUILD } from "@/utils/deployment";
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
          <p className={styles.eyebrow}>
            A decision-training simulator · synthetic scenarios
          </p>
          <h1>
            What did you know
            <br />
            when you decided?
          </h1>
          <p className={styles.summary}>
            DHUNDH trains decisions made with information that is delayed,
            incomplete, and sometimes in conflict. It evaluates the choice
            against the belief available at commitment, then reconstructs what
            happened.
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
            {!LOCAL_ONLY_BUILD && (
              <>
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
              </>
            )}
          </div>
          {launchError && (
            <p className={styles.launchError} role="alert">
              {launchError} Reload the page or open the scenario library to
              recover.
            </p>
          )}
          <p className={styles.thesis}>
            A sound decision can end badly. A lucky outcome does not make a weak
            decision sound.
          </p>
          <ScenarioBadge />
        </div>
        <figure
          className={styles.heroSignal}
          aria-labelledby="sequence-title"
          aria-describedby="sequence-caption"
        >
          <div className={styles.signalHead}>
            <span id="sequence-title">The decision, reconstructed</span>
            <span>Evidence changes what can be known.</span>
          </div>
          <ol className={styles.signalSequence}>
            <li>
              <span className={styles.stepIndex}>01</span>
              <span className={styles.stepLabel}>Evidence arrives</span>
              <h2>What reached the trainee?</h2>
              <p>Reports can be delayed, dropped, or in conflict.</p>
            </li>
            <li>
              <span className={styles.stepIndex}>02</span>
              <span className={styles.stepLabel}>Belief changes</span>
              <h2>What does it support?</h2>
              <p>Track probability, uncertainty, and disagreement.</p>
            </li>
            <li>
              <span className={styles.stepIndex}>03</span>
              <span className={styles.stepLabel}>A choice is committed</span>
              <h2>What was knowable then?</h2>
              <p>Decision quality is evaluated at the decision-time cut.</p>
            </li>
            <li>
              <span className={styles.stepIndex}>04</span>
              <span className={styles.stepLabel}>The record is rebuilt</span>
              <h2>What happened afterward?</h2>
              <p>Replay separates the decision from the outcome.</p>
            </li>
          </ol>
          <figcaption className={styles.signalFoot} id="sequence-caption">
            Conceptual sequence · all scenario content is synthetic.
          </figcaption>
        </figure>
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
