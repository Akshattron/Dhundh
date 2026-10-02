// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyIntent, replayLog } from "../../src/engine";
import { flagship, logFor, started } from "./fixtures";

describe("local instructor inject intents", () => {
  it("applies scenario data presets immediately and reproduces them from the log", () => {
    const initial = started();
    const injected = applyIntent(initial, flagship, {
      type: "INJECT",
      t: 600,
      role: "INSTRUCTOR",
      presetId: "JAM_LAND",
    });
    expect(injected.result.ok).toBe(true);
    expect(injected.state.channels.LAND).toMatchObject({
      mode: "DELAY",
      health: "DEGRADED",
      extraDelaySec: 360,
      untilSec: 1200,
    });

    const log = logFor([
      { type: "START", t: 0, role: "SOLO" },
      {
        type: "INJECT",
        t: 600,
        role: "INSTRUCTOR",
        presetId: "JAM_LAND",
      },
    ]);
    expect(replayLog(flagship, log, { upToSec: 600 })).toEqual(injected.state);
    const after = replayLog(flagship, log, { upToSec: 1320 });
    expect(after.reports.R06).toMatchObject({
      status: "DELIVERED",
      deliveredAtSec: 1320,
    });
  });

  it("rejects unknown presets and restores links with an authorized forced event", () => {
    const state = applyIntent(started(), flagship, {
      type: "INJECT",
      t: 600,
      role: "INSTRUCTOR",
      presetId: "NOT_A_PRESET",
    });
    expect(state.result).toMatchObject({
      ok: false,
      error: "UNKNOWN_PRESET",
    });
    expect(state.state.nowSec).toBe(0);
    const degraded = applyIntent(started(), flagship, {
      type: "INJECT",
      t: 600,
      role: "INSTRUCTOR",
      presetId: "JAM_LAND",
    });
    const restored = applyIntent(degraded.state, flagship, {
      type: "INJECT",
      t: 660,
      role: "INSTRUCTOR",
      presetId: "RESTORE_ALL",
    });
    expect(restored.state.channels.LAND.health).toBe("HEALTHY");
  });

  it("drains a preset at the frozen instant while paused", () => {
    let state = started();
    state = applyIntent(state, flagship, {
      type: "PAUSE",
      t: 600,
      role: "SOLO",
    }).state;
    const result = applyIntent(state, flagship, {
      type: "INJECT",
      t: 600,
      role: "INSTRUCTOR",
      presetId: "FALSE_NORTH_CLEAR",
    });
    expect(result.result.ok).toBe(true);
    expect(result.state.phase).toBe("PAUSED");
    expect(Object.values(result.state.reports)).toContainEqual(
      expect.objectContaining({
        origin: "INJECT",
        status: "DELIVERED",
        def: expect.objectContaining({
          claim: expect.stringContaining("reported clear"),
        }),
      }),
    );
  });
});
