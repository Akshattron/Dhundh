import { formatClock } from "@/utils/format";
import styles from "./EvidenceWaterfall.module.css";

export interface WaterfallContribution {
  reportId: string;
  group: string;
  channel: string;
  claim: string;
  gradeLabel: string;
  ageSec: number;
  effectiveAccuracy: number | null;
  llr: number | null;
  inspected: boolean;
  deliveredAtSec?: number;
}

export interface WaterfallHypothesis {
  id: string;
  label: string;
  priorLogOdds: number;
  currentLogOdds: number;
  contributions: WaterfallContribution[];
}

export function EvidenceWaterfall({
  hypotheses,
  onOpen,
  inspectionEnabled = true,
}: {
  hypotheses: WaterfallHypothesis[];
  onOpen?: (reportId: string) => void;
  inspectionEnabled?: boolean;
}) {
  return (
    <div className={styles.root}>
      {hypotheses.map((hypothesis) => {
        const contributions = hypothesis.contributions;
        const inspectedValues = contributions.flatMap((item) =>
          item.inspected && item.llr !== null ? [item.llr] : [],
        );
        const maxMagnitude = Math.max(
          0,
          ...inspectedValues.map((value) => Math.abs(value)),
        );
        const hasPositive = inspectedValues.some((value) => value > 0);
        const hasNegative = inspectedValues.some((value) => value < 0);

        return (
          <section className={styles.hypothesis} key={hypothesis.id}>
            <header className={styles.heading}>
              <div>
                <p className={styles.kicker}>Hypothesis</p>
                <h3>{hypothesis.label}</h3>
              </div>
              <p className={styles.anchorText}>
                Prior <strong>{hypothesis.priorLogOdds.toFixed(3)}</strong>
                <span aria-hidden="true"> → </span>
                Current <strong>{hypothesis.currentLogOdds.toFixed(3)}</strong>
              </p>
            </header>
            {contributions.length === 0 ? (
              <p className={styles.empty}>
                No delivered evidence groups contribute yet.
              </p>
            ) : (
              <>
                <div className={styles.axis} aria-hidden="true">
                  <span>Against hypothesis</span>
                  <span>Prior anchor</span>
                  <span>For hypothesis</span>
                </div>
                <ol className={styles.ledger}>
                  {contributions.map((item, index) => {
                    const known = item.inspected && item.llr !== null;
                    const canOpen = !known && Boolean(onOpen);
                    const magnitude = Math.abs(item.llr ?? 0);
                    const width =
                      known && maxMagnitude > 0
                        ? Math.max(1, (magnitude / maxMagnitude) * 46)
                        : 0;
                    const arrival =
                      item.deliveredAtSec === undefined
                        ? null
                        : formatClock(item.deliveredAtSec);
                    const age = formatClock(item.ageSec);
                    const accuracy =
                      item.effectiveAccuracy === null
                        ? "unavailable"
                        : (item.effectiveAccuracy * 100).toFixed(1) + "%";
                    const opposes =
                      known &&
                      ((item.llr ?? 0) > 0 ? hasNegative : hasPositive);
                    const description = known
                      ? [
                          item.reportId,
                          item.claim,
                          item.channel,
                          "evidence group " + item.group,
                          "source grade " + item.gradeLabel,
                          "age " + age,
                          "effective accuracy " + accuracy,
                          "contribution " +
                            (item.llr ?? 0).toFixed(3) +
                            " nats",
                          ...(opposes
                            ? ["opposes other inspected evidence"]
                            : []),
                        ].join(", ")
                      : `${!inspectionEnabled ? "Inspection unavailable while the clock is paused. " : ""}${item.reportId}, ${item.claim}, ${item.channel}, evidence group ${item.group}. signed contribution withheld until report inspection.`;
                    const row = (
                      <>
                        <span className={styles.index} aria-hidden="true">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className={styles.recordBody}>
                          <span className={styles.recordMeta}>
                            <strong>{item.reportId}</strong>
                            <span data-channel={item.channel}>
                              {item.channel}
                            </span>
                            <span>{item.group}</span>
                            {arrival && <span>Arrived {arrival}</span>}
                            <span>Age {age}</span>
                            {known && <span>Grade {item.gradeLabel}</span>}
                            {known && <span>Reliability {accuracy}</span>}
                          </span>
                          <span className={styles.claim}>{item.claim}</span>
                          <span className={styles.barTrack} aria-hidden="true">
                            <span
                              className={
                                known ? styles.bar : styles.withheldMark
                              }
                              data-direction={
                                (item.llr ?? 0) < 0 ? "against" : "for"
                              }
                              data-channel={item.channel}
                              style={{ width: width + "%" }}
                            />
                          </span>
                          <span className={styles.contribution}>
                            {known
                              ? ((item.llr ?? 0) >= 0 ? "+" : "") +
                                (item.llr ?? 0).toFixed(3) +
                                " nats"
                              : canOpen
                                ? inspectionEnabled
                                  ? "Open report to inspect contribution"
                                  : "Inspection paused"
                                : "Not inspected"}
                            {opposes && (
                              <span className={styles.contradiction}>
                                Opposing evidence
                              </span>
                            )}
                          </span>
                        </span>
                      </>
                    );

                    return (
                      <li
                        className={styles.row}
                        key={item.group + "-" + item.reportId}
                        data-channel={item.channel}
                        data-inspected={known}
                        data-opposes={opposes}
                      >
                        {canOpen ? (
                          <button
                            className={styles.openRow}
                            type="button"
                            aria-label={description}
                            aria-disabled={!inspectionEnabled}
                            onClick={() => {
                              if (inspectionEnabled) onOpen?.(item.reportId);
                            }}
                          >
                            {row}
                          </button>
                        ) : (
                          <div
                            className={styles.record}
                            role={known ? "group" : "img"}
                            aria-label={description}
                          >
                            {row}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
            <p className={styles.summary}>
              {contributions.length === 0
                ? "No delivered evidence groups contribute yet."
                : `${contributions.length} contributing evidence group${contributions.length === 1 ? "" : "s"}; prior log-odds ${hypothesis.priorLogOdds.toFixed(3)}, posterior log-odds ${hypothesis.currentLogOdds.toFixed(3)}. Positive evidence extends right; negative evidence extends left.`}
            </p>
          </section>
        );
      })}
    </div>
  );
}
