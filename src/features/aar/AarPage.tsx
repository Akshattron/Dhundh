import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  Clock3,
  FileText,
  Info,
  Printer,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import type { Aar } from "@/engine/aar";
import {
  exportAarDecisionsCsv,
  exportAarJson,
  exportAarTimelineCsv,
} from "@/engine/export";
import type { SessionClient } from "@/session/SessionClient";
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
  const view = storedView ?? client?.getSnapshot() ?? null;
  const aar = client && view?.aarReady ? client.getAar() : null;
  const [frameIndex, setFrameIndex] = useState(0);

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
  const decisionFrame = aar.frames.find(
    (candidate) =>
      candidate.atSec === aar.decision.atSec && candidate.belief !== null,
  );
  const selectedAction = aar.decision.actionLabel;

  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>
            After-action review · synthetic scenario
          </p>
          <h1>{aar.scenario.title}</h1>
          <p>
            What was known at commitment, what was decided, and what happened
            afterward.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => navigate(`/session/local/${id}`)}
        >
          <ArrowLeft size={15} /> Return to exercise
        </Button>
      </header>

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
                    {report.claim} · delivered{" "}
                    {formatClock(report.deliveredAtSec)}
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
            <div className={styles.scrubber}>
              <label htmlFor="aar-scrubber">Simulation time</label>
              <input
                id="aar-scrubber"
                type="range"
                min={0}
                max={Math.max(0, aar.frames.length - 1)}
                value={frameIndex}
                onChange={(event) => setFrameIndex(Number(event.target.value))}
                data-testid="aar-scrubber"
              />
              <strong>
                {formatClock(frame.atSec)} · {frame.phase}
              </strong>
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
              <strong>{aar.verification.assetId}</strong>
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
        <div className={styles.waterfall}>
          {aar.information.delivered.map((report) => (
            <div key={report.id}>
              <span className={styles.waterfallBar}>
                <span
                  className={
                    report.contributionNats !== null &&
                    report.contributionNats < 0
                      ? styles.negative
                      : ""
                  }
                  style={{
                    width: `${Math.min(100, Math.abs(report.contributionNats ?? 0) * 24)}%`,
                  }}
                />
              </span>
              <strong>
                {report.id} · {report.channel}
              </strong>
              <span>
                {report.contributionNats === null
                  ? "No belief contribution"
                  : `${report.contributionNats >= 0 ? "+" : ""}${report.contributionNats.toFixed(2)} nats`}
                {report.opened ? " · opened" : " · not opened"}
              </span>
            </div>
          ))}
        </div>
      </section>

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
            {note.evidence.length > 0 && (
              <small>Evidence: {note.evidence.join(", ")}</small>
            )}
          </article>
        ))}
        <p className={styles.limitations}>
          {aar.dataProvenance}. {aar.limitations.join(" ")}
        </p>
      </section>
      <section className={styles.preP1}>
        <p className={styles.kicker}>Analysis boundary</p>
        <h2>What-if analysis</h2>
        <p>
          Counterfactual delivery analysis is not implemented in P0. No claim is
          made about how a dropped or late report would have changed the
          decision.
        </p>
        <p className={styles.muted}>
          Team analysis is not applicable to this single-trainee local exercise.
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
