// @vitest-environment node
import { describe, expect, it } from "vitest";
import harbour from "../../src/scenarios/harbour-flood-response.json";
import {
  advanceTo,
  buildAar,
  exportAarDecisionsCsv,
  loadScenario,
  mutateScenario,
  PROFILES,
  replayLog,
  validateRuntimeScenario,
} from "../../src/engine";
import type { Intent } from "../../src/engine";
import { accept, config, logFor, started } from "./fixtures";

const scenario = loadScenario(harbour);
const path: Intent[] = [
  { type: "START", t: 0, role: "SOLO" },
  { type: "VERIFY", t: 720, role: "SOLO", assetId: "DRONE_SWEEP" },
  {
    type: "SET_ESTIMATE",
    t: 1200,
    role: "SOLO",
    hypothesisId: "quay_dry",
    p: 0.2,
  },
  {
    type: "DECIDE",
    t: 1200,
    role: "SOLO",
    actionId: "POSITION_RIDGE",
    rationale: null,
  },
  { type: "VERIFY", t: 1680, role: "SOLO", assetId: "DRONE_SWEEP" },
  {
    type: "SET_ESTIMATE",
    t: 2100,
    role: "SOLO",
    hypothesisId: "quay_dry",
    p: 0.15,
  },
  {
    type: "DECIDE",
    t: 2100,
    role: "SOLO",
    actionId: "ROUTE_VIA_RIDGE",
    rationale: null,
  },
];

describe("synthetic harbour scenario", () => {
  it("implements the exact second-scenario table and one-time normalization", () => {
    expect(validateRuntimeScenario(scenario)).toEqual(scenario);
    expect(scenario.meta).toMatchObject({
      id: "harbour-flood-response",
      synthetic: true,
      durationSec: 2700,
    });
    expect(
      scenario.hypotheses.map((h) => [
        h.id,
        h.prior,
        h.primary,
        h.initialTruth,
      ]),
    ).toEqual([
      ["quay_dry", 0.65, true, true],
      ["ridge_road_open", 0.75, false, true],
    ]);
    expect(scenario.channels.map((c) => c.tauSec)).toEqual([
      1200, 900, 1500, 1800,
    ]);
    expect(scenario.reports.length).toBe(12);
    expect(
      ["LAND", "AIR", "CYBER", "EW"].map(
        (channel) =>
          scenario.reports.filter((r) => r.channel === channel).length,
      ),
    ).toEqual([4, 3, 3, 2]);
    expect(
      scenario.reports.filter((r) => r.hypothesisId === null),
    ).toHaveLength(1);
    expect(
      ["HQ1", "HR1"].map(
        (group) =>
          scenario.reports.filter((r) => r.evidenceGroup === group).length,
      ),
    ).toEqual([2, 2]);
    expect(
      scenario.decisionPoints.map((dp) => [
        dp.openSec,
        dp.closeSec,
        dp.departureSec,
        dp.delayCostPerMin,
      ]),
    ).toEqual([
      [720, 1560, 720, 1.2],
      [1680, 2280, 1680, 1],
    ]);
    expect(
      scenario.decisionPoints.map((dp) =>
        dp.actions.map((a) => a.utility.map((r) => r.value)),
      ),
    ).toEqual([
      [[90, -70], [60, -60], [8]],
      [[80, -60], [55, -55], [5]],
    ]);
    expect(
      scenario.assets.map((a) => [a.id, a.rho, a.delaySec, a.costUnits]),
    ).toEqual([
      ["DRONE_SWEEP", 0.92, 300, 4],
      ["GAUGE_CHECK", 0.88, 240, 3],
    ]);
    expect(() => loadScenario(scenario)).toThrow();
  });

  it("delivers LAND as a burst and exercises noise, delay and dropout", () => {
    const state = advanceTo(started(scenario), scenario, 1440).state;
    expect(state.truth.quay_dry).toBe(false);
    expect(state.reports.H06?.deliveredAtSec).toBe(1200);
    expect(state.reports.H09?.deliveredAtSec).toBe(1200);
    expect(state.reports.H07?.healthAtIssue).toBe(0.5);
    expect(state.reports.H10?.healthAtIssue).toBe(0.5);
    expect(state.reports.H08?.deliveredAtSec).toBe(1260);
    expect(state.reports.H11?.status).toBe("DROPPED");
  });

  it("advances DP1, counts capacity per DP, scores both causal cuts and exports their own metrics", () => {
    let state = started(scenario);
    for (const intent of path.slice(1, 4))
      state = accept(state, intent, scenario);
    expect(state.phase).toBe("RUNNING");
    expect(state.currentDecisionPointIndex).toBe(1);
    for (const intent of path.slice(4)) state = accept(state, intent, scenario);
    expect(
      state.verifications.map((v) => [v.assetId, v.decisionPointId]),
    ).toEqual([
      ["DRONE_SWEEP", "DP1"],
      ["DRONE_SWEEP", "DP2"],
    ]);
    const log = logFor(path, scenario);
    const complete = replayLog(scenario, log);
    expect(complete.phase).toBe("COMPLETE");
    expect(complete.nowSec).toBe(2520);
    const aar = buildAar(scenario, log);
    expect(aar.scenario.difficultyProfile).toEqual(PROFILES[3]);
    expect(
      aar.decisions.map((entry) => entry.decision.decisionPointId),
    ).toEqual(["DP1", "DP2"]);
    expect(aar.decision).toEqual(aar.decisions[1]!.decision);
    expect(aar.truth).toEqual(aar.decisions[1]!.decision.truthAtDecision);
    for (const entry of aar.decisions) {
      expect(entry.decision.truthAtDecision).toEqual({
        quay_dry: false,
        ridge_road_open: true,
      });
      for (const [key, value] of Object.entries(entry.scores)) {
        if (key !== "quadrant" && value !== null)
          expect(Number.isFinite(value)).toBe(true);
      }
    }
    expect(aar.scores.trainingScore).toBe(
      (aar.decisions[0]!.scores.trainingScore +
        aar.decisions[1]!.scores.trainingScore) /
        2,
    );
    const rows = exportAarDecisionsCsv(aar).split("\r\n");
    expect(rows).toHaveLength(3);
    aar.decisions.forEach((entry, index) => {
      expect(rows[index + 1]).toContain(`"${entry.scores.trainingScore}"`);
      expect(rows[index + 1]).toContain(`"${entry.decision.decisionPointId}"`);
    });
    expect(replayLog(scenario, log, { upToSec: 2519 }).phase).toBe(
      "CONSEQUENCE",
    );
    expect(config.difficultyLevel).toBe(3);
  });

  it("keeps each DP's truth at commitment, not later world truth or later same-second estimates", () => {
    const variant = structuredClone(scenario);
    variant.events.push({
      kind: "TRUTH_CHANGE",
      atSec: 1500,
      hypothesisId: "ridge_road_open",
      value: false,
    });
    const intents = [...path];
    intents.splice(4, 0, {
      type: "SET_ESTIMATE",
      t: 1200,
      role: "SOLO",
      hypothesisId: "quay_dry",
      p: 0.99,
    });
    const aar = buildAar(variant, logFor(intents, variant));
    expect(aar.decisions[0]!.decision.truthAtDecision.ridge_road_open).toBe(
      true,
    );
    expect(aar.decisions[1]!.decision.truthAtDecision.ridge_road_open).toBe(
      false,
    );
    expect(aar.decisions[0]!.decision.estimates.final).toBe(0.2);
  });

  it("times out both decision points and still exports one score row per decision", () => {
    const log = logFor([{ type: "START", t: 0, role: "SOLO" }], scenario);
    const completed = replayLog(scenario, log);
    expect(completed.phase).toBe("COMPLETE");
    expect(completed.nowSec).toBe(2460);
    const aar = buildAar(scenario, log);
    expect(
      aar.decisions.map(({ decision }) => [
        decision.actionId,
        decision.atSec,
        decision.timedOut,
      ]),
    ).toEqual([
      ["HOLD_POSITION", 1560, true],
      ["HOLD_ROUTE", 2280, true],
    ]);
    expect(aar.decisions.map(({ scores }) => scores.timeliness)).toEqual([
      0, 0,
    ]);
    expect(exportAarDecisionsCsv(aar).split("\r\n")).toHaveLength(3);
  });

  it("replays accepted DP2 actions after an observed DP1 timeout without needing clock ticks in the log", () => {
    const intents: Intent[] = [
      { type: "START", t: 0, role: "SOLO" },
      { type: "VERIFY", t: 1680, role: "SOLO", assetId: "DRONE_SWEEP" },
      {
        type: "SET_ESTIMATE",
        t: 2100,
        role: "SOLO",
        hypothesisId: "quay_dry",
        p: 0.2,
      },
      {
        type: "DECIDE",
        t: 2100,
        role: "SOLO",
        actionId: "ROUTE_VIA_RIDGE",
        rationale: null,
      },
    ];
    let observed = advanceTo(started(scenario), scenario, 1680).state;
    for (const intent of intents.slice(1))
      observed = accept(observed, intent, scenario);
    observed = advanceTo(observed, scenario, 2520).state;
    expect(replayLog(scenario, logFor(intents, scenario))).toEqual(observed);
  });

  it("allows a variant's legal terminal consequence beyond the unchanged exercise horizon", () => {
    const variant = mutateScenario(scenario, 0, 1);
    const atSec = variant.decisionPoints[1]!.closeSec - 1;
    const log = logFor(
      [
        { type: "START", t: 0, role: "SOLO" },
        {
          type: "SET_ESTIMATE",
          t: atSec,
          role: "SOLO",
          hypothesisId: "quay_dry",
          p: 0.2,
        },
        {
          type: "DECIDE",
          t: atSec,
          role: "SOLO",
          actionId: "ROUTE_VIA_RIDGE",
          rationale: null,
        },
      ],
      variant,
      { difficultyLevel: 1 },
    );
    expect(variant.meta.durationSec).toBe(2700);
    expect(replayLog(variant, log, { upToSec: 2700 }).phase).toBe(
      "CONSEQUENCE",
    );
    expect(replayLog(variant, log).nowSec).toBe(2939);
    expect(buildAar(variant, log).scenario.difficultyProfile).toEqual(
      PROFILES[1],
    );
  });
});
