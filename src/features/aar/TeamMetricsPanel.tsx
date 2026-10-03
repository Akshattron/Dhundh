import type { TeamMetricReport, TeamRelayResponse } from "@/engine/team";
import { formatClock, formatPercent } from "@/utils/format";
import styles from "./AarPage.module.css";

const labels = {
  informationSharingRate: "Information sharing rate",
  estimateConvergence: "Estimate convergence",
  medianRelayDelayMin: "Median relay delay",
  medianCoordinationLatencySec: "Coordination latency",
} as const;
const relayStatus: Record<TeamRelayResponse["status"], string> = {
  MATCHED: "Matched response",
  NO_RESPONSE: "No matching response by commitment",
  AFTER_DECISION: "Arrived after commitment",
  NOT_DELIVERED: "Not delivered by completion",
  NOT_MEANINGFUL: "Below the meaningful-evidence threshold",
};

export function TeamMetricsPanel({ report }: { report: TeamMetricReport }) {
  return (
    <section
      className={styles.panel}
      aria-labelledby="team-metrics-title"
      data-testid="team-metrics"
    >
      <p className={styles.kicker}>Completed authoritative history only</p>
      <h2 id="team-metrics-title">Team coordination metrics</h2>
      <p className={styles.muted}>
        Descriptive diagnostics, not a composite team score or evidence of
        validated learning transfer. Each decision uses its own cumulative
        precommitment history.
      </p>
      {report.decisionMetrics.map((decision) => (
        <section className={styles.teamDecision} key={decision.decisionPointId}>
          <h3>
            {decision.decisionPointId} - commitment at{" "}
            {formatClock(decision.atSec)}
            {decision.timedOut ? " (timeout)" : ""}
          </h3>
          <dl className={styles.teamMetricGrid}>
            <div>
              <dt>{labels.informationSharingRate}</dt>
              <dd data-testid={`sharing-rate-${decision.decisionPointId}`}>
                {decision.metrics.informationSharingRate === null
                  ? "No opportunities"
                  : formatPercent(decision.metrics.informationSharingRate, 1)}
              </dd>
              <p>
                {decision.counts.meaningfulReportsRelayed} of{" "}
                {decision.counts.meaningfulReports} meaningful original reports
                sent; {decision.counts.analystReportsDelivered} analyst reports
                delivered.
              </p>
              <p>
                Distinct sends before this cut, not proof of receipt or use.
              </p>
            </div>
            <div>
              <dt>{labels.estimateConvergence}</dt>
              <dd data-testid={`convergence-${decision.decisionPointId}`}>
                {decision.metrics.estimateConvergence === null
                  ? "Both estimates needed"
                  : formatPercent(decision.metrics.estimateConvergence, 1)}
              </dd>
              <p>
                {decision.counts.primaryEstimateIntents} estimate actions;{" "}
                {decision.counts.pairedEstimates} paired cuts for{" "}
                {decision.primaryHypothesisLabel}.
              </p>
              <p>
                {decision.convergenceChange === null ||
                decision.initialConvergence === null
                  ? "No paired baseline; missing estimates are not replaced."
                  : `First paired agreement ${formatPercent(decision.initialConvergence, 1)}; change ${decision.convergenceChange >= 0 ? "+" : ""}${(decision.convergenceChange * 100).toFixed(1)} percentage points. Agreement is not correctness.`}
              </p>
            </div>
            <div>
              <dt>{labels.medianRelayDelayMin}</dt>
              <dd>
                {decision.metrics.medianRelayDelayMin === null
                  ? "No received relays"
                  : `${decision.metrics.medianRelayDelayMin.toFixed(2)} min`}
              </dd>
              <p>
                {decision.counts.relayReceipts} actual receipts from{" "}
                {decision.counts.relayIntents} relay actions sent before
                commitment.
              </p>
              <p>
                Original receipt to relay receipt. Includes arrivals after the
                decision.
              </p>
            </div>
            <div>
              <dt>{labels.medianCoordinationLatencySec}</dt>
              <dd
                data-testid={`coordination-latency-${decision.decisionPointId}`}
              >
                {decision.metrics.medianCoordinationLatencySec === null
                  ? "No matched response"
                  : `${decision.metrics.medianCoordinationLatencySec.toFixed(1)} sec`}
              </dd>
              <p>
                {decision.counts.matchedResponses} matched actions from{" "}
                {decision.counts.meaningfulReceiptsBeforeDecision} meaningful
                predecision receipts; {decision.counts.unansweredReceipts}{" "}
                unanswered.
              </p>
              <p>
                Receipt to a matching Commander action, bounded by this
                commitment. Missing responses are not zero.
              </p>
            </div>
          </dl>
          <details>
            <summary>
              Sharing opportunities ({decision.opportunities.length})
            </summary>
            {decision.opportunities.length ? (
              <ul>
                {decision.opportunities.map((item) => (
                  <li key={item.reportId}>
                    {item.reportId} - original receipt{" "}
                    {formatClock(item.deliveredAtSec)}; LLR at commitment{" "}
                    {item.llrAtDecision.toFixed(3)};
                    {item.relayedBeforeDecision
                      ? " sent before commitment"
                      : " not relayed before commitment"}
                    .
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No delivered analyst report met the absolute-LLR threshold at
                this cut.
              </p>
            )}
          </details>
          <details>
            <summary>
              Estimate trajectory ({decision.convergence.length} paired cuts)
            </summary>
            <p>
              Recorded order is preserved for estimates sharing a timestamp.
              Latest {Math.min(24, decision.convergence.length)} paired cuts
              shown; the JSON export retains all cuts.
            </p>
            {decision.convergence.length ? (
              <div
                className={styles.teamTable}
                role="region"
                aria-label={`${decision.decisionPointId} estimate trajectory`}
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Source action</th>
                      <th scope="col">Commander</th>
                      <th scope="col">Analyst</th>
                      <th scope="col">Agreement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decision.convergence.slice(-24).map((point) => (
                      <tr key={point.intentIndex}>
                        <td>{formatClock(point.atSec)}</td>
                        <td>
                          {point.role} #{point.intentIndex + 1}
                        </td>
                        <td>{formatPercent(point.commander, 1)}</td>
                        <td>{formatPercent(point.analyst, 1)}</td>
                        <td>{formatPercent(point.convergence, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                Both roles must record primary-hypothesis estimates before a
                paired trajectory exists.
              </p>
            )}
          </details>
          <details open>
            <summary>
              Relay and response timeline ({decision.relays.length})
            </summary>
            {decision.relays.length ? (
              <div
                className={styles.teamTable}
                role="region"
                aria-label={`${decision.decisionPointId} relay responses`}
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Relay</th>
                      <th scope="col">Original receipt</th>
                      <th scope="col">Sent</th>
                      <th scope="col">Commander receipt</th>
                      <th scope="col">Matching action</th>
                      <th scope="col">Latency / status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decision.relays.map((relay) => (
                      <tr key={relay.relayReportId}>
                        <td>
                          {relay.reportId} to {relay.relayReportId}
                        </td>
                        <td>{formatClock(relay.originalDeliveredAtSec)}</td>
                        <td>{formatClock(relay.requestedAtSec)}</td>
                        <td>
                          {relay.deliveredAtSec === null
                            ? `Not received (scheduled ${formatClock(relay.scheduledDeliveryAtSec)})`
                            : formatClock(relay.deliveredAtSec)}
                        </td>
                        <td>
                          {relay.response
                            ? `${relay.response.type} at ${formatClock(relay.response.atSec)} (action #${relay.response.intentIndex + 1})`
                            : "None by cut"}
                        </td>
                        <td>
                          {relay.latencySec === null
                            ? relayStatus[relay.status]
                            : `${relay.latencySec} sec - ${relayStatus[relay.status]}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                No Analyst-to-Commander relay actions were recorded before this
                decision.
              </p>
            )}
          </details>
        </section>
      ))}
      <details>
        <summary>Exact definitions and limitations</summary>
        <dl>
          {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
            <div key={key}>
              <dt>
                <strong>{labels[key]}</strong>
              </dt>
              <dd>{report.metricDefinitions[key]}</dd>
            </div>
          ))}
        </dl>
        <ul>
          {report.metricLimitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
