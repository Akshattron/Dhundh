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
import { ChannelIcon } from "@/features/trainee/ChannelHealthStrip";
import { scenarios } from "@/scenarios";
import {
  DemoController,
  DEMO_SCENARIO_ID,
} from "@/features/demo/DemoController";
import { useSessionStore } from "@/state/useSessionStore";
import { LOCAL_ONLY_BUILD } from "@/utils/deployment";
import styles from "./HomePage.module.css";

const channels = ["LAND", "AIR", "CYBER", "EW"] as const;

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
            A good decision can still have a bad outcome. Learn to separate the
            two.
          </p>
          <ScenarioBadge />
        </div>
        <figure className={styles.heroSignal} aria-label="Training sequence">
          <div className={styles.signalHead}>
            <span>01 / Information</span>
            <span>Four sources. One evolving picture.</span>
          </div>
          <div className={styles.channels}>
            {channels.map((channel) => (
              <span key={channel} data-channel={channel}>
                <ChannelIcon channel={channel} size={20} />
                {channel}
              </span>
            ))}
          </div>
          <svg
            className={styles.signalRoutes}
            viewBox="0 0 400 96"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {channels.map((channel, index) => (
              <path
                key={channel}
                data-channel={channel}
                d={`M ${50 + index * 100} 0 V 16 Q ${50 + index * 100} 48 200 48 V 96`}
              />
            ))}
          </svg>
          <ol className={styles.signalSequence}>
            <li>
              <span className={styles.stepIndex}>02</span>
              <h2>Fog</h2>
              <p>Delay, gaps and conflicting evidence.</p>
            </li>
            <li>
              <span className={styles.stepIndex}>03</span>
              <h2>Belief</h2>
              <p>What the available information supports.</p>
            </li>
            <li>
              <span className={styles.stepIndex}>04</span>
              <h2>Decision</h2>
              <p>Commit. Reveal the outcome. Reconstruct.</p>
            </li>
          </ol>
          <figcaption className={styles.signalFoot}>
            Conceptual training sequence, not a live session.
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
