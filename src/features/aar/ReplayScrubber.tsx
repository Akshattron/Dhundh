import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Aar } from "@/engine/aar";
import { formatClock, formatPercent } from "@/utils/format";
import styles from "./AarPage.module.css";

const speeds = [0.5, 1, 2, 4] as const;
const tabs = [
  ["KNEW", "Knew"],
  ["TRUTH", "Truth"],
  ["NEVER_SAW", "Never saw"],
] as const;
type ReplayTab = (typeof tabs)[number][0];

export function ReplayScrubber({
  aar,
}: {
  aar: Pick<Aar, "frames" | "information">;
}) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [speed, setSpeed] = useState<number>(4);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<ReplayTab>("KNEW");
  const range = useRef<HTMLInputElement>(null);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const last = aar.frames.length - 1;
  const frame = aar.frames[Math.min(frameIndex, last)];
  const annotations = useMemo(
    () => aar.frames.flatMap((item) => item.markers),
    [aar.frames],
  );
  const omitted = useMemo(
    () =>
      aar.frames.reduce((sum, item) => sum + item.omittedAnnotationsBefore, 0),
    [aar.frames],
  );
  const reports = useMemo(() => {
    const known = new Map<
      string,
      {
        id: string;
        claim: string;
        issuedAtSec: number;
        deliveredAtSec: number | null;
      }
    >();
    for (const report of aar.information.delivered)
      known.set(report.id, report);
    for (const report of aar.information.lateOrAfterDecision) {
      known.set(report.reportId, {
        id: report.reportId,
        claim: report.claim,
        issuedAtSec: report.issuedAtSec,
        deliveredAtSec: report.deliveredAtSec,
      });
    }
    for (const report of aar.information.dropped) {
      known.set(report.reportId, {
        id: report.reportId,
        claim: report.claim,
        issuedAtSec: report.issuedAtSec,
        deliveredAtSec: null,
      });
    }
    return [...known.values()];
  }, [aar.information]);

  useEffect(() => {
    setFrameIndex(0);
    setPlaying(false);
    setTab("KNEW");
  }, [aar]);
  useEffect(() => {
    if (!playing || last < 1) return;
    const timer = window.setInterval(() => {
      setFrameIndex((index) => Math.min(last, index + 1));
    }, 1000 / speed);
    return () => window.clearInterval(timer);
  }, [last, playing, speed]);
  useEffect(() => {
    if (frameIndex >= last) setPlaying(false);
  }, [frameIndex, last]);

  if (!frame)
    return <p role="status">No recorded replay frames are available.</p>;
  const jump = (index: number) => {
    setPlaying(false);
    setFrameIndex(Math.max(0, Math.min(last, index)));
  };
  const neverSaw = reports.filter(
    (report) =>
      !frame.deliveredIds.includes(report.id) ||
      !frame.openedIds.includes(report.id),
  );
  const position = `${formatClock(frame.atSec)} - ${frame.cut === "DECISION" ? "At decision, before commitment" : frame.phase}`;

  return (
    <div
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest(
            "input, textarea, select, [contenteditable=true], [role=tab]",
          )
        )
          return;
        const index =
          event.key === "ArrowLeft"
            ? frameIndex - 1
            : event.key === "ArrowRight"
              ? frameIndex + 1
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? last
                  : null;
        if (index !== null) {
          event.preventDefault();
          jump(index);
        }
      }}
    >
      <div className={styles.replayControls}>
        <Button
          size="sm"
          variant="quiet"
          aria-label="Previous replay frame"
          disabled={frameIndex === 0}
          onClick={() => jump(frameIndex - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="quiet"
          disabled={last < 1}
          aria-label={playing ? "Pause replay" : `Play replay at ${speed}x`}
          onClick={() => {
            if (frameIndex >= last) setFrameIndex(0);
            setPlaying((value) => !value);
          }}
        >
          {playing ? (
            <Pause size={14} aria-hidden="true" />
          ) : (
            <Play size={14} aria-hidden="true" />
          )}
          {playing ? "Pause" : `Play ${speed}\u00d7`}
        </Button>
        <Button
          size="sm"
          variant="quiet"
          aria-label="Next replay frame"
          disabled={frameIndex === last}
          onClick={() => jump(frameIndex + 1)}
        >
          Next
        </Button>
        <Button size="sm" variant="quiet" onClick={() => jump(0)}>
          Home
        </Button>
        <Button size="sm" variant="quiet" onClick={() => jump(last)}>
          End
        </Button>
        <label className={styles.replaySpeed}>
          Replay speed
          <select
            value={speed}
            onChange={(event) => {
              const selected = speeds.find(
                (value) => String(value) === event.target.value,
              );
              if (selected === undefined)
                throw new Error("Unsupported replay speed");
              setSpeed(selected);
            }}
          >
            {speeds.map((value) => (
              <option value={value} key={value}>
                {value}
                {"\u00d7"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={styles.muted}>
        Playback only: 1x is one retained frame per second, not one simulated
        second. Simulation times, accepted actions, scores, and counterfactuals
        never change.
      </p>
      <div className={styles.scrubber}>
        <label htmlFor={`${id}-scrubber`}>Simulation time</label>
        <input
          ref={range}
          id={`${id}-scrubber`}
          type="range"
          min={0}
          max={Math.max(0, last)}
          value={frameIndex}
          aria-valuetext={position}
          onChange={(event) => jump(Number(event.target.value))}
          data-testid="aar-scrubber"
        />
        <strong
          role="status"
          aria-live={playing ? "off" : "polite"}
          data-testid="replay-position"
        >
          {position}
        </strong>
      </div>
      <div
        className={styles.replayTabs}
        role="tablist"
        aria-label="Replay information view"
      >
        {tabs.map(([value, label], index) => (
          <button
            key={value}
            ref={(element) => {
              tabButtons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-${value}`}
            aria-controls={`${id}-panel`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                setTab(tabs[next]![0]);
                tabButtons.current[next]?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        className={styles.replayView}
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`${id}-${tab}`}
      >
        {tab === "KNEW" && (
          <>
            <h3>Available by {formatClock(frame.atSec)}</h3>
            <p>
              Knew uses only this role's delivered information and original
              aid/inspection gates. {frame.deliveredIds.length} delivered;{" "}
              {frame.openedIds.length} opened.
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
              <p>Reference aid not available at this frame.</p>
            )}
            {frame.deliveredIds.length > 0 && (
              <p>Delivered: {frame.deliveredIds.join(", ")}</p>
            )}
          </>
        )}
        {tab === "TRUTH" && (
          <>
            <h3>Post-mortem truth at {formatClock(frame.atSec)}</h3>
            <p>Truth is shown only in this authorized post-completion view.</p>
            <div className={styles.facts}>
              {Object.entries(frame.truth).map(([hypothesisId, truth]) => (
                <div key={hypothesisId}>
                  <span>{hypothesisId.replaceAll("_", " ")}</span>
                  <strong>{truth ? "True" : "False"}</strong>
                </div>
              ))}
            </div>
            <p>
              Dropped by this cut:{" "}
              {frame.droppedIds.length ? frame.droppedIds.join(", ") : "none"}.
            </p>
          </>
        )}
        {tab === "NEVER_SAW" && (
          <>
            <h3>Information not available by {formatClock(frame.atSec)}</h3>
            <p>
              Post-mortem: dropped, delayed, or delivered-but-unopened
              information at this frame.
            </p>
            {neverSaw.length === 0 ? (
              <p>No unseen information identified at this frame.</p>
            ) : (
              <ul>
                {neverSaw.map((report) => (
                  <li key={report.id}>
                    <strong>{report.id}</strong> - {report.claim} - issued{" "}
                    {formatClock(report.issuedAtSec)}
                    {report.deliveredAtSec === null
                      ? " - not delivered"
                      : ` - arrived ${formatClock(report.deliveredAtSec)}`}
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
          {frame.trainee.decided
            ? `${frame.trainee.decisionCount} decision${frame.trainee.decisionCount === 1 ? "" : "s"}`
            : "No decision yet"}
        </span>
        <span>
          {frame.trainee.verifyPending
            ? "Verification pending"
            : "No verification pending"}
        </span>
      </div>
      <details open className={styles.replayAnnotations}>
        <summary>Recorded event annotations ({annotations.length})</summary>
        <p className={styles.muted}>
          Authorized post-mortem events and actions, in causal order. Each jump
          selects an exact retained time/cut; a state frame includes same-second
          work through that cut.
          {omitted > 0
            ? ` ${omitted} annotations between sampled frames are omitted, not moved to a nearby time. The full timeline follows.`
            : ""}
        </p>
        {annotations.length === 0 ? (
          <p>No event annotations are available for these frames.</p>
        ) : (
          <ol>
            {annotations.map((annotation) => (
              <li key={annotation.id}>
                <Button
                  size="sm"
                  variant="quiet"
                  data-testid="replay-annotation"
                  data-source-id={annotation.id}
                  data-order={annotation.order}
                  data-frame-index={annotation.frameIndex}
                  aria-label={`Jump to ${annotation.category.toLowerCase()} at ${formatClock(annotation.atSec)}: ${annotation.summary}`}
                  onClick={() => {
                    jump(annotation.frameIndex);
                    range.current?.focus();
                  }}
                >
                  <time>{formatClock(annotation.atSec)}</time>
                  <span>{annotation.category}</span>
                  {annotation.summary}
                </Button>
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}
