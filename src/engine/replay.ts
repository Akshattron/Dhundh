import { readEvent } from "./events";
import { projectTraineeView } from "./view";
import { advanceTo, applyIntent, createSession, replayLog } from "./simulation";
import type {
  ChannelHealth,
  EngineEffect,
  Intent,
  RoleId,
  ScenarioDef,
  SessionLog,
  SimSeconds,
} from "./types";
import type { ProjectedBelief } from "./view";

export const REPLAY_CATEGORIES = [
  "REPORT",
  "CHANNEL",
  "CONTRADICTION",
  "VERIFICATION",
  "ESTIMATE",
  "DECISION",
  "INJECT",
  "RELAY",
  "ADVICE",
  "CONSEQUENCE",
  "COMPLETION",
  "WORLD",
  "SESSION",
] as const;

export interface ReplayAnnotation {
  id: string;
  order: number;
  atSec: SimSeconds;
  frameIndex: number;
  category: (typeof REPLAY_CATEGORIES)[number];
  summary: string;
}

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
  markers: ReplayAnnotation[];
  omittedAnnotationsBefore: number;
  trainee: {
    estimate: number | null;
    verifyPending: boolean;
    decided: boolean;
    decisionCount: number;
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
  let previousDecisionIndex = -1;
  const decisionCuts = completed.decisions.flatMap((record) => {
    if (record.timedOut) return [];
    const index = log.intents.findIndex(
      (intent, index) =>
        index > previousDecisionIndex &&
        intent.type === "DECIDE" &&
        intent.t === record.atSec &&
        intent.actionId === record.actionId &&
        intent.role === record.role,
    );
    if (index < 0) throw new Error("Replay decision has no accepted intent");
    previousDecisionIndex = index;
    return [
      { atSec: record.atSec, cut: "DECISION" as const, intentLimit: index },
    ];
  });
  const endSec = completed.nowSec;
  const candidates = new Set<number>([0, endSec]);
  for (const intent of log.intents) {
    if (intent.t <= endSec) candidates.add(intent.t);
  }
  for (const event of completed.eventTimeline.slice(
    0,
    completed.processedEventCursor,
  )) {
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
    ...times.map((atSec) => ({
      atSec,
      cut: "STATE" as const,
      intentLimit: log.intents.length,
    })),
    ...decisionCuts,
  ].sort(
    (left, right) =>
      left.atSec - right.atSec || left.intentLimit - right.intentLimit,
  );
  let sampled = candidatesWithCuts;
  if (sampled.length > 80) {
    const pinned = new Set(
      sampled.filter(
        (frame) =>
          frame.cut === "DECISION" ||
          frame.atSec === 0 ||
          frame.atSec === endSec ||
          completed.decisions.some((record) => record.atSec === frame.atSec),
      ),
    );
    if (pinned.size > 80) {
      throw new Error(
        "The 80-frame replay cannot retain this many decision cuts",
      );
    }
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
        left.atSec - right.atSec || left.intentLimit - right.intentLimit,
    );
  }
  let state = createSession(scenario, {
    seed: log.seed,
    difficultyLevel: log.difficultyLevel,
    mode: log.mode,
    aidMode: log.aidMode,
  });
  let intentIndex = 0;
  let annotationOrder = 0;
  let pending: Omit<ReplayAnnotation, "frameIndex">[] = [];
  const annotate = (
    id: string,
    atSec: number,
    category: ReplayAnnotation["category"],
    summary: string,
  ) => {
    pending.push({ id, order: annotationOrder++, atSec, category, summary });
  };
  const captureEvents = (previousCursor: number, effects: EngineEffect[]) => {
    for (const internal of state.eventTimeline.slice(
      previousCursor,
      state.processedEventCursor,
    )) {
      const event = readEvent(internal);
      const id = `event:${internal.order}`;
      switch (event.kind) {
        case "REPORT_DELIVER": {
          const report = state.reports[event.reportId];
          if (!report)
            throw new Error("Replay delivery references an unknown report");
          const category =
            report.origin === "VERIFY"
              ? "VERIFICATION"
              : report.origin === "RELAY"
                ? "RELAY"
                : "REPORT";
          annotate(
            id,
            event.atSec,
            category,
            `${event.reportId} arrived on ${report.def.channel}`,
          );
          break;
        }
        case "REPORT_ISSUE":
          if (state.reports[event.reportId]?.status === "DROPPED") {
            annotate(
              id,
              event.atSec,
              "REPORT",
              `${event.reportId} was dropped (post-mortem)`,
            );
          }
          break;
        case "CHANNEL_DEGRADE":
          annotate(
            id,
            event.atSec,
            "CHANNEL",
            `${event.channel} entered ${event.mode.toLowerCase()}`,
          );
          break;
        case "CHANNEL_RESTORE":
        case "CHANNEL_FORCE_RESTORE":
          if (
            effects.some(
              (effect) =>
                effect.kind === "CHANNEL_CHANGED" &&
                effect.channel === event.channel &&
                effect.atSec === event.atSec,
            )
          ) {
            annotate(
              id,
              event.atSec,
              "CHANNEL",
              `${event.channel} restoration processed`,
            );
          }
          break;
        case "TRUTH_CHANGE":
          annotate(
            id,
            event.atSec,
            "WORLD",
            `World state changed for ${event.hypothesisId} (post-mortem)`,
          );
          break;
        case "DECISION_OPEN":
          if (
            effects.some(
              (effect) =>
                effect.kind === "DECISION_WINDOW_OPENED" &&
                effect.decisionPointId === event.decisionPointId,
            )
          ) {
            annotate(
              id,
              event.atSec,
              "DECISION",
              `${event.decisionPointId} decision window opened`,
            );
          }
          break;
        case "DECISION_CLOSE": {
          const timeout = completed.decisions.find(
            (record) =>
              record.decisionPointId === event.decisionPointId &&
              record.timedOut &&
              record.atSec === event.atSec,
          );
          if (timeout) {
            annotate(
              id,
              event.atSec,
              "DECISION",
              `${event.decisionPointId} timed out: ${timeout.actionId}`,
            );
            if (state.phase === "CONSEQUENCE") {
              annotate(
                `${id}:consequence`,
                event.atSec,
                "CONSEQUENCE",
                "Consequence pending after timeout",
              );
            }
          }
          break;
        }
        case "CONSEQUENCE_REVEAL":
          annotate(
            id,
            event.atSec,
            "COMPLETION",
            "Actual consequence revealed; exercise complete",
          );
          break;
      }
    }
  };
  const advance = (atSec: number) => {
    const cursor = state.processedEventCursor;
    const result = advanceTo(state, scenario, atSec);
    if (result.error) throw new Error(result.error.message);
    state = result.state;
    captureEvents(cursor, result.effects);
  };
  const captureIntent = (intent: Intent, index: number) => {
    const id = `intent:${index}`;
    switch (intent.type) {
      case "OPEN_REPORT":
        annotate(
          id,
          intent.t,
          "REPORT",
          `${intent.role} inspected ${intent.reportId}`,
        );
        break;
      case "SET_ESTIMATE":
        annotate(
          id,
          intent.t,
          "ESTIMATE",
          `${intent.role} estimated ${intent.hypothesisId} at ${Math.round(intent.p * 100)}%`,
        );
        break;
      case "VERIFY":
        annotate(
          id,
          intent.t,
          "VERIFICATION",
          `${intent.role} requested ${intent.assetId}`,
        );
        break;
      case "DECIDE":
        annotate(
          id,
          intent.t,
          "DECISION",
          `${intent.role} committed to ${intent.actionId}`,
        );
        if (state.phase === "CONSEQUENCE") {
          annotate(
            `${id}:consequence`,
            intent.t,
            "CONSEQUENCE",
            "Consequence pending; decision is fixed",
          );
        }
        break;
      case "INJECT":
        annotate(
          id,
          intent.t,
          "INJECT",
          `Instructor applied ${intent.presetId}`,
        );
        break;
      case "RELAY":
        annotate(
          id,
          intent.t,
          "RELAY",
          `Analyst sent ${intent.reportId} to Commander`,
        );
        break;
      case "ADVISE":
        annotate(id, intent.t, "ADVICE", `Analyst advised ${intent.actionId}`);
        break;
      default:
        annotate(
          id,
          intent.t,
          "SESSION",
          `${intent.role}: ${intent.type.replaceAll("_", " ").toLowerCase()}`,
        );
    }
  };
  const acceptNext = () => {
    const intent = log.intents[intentIndex];
    if (!intent) throw new Error("Replay intent is missing");
    // Scheduled work precedes an accepted intent, including a previous DP's timeout.
    advance(intent.t);
    const cursor = state.processedEventCursor;
    const applied = applyIntent(state, scenario, intent);
    if (!applied.result.ok) {
      throw new Error(
        `Replay intent ${intentIndex} failed: ${applied.result.error}`,
      );
    }
    state = applied.state;
    captureIntent(intent, intentIndex);
    captureEvents(cursor, applied.result.effects);
    intentIndex += 1;
  };
  const frames: ReplayFrame[] = [];
  for (const { atSec, cut, intentLimit } of sampled) {
    while (
      intentIndex < log.intents.length &&
      log.intents[intentIndex]!.t < atSec
    ) {
      acceptNext();
    }
    advance(atSec);
    while (intentIndex < intentLimit && log.intents[intentIndex]!.t <= atSec) {
      acceptNext();
    }
    if (cut === "DECISION") {
      annotate(
        `intent:${intentLimit}:cut`,
        atSec,
        "DECISION",
        "Decision cut immediately before commitment",
      );
    }
    const view = projectTraineeView(scenario, state, role);
    const estimate =
      state.estimates.filter((record) => record.role === role).at(-1)?.p ??
      null;
    const latestDecision = state.decisions
      .filter((record) => record.role === role)
      .at(-1);
    for (const [id, belief] of Object.entries(
      view.belief?.perHypothesis ?? {},
    )) {
      if (
        belief.contradicted &&
        !frames.at(-1)?.belief?.perHypothesis[id]?.contradicted
      ) {
        annotate(
          `belief:${frames.length}:${id}`,
          atSec,
          "CONTRADICTION",
          `First retained cut with an available conflict flag for ${id}`,
        );
      }
    }
    const markers = pending
      .filter((item) => item.atSec === atSec)
      .map((item) => ({ ...item, frameIndex: frames.length }));
    const omittedAnnotationsBefore = pending.length - markers.length;
    pending = [];
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
      annotations: markers.map((item) => item.summary),
      markers,
      omittedAnnotationsBefore,
      trainee: {
        estimate,
        verifyPending: state.verifications.some(
          (verification) =>
            verification.role === role &&
            state.reports[verification.resultReportId]?.status !== "DELIVERED",
        ),
        decided: latestDecision !== undefined,
        decisionCount: state.decisions.filter((record) => record.role === role)
          .length,
        actionId: latestDecision?.actionId ?? null,
      },
    });
  }
  return frames;
}
