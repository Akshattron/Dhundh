// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  advanceTo,
  binaryEntropy,
  computeBelief,
  contradictionSummary,
  effectiveAccuracy,
  fogIndex,
  llr,
  logistic,
} from "../../src/engine";
import { flagship, started } from "./fixtures";

describe("belief primitives", () => {
  it("computes a prior-only snapshot and clamps prior log-odds", () => {
    const state = started();
    const prior = computeBelief(flagship, state, 0);
    expect(prior.perHypothesis.north_pass?.p).toBeCloseTo(0.7, 12);
    expect(prior.perHypothesis.south_ford?.p).toBeCloseTo(0.8, 12);
    expect(prior.fogIndex).toBeCloseTo(
      (binaryEntropy(0.7) + binaryEntropy(0.8)) / 2,
      12,
    );

    const extreme = structuredClone(flagship);
    extreme.hypotheses[0]!.prior = 0.9999;
    const bounded = computeBelief(extreme, state, 0);
    expect(bounded.perHypothesis.north_pass?.p).toBeCloseTo(
      logistic(extreme.model.llrClamp),
      12,
    );
  });

  it("matches the flagship reference beliefs, Fog, and contradiction anchors", () => {
    const atTen = advanceTo(started(), flagship, 600).state;
    const ten = computeBelief(flagship, atTen, 600);
    expect(ten.perHypothesis.north_pass?.p).toBeCloseTo(0.9682, 4);
    expect(ten.perHypothesis.south_ford?.p).toBeCloseTo(0.9365, 4);
    expect(ten.fogIndex).toBeCloseTo(0.2723, 4);

    const atTwentyTwo = advanceTo(started(), flagship, 1320).state;
    const twentyTwo = computeBelief(flagship, atTwentyTwo, 1320);
    const north = twentyTwo.perHypothesis.north_pass!;
    expect(north.p).toBeCloseTo(0.7372, 4);
    expect(north.positiveNats).toBeCloseTo(1.2927, 4);
    expect(north.negativeNats).toBeCloseTo(1.1083, 4);
    expect(north.contradictionIndex).toBeCloseTo(0.9232, 4);
    expect(north.contradicted).toBe(true);
    expect(twentyTwo.fogIndex).toBeCloseTo(0.6733, 4);
    expect(north.contributions.map((item) => item.reportId)).toEqual([
      "R01",
      "R02",
      "R04",
      "R05",
      "R06",
    ]);
  });

  it("uses evaluation time, health-at-issue, neutral reports, and zero-strength evidence", () => {
    expect(effectiveAccuracy(0.85, 0, 1200, 1)).toBe(0.85);
    expect(effectiveAccuracy(0.85, 0, 1200, 0.5)).toBeCloseTo(0.675, 12);
    expect(effectiveAccuracy(0.85, 1_000_000_000, 1200, 1)).toBe(0.5);
    expect(llr(0.5, 1)).toBe(0);
    expect(llr(0.9, 0)).toBe(0);
    expect(logistic(0)).toBe(0.5);
    expect(binaryEntropy(0)).toBe(0);
    expect(binaryEntropy(1)).toBe(0);
    expect(fogIndex([0.5, 0.5])).toBe(1);

    const state = advanceTo(started(), flagship, 960).state;
    const snapshot = computeBelief(flagship, state, 960);
    expect(snapshot.perHypothesis.north_pass?.contributions).not.toContainEqual(
      expect.objectContaining({ reportId: "R08" }),
    );
  });

  it("applies deterministic evidence-group selection and report cutoffs", () => {
    const scenario = structuredClone(flagship);
    scenario.reports.find((report) => report.id === "R02")!.evidenceGroup =
      "G1";
    const state = advanceTo(started(scenario), scenario, 600).state;
    const snapshot = computeBelief(scenario, state, 600);
    const northGroups = snapshot.perHypothesis.north_pass!.contributions;
    expect(northGroups.filter((item) => item.group === "G1")).toHaveLength(1);
    expect(northGroups.find((item) => item.group === "G1")?.reportId).toBe(
      "R01",
    );

    const futureCut = computeBelief(flagship, state, 179);
    expect(futureCut.perHypothesis.north_pass?.contributions).toHaveLength(0);
  });

  it("breaks equal-strength group ties by report sequence and contradictions by recency", () => {
    const base = advanceTo(started(), flagship, 600).state;
    const equalStrength = structuredClone(base);
    const first = equalStrength.reports.R01!;
    const second = equalStrength.reports.R02!;
    first.def.evidenceGroup = "TIED_GROUP";
    second.def.evidenceGroup = "TIED_GROUP";
    first.def.issuedAtSec = 180;
    second.def.issuedAtSec = 180;
    first.def.channel = "LAND";
    second.def.channel = "LAND";
    first.def.stance = 1;
    second.def.stance = 1;
    first.def.rho = 0.9;
    second.def.rho = 0.9;
    first.healthAtIssue = 1;
    second.healthAtIssue = 1;
    const tieResult = computeBelief(flagship, equalStrength, 600);
    expect(
      tieResult.perHypothesis.north_pass?.contributions.find(
        (contribution) => contribution.group === "TIED_GROUP",
      )?.reportId,
    ).toBe("R02");

    const contradictory = structuredClone(base);
    contradictory.reports.R01!.def.evidenceGroup = "CONTRADICTORY_GROUP";
    contradictory.reports.R02!.def.evidenceGroup = "CONTRADICTORY_GROUP";
    contradictory.reports.R01!.def.issuedAtSec = 180;
    contradictory.reports.R02!.def.issuedAtSec = 300;
    contradictory.reports.R02!.def.stance = -1;
    const contradictionResult = computeBelief(flagship, contradictory, 600);
    expect(
      contradictionResult.perHypothesis.north_pass?.contributions.find(
        (contribution) => contribution.group === "CONTRADICTORY_GROUP",
      )?.reportId,
    ).toBe("R02");
  });

  it("requires both contradiction balance and minimum evidence mass", () => {
    expect(
      contradictionSummary([{ llr: 0.4 }, { llr: -0.4 }], 0.5, 0.5),
    ).toMatchObject({ index: 1, contradicted: false });
    expect(
      contradictionSummary([{ llr: 1 }, { llr: -1 }], 0.5, 0.5),
    ).toMatchObject({ index: 1, contradicted: true });
    expect(
      contradictionSummary([{ llr: 0.09 }, { llr: -0.09 }], 0.01, 0.5),
    ).toMatchObject({ index: 0, contradicted: false });
  });
});
