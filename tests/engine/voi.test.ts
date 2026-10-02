// @vitest-environment node
import { describe, expect, it } from "vitest";
import { advanceTo, computeBelief, evsi, netVoi } from "../../src/engine";
import { flagship, started } from "./fixtures";

describe("value of information", () => {
  it("matches the reference EVSI and net VOI at 22:00", () => {
    const state = advanceTo(started(), flagship, 1320).state;
    const belief = computeBelief(flagship, state, 1320);
    const dp = flagship.decisionPoints[0]!;
    const uav = flagship.assets.find((asset) => asset.id === "UAV_SORTIE")!;
    const result = netVoi(dp, belief, 1320, uav, flagship.hypotheses);
    expect(result.evsi).toBeCloseTo(31.38, 1);
    expect(result.timeCost).toBe(9);
    expect(result.assetCost).toBe(5);
    expect(result.net).toBeCloseTo(17.38, 1);
    expect(result.feasible).toBe(true);
  });

  it("enforces strict integer-second verification feasibility", () => {
    const state = advanceTo(started(), flagship, 1439).state;
    const belief = computeBelief(flagship, state, 1439);
    const dp = flagship.decisionPoints[0]!;
    const uav = flagship.assets.find((asset) => asset.id === "UAV_SORTIE")!;
    const ford = flagship.assets.find((asset) => asset.id === "FORD_GAUGE")!;
    expect(netVoi(dp, belief, 1439, uav, flagship.hypotheses).feasible).toBe(
      true,
    );
    expect(netVoi(dp, belief, 1440, uav, flagship.hypotheses).feasible).toBe(
      false,
    );
    expect(netVoi(dp, belief, 1499, ford, flagship.hypotheses).feasible).toBe(
      true,
    );
    expect(netVoi(dp, belief, 1500, ford, flagship.hypotheses).feasible).toBe(
      false,
    );
    expect(evsi(dp, belief, 1439, uav, flagship.hypotheses)).toBeGreaterThan(0);
  });
});
