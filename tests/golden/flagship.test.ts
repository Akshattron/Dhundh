// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildAar,
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

  describe("FLAGSHIP_DEMO P0 scoring and AAR", () => {
    it.each([
      ["A", 88.47, "SOUND_SUCCESS"],
      ["B", 66.17, "SOUND_UNLUCKY"],
      ["C", 83.67, "SOUND_UNLUCKY"],
      ["D", 33.12, "POOR"],
    ] as const)(
      "scores Path %s from its decision-time state",
      (path, expectedScore, expectedQuadrant) => {
        const aar = buildAar(flagship, logFor(pathIntents[path]));
        expect(aar.scores.trainingScore).toBeCloseTo(expectedScore, 1);
        expect(aar.scores.quadrant).toBe(expectedQuadrant);
        expect(aar.decision.truthAtDecision).toEqual({
          north_pass: false,
          south_ford: true,
        });
        expect(aar.truth).toEqual(aar.decision.truthAtDecision);
        expect(aar.counterfactuals).toEqual([]);
        expect(aar.limitations).toContain(
          "P0: counterfactual and what-if delivery analysis not implemented.",
        );
      },
    );

    it("preserves every Path A scoring component, rationale, and information cut", () => {
      const aar = buildAar(flagship, logFor(pathIntents.A));
      expect(aar.scores.dq).toBeCloseTo(1, 4);
      expect(aar.scores.outcome).toBeCloseTo(0.6975, 4);
      expect(aar.scores.infoUtil).toBeCloseTo(0.9481, 4);
      expect(aar.scores.timeliness).toBeCloseTo(0.3889, 4);
      expect(aar.scores.verifyEff).toBeCloseTo(1, 4);
      expect(aar.scores.calibration).toBeCloseTo(0.9795, 4);
      expect(aar.scores.trainingScore).toBeCloseTo(88.47, 1);
      expect(aar.scores.quadrant).toBe("SOUND_SUCCESS");
      expect(aar.scores.realizedUtility).toBeCloseTo(39.5, 4);
      expect(aar.decision.belief.north_pass).toBeCloseTo(0.2398, 4);
      expect(aar.decision.expectedUtilities.GO_NORTH).toBeCloseTo(-62.34, 1);
      expect(aar.decision.expectedUtilities.GO_SOUTH).toBeCloseTo(18.61, 1);
      expect(aar.decision.expectedUtilities.STAND_DOWN).toBeCloseTo(10, 4);
      expect(aar.decision.rationale?.citedReportIds).toEqual(["R06", "V01"]);
      expect(aar.information.delivered.map((report) => report.id)).toContain(
        "R09",
      );
      expect(aar.information.opened).not.toContain("R09");
      expect(
        aar.information.lateOrAfterDecision.map((report) => report.reportId),
      ).toContain("R11");
      expect(aar.verification).toMatchObject({
        used: true,
        assetId: "UAV_SORTIE",
        requestedAtSec: 1320,
        deliveredAtSec: 1680,
        netVoiAtEval: expect.closeTo(17.38, 1),
        verdict: "WORTH_IT_USED",
      });
      expect(aar.frames.at(-1)?.phase).toBe("COMPLETE");
      expect(
        aar.coachNotes.find((note) => note.id === "verification-used")?.text,
      ).toContain("Its result arrived before commitment");
      expect(
        aar.coachNotes.find((note) => note.id === "estimate-revision")?.text,
      ).toContain("revised your estimate");
    });

    it("uses factual, severity-ordered coach notes for sound-unlucky decisions", () => {
      const aar = buildAar(flagship, logFor(pathIntents.B));
      const decisionNote = aar.coachNotes.find(
        (note) => note.id === "decision-quality",
      );
      expect(decisionNote?.text).toContain(
        "Sound decision, unfavourable outcome",
      );
      expect(decisionNote?.text).toContain(
        "The hidden truth was Veer Pass (north route) is passable: Blocked; Tamsa Ford (south route) is passable: Passable",
      );
      expect(
        aar.coachNotes.some((note) => note.id === "verification-skipped"),
      ).toBe(true);
      expect(aar.coachNotes.some((note) => note.id === "unopened-R06")).toBe(
        true,
      );
      const severities = aar.coachNotes.map((note) => note.severity);
      expect(severities.indexOf("ATTENTION")).toBeLessThan(
        severities.indexOf("INFO"),
      );
    });

    it("records timeout at the exact close and distinguishes the outcome from DQ", () => {
      const aar = buildAar(flagship, logFor(pathIntents.E));
      expect(aar.header).toMatchObject({
        decisionAtSec: 1800,
        timedOut: true,
      });
      expect(aar.scores.timeliness).toBe(0);
      expect(aar.scores.outcome).toBeCloseTo(0.55, 4);
      expect(aar.scores.realizedUtility).toBe(10);
      expect(aar.decision.actionId).toBe("STAND_DOWN");
      expect(aar.coachNotes.some((note) => note.id === "timeout")).toBe(true);
      expect(aar.frames.at(-1)?.atSec).toBe(1980);
      expect(aar.coachNotes[0]?.text).toContain(
        "Stand down at Camp Alder was recorded automatically",
      );
    });

    it("reconstructs a factual AAR through a post-horizon terminal event", () => {
      const aar = buildAar(
        flagship,
        logFor([
          { type: "START", t: 0, role: "SOLO" },
          {
            type: "SET_ESTIMATE",
            t: 1798,
            role: "SOLO",
            hypothesisId: "north_pass",
            p: 0.5,
          },
          {
            type: "DECIDE",
            t: 1799,
            role: "SOLO",
            actionId: "GO_SOUTH",
            rationale: null,
          },
        ]),
      );
      expect(aar.decision.atSec).toBe(1799);
      expect(aar.decision.truthAtDecision).toEqual(aar.truth);
      expect(aar.frames.at(-1)).toMatchObject({
        atSec: 2219,
        phase: "COMPLETE",
      });
      expect(
        aar.timeline.some(
          (entry) => entry.kind === "COMPLETE" && entry.atSec === 2219,
        ),
      ).toBe(true);
      expect(aar.counterfactuals).toEqual([]);
      expect(aar.limitations).toContain(
        "P0: counterfactual and what-if delivery analysis not implemented.",
      );
    });

    it("distinguishes a worthwhile verification result arriving after commitment", () => {
      const aar = buildAar(
        flagship,
        logFor([
          { type: "START", t: 0, role: "SOLO" },
          ...["R01", "R02", "R03", "R04"].map((reportId) => ({
            type: "OPEN_REPORT" as const,
            t: 540,
            role: "SOLO" as const,
            reportId,
          })),
          { type: "OPEN_REPORT", t: 1080, role: "SOLO", reportId: "R05" },
          { type: "OPEN_REPORT", t: 1080, role: "SOLO", reportId: "R08" },
          { type: "OPEN_REPORT", t: 1320, role: "SOLO", reportId: "R06" },
          { type: "VERIFY", t: 1439, role: "SOLO", assetId: "UAV_SORTIE" },
          { type: "OPEN_REPORT", t: 1440, role: "SOLO", reportId: "R07" },
          { type: "OPEN_REPORT", t: 1620, role: "SOLO", reportId: "R09" },
          {
            type: "SET_ESTIMATE",
            t: 1797,
            role: "SOLO",
            hypothesisId: "north_pass",
            p: 0.5,
          },
          {
            type: "DECIDE",
            t: 1798,
            role: "SOLO",
            actionId: "GO_NORTH",
            rationale: null,
          },
        ]),
      );
      expect(aar.verification).toMatchObject({
        used: true,
        requestedAtSec: 1439,
        deliveredAtSec: 1799,
        verdict: "WORTH_IT_USED",
      });
      expect(
        aar.coachNotes.find((note) => note.id === "verification-used")?.text,
      ).toContain("Its result arrived after commitment");
    });
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
