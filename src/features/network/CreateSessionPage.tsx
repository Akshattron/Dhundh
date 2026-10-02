import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { scenarios } from "@/scenarios";
import { useSessionStore } from "@/state/useSessionStore";
import { RemoteSessionClient } from "@/session/RemoteSessionClient";
import styles from "./NetworkPages.module.css";

export default function CreateSessionPage() {
  const navigate = useNavigate();
  const setClient = useSessionStore((store) => store.setClient);
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.meta.id ?? "");
  const [difficultyLevel, setDifficultyLevel] = useState<number>(
    scenarios[0]?.meta.difficulty ?? 3,
  );
  const [seed, setSeed] = useState("0");
  const [name, setName] = useState("Instructor");
  const [aidMode, setAidMode] = useState<"ALWAYS" | "AFTER_ESTIMATE">("ALWAYS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const scenario = scenarios.find((item) => item.meta.id === scenarioId);
      if (!scenario) throw new Error("Choose a validated synthetic scenario.");
      const parsedSeed = Number(seed);
      if (!Number.isSafeInteger(parsedSeed) || parsedSeed < 0) {
        throw new Error("Scenario seed must be a nonnegative safe integer.");
      }
      const client = await RemoteSessionClient.create({
        scenarioId,
        seed: parsedSeed,
        difficultyLevel,
        aidMode,
        name: name.trim(),
      });
      setClient(client, client.getSnapshot());
      navigate(`/instructor/${client.code}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The session could not be created. Check the server connection.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.kicker}>Authoritative training session</p>
          <h1>Create a session</h1>
          <p>Start a fictional exercise and invite a Commander and Analyst.</p>
        </div>
      </header>
      <form className={`${styles.panel} ${styles.form}`} onSubmit={create}>
        <label className={styles.field}>
          Scenario
          <select
            value={scenarioId}
            onChange={(event) => {
              const nextId = event.target.value;
              setScenarioId(nextId);
              const nextScenario = scenarios.find(
                (item) => item.meta.id === nextId,
              );
              if (nextScenario)
                setDifficultyLevel(nextScenario.meta.difficulty);
            }}
            required
          >
            {scenarios.map((scenario) => (
              <option key={scenario.meta.id} value={scenario.meta.id}>
                {scenario.meta.title} · synthetic
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Difficulty profile
          <select
            value={difficultyLevel}
            onChange={(event) => setDifficultyLevel(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>
                Level {level}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
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
        <label className={styles.field}>
          Instructor display name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={40}
            required
          />
        </label>
        <label className={styles.field}>
          Estimate aid
          <select
            value={aidMode}
            onChange={(event) =>
              setAidMode(event.target.value as "ALWAYS" | "AFTER_ESTIMATE")
            }
          >
            <option value="ALWAYS">Available from start</option>
            <option value="AFTER_ESTIMATE">Reveal after own estimate</option>
          </select>
        </label>
        <p className={styles.caption}>
          Difficulty controls timing and information degradation. A nonzero seed
          creates a repeatable synthetic variant. Network actions are
          authoritative on the project-owned service; no account or password is
          used.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" disabled={busy || !scenarioId}>
          {busy ? "Creating session…" : "Create instructor session"}
        </Button>
      </form>
    </section>
  );
}
