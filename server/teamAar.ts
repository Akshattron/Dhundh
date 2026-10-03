import type { Aar } from "../src/engine/aar";
import { buildTeamMetrics } from "../src/engine/team";
import type { ManagedSession } from "./sessions";

export function buildTeamAar(aar: Aar, session: ManagedSession): Aar {
  if (session.state.phase !== "COMPLETE") {
    throw new Error(
      "Team AAR is available only after authoritative completion",
    );
  }
  if (
    aar.scenario.hash !== session.log.scenarioHash ||
    aar.scenario.seed !== session.log.seed
  ) {
    throw new Error("Team AAR does not match the authoritative exercise");
  }
  return {
    ...aar,
    team: {
      ...buildTeamMetrics(session.scenario, session.log),
      participants: [...session.clients.values()]
        .filter(
          (participant) =>
            participant.role === "COMMANDER" || participant.role === "ANALYST",
        )
        .map((participant) => ({
          role: participant.role,
          name: participant.name,
          openedReportIds: session.state.inspections
            .filter((record) => record.role === participant.role)
            .map((record) => record.reportId),
          estimates: session.state.estimates
            .filter((record) => record.role === participant.role)
            .map(({ hypothesisId, p, atSec }) => ({ hypothesisId, p, atSec })),
          decisions: session.state.decisions
            .filter((record) => record.role === participant.role)
            .map(({ decisionPointId, actionId, atSec, timedOut }) => ({
              decisionPointId,
              actionId,
              atSec,
              timedOut,
            })),
          verificationCount: session.state.verifications.filter(
            (record) => record.role === participant.role,
          ).length,
          aidRevealedAtSec:
            session.aidMode === "ALWAYS"
              ? 0
              : (session.state.aidRevealedAtSecByRole[participant.role] ??
                null),
        })),
      relays: session.state.relays.map((relay) => {
        const report = session.state.reports[relay.relayReportId];
        if (!report || report.deliveredAtSec === null)
          throw new Error("Completed session has an invalid relay record.");
        return {
          fromRole: "ANALYST" as const,
          reportId: relay.reportId,
          relayReportId: relay.relayReportId,
          atSec: relay.atSec,
          deliveredAtSec:
            report.status === "DELIVERED" ? report.deliveredAtSec : null,
          ...(relay.note === undefined ? {} : { note: relay.note }),
        };
      }),
      advice: session.state.advice.map((item) => ({
        role: "ANALYST" as const,
        atSec: item.atSec,
        actionId: item.actionId,
        ...(item.note === undefined ? {} : { note: item.note }),
      })),
    },
  };
}
