import { Activity, X } from "lucide-react";
import type { SessionClient } from "@/session/SessionClient";
import type { SessionCommand } from "@/session/SessionClient";
import { formatClock } from "@/utils/format";
import styles from "./InstructorControls.module.css";

export function InstructorControls({
  client,
  open,
  onOpenChange,
  dispatch,
  diagnosticsOpen,
  onDiagnosticsOpenChange,
  truthVisible,
  onTruthVisibleChange,
  cooldowns,
  onInject,
  onReset,
}: {
  client: SessionClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatch: (command: SessionCommand) => void;
  diagnosticsOpen: boolean;
  onDiagnosticsOpenChange: (open: boolean) => void;
  truthVisible: boolean;
  onTruthVisibleChange: (visible: boolean) => void;
  cooldowns: Record<string, number>;
  onInject: (presetId: string) => void;
  onReset?: () => void;
}) {
  const diagnostics = client.getInstructorDiagnostics(truthVisible);

  if (!open) {
    return (
      <button
        className={styles.trigger}
        type="button"
        aria-label="Open instructor controls"
        onClick={() => onOpenChange(true)}
      >
        <Activity size={15} aria-hidden="true" /> Instructor controls
      </button>
    );
  }

  const doReset = () => {
    if (onReset) {
      onReset();
      return;
    }
    if (
      window.confirm("Reset this exercise and clear the accepted-intent log?")
    ) {
      dispatch({ type: "RESET" });
      onTruthVisibleChange(false);
    }
  };

  return (
    <aside className={styles.drawer} aria-label="Local instructor controls">
      <header>
        <div>
          <p>LOCAL INSTRUCTOR CONSOLE</p>
          <h2>Control drawer</h2>
        </div>
        <button
          type="button"
          aria-label="Close instructor controls"
          onClick={() => onOpenChange(false)}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>
      <p className={styles.disclosure}>
        Instructor-only local controls. Diagnostics and truth are segregated
        from the trainee projection.
      </p>
      <div className={styles.sessionActions}>
        {diagnostics.phase === "IDLE" && (
          <button type="button" onClick={() => dispatch({ type: "START" })}>
            Start
          </button>
        )}
        {diagnostics.phase === "RUNNING" && (
          <button type="button" onClick={() => dispatch({ type: "PAUSE" })}>
            Pause
          </button>
        )}
        {diagnostics.phase === "PAUSED" && (
          <button type="button" onClick={() => dispatch({ type: "RESUME" })}>
            Resume
          </button>
        )}
        <button type="button" onClick={doReset}>
          Reset
        </button>
      </div>
      <section>
        <h3>Scenario inject presets</h3>
        <div className={styles.presets}>
          {diagnostics.presets.map((preset, index) => (
            <button
              type="button"
              key={preset.id}
              disabled={
                diagnostics.phase !== "RUNNING" &&
                diagnostics.phase !== "PAUSED" &&
                diagnostics.phase !== "CONSEQUENCE"
                  ? true
                  : (cooldowns[preset.id] ?? 0) > Date.now()
              }
              title={preset.description}
              onClick={() => onInject(preset.id)}
              data-testid={`inject-${preset.id}`}
              data-shortcut-index={index + 1}
            >
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
      </section>
      <section className={styles.diagnostics}>
        <header>
          <h3>Instructor diagnostics</h3>
          <button
            type="button"
            aria-expanded={diagnosticsOpen}
            onClick={() => onDiagnosticsOpenChange(!diagnosticsOpen)}
          >
            {diagnosticsOpen ? "Hide diagnostics" : "Show diagnostics"}
          </button>
        </header>
        {diagnosticsOpen && (
          <div>
            <p className={styles.warning}>
              Diagnostics — not visible to trainees
            </p>
            {diagnostics.decision ? (
              <>
                <p>
                  Best action {diagnostics.decision.bestActionId}
                  {diagnostics.decision.isTie ? " · tie" : ""} · EVPI{" "}
                  {diagnostics.decision.evpi.toFixed(2)}
                </p>
                <ul>
                  {Object.entries(diagnostics.decision.expectedUtilities).map(
                    ([action, value]) => (
                      <li key={action}>
                        {action}: {value.toFixed(2)}
                      </li>
                    ),
                  )}
                </ul>
              </>
            ) : (
              <p>
                Decision diagnostics are unavailable before the decision window.
              </p>
            )}
            <h4>Verification value</h4>
            <ul>
              {diagnostics.assets.map((asset) => (
                <li key={asset.id}>
                  {asset.label}:{" "}
                  {asset.feasible
                    ? `EVSI ${asset.evsi?.toFixed(2)} · Net VOI ${asset.net?.toFixed(2)}`
                    : "not feasible"}
                </li>
              ))}
            </ul>
            <h4>Channel state</h4>
            <ul>
              {diagnostics.channels.map((channel) => (
                <li key={channel.id}>
                  {channel.id}: {channel.health} · {channel.mode}
                </li>
              ))}
            </ul>
            <label className={styles.truthToggle}>
              <input
                type="checkbox"
                checked={truthVisible}
                onChange={(event) => onTruthVisibleChange(event.target.checked)}
              />
              T — show instructor truth
            </label>
            {diagnostics.truth && (
              <ul>
                {Object.entries(diagnostics.truth).map(
                  ([hypothesis, value]) => (
                    <li key={hypothesis}>
                      {hypothesis}: {value ? "true" : "false"}
                    </li>
                  ),
                )}
              </ul>
            )}
            <h4>Event log</h4>
            <ol className={styles.eventLog}>
              {diagnostics.events.map((event, index) => (
                <li key={`${event.atSec}-${event.kind}-${index}`}>
                  {formatClock(event.atSec)} · {event.summary}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
      <p className={styles.clock}>
        Simulation time {formatClock(diagnostics.nowSec)}
      </p>
    </aside>
  );
}
