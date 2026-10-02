import { z } from "zod";
import { scenarioRuntimeSchema } from "./scenarioSchema";
import type { InternalEvent, ScenarioDef, SimState } from "./types";

const seconds = z.number().int().nonnegative();
const channelId = z.enum(["LAND", "AIR", "CYBER", "EW"]);
const decisionEvent = {
  atSec: seconds,
  decisionPointId: z.string().min(1),
};
const eventSchema = z.discriminatedUnion("kind", [
  ...scenarioRuntimeSchema.shape.events.element.options,
  z.strictObject({
    kind: z.literal("CHANNEL_FORCE_RESTORE"),
    atSec: seconds,
    channel: channelId,
  }),
  z.strictObject({
    kind: z.literal("REPORT_DELIVER"),
    atSec: seconds,
    reportId: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal("DECISION_OPEN"), ...decisionEvent }),
  z.strictObject({ kind: z.literal("DECISION_CLOSE"), ...decisionEvent }),
  z.strictObject({
    kind: z.literal("CONSEQUENCE_REVEAL"),
    ...decisionEvent,
    actionId: z.string().min(1),
    decisionAtSec: seconds,
    truthAtDecision: z.record(z.string(), z.boolean()),
    consequence:
      scenarioRuntimeSchema.shape.decisionPoints.element.shape.actions.element
        .shape.consequences.element,
  }),
]);

export type EngineEvent = z.infer<typeof eventSchema>;

const priorities: Readonly<Record<InternalEvent["kind"], number>> =
  Object.freeze({
    TRUTH_CHANGE: 0,
    CHANNEL_RESTORE: 1,
    CHANNEL_FORCE_RESTORE: 1,
    CHANNEL_DEGRADE: 2,
    REPORT_ISSUE: 3,
    REPORT_DELIVER: 4,
    DECISION_OPEN: 5,
    DECISION_CLOSE: 6,
    CONSEQUENCE_REVEAL: 7,
  });

export function compareEvents(
  left: InternalEvent,
  right: InternalEvent,
): number {
  return (
    left.atSec - right.atSec ||
    left.priority - right.priority ||
    left.order - right.order
  );
}

function internalEvent(event: EngineEvent, order: number): InternalEvent {
  return {
    atSec: event.atSec,
    priority: priorities[event.kind],
    order,
    kind: event.kind,
    payload: structuredClone(event),
  };
}

export function readEvent(event: InternalEvent): EngineEvent {
  const payload = eventSchema.parse(event.payload);
  if (
    payload.kind !== event.kind ||
    payload.atSec !== event.atSec ||
    event.priority !== priorities[event.kind]
  ) {
    throw new Error("Internal event envelope does not match its payload");
  }
  return payload;
}

export function buildEventTimeline(
  scenario: ScenarioDef,
): Pick<SimState, "eventTimeline" | "nextEventOrder"> {
  const events: EngineEvent[] = [...scenario.events];
  for (const dp of scenario.decisionPoints) {
    events.push(
      { kind: "DECISION_OPEN", atSec: dp.openSec, decisionPointId: dp.id },
      { kind: "DECISION_CLOSE", atSec: dp.closeSec, decisionPointId: dp.id },
    );
  }
  return {
    eventTimeline: events.map(internalEvent).sort(compareEvents),
    nextEventOrder: events.length,
  };
}

export function scheduleEvent(state: SimState, event: EngineEvent): SimState {
  if (!Number.isSafeInteger(event.atSec) || event.atSec < state.nowSec) {
    throw new RangeError(
      "Cannot schedule an event before the current integer second",
    );
  }
  const pending = internalEvent(event, state.nextEventOrder);
  let low = state.processedEventCursor;
  let high = state.eventTimeline.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const existing = state.eventTimeline[middle];
    if (!existing) throw new Error("Internal event timeline contains a gap");
    if (compareEvents(existing, pending) <= 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return {
    ...state,
    eventTimeline: [
      ...state.eventTimeline.slice(0, low),
      pending,
      ...state.eventTimeline.slice(low),
    ],
    nextEventOrder: state.nextEventOrder + 1,
  };
}
