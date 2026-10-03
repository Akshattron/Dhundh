// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import harbour from "../../src/scenarios/harbour-flood-response.json";
import { loadScenario } from "../../src/engine/scenarioLoader";
import { buildTeamMetrics } from "../../src/engine/team";
import type { Intent, ScenarioDef } from "../../src/engine/types";
import { flagship, freeze, logFor } from "./fixtures";

const start: Intent = { type: "START", t: 0, role: "INSTRUCTOR" };
const estimate = (
  t: number,
  p: number,
  role: "COMMANDER" | "ANALYST" = "COMMANDER",
): Intent => ({ type: "SET_ESTIMATE", t, role, hypothesisId: "north_pass", p });
const decide = (t: number, citedReportIds: string[] = []): Intent => ({
  type: "DECIDE",
  t,
  role: "COMMANDER",
  actionId: "STAND_DOWN",
  rationale: citedReportIds.length
    ? { text: "Synthetic cited evidence", citedReportIds, tags: [] }
    : null,
});
const relay = (t: number, reportId = "R04"): Intent => ({
  type: "RELAY",
  t,
  role: "ANALYST",
  reportId,
});
const open = (t: number, reportId: string): Intent => ({
  type: "OPEN_REPORT",
  t,
  role: "COMMANDER",
  reportId,
});
const metrics = (intents: Intent[], scenario: ScenarioDef = flagship) =>
  buildTeamMetrics(
    scenario,
    logFor([start, ...intents], scenario, { mode: "NETWORKED" }),
  );

describe("completed authoritative team metrics", () => {
  it("represents empty and one-role data with nulls, not manufactured zero success", () => {
    const report = metrics([]);
    expect(report.metrics).toEqual({
      informationSharingRate: null,
      estimateConvergence: null,
      medianRelayDelayMin: null,
      medianCoordinationLatencySec: null,
    });
    expect(report.decisionMetrics[0]?.convergence).toEqual([]);
    expect(report.decisionMetrics[0]?.relays).toEqual([]);
    expect(
      metrics([estimate(720, 0.5), decide(900)]).metrics.estimateConvergence,
    ).toBeNull();
  });

  it("reports zero sharing when meaningful analyst evidence exists but no relay was sent", () => {
    const report = metrics([estimate(720, 0.5), decide(900)]);
    expect(report.metrics.informationSharingRate).toBe(0);
    expect(report.decisionMetrics[0]?.counts).toMatchObject({
      meaningfulReports: 1,
      meaningfulReportsRelayed: 0,
      relayIntents: 0,
    });
    expect(report.metrics.medianCoordinationLatencySec).toBeNull();
  });

  it("uses actual receipt timestamps and matches an opened relay, not an earlier estimate", () => {
    const report = metrics([
      relay(600),
      estimate(719, 0.6),
      open(750, "RLY1"),
      decide(900),
    ]);
    expect(report.metrics).toMatchObject({
      informationSharingRate: 1,
      medianRelayDelayMin: 4,
      medianCoordinationLatencySec: 30,
    });
    expect(report.decisionMetrics[0]?.relays[0]).toMatchObject({
      originalDeliveredAtSec: 480,
      deliveredAtSec: 720,
      latencySec: 30,
      response: { atSec: 750, type: "OPEN_REPORT" },
      status: "MATCHED",
    });
  });

  it("deduplicates sharing and never reuses one response for multiple receipts", () => {
    const report = metrics([
      relay(600),
      relay(660),
      estimate(900, 0.6),
      decide(1000),
    ]);
    expect(report.metrics.informationSharingRate).toBe(1);
    expect(report.metrics.medianRelayDelayMin).toBe(4.5);
    expect(report.metrics.medianCoordinationLatencySec).toBe(180);
    expect(report.decisionMetrics[0]?.counts).toMatchObject({
      meaningfulReportsRelayed: 1,
      relayIntents: 2,
      matchedResponses: 1,
      unansweredReceipts: 1,
    });
    expect(report.decisionMetrics[0]?.relays[1]?.latencySec).toBeNull();
  });

  it("calculates even medians and convergence/divergence in accepted order", () => {
    const report = metrics([
      estimate(600, 0.8),
      estimate(600, 0.8, "ANALYST"),
      relay(601),
      relay(700),
      open(730, "RLY1"),
      open(830, "RLY2"),
      estimate(840, 0.1, "ANALYST"),
      estimate(900, 0.6),
      decide(1200),
    ]);
    const decision = report.decisionMetrics[0]!;
    expect(report.metrics.informationSharingRate).toBe(0.5);
    expect(report.metrics.estimateConvergence).toBe(0.5);
    expect(report.metrics.medianCoordinationLatencySec).toBe(9.5);
    expect(decision.initialConvergence).toBe(1);
    expect(decision.convergenceChange).toBe(-0.5);
    expect(decision.convergence.map((point) => point.convergence)).toEqual([
      1,
      1 - Math.abs(0.8 - 0.1),
      0.5,
    ]);
    expect(decision.counts.primaryEstimateIntents).toBe(4);
  });

  it("observes maximal divergence and identical final estimates without a composite score", () => {
    expect(
      metrics([estimate(720, 0), estimate(720, 1, "ANALYST"), decide(900)])
        .metrics.estimateConvergence,
    ).toBe(0);
    expect(
      metrics([
        estimate(720, 0.25),
        estimate(720, 0.25, "ANALYST"),
        decide(900),
      ]).metrics.estimateConvergence,
    ).toBe(1);
    expect(Object.keys(metrics([]).metrics)).not.toContain("teamScore");
  });

  it("matches verification of the same hypothesis and an explicitly cited decision at receipt", () => {
    const verified = metrics([
      estimate(700, 0.6),
      relay(700),
      { type: "VERIFY", t: 840, role: "COMMANDER", assetId: "UAV_SORTIE" },
      decide(900),
    ]);
    expect(verified.metrics.medianCoordinationLatencySec).toBe(20);
    const cited = metrics([
      estimate(700, 0.6),
      relay(780),
      decide(900, ["RLY1"]),
    ]);
    expect(cited.metrics.medianCoordinationLatencySec).toBe(0);
    expect(cited.decisionMetrics[0]?.relays[0]?.response?.type).toBe("DECIDE");
  });

  it("keeps an unmatched meaningful receipt censored at commitment", () => {
    const report = metrics([
      estimate(600, 0.6),
      relay(700),
      decide(900),
      open(901, "RLY1"),
    ]);
    expect(report.metrics.medianCoordinationLatencySec).toBeNull();
    expect(report.decisionMetrics[0]?.relays[0]?.status).toBe("NO_RESPONSE");
    expect(report.decisionMetrics[0]?.counts.unansweredReceipts).toBe(1);
  });

  it("counts a meaningful send but labels late arrival and excludes it from response latency", () => {
    const report = metrics([
      estimate(600, 0.6),
      relay(850),
      decide(900),
      open(970, "RLY1"),
    ]);
    expect(report.metrics.informationSharingRate).toBe(1);
    expect(report.metrics.medianRelayDelayMin).toBe((970 - 480) / 60);
    expect(report.metrics.medianCoordinationLatencySec).toBeNull();
    expect(report.decisionMetrics[0]?.relays[0]?.status).toBe("AFTER_DECISION");
  });

  it("does not confuse a scheduled receipt with actual delivery after completion", () => {
    const scenario = structuredClone(flagship);
    scenario.decisionPoints[0]!.actions.find(
      (action) => action.id === "STAND_DOWN",
    )!.consequences.forEach((rule) => {
      rule.arrivalSec = 30;
    });
    const report = metrics(
      [estimate(600, 0.6), relay(850), decide(900)],
      scenario,
    );
    expect(report.metrics.medianRelayDelayMin).toBeNull();
    expect(report.decisionMetrics[0]?.relays[0]).toMatchObject({
      status: "NOT_DELIVERED",
      deliveredAtSec: null,
      scheduledDeliveryAtSec: 970,
    });
  });

  it("excludes neutral or weak evidence from meaningful sharing and response opportunities", () => {
    const neutral = metrics([
      estimate(900, 0.5),
      relay(960, "R08"),
      open(1100, "RLY1"),
      decide(1200),
    ]);
    expect(neutral.metrics.informationSharingRate).toBe(0);
    expect(neutral.metrics.medianCoordinationLatencySec).toBeNull();
    expect(neutral.decisionMetrics[0]?.relays[0]?.status).toBe(
      "NOT_MEANINGFUL",
    );
    const scenario = structuredClone(flagship);
    scenario.reports.find((report) => report.id === "R04")!.rho = 0.51;
    expect(
      metrics([relay(600), estimate(720, 0.5), decide(900)], scenario).metrics
        .informationSharingRate,
    ).toBeNull();
  });

  it("excludes later same-second estimates at each voluntary and timeout decision cut", () => {
    const scenario = loadScenario(harbour);
    const initial: Intent[] = [
      start,
      {
        type: "SET_ESTIMATE",
        t: 1200,
        role: "COMMANDER",
        hypothesisId: "quay_dry",
        p: 0.2,
      },
      {
        type: "SET_ESTIMATE",
        t: 1200,
        role: "ANALYST",
        hypothesisId: "quay_dry",
        p: 0.2,
      },
    ];
    const voluntary = buildTeamMetrics(
      scenario,
      logFor(
        [
          ...initial,
          {
            type: "DECIDE",
            t: 1200,
            role: "COMMANDER",
            actionId: "HOLD_POSITION",
            rationale: null,
          },
          {
            type: "SET_ESTIMATE",
            t: 1200,
            role: "ANALYST",
            hypothesisId: "quay_dry",
            p: 0.9,
          },
        ],
        scenario,
        { mode: "NETWORKED" },
      ),
    );
    const timeout = buildTeamMetrics(
      scenario,
      logFor(
        [
          ...initial,
          {
            type: "SET_ESTIMATE",
            t: 1560,
            role: "ANALYST",
            hypothesisId: "quay_dry",
            p: 0.9,
          },
        ],
        scenario,
        { mode: "NETWORKED" },
      ),
    );
    for (const report of [voluntary, timeout]) {
      expect(report.decisionMetrics[0]?.metrics.estimateConvergence).toBe(1);
      expect(report.decisionMetrics[0]?.counts.primaryEstimateIntents).toBe(2);
      expect(
        report.decisionMetrics[1]?.metrics.estimateConvergence,
      ).toBeCloseTo(0.3, 12);
    }
  });

  it("is deterministic, bounded by real cuts, pure, and refuses unsupported/incomplete histories", () => {
    const log = freeze(
      logFor([start, relay(600), estimate(850, 0.8), decide(900)], flagship, {
        mode: "NETWORKED",
      }),
    );
    const before = JSON.stringify(log);
    const date = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Wall clock");
    });
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Random global");
    });
    try {
      const report = buildTeamMetrics(flagship, log);
      expect(buildTeamMetrics(flagship, log)).toEqual(report);
      for (const decision of report.decisionMetrics)
        for (const relay of decision.relays) {
          if (relay.latencySec !== null && relay.deliveredAtSec !== null) {
            expect(relay.latencySec).toBeGreaterThanOrEqual(0);
            expect(relay.latencySec).toBeLessThanOrEqual(
              decision.atSec - relay.deliveredAtSec,
            );
          }
        }
      expect(JSON.stringify(log)).toBe(before);
      expect(() => buildTeamMetrics(flagship, logFor([]))).toThrow(
        "completed network",
      );
      expect(() =>
        metrics([{ type: "PAUSE", t: 600, role: "INSTRUCTOR" }]),
      ).toThrow("completed network");
    } finally {
      date.mockRestore();
      random.mockRestore();
    }
  });
});
