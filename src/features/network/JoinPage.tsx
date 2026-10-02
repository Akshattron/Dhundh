import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
          <p className={styles.kicker}>Team exercise</p>
          <h1>Join a session</h1>
          <p>Enter the instructor's code and select your training role.</p>
        </div>
      </header>
      <form className={`${styles.panel} ${styles.form}`} onSubmit={join}>
        <label className={styles.field}>
          Six-character session code
          <input
            autoCapitalize="characters"
            autoComplete="off"
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
        <p className={styles.caption}>
          Sessions are synthetic exercises. No password or account is required.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Button
          variant="primary"
          type="submit"
          disabled={busy || code.length !== 6 || name.trim().length < 2}
        >
          {busy ? "Joining…" : "Join session"}
        </Button>
      </form>
    </section>
  );
}
