// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  advanceTo,
  createSession,
  validateRuntimeScenario,
} from "../../src/engine";
import {
  createChannels,
  degradeChannel,
  restoreChannel,
} from "../../src/engine/channels";
import { issueReport } from "../../src/engine/degradation";
import { readEvent } from "../../src/engine/events";
import { config, flagship, freeze, started } from "./fixtures";

describe("channel and report lifecycle", () => {
  it("creates independent healthy channels and restores without losing last contact", () => {
    const channels = createChannels();
    expect(Object.keys(channels)).toEqual(["LAND", "AIR", "CYBER", "EW"]);
    expect(
      Object.values(channels).every(
        (channel) =>
          channel.mode === "HEALTHY" && channel.healthMultiplier === 1,
      ),
    ).toBe(true);
    const changed = degradeChannel(
      freeze({ ...channels.LAND, lastDeliveredAtSec: 180 }),
      {
        kind: "CHANNEL_DEGRADE",
        atSec: 600,
        untilSec: 1200,
        channel: "LAND",
        mode: "DELAY",
        extraDelaySec: 360,
        note: "Synthetic delay",
      },
    );
    expect(changed).toMatchObject({
      mode: "DELAY",
      health: "DEGRADED",
      untilSec: 1200,
    });
    expect(restoreChannel(changed, 1199)).toBe(changed);
    expect(restoreChannel(changed, 1200)).toEqual({
      ...channels.LAND,
      lastDeliveredAtSec: 180,
    });
    expect(restoreChannel(changed, 601, true)).toEqual({
      ...channels.LAND,
      lastDeliveredAtSec: 180,
    });
    expect(createChannels().LAND.mode).toBe("HEALTHY");
    expect(() =>
      degradeChannel(channels.LAND, {
        kind: "CHANNEL_DEGRADE",
        atSec: 600,
        untilSec: 1200,
        channel: "LAND",
        mode: "NOISE",
        note: "Missing multiplier",
      }),
    ).toThrow("parameters");
  });

  it("processes degradation at issue and restoration before a same-second issue", () => {
    let state = advanceTo(started(), flagship, 959).state;
    expect(state.channels.LAND.mode).toBe("HEALTHY");
    state = advanceTo(state, flagship, 960).state;
    expect(state.channels.LAND.mode).toBe("DELAY");
    expect(state.reports.R06).toMatchObject({
      status: "IN_TRANSIT",
      deliveredAtSec: 1320,
    });
    state = advanceTo(state, flagship, 1080).state;
    expect(state.channels.AIR).toMatchObject({
      mode: "DROPOUT",
      health: "DOWN",
    });
    const restored = advanceTo(state, flagship, 1440);
    expect(restored.state.channels.AIR.mode).toBe("HEALTHY");
    expect(restored.state.reports.R07!.status).toBe("DELIVERED");
    expect(restored.effects.filter((effect) => effect.atSec === 1440)).toEqual([
      { kind: "CHANNEL_CHANGED", channel: "AIR", atSec: 1440 },
      { kind: "REPORT_DELIVERED", reportId: "R07", atSec: 1440 },
    ]);
  });

  it("ignores stale automatic restores and never retimes an already-issued delayed report", () => {
    const scenario = structuredClone(flagship);
    scenario.events.push(
      {
        kind: "CHANNEL_DEGRADE",
        atSec: 1080,
        untilSec: 1680,
        channel: "LAND",
        mode: "DROPOUT",
        note: "Synthetic overlapping dropout",
      },
      { kind: "CHANNEL_RESTORE", atSec: 1680, channel: "LAND" },
    );
    const result = advanceTo(
      started(validateRuntimeScenario(scenario)),
      scenario,
      1560,
    );
    expect(result.state.channels.LAND).toMatchObject({
      mode: "DROPOUT",
      untilSec: 1680,
    });
    expect(result.state.reports.R06).toMatchObject({
      status: "DELIVERED",
      deliveredAtSec: 1320,
      healthAtIssue: 1,
    });
    expect(result.effects).not.toContainEqual({
      kind: "CHANNEL_CHANGED",
      channel: "LAND",
      atSec: 1560,
    });
    expect(
      advanceTo(result.state, scenario, 1680).state.channels.LAND.mode,
    ).toBe("HEALTHY");
  });

  it("keeps BURST deliveries fixed at the restore time known at issue", () => {
    const scenario = structuredClone(flagship);
    const burst = scenario.events.find(
      (event) => event.kind === "CHANNEL_DEGRADE" && event.channel === "LAND",
    );
    if (burst?.kind !== "CHANNEL_DEGRADE")
      throw new Error("Missing fixture degradation");
    burst.mode = "BURST";
    delete burst.extraDelaySec;
    scenario.events.push(
      {
        kind: "CHANNEL_DEGRADE",
        atSec: 1410,
        untilSec: 1680,
        channel: "LAND",
        mode: "NOISE",
        healthMultiplier: 0.5,
        note: "Synthetic replacement",
      },
      { kind: "CHANNEL_RESTORE", atSec: 1680, channel: "LAND" },
    );
    let state = advanceTo(
      started(validateRuntimeScenario(scenario)),
      scenario,
      1500,
    ).state;
    expect(state.reports.R06).toMatchObject({
      status: "IN_TRANSIT",
      deliveredAtSec: 1560,
    });
    expect(state.reports.R09).toMatchObject({
      status: "IN_TRANSIT",
      deliveredAtSec: 1560,
    });
    expect(state.reports.R11).toMatchObject({
      status: "DELIVERED",
      deliveredAtSec: 1500,
      healthAtIssue: 0.5,
    });
    state = advanceTo(state, scenario, 1560).state;
    expect(state.channels.LAND.mode).toBe("NOISE");
    expect(state.reports.R06!.status).toBe("DELIVERED");
    expect(state.reports.R09!.status).toBe("DELIVERED");
    const restored = advanceTo(state, scenario, 1680).state;
    expect(restored.channels.LAND.healthMultiplier).toBe(1);
    expect(restored.reports.R11!.healthAtIssue).toBe(0.5);
  });

  it("drops terminally without scheduling delivery, including BURST without a restoration", () => {
    const state = advanceTo(started(), flagship, 1980).state;
    expect(state.reports.R10).toMatchObject({
      status: "DROPPED",
      deliveredAtSec: null,
      droppedReason: "DROPOUT",
    });
    expect(
      state.eventTimeline
        .map(readEvent)
        .some(
          (event) =>
            event.kind === "REPORT_DELIVER" && event.reportId === "R10",
        ),
    ).toBe(false);
    const report = freeze(createSession(flagship, config).reports.R01!);
    const channel = { ...createChannels().LAND, mode: "BURST" } as const;
    const dropped = issueReport(report, channel, 0, 180);
    expect(dropped).toMatchObject({
      status: "DROPPED",
      deliveredAtSec: null,
      droppedReason: "DROPOUT",
    });
    expect(issueReport(dropped, createChannels().LAND, 0, 180)).toBe(dropped);
    expect(report.status).toBe("SCHEDULED");
  });

  it("honors base delay and cannot reissue or retime a report already in transit", () => {
    const report = freeze(createSession(flagship, config).reports.R01!);
    const channel = createChannels().LAND;
    const issued = issueReport(report, channel, 60, 180);
    expect(issued).toMatchObject({
      status: "IN_TRANSIT",
      deliveredAtSec: 240,
      healthAtIssue: 1,
    });
    expect(issueReport(issued, { ...channel, mode: "DROPOUT" }, 999, 181)).toBe(
      issued,
    );
    expect(() => issueReport(report, channel, 0.5, 180)).toThrow(
      "integer second",
    );
  });
});
