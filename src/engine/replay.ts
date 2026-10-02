import { readEvent } from "./events";
import { projectTraineeView } from "./view";
import { replayLog } from "./simulation";
import type {
  ChannelHealth,
  RoleId,
  ScenarioDef,
  SessionLog,
  SimSeconds,
} from "./types";
import type { ProjectedBelief } from "./view";

export interface ReplayFrame {
  atSec: SimSeconds;
  role: RoleId;
  phase: string;
  belief: ProjectedBelief | null;
  deliveredIds: string[];
  droppedIds: string[];
  openedIds: string[];
  truth: Record<string, boolean>;
  channels: Record<string, ChannelHealth>;
  annotations: string[];
  trainee: {
    estimate: number | null;
    verifyPending: boolean;
    decided: boolean;
    actionId: string | null;
  };
}

export function buildFrames(
  scenario: ScenarioDef,
  log: SessionLog,
): ReplayFrame[] {
  const completed = replayLog(scenario, log);
  const role = log.mode === "LOCAL" ? "SOLO" : "COMMANDER";
  const decisionAt = completed.decisions.at(-1)?.atSec ?? 0;
  const endSec = completed.nowSec;
  const candidates = new Set<number>([0, endSec]);
  for (const intent of log.intents) {
    if (intent.t <= endSec) candidates.add(intent.t);
  }
  for (const event of completed.eventTimeline) {
    if (event.atSec <= endSec) candidates.add(event.atSec);
  }
  for (let minute = 0; minute * 60 <= decisionAt + 60; minute += 1) {
    candidates.add(minute * 60);
  }
  const times = [...candidates]
    .filter((time) => time <= endSec)
    .sort((a, b) => a - b);
  const sampled =
    times.length <= 80
      ? times
      : [
          ...times.slice(0, 78),
          times.find((time) => time === decisionAt) ?? times[78]!,
          endSec,
        ].sort((a, b) => a - b);
  return sampled.map((atSec) => {
    const state =
      atSec === endSec
        ? completed
        : replayLog(scenario, log, { upToSec: atSec });
    const view = projectTraineeView(scenario, state, role);
    const estimate =
      state.estimates.filter((record) => record.role === role).at(-1)?.p ??
      null;
    const latestDecision = state.decisions
      .filter((record) => record.role === role)
      .at(-1);
    const annotations = state.eventTimeline
      .slice(0, state.processedEventCursor)
      .map(readEvent)
      .filter((event) => event.atSec === atSec)
      .map((event) => {
        switch (event.kind) {
          case "CHANNEL_DEGRADE":
            return `${event.channel} link degraded`;
          case "CHANNEL_RESTORE":
            return `${event.channel} link restored`;
          case "TRUTH_CHANGE":
            return "World state changed";
          case "REPORT_DELIVER":
            return "Report delivered";
          case "CONSEQUENCE_REVEAL":
            return "Exercise completed";
          default:
            return "";
        }
      })
      .filter(Boolean);
    const droppedIds = Object.values(state.reports)
      .filter((report) => report.status === "DROPPED")
      .map((report) => report.def.id);
    return {
      atSec,
      role,
      phase: state.phase,
      belief: view.belief,
      deliveredIds: view.reports.map((report) => report.id),
      droppedIds,
      openedIds: view.inspections,
      truth: { ...state.truth },
      channels: Object.fromEntries(
        Object.entries(state.channels).map(([channel, runtime]) => [
          channel,
          runtime.health,
        ]),
      ),
      annotations,
      trainee: {
        estimate,
        verifyPending: state.verifications.some(
          (verification) =>
            verification.role === role &&
            state.reports[verification.resultReportId]?.status !== "DELIVERED",
        ),
        decided: latestDecision !== undefined,
        actionId: latestDecision?.actionId ?? null,
      },
    };
  });
}
