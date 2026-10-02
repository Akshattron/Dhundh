import { ArrowRight, Clock3, Eye, RotateCcw, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { ScenarioBadge } from "@/components/ui/ScenarioBadge";
import { scenarios } from "@/scenarios";
import { createLocalSession } from "@/session/LocalSessionClient";
import { useSessionStore } from "@/state/useSessionStore";
import styles from "./DemoPage.module.css";

export default function DemoPage() {
  const navigate = useNavigate();
  const setClient = useSessionStore((store) => store.setClient);
  const scenario = scenarios[0];

  const startDemo = () => {
    if (!scenario) return;
    const client = createLocalSession(scenario, {
      seed: 0,
      difficultyLevel: scenario.meta.difficulty,
      aidMode: "ALWAYS",
      speedSecPerMin: 2,
    });
    client.dispatch({ type: "START" });
    setClient(client, client.getSnapshot());
    navigate(`/session/local/${scenario.meta.id}?controls=1`);
  };

  if (!scenario) {
    return (
      <section className={styles.empty}>
        <h1>Flagship demo unavailable</h1>
        <p>No validated synthetic scenario is registered.</p>
        <Button onClick={() => navigate("/scenarios")}>
          Open scenario library
        </Button>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>
            Deterministic flagship · Path A suggested
          </p>
          <h1>Follow the evidence through the decision.</h1>
          <p className={styles.lede}>
            The simulation advances on its real event engine. Reports, belief,
            decision, consequence, and after-action review are all generated
            from this local run — no mock result or external service.
          </p>
        </div>
        <ScenarioBadge />
      </div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>
          <span className={styles.serial}>01</span>
          <div>
            <h2>{scenario.meta.title}</h2>
            <p>{scenario.meta.subtitle}</p>
          </div>
        </div>
        <p className={styles.summary}>{scenario.meta.summary}</p>
        <div className={styles.milestones}>
          <div>
            <span>~44 sec</span>
            <p>Contradictory delayed reports become visible</p>
          </div>
          <div>
            <span>~58 sec</span>
            <p>Decision deadline in this accelerated demo</p>
          </div>
          <div>
            <span>~72 sec</span>
            <p>Outcome reveal and AAR become available</p>
          </div>
        </div>
        <div className={styles.disclosure}>
          <ShieldCheck size={17} aria-hidden="true" />
          <span>
            Truth stays hidden until the engine-authorized completion reveal.
          </span>
        </div>
        <div className={styles.bottom}>
          <span>
            <Clock3 size={15} aria-hidden="true" /> 2 wall seconds = 1
            simulation minute
          </span>
          <Button
            variant="primary"
            size="lg"
            onClick={startDemo}
            data-testid="demo-start"
          >
            Start deterministic demo <ArrowRight size={17} />
          </Button>
        </div>
      </div>
      <div className={styles.note}>
        <Eye size={16} aria-hidden="true" />
        <p>
          Path A is a suggested way to explore the exercise, not a required
          answer. Choose your own action; the AAR evaluates the information and
          beliefs available at your decision timestamp.
        </p>
        <Button
          variant="quiet"
          onClick={() => navigate(`/scenario/${scenario.meta.id}/briefing`)}
        >
          Read full briefing <RotateCcw size={14} />
        </Button>
      </div>
    </section>
  );
}
