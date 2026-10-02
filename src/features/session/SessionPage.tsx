import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  FileText,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Signal,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import type { RationaleTag } from "@/engine";
import type { TraineeView } from "@/engine/view";
import type { SessionClient } from "@/session/SessionClient";
import { useSessionStore } from "@/state/useSessionStore";
import { formatAge, formatClock, formatPercent } from "@/utils/format";
import styles from "./SessionPage.module.css";

const healthLabel: Record<string, string> = {
  HEALTHY: "Healthy",
  DEGRADED: "Degraded",
  DOWN: "Unavailable",
};

function useLiveSession(
  client: SessionClient | null,
  initial: TraineeView | null,
) {
  const [view, setView] = useState(initial);
  useEffect(() => {
    if (!client) {
      setView(null);
      return;
    }
    const update = () => setView(client.getSnapshot());
    update();
    return client.subscribe(update);
  }, [client]);
  return view;
}

export default function SessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useSessionStore((store) => store.client);
  const initial = useSessionStore((store) => store.view);
  const setClientView = useSessionStore((store) => store.setView);
  const view = useLiveSession(client, initial);
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

  useEffect(() => {
    if (view) setClientView(view);
  }, [setClientView, view]);

  if (!client || !view || view.scenario.id !== id) {
    return (
      <section className={styles.unavailable}>
        <CircleHelp size={24} aria-hidden="true" />
        <h1>Local session unavailable</h1>
        <p>
          This browser session is no longer active. Start a new exercise from
          the scenario library.
        </p>
        <Button onClick={() => navigate("/scenarios")}>
          Open scenario library
        </Button>
      </section>
    );
  }

  const dispatch = (command: Parameters<SessionClient["dispatch"]>[0]) => {
    client.dispatch(command);
    setClientView(client.getSnapshot());
  };
  const dp = view.decisionPoint;
  const filteredReports =
    reportChannel === "ALL"
      ? view.reports
      : view.reports.filter((report) => report.channel === reportChannel);
  const recentTimeline = [
    ...view.reports.map((report) => ({
      atSec: report.deliveredAtSec,
      label: `${report.channel} report ${report.id} delivered`,
    })),
    ...view.verifications.map((verification) => ({
      atSec: verification.requestedAtSec,
      label: `Verification requested: ${verification.assetId}`,
    })),
    ...view.estimates.map((estimate) => ({
      atSec: estimate.atSec,
      label: `Estimate recorded: ${view.hypotheses.find((item) => item.id === estimate.hypothesisId)?.label ?? estimate.hypothesisId}`,
    })),
    ...view.decisions.map((decision) => ({
      atSec: decision.atSec,
      label: `Decision committed: ${decision.actionId}`,
    })),
  ]
    .sort((left, right) => left.atSec - right.atSec)
    .slice(-8)
    .reverse();
  const canPause = view.phase === "RUNNING";
  const canResume = view.phase === "PAUSED";
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

  return (
    <div className={styles.console} data-mobile-section={mobileSection}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.kicker}>Live local exercise · synthetic</p>
          <h1>{view.scenario.title}</h1>
        </div>
        <div className={styles.status}>
          <span
            className={`${styles.phase} ${styles[view.phase.toLowerCase()]}`}
          >
            {view.phase}
          </span>
          <span className={styles.clock} data-testid="session-clock">
            <Clock3 size={16} aria-hidden="true" /> {formatClock(view.nowSec)}
          </span>
          {canPause && (
            <Button
              size="sm"
              onClick={() => dispatch({ type: "PAUSE" })}
              icon={<Pause size={14} />}
            >
              Pause
            </Button>
          )}
          {canResume && (
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

      {view.engineError && (
        <div className={styles.error} role="alert">
          <strong>Action not accepted</strong> · {view.engineError.message} (
          {view.engineError.code})
        </div>
      )}

      <section
        className={styles.channelStrip}
        aria-label="Information channels"
      >
        {view.channels
          .filter((channel) => channel.visible)
          .map((channel) => (
            <div className={styles.channel} key={channel.id}>
              <span
                className={`${styles.healthDot} ${styles[channel.health.toLowerCase()]}`}
              />
              <div>
                <strong>{channel.label}</strong>
                <span>{channel.sourceLabel}</span>
              </div>
              <span className={styles.channelHealth}>
                {healthLabel[channel.health]}
              </span>
            </div>
          ))}
      </section>

      {view.phase === "IDLE" && (
        <section className={styles.startPanel}>
          <Activity size={22} aria-hidden="true" />
          <div>
            <h2>Exercise ready</h2>
            <p>
              Start the deterministic scenario clock to begin receiving reports.
            </p>
          </div>
          <Button variant="primary" onClick={() => dispatch({ type: "START" })}>
            Start clock
          </Button>
        </section>
      )}
      {view.phase === "PAUSED" && (
        <div className={styles.paused} role="status">
          Clock paused · simulation time and event delivery are held.
        </div>
      )}

      <div
        className={styles.mobileTabs}
        role="tablist"
        aria-label="Exercise console panels"
      >
        {(
          [
            ["evidence", "Evidence"],
            ["situation", "Situation"],
            ["decision", "Decision"],
          ] as const
        ).map(([section, label]) => (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={mobileSection === section}
            onClick={() => setMobileSection(section)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.mainGrid}>
        <section
          className={styles.panel}
          data-panel="evidence"
          data-mobile-active={mobileSection === "evidence"}
        >
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.kicker}>Intelligence</p>
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
                <article
                  className={`${styles.report} ${report.opened ? styles.opened : ""}`}
                  key={report.id}
                >
                  <div className={styles.reportMeta}>
                    <span>{report.channel}</span>
                    <span>{formatAge(report.ageSec)}</span>
                    <span className={styles.grade}>
                      Grade {report.gradeLabel}
                    </span>
                    {report.badges.map((badge) => (
                      <span className={styles.badge} key={badge}>
                        {badge}
                      </span>
                    ))}
                  </div>
                  <p className={styles.claim}>{report.claim}</p>
                  {report.detail && (
                    <p className={styles.detail}>{report.detail}</p>
                  )}
                  {report.opened && report.effectiveAccuracy !== null && (
                    <div className={styles.reportMath}>
                      Reliability now {formatPercent(report.effectiveAccuracy)}{" "}
                      · evidence contribution{" "}
                      {report.contributionNats?.toFixed(2) ?? "—"} nats
                      {report.contradicts.length > 0 && (
                        <span>
                          {" "}
                          · conflicts with {report.contradicts.join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                  {!report.opened && view.phase === "RUNNING" && (
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() =>
                        dispatch({ type: "OPEN_REPORT", reportId: report.id })
                      }
                      data-testid={`open-report-${report.id}`}
                    >
                      <FileText size={14} /> Open report
                    </Button>
                  )}
                  {report.opened && (
                    <span className={styles.openLabel}>
                      <Check size={13} /> Opened
                    </span>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <div className={styles.centerColumn}>
          <section
            className={styles.panel}
            data-panel="situation"
            data-mobile-active={mobileSection === "situation"}
          >
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Current belief</p>
                <h2>Assessment</h2>
              </div>
              {view.belief && (
                <span className={styles.fog}>
                  Fog {view.belief.fogIndex.toFixed(2)}
                </span>
              )}
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
                    <div className={styles.hypothesis} key={hypothesis.id}>
                      <div className={styles.hypothesisHeading}>
                        <strong>{hypothesis.label}</strong>
                        <span>{formatPercent(assessment.p, 1)}</span>
                      </div>
                      <div
                        className={styles.track}
                        aria-label={`${hypothesis.label} belief`}
                      >
                        <span style={{ width: `${assessment.p * 100}%` }} />
                      </div>
                      <div className={styles.beliefFoot}>
                        <span>
                          Entropy {assessment.entropyBits.toFixed(2)} bits
                        </span>
                        <span>
                          {assessment.contradicted
                            ? "Contradiction"
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
            {dp?.status === "OPEN" && dp.requiredEstimates.length > 0 && (
              <div className={styles.estimateBox}>
                <h3>Record your estimate</h3>
                <p>
                  This is your own probability assessment, recorded separately
                  from the reference model.
                </p>
                {dp.requiredEstimates.map((hypothesisId) => {
                  const hypothesis = view.hypotheses.find(
                    (item) => item.id === hypothesisId,
                  );
                  if (!hypothesis) return null;
                  const recorded = view.estimates
                    .filter((item) => item.hypothesisId === hypothesisId)
                    .at(-1);
                  return (
                    <label className={styles.estimateInput} key={hypothesisId}>
                      <span>{hypothesis.label}</span>
                      <input
                        aria-label={`${hypothesis.label} estimate percentage`}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={
                          estimateDrafts[hypothesisId] ??
                          (recorded ? String(Math.round(recorded.p * 100)) : "")
                        }
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
                        disabled={!estimateDrafts[hypothesisId] && !recorded}
                        onClick={() => {
                          const value = Number(
                            estimateDrafts[hypothesisId] ??
                              (recorded ? recorded.p * 100 : NaN),
                          );
                          if (
                            !Number.isFinite(value) ||
                            value < 0 ||
                            value > 100
                          )
                            return;
                          dispatch({
                            type: "SET_ESTIMATE",
                            hypothesisId,
                            p: value / 100,
                          });
                        }}
                      >
                        Record
                      </Button>
                    </label>
                  );
                })}
              </div>
            )}
            <details className={styles.method}>
              <summary>Reference model and limitations</summary>
              <p>
                Evidence ages by its authored channel decay rate; independent
                evidence groups are combined deterministically.
              </p>
              <ul>
                {view.referenceModel.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </details>
          </section>

          <section className={styles.panel} data-mobile-linked="evidence">
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
              <div className={styles.waterfall}>
                {view.hypotheses.map((hypothesis) => {
                  const item = view.belief?.perHypothesis[hypothesis.id];
                  if (!item) return null;
                  return (
                    <div
                      className={styles.waterfallHypothesis}
                      key={hypothesis.id}
                    >
                      <strong>{hypothesis.label}</strong>
                      {item.contributions.map((contribution) => (
                        <div
                          className={styles.contribution}
                          key={contribution.reportId}
                        >
                          <span>
                            {contribution.channel} · {contribution.reportId}
                          </span>
                          <span className={styles.contributionTrack}>
                            <span
                              className={
                                contribution.llr !== null &&
                                contribution.llr < 0
                                  ? styles.negative
                                  : ""
                              }
                              style={{
                                width: `${Math.min(100, Math.abs(contribution.llr ?? 0) * 24)}%`,
                              }}
                            />
                          </span>
                          <span>
                            {contribution.llr === null
                              ? "Aid hidden"
                              : `${contribution.llr >= 0 ? "+" : ""}${contribution.llr.toFixed(2)} nats`}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className={styles.panel} data-mobile-linked="situation">
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
        </div>

        <aside
          className={`${styles.panel} ${styles.decisionPanel}`}
          data-panel="decision"
          data-mobile-active={mobileSection === "decision"}
        >
          <section>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Change</p>
                <h2>Decision window</h2>
              </div>
              {dp && <span className={styles.window}>{dp.status}</span>}
            </div>
            {dp ? (
              <>
                <p className={styles.prompt}>{dp.prompt}</p>
                <div className={styles.deadline}>
                  <Clock3 size={15} /> Closes at {formatClock(dp.closeSec)}
                </div>
                <div className={styles.verifications}>
                  <h3>Verification options</h3>
                  {dp.assets.map((asset) => (
                    <div className={styles.verify} key={asset.id}>
                      <div>
                        <strong>{asset.label}</strong>
                        <span>
                          {formatClock(asset.delaySec)} delay ·{" "}
                          {asset.costUnits} cost · {asset.usesLeft} uses
                        </span>
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
                </div>
                {dp.status === "OPEN" && view.phase === "RUNNING" && (
                  <Button
                    variant="primary"
                    className={styles.decideButton}
                    onClick={() => setShowDecision(true)}
                    data-testid="open-decision"
                  >
                    Make decision
                  </Button>
                )}
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
      <footer className={styles.consoleFooter}>
        <span>
          Only information delivered by the decision timestamp is available to
          the trainee.
        </span>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => {
            if (
              window.confirm(
                "Reset this exercise and clear the accepted-intent log?",
              )
            ) {
              dispatch({ type: "RESET" });
              setShowDecision(false);
              setEstimateDrafts({});
              setRationale("");
              setCitations([]);
              setTags([]);
            }
          }}
        >
          <RotateCcw size={13} /> Reset exercise
        </Button>
      </footer>
    </div>
  );
}
