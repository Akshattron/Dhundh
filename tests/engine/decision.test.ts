// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  advanceTo,
  computeBelief,
  evaluateDecision,
  expectedUtilities,
  realizedUtility,
} from "../../src/engine";
import { flagship, started } from "./fixtures";

describe("decision mathematics", () => {
  it("enumerates joint states and matches flagship utilities, tie, regret, and EVPI", () => {
    const state = advanceTo(started(), flagship, 1320).state;
    const belief = computeBelief(flagship, state, 1320);
    const dp = flagship.decisionPoints[0]!;
    const eu = expectedUtilities(dp, belief, 1320, flagship.hypotheses);
    expect(eu.GO_NORTH).toBeCloseTo(37.7, 1);
    expect(eu.GO_SOUTH).toBeCloseTo(37.7, 1);
    expect(eu.STAND_DOWN).toBeCloseTo(10, 12);
    const evaluation = evaluateDecision(
      dp,
      belief,
      1320,
      flagship.hypotheses,
      "GO_NORTH",
      flagship.model,
    );
    expect(evaluation.isTie).toBe(true);
    expect(evaluation.bestActionId).toBe("GO_NORTH");
    expect(evaluation.regret).toBe(0);
    expect(evaluation.maxRegret).toBeCloseTo(27.7, 1);
    expect(evaluation.evpi).toBeCloseTo(38.05, 1);
  });

  it("keeps the mathematical maximum distinct from display tie ordering", () => {
    const scenario = structuredClone(flagship);
    const dp = scenario.decisionPoints[0]!;
    dp.actions[0]!.utility = [{ when: {}, value: 10 }];
    dp.actions[1]!.utility = [{ when: {}, value: 10.04 }];
    dp.actions[2]!.utility = [{ when: {}, value: 0 }];
    const state = advanceTo(started(scenario), scenario, 0).state;
    const belief = computeBelief(scenario, state, 0);
    const evaluation = evaluateDecision(
      dp,
      belief,
      0,
      scenario.hypotheses,
      "GO_NORTH",
      scenario.model,
    );
    expect(evaluation.isTie).toBe(true);
    expect(evaluation.bestActionId).toBe("GO_NORTH");
    expect(evaluation.regret).toBeCloseTo(0.04, 12);
  });

  it("defines decision quality as sound and EVPI as zero when all actions tie", () => {
    const scenario = structuredClone(flagship);
    const dp = scenario.decisionPoints[0]!;
    for (const action of dp.actions) {
      action.utility = [{ when: {}, value: 20 }];
    }
    const state = advanceTo(started(scenario), scenario, dp.openSec).state;
    const belief = computeBelief(scenario, state, dp.openSec);
    const evaluation = evaluateDecision(
      dp,
      belief,
      dp.openSec,
      scenario.hypotheses,
      "GO_NORTH",
      scenario.model,
    );
    expect(evaluation.maxRegret).toBe(0);
    expect(evaluation.dq).toBe(1);
    expect(evaluation.evpi).toBe(0);
  });

  it("applies delay costs and computes realized utility from the selected truth", () => {
    const dp = flagship.decisionPoints[0]!;
    expect(
      realizedUtility(
        dp,
        { north_pass: false, south_ford: true },
        "GO_SOUTH",
        1740,
      ),
    ).toBeCloseTo(44.5, 12);
    expect(
      realizedUtility(
        dp,
        { north_pass: false, south_ford: true },
        "STAND_DOWN",
        1740,
      ),
    ).toBe(10);
  });
});
