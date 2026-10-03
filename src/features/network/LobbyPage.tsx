import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import type { NetworkSessionView } from "@/session/protocol";
import { RemoteSessionClient } from "@/session/RemoteSessionClient";
import { useSessionStore } from "@/state/useSessionStore";
import { TeamRoster } from "./TeamRoster";
import styles from "./NetworkPages.module.css";

export default function LobbyPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const current = useSessionStore((store) => store.client);
  const setClient = useSessionStore((store) => store.setClient);
  const [client, setRemoteClient] = useState(
    current instanceof RemoteSessionClient && current.code === code
      ? current
      : null,
  );
  const [view, setView] = useState<NetworkSessionView | null>(
    () => client?.getSnapshot() ?? null,
  );
  const [status, setStatus] = useState(client?.status ?? "CONNECTING");
  const [message, setMessage] = useState(
    client?.statusMessage ?? "Restoring your session connection…",
  );

  useEffect(() => {
    if (client) return;
    const resumed = RemoteSessionClient.resume(code);
    if (!resumed) {
      setMessage(
        "This lobby is not connected in this browser. Join with the session code.",
      );
      setStatus("FAILED");
      return;
    }
    setRemoteClient(resumed);
    void resumed.ready
      .then(() => {
        setClient(resumed, resumed.getSnapshot());
        setView(resumed.getSnapshot());
      })
      .catch((error: unknown) => {
        setMessage(
          error instanceof Error ? error.message : "Session reconnect failed.",
        );
        setStatus("FAILED");
      });
  }, [client, code, setClient]);

  useEffect(() => {
    if (!client) return;
    const update = () => {
      if (client.status === "CONNECTED" || client.status === "COMPLETE") {
        setView(client.getSnapshot());
      }
    };
    const updateStatus = () => {
      setStatus(client.status);
      setMessage(client.statusMessage);
    };
    update();
    updateStatus();
    const unsubscribe = client.subscribe(update);
    const unsubscribeStatus = client.subscribeStatus(updateStatus);
    return () => {
      unsubscribe();
      unsubscribeStatus();
    };
  }, [client]);

  const enterExercise = () => {
    if (!view) return;
    navigate(`/session/network/${view.scenario.id}`);
  };

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.kicker}>
            Team session lobby · synthetic training
          </p>
          <h1>Form the room</h1>
          <p>
            Role, scenario, and connection state are synchronized by the server.
          </p>
        </div>
        <div>
          <span className={styles.role}>Session code</span>
          <strong className={styles.code}>{code}</strong>
        </div>
      </header>
      <div className={styles.status} data-state={status} role="status">
        {message}
      </div>
      {view && (
        <>
          <section className={`${styles.panel} ${styles.lobbyContext}`}>
            <div className={styles.row}>
              <div>
                <h2>{view.scenario.title}</h2>
                <p className={styles.muted}>
                  Difficulty {view.scenario.difficulty}/5 ·{" "}
                  {view.scenario.synthetic ? "synthetic scenario" : "scenario"}
                </p>
              </div>
              <span className={styles.phase}>{view.phase}</span>
            </div>
          </section>
          <section className={styles.panel}>
            <div className={styles.row}>
              <h2>Participants</h2>
              <span className={styles.caption}>Your role: {view.role}</span>
            </div>
            <TeamRoster roster={view.roster} currentRole={view.role} />
            <p className={styles.caption}>
              Roles have different evidence and permissions. A waiting slot is
              not a connection failure.
            </p>
          </section>
          {view.role !== "INSTRUCTOR" && view.phase === "IDLE" && (
            <p className={styles.waiting}>
              Waiting for the instructor to start…
            </p>
          )}
          {view.phase !== "IDLE" && (
            <Button variant="primary" onClick={enterExercise}>
              Open training console
            </Button>
          )}
          {status === "FALLBACK_AVAILABLE" && (
            <p className={styles.caption}>
              A local fallback starts a fresh exercise with the same scenario
              and settings. Unavailable server progress is not restored.
            </p>
          )}
        </>
      )}
      {!view && status === "FAILED" && (
        <Button variant="secondary" onClick={() => navigate("/join")}>
          Return to join
        </Button>
      )}
    </section>
  );
}
