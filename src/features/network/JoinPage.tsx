import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Radio, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { RemoteSessionClient } from "@/session/RemoteSessionClient";
import { useSessionStore } from "@/state/useSessionStore";
import styles from "./NetworkPages.module.css";

export default function JoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setClient = useSessionStore((store) => store.setClient);
  const [code, setCode] = useState(
    (searchParams.get("code") ?? "")
      .toUpperCase()
      .replace(/[^A-HJ-NP-Z2-9]/g, "")
      .slice(0, 6),
  );
  const [name, setName] = useState("");
  const [role, setRole] = useState<"COMMANDER" | "ANALYST">("COMMANDER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const client = RemoteSessionClient.join({
      code,
      role,
      name: name.trim(),
    });
    try {
      await client.ready;
      setClient(client, client.getSnapshot());
      navigate(`/lobby/${code}`);
    } catch (cause) {
      client.dispose();
      setError(
        cause instanceof Error
          ? cause.message
          : "The session could not be joined. Check the code and connection.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.kicker}>Synthetic team exercise</p>
          <h1>Join a session</h1>
          <p>Enter the instructor's code and select your training role.</p>
        </div>
      </header>
      <div className={styles.entryLayout}>
        <form className={`${styles.panel} ${styles.form}`} onSubmit={join}>
          <label className={styles.field}>
            Six-character session code
            <input
              className={styles.codeInput}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABC234"
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-HJ-NP-Z2-9]/g, "")
                    .slice(0, 6),
                )
              }
              minLength={6}
              maxLength={6}
              pattern="[A-HJ-NP-Z2-9]{6}"
              required
            />
          </label>
          <label className={styles.field}>
            Display name
            <input
              autoComplete="nickname"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={40}
              required
            />
          </label>
          <label className={styles.field}>
            Role
            <select
              aria-describedby="join-role-hint"
              value={role}
              onChange={(event) =>
                setRole(
                  event.target.value === "ANALYST" ? "ANALYST" : "COMMANDER",
                )
              }
            >
              <option value="COMMANDER">Commander</option>
              <option value="ANALYST">Analyst</option>
            </select>
          </label>
          <p className={styles.roleHint} id="join-role-hint">
            {role === "COMMANDER"
              ? "Record estimates and commit decisions using your available evidence and Analyst handoffs."
              : "Inspect your evidence, record estimates, and relay reports or structured advice to the Commander."}
          </p>
          <p className={styles.caption}>
            Sessions are synthetic exercises. No password or account is
            required.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            type="submit"
            loading={busy}
            disabled={busy || code.length !== 6 || name.trim().length < 2}
          >
            {busy ? "Joining…" : "Join session"}
          </Button>
        </form>
        <aside
          className={styles.entryGuide}
          aria-label="How team sessions work"
        >
          <Users size={20} aria-hidden="true" />
          <h2>One exercise. Different information.</h2>
          <p>
            Each role receives its own authorized view. Sharing evidence is part
            of the exercise, not an automatic shared feed.
          </p>
          <div className={styles.guideStep}>
            <Radio size={16} aria-hidden="true" />
            <div>
              <h3>Connect to the room</h3>
              <p>
                Your instructor provides the six-character code. The lobby shows
                who has joined.
              </p>
            </div>
          </div>
          <div className={styles.guideStep}>
            <ArrowRight size={16} aria-hidden="true" />
            <div>
              <h3>Start together</h3>
              <p>
                The instructor starts the clock. Your role and connection state
                remain visible.
              </p>
            </div>
          </div>
          <Link to="/sessions/new">
            Create an instructor session{" "}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </aside>
      </div>
    </section>
  );
}
