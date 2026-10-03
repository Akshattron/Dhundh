import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  CircleHelp,
  ChevronDown,
  FileText,
  Home,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { DemoController, DEMO_SCENARIO_ID } from "./DemoController";
import SessionPage from "@/features/session/SessionPage";
import { scenarios } from "@/scenarios";
import type { SessionClient } from "@/session/SessionClient";
import type { TraineeView } from "@/engine/view";
import { useSessionStore } from "@/state/useSessionStore";
import { useSessionView } from "@/session/useSessionView";
import styles from "./DemoPage.module.css";

export default function DemoPage() {
  const navigate = useNavigate();
  const client = useSessionStore((store) => store.client);
  const view = useSessionView(client);
  const experience = useSessionStore((store) => store.experience);
  const setClient = useSessionStore((store) => store.setClient);
  const scenario = scenarios.find(
    (candidate) => candidate.meta.id === DEMO_SCENARIO_ID,
  );
  const controller = useMemo(
    () => (scenario ? new DemoController(scenario) : null),
    [scenario],
  );
  const initializationAttempted = useRef(false);
  const previousView = useRef<TraineeView | null>(null);
  const wowBaselineSetByController = useRef(false);
  const [runKey, setRunKey] = useState(0);
  const [guideOpen, setGuideOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [presenterExpanded, setPresenterExpanded] = useState(false);
  const [status, setStatus] = useState("Preparing deterministic demo…");
  const [error, setError] = useState<string | null>(null);
  const [wowAtSec, setWowAtSec] = useState<number | null>(null);
  const [wowBaselineFog, setWowBaselineFog] = useState<number | null>(null);

  const installFreshSession = useCallback(() => {
    if (!controller) {
      setError("The validated flagship scenario is unavailable.");
      return;
    }
    try {
      const nextClient = controller.createSession();
      const nextView = nextClient.getSnapshot();
      setClient(nextClient, nextView, "DEMO");
      setWowAtSec(null);
      setWowBaselineFog(null);
      previousView.current = nextView;
      wowBaselineSetByController.current = false;
      setGuideOpen(true);
      setShortcutsOpen(false);
      setError(null);
      setStatus("A fresh deterministic demo is running.");
      setRunKey((key) => key + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The deterministic flagship demo could not be started.",
      );
    }
  }, [controller, setClient]);

  useEffect(() => {
    if (
      client &&
      view?.scenario.id === DEMO_SCENARIO_ID &&
      experience === "DEMO"
    ) {
      initializationAttempted.current = true;
      return;
    }
    if (initializationAttempted.current) return;
    initializationAttempted.current = true;
    installFreshSession();
  }, [client, experience, installFreshSession, view?.scenario.id]);

  useEffect(() => {
    if (
      controller &&
      view?.scenario.id === DEMO_SCENARIO_ID &&
      wowAtSec === null &&
      controller.isWow(view)
    ) {
      setWowAtSec(view.nowSec);
      if (!wowBaselineSetByController.current) {
        const previous = previousView.current;
        setWowBaselineFog(
          previous && previous.nowSec < view.nowSec
            ? (previous.belief?.fogIndex ?? null)
            : null,
        );
      }
    }
    if (view?.scenario.id === DEMO_SCENARIO_ID) previousView.current = view;
  }, [controller, view, wowAtSec]);

  const reportResult = useCallback((result: { message: string }) => {
    setStatus(result.message);
  }, []);

  const withClient = useCallback(
    (
      action: (activeClient: SessionClient) => {
        message: string;
        wowBaselineFog?: number;
      },
    ) => {
      if (!client) {
        setStatus(
          "The demo session is unavailable. Reset the demo to recover.",
        );
        return;
      }
      const result = action(client);
      reportResult(result);
      if (result.wowBaselineFog !== undefined) {
        wowBaselineSetByController.current = true;
        setWowBaselineFog(result.wowBaselineFog);
      }
      useSessionStore.getState().setView(client.getSnapshot());
    },
    [client, reportResult],
  );

  const start = useCallback(
    () =>
      withClient(
        (activeClient) =>
          controller?.start(activeClient) ?? {
            message: "Demo controls are unavailable.",
          },
      ),
    [controller, withClient],
  );
  const pause = useCallback(
    () =>
      withClient(
        (activeClient) =>
          controller?.pause(activeClient) ?? {
            message: "Demo controls are unavailable.",
          },
      ),
    [controller, withClient],
  );
  const resume = useCallback(
    () =>
      withClient(
        (activeClient) =>
          controller?.resume(activeClient) ?? {
            message: "Demo controls are unavailable.",
          },
      ),
    [controller, withClient],
  );
  const step = useCallback(
    () =>
      withClient(
        (activeClient) =>
          controller?.stepForward(activeClient) ?? {
            message: "Demo controls are unavailable.",
          },
      ),
    [controller, withClient],
  );
  const skipToWow = useCallback(
    () =>
      withClient(
        (activeClient) =>
          controller?.skipToWow(activeClient) ?? {
            message: "Demo controls are unavailable.",
          },
      ),
    [controller, withClient],
  );
  const skipToDecision = useCallback(
    () =>
      withClient(
        (activeClient) =>
          controller?.skipToDecision(activeClient) ?? {
            message: "Demo controls are unavailable.",
          },
      ),
    [controller, withClient],
  );
  const skipToAar = useCallback(() => {
    if (!client || !controller) {
      setStatus("The demo session is unavailable. Reset the demo to recover.");
      return;
    }
    const result = controller.skipToAar(client);
    setStatus(result.message);
    useSessionStore.getState().setView(client.getSnapshot());
    if (result.complete) navigate(`/aar/${DEMO_SCENARIO_ID}`);
  }, [client, controller, navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Escape") {
        if (shortcutsOpen) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setShortcutsOpen(false);
        }
        return;
      }
      const key = event.key.toLowerCase();
      const actions: Record<string, () => void> = {
        h: () => {
          useSessionStore.getState().clear();
          navigate("/");
        },
        d: installFreshSession,
        n: step,
        j: skipToDecision,
        a: skipToAar,
      };
      if (key === "?") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setShortcutsOpen((open) => !open);
      } else if (actions[key]) {
        event.preventDefault();
        event.stopImmediatePropagation();
        actions[key]?.();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    installFreshSession,
    navigate,
    shortcutsOpen,
    skipToAar,
    skipToDecision,
    step,
  ]);

  if (error) {
    return (
      <section className={styles.recovery} role="alert">
        <Activity size={22} aria-hidden="true" />
        <h1>Flagship demo could not start</h1>
        <p>{error}</p>
        <div>
          <Button variant="primary" onClick={installFreshSession}>
            Retry demo <ArrowRight size={15} />
          </Button>
          <Button variant="secondary" onClick={() => navigate("/")}>
            <Home size={15} /> Return home
          </Button>
        </div>
      </section>
    );
  }

  if (
    !client ||
    !view ||
    experience !== "DEMO" ||
    view.scenario.id !== DEMO_SCENARIO_ID
  ) {
    return (
      <div className={styles.loading} role="status">
        <Activity size={18} aria-hidden="true" />
        <span>Loading flagship scenario… Preparing deterministic demo…</span>
      </div>
    );
  }

  const primary = view.hypotheses.find((hypothesis) => hypothesis.primary);
  const primaryBelief = primary ? view.belief?.perHypothesis[primary.id] : null;
  const degradedChannels = view.channels
    .filter((channel) => channel.health !== "HEALTHY")
    .map((channel) => channel.id);
  const delayedReport = view.reports.find((report) => report.delaySec > 0);
  const fogDelta =
    wowBaselineFog !== null && view.belief
      ? view.belief.fogIndex - wowBaselineFog
      : null;
  const guideSteps = [
    {
      label: "Read the information",
      complete: view.reports.length > 0,
    },
    {
      label: "Watch communications degrade",
      complete: degradedChannels.length > 0,
    },
    {
      label: "Evaluate uncertainty",
      complete: wowAtSec !== null,
    },
    {
      label: "Make the decision",
      complete: view.decisions.length > 0,
    },
    {
      label: "Inspect the AAR",
      complete: view.aarReady,
    },
  ];

  return (
    <SessionPage
      key={runKey}
      demoMode
      onDemoReset={installFreshSession}
      presenter={
        <>
          <section
            className={styles.controls}
            aria-label="Presenter controls"
            data-testid="demo-presenter-controls"
            data-expanded={presenterExpanded}
          >
            <button
              type="button"
              className={styles.compactSummary}
              aria-expanded={presenterExpanded}
              aria-controls="demo-control-actions"
              onClick={() => setPresenterExpanded((open) => !open)}
            >
              Presenter controls <ChevronDown size={14} aria-hidden="true" />
            </button>
            <div className={styles.controlTitle}>
              <strong>Presenter controls</strong>
            </div>
            <div className={styles.controlActions} id="demo-control-actions">
              <button
                type="button"
                onClick={start}
                aria-label="Run or resume demo"
                data-testid="demo-run"
              >
                <Play size={15} aria-hidden="true" /> Run
              </button>
              <button
                type="button"
                onClick={pause}
                disabled={view.phase !== "RUNNING"}
                data-testid="demo-pause"
              >
                <Pause size={15} aria-hidden="true" /> Pause
              </button>
              <button
                type="button"
                onClick={resume}
                disabled={view.phase !== "PAUSED"}
                data-testid="demo-resume"
              >
                <Play size={15} aria-hidden="true" /> Resume
              </button>
              <button
                type="button"
                onClick={installFreshSession}
                data-testid="demo-reset"
              >
                <RotateCcw size={15} aria-hidden="true" /> Reset
              </button>
              <button
                type="button"
                onClick={step}
                disabled={
                  view.phase !== "RUNNING" && view.phase !== "CONSEQUENCE"
                }
                data-testid="demo-step"
              >
                <SkipForward size={15} aria-hidden="true" /> Step
              </button>
              <button
                type="button"
                onClick={skipToWow}
                disabled={view.phase !== "RUNNING" || wowAtSec !== null}
                data-testid="demo-skip-wow"
              >
                <Sparkles size={15} aria-hidden="true" /> WOW
              </button>
              <button
                type="button"
                onClick={skipToDecision}
                disabled={view.phase !== "RUNNING"}
                data-testid="demo-skip-decision"
              >
                <ArrowRight size={15} aria-hidden="true" /> Decide
              </button>
              <button
                type="button"
                onClick={skipToAar}
                disabled={view.phase === "PAUSED"}
                data-testid="demo-skip-aar"
              >
                <FileText size={15} aria-hidden="true" /> AAR
              </button>
            </div>
            <p
              className={styles.controlStatus}
              role="status"
              aria-live="polite"
            >
              {status}
            </p>
            <button
              className={styles.shortcutsButton}
              type="button"
              aria-expanded={shortcutsOpen}
              onClick={() => setShortcutsOpen((open) => !open)}
            >
              <CircleHelp size={15} aria-hidden="true" /> Shortcuts
            </button>
          </section>

          {shortcutsOpen && (
            <aside
              className={styles.shortcutPanel}
              aria-label="Presenter shortcuts"
            >
              <div>
                <strong>Presenter shortcuts</strong>
                <button
                  type="button"
                  aria-label="Close presenter shortcuts"
                  onClick={() => setShortcutsOpen(false)}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
              <ul>
                <li>
                  <kbd>H</kbd> Home
                </li>
                <li>
                  <kbd>D</kbd> Reset demo
                </li>
                <li>
                  <kbd>N</kbd> Step to next engine event
                </li>
                <li>
                  <kbd>J</kbd> Jump to decision window
                </li>
                <li>
                  <kbd>A</kbd> Complete the real path and open AAR
                </li>
                <li>
                  <kbd>I</kbd> Toggle instructor drawer
                </li>
                <li>
                  <kbd>?</kbd> Show or hide shortcuts
                </li>
              </ul>
            </aside>
          )}

          {guideOpen && (
            <aside
              className={styles.guide}
              aria-label="Demo presenter guide"
              data-testid="demo-guide"
            >
              <details>
                <summary>
                  Presenter guide{" "}
                  <span>
                    {guideSteps.find((item) => !item.complete)?.label ??
                      "Review the completed exercise"}
                  </span>
                </summary>
                <ol>
                  {guideSteps.map((step, index) => (
                    <li
                      className={step.complete ? styles.stepComplete : ""}
                      key={step.label}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {step.label}
                    </li>
                  ))}
                </ol>
              </details>
              <button
                type="button"
                aria-label="Dismiss presenter guide"
                onClick={() => setGuideOpen(false)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </aside>
          )}

          {wowAtSec !== null && (
            <section
              className={styles.wow}
              data-testid="demo-wow"
              aria-live="polite"
              aria-label="Information environment changed"
            >
              <div className={styles.wowCopy}>
                <p className={styles.kicker}>
                  Information environment changed · {Math.floor(wowAtSec / 60)}:
                  {String(wowAtSec % 60).padStart(2, "0")}
                </p>
                <h2>
                  Delayed evidence now conflicts with the earlier picture.
                </h2>
                <p>
                  {degradedChannels.length > 0
                    ? `${degradedChannels.join(" / ")} channels affected. `
                    : "Communication degradation has occurred. "}
                  {delayedReport
                    ? `${delayedReport.id} arrived ${Math.floor(delayedReport.delaySec / 60)} minutes late.`
                    : "A delayed report is now part of the evidence."}
                </p>
              </div>
              <div className={styles.wowMetrics}>
                <span>FOG INDEX</span>
                <strong>
                  {view.belief
                    ? `${Math.round(view.belief.fogIndex * 100)}%`
                    : "—"}
                </strong>
                {fogDelta !== null && (
                  <small>
                    {fogDelta >= 0 ? "+" : ""}
                    {(fogDelta * 100).toFixed(1)} pp since pre-conflict
                  </small>
                )}
              </div>
              {primary && primaryBelief && (
                <div className={styles.wowMetrics}>
                  <span>REFERENCE BELIEF</span>
                  <strong>{Math.round(primaryBelief.p * 100)}%</strong>
                  <small>
                    {primary.label}: {Math.round(primary.prior * 100)}% prior
                  </small>
                </div>
              )}
            </section>
          )}
        </>
      }
    />
  );
}
