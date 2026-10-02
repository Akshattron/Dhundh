// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  advanceTo,
  createSession,
  replayLog,
  scenarioHash,
} from "../../src/engine";
import {
  accept,
  config,
  flagship,
  freeze,
  logFor,
  started,
} from "../engine/fixtures";
import {
  completionTimes,
  pathIntents,
  reportTimeline,
} from "./flagship.expected";

describe("FLAGSHIP_DEMO Gate 1 chronology", () => {
  it("matches every Section 18.3 delivery/drop anchor exactly", () => {
    const result = advanceTo(started(), flagship, 1980);
    expect(
      reportTimeline.map(({ id }) => {
        const report = result.state.reports[id]!;
        return {
          id,
          issuedAtSec: report.def.issuedAtSec,
          deliveredAtSec: report.deliveredAtSec,
          status: report.status,
        };
      }),
    ).toEqual(reportTimeline);
    const deliveries = result.effects.filter(
      (effect) => effect.kind === "REPORT_DELIVERED",
    );
    expect(deliveries).toHaveLength(10);
    expect(new Set(deliveries.map((effect) => effect.reportId)).size).toBe(10);
    expect(
      result.effects.filter((effect) => effect.kind === "REPORT_DROPPED"),
    ).toEqual([{ kind: "REPORT_DROPPED", reportId: "R10", atSec: 1200 }]);
    expect(scenarioHash(flagship)).toBe("1f7af0fb");
  });

  it.each(["A", "B", "C", "D", "E"] as const)(
    "replays the authoritative Path %s intents through its actual consequence",
    (path) => {
      const log = freeze(logFor(pathIntents[path]));
      let live = createSession(flagship, config);
      for (const intent of log.intents) live = accept(live, intent);
      live = advanceTo(live, flagship, completionTimes[path]).state;
      const replay = replayLog(flagship, log);
      expect(JSON.stringify(replay)).toBe(JSON.stringify(live));
      expect(replay.phase).toBe("COMPLETE");
      expect(replay.nowSec).toBe(completionTimes[path]);
      expect(replay.decisions).toHaveLength(1);
      expect(replay.decisions[0]!.timedOut).toBe(path === "E");
      expect(replay.decisions[0]!.role).toBe("SOLO");
    },
  );

  it("Path A preserves verification, cited rationale, final estimate, and the 36:00 reveal", () => {
    const state = replayLog(flagship, logFor(pathIntents.A));
    expect(state.verifications).toEqual([
      {
        id: "V01",
        assetId: "UAV_SORTIE",
        hypothesisId: "north_pass",
        requestedAtSec: 1320,
        deliversAtSec: 1680,
        costUnits: 5,
        resultReportId: "V01",
        role: "SOLO",
        decisionPointId: "DP1",
      },
    ]);
    expect(state.reports.V01).toMatchObject({
      origin: "VERIFY",
      status: "DELIVERED",
      healthAtIssue: 1,
      def: {
        stance: -1,
        issuedAtSec: 1680,
        rho: 0.95,
        evidenceGroup: "GV-V01",
      },
    });
    expect(state.decisions[0]).toEqual({
      decisionPointId: "DP1",
      atSec: 1740,
      actionId: "GO_SOUTH",
      role: "SOLO",
      timedOut: false,
      estimates: { north_pass: 0.25 },
      consultedAid: true,
      rationale: {
        text: "Rockfall report plus the sortie result outweigh the stale clear reports.",
        citedReportIds: ["R06", "V01"],
        tags: ["WEIGHED_CONTRADICTION", "AWAITED_VERIFICATION"],
      },
    });
    expect(state.consequenceRevealAtSec).toBe(2160);
  });

  it("Path E completes at 33:00 even when START is the only logged intent", () => {
    const state = replayLog(flagship, logFor(pathIntents.E));
    expect(state.decisions[0]).toMatchObject({
      atSec: 1800,
      actionId: "STAND_DOWN",
      timedOut: true,
      rationale: null,
      estimates: {},
    });
    expect(state.nowSec).toBe(1980);
  });

  it("Path F is byte-identical for equal seeds and behavior-identical for different seeds", () => {
    const first = replayLog(flagship, logFor(pathIntents.A));
    const second = replayLog(flagship, logFor(pathIntents.A));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const { seed: firstSeed, ...firstBehavior } = first;
    const { seed: secondSeed, ...secondBehavior } = replayLog(
      flagship,
      logFor(pathIntents.A, flagship, { seed: 12345 }),
    );
    expect(firstSeed).not.toBe(secondSeed);
    expect(JSON.stringify(firstBehavior)).toBe(JSON.stringify(secondBehavior));
  });
});
