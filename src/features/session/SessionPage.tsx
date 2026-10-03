import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  FileText,
  GitCompareArrows,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Signal,
} from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import type { RationaleTag } from "@/engine";
import {
  ChannelHealthStrip,
  ChannelIcon,
} from "@/features/trainee/ChannelHealthStrip";
import { ContradictionMeter } from "@/features/trainee/ContradictionMeter";
import { EvidenceWaterfall } from "@/features/trainee/EvidenceWaterfall";
import { FogMeter } from "@/features/trainee/FogMeter";
import { ReferenceModelDrawer } from "@/features/trainee/ReferenceModelDrawer";
import { InstructorControls } from "./InstructorControls";
import { DEMO_SCENARIO_ID } from "@/features/demo/DemoController";
import type { ProjectedReport, TraineeView } from "@/engine/view";
import type { SessionCommand } from "@/session/SessionClient";
import { RemoteSessionClient } from "@/session/RemoteSessionClient";
import { useRemoteStatus, useSessionView } from "@/session/useSessionView";
import type { NetworkSessionView } from "@/session/protocol";
import { createLocalSession } from "@/session/LocalSessionClient";
import { scenarios } from "@/scenarios";
import { useSessionStore } from "@/state/useSessionStore";
import { visibleTimeline } from "@/session/visibleTimeline";
import {
  PresentationEntry,
  presentationNavigationSchema,
} from "@/features/presentation/PresentationEntry";
import {
  decisionWindowLabel,
  formatAge,
  formatClock,
  formatPercent,
} from "@/utils/format";
import styles from "./SessionPage.module.css";

interface ReportCardProps {
  report: ProjectedReport;
  sourceLabel: string | undefined;
  arrivedRecently: boolean;
  phase: TraineeView["phase"];
  selected: boolean;
  expanded: boolean;
  onOpen: (reportId: string) => void;
  onToggleDetails: (reportId: string) => void;
}

const ReportCard = memo(
  function ReportCard({
    report,
    sourceLabel,
    arrivedRecently,
    phase,
    selected,
    expanded,
    onOpen,
    onToggleDetails,
  }: ReportCardProps) {
    const ageAtDisplayedMinute = Math.floor(report.ageSec / 60) * 60;
    return (
      <article
        className={`${styles.report} ${arrivedRecently ? styles.arrival : ""}`}
        data-report-id={report.id}
        data-channel={report.channel}
        data-inspected={report.opened}
        data-selected={selected}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.target !== event.currentTarget)
            return;
          event.preventDefault();
          event.stopPropagation();
          if (report.opened) onToggleDetails(report.id);
          else if (phase === "RUNNING") onOpen(report.id);
        }}
        style={{
          backgroundColor:
            report.weight === null
              ? undefined
              : `color-mix(in srgb, var(--surface-2) ${Math.round(report.weight * 100)}%, var(--bg-1))`,
        }}
      >
        <div className={styles.reportMeta}>
          <span className={styles.reportIdentity}>
            <ChannelIcon channel={report.channel} size={14} />
            <strong>{report.id}</strong> · {report.channel}
          </span>
          <span>Grade {report.gradeLabel}</span>
          {report.badges.map((badge) => (
            <span className={styles.badge} key={badge}>
              {badge}
            </span>
          ))}
        </div>
        {sourceLabel && <p className={styles.source}>{sourceLabel}</p>}
        <p className={styles.claim}>{report.claim}</p>
        <div className={styles.reportTiming}>
          <span>
            Issued <time>{formatClock(report.issuedAtSec)}</time>
          </span>
          <span>
            Received <time>{formatClock(report.deliveredAtSec)}</time>
          </span>
          <span>{formatAge(ageAtDisplayedMinute)}</span>
          {report.delaySec > 0 && (
            <span className={styles.delayed}>
              <Clock3 size={12} aria-hidden="true" /> Delayed{" "}
              {formatClock(report.delaySec)}
            </span>
          )}
        </div>
        <p className={styles.evidenceGroup}>
          Group <span>{report.evidenceGroup}</span>
        </p>
        {report.opened &&
          report.effectiveAccuracy !== null &&
          report.contradicts.length > 0 && (
            <p className={styles.reportConflict}>
              <GitCompareArrows size={14} aria-hidden="true" /> Conflicts with{" "}
              {report.contradicts.join(", ")}
            </p>
          )}
        {report.opened && expanded && report.detail && (
          <p className={styles.detail}>{report.detail}</p>
        )}
        {report.opened && expanded && report.effectiveAccuracy !== null && (
          <div className={styles.reportMath}>
            Reliability now {formatPercent(report.effectiveAccuracy)} · evidence
            contribution {report.contributionNats?.toFixed(2) ?? "—"} nats
          </div>
        )}
        {!report.opened && phase === "RUNNING" && (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => onOpen(report.id)}
            data-testid={`open-report-${report.id}`}
          >
            <FileText size={14} /> Open report
          </Button>
        )}
        {!report.opened && phase !== "RUNNING" && (
          <p className={styles.inspectionHeld}>
            Not inspected ·{" "}
            {phase === "PAUSED"
              ? "resume the clock to inspect"
              : "inspection unavailable"}
          </p>
        )}
        {report.opened && (
          <div className={styles.openLabel}>
            <span>
              <Check size={13} /> Opened
            </span>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => onToggleDetails(report.id)}
            >
              {expanded ? "Hide details" : "Show details"}
            </Button>
          </div>
        )}
      </article>
    );
  },
  (previous, next) => {
    const left = previous.report;
    const right = next.report;
    return (
      left.id === right.id &&
      left.channel === right.channel &&
      left.claim === right.claim &&
      left.detail === right.detail &&
      left.evidenceGroup === right.evidenceGroup &&
      left.issuedAtSec === right.issuedAtSec &&
      left.deliveredAtSec === right.deliveredAtSec &&
      left.gradeLabel === right.gradeLabel &&
      Math.floor(left.ageSec / 60) === Math.floor(right.ageSec / 60) &&
      left.delaySec === right.delaySec &&
      left.origin === right.origin &&
      left.badges.join("|") === right.badges.join("|") &&
      left.effectiveAccuracy?.toFixed(2) ===
        right.effectiveAccuracy?.toFixed(2) &&
      left.contributionNats?.toFixed(2) ===
        right.contributionNats?.toFixed(2) &&
      (left.weight === null ? null : left.weight.toFixed(2)) ===
        (right.weight === null ? null : right.weight.toFixed(2)) &&
      left.contradicts.join("|") === right.contradicts.join("|") &&
      left.opened === right.opened &&
      previous.phase === next.phase &&
      previous.sourceLabel === next.sourceLabel &&
      previous.arrivedRecently === next.arrivedRecently &&
      previous.selected === next.selected &&
      previous.expanded === next.expanded &&
      previous.onOpen === next.onOpen &&
      previous.onToggleDetails === next.onToggleDetails
    );
  },
);

interface SessionPageProps {
  demoMode?: boolean;
  onDemoReset?: () => void;
  presenter?: ReactNode;
}

export default function SessionPage({
  demoMode = false,
  onDemoReset,
  presenter,
}: SessionPageProps) {
  const { id } = useParams();
  const expectedScenarioId = demoMode ? DEMO_SCENARIO_ID : id;
  const navigate = useNavigate();
  const location = useLocation();
  const client = useSessionStore((store) => store.client);
  const setClient = useSessionStore((store) => store.setClient);
  const setClientView = useSessionStore((store) => store.setView);
  const view = useSessionView(client);
  const networkClient = client instanceof RemoteSessionClient ? client : null;
  const networkInstructor = networkClient?.role === "INSTRUCTOR";
  const canMakeDecision = !networkClient || networkClient.role === "COMMANDER";
  const networkView: NetworkSessionView | null = networkClient
    ? networkClient.getSnapshot()
    : null;
  const remoteStatus = useRemoteStatus(networkClient);
  const [estimateDrafts, setEstimateDrafts] = useState<Record<string, string>>(
    {},
  );
  const [rationale, setRationale] = useState("");
  const [citations, setCitations] = useState<string[]>([]);
  const [tags, setTags] = useState<RationaleTag[]>([]);
  const [showDecision, setShowDecision] = useState(false);
  const [reportChannel, setReportChannel] = useState("ALL");
  const [mobileSection, setMobileSection] = useState<
    "evidence" | "situation" | "decision"
  >("evidence");
  const [instructorOpen, setInstructorOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [instructorTruthVisible, setInstructorTruthVisible] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsTrigger = useRef<HTMLButtonElement>(null);
  const consoleElement = useRef<HTMLDivElement>(null);
  const decisionDialog = useDialogFocus(
    showDecision,
    () => setShowDecision(false),
    consoleElement,
  );
  const shortcutsDialog = useDialogFocus(
    showShortcuts,
    () => setShowShortcuts(false),
    consoleElement,
  );
  const scrollSelection = useRef(false);
  const [selectedReportIndex, setSelectedReportIndex] = useState(0);
  const [expandedReportIds, setExpandedReportIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [presetCooldowns, setPresetCooldowns] = useState<
    Record<string, number>
  >({});
  const [relayNote, setRelayNote] = useState("");
  const presetCooldownsRef = useRef<Record<string, number>>({});
  const controlsAvailable =
    !networkClient &&
    (demoMode || new URLSearchParams(location.search).get("controls") === "1");

  useEffect(() => {
    if (view) setClientView(view);
  }, [setClientView, view]);

  useEffect(() => {
    const state = presentationNavigationSchema.safeParse(location.state);
    if (!state.success) return;
    if (
      state.data.openConsole === "decision" &&
      canMakeDecision &&
      view?.decisionPoint?.status === "OPEN"
    )
      setShowDecision(true);
    if (state.data.openConsole === "instructor" && controlsAvailable)
      setInstructorOpen(true);
  }, [
    location.key,
    location.state,
    canMakeDecision,
    controlsAvailable,
    view?.decisionPoint?.status,
  ]);

  const dispatch = useCallback(
    (command: SessionCommand) => {
      if (!client) return;
      client.dispatch(command);
      setClientView(client.getSnapshot());
    },
    [client, setClientView],
  );
  const continueLocally = () => {
    if (!networkClient || !view) return;
    const scenario = scenarios.find(
      (item) => item.meta.id === view.scenario.id,
    );
    if (!scenario) return;
    const credential = networkClient.getCredential();
    const local = createLocalSession(scenario, {
      seed: credential.seed,
      difficultyLevel: credential.difficultyLevel,
      aidMode: view.aidMode,
      speedSecPerMin: 4,
    });
    setClient(local, local.getSnapshot());
    navigate(`/session/local/${scenario.meta.id}`);
  };
  const openReport = useCallback(
    (reportId: string) => {
      dispatch({ type: "OPEN_REPORT", reportId });
      setExpandedReportIds((previous) => new Set(previous).add(reportId));
    },
    [dispatch],
  );
  const toggleReportDetails = useCallback((reportId: string) => {
    setExpandedReportIds((previous) => {
      const next = new Set(previous);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  }, []);
  const injectPreset = useCallback(
    (presetId: string) => {
      const now = Date.now();
      if ((presetCooldownsRef.current[presetId] ?? 0) > now) return;
      const until = now + 3000;
      presetCooldownsRef.current[presetId] = until;
      setPresetCooldowns((previous) => ({ ...previous, [presetId]: until }));
      window.setTimeout(() => {
        if (presetCooldownsRef.current[presetId] !== until) return;
        const next = { ...presetCooldownsRef.current };
        delete next[presetId];
        presetCooldownsRef.current = next;
        setPresetCooldowns(next);
      }, 3000);
      dispatch({ type: "INJECT", presetId });
      setInstructorOpen(true);
    },
    [dispatch],
  );
  const resetExercise = useCallback(() => {
    if (demoMode) {
      onDemoReset?.();
      return;
    }
    if (
      window.confirm("Reset this exercise and clear the accepted-intent log?")
    ) {
      dispatch({ type: "RESET" });
      setShowDecision(false);
      setEstimateDrafts({});
      setRationale("");
      setCitations([]);
      setTags([]);
      setExpandedReportIds(new Set());
      presetCooldownsRef.current = {};
      setPresetCooldowns({});
    }
  }, [demoMode, dispatch, onDemoReset]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      const interactive =
        target instanceof HTMLElement &&
        target.closest("button, a, summary, [role='button'], [role='tab']");
      if (event.key === "Escape") {
        if (showShortcuts) setShowShortcuts(false);
        else if (showDecision) setShowDecision(false);
        else if (instructorOpen) setInstructorOpen(false);
        else if (toolsOpen) {
          setToolsOpen(false);
          toolsTrigger.current?.focus();
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (
        typing ||
        (interactive && key !== "?" && !(instructorOpen && key === "i")) ||
        showDecision ||
        showShortcuts ||
        !view
      ) {
        return;
      }
      if (key === "?") {
        event.preventDefault();
        setShowShortcuts(true);
      } else if (key === "i" && controlsAvailable) {
        event.preventDefault();
        setInstructorOpen((open) => !open);
      } else if (key === "m" && controlsAvailable) {
        event.preventDefault();
        setDiagnosticsOpen((open) => !open);
        setInstructorOpen(true);
      } else if (key === "t" && controlsAvailable) {
        event.preventDefault();
        setInstructorTruthVisible((visible) => !visible);
        setDiagnosticsOpen(true);
        setInstructorOpen(true);
      } else if (key === "r" && (!networkClient || networkInstructor)) {
        event.preventDefault();
        resetExercise();
      } else if (
        key === " " &&
        view.phase === "RUNNING" &&
        (!networkClient || networkInstructor)
      ) {
        event.preventDefault();
        dispatch({ type: "PAUSE" });
      } else if (
        key === " " &&
        view.phase === "PAUSED" &&
        (!networkClient || networkInstructor)
      ) {
        event.preventDefault();
        dispatch({ type: "RESUME" });
      } else if (controlsAvailable && /^[1-5]$/.test(event.key)) {
        const preset =
          client?.getInstructorDiagnostics().presets[Number(event.key) - 1];
        if (preset) {
          event.preventDefault();
          injectPreset(preset.id);
        }
      } else if (key === "j" || key === "k") {
        event.preventDefault();
        scrollSelection.current = true;
        setMobileSection("evidence");
        const direction = key === "j" ? 1 : -1;
        setReportChannel("ALL");
        setSelectedReportIndex((index) => {
          const count = view.reports.length;
          if (count === 0) return 0;
          return (index + direction + count) % count;
        });
      } else if (key === "enter" && view.reports.length > 0) {
        const report =
          view.reports[Math.min(selectedReportIndex, view.reports.length - 1)];
        if (report && !report.opened && view.phase === "RUNNING") {
          event.preventDefault();
          openReport(report.id);
        } else if (report?.opened) {
          event.preventDefault();
          toggleReportDetails(report.id);
        }
      } else if (key === "e") {
        event.preventDefault();
        setMobileSection("decision");
        window.requestAnimationFrame(() => {
          document
            .querySelector<HTMLInputElement>(
              'input[aria-label$="estimate percentage"]',
            )
            ?.focus();
        });
      } else if (key === "l") {
        const hypothesisId = view.decisionPoint?.requiredEstimates[0];
        const raw = hypothesisId ? estimateDrafts[hypothesisId] : undefined;
        const value = raw === undefined ? NaN : Number(raw);
        if (
          hypothesisId &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= 100
        ) {
          event.preventDefault();
          dispatch({
            type: "SET_ESTIMATE",
            hypothesisId,
            p: value / 100,
          });
        }
      } else if (key === "v" && canMakeDecision) {
        const asset = view.decisionPoint?.assets.find(
          (candidate) => candidate.feasible,
        );
        if (asset) {
          event.preventDefault();
          dispatch({ type: "VERIFY", assetId: asset.id });
        }
      } else if (
        key === "d" &&
        view.phase === "RUNNING" &&
        view.decisionPoint?.status === "OPEN" &&
        canMakeDecision
      ) {
        event.preventDefault();
        setShowDecision(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    client,
    controlsAvailable,
    dispatch,
    estimateDrafts,
    injectPreset,
    openReport,
    instructorOpen,
    resetExercise,
    selectedReportIndex,
    showDecision,
    showShortcuts,
    toolsOpen,
    toggleReportDetails,
    view,
    networkClient,
    networkInstructor,
    canMakeDecision,
  ]);
  const selectedReportId = view?.reports[selectedReportIndex]?.id;
  useEffect(() => {
    if (!selectedReportId || !scrollSelection.current) return;
    scrollSelection.current = false;
    const report = [
      ...document.querySelectorAll<HTMLElement>("[data-report-id]"),
    ].find((element) => element.dataset.reportId === selectedReportId);
    report?.focus({ preventScroll: true });
    report?.scrollIntoView?.({ block: "nearest" });
  }, [selectedReportId]);

  if (!client || !view || view.scenario.id !== expectedScenarioId) {
    return (
      <section className={styles.unavailable}>
        <CircleHelp size={24} aria-hidden="true" />
        <h1>
          {networkClient
            ? "Network session unavailable"
            : "Local session unavailable"}
        </h1>
        <p>
          This browser session is no longer active. Return to the lobby or start
          a fresh exercise.
        </p>
        <Button
          onClick={() => navigate(networkClient ? "/join" : "/scenarios")}
        >
          {networkClient ? "Join a session" : "Open scenario library"}
        </Button>
      </section>
    );
  }

  const dp = view.decisionPoint;
  const windowState = decisionWindowLabel(view);
  const filteredReports =
    reportChannel === "ALL"
      ? view.reports
      : view.reports.filter((report) => report.channel === reportChannel);
  const recentTimeline = visibleTimeline(view);
  const canPause =
    view.phase === "RUNNING" && (!networkClient || networkInstructor);
  const canResume =
    view.phase === "PAUSED" && (!networkClient || networkInstructor);
  const tagsAvailable: RationaleTag[] = [
    "RELIED_ON_FRESH_REPORT",
    "DISCOUNTED_STALE_REPORT",
    "WEIGHED_CONTRADICTION",
    "PRIORITIZED_SAFETY",
    "PRIORITIZED_TIME",
    "AWAITED_VERIFICATION",
  ];

  const makeRationale = () => ({
    text: rationale.trim(),
    citedReportIds: citations,
    tags,
  });
  const reportById = new Map(view.reports.map((report) => [report.id, report]));
  const waterfallHypotheses = view.belief
    ? view.hypotheses.flatMap((hypothesis) => {
        const belief = view.belief?.perHypothesis[hypothesis.id];
        const modelHypothesis = view.referenceModel.hypotheses.find(
          (item) => item.id === hypothesis.id,
        );
        if (!belief || !modelHypothesis) return [];
        return [
          {
            id: hypothesis.id,
            label: hypothesis.label,
            priorLogOdds: modelHypothesis.priorLogOdds,
            currentLogOdds: belief.logOdds,
            contributions: belief.contributions.flatMap((contribution) => {
              const report = reportById.get(contribution.reportId);
              if (!report) return [];
              return [
                {
                  reportId: contribution.reportId,
                  group: contribution.group,
                  channel: contribution.channel,
                  claim: report.claim,
                  gradeLabel: report.gradeLabel,
                  ageSec: contribution.ageSec,
                  effectiveAccuracy: contribution.effectiveAccuracy,
                  llr: contribution.llr,
                  inspected: view.inspections.includes(contribution.reportId),
                },
              ];
            }),
          },
        ];
      })
    : [];

  return (
    <div
      className={styles.console}
      data-mobile-section={mobileSection}
      ref={consoleElement}
      tabIndex={-1}
      onFocusCapture={(event) => {
        const reportId =
          event.target.closest<HTMLElement>("[data-report-id]")?.dataset
            .reportId;
        if (!reportId) return;
        const index = view.reports.findIndex(
          (report) => report.id === reportId,
        );
        if (index >= 0) setSelectedReportIndex(index);
      }}
    >
      <header className={styles.topbar}>
        <div>
          <p className={styles.kicker}>
            Live{" "}
            {networkClient
              ? `network exercise · ${view.role}`
              : "local exercise"}{" "}
            · synthetic
          </p>
          <h1>{view.scenario.title}</h1>
        </div>
        <div className={styles.context}>
          {demoMode && <span className={styles.modeLabel}>Flagship demo</span>}
          <span
            className={`${styles.phase} ${styles[view.phase.toLowerCase()]}`}
          >
            {view.phase === "PAUSED" ? (
              <Pause size={12} aria-hidden="true" />
            ) : (
              <Activity size={12} aria-hidden="true" />
            )}
            {view.phase}
          </span>
          <span className={styles.clock} data-testid="session-clock">
            <Clock3 size={16} aria-hidden="true" /> {formatClock(view.nowSec)}
          </span>
          {dp && (
            <span className={styles.windowContext}>
              {windowState === "OPEN"
                ? "Window open"
                : windowState === "CLOSED"
                  ? "Window closed"
                  : "Window upcoming"}{" "}
              · {formatClock(dp.openSec)}–{formatClock(dp.closeSec)}
            </span>
          )}
          <Button
            ref={toolsTrigger}
            size="sm"
            variant="quiet"
            className={styles.toolsTrigger}
            aria-controls="console-tools"
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen((open) => !open)}
          >
            Tools
          </Button>
        </div>
        <div
          className={styles.status}
          id="console-tools"
          data-expanded={toolsOpen}
        >
          <PresentationEntry
            client={client}
            view={view}
            demo={demoMode}
            focusFallback={toolsTrigger}
          />
          {view.aidRevealed ? (
            <ReferenceModelDrawer
              model={view.referenceModel}
              focusFallback={toolsTrigger}
            />
          ) : (
            <span className={styles.muted} role="status">
              Reference aid unlocks after your first probability estimate.
            </span>
          )}
          {controlsAvailable && (
            <InstructorControls
              client={client}
              open={instructorOpen}
              onOpenChange={setInstructorOpen}
              dispatch={dispatch}
              diagnosticsOpen={diagnosticsOpen}
              onDiagnosticsOpenChange={setDiagnosticsOpen}
              truthVisible={instructorTruthVisible}
              onTruthVisibleChange={setInstructorTruthVisible}
              cooldowns={presetCooldowns}
              onInject={injectPreset}
              onReset={demoMode ? onDemoReset : undefined}
              focusFallback={toolsTrigger}
            />
          )}
          {networkClient && (
            <span
              className={styles.phase}
              data-testid="network-connection-status"
              role="status"
            >
              {remoteStatus.status}: {remoteStatus.message}
            </span>
          )}
          {!demoMode && canPause && (
            <Button
              size="sm"
              onClick={() => dispatch({ type: "PAUSE" })}
              icon={<Pause size={14} />}
            >
              Pause
            </Button>
          )}
          {!demoMode && canResume && (
            <Button
              size="sm"
              onClick={() => dispatch({ type: "RESUME" })}
              icon={<Play size={14} />}
            >
              Resume
            </Button>
          )}
          {view.phase === "COMPLETE" && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => navigate(`/aar/${view.scenario.id}`)}
            >
              After-action review <ArrowRight size={14} />
            </Button>
          )}
        </div>
      </header>
      {presenter}

      {networkClient && remoteStatus.status === "FALLBACK_AVAILABLE" && (
        <section className={styles.error} role="alert">
          <span>
            A local fallback starts a fresh exercise with the same scenario,
            seed, and difficulty. Server progress will not be recovered.
          </span>
          <Button size="sm" onClick={continueLocally}>
            Continue locally
          </Button>
        </section>
      )}

      {view.scenario.briefing
        .filter((paragraph) => paragraph.startsWith("Warning: Seed "))
        .map((warning) => (
          <section className={styles.error} role="status" key={warning}>
            {warning}
          </section>
        ))}

      {view.engineError && (
        <div className={styles.error} role="alert">
          <strong>Action not accepted</strong> · {view.engineError.message} (
          {view.engineError.code})
        </div>
      )}

      <ChannelHealthStrip channels={view.channels} nowSec={view.nowSec} />

      {view.phase === "IDLE" && (
        <section className={styles.startPanel}>
          <Activity size={22} aria-hidden="true" />
          <div>
            <h2>Exercise ready</h2>
            <p>
              {networkClient && !networkInstructor
                ? "Waiting for the instructor to start the authoritative clock."
                : "Start the deterministic scenario clock to begin receiving reports."}
            </p>
          </div>
          {(!networkClient || networkInstructor) && (
            <Button
              variant="primary"
              onClick={() => dispatch({ type: "START" })}
            >
              Start clock
            </Button>
          )}
        </section>
      )}
      {view.phase === "PAUSED" && (
        <div className="sr-only" role="status">
          Clock paused · simulation time and event delivery are held.
        </div>
      )}

      <Tabs
        className={styles.mobileTabs}
        id="console-tabs"
        label="Exercise console panels"
        value={mobileSection}
        onChange={setMobileSection}
        tabs={[
          {
            value: "evidence",
            label: "Evidence",
            controls: "console-evidence console-waterfall",
          },
          {
            value: "situation",
            label: "Situation",
            controls: "console-situation console-timeline",
          },
          {
            value: "decision",
            label: "Decision",
            controls: "console-decision",
          },
        ]}
      />
      <div className={styles.mainGrid}>
        <section
          className={styles.panel}
          id="console-evidence"
          role="tabpanel"
          aria-labelledby="console-tabs-evidence"
          tabIndex={0}
          data-panel="evidence"
          data-mobile-active={mobileSection === "evidence"}
        >
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.kicker}>What changed?</p>
              <h2>Incoming reports</h2>
            </div>
            <div className={styles.reportControls}>
              <span className={styles.count}>
                {view.reports.filter((report) => !report.opened).length} unread
                · {view.reports.length} delivered
              </span>
              <label>
                <span className={styles.srOnly}>Filter reports by channel</span>
                <select
                  value={reportChannel}
                  onChange={(event) => setReportChannel(event.target.value)}
                >
                  <option value="ALL">All channels</option>
                  {view.channels
                    .filter((channel) => channel.visible)
                    .map((channel) => (
                      <option value={channel.id} key={channel.id}>
                        {channel.id}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </div>
          <div className={styles.reportList} aria-live="polite">
            {filteredReports.length === 0 ? (
              <div className={styles.empty}>
                <Signal size={19} aria-hidden="true" />
                <span>
                  {view.reports.length === 0
                    ? "Listening for incoming information…"
                    : "No reports match this channel filter."}
                </span>
              </div>
            ) : (
              filteredReports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  sourceLabel={
                    view.channels.find(
                      (channel) => channel.id === report.channel,
                    )?.sourceLabel
                  }
                  arrivedRecently={view.nowSec - report.deliveredAtSec < 60}
                  phase={view.phase}
                  selected={view.reports[selectedReportIndex]?.id === report.id}
                  expanded={expandedReportIds.has(report.id)}
                  onOpen={openReport}
                  onToggleDetails={toggleReportDetails}
                />
              ))
            )}
          </div>
          {networkClient?.role === "ANALYST" && networkView && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.kicker}>Structured team action</p>
                  <h2>Relay to Commander</h2>
                </div>
                <span className={styles.count}>
                  {networkView.relayCapacityLeft} relays remaining
                </span>
              </div>
              <label className={styles.rationale}>
                Optional relay note (80 characters maximum)
                <input
                  value={relayNote}
                  maxLength={80}
                  onChange={(event) => setRelayNote(event.target.value)}
                />
              </label>
              <div className={styles.reportList}>
                {view.reports.map((report) => (
                  <div className={styles.verify} key={report.id}>
                    <span>
                      <strong>{report.id}</strong> · {report.claim}
                    </span>
                    <Button
                      size="sm"
                      disabled={
                        view.phase !== "RUNNING" ||
                        networkView.relayCapacityLeft <= 0
                      }
                      onClick={() =>
                        dispatch({
                          type: "RELAY",
                          reportId: report.id,
                          ...(relayNote.trim()
                            ? { note: relayNote.trim() }
                            : {}),
                        })
                      }
                      data-testid={`relay-report-${report.id}`}
                    >
                      Relay
                    </Button>
                  </div>
                ))}
                {view.reports.length === 0 && (
                  <p className={styles.muted}>
                    No delivered Analyst-visible reports are available to relay.
                  </p>
                )}
              </div>
              <label className={styles.rationale}>
                Advice for the current choice
                <select
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value) {
                      dispatch({
                        type: "ADVISE",
                        actionId: event.target.value,
                        ...(relayNote.trim() ? { note: relayNote.trim() } : {}),
                      });
                      event.target.value = "";
                    }
                  }}
                >
                  <option value="" disabled>
                    Select an action to advise
                  </option>
                  {view.decisionPoint?.actions.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}
        </section>

        <div className={styles.centerColumn}>
          <section
            className={styles.panel}
            id="console-situation"
            role="tabpanel"
            aria-labelledby="console-tabs-situation"
            tabIndex={0}
            data-panel="situation"
            data-mobile-active={mobileSection === "situation"}
          >
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>What do I know?</p>
                <h2>Assessment</h2>
              </div>
              {view.belief && <FogMeter value={view.belief.fogIndex} />}
            </div>
            {view.beliefHidden ? (
              <div className={styles.hiddenBelief}>
                Record an estimate to reveal the decision aid.
              </div>
            ) : view.belief ? (
              <div className={styles.hypotheses}>
                {view.hypotheses.map((hypothesis) => {
                  const assessment = view.belief?.perHypothesis[hypothesis.id];
                  if (!assessment) return null;
                  return (
                    <div
                      className={styles.hypothesis}
                      key={hypothesis.id}
                      data-conflicted={assessment.contradicted}
                    >
                      <div className={styles.hypothesisHeading}>
                        <strong>{hypothesis.label}</strong>
                        <span
                          className={styles.beliefValue}
                          key={assessment.contributions
                            .map((item) => item.reportId)
                            .join("|")}
                        >
                          {formatPercent(assessment.p, 1)}
                        </span>
                      </div>
                      <div
                        className={styles.track}
                        role="img"
                        aria-label={`${hypothesis.label} belief`}
                      >
                        <span style={{ width: `${assessment.p * 100}%` }} />
                        <i
                          style={{ left: `${hypothesis.prior * 100}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <div className={styles.beliefFoot}>
                        <span>
                          Prior {formatPercent(hypothesis.prior)} · Entropy{" "}
                          {assessment.entropyBits.toFixed(2)} bits
                        </span>
                        <span>
                          {assessment.contradicted
                            ? "Evidence split"
                            : "No contradiction"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.hiddenBelief}>
                Belief model is unavailable.
              </div>
            )}
            {!view.beliefHidden &&
              view.belief &&
              view.hypotheses.length > 1 &&
              view.hypotheses.slice(0, 2).map((hypothesis) => {
                const assessment = view.belief?.perHypothesis[hypothesis.id];
                if (!assessment) return null;
                return (
                  <ContradictionMeter
                    key={`contradiction-${hypothesis.id}`}
                    hypothesis={hypothesis.label}
                    positiveNats={assessment.positiveNats}
                    negativeNats={assessment.negativeNats}
                    index={assessment.contradictionIndex}
                    threshold={
                      view.referenceModel.parameters.contradictionThreshold
                    }
                    minimumNats={
                      view.referenceModel.parameters.contradictionMinNats
                    }
                    contradicted={assessment.contradicted}
                  />
                );
              })}
            <details className={styles.method}>
              <summary>Reference model and limitations</summary>
              <p>
                Evidence ages from its issue time using the channel decay
                constant. The complete formula and assumptions are available in
                the Reference model drawer.
              </p>
              <ul>
                {view.referenceModel.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </details>
          </section>

          <section
            className={styles.panel}
            id="console-waterfall"
            data-mobile-linked="evidence"
            aria-label="Evidence analysis"
          >
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Evidence analysis</p>
                <h2>Evidence waterfall</h2>
              </div>
              {view.belief && (
                <span className={styles.count}>
                  {Object.values(view.belief.perHypothesis).reduce(
                    (count, item) => count + item.contributions.length,
                    0,
                  )}{" "}
                  contributions
                </span>
              )}
            </div>
            {view.beliefHidden || !view.belief ? (
              <p className={styles.muted}>
                Evidence analysis is hidden until the reference aid is
                available.
              </p>
            ) : (
              <EvidenceWaterfall
                hypotheses={waterfallHypotheses}
                onOpen={openReport}
                inspectionEnabled={view.phase === "RUNNING"}
              />
            )}
          </section>

          <section
            className={styles.panel}
            id="console-timeline"
            data-mobile-linked="situation"
            aria-label="Session chronology"
          >
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Session chronology</p>
                <h2>Timeline</h2>
              </div>
            </div>
            {recentTimeline.length === 0 ? (
              <p className={styles.muted}>
                Session events will appear here as the exercise advances.
              </p>
            ) : (
              <ol className={styles.sessionTimeline}>
                {recentTimeline.map((entry, index) => (
                  <li key={`${entry.atSec}-${index}`}>
                    <time>{formatClock(entry.atSec)}</time>
                    <span>{entry.label}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          {networkClient?.role === "COMMANDER" &&
            networkView?.advice &&
            networkView.advice.length > 0 && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.kicker}>Analyst relay</p>
                    <h2>Structured advice</h2>
                  </div>
                </div>
                <ul className={styles.sessionTimeline}>
                  {networkView.advice.map((item, index) => (
                    <li key={`${item.atSec}-${index}`}>
                      <time>{formatClock(item.atSec)}</time>
                      <span>
                        Analyst advises {item.actionId}
                        {item.note ? ` · ${item.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
        </div>

        <aside
          className={`${styles.panel} ${styles.decisionPanel}`}
          id="console-decision"
          role="tabpanel"
          aria-labelledby="console-tabs-decision"
          tabIndex={0}
          data-actionable={
            canMakeDecision && dp?.status === "OPEN" && view.phase === "RUNNING"
          }
          data-panel="decision"
          data-mobile-active={mobileSection === "decision"}
        >
          <section>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>When must I decide?</p>
                <h2>Decision window</h2>
              </div>
              {dp && (
                <span className={styles.window} data-status={windowState}>
                  {windowState}
                </span>
              )}
            </div>
            {dp ? (
              <>
                <p className={styles.prompt}>{dp.prompt}</p>
                <div className={styles.deadline}>
                  <Clock3 size={15} aria-hidden="true" />
                  <span>
                    {view.nowSec < dp.openSec ? "Opens" : "Closes"} at{" "}
                    <strong>
                      {formatClock(
                        view.nowSec < dp.openSec ? dp.openSec : dp.closeSec,
                      )}
                    </strong>
                    {view.phase === "PAUSED" && " · clock paused"}
                  </span>
                </div>
                {dp.status === "OPEN" && dp.requiredEstimates.length > 0 && (
                  <div className={styles.estimateBox}>
                    <h3>Record your estimate</h3>
                    <p>Your assessment, separate from the reference model.</p>
                    {dp.requiredEstimates.map((hypothesisId) => {
                      const hypothesis = view.hypotheses.find(
                        (item) => item.id === hypothesisId,
                      );
                      if (!hypothesis) return null;
                      const recorded = view.estimates
                        .filter((item) => item.hypothesisId === hypothesisId)
                        .at(-1);
                      const draft =
                        estimateDrafts[hypothesisId] ??
                        (recorded ? String(Math.round(recorded.p * 100)) : "");
                      const value = draft.trim() === "" ? NaN : Number(draft);
                      return (
                        <div
                          className={styles.estimateInput}
                          key={hypothesisId}
                        >
                          <label htmlFor={`estimate-${hypothesisId}`}>
                            {hypothesis.label}
                          </label>
                          <input
                            id={`estimate-${hypothesisId}`}
                            aria-label={`${hypothesis.label} estimate percentage`}
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={draft}
                            onChange={(event) =>
                              setEstimateDrafts((previous) => ({
                                ...previous,
                                [hypothesisId]: event.target.value,
                              }))
                            }
                          />
                          <span>%</span>
                          <Button
                            size="sm"
                            disabled={
                              !Number.isFinite(value) ||
                              value < 0 ||
                              value > 100
                            }
                            onClick={() =>
                              dispatch({
                                type: "SET_ESTIMATE",
                                hypothesisId,
                                p: value / 100,
                              })
                            }
                          >
                            Record
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {!canMakeDecision ? (
                  <p className={styles.muted}>
                    The Commander owns verification and decision actions.
                  </p>
                ) : (
                  <div className={styles.verifications}>
                    <h3>Verify the information</h3>
                    {dp.assets.map((asset) => (
                      <div className={styles.verify} key={asset.id}>
                        <div>
                          <strong>{asset.label}</strong>
                          <span>
                            {formatClock(asset.delaySec)} delay ·{" "}
                            {asset.costUnits} cost · Grade {asset.gradeLabel}{" "}
                            source · {asset.usesLeft} uses
                          </span>
                          {view.verifications
                            .filter((item) => item.assetId === asset.id)
                            .map((item) => (
                              <span
                                className={styles.verificationStatus}
                                key={item.requestedAtSec}
                              >
                                {item.resultDelivered ? (
                                  <Check size={12} aria-hidden="true" />
                                ) : (
                                  <Clock3 size={12} aria-hidden="true" />
                                )}
                                Requested {formatClock(item.requestedAtSec)} ·{" "}
                                {item.resultDelivered ? "received" : "due"}{" "}
                                {formatClock(item.deliversAtSec)}
                              </span>
                            ))}
                        </div>
                        <Button
                          size="sm"
                          disabled={!asset.feasible || view.phase !== "RUNNING"}
                          title={asset.reasonDisabled}
                          onClick={() =>
                            dispatch({ type: "VERIFY", assetId: asset.id })
                          }
                          data-testid={`verify-${asset.id}`}
                        >
                          Request
                        </Button>
                      </div>
                    ))}
                    {canMakeDecision &&
                      view.phase === "PAUSED" &&
                      windowState === "OPEN" && (
                        <Button
                          variant="primary"
                          fullWidth
                          disabled
                          className={styles.decideButton}
                        >
                          {networkClient
                            ? "Awaiting instructor resume"
                            : "Resume to decide"}
                        </Button>
                      )}
                  </div>
                )}
                {dp.status === "OPEN" &&
                  view.phase === "RUNNING" &&
                  (!canMakeDecision ? null : (
                    <Button
                      variant="primary"
                      className={styles.decideButton}
                      onClick={() => setShowDecision(true)}
                      data-testid="open-decision"
                    >
                      Make decision
                    </Button>
                  ))}
              </>
            ) : (
              <p className={styles.muted}>No active decision window.</p>
            )}
          </section>
        </aside>
      </div>

      {view.pendingConsequence && (
        <section className={styles.pending} role="status">
          <Clock3 size={18} />
          <div>
            <strong>Decision committed. Consequence pending.</strong>
            <span>
              The outcome remains withheld until the authorized reveal at{" "}
              {formatClock(view.pendingConsequence.revealAtSec)}.
            </span>
          </div>
        </section>
      )}
      {view.phase === "COMPLETE" && view.consequence && (
        <section
          className={styles.consequence}
          data-testid="consequence-reveal"
        >
          <p className={styles.kicker}>Outcome revealed</p>
          <h2>{view.consequence.headline}</h2>
          <p>{view.consequence.narrative}</p>
          <Button
            variant="primary"
            onClick={() => navigate(`/aar/${view.scenario.id}`)}
            data-testid="open-aar"
          >
            Review the decision <ArrowRight size={15} />
          </Button>
        </section>
      )}

      {showDecision && dp && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowDecision(false);
          }}
        >
          <section
            ref={decisionDialog}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-title"
          >
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Commit decision</p>
                <h2 id="decision-title">{dp.title}</h2>
              </div>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setShowDecision(false)}
              >
                Close
              </Button>
            </div>
            <p className={styles.prompt}>{dp.prompt}</p>
            <label className={styles.rationale}>
              Decision rationale
              <textarea
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                rows={3}
                placeholder="What information and trade-offs informed your choice?"
              />
            </label>
            <fieldset className={styles.fieldset}>
              <legend>Reports cited</legend>
              {view.reports
                .filter((report) => report.opened)
                .map((report) => (
                  <label key={report.id}>
                    <input
                      type="checkbox"
                      checked={citations.includes(report.id)}
                      onChange={(event) =>
                        setCitations((previous) =>
                          event.target.checked
                            ? [...previous, report.id]
                            : previous.filter((id) => id !== report.id),
                        )
                      }
                    />
                    {report.id} · {report.claim}
                  </label>
                ))}
              {view.reports.every((report) => !report.opened) && (
                <p className={styles.muted}>Open reports first to cite them.</p>
              )}
            </fieldset>
            <fieldset className={styles.fieldset}>
              <legend>Reasoning tags</legend>
              <div className={styles.tagOptions}>
                {tagsAvailable.map((tag) => (
                  <label key={tag}>
                    <input
                      type="checkbox"
                      checked={tags.includes(tag)}
                      onChange={(event) =>
                        setTags((previous) =>
                          event.target.checked
                            ? [...previous, tag]
                            : previous.filter((item) => item !== tag),
                        )
                      }
                    />
                    {tag.replaceAll("_", " ").toLowerCase()}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className={styles.actionChoices}>
              {dp.actions.map((action) => (
                <button
                  className={styles.actionChoice}
                  key={action.id}
                  type="button"
                  data-testid={`decide-${action.id}`}
                  onClick={() => {
                    dispatch({
                      type: "DECIDE",
                      actionId: action.id,
                      rationale: rationale.trim() ? makeRationale() : null,
                    });
                    setShowDecision(false);
                  }}
                >
                  <strong>{action.label}</strong>
                  <span>{action.description}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {showShortcuts && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowShortcuts(false);
          }}
        >
          <section
            ref={shortcutsDialog}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
          >
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Keyboard help</p>
                <h2 id="shortcuts-title">Shortcuts</h2>
              </div>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setShowShortcuts(false)}
              >
                Close
              </Button>
            </div>
            <ul className={styles.shortcuts}>
              <li>J / K — next / previous report</li>
              <li>Enter — open the selected report</li>
              <li>E — focus estimate; L — log estimate</li>
              {canMakeDecision && (
                <li>V — request the first feasible verification</li>
              )}
              {canMakeDecision && <li>D — open decision</li>}
              <li>Space — pause / resume</li>
              <li>R — reset with confirmation; Esc — close dialog</li>
              {controlsAvailable && (
                <>
                  <li>I — open / close instructor drawer</li>
                  <li>1–5 — inject scenario preset by index</li>
                  <li>M — toggle diagnostics; T — toggle truth</li>
                </>
              )}
              <li>? — show / hide this help</li>
            </ul>
          </section>
        </div>
      )}
      <footer className={styles.consoleFooter}>
        <span>
          SYNTHETIC SCENARIO — fictional entities. Reliabilities and payoffs are
          authoring assumptions, not doctrine. Only delivered information is
          available to the trainee.
        </span>
        {(!networkClient || networkInstructor) && (
          <Button size="sm" variant="quiet" onClick={resetExercise}>
            <RotateCcw size={13} /> {demoMode ? "Reset demo" : "Reset exercise"}
          </Button>
        )}
      </footer>
    </div>
  );
}
