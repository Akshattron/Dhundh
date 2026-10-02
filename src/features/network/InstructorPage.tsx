import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { createLocalSession } from "@/session/LocalSessionClient";
import type { NetworkSessionView } from "@/session/protocol";
import { RemoteSessionClient } from "@/session/RemoteSessionClient";
import { scenarios } from "@/scenarios";
import { useSessionStore } from "@/state/useSessionStore";
import { formatClock } from "@/utils/format";
import styles from "./NetworkPages.module.css";

export default function InstructorPage() {
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
    client?.statusMessage ?? "Restoring instructor session…",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client) return;
    const resumed = RemoteSessionClient.resume(code);
    if (!resumed || resumed.role !== "INSTRUCTOR") {
      setMessage("Instructor connection is not available in this browser.");
      setStatus("FAILED");
      return;
    }
    setRemoteClient(resumed);
    void resumed.ready
      .then(() => {
        setClient(resumed, resumed.getSnapshot());
        setView(resumed.getSnapshot());
      })
      .catch((cause: unknown) => {
        setMessage(
          cause instanceof Error
            ? cause.message
            : "Instructor reconnect failed.",
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

  const dispatch = (
    command: Parameters<RemoteSessionClient["dispatch"]>[0],
  ) => {
    setError(null);
    try {
      client?.dispatch(command);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The instructor action failed.",
      );
    }
  };

  const continueLocally = () => {
    if (!client || !view) return;
    const scenario = scenarios.find(
      (item) => item.meta.id === view.scenario.id,
    );
    if (!scenario) {
      setError("This validated scenario is not available for local fallback.");
      return;
    }
    const credential = client.getCredential();
    const local = createLocalSession(scenario, {
      seed: credential.seed,
      difficultyLevel: credential.difficultyLevel,
      aidMode: view.aidMode,
      speedSecPerMin: 4,
    });
    setClient(local, local.getSnapshot());
    navigate(`/session/local/${scenario.meta.id}`);
  };

  const scenario = view
    ? scenarios.find((item) => item.meta.id === view.scenario.id)
    : undefined;
  const trainees = view?.instructor?.traineeSnapshots ?? [];

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.kicker}>Instructor-only live monitor</p>
          <h1>Session control room</h1>
          <p>Authoritative state and role-specific activity from the server.</p>
        </div>
        <div>
          <span className={styles.role}>SESSION CODE</span>
          <strong className={styles.code}>{code}</strong>
        </div>
      </header>
      <div className={styles.status} data-state={status} role="status">
        {message}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!view ? (
        <section className={styles.panel}>
          <p className={styles.muted}>
            Waiting for an authorized instructor view.
          </p>
          {status === "FAILED" && (
            <Button onClick={() => navigate("/")}>Return home</Button>
          )}
        </section>
      ) : (
        <div className={styles.layout}>
          <aside className={styles.panel}>
            <h2>Session controls</h2>
            <p>
              {view.scenario.title} · Difficulty {view.scenario.difficulty}/5
            </p>
            <p className={styles.muted}>
              {view.phase} · {formatClock(view.nowSec)} · {view.speedSecPerMin}s
              per simulated minute
            </p>
            <p>
              Join link: <a href={`/join?code=${code}`}>/join?code={code}</a>
            </p>
            <div className={styles.actions}>
              {view.phase === "IDLE" && (
                <Button
                  variant="primary"
                  disabled={!trainees.length}
                  title={
                    !trainees.length
                      ? "A Commander or Analyst must join first."
                      : undefined
                  }
                  onClick={() => dispatch({ type: "START" })}
                >
                  Start exercise
                </Button>
              )}
              {view.phase === "RUNNING" && (
                <Button onClick={() => dispatch({ type: "PAUSE" })}>
                  Pause
                </Button>
              )}
              {view.phase === "PAUSED" && (
                <Button onClick={() => dispatch({ type: "RESUME" })}>
                  Resume
                </Button>
              )}
              {(view.phase === "RUNNING" ||
                view.phase === "PAUSED" ||
                view.phase === "CONSEQUENCE") && (
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm("Reset the authoritative exercise?")) {
                      dispatch({ type: "RESET" });
                    }
                  }}
                >
                  Reset
                </Button>
              )}
              {view.phase === "COMPLETE" && (
                <Button
                  variant="primary"
                  onClick={() => navigate(`/aar/${view.scenario.id}`)}
                >
                  Open team AAR
                </Button>
              )}
              {status === "FALLBACK_AVAILABLE" && (
                <Button onClick={continueLocally}>Continue locally</Button>
              )}
            </div>
            {scenario && view.phase !== "IDLE" && (
              <section>
                <h3>Instructor injects</h3>
                <div className={styles.controlList}>
                  {scenario.injectPresets.map((preset) => (
                    <Button
                      key={preset.id}
                      size="sm"
                      disabled={view.phase === "COMPLETE"}
                      title={preset.description}
                      onClick={() =>
                        dispatch({ type: "INJECT", presetId: preset.id })
                      }
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </section>
            )}
          </aside>

          <div className={styles.page}>
            <section className={styles.panel}>
              <div className={styles.row}>
                <h2>Live participant monitor</h2>
                <span className={styles.caption}>
                  Instructor only — not visible to trainees
                </span>
              </div>
              {trainees.length === 0 ? (
                <p className={styles.muted}>
                  Waiting for Commander and Analyst to join.
                </p>
              ) : (
                <div className={styles.monitorGrid}>
                  {trainees.map((trainee) => (
                    <article className={styles.monitorCard} key={trainee.role}>
                      <span className={styles.role}>{trainee.role}</span>
                      <strong>
                        {trainee.opened} / {trainee.delivered} reports opened
                      </strong>
                      <span>
                        Latest estimate:{" "}
                        {trainee.estimate === null
                          ? "not recorded"
                          : `${Math.round(trainee.estimate * 100)}%`}
                      </span>
                      <span>
                        Reference aid{" "}
                        {trainee.aidRevealed ? "revealed" : "hidden"}
                        {" · "}
                        {trainee.decided
                          ? "decision recorded"
                          : "no decision yet"}
                      </span>
                    </article>
                  ))}
                </div>
              )}
              <ul className={styles.roster}>
                {view.roster.map((participant) => (
                  <li className={styles.participant} key={participant.role}>
                    <div>
                      <span className={styles.role}>{participant.role}</span>
                      <strong>{participant.name}</strong>
                    </div>
                    <span
                      className={
                        participant.connected
                          ? styles.connected
                          : styles.disconnected
                      }
                    >
                      {participant.connected ? "Connected" : "Disconnected"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section className={styles.panel}>
              <h2>Instructor diagnostics</h2>
              <p>
                Current simulation state: {view.phase} ·{" "}
                {formatClock(view.nowSec)}
              </p>
              <ul>
                {Object.entries(view.truth ?? {}).map(([hypothesis, value]) => (
                  <li key={hypothesis}>
                    {hypothesis}: {value ? "true" : "false"}
                  </li>
                ))}
              </ul>
              <p className={styles.caption}>
                Truth and event diagnostics are authorized for this instructor
                connection only.
              </p>
            </section>
            <section className={styles.panel}>
              <h2>Recent session events</h2>
              {view.instructor?.eventLog.length ? (
                <ol className={styles.events}>
                  {view.instructor.eventLog.map((event, index) => (
                    <li key={`${event.atSec}-${index}`}>
                      <time>{formatClock(event.atSec)}</time>
                      <span>{event.text}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.muted}>Session events will appear here.</p>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
