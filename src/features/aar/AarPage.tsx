import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  Clock3,
  FileText,
  Info,
  Pause,
  Play,
  Printer,
  RotateCcw,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import type { Aar } from "@/engine/aar";
import { COUNTERFACTUAL_LABEL } from "@/engine/counterfactual";
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

function downloadFile(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function AarPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useSessionStore((store) => store.client);
  const storedView = useSessionStore((store) => store.view);
  const experience = useSessionStore((store) => store.experience);
  const setClient = useSessionStore((store) => store.setClient);
  const view = storedView ?? client?.getSnapshot() ?? null;
  const aar = client && view?.aarReady ? client.getAar() : null;
  const [frameIndex, setFrameIndex] = useState(0);
  const [replayTab, setReplayTab] = useState<"KNEW" | "TRUTH" | "NEVER_SAW">(
    "KNEW",
  );
  const [playing, setPlaying] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setFrameIndex((index) => {
        const last = Math.max(0, (aar?.frames.length ?? 1) - 1);
        return Math.min(last, index + 1);
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [aar?.frames.length, playing]);
  useEffect(() => {
    if (aar && playing && frameIndex >= aar.frames.length - 1)
      setPlaying(false);
  }, [aar, frameIndex, playing]);

  if (!client || !view || view.scenario.id !== id || !aar) {
    return (
      <section className={styles.unavailable}>
        <Info size={22} aria-hidden="true" />
        <h1>After-action review is not ready</h1>
        <p>
          The review unlocks after the simulated consequence is revealed. Active
          sessions are held in this browser tab.
        </p>
        <Button onClick={() => navigate("/scenarios")}>
          Start an exercise
        </Button>
      </section>
    );
  }

  const frame = aar.frames[Math.min(frameIndex, aar.frames.length - 1)];
  if (!frame) throw new Error("Completed AAR has no replay frames");
  const decisionFrame = aar.frames.find(
    (candidate) =>
      candidate.atSec === aar.decision.atSec && candidate.cut === "DECISION",
  );
  const selectedAction = aar.decision.actionLabel;
  const allKnownReports = new Map<
    string,
    {
      id: string;
      claim: string;
      issuedAtSec: number;
      deliveredAtSec: number | null;
    }
  >();
  for (const report of aar.information.delivered) {
    allKnownReports.set(report.id, {
      id: report.id,
      claim: report.claim,
      issuedAtSec: report.issuedAtSec,
      deliveredAtSec: report.deliveredAtSec,
    });
  }
  for (const report of aar.information.lateOrAfterDecision) {
    allKnownReports.set(report.reportId, {
      id: report.reportId,
      claim: report.claim,
      issuedAtSec: report.issuedAtSec,
      deliveredAtSec: report.deliveredAtSec,
    });
  }
  for (const report of aar.information.dropped) {
    allKnownReports.set(report.reportId, {
      id: report.reportId,
      claim: report.claim,
      issuedAtSec: report.issuedAtSec,
      deliveredAtSec: null,
    });
  }
  const neverSaw = [
    ...[...allKnownReports.values()].filter(
      (report) => !frame.deliveredIds.includes(report.id),
    ),
    ...aar.information.delivered
      .filter(
        (report) =>
          frame.deliveredIds.includes(report.id) &&
          !frame.openedIds.includes(report.id),
      )
      .map((report) => ({
        id: report.id,
        claim: report.claim,
        issuedAtSec: report.issuedAtSec,
        deliveredAtSec: report.deliveredAtSec,
      })),
  ];

  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>
            After-action review · synthetic scenario
          </p>
          <h1>{aar.scenario.title}</h1>
          <ScenarioBadge />
          <p>
            What was known at commitment, what was decided, and what happened
            afterward.
          </p>
        </div>
        <div className={styles.headerActions}>
          {experience === "DEMO" && (
            <Button variant="quiet" onClick={resetDemo}>
              <RotateCcw size={14} /> Reset demo
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              navigate(experience === "DEMO" ? "/demo" : `/session/local/${id}`)
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

      <section className={styles.result}>
        <div className={styles.resultHeadline}>
          <span className={styles.quadrant}>
            {aar.scores.quadrant.replaceAll("_", " ")}
          </span>
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
        <div className={styles.scoreGrid}>
          {scoreLabels.map(([key, label]) => {
            const score = aar.scores[key];
            return (
              <div
                className={
                  key === "trainingScore" ? styles.scoreLead : styles.score
                }
                key={key}
              >
                <span>{label}</span>
                <strong title={scoreTooltips[key]}>
                  {key === "trainingScore"
                    ? Number(score).toFixed(1)
                    : formatPercent(Number(score), 1)}
                </strong>
                {key === "trainingScore" && <small>/ 100</small>}
              </div>
            );
          })}
        </div>
        <p className={styles.scoreNote}>
          A good process can have an unlucky outcome; realized outcome does not
          replace decision quality.
        </p>
        <p className={styles.scoreNote}>
          Single-event Brier (noisy; meaningful only across sessions): your
          estimate{" "}
          {aar.scores.brierUser === null
            ? "not recorded"
            : aar.scores.brierUser.toFixed(3)}
          {" · "}reference model {aar.scores.brierSystem.toFixed(3)}.
        </p>
        <div
          className={styles.quadrantPlot}
          role="img"
          aria-label={`Decision quality ${formatPercent(aar.scores.dq)}; outcome ${formatPercent(aar.scores.outcome)}; ${aar.scores.quadrant.replaceAll("_", " ")}`}
        >
          <span className={styles.yAxis}>Outcome · good ↑</span>
          <div className={styles.plot}>
            <span className={styles.topLeft}>SOUND SUCCESS</span>
            <span className={styles.topRight}>LUCKY</span>
            <span className={styles.bottomLeft}>SOUND UNLUCKY</span>
            <span className={styles.bottomRight}>POOR</span>
            <span
              className={styles.plotMarker}
              style={{
                left: `${Math.min(97, Math.max(3, (1 - aar.scores.dq) * 100))}%`,
                bottom: `${Math.min(97, Math.max(3, aar.scores.outcome * 100))}%`,
              }}
            />
          </div>
          <span className={styles.xAxis}>Decision quality · sound ←</span>
        </div>
      </section>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <p className={styles.kicker}>Decision-time cut</p>
          <h2>Belief and alternatives</h2>
          <p className={styles.panelIntro}>
            Only the information available at {formatClock(aar.decision.atSec)}{" "}
            is used for the decision-quality calculation.
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

      <section className={`${styles.panel} ${styles.timelineSection}`}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Deterministic reconstruction</p>
            <h2>Replay timeline</h2>
          </div>
          <span>{aar.frames.length} recorded frames</span>
        </div>
        {frame && (
          <>
            <div className={styles.replayControls}>
              <Button
                size="sm"
                variant="quiet"
                aria-label="Previous replay frame"
                onClick={() => {
                  setPlaying(false);
                  setFrameIndex((index) => Math.max(0, index - 1));
                }}
              >
                ←
              </Button>
              <Button
                size="sm"
                variant="quiet"
                aria-label={playing ? "Pause replay" : "Play replay at 4x"}
                onClick={() => {
                  if (frameIndex >= aar.frames.length - 1) setFrameIndex(0);
                  setPlaying((current) => !current);
                }}
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
                {playing ? "Pause" : "Play 4×"}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                aria-label="Next replay frame"
                onClick={() => {
                  setPlaying(false);
                  setFrameIndex((index) =>
                    Math.min(aar.frames.length - 1, index + 1),
                  );
                }}
              >
                →
              </Button>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  setPlaying(false);
                  setFrameIndex(0);
                }}
              >
                Home
              </Button>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  setPlaying(false);
                  setFrameIndex(aar.frames.length - 1);
                }}
              >
                End
              </Button>
            </div>
            <div className={styles.scrubber}>
              <label htmlFor="aar-scrubber">Simulation time</label>
              <input
                id="aar-scrubber"
                type="range"
                min={0}
                max={Math.max(0, aar.frames.length - 1)}
                value={frameIndex}
                onChange={(event) => {
                  setPlaying(false);
                  setFrameIndex(Number(event.target.value));
                }}
                data-testid="aar-scrubber"
              />
              <strong>
                {formatClock(frame.atSec)} ·{" "}
                {frame.cut === "DECISION"
                  ? "At decision, before commitment"
                  : frame.phase}
              </strong>
            </div>
            <div
              className={styles.replayTabs}
              role="tablist"
              aria-label="Replay information view"
            >
              {(
                [
                  ["KNEW", "Knew"],
                  ["TRUTH", "Truth"],
                  ["NEVER_SAW", "Never saw"],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={replayTab === tab}
                  onClick={() => setReplayTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={styles.replayView} role="tabpanel">
              {replayTab === "KNEW" && (
                <>
                  <h3>Available by {formatClock(frame.atSec)}</h3>
                  <p>
                    Knew uses only information delivered by this frame.{" "}
                    {frame.deliveredIds.length} delivered ·{" "}
                    {frame.openedIds.length} opened · {frame.droppedIds.length}{" "}
                    dropped.
                  </p>
                  {frame.belief ? (
                    <div className={styles.facts}>
                      {Object.entries(frame.belief.perHypothesis).map(
                        ([hypothesisId, belief]) => (
                          <div key={hypothesisId}>
                            <span>{hypothesisId.replaceAll("_", " ")}</span>
                            <strong>{formatPercent(belief.p, 1)}</strong>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className={styles.muted}>
                      Reference aid not available at this frame.
                    </p>
                  )}
                  {frame.deliveredIds.length > 0 && (
                    <p>Delivered: {frame.deliveredIds.join(", ")}</p>
                  )}
                </>
              )}
              {replayTab === "TRUTH" && (
                <>
                  <h3>Post-mortem truth at {formatClock(frame.atSec)}</h3>
                  <p>
                    Truth is shown only in this authorized post-completion view.
                  </p>
                  <div className={styles.facts}>
                    {Object.entries(frame.truth).map(
                      ([hypothesisId, truth]) => (
                        <div key={hypothesisId}>
                          <span>{hypothesisId.replaceAll("_", " ")}</span>
                          <strong>{truth ? "True" : "False"}</strong>
                        </div>
                      ),
                    )}
                  </div>
                </>
              )}
              {replayTab === "NEVER_SAW" && (
                <>
                  <h3>
                    Information not available by {formatClock(frame.atSec)}
                  </h3>
                  <p>
                    Dropped, delayed, or delivered-but-unopened information at
                    this frame.
                  </p>
                  {neverSaw.length === 0 ? (
                    <p className={styles.muted}>
                      No unseen information identified at this frame.
                    </p>
                  ) : (
                    <ul>
                      {neverSaw.map((report) => (
                        <li key={report.id}>
                          <strong>{report.id}</strong> · {report.claim} · issued{" "}
                          {formatClock(report.issuedAtSec)}
                          {report.deliveredAtSec === null
                            ? " · not delivered"
                            : ` · arrived ${formatClock(report.deliveredAtSec)}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
            <div className={styles.frameSummary}>
              <span>{frame.deliveredIds.length} delivered reports</span>
              <span>
                {frame.trainee.decided ? "1 decision" : "No decision yet"}
              </span>
              <span>
                {frame.trainee.verifyPending
                  ? "Verification pending"
                  : "No verification pending"}
              </span>
            </div>
          </>
        )}
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
      </section>

      <section className={styles.panel}>
        <p className={styles.kicker}>Verification analysis</p>
        <h2>Was additional information worth its cost?</h2>
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
      </section>

      <section className={styles.panel}>
        <p className={styles.kicker}>Information analysis</p>
        <h2>Evidence waterfall at commitment</h2>
        <p className={styles.muted}>
          Contributions below use only reports delivered by the decision cut.
        </p>
        <EvidenceWaterfall hypotheses={aar.information.waterfall} />
        <div className={styles.reportGroups}>
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
          <p className={styles.muted}>
            What-if beliefs are independent simulations using reports at their
            issue time; they do not alter the recorded session or establish what
            would certainly have happened.
          </p>
        </div>
      </section>

      <section className={`${styles.panel} ${styles.counterfactualSection}`}>
        <p className={styles.kicker}>Simulated alternatives</p>
        <h2>Counterfactuals</h2>
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
          Team analysis remains a later-phase placeholder; no network or team
          scoring is implemented here.
        </p>
      </section>
      <p className={styles.limitations}>
        SYNTHETIC SCENARIO — fictional entities. Reliabilities and payoffs are
        authoring assumptions, not doctrine.
      </p>
      <section className={styles.coach}>
        <p className={styles.kicker}>After-action observations</p>
        <h2>Coach notes</h2>
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
        <p className={styles.limitations}>
          {aar.dataProvenance}. {aar.limitations.join(" ")}
        </p>
      </section>
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
