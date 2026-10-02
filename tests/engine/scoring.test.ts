// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  advanceTo,
  computeBelief,
  brier,
  calibrationAlignment,
  effectiveLatencySeconds,
  informationUtilization,
  outcomeScore,
  replayLog,
  scoreDecision,
} from "../../src/engine";
import type { DecisionRecord, VerificationRecord } from "../../src/engine";
import { flagship, logFor, started } from "./fixtures";
import { pathIntents } from "../golden/flagship.expected";

describe("P0 score dependencies", () => {
  it("tests calibration alignment and single-event Brier boundaries", () => {
    expect(calibrationAlignment(0.5, 0.5)).toBe(1);
    expect(calibrationAlignment(0.25, 0.5)).toBe(0.5);
    expect(calibrationAlignment(0, 1)).toBe(0);
    expect(brier(0, false)).toBe(0);
    expect(brier(1, true)).toBe(0);
    expect(brier(0.25, true)).toBe(0.5625);
    expect(() => calibrationAlignment(-0.01, 0.5)).toThrow(RangeError);
    expect(() => brier(1.01, false)).toThrow(RangeError);
  });

  it("normalizes custom outcome scales and clips at both boundaries", () => {
    const scale = { min: -50, max: 150 };
    expect(outcomeScore(-50, scale)).toBe(0);
    expect(outcomeScore(50, scale)).toBe(0.5);
    expect(outcomeScore(150, scale)).toBe(1);
    expect(outcomeScore(-100, scale)).toBe(0);
    expect(outcomeScore(200, scale)).toBe(1);
    expect(() => outcomeScore(0, { min: 4, max: 4 })).toThrow(RangeError);
    expect(() => outcomeScore(Number.NaN, scale)).toThrow(RangeError);
  });

  it("credits only causal, deciding-role inspections for information utilization", () => {
    const log = logFor(pathIntents.A);
    const state = replayLog(flagship, log, { upToSec: 1740 });
    const decision = state.decisions[0]!;
    const belief = computeBelief(flagship, state, decision.atSec);
    const baseline = informationUtilization(belief, state, flagship, decision);
    expect(baseline).toBeCloseTo(0.9480953, 6);

    const otherRole = {
      ...state,
      inspections: state.inspections.map((inspection) => ({
        ...inspection,
        role: "ANALYST" as const,
      })),
    };
    expect(informationUtilization(belief, otherRole, flagship, decision)).toBe(
      0,
    );

    const afterCut = {
      ...state,
      inspections: [
        ...state.inspections,
        { atSec: decision.atSec + 1, reportId: "R08", role: decision.role },
      ],
    };
    expect(informationUtilization(belief, afterCut, flagship, decision)).toBe(
      baseline,
    );

    const noEvidence = {
      ...belief,
      perHypothesis: Object.fromEntries(
        Object.entries(belief.perHypothesis).map(([id, item]) => [
          id,
          { ...item, contributions: [] },
        ]),
      ),
    };
    expect(informationUtilization(noEvidence, state, flagship, decision)).toBe(
      1,
    );
  });

  it("unions only nonnegative-net, same-role verification waits", () => {
    const dp = flagship.decisionPoints[0]!;
    const decision = {
      decisionPointId: dp.id,
      atSec: 1740,
      actionId: "GO_SOUTH",
      role: "SOLO",
      timedOut: false,
      rationale: null,
      estimates: {},
      consultedAid: true,
    } satisfies Parameters<typeof effectiveLatencySeconds>[0];
    const verification = (
      id: string,
      requestedAtSec: number,
      deliversAtSec: number,
      role: VerificationRecord["role"] = "SOLO",
    ): VerificationRecord => ({
      id,
      assetId: "UAV_SORTIE",
      hypothesisId: "north_pass",
      requestedAtSec,
      deliversAtSec,
      costUnits: 5,
      resultReportId: id,
      role,
      decisionPointId: dp.id,
    });
    const records = [
      verification("a", 1320, 1680),
      verification("b", 1440, 1740),
      verification("c", 1320, 1740, "ANALYST"),
      verification("d", 1320, 1740),
    ];
    const assessments = new Map([
      ["a", { assetId: "UAV_SORTIE", atSec: 1320, evsi: 1, net: 1, evpi: 2 }],
      ["b", { assetId: "UAV_SORTIE", atSec: 1440, evsi: 1, net: 1, evpi: 2 }],
      ["c", { assetId: "UAV_SORTIE", atSec: 1320, evsi: 1, net: 1, evpi: 2 }],
      ["d", { assetId: "UAV_SORTIE", atSec: 1320, evsi: 1, net: -1, evpi: 2 }],
    ]);

    expect(effectiveLatencySeconds(decision, dp, records, assessments)).toBe(
      decision.atSec - dp.openSec - 420,
    );
    expect(effectiveLatencySeconds(decision, dp, [], new Map())).toBe(
      decision.atSec - dp.openSec,
    );
  });

  it("scores verification use, per-asset candidate cuts, ties, and zero EVPI", () => {
    const scenario = structuredClone(flagship);
    const dp = scenario.decisionPoints[0]!;
    scenario.reports = [];
    scenario.events = scenario.events.filter(
      (event) => event.kind !== "REPORT_ISSUE",
    );
    const stateAtCut = advanceTo(started(scenario), scenario, dp.openSec).state;
    const belief = computeBelief(scenario, stateAtCut, dp.openSec);
    const decision = {
      decisionPointId: dp.id,
      atSec: dp.openSec,
      actionId: "GO_SOUTH",
      role: "SOLO",
      timedOut: false,
      rationale: null,
      estimates: {},
      consultedAid: false,
    } satisfies DecisionRecord;
    const common = {
      scenario,
      dp,
      belief,
      stateAtCut,
      decision,
      decisionTruth: stateAtCut.truth,
      requestAssessments: new Map(),
    };

    const candidates = new Map([
      [
        dp.assets[0]!,
        {
          assetId: dp.assets[0]!,
          atSec: 1439,
          evsi: 3,
          net: 1,
          evpi: 2,
        },
      ],
      [
        dp.assets[1]!,
        {
          assetId: dp.assets[1]!,
          atSec: 1499,
          evsi: 4,
          net: 1,
          evpi: 2,
        },
      ],
    ]);
    const skipped = scoreDecision({
      ...common,
      candidateAssessments: candidates,
    });
    expect(skipped.verificationEfficiency).toMatchObject({
      selectedAssetId: dp.assets[0],
      evaluationAtSec: 1439,
      netVoi: 1,
    });
    expect(skipped.verifyEff).toBe(0.5);

    const zeroEvpi = scoreDecision({
      ...common,
      candidateAssessments: new Map(
        dp.assets.map((assetId) => [
          assetId,
          { assetId, atSec: 1439, evsi: 0, net: 1, evpi: 0 },
        ]),
      ),
    });
    expect(zeroEvpi.verifyEff).toBe(1);

    const noAssetsDp = { ...dp, assets: [] };
    const noAssets = scoreDecision({
      ...common,
      dp: noAssetsDp,
      candidateAssessments: new Map(),
    });
    expect(noAssets.verifyEff).toBe(1);
    expect(noAssets.verificationEfficiency.selectedAssetId).toBeNull();

    const used: VerificationRecord = {
      id: "V_TEST",
      assetId: dp.assets[0]!,
      hypothesisId: "north_pass",
      requestedAtSec: dp.openSec,
      deliversAtSec: dp.openSec + 60,
      costUnits: 5,
      resultReportId: "V_TEST",
      role: "SOLO",
      decisionPointId: dp.id,
    };
    const usedState = {
      ...stateAtCut,
      verifications: [used],
    };
    const wastefulUse = scoreDecision({
      ...common,
      stateAtCut: usedState,
      requestAssessments: new Map([
        [
          used.id,
          {
            assetId: used.assetId,
            atSec: used.requestedAtSec,
            evsi: 1,
            net: -1,
            evpi: 2,
          },
        ],
      ]),
      candidateAssessments: new Map(),
    });
    expect(wastefulUse.verifyEff).toBe(0.5);
    expect(wastefulUse.verificationEfficiency.usedVerificationId).toBe(used.id);
  });

  it("covers the lucky quadrant independently of the realized outcome component", () => {
    const scenario = structuredClone(flagship);
    scenario.reports = [];
    scenario.events = scenario.events.filter(
      (event) => event.kind !== "REPORT_ISSUE",
    );
    scenario.hypotheses[0]!.prior = 0.01;
    const dp = { ...scenario.decisionPoints[0]!, assets: [] };
    const stateAtCut = advanceTo(started(scenario), scenario, dp.openSec).state;
    const belief = computeBelief(scenario, stateAtCut, dp.openSec);
    const decision = {
      decisionPointId: dp.id,
      atSec: dp.openSec,
      actionId: "GO_NORTH",
      role: "SOLO",
      timedOut: false,
      rationale: null,
      estimates: {},
      consultedAid: false,
    } satisfies DecisionRecord;
    const score = scoreDecision({
      scenario,
      dp,
      belief,
      stateAtCut,
      decision,
      decisionTruth: { north_pass: true, south_ford: true },
      requestAssessments: new Map(),
      candidateAssessments: new Map(),
    });
    expect(score.dq).toBe(0);
    expect(score.outcome).toBe(1);
    expect(score.quadrant).toBe("LUCKY");
  });

  it("applies inclusive sound-decision and favourable-outcome boundaries", () => {
    const scenario = structuredClone(flagship);
    scenario.reports = [];
    scenario.events = scenario.events.filter(
      (event) => event.kind !== "REPORT_ISSUE",
    );
    scenario.outcomeScale = { min: 50, max: 100 };
    const dp = scenario.decisionPoints[0]!;
    dp.assets = [];
    dp.actions[0]!.utility = [{ when: {}, value: 80 }];
    dp.actions[1]!.utility = [{ when: {}, value: 100 }];
    dp.actions[2]!.utility = [{ when: {}, value: 0 }];
    const stateAtCut = advanceTo(started(scenario), scenario, dp.openSec).state;
    const belief = computeBelief(scenario, stateAtCut, dp.openSec);
    const decision: DecisionRecord = {
      decisionPointId: dp.id,
      atSec: dp.openSec,
      actionId: dp.actions[0]!.id,
      role: "SOLO",
      timedOut: false,
      rationale: null,
      estimates: {},
      consultedAid: false,
    };
    const inputs = {
      scenario,
      dp,
      belief,
      stateAtCut,
      decision,
      decisionTruth: stateAtCut.truth,
      requestAssessments: new Map(),
      candidateAssessments: new Map(),
    };
    const exact = scoreDecision(inputs);
    expect(exact.dq).toBeCloseTo(0.8, 12);
    expect(exact.outcome).toBeCloseTo(0.6, 12);
    expect(exact.quadrant).toBe("SOUND_SUCCESS");

    dp.actions[0]!.utility = [{ when: {}, value: 79.9 }];
    const justBelowSound = scoreDecision(inputs);
    expect(justBelowSound.dq).toBeLessThan(0.8);
    expect(justBelowSound.outcome).toBeLessThan(0.6);
    expect(justBelowSound.quadrant).toBe("POOR");

    dp.actions[0]!.utility = [{ when: {}, value: 80 }];
    scenario.outcomeScale.max = 100.0001;
    const justBelowOutcome = scoreDecision(inputs);
    expect(justBelowOutcome.dq).toBeCloseTo(0.8, 12);
    expect(justBelowOutcome.outcome).toBeLessThan(0.6);
    expect(justBelowOutcome.quadrant).toBe("SOUND_UNLUCKY");
  });
});
