import { readEvent } from "./events";
import { projectTraineeView } from "./view";
import { advanceTo, applyIntent, createSession, replayLog } from "./simulation";
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
  cut: "DECISION" | "STATE";
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
  const decision = completed.decisions.at(-1);
  const decisionAt = decision?.atSec ?? 0;
  const decisionIntentIndex = decision
    ? log.intents.findIndex(
        (intent) =>
          intent.type === "DECIDE" &&
          intent.t === decision.atSec &&
          intent.actionId === decision.actionId &&
          intent.role === decision.role,
      )
    : -1;
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
  candidates.add(decisionAt + 60);
  const times = [...candidates]
    .filter((time) => time <= endSec)
    .sort((a, b) => a - b);
  const candidatesWithCuts = [
    ...times.map((atSec) => ({ atSec, cut: "STATE" as const })),
    ...(decision && decisionIntentIndex >= 0
      ? [{ atSec: decisionAt, cut: "DECISION" as const }]
      : []),
  ].sort(
    (left, right) =>
      left.atSec - right.atSec || (left.cut === "DECISION" ? -1 : 1),
  );
  let sampled = candidatesWithCuts;
  if (sampled.length > 80) {
    const decisionFrame = sampled.find((frame) => frame.cut === "DECISION");
    const terminalFrame = sampled.find(
      (frame) => frame.cut === "STATE" && frame.atSec === endSec,
    );
    const pinned = new Set(
      [decisionFrame, terminalFrame].filter((frame) => frame !== undefined),
    );
    const ordinary = sampled.filter((frame) => !pinned.has(frame));
    const slots = 80 - pinned.size;
    const selected =
      slots >= ordinary.length
        ? ordinary
        : Array.from({ length: slots }, (_, index) => {
            const sourceIndex =
              slots === 1
                ? 0
                : Math.round((index * (ordinary.length - 1)) / (slots - 1));
            return ordinary[sourceIndex]!;
          });
    sampled = [...selected, ...pinned];
    sampled.sort(
      (left, right) =>
        left.atSec - right.atSec || (left.cut === "DECISION" ? -1 : 1),
    );
  }
  let state = createSession(scenario, {
    seed: log.seed,
    difficultyLevel: log.difficultyLevel,
    mode: log.mode,
    aidMode: log.aidMode,
  });
  let intentIndex = 0;
  const frames: ReplayFrame[] = [];
  for (const { atSec, cut } of sampled) {
    while (
      intentIndex < log.intents.length &&
      log.intents[intentIndex]!.t < atSec
    ) {
      const applied = applyIntent(state, scenario, log.intents[intentIndex]!);
      if (!applied.result.ok) {
        throw new Error(
          `Replay intent ${intentIndex} failed: ${applied.result.error}`,
        );
      }
      state = applied.state;
      intentIndex += 1;
    }
    state = advanceTo(state, scenario, atSec).state;
    if (cut === "DECISION" && decisionIntentIndex >= 0) {
      while (intentIndex < decisionIntentIndex) {
        const applied = applyIntent(state, scenario, log.intents[intentIndex]!);
        if (!applied.result.ok) {
          throw new Error(
            `Replay intent ${intentIndex} failed: ${applied.result.error}`,
          );
        }
        state = applied.state;
        intentIndex += 1;
      }
    } else {
      while (
        intentIndex < log.intents.length &&
        log.intents[intentIndex]!.t <= atSec
      ) {
        const applied = applyIntent(state, scenario, log.intents[intentIndex]!);
        if (!applied.result.ok) {
          throw new Error(
            `Replay intent ${intentIndex} failed: ${applied.result.error}`,
          );
        }
        state = applied.state;
        intentIndex += 1;
      }
      if (atSec === endSec) state = completed;
    }
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
    frames.push({
      atSec,
      cut,
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
    });
  }
  return frames;
}
