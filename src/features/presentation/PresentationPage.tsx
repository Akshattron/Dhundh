import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  GitCompareArrows,
  Maximize2,
  Minimize2,
  ArrowLeft,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScenarioBadge } from "@/components/ui/ScenarioBadge";
import {
  DemoController,
  DEMO_SCENARIO_ID,
  type DemoActionResult,
} from "@/features/demo/DemoController";
import { scenarios } from "@/scenarios";
import { RemoteSessionClient } from "@/session/RemoteSessionClient";
import { useSessionView, useRemoteStatus } from "@/session/useSessionView";
import { useCompletedAar } from "@/session/useCompletedAar";
import { visibleTimeline } from "@/session/visibleTimeline";
import { useSessionStore } from "@/state/useSessionStore";
import {
  decisionWindowLabel,
  formatClock,
  formatPercent,
} from "@/utils/format";
import { presentationNavigationSchema } from "./PresentationEntry";
import styles from "./PresentationPage.module.css";

type DemoControl = "run" | "pause" | "step" | "wow" | "decision" | "aar";

export default function PresentationPage() {
  const { mode, id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useSessionStore((store) => store.client);
  const experience = useSessionStore((store) => store.experience);
  const setClient = useSessionStore((store) => store.setClient);
  const view = useSessionView(client);
  const network = client instanceof RemoteSessionClient ? client : null;
  const connection = useRemoteStatus(network);
  const supported = ["local", "network", "demo"].includes(mode ?? "");
  const matches =
    !!client &&
    !!view &&
    (mode === "network"
      ? !!network && network.code === id
      : mode === "demo"
        ? !network &&
          experience === "DEMO" &&
          id === DEMO_SCENARIO_ID &&
          view.scenario.id === id
        : mode === "local" &&
          !network &&
          experience !== "DEMO" &&
          view.scenario.id === id);
  const instructorBlocked =
    network?.role === "INSTRUCTOR" && view?.phase !== "COMPLETE";
  const available = supported && matches && !instructorBlocked;
  const {
    aar,
    error: aarError,
    loading,
    retry,
  } = useCompletedAar(available ? client : null, available ? view : null);
  const root = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [controlResult, setControlResult] = useState<DemoActionResult | null>(
    null,
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const demo = useMemo(() => {
    const scenario = scenarios.find(
      (candidate) => candidate.meta.id === DEMO_SCENARIO_ID,
    );
    return mode === "demo" && scenario ? new DemoController(scenario) : null;
  }, [mode]);
  const consolePath = network
    ? network.role === "INSTRUCTOR"
      ? `/instructor/${network.code}`
      : `/session/network/${view?.scenario.id}`
    : mode === "demo"
      ? "/demo"
      : `/session/local/${view?.scenario.id}`;
  const returnState = presentationNavigationSchema.safeParse(location.state);
  const requestedReturn = returnState.success
    ? returnState.data.returnTo
    : undefined;
  const allowedReturn = [consolePath, `/aar/${view?.scenario.id}`];
  const returnTo =
    requestedReturn && allowedReturn.includes(requestedReturn.split("?")[0]!)
      ? requestedReturn
      : matches
        ? consolePath
        : "/";

  const leaveFullscreen = useCallback(async () => {
    if (
      document.fullscreenElement === root.current &&
      typeof document.exitFullscreen === "function"
    ) {
      await document.exitFullscreen();
    }
  }, []);
  const leave = useCallback(
    async (target: string, openConsole?: "decision" | "instructor") => {
      try {
        await leaveFullscreen();
        navigate(target, {
          state: {
            restoreFocus: "presentation-entry",
            ...(openConsole ? { openConsole } : {}),
          },
        });
      } catch (cause) {
        setFullscreenError(
          `Could not exit fullscreen: ${cause instanceof Error ? cause.message : String(cause)}. Use the browser fullscreen control, then exit presentation.`,
        );
      }
    },
    [leaveFullscreen, navigate],
  );
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === root.current) await leaveFullscreen();
      else {
        if (
          !root.current?.requestFullscreen ||
          document.fullscreenEnabled === false
        ) {
          throw new Error(
            "Fullscreen is not supported or permitted in this browser. The windowed presentation remains available.",
          );
        }
        await root.current.requestFullscreen();
      }
      setFullscreenError(null);
    } catch (cause) {
      setFullscreenError(
        cause instanceof Error
          ? cause.message
          : "Fullscreen could not be enabled.",
      );
    }
  };
  useEffect(() => {
    const surface = root.current;
    const update = () => setFullscreen(document.fullscreenElement === surface);
    document.addEventListener("fullscreenchange", update);
    document.getElementById("presentation-exit")?.focus();
    return () => {
      document.removeEventListener("fullscreenchange", update);
      if (
        surface &&
        document.fullscreenElement === surface &&
        document.exitFullscreen
      ) {
        void document
          .exitFullscreen()
          .catch((cause: unknown) =>
            console.error("Presentation fullscreen cleanup failed:", cause),
          );
      }
    };
  }, []);

  const resetDemo = useCallback(() => {
    if (!demo || !available) return;
    try {
      const next = demo.createSession();
      setClient(next, next.getSnapshot(), "DEMO");
      setControlResult({
        ok: true,
        message: "Fresh deterministic demo running from 0:00.",
      });
    } catch (cause) {
      setControlResult({
        ok: false,
        message: `Demo reset failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }, [available, demo, setClient]);
  const runDemo = useCallback(
    (action: DemoControl) => {
      if (!demo || !client || !available) return;
      const actions = {
        run: () => demo.start(client),
        pause: () => demo.pause(client),
        step: () => demo.stepForward(client),
        wow: () => demo.skipToWow(client),
        decision: () => demo.skipToDecision(client),
        aar: () => demo.skipToAar(client),
      };
      try {
        setControlResult(actions[action]());
      } catch (cause) {
        setControlResult({
          ok: false,
          message: `Demo action failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        });
      }
    },
    [available, client, demo],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (helpOpen) {
          setHelpOpen(false);
          document.getElementById("presentation-help")?.focus();
        } else if (document.fullscreenElement === root.current) {
          void leaveFullscreen().catch((cause: unknown) =>
            setFullscreenError(`Fullscreen exit failed: ${String(cause)}`),
          );
        } else void leave(returnTo);
        return;
      }
      if (!demo || !available) return;
      const actions: Record<string, () => void> = {
        h: () => {
          useSessionStore.getState().clear();
          void leave("/");
        },
        d: resetDemo,
        n: () => runDemo("step"),
        j: () => runDemo("decision"),
        a: () => runDemo("aar"),
        i: () => {
          void leave("/demo", "instructor");
        },
        "?": () => setHelpOpen((open) => !open),
      };
      const action = actions[event.key.toLowerCase()];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    available,
    demo,
    helpOpen,
    leave,
    leaveFullscreen,
    resetDemo,
    returnTo,
    runDemo,
  ]);

  const primary = view?.hypotheses.find((hypothesis) => hypothesis.primary);
  const belief = primary ? view?.belief?.perHypothesis[primary.id] : undefined;
  const timeline = useMemo(
    () => (available && view ? visibleTimeline(view, 6) : []),
    [available, view],
  );
  const disconnected =
    network && !["CONNECTED", "COMPLETE"].includes(connection.status ?? "");
  const point = view?.decisionPoint;
  return (
    <div ref={root} className={styles.page} data-testid="presentation-page">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>DHUNDH · presentation</p>
          <ScenarioBadge />
        </div>
        <div className={styles.controls}>
          <Button
            size="sm"
            variant="quiet"
            onClick={() => void toggleFullscreen()}
            aria-pressed={fullscreen}
          >
            {fullscreen ? (
              <Minimize2 size={15} aria-hidden="true" />
            ) : (
              <Maximize2 size={15} aria-hidden="true" />
            )}
            {fullscreen ? "Leave fullscreen" : "Enter fullscreen"}
          </Button>
          <Button
            size="sm"
            id="presentation-exit"
            onClick={() => void leave(returnTo)}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Exit presentation
          </Button>
        </div>
      </header>
      {fullscreenError && (
        <p role="alert" className={styles.warning}>
          {fullscreenError}
        </p>
      )}
      {!available ? (
        <section className={styles.panel} role="alert">
          <h1>
            {!supported
              ? "Unsupported presentation mode"
              : instructorBlocked && matches
                ? "Use a trainee view for live presentation"
                : "Presentation session unavailable"}
          </h1>
          <p>
            {instructorBlocked && matches
              ? "Live instructor diagnostics are not projected to the judge screen. Present a Commander, Analyst, or local exercise; instructor AAR presentation is available only after completion."
              : "This address does not match an active session in this browser. Reloaded, replaced, or expired sessions are not reconstructed from guessed state."}
          </p>
          <div className={styles.controls}>
            <Button onClick={() => void leave("/demo")}>
              Open flagship demo
            </Button>
            <Button onClick={() => void leave("/join")}>
              Join a network session
            </Button>
            <Button onClick={() => void leave("/scenarios")}>
              Scenario library
            </Button>
          </div>
        </section>
      ) : (
        view && (
          <>
            <section className={styles.title}>
              <h1>{view.scenario.title}</h1>
              <p>
                {view.role} projection ·{" "}
                {network
                  ? `authoritative session ${network.code}`
                  : mode === "demo"
                    ? "deterministic local demo"
                    : "local exercise"}{" "}
                · {view.phase}
              </p>
            </section>
            {disconnected && (
              <p role="alert" className={styles.warning}>
                Connection unavailable: {connection.message} Last authoritative
                snapshot shown; the clock is not advanced locally.{" "}
                <Button onClick={() => void leave(consolePath)}>
                  Return to connection controls
                </Button>
              </p>
            )}
            {view.engineError && (
              <p role="alert" className={styles.warning}>
                {view.engineError.message}
              </p>
            )}
            <section
              className={styles.metrics}
              aria-label="Critical session metrics"
            >
              <div>
                <span>Simulation time</span>
                <strong data-testid="presentation-clock">
                  {formatClock(view.nowSec)}
                </strong>
                <small>{view.phase}</small>
              </div>
              <div>
                <span>Fog Index</span>
                <strong data-testid="presentation-fog">
                  {view.belief
                    ? formatPercent(view.belief.fogIndex, 1)
                    : "Withheld"}
                </strong>
                <small>0% clear · 100% fully fogged</small>
              </div>
              <div>
                <span>Primary reference belief</span>
                <strong data-testid="presentation-belief">
                  {belief ? formatPercent(belief.p, 1) : "Withheld"}
                </strong>
                <small>{primary?.label ?? "No primary hypothesis"}</small>
              </div>
              <div className={styles.windowMetric}>
                <span>Decision window</span>
                <strong>
                  {decisionWindowLabel(view) ?? "No active window"}
                </strong>
                <small>
                  {point
                    ? `${formatClock(point.openSec)} to ${formatClock(point.closeSec)} · close exclusive`
                    : "No decision scheduled"}
                  {view.phase === "PAUSED" ? " · clock paused" : ""}
                </small>
              </div>
            </section>
            {view.beliefHidden && (
              <p className={styles.warning}>
                Estimate-first aid is still withheld. Enter your own estimate in
                the training console; presentation never reveals it
                automatically.
              </p>
            )}
            {controlResult && (
              <p
                className={styles.controlResult}
                role={controlResult.ok ? "status" : "alert"}
              >
                {controlResult.message}
              </p>
            )}
            {demo?.isWow(view) && (
              <p className={styles.wow} data-testid="presentation-wow">
                Information environment changed: delayed evidence now conflicts
                with the earlier picture. The displayed belief and Fog Index
                come from this run, not a scripted animation.
              </p>
            )}
            {view.belief && !view.beliefHidden && (
              <section
                className={`${styles.panel} ${styles.signature}`}
                aria-label="Reference belief comparison"
              >
                <div className={styles.sectionHeading}>
                  <div>
                    <p className={styles.kicker}>Information available now</p>
                    <h2>Belief under current evidence</h2>
                  </div>
                  <span>Reference model · not hidden truth</span>
                </div>
                <div className={styles.beliefComparison}>
                  {view.hypotheses.map((hypothesis) => {
                    const assessment =
                      view.belief?.perHypothesis[hypothesis.id];
                    if (!assessment) return null;
                    return (
                      <div
                        className={styles.beliefRow}
                        key={hypothesis.id}
                        data-conflicted={assessment.contradicted}
                      >
                        <div className={styles.beliefHeading}>
                          <h3>{hypothesis.label}</h3>
                          <strong>{formatPercent(assessment.p, 1)}</strong>
                        </div>
                        <div
                          className={styles.beliefTrack}
                          role="img"
                          aria-label={`${hypothesis.label}: current belief ${formatPercent(assessment.p, 1)}, authored prior ${formatPercent(hypothesis.prior)}.`}
                        >
                          <span style={{ width: `${assessment.p * 100}%` }} />
                          <i
                            style={{ left: `${hypothesis.prior * 100}%` }}
                            aria-hidden="true"
                          />
                        </div>
                        <div className={styles.beliefMeta}>
                          <span>Prior {formatPercent(hypothesis.prior)}</span>
                          <span>
                            {assessment.contradicted && (
                              <GitCompareArrows size={14} aria-hidden="true" />
                            )}
                            {assessment.contradicted
                              ? "Evidence split"
                              : "No contradiction"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className={styles.modelNote}>
                  Bars show the current reference belief; markers show the
                  authored prior. New information can move the assessment
                  without revealing the eventual outcome.
                </p>
              </section>
            )}
            <div className={styles.context}>
              <section
                className={styles.panel}
                aria-label="Current decision context"
              >
                <h2>
                  {point ? `${point.id} · ${point.title}` : "Decision context"}
                </h2>
                <p>{point?.prompt ?? "No decision is currently available."}</p>
                {point && (
                  <p>
                    <strong>{decisionWindowLabel(view)}</strong> ·{" "}
                    {formatClock(point.openSec)} to{" "}
                    {formatClock(point.closeSec)} (close exclusive)
                    {view.phase === "PAUSED" ? " · clock paused" : ""}
                  </p>
                )}
                {view.pendingConsequence && (
                  <p data-testid="presentation-pending">
                    Consequence pending until{" "}
                    {formatClock(view.pendingConsequence.revealAtSec)}. Outcome
                    remains withheld until completion.
                  </p>
                )}
                {view.phase !== "COMPLETE" && (
                  <Button
                    onClick={() =>
                      void leave(
                        consolePath,
                        point?.status === "OPEN" && view.role !== "ANALYST"
                          ? "decision"
                          : undefined,
                      )
                    }
                  >
                    {point?.status === "OPEN" && view.role !== "ANALYST"
                      ? "Open decision console"
                      : "Return to training console"}
                  </Button>
                )}
                <p>
                  {view.channels
                    .filter((channel) => channel.visible)
                    .map((channel) => `${channel.id}: ${channel.health}`)
                    .join(" · ")}
                </p>
              </section>
              <section
                className={styles.panel}
                aria-label="Visible event timeline"
              >
                <h2>Recent visible events</h2>
                {timeline.length ? (
                  <ol className={styles.timeline}>
                    {timeline.map((event, index) => (
                      <li key={`${event.atSec}-${index}`}>
                        <time>{formatClock(event.atSec)}</time>
                        <span>{event.label}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No delivered evidence or trainee actions yet.</p>
                )}
                <p>
                  Only events in this role's projection. Tied timestamps do not
                  imply causal ordering; exact history is available in completed
                  replay.
                </p>
              </section>
            </div>
            {view.phase !== "COMPLETE" ? (
              <p className={styles.disclosure}>
                Truth and outcome are withheld. Decision quality will be
                evaluated using the information available at commitment,
                separately from the eventual result.
              </p>
            ) : (
              <section
                className={styles.panel}
                aria-label="Completed AAR summary"
                data-testid="presentation-aar"
              >
                <h2>Completed AAR summary</h2>
                {loading && (
                  <p role="status">
                    Loading authorized completed-session analysis...
                  </p>
                )}
                {aarError && (
                  <div role="alert">
                    <p>AAR unavailable: {aarError}</p>
                    <Button onClick={retry}>Retry AAR</Button>
                  </div>
                )}
                {!loading && !aarError && !aar && (
                  <p role="status">
                    Completion analysis is not available for this snapshot.
                    Return to the exercise to recover.
                  </p>
                )}
                {aar && (
                  <>
                    <p>
                      Post-completion review. Decision-time quality is separate
                      from the subsequently revealed outcome.
                    </p>
                    <div className={styles.metrics}>
                      <div>
                        <span>Decision quality</span>
                        <strong>{formatPercent(aar.scores.dq, 1)}</strong>
                        <small>Information-conditioned</small>
                      </div>
                      <div>
                        <span>Information utilization</span>
                        <strong>{formatPercent(aar.scores.infoUtil, 1)}</strong>
                        <small>Observed use, not outcome</small>
                      </div>
                      <div>
                        <span>Training score</span>
                        <strong data-testid="presentation-score">
                          {aar.scores.trainingScore.toFixed(1)}
                        </strong>
                        <small>/ 100 · author-assigned model</small>
                      </div>
                    </div>
                    <p>
                      Last decision: {aar.decision.actionLabel} at{" "}
                      {formatClock(aar.decision.atSec)}.
                    </p>
                    <h3>
                      Outcome revealed after completion:{" "}
                      {aar.consequence.headline}
                    </h3>
                    <p>{aar.consequence.narrative}</p>
                    {aar.team && (
                      <p>
                        Team sharing:{" "}
                        {aar.team.metrics.informationSharingRate === null
                          ? "no meaningful opportunities"
                          : formatPercent(
                              aar.team.metrics.informationSharingRate,
                              1,
                            )}
                        . Paired estimate agreement:{" "}
                        {aar.team.metrics.estimateConvergence === null
                          ? "both estimates needed"
                          : formatPercent(
                              aar.team.metrics.estimateConvergence,
                              1,
                            )}
                        . These are descriptive metrics, not validated
                        learning-transfer measures.
                      </p>
                    )}
                    <Button
                      variant="primary"
                      onClick={() => void leave(`/aar/${view.scenario.id}`)}
                    >
                      Open full AAR and replay
                    </Button>
                  </>
                )}
              </section>
            )}
            {demo && (
              <section
                className={styles.presenterControls}
                aria-label="Presentation demo controls"
              >
                <p className={styles.kicker}>Presenter controls</p>
                <div className={styles.controls}>
                  <Button size="sm" onClick={() => runDemo("run")}>
                    <Play size={14} aria-hidden="true" /> Run / resume
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => runDemo("pause")}
                    disabled={view.phase !== "RUNNING"}
                  >
                    <Pause size={14} aria-hidden="true" /> Pause
                  </Button>
                  <Button size="sm" onClick={resetDemo}>
                    Reset demo
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => runDemo("step")}
                    disabled={!["RUNNING", "CONSEQUENCE"].includes(view.phase)}
                  >
                    Next event
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => runDemo("wow")}
                    disabled={view.phase !== "RUNNING"}
                  >
                    Show WOW event
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => runDemo("decision")}
                    disabled={view.phase !== "RUNNING"}
                  >
                    Jump to decision
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => runDemo("aar")}
                    disabled={view.phase === "PAUSED"}
                  >
                    Complete to AAR summary
                  </Button>
                  <Button
                    size="sm"
                    id="presentation-help"
                    aria-expanded={helpOpen}
                    onClick={() => setHelpOpen((open) => !open)}
                  >
                    Shortcuts
                  </Button>
                </div>
                {helpOpen && (
                  <p className={styles.help}>
                    H home · D reset · N next event · J decision window · A
                    complete real path and show AAR summary · I instructor
                    controls in the console · ? shortcuts. Escape closes help,
                    leaves fullscreen, then exits presentation. Typing fields
                    are not intercepted.
                  </p>
                )}
              </section>
            )}
          </>
        )
      )}
      <footer className={styles.disclosure}>
        Synthetic, fictional, non-operational training. Escape leaves fullscreen
        first, then returns to the exercise. Presentation changes no scores,
        event times, or role permissions.
      </footer>
    </div>
  );
}
