// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  advanceTo,
  applyIntent,
  validateRuntimeScenario,
} from "../../src/engine";
import { accept, flagship, freeze, started } from "./fixtures";

describe("verification foundation", () => {
  it.each([
    ["UAV_SORTIE", 1439, 1440],
    ["FORD_GAUGE", 1499, 1500],
  ] as const)(
    "enforces the exact last legal request second for %s",
    (assetId, legal, illegal) => {
      const initial = freeze(started());
      const accepted = applyIntent(initial, flagship, {
        type: "VERIFY",
        role: "SOLO",
        t: legal,
        assetId,
      });
      expect(accepted.result.ok).toBe(true);
      expect(accepted.state.verifications[0]!.deliversAtSec).toBe(1799);
      expect(
        advanceTo(accepted.state, flagship, 1798).state.reports.V01!.status,
      ).toBe("IN_TRANSIT");
      expect(
        advanceTo(accepted.state, flagship, 1799).state.reports.V01!.status,
      ).toBe("DELIVERED");
      const rejected = applyIntent(initial, flagship, {
        type: "VERIFY",
        role: "SOLO",
        t: illegal,
        assetId,
      });
      expect(rejected.result).toMatchObject({ error: "VERIFY_TOO_LATE" });
      expect(rejected.state.nowSec).toBe(illegal);
      expect(rejected.state.verifications).toEqual([]);
      expect(rejected.state.nextSequence).toBe(initial.nextSequence);
      expect(Object.hasOwn(rejected.state.reports, "V01")).toBe(false);
    },
  );

  it("rejects pre-window requests and preserves a timeout on a request at close", () => {
    const state = started();
    expect(
      applyIntent(state, flagship, {
        type: "VERIFY",
        role: "SOLO",
        t: 719,
        assetId: "UAV_SORTIE",
      }).result,
    ).toMatchObject({ error: "WINDOW_NOT_OPEN" });
    const closed = applyIntent(state, flagship, {
      type: "VERIFY",
      role: "SOLO",
      t: 1800,
      assetId: "UAV_SORTIE",
    });
    expect(closed.result).toMatchObject({ error: "WINDOW_CLOSED" });
    expect(closed.state.decisions[0]).toMatchObject({ timedOut: true });
    expect(closed.state.verifications).toEqual([]);
  });

  it("allows each route's asset, charges each accepted task once, and rejects exhausted capacity", () => {
    let state = accept(started(), {
      type: "VERIFY",
      t: 720,
      role: "SOLO",
      assetId: "UAV_SORTIE",
    });
    state = accept(state, {
      type: "VERIFY",
      t: 720,
      role: "SOLO",
      assetId: "FORD_GAUGE",
    });
    freeze(state);
    expect(
      state.verifications.map((record) => [record.id, record.costUnits]),
    ).toEqual([
      ["V01", 5],
      ["V02", 3],
    ]);
    const rejected = applyIntent(state, flagship, {
      type: "VERIFY",
      t: 720,
      role: "SOLO",
      assetId: "UAV_SORTIE",
    });
    expect(rejected.result).toEqual({
      ok: false,
      error: "ASSET_EXHAUSTED",
      message: "Verification asset capacity is exhausted",
      effects: [],
    });
    expect(rejected.state).toBe(state);
    expect(
      rejected.state.verifications.reduce(
        (sum, record) => sum + record.costUnits,
        0,
      ),
    ).toBe(8);
    expect(advanceTo(state, flagship, 1800).state.verifications).toEqual(
      state.verifications,
    );
  });

  it("uses request-cut truth and a dedicated link even if the routine channel drops at delivery", () => {
    const requested = accept(started(), {
      type: "VERIFY",
      t: 720,
      role: "SOLO",
      assetId: "UAV_SORTIE",
    });
    expect(requested.truth.north_pass).toBe(true);
    expect(requested.reports.V01).toMatchObject({
      status: "IN_TRANSIT",
      healthAtIssue: 1,
      deliveredAtSec: 1080,
      def: {
        issuedAtSec: 1080,
        stance: 1,
        claim: "Sortie confirms Veer Pass clear",
      },
    });
    const result = advanceTo(requested, flagship, 1080);
    expect(result.state.channels.AIR.mode).toBe("DROPOUT");
    expect(result.state.truth.north_pass).toBe(false);
    expect(result.state.reports.V01).toMatchObject({
      status: "DELIVERED",
      healthAtIssue: 1,
      def: { stance: 1 },
    });
    expect(result.effects.filter((effect) => effect.atSec === 1080)).toEqual([
      { kind: "CHANNEL_CHANGED", channel: "AIR", atSec: 1080 },
      { kind: "REPORT_DELIVERED", reportId: "V01", atSec: 1080 },
    ]);
  });

  it("never adds routine LAND delay to a dedicated Ford result", () => {
    const requested = accept(started(), {
      type: "VERIFY",
      t: 960,
      role: "SOLO",
      assetId: "FORD_GAUGE",
    });
    expect(requested.channels.LAND.mode).toBe("DELAY");
    expect(requested.verifications[0]!.deliversAtSec).toBe(1260);
    expect(advanceTo(requested, flagship, 1260).state.reports.V01!.status).toBe(
      "DELIVERED",
    );
  });

  it("keeps the cost of a task whose result arrives after commitment", () => {
    let state = accept(started(), {
      type: "VERIFY",
      t: 720,
      role: "SOLO",
      assetId: "UAV_SORTIE",
    });
    state = accept(state, {
      type: "SET_ESTIMATE",
      t: 780,
      role: "SOLO",
      hypothesisId: "north_pass",
      p: 0.9,
    });
    state = accept(state, {
      type: "DECIDE",
      t: 780,
      role: "SOLO",
      actionId: "GO_NORTH",
      rationale: null,
    });
    expect(state.reports.V01!.status).toBe("IN_TRANSIT");
    expect(state.verifications[0]!.costUnits).toBe(5);
    const completed = advanceTo(state, flagship, 1080).state;
    expect(completed.phase).toBe("COMPLETE");
    expect(completed.verifications).toEqual(state.verifications);
    expect(completed.decisions).toEqual(state.decisions);
  });

  it("drains a zero-delay result before the next same-second intent", () => {
    const scenario = structuredClone(flagship);
    scenario.assets[0]!.delaySec = 0;
    const state = accept(
      started(scenario),
      { type: "VERIFY", t: 720, role: "SOLO", assetId: "UAV_SORTIE" },
      scenario,
    );
    expect(state.reports.V01!.status).toBe("DELIVERED");
    expect(
      accept(
        state,
        { type: "OPEN_REPORT", t: 720, role: "SOLO", reportId: "V01" },
        scenario,
      ).inspections,
    ).toHaveLength(1);
  });

  it("reproduces STOCHASTIC verification from the per-verification seeded stream", () => {
    const scenario = { ...flagship, verifyOutcomeMode: "STOCHASTIC" } as const;
    const stance = (seed: number) =>
      accept(
        started(scenario, { seed }),
        { type: "VERIFY", t: 720, role: "SOLO", assetId: "UAV_SORTIE" },
        scenario,
      ).reports.V01!.def.stance;
    const first = Array.from({ length: 100 }, (_, seed) => stance(seed));
    expect(Array.from({ length: 100 }, (_, seed) => stance(seed))).toEqual(
      first,
    );
    expect(new Set(first)).toEqual(new Set([-1, 1]));
  });

  it("allocates collision-free deterministic result IDs", () => {
    const scenario = structuredClone(flagship);
    scenario.reports[0]!.id = "V01";
    const issue = scenario.events.find(
      (event) => event.kind === "REPORT_ISSUE" && event.reportId === "R01",
    );
    if (issue?.kind !== "REPORT_ISSUE")
      throw new Error("Missing fixture event");
    issue.reportId = "V01";
    const state = accept(
      started(validateRuntimeScenario(scenario)),
      { type: "VERIFY", t: 720, role: "SOLO", assetId: "UAV_SORTIE" },
      scenario,
    );
    expect(state.reports.V01!.origin).toBe("SCENARIO");
    expect(state.verifications[0]!.resultReportId).toBe("V02");
    expect(state.reports.V02!.origin).toBe("VERIFY");
  });

  it("scopes capacity to the current decision point without registering a second scenario", () => {
    const scenario = structuredClone(flagship);
    scenario.meta.durationSec = 2940;
    scenario.decisionPoints.push({
      ...structuredClone(scenario.decisionPoints[0]!),
      id: "DP2",
      openSec: 1800,
      closeSec: 2880,
      departureSec: 1800,
    });
    let state = started(validateRuntimeScenario(scenario));
    state = accept(
      state,
      { type: "VERIFY", t: 720, role: "SOLO", assetId: "UAV_SORTIE" },
      scenario,
    );
    state = accept(
      state,
      {
        type: "SET_ESTIMATE",
        t: 720,
        role: "SOLO",
        hypothesisId: "north_pass",
        p: 0.5,
      },
      scenario,
    );
    state = accept(
      state,
      {
        type: "DECIDE",
        t: 720,
        role: "SOLO",
        actionId: "STAND_DOWN",
        rationale: null,
      },
      scenario,
    );
    expect(state).toMatchObject({
      currentDecisionPointIndex: 1,
      phase: "RUNNING",
      consequenceRevealAtSec: null,
    });
    state = accept(
      state,
      { type: "VERIFY", t: 1800, role: "SOLO", assetId: "UAV_SORTIE" },
      scenario,
    );
    expect(state.verifications.map((record) => record.decisionPointId)).toEqual(
      ["DP1", "DP2"],
    );
    expect(state.verifications.map((record) => record.resultReportId)).toEqual([
      "V01",
      "V02",
    ]);
    state = advanceTo(state, scenario, 3060).state;
    expect(
      state.decisions.map((record) => [
        record.decisionPointId,
        record.timedOut,
      ]),
    ).toEqual([
      ["DP1", false],
      ["DP2", true],
    ]);
    expect(state.phase).toBe("COMPLETE");
  });
});
