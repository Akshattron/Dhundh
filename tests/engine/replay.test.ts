// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyIntent, createSession, replayLog } from "../../src/engine";
import { buildFrames } from "../../src/engine/replay";
import type { Intent } from "../../src/engine";
import { pathIntents } from "../golden/flagship.expected";
import { config, flagship, freeze, logFor, started } from "./fixtures";

describe("causal replay", () => {
  it("builds an ordered capped replay with a separate decision-time cut", () => {
    const log = logFor(pathIntents.B);
    const frames = buildFrames(flagship, log);
    expect(frames.length).toBeLessThanOrEqual(80);
    expect(frames).toEqual(
      [...frames].sort((left, right) => {
        const timeOrder = left.atSec - right.atSec;
        if (timeOrder !== 0) return timeOrder;
        if (left.cut === right.cut) return 0;
        return left.cut === "DECISION" ? -1 : 1;
      }),
    );
    const decision = frames.find((frame) => frame.cut === "DECISION");
    const committed = frames.find(
      (frame) => frame.cut === "STATE" && frame.atSec === decision?.atSec,
    );
    expect(decision?.trainee.decided).toBe(false);
    expect(committed?.trainee.decided).toBe(true);
    expect(decision?.belief).not.toBeNull();
    expect(JSON.stringify(log)).toBe(JSON.stringify(logFor(pathIntents.B)));
  });

  it("keeps the decision and terminal frame when sampling dense event times", () => {
    const start = pathIntents.B[0];
    if (!start || start.type !== "START") throw new Error("Path B must start");
    const injects: Intent[] = Array.from({ length: 100 }, (_, index) => ({
      type: "INJECT",
      t: index + 1,
      role: "INSTRUCTOR",
      presetId: "RESTORE_ALL",
    }));
    const base = pathIntents.B.slice(1) as Intent[];
    const frames = buildFrames(flagship, logFor([start, ...injects, ...base]));
    expect(frames).toHaveLength(80);
    expect(frames.some((frame) => frame.cut === "DECISION")).toBe(true);
    expect(
      frames.some(
        (frame) => frame.cut === "STATE" && frame.phase === "COMPLETE",
      ),
    ).toBe(true);
  });

  it("uses an explicit horizon beyond the last intent, not the last intent time", () => {
    const state = replayLog(flagship, logFor(pathIntents.E), { upToSec: 1320 });
    expect(state).toMatchObject({ nowSec: 1320, phase: "RUNNING" });
    expect(state.reports.R06!.status).toBe("DELIVERED");
    expect(state.decisions).toEqual([]);
    expect(replayLog(flagship, logFor(pathIntents.E)).phase).toBe("COMPLETE");
  });

  it("preserves inclusive intent indices and the causal order within a second", () => {
    const log = freeze(logFor(pathIntents.A));
    const beforeTask = replayLog(flagship, log, {
      upToSec: 1320,
      upToIntentIndex: 7,
    });
    const afterTask = replayLog(flagship, log, {
      upToSec: 1320,
      upToIntentIndex: 8,
    });
    expect(
      beforeTask.inspections.some((record) => record.reportId === "R06"),
    ).toBe(true);
    expect(beforeTask.verifications).toEqual([]);
    expect(afterTask.verifications).toHaveLength(1);
    expect(replayLog(flagship, log, { upToSec: 1320 })).toEqual(afterTask);
    const beforeDecision = replayLog(flagship, log, {
      upToSec: 1740,
      upToIntentIndex: 11,
    });
    const afterDecision = replayLog(flagship, log, {
      upToSec: 1740,
      upToIntentIndex: 12,
    });
    expect(beforeDecision.phase).toBe("RUNNING");
    expect(afterDecision.phase).toBe("CONSEQUENCE");
    expect(afterDecision.decisions[0]!.estimates).toEqual({ north_pass: 0.25 });
  });

  it("rejects a horizon before a selected intent, out-of-range indices, and missing horizons", () => {
    const log = logFor(pathIntents.A);
    expect(() =>
      replayLog(flagship, log, { upToSec: 1319, upToIntentIndex: 8 }),
    ).toThrow("precedes");
    expect(() =>
      replayLog(flagship, log, { upToSec: 1320, upToIntentIndex: 99 }),
    ).toThrow("outside");
    expect(() =>
      replayLog(flagship, log, { upToSec: 1320, upToIntentIndex: -1 }),
    ).toThrow();
    expect(() =>
      replayLog(flagship, log, JSON.parse('{"upToIntentIndex":0}')),
    ).toThrow();
    expect(() => replayLog(flagship, log, { upToSec: 0.5 })).toThrow();
  });

  it("does not sort a malformed log into validity", () => {
    const log = freeze(
      logFor([
        { type: "START", t: 0, role: "SOLO" },
        { type: "OPEN_REPORT", t: 600, role: "SOLO", reportId: "R01" },
        { type: "OPEN_REPORT", t: 300, role: "SOLO", reportId: "R02" },
      ]),
    );
    const before = JSON.stringify(log);
    expect(() => replayLog(flagship, log)).toThrow("backdated");
    expect(() => replayLog(flagship, log, { upToSec: 0 })).toThrow("backdated");
    expect(JSON.stringify(log)).toBe(before);
  });

  it("validates scenario identity, hash, configuration, roles, and accepted-only history", () => {
    const log = logFor(pathIntents.E);
    for (const change of [
      { scenarioId: "missing" },
      { scenarioVersion: 99 },
      { scenarioHash: "00000000" },
      { difficultyLevel: 9 },
      { seed: NaN },
    ]) {
      expect(() => replayLog(flagship, { ...log, ...change })).toThrow();
    }
    expect(() =>
      replayLog(
        flagship,
        logFor([{ type: "START", t: 0, role: "COMMANDER" }], flagship, {
          mode: "NETWORKED",
        }),
      ),
    ).toThrow("forbidden role");
    expect(() =>
      replayLog(
        flagship,
        logFor([
          ...pathIntents.E,
          { type: "OPEN_REPORT", t: 720, role: "SOLO", reportId: "MISSING" },
        ]),
      ),
    ).toThrow("not accepted: UNKNOWN_REPORT");
    expect(() =>
      replayLog(
        flagship,
        logFor([...pathIntents.E, { type: "RESET", t: 720, role: "SOLO" }]),
      ),
    ).toThrow("fresh exercise log");
  });

  it("reconstructs progression accompanying a rejected action from accepted intents plus horizon", () => {
    const result = applyIntent(started(), flagship, {
      type: "OPEN_REPORT",
      t: 1320,
      role: "SOLO",
      reportId: "MISSING",
    });
    expect(result.result.ok).toBe(false);
    const replay = replayLog(flagship, logFor(pathIntents.E), {
      upToSec: 1320,
    });
    expect(JSON.stringify(replay)).toBe(JSON.stringify(result.state));
  });

  it("replays late legal consequences past the unchanged exercise horizon", () => {
    const intents: Intent[] = [
      ...pathIntents.E,
      {
        type: "SET_ESTIMATE",
        t: 1799,
        role: "SOLO",
        hypothesisId: "north_pass",
        p: 0.5,
      },
      {
        type: "DECIDE",
        t: 1799,
        role: "SOLO",
        actionId: "GO_SOUTH",
        rationale: null,
      },
    ];
    const log = logFor(intents);
    const partial = replayLog(flagship, log, { upToSec: 2160 });
    expect(partial).toMatchObject({
      phase: "CONSEQUENCE",
      nowSec: 2160,
      consequenceRevealAtSec: 2219,
    });
    expect(replayLog(flagship, log, { upToSec: 2218 }).phase).toBe(
      "CONSEQUENCE",
    );
    expect(replayLog(flagship, log)).toMatchObject({
      phase: "COMPLETE",
      nowSec: 2219,
    });
    expect(flagship.meta.durationSec).toBe(2160);
  });

  it("leaves IDLE and PAUSED logs incomplete instead of manufacturing a completion", () => {
    expect(replayLog(flagship, logFor([]))).toEqual(
      createSession(flagship, config),
    );
    const paused = logFor([
      ...pathIntents.E,
      { type: "PAUSE", t: 600, role: "SOLO" },
    ]);
    expect(replayLog(flagship, paused)).toMatchObject({
      phase: "PAUSED",
      nowSec: 600,
    });
    expect(replayLog(flagship, paused, { upToSec: 9999 })).toMatchObject({
      phase: "PAUSED",
      nowSec: 600,
    });
    const resumed = logFor([
      ...paused.intents,
      { type: "RESUME", t: 600, role: "SOLO" },
    ]);
    expect(replayLog(flagship, resumed)).toMatchObject({
      phase: "COMPLETE",
      nowSec: 1980,
    });
  });

  it("records a network-mode timeout as Commander without implementing a network adapter", () => {
    const log = logFor(
      [{ type: "START", t: 0, role: "INSTRUCTOR" }],
      flagship,
      { mode: "NETWORKED" },
    );
    const state = replayLog(flagship, log);
    expect(state.decisions[0]).toMatchObject({
      role: "COMMANDER",
      timedOut: true,
      actionId: "STAND_DOWN",
    });
  });
});
