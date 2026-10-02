// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  advanceTo,
  applyIntent,
  createSession,
  replayLog,
} from "../../src/engine";
import type { EngineEffect } from "../../src/engine";
import { pathIntents } from "../golden/flagship.expected";
import { accept, config, flagship, freeze, logFor, started } from "./fixtures";

describe("reset and deterministic continuation", () => {
  it("resets every phase to byte-equivalent fresh state without advancing the old exercise", () => {
    const initial = createSession(flagship, config);
    const running = started();
    const paused = accept(running, { type: "PAUSE", t: 600, role: "SOLO" });
    const consequence = replayLog(flagship, logFor(pathIntents.A), {
      upToSec: 1740,
    });
    const complete = replayLog(flagship, logFor(pathIntents.A));
    for (const state of [initial, running, paused, consequence, complete]) {
      freeze(state);
      const before = JSON.stringify(state);
      const reset = applyIntent(state, flagship, {
        type: "RESET",
        t: state.nowSec,
        role: "SOLO",
      });
      expect(reset.result).toEqual({
        ok: true,
        value: undefined,
        effects: [{ kind: "PHASE_CHANGED", phase: "IDLE", atSec: 0 }],
      });
      expect(JSON.stringify(reset.state)).toBe(JSON.stringify(initial));
      expect(JSON.stringify(state)).toBe(before);
      expect(reset.state).not.toBe(state);
      const second = accept(reset.state, { type: "RESET", t: 0, role: "SOLO" });
      expect(JSON.stringify(second)).toBe(JSON.stringify(initial));
    }
    const futureReset = applyIntent(running, flagship, {
      type: "RESET",
      t: 9999,
      role: "SOLO",
    });
    expect(futureReset.result.effects).toEqual([
      { kind: "PHASE_CHANGED", phase: "IDLE", atSec: 0 },
    ]);
    expect(JSON.stringify(futureReset.state)).toBe(JSON.stringify(initial));
  });

  it("retains seed, difficulty, mode and aid mode across an authorized reset", () => {
    const options = {
      seed: 99,
      difficultyLevel: 4,
      mode: "NETWORKED",
      aidMode: "AFTER_ESTIMATE",
    } as const;
    const initial = createSession(flagship, options);
    const state = accept(initial, { type: "START", t: 0, role: "INSTRUCTOR" });
    const reset = accept(state, { type: "RESET", t: 100, role: "INSTRUCTOR" });
    expect(JSON.stringify(reset)).toBe(JSON.stringify(initial));
    expect(reset.reports).toEqual(createSession(flagship, config).reports);
  });

  it("replays clone/continue with pending verification and report delivery queues", () => {
    const pending = replayLog(flagship, logFor(pathIntents.A), {
      upToSec: 1320,
    });
    const saved = JSON.stringify(pending);
    const cloned = JSON.parse(saved);
    const first = advanceTo(freeze(pending), flagship, 1740);
    const second = advanceTo(cloned, flagship, 1740);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.state.reports.V01!.status).toBe("DELIVERED");
    expect(first.state.eventTimeline.length).toBeGreaterThan(
      first.state.processedEventCursor,
    );
    expect(JSON.stringify(pending)).toBe(saved);
  });

  it("matches one-shot advancement and effects across many clock chunks", () => {
    const initial = freeze(started());
    const oneShot = advanceTo(initial, flagship, 2160);
    let chunked = initial;
    const effects: EngineEffect[] = [];
    for (let time = 0; time <= 2160; time += 15) {
      const result = advanceTo(chunked, flagship, time);
      chunked = result.state;
      effects.push(...result.effects);
    }
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(oneShot.state));
    expect(effects).toEqual(oneShot.effects);
  });

  it("isolates two interleaved sessions, including event order and verification IDs", () => {
    let first = createSession(flagship, config);
    let second = createSession(flagship, config);
    for (const intent of pathIntents.A) {
      first = accept(first, intent);
      second = accept(second, intent);
    }
    first = advanceTo(first, flagship, 2160).state;
    second = advanceTo(second, flagship, 2160).state;
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.verifications[0]!.id).toBe("V01");
    expect(first.reports.V01!.sequence).toBe(11);
    expect(first.nextEventOrder).toBe(second.nextEventOrder);
  });
});
