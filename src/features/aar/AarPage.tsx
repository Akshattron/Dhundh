import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  Clock3,
  FileText,
  Info,
  Printer,
  RotateCcw,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import type { Aar } from "@/engine/aar";
import { COUNTERFACTUAL_LABEL } from "@/engine/counterfactual";
import { nextDifficulty } from "@/engine/difficulty";
import {
  exportAarDecisionsCsv,
  exportAarJson,
  exportAarTimelineCsv,
} from "@/engine/export";
import { EvidenceWaterfall } from "@/features/trainee/EvidenceWaterfall";
import {
  DemoController,
  DEMO_SCENARIO_ID,
} from "@/features/demo/DemoController";
import { ScenarioBadge } from "@/components/ui/ScenarioBadge";
import type { SessionClient } from "@/session/SessionClient";
import { RemoteSessionClient } from "@/session/RemoteSessionClient";
import { useSessionView } from "@/session/useSessionView";
import { useCompletedAar } from "@/session/useCompletedAar";
import { ReplayScrubber } from "./ReplayScrubber";
import { TeamMetricsPanel } from "./TeamMetricsPanel";
import { downloadFile } from "@/utils/download";
import { PresentationEntry } from "@/features/presentation/PresentationEntry";
import {
  createHistoryEntry,
  fingerprintSessionLog,
  recordSessionHistory,
} from "@/session/history";
import { scenarios } from "@/scenarios";
import { useSessionStore } from "@/state/useSessionStore";
import { formatClock, formatPercent } from "@/utils/format";
import styles from "./AarPage.module.css";

const scoreLabels: Array<[keyof Aar["scores"], string]> = [
  ["trainingScore", "Training score"],
  ["dq", "Decision quality"],
  ["outcome", "Outcome"],
  ["infoUtil", "Information use"],
  ["timeliness", "Timeliness"],
  ["verifyEff", "Verification efficiency"],
  ["calibration", "Calibration"],
];

const scoreTooltips: Partial<Record<keyof Aar["scores"], string>> = {
  dq: "How good the decision was given what had arrived by the time you made it. 100% means no other action had a higher expected value.",
  outcome:
    "What actually happened under the hidden truth. Luck affects this score.",
  infoUtil:
    "Share of the evidence weight (after removing duplicates) that you opened before deciding.",
  timeliness:
    "Penalty for time spent deciding. Waiting for a verification worth its cost is not penalized.",
  verifyEff:
    "Whether you used verification when it was worth its time and cost, and skipped it when it was not.",
  calibration:
    "How close your stated probability was to the reference model's probability. Noisy for a single decision.",
};

export default function AarPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useSessionStore((store) => store.client);
  const experience = useSessionStore((store) => store.experience);
  const setClient = useSessionStore((store) => store.setClient);
  const view = useSessionView(client);
  const {
    aar,
    error: aarError,
    retry,
    loading,
  } = useCompletedAar(client, view);
  const networkClient = client instanceof RemoteSessionClient ? client : null;
  const [historyError, setHistoryError] = useState<string | null>(null);
  const historyAttempts = useRef(new Set<string>());
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const page = useRef<HTMLElement>(null);
  useEffect(() => {
    let collapsed: HTMLDetailsElement[] = [];
    const expandForPrint = () => {
      if (collapsed.length > 0) return;
      collapsed = [
        ...(page.current?.querySelectorAll<HTMLDetailsElement>(
          "details:not([open])",
        ) ?? []),
      ];
      collapsed.forEach((detail) => {
        detail.open = true;
      });
    };
    const restoreAfterPrint = () => {
      collapsed.forEach((detail) => {
        detail.open = false;
      });
      collapsed = [];
    };
    window.addEventListener("beforeprint", expandForPrint);
    window.addEventListener("afterprint", restoreAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", expandForPrint);
      window.removeEventListener("afterprint", restoreAfterPrint);
      restoreAfterPrint();
    };
  }, []);
  const historyId = useMemo(
    () =>
      !aar
        ? null
        : networkClient && view
          ? `network:${networkClient.code}:${networkClient.getSnapshot().seq}`
          : client && !(client instanceof RemoteSessionClient)
            ? `local:${fingerprintSessionLog(client.getLog())}`
            : null,
    [aar, client, networkClient],
  );
  useEffect(() => {
    if (!aar || !historyId || historyAttempts.current.has(historyId)) return;
    historyAttempts.current.add(historyId);
    try {
      recordSessionHistory(
        createHistoryEntry(
          aar,
          historyId,
          networkClient ? "NETWORKED" : "LOCAL",
        ),
      );
      setHistoryError(null);
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "This completed session could not be saved to local history.",
      );
    }
  }, [aar, historyId, networkClient]);
  const resetDemo = () => {
    const scenario = scenarios.find(
      (candidate) => candidate.meta.id === DEMO_SCENARIO_ID,
    );
    if (!scenario) {
      setRecoveryError("The validated flagship scenario is unavailable.");
      return;
    }
    try {
      const nextClient = new DemoController(scenario).createSession();
      setClient(nextClient, nextClient.getSnapshot(), "DEMO");
      navigate("/demo");
    } catch (error) {
      setRecoveryError(
        error instanceof Error
          ? error.message
          : "The deterministic flagship demo could not be restarted.",
      );
    }
  };

  if (!client || !view || view.scenario.id !== id || !aar) {
    return (
      <section className={styles.unavailable}>
        <Info size={22} aria-hidden="true" />
        <h1>After-action review is not ready</h1>
        <p>
          The review unlocks after the simulated consequence is revealed. Active
          sessions are held in this browser tab.
        </p>
        {loading && <p role="status">Preparing the authorized team AAR…</p>}
        {aarError && (
          <p className={styles.recoveryError} role="alert">
            {aarError}
          </p>
        )}
        {aarError && <Button onClick={retry}>Retry AAR</Button>}
        {client && view?.scenario.id === id && (
          <Button
            onClick={() =>
              navigate(
                networkClient
                  ? networkClient.role === "INSTRUCTOR"
                    ? `/instructor/${networkClient.code}`
                    : `/session/network/${id}`
                  : experience === "DEMO"
                    ? "/demo"
                    : `/session/local/${id}`,
              )
            }
          >
            Return to exercise
          </Button>
        )}
        <Button onClick={() => navigate("/scenarios")}>
          Start an exercise
        </Button>
      </section>
    );
  }

  const progression = nextDifficulty(aar.scenario.difficultyLevel, {
    dq: aar.scores.dq,
    infoUtil: aar.scores.infoUtil,
    quadrant: aar.scores.quadrant,
  });
  const decisionFrameIndex = aar.frames.findIndex(
    (candidate) =>
      candidate.atSec === aar.decision.atSec && candidate.cut === "DECISION",
  );
  const decisionFrame = aar.frames[decisionFrameIndex];
  const selectedAction = aar.decision.actionLabel;
  const scoreCells = scoreLabels.map(([key, label]) => (
    <div
      className={key === "trainingScore" ? styles.scoreLead : styles.score}
      key={key}
    >
      <span>{label}</span>
      <strong title={scoreTooltips[key]}>
        {key === "trainingScore"
          ? Number(aar.scores[key]).toFixed(1)
          : formatPercent(Number(aar.scores[key]), 1)}
      </strong>
      {key === "trainingScore" && <small>/ 100</small>}
      {key === "dq" && <small>Given the information</small>}
      {key === "outcome" && <small>Revealed after completion</small>}
    </div>
  ));
  const deliveredAtByReport = new Map(
    aar.information.delivered.map((report) => [
      report.id,
      report.deliveredAtSec,
    ]),
  );
  const waterfallAtCommitment = aar.information.waterfall.map((hypothesis) => ({
    ...hypothesis,
    contributions: hypothesis.contributions.map((contribution) => ({
      ...contribution,
      deliveredAtSec: deliveredAtByReport.get(contribution.reportId),
    })),
  }));

  return (
    <article className={styles.page} ref={page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>
            After-action review · synthetic scenario
          </p>
          <h1>{aar.scenario.title}</h1>
          <ScenarioBadge />
        </div>
        <div className={styles.headerActions}>
          {client && view && (
            <PresentationEntry
              client={client}
              view={view}
              demo={experience === "DEMO"}
            />
          )}
          {experience === "DEMO" && (
            <Button variant="quiet" onClick={resetDemo}>
              <RotateCcw size={14} /> Reset demo
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              navigate(
                networkClient
                  ? networkClient.role === "INSTRUCTOR"
                    ? `/instructor/${networkClient.code}`
                    : `/session/network/${id}`
                  : experience === "DEMO"
                    ? "/demo"
                    : `/session/local/${id}`,
              )
            }
          >
            <ArrowLeft size={15} /> Return to exercise
          </Button>
        </div>
      </header>
      {recoveryError && (
        <p className={styles.recoveryError} role="alert">
          {recoveryError}
        </p>
      )}
      {historyError && (
        <p className={styles.recoveryError} role="status">
          {historyError}
        </p>
      )}

      <section className={styles.result}>
        <div className={styles.resultHeadline}>
          <div>
            <p className={styles.kicker}>
              Was the decision good given the information available?
            </p>
            <h2>
              {aar.scores.dq >= 0.8
                ? "Sound decision under the reference model"
                : "Decision quality needs review"}
            </h2>
            <p>
              At {formatClock(aar.decision.atSec)}, you chose {selectedAction};
              regret under the decision-time belief was{" "}
              {aar.decision.regret.toFixed(2)}.
            </p>
            <p className={styles.outcomeHeadline}>
              Outcome revealed: {aar.consequence.headline}
            </p>
          </div>
        </div>
        <p className={styles.narrative}>{aar.consequence.narrative}</p>
        <div className={styles.commitMeta}>
          <span className={styles.quadrant}>
            {aar.scores.quadrant.replaceAll("_", " ")}
          </span>
          <span>
            <Clock3 size={14} /> Committed at {formatClock(aar.decision.atSec)}
          </span>
          <span>
            <Check size={14} />{" "}
            {aar.header.timedOut ? "Timed out" : "Decision recorded"}
          </span>
          {aar.header.completedAtIso && (
            <span>
              <Clock3 size={14} /> Completed{" "}
              <time dateTime={aar.header.completedAtIso}>
                {new Date(aar.header.completedAtIso).toLocaleString()}
              </time>
            </span>
          )}
          <span>
            <FileText size={14} /> {aar.information.opened.length} reports
            opened
          </span>
        </div>
      </section>

      <section className={styles.scoreSection}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Decision-quality profile</p>
            <h2>Scoring</h2>
          </div>
          <span>Reference score · deterministic</span>
        </div>
        <div className={styles.scoreOverview}>
          <div>
            <div className={styles.scoreGrid}>{scoreCells.slice(0, 3)}</div>
            <p className={styles.scoreNote}>
              A good process can have an unlucky outcome; realized outcome does
              not replace decision quality.
            </p>
            <details className={styles.scoreBreakdown}>
              <summary>Complete score profile and calibration</summary>
              <div className={styles.scoreGrid}>{scoreCells.slice(3)}</div>
              <p className={styles.scoreNote}>
                Single-event Brier (noisy; meaningful only across sessions):
                your estimate{" "}
                {aar.scores.brierUser === null
                  ? "not recorded"
                  : aar.scores.brierUser.toFixed(3)}
                {" · "}reference model {aar.scores.brierSystem.toFixed(3)}.
              </p>
            </details>
          </div>
          <div
            className={styles.quadrantPlot}
            role="img"
            aria-label={`Decision quality ${formatPercent(aar.scores.dq)}; outcome ${formatPercent(aar.scores.outcome)}; ${aar.scores.quadrant.replaceAll("_", " ")}`}
          >
            <span className={styles.yAxis}>Outcome · higher ↑</span>
            <div className={styles.plot}>
              <span className={styles.topLeft}>LUCKY</span>
              <span className={styles.topRight}>SOUND SUCCESS</span>
              <span className={styles.bottomLeft}>POOR</span>
              <span className={styles.bottomRight}>SOUND UNLUCKY</span>
              <span
                className={styles.plotMarker}
                style={{
                  left: `${aar.scores.dq * 100}%`,
                  bottom: `${aar.scores.outcome * 100}%`,
                }}
              />
            </div>
            <span className={styles.xAxis}>Decision quality · higher →</span>
            <span className={styles.plotThresholds}>
              Sound ≥80% DQ · good outcome ≥60%
            </span>
          </div>
        </div>
      </section>

      <details className={styles.disclosure} id="aar-decision-details">
        <summary>
          <h2>Decision summary</h2>
          <span>
            {selectedAction} · {formatClock(aar.decision.atSec)}
          </span>
        </summary>
        {aar.decisions.length > 1 && (
          <div
            className={styles.teamTable}
            role="region"
            tabIndex={0}
            aria-label="Recorded decisions"
          >
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Decision</th>
                  <th>Decision quality</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {aar.decisions.map((item) => (
                  <tr key={item.decision.decisionPointId}>
                    <td>{formatClock(item.decision.atSec)}</td>
                    <td>{item.decision.actionLabel}</td>
                    <td>{formatPercent(item.scores.dq, 1)}</td>
                    <td>{formatPercent(item.scores.outcome, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={styles.columns}>
          <section className={styles.panel}>
            <p className={styles.kicker}>Decision-time cut</p>
            <h2>Belief and alternatives</h2>
            <p className={styles.panelIntro}>
              Only the information available at{" "}
              {formatClock(aar.decision.atSec)} is used for the decision-quality
              calculation.
            </p>
            <div className={styles.facts}>
              <div>
                <span>Reference best action</span>
                <strong>{aar.decision.bestActionId}</strong>
              </div>
              <div>
                <span>Chosen action</span>
                <strong>{aar.decision.actionId}</strong>
              </div>
              <div>
                <span>Decision regret</span>
                <strong>{aar.decision.regret.toFixed(2)}</strong>
              </div>
              <div>
                <span>Maximum regret range</span>
                <strong>{aar.decision.maxRegret.toFixed(2)}</strong>
              </div>
              <div>
                <span>Reference posture</span>
                <strong>{aar.decision.posture.replaceAll("_", " ")}</strong>
              </div>
              <div>
                <span>Leading-action tie</span>
                <strong>
                  {aar.decision.isTie ? "Within tie threshold" : "No tie"}
                </strong>
              </div>
              <div>
                <span title="The most that perfect information would have been worth at that moment.">
                  EVPI ceiling
                </span>
                <strong title="The most that perfect information would have been worth at that moment.">
                  {aar.decision.evpi.toFixed(2)}
                </strong>
              </div>
              {decisionFrame?.belief && (
                <div>
                  <span title="Average uncertainty across hypotheses. 0% = certain, 100% = coin flip.">
                    Fog index
                  </span>
                  <strong title="Average uncertainty across hypotheses. 0% = certain, 100% = coin flip.">
                    {formatPercent(decisionFrame.belief.fogIndex, 1)}
                  </strong>
                </div>
              )}
              {Object.entries(aar.decision.belief).map(([name, p]) => (
                <div key={name}>
                  <span>Belief · {name.replaceAll("_", " ")}</span>
                  <strong>{formatPercent(p, 1)}</strong>
                </div>
              ))}
              {Object.entries(aar.decision.expectedUtilities).map(
                ([name, value]) => (
                  <div key={name}>
                    <span>Expected utility · {name}</span>
                    <strong>{value.toFixed(2)}</strong>
                  </div>
                ),
              )}
            </div>
            <div className={styles.truth}>
              <h3>Truth at decision · revealed after completion</h3>
              {Object.entries(aar.decision.truthAtDecision).map(
                ([hypothesisId, truth]) => (
                  <div key={hypothesisId}>
                    <span>{hypothesisId.replaceAll("_", " ")}</span>
                    <strong>{truth ? "True" : "False"}</strong>
                  </div>
                ),
              )}
            </div>
            <div className={styles.estimates}>
              <h3>Your estimates</h3>
              <p>
                {aar.decision.estimates.first === null
                  ? "No initial estimate"
                  : formatPercent(aar.decision.estimates.first, 1)}
                {" → "}
                {aar.decision.estimates.final === null
                  ? "no final estimate"
                  : formatPercent(aar.decision.estimates.final, 1)}
                {" · "}Reference aid{" "}
                {aar.decision.estimates.consultedAid
                  ? "available"
                  : "not consulted"}
              </p>
            </div>
            <div className={styles.rationale}>
              <h3>Your rationale</h3>
              {aar.decision.rationale ? (
                <>
                  <p>{aar.decision.rationale.text}</p>
                  <div className={styles.tags}>
                    {aar.decision.rationale.tags.map((tag) => (
                      <span key={tag}>{tag.replaceAll("_", " ")}</span>
                    ))}
                  </div>
                  {aar.decision.rationale.citedReportIds.length > 0 && (
                    <small>
                      Cited: {aar.decision.rationale.citedReportIds.join(", ")}
                    </small>
                  )}
                </>
              ) : (
                <p>No written rationale was recorded.</p>
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <p className={styles.kicker}>Information inventory</p>
            <h2>Seen, unseen, and late</h2>
            <div className={styles.inventory}>
              <div>
                <strong>{aar.information.opened.length}</strong>
                <span>Opened by trainee</span>
              </div>
              <div>
                <strong>{aar.information.notOpened.length}</strong>
                <span>Delivered, not opened</span>
              </div>
              <div>
                <strong>{aar.information.dropped.length}</strong>
                <span>Dropped</span>
              </div>
              <div>
                <strong>{aar.information.lateOrAfterDecision.length}</strong>
                <span>Late or after decision</span>
              </div>
            </div>
            <div className={styles.reportGroups}>
              <h3>Not opened before decision</h3>
              {aar.information.notOpened.length === 0 ? (
                <p className={styles.muted}>None.</p>
              ) : (
                aar.information.notOpened.map((report) => (
                  <div key={report.reportId}>
                    <strong>{report.reportId}</strong>
                    <span>Evidence weight {report.llr.toFixed(2)} nats</span>
                  </div>
                ))
              )}
              <h3>Late or after decision</h3>
              {aar.information.lateOrAfterDecision.length === 0 ? (
                <p className={styles.muted}>None.</p>
              ) : (
                aar.information.lateOrAfterDecision.map((report) => (
                  <div key={report.reportId}>
                    <strong>{report.reportId}</strong>
                    <span>
                      {report.claim} ·{" "}
                      {report.deliveredAtSec === null
                        ? "not delivered during this run"
                        : `delivered ${formatClock(report.deliveredAtSec)}`}
                    </span>
                  </div>
                ))
              )}
              <h3>Dropped</h3>
              {aar.information.dropped.length === 0 ? (
                <p className={styles.muted}>None.</p>
              ) : (
                aar.information.dropped.map((report) => (
                  <div key={report.reportId}>
                    <strong>{report.reportId}</strong>
                    <span>{report.claim}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </details>

      <section className={`${styles.panel} ${styles.timelineSection}`}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Actual recorded history</p>
            <h2>Reconstruct the information</h2>
          </div>
          <span>{aar.frames.length} recorded frames</span>
        </div>
        <ReplayScrubber
          aar={aar}
          initialFrameIndex={Math.max(0, decisionFrameIndex)}
        />
        <details className={styles.fullTimeline}>
          <summary>Full event timeline ({aar.timeline.length})</summary>
          <ol className={styles.timeline}>
            {aar.timeline.map((event, index) => (
              <li key={`${event.atSec}-${event.kind}-${index}`}>
                <time>{formatClock(event.atSec)}</time>
                <span className={styles.timelineDot} />
                <div>
                  <strong>{event.kind.replaceAll("_", " ")}</strong>
                  <p>{event.summary}</p>
                </div>
                {!event.revealedToTrainee && (
                  <span className={styles.postmortem}>Post-mortem</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      </section>

      <details className={styles.disclosure} id="aar-verification">
        <summary>
          <h2>Verification</h2>
          <span>Tasking, value, and arrival time</span>
        </summary>
        <h3>Was additional information worth its cost?</h3>
        {aar.verification?.used && (
          <p className={styles.temporalNote}>
            A tasking request was recorded.{" "}
            {aar.verification.deliveredAtSec === undefined
              ? "Its result was not received before completion."
              : aar.verification.deliveredAtSec > aar.decision.atSec
                ? `The result arrived at ${formatClock(aar.verification.deliveredAtSec)}, after commitment at ${formatClock(aar.decision.atSec)}. It was not available for that decision.`
                : aar.verification.deliveredAtSec === aar.decision.atSec
                  ? "Arrival and commitment share a timestamp. The retained replay cut preserves their causal order."
                  : `The result arrived at ${formatClock(aar.verification.deliveredAtSec)}, before commitment. Receipt is separate from inspection.`}{" "}
            The scoring verdict below is unchanged; “used” means tasking
            requested, not necessarily received or inspected before commitment.
          </p>
        )}
        {aar.verification ? (
          <div className={styles.verificationFacts}>
            <div>
              <span>Assessment</span>
              <strong>{aar.verification.verdict.replaceAll("_", " ")}</strong>
            </div>
            <div>
              <span>Asset</span>
              <strong>{aar.verification.assetId ?? "No feasible asset"}</strong>
            </div>
            <div>
              <span>Evaluated</span>
              <strong>{formatClock(aar.verification.evalAtSec)}</strong>
            </div>
            <div>
              <span>EVSI</span>
              <strong>{aar.verification.evsiAtEval.toFixed(2)}</strong>
            </div>
            <div>
              <span>Net VOI</span>
              <strong>{aar.verification.netVoiAtEval.toFixed(2)}</strong>
            </div>
            <div>
              <span>EVPI</span>
              <strong>{aar.verification.evpiAtEval.toFixed(2)}</strong>
            </div>
            {aar.verification.used &&
              aar.verification.requestedAtSec !== undefined && (
                <div>
                  <span>Requested</span>
                  <strong>
                    {formatClock(aar.verification.requestedAtSec)}
                  </strong>
                </div>
              )}
            {aar.verification.used &&
              aar.verification.deliveredAtSec !== undefined && (
                <div>
                  <span>Result arrived</span>
                  <strong>
                    {formatClock(aar.verification.deliveredAtSec)}
                  </strong>
                </div>
              )}
            {aar.verification.beliefAtEval && (
              <div className={styles.verificationBelief}>
                <h3>Belief at evaluation</h3>
                {Object.entries(aar.verification.beliefAtEval).map(
                  ([hypothesisId, probability]) => (
                    <div key={hypothesisId}>
                      <span>{hypothesisId.replaceAll("_", " ")}</span>
                      <strong>{formatPercent(probability, 1)}</strong>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        ) : (
          <p className={styles.muted}>
            No verification assets were available for this decision point.
          </p>
        )}
      </details>

      <details className={styles.disclosure} id="aar-evidence">
        <summary>
          <h2>Evidence waterfall at commitment</h2>
          <span>Groups, contributions, and omissions</span>
        </summary>
        <p className={styles.muted}>
          Contributions below use only reports delivered by the decision cut.
        </p>
        <EvidenceWaterfall hypotheses={waterfallAtCommitment} />
        <div className={styles.reportGroups}>
          <p className={styles.counterfactualDisclosure}>
            {COUNTERFACTUAL_LABEL}
          </p>
          <h3>Dropped report what-if</h3>
          {aar.information.dropped.length === 0 ? (
            <p className={styles.muted}>No reports were dropped.</p>
          ) : (
            aar.information.dropped.map((report) => (
              <p key={`whatif-${report.reportId}`}>
                <strong>{report.reportId}</strong> · {report.claim} ·{" "}
                {report.whatIfBeliefAtDecision
                  ? `simulated belief at decision: ${Object.entries(
                      report.whatIfBeliefAtDecision,
                    )
                      .map(
                        ([hypothesis, probability]) =>
                          `${hypothesis} ${formatPercent(probability, 1)}`,
                      )
                      .join(", ")}`
                  : "issued after the decision cut"}
              </p>
            ))
          )}
          <h3>Late report what-if</h3>
          {aar.information.lateOrAfterDecision.map((report) => (
            <p key={`late-${report.reportId}`}>
              <strong>{report.reportId}</strong> ·{" "}
              {report.deliveredAtSec === null
                ? "not delivered during this run"
                : `delivered ${formatClock(report.deliveredAtSec)}`}
              ; on-time simulated belief:{" "}
              {report.whatIfBeliefAtDecision
                ? Object.entries(report.whatIfBeliefAtDecision)
                    .map(
                      ([hypothesis, probability]) =>
                        `${hypothesis} ${formatPercent(probability, 1)}`,
                    )
                    .join(", ")
                : "not available at the decision cut"}
            </p>
          ))}
          <p className={styles.muted}>
            What-if beliefs are independent simulations using reports at their
            issue time; they do not alter the recorded session or establish what
            would certainly have happened.
          </p>
        </div>
        <div className={styles.reportGroups}>
          <h3>Contradictions at commitment</h3>
          {aar.information.contradictions.length === 0 ? (
            <p className={styles.muted}>
              No hypothesis met the contradiction threshold.
            </p>
          ) : (
            aar.information.contradictions.map((item) => (
              <p key={`${item.hypothesisId}-${item.atSec}`}>
                <strong>{item.hypothesisId.replaceAll("_", " ")}</strong> ·
                index {item.index.toFixed(2)} · supports true{" "}
                {item.positiveReportIds.join(", ") || "none"} · supports false{" "}
                {item.negativeReportIds.join(", ") || "none"}
              </p>
            ))
          )}
        </div>
      </details>

      <details
        className={`${styles.disclosure} ${styles.counterfactualSection}`}
        id="aar-counterfactuals"
      >
        <summary>
          <h2>Counterfactuals</h2>
          <span>Simulated alternatives, not recorded history</span>
        </summary>
        {aar.counterfactuals.map((counterfactual) => (
          <article className={styles.counterfactual} key={counterfactual.id}>
            <p className={styles.counterfactualDisclosure}>
              {COUNTERFACTUAL_LABEL}
            </p>
            <h3>
              {counterfactual.id === "CF_ACTIONS"
                ? "If you had chosen differently"
                : counterfactual.id === "CF_VERIFY_EARLIER"
                  ? "If you had verified earlier"
                  : counterfactual.id === "CF_DECIDE_EARLIER"
                    ? "If you had decided earlier"
                    : "If nothing had been lost"}
            </h3>
            {counterfactual.id === "CF_ACTIONS" &&
              counterfactual.alternatives.map((alternative) => (
                <div
                  className={styles.counterfactualRow}
                  key={alternative.actionId}
                >
                  <strong>{alternative.actionId}</strong>
                  <span>
                    Expected utility {alternative.expectedUtility.toFixed(2)}
                  </span>
                  <span>
                    Realized utility {alternative.realizedUtility.toFixed(2)}
                  </span>
                  <p>{alternative.consequenceHeadline}</p>
                </div>
              ))}
            {counterfactual.id === "CF_VERIFY_EARLIER" && (
              <>
                <p>
                  {counterfactual.assetId} requested{" "}
                  {formatClock(counterfactual.requestedAtSec)}; result available{" "}
                  {formatClock(counterfactual.resultAtSec)}. The simulated
                  branch chose {counterfactual.result.decision.actionLabel} with
                  realized utility{" "}
                  {counterfactual.result.scores.realizedUtility.toFixed(2)} (
                  {counterfactual.result.scores.quadrant.replaceAll("_", " ")}).
                </p>
                <p>
                  This branch inserts a model-estimate policy assumption; it is
                  not presented as a trainee statement.
                </p>
              </>
            )}
            {counterfactual.id === "CF_DECIDE_EARLIER" && (
              <p>
                At {formatClock(counterfactual.atSec)}, the simulated policy
                selected {counterfactual.result.decision.actionLabel}; realized
                utility{" "}
                {counterfactual.result.scores.realizedUtility.toFixed(2)}.
              </p>
            )}
            {counterfactual.id === "CF_NO_LOSS" && (
              <>
                <p>
                  Best action under the combined no-loss belief:{" "}
                  <strong>{counterfactual.bestActionId}</strong>
                  {counterfactual.choiceChanged
                    ? " — differs from the recorded choice."
                    : " — the recorded choice remains best."}{" "}
                  EVPI {counterfactual.evpi.toFixed(2)}.
                </p>
                <div className={styles.facts}>
                  {Object.entries(counterfactual.belief).map(
                    ([hypothesisId, probability]) => (
                      <div key={hypothesisId}>
                        <span>{hypothesisId.replaceAll("_", " ")}</span>
                        <strong>{formatPercent(probability, 1)}</strong>
                      </div>
                    ),
                  )}
                </div>
              </>
            )}
            {counterfactual.policyAssumptions.length > 0 && (
              <p className={styles.muted}>
                {counterfactual.policyAssumptions
                  .map(
                    (assumption) =>
                      `${assumption.label}: ${assumption.hypothesisId} ${formatPercent(assumption.p, 1)}`,
                  )
                  .join("; ")}
              </p>
            )}
          </article>
        ))}
        <p className={styles.muted}>
          Team coordination diagnostics use completed authoritative network
          history when available. No composite team score is calculated.
        </p>
      </details>
      <details
        className={`${styles.disclosure} ${styles.coach}`}
        id="aar-coach"
      >
        <summary>
          <h2>Coach notes</h2>
          <span>{aar.coachNotes.length} evidence-linked observations</span>
        </summary>
        {aar.coachNotes.map((note) => (
          <article
            key={note.id}
            className={styles[note.severity.toLowerCase()]}
          >
            <strong>{note.severity}</strong>
            <p>{note.text}</p>
            <small>Evidence: {note.evidence.join(", ")}</small>
          </article>
        ))}
        <section
          className={styles.practice}
          data-testid="difficulty-recommendation"
        >
          <p className={styles.kicker}>Adaptive practice recommendation</p>
          <h3>Next run: difficulty level {progression.level}</h3>
          <p>{progression.reason}</p>
          <p>
            Profile changes:{" "}
            {progression.changes.length
              ? progression.changes.join(" · ")
              : "No profile change"}
          </p>
          <p className={styles.scoreNote}>
            Deterministic score-based recommendation only; no automatic
            difficulty change is applied.
          </p>
        </section>
      </details>
      {aar.team && (
        <details className={styles.disclosure} id="aar-team">
          <summary>
            <h2>Team coordination</h2>
            <span>Sharing, convergence, and response timing</span>
          </summary>
          <TeamReconstruction team={aar.team} />
        </details>
      )}
      <details className={styles.disclosure} id="aar-limitations">
        <summary>
          <h2>Model and data limitations</h2>
          <span>Synthetic, descriptive, and explicitly bounded</span>
        </summary>
        <p>
          {aar.dataProvenance}. Reliabilities and payoffs are authoring
          assumptions, not doctrine.
        </p>
        <ul>
          {aar.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>
      <section className={styles.exports} aria-label="AAR export controls">
        <strong>Export this completed review</strong>
        <Button
          size="sm"
          onClick={() =>
            downloadFile(
              `${id}-aar.json`,
              exportAarJson(aar),
              "application/json",
            )
          }

          data-testid="export-aar-json"
        >
          <ArrowDownToLine size={14} /> JSON
        </Button>
        <Button
          size="sm"
          onClick={() =>
            downloadFile(
              `${id}-timeline.csv`,
              exportAarTimelineCsv(aar),
              "text/csv;charset=utf-8",
            )
          }
          data-testid="export-aar-timeline"
        >
          <ArrowDownToLine size={14} /> Timeline CSV
        </Button>
        <Button
          size="sm"
          onClick={() =>
            downloadFile(
              `${id}-decisions.csv`,
              exportAarDecisionsCsv(aar),
              "text/csv;charset=utf-8",
            )
          }
          data-testid="export-aar-decisions"
        >
          <ArrowDownToLine size={14} /> Decisions CSV
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => window.print()}
          data-testid="print-aar"
        >
          <Printer size={14} /> Print / PDF
        </Button>
      </section>
    </article>
  );
}

function TeamReconstruction({ team }: { team: NonNullable<Aar["team"]> }) {
  return (
    <>
      <TeamMetricsPanel report={team} />
      <section className={styles.teamReconstruction}>
        <h3>Shared work, separate roles</h3>
        <p className={styles.muted}>
          Private trainee activity is revealed only after completion.
        </p>
        <div className={styles.teamParticipants}>
          {team.participants.map((participant) => (
            <article key={participant.role}>
              <h3>
                {participant.role} · {participant.name}
              </h3>
              <p>
                {participant.openedReportIds.length} reports opened ·{" "}
                {participant.verificationCount} verifications ·{" "}
                {participant.decisions.length} decisions
              </p>
              {participant.estimates.map((estimate, index) => (
                <p
                  className={styles.muted}
                  key={`${estimate.hypothesisId}-${index}`}
                >
                  {formatClock(estimate.atSec)} · {estimate.hypothesisId}:{" "}
                  {formatPercent(estimate.p, 1)}
                </p>
              ))}
            </article>
          ))}
        </div>
        <div className={styles.reportGroups}>
          <h3>Analyst handoffs</h3>
          {team.relays.length === 0 && team.advice.length === 0 ? (
            <p className={styles.muted}>
              No relays or structured advice were recorded.
            </p>
          ) : (
            <>
              {team.relays.map((relay) => (
                <div key={relay.relayReportId}>
                  <strong>
                    {relay.reportId} → {relay.relayReportId}
                  </strong>
                  <span>
                    Relayed {formatClock(relay.atSec)} ·{" "}
                    {relay.deliveredAtSec === null
                      ? "not delivered before completion"
                      : `delivered ${formatClock(relay.deliveredAtSec)}`}
                    {relay.note ? ` · ${relay.note}` : ""}
                  </span>
                </div>
              ))}
              {team.advice.map((item, index) => (
                <div key={`${item.atSec}-${index}`}>
                  <strong>Action advice: {item.actionId}</strong>
                  <span>
                    Sent {formatClock(item.atSec)}
                    {item.note ? ` · ${item.note}` : ""}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </section>
    </>
  );
}
