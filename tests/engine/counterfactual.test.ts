// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildAar } from "../../src/engine/aar";
import { COUNTERFACTUAL_LABEL } from "../../src/engine/counterfactual";
import { flagship, logFor } from "./fixtures";
import { pathIntents } from "../golden/flagship.expected";

describe("P1 counterfactual analysis", () => {
  it("reconstructs dropped and late information without mutating the actual log", () => {
    const log = logFor(pathIntents.B);
    const before = JSON.stringify(log);
    const aar = buildAar(flagship, log);

    const noLoss = aar.counterfactuals.find((item) => item.id === "CF_NO_LOSS");
    expect(noLoss).toMatchObject({
      id: "CF_NO_LOSS",
      choiceChanged: true,
      bestActionId: "GO_SOUTH",
    });
    if (noLoss?.id !== "CF_NO_LOSS") throw new Error("Missing no-loss result");
    expect(noLoss.belief.north_pass).toBeLessThan(0.5);
    expect(
      aar.information.dropped[0]?.whatIfBeliefAtDecision?.north_pass,
    ).toBeGreaterThan(0.5);
    expect(
      aar.information.lateOrAfterDecision.find(
        (report) => report.reportId === "R11",
      )?.whatIfBeliefAtDecision?.north_pass,
    ).toBeLessThan(0.5);
    expect(JSON.stringify(log)).toBe(before);
  });

  it("offers every action and the earliest worthwhile verification branch", () => {
    const aar = buildAar(flagship, logFor(pathIntents.B));
    const actions = aar.counterfactuals.find(
      (item) => item.id === "CF_ACTIONS",
    );
    expect(actions?.id).toBe("CF_ACTIONS");
    if (actions?.id !== "CF_ACTIONS") throw new Error("Missing action results");
    expect(actions.alternatives.map((item) => item.actionId)).toEqual([
      "GO_NORTH",
      "GO_SOUTH",
      "STAND_DOWN",
    ]);
    const earlierVerification = aar.counterfactuals.find(
      (item) => item.id === "CF_VERIFY_EARLIER",
    );
    expect(earlierVerification).toMatchObject({
      id: "CF_VERIFY_EARLIER",
      assetId: "UAV_SORTIE",
      requestedAtSec: 1200,
      resultAtSec: 1560,
    });
    if (earlierVerification?.id !== "CF_VERIFY_EARLIER")
      throw new Error("Missing earlier-verification result");
    expect(earlierVerification.result.decision.actionId).toBe("GO_SOUTH");
    expect(earlierVerification.result.scores.realizedUtility).toBeCloseTo(
      44,
      5,
    );
    expect(
      earlierVerification.policyAssumptions.every(
        (assumption) =>
          assumption.label ===
          "COUNTERFACTUAL POLICY ASSUMPTION - not a trainee statement",
      ),
    ).toBe(true);
    expect(COUNTERFACTUAL_LABEL).toBe(
      "COUNTERFACTUAL — simulated, not what happened",
    );
  });

  it("is deterministic across independent builds", () => {
    const log = logFor(pathIntents.B);
    expect(buildAar(flagship, log).counterfactuals).toEqual(
      buildAar(flagship, log).counterfactuals,
    );
  });
});
