// @vitest-environment node
import { describe, expect, it } from "vitest";
import { advanceTo } from "../../src/engine";
import {
  buildEventTimeline,
  compareEvents,
  readEvent,
  scheduleEvent,
} from "../../src/engine/events";
import { flagship, freeze, started } from "./fixtures";

describe("state-owned event ordering", () => {
  it("builds a stable total order without changing authored array order", () => {
    const scenario = freeze(structuredClone(flagship));
    const before = JSON.stringify(scenario.events);
    const first = buildEventTimeline(scenario);
    expect(first).toEqual(buildEventTimeline(scenario));
    expect(first.nextEventOrder).toBe(scenario.events.length + 2);
    expect(new Set(first.eventTimeline.map((event) => event.order)).size).toBe(
      first.eventTimeline.length,
    );
    for (let index = 1; index < first.eventTimeline.length; index += 1) {
      expect(
        compareEvents(
          first.eventTimeline[index - 1]!,
          first.eventTimeline[index]!,
        ),
      ).toBeLessThanOrEqual(0);
    }
    expect(
      first.eventTimeline
        .map(readEvent)
        .filter((event) => event.atSec === 1440)
        .map((event) => event.kind),
    ).toEqual(["CHANNEL_RESTORE", "REPORT_ISSUE"]);
    expect(JSON.stringify(scenario.events)).toBe(before);
  });

  it("orders by time, then priority, then monotonic allocation order", () => {
    const sample = buildEventTimeline(flagship).eventTimeline[0]!;
    expect(
      compareEvents({ ...sample, atSec: 0 }, { ...sample, atSec: 1 }),
    ).toBeLessThan(0);
    expect(
      compareEvents({ ...sample, priority: 1 }, { ...sample, priority: 2 }),
    ).toBeLessThan(0);
    expect(
      compareEvents({ ...sample, order: 1 }, { ...sample, order: 2 }),
    ).toBeLessThan(0);
    expect(compareEvents(sample, sample)).toBe(0);
  });

  it("inserts dynamic work only into the unprocessed suffix, even with a higher priority", () => {
    const before = freeze(advanceTo(started(), flagship, 720).state);
    const prefix = before.eventTimeline.slice(0, before.processedEventCursor);
    const event = {
      kind: "TRUTH_CHANGE",
      atSec: 720,
      hypothesisId: "north_pass",
      value: false,
    } as const;
    const scheduled = scheduleEvent(before, event);
    expect(
      scheduled.eventTimeline.slice(0, before.processedEventCursor),
    ).toEqual(prefix);
    expect(scheduled.eventTimeline[before.processedEventCursor]).toMatchObject({
      kind: "TRUTH_CHANGE",
      order: before.nextEventOrder,
      priority: 0,
    });
    expect(scheduled.nextEventOrder).toBe(before.nextEventOrder + 1);
    expect(scheduled.processedEventCursor).toBe(before.processedEventCursor);
    const result = advanceTo(scheduled, flagship, 720);
    expect(result.state.truth.north_pass).toBe(false);
    expect(result.effects).toEqual([{ kind: "TRUTH_CHANGED", atSec: 720 }]);
    expect(before.truth.north_pass).toBe(true);
    expect(result.state.eventTimeline.slice(0, prefix.length)).toEqual(prefix);
  });

  it.each([-1, 719, 720.5, Infinity])(
    "rejects invalid dynamic time %s",
    (atSec) => {
      const state = freeze(advanceTo(started(), flagship, 720).state);
      expect(() =>
        scheduleEvent(state, {
          kind: "TRUTH_CHANGE",
          atSec,
          hypothesisId: "north_pass",
          value: false,
        }),
      ).toThrow(RangeError);
    },
  );

  it("does not trust an opaque event payload that disagrees with its envelope", () => {
    const event = buildEventTimeline(flagship).eventTimeline[0]!;
    expect(() => readEvent({ ...event, atSec: event.atSec + 1 })).toThrow(
      "envelope",
    );
    expect(() => readEvent({ ...event, payload: {} })).toThrow();
    expect(() => readEvent({ ...event, priority: 99 })).toThrow("envelope");
  });
});
