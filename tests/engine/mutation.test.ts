// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import harbour from "../../src/scenarios/harbour-flood-response.json";
import {
  advanceTo,
  computeBelief,
  loadScenario,
  mutateScenario,
  netVoi,
  PROFILES,
  scenarioHash,
  ScenarioValidationError,
  validateRuntimeScenario,
} from "../../src/engine";
import type { DifficultyLevel, ScenarioDef } from "../../src/engine";
import * as loader from "../../src/engine/scenarioLoader";
import * as random from "../../src/engine/rng";
import { flagship, freeze, started } from "./fixtures";

const harbourScenario = loadScenario(harbour);
const levels: DifficultyLevel[] = [1, 2, 3, 4, 5];

function assertGates(scenario: ScenarioDef) {
  expect(validateRuntimeScenario(scenario)).toEqual(scenario);
  const primary = scenario.hypotheses.find((h) => h.primary)!;
  let state = started(scenario);
  const contradictions = scenario.decisionPoints.map(() => false);
  const verifications = scenario.decisionPoints.map(() => false);
  const close = Math.max(...scenario.decisionPoints.map((dp) => dp.closeSec));
  for (let t = 0; t <= close; t += 60) {
    state = advanceTo(state, scenario, t).state;
    const belief = computeBelief(scenario, state, t);
    scenario.decisionPoints.forEach((dp, index) => {
      if (t <= dp.closeSec && belief.perHypothesis[primary.id]!.contradicted)
        contradictions[index] = true;
      if (t < dp.openSec || t >= dp.closeSec) return;
      if (
        dp.assets.some((id) => {
          const asset = scenario.assets.find((a) => a.id === id)!;
          const value = netVoi(dp, belief, t, asset, scenario.hypotheses);
          return value.feasible && value.net >= 0;
        })
      )
        verifications[index] = true;
    });
  }
  expect(contradictions.every(Boolean)).toBe(true);
  expect(verifications.every(Boolean)).toBe(true);
}

afterEach(() => vi.restoreAllMocks());

describe("deterministic scenario mutation", () => {
  it("returns exactly the unchanged flagship at (level 3, seed 0), including its hash", () => {
    const base = freeze(structuredClone(flagship));
    expect(mutateScenario(base, 0, 3)).toBe(base);
    expect(scenarioHash(base)).toBe("1f7af0fb");
    const seconds = structuredClone(base);
    const delay = seconds.events.find(
      (event) => event.kind === "CHANNEL_DEGRADE" && event.mode === "DELAY",
    );
    if (!delay || delay.kind !== "CHANNEL_DEGRADE")
      throw new Error("Missing delay fixture");
    delay.extraDelaySec = 361;
    expect(mutateScenario(seconds, 0, 3)).toBe(seconds);
  });

  it.each(levels)(
    "runs only deterministic operators at seed zero / level %s",
    (level) => {
      const variant = mutateScenario(flagship, 0, level);
      const profile = PROFILES[level];
      expect(variant.meta.difficulty).toBe(level);
      expect(variant.meta.durationSec).toBe(flagship.meta.durationSec);
      expect(variant.reports).toEqual(flagship.reports);
      expect(variant.assets).toEqual(flagship.assets);
      expect(variant.decisionPoints[0]!.closeSec).toBe(
        Math.max(1320, 1800 + profile.closeDeltaMin * 60),
      );
      const delay = variant.events.find(
        (e) => e.kind === "CHANNEL_DEGRADE" && e.mode === "DELAY",
      );
      expect(delay).toMatchObject({
        atSec: 960,
        extraDelaySec: Math.max(60, Math.round(6 * profile.delayScale) * 60),
      });
      const dropout = variant.events.find(
        (e) => e.kind === "CHANNEL_DEGRADE" && e.mode === "DROPOUT",
      );
      expect(dropout).toMatchObject({
        atSec: 1080,
        untilSec: Math.min(
          1440 + profile.dropoutExtensionMin * 60,
          variant.decisionPoints[0]!.closeSec - 1,
        ),
      });
      assertGates(variant);
    },
  );

  it("uses independent exact RNG streams in authored order without changing fairness data", () => {
    const seed = 23;
    const base = freeze(structuredClone(flagship));
    const before = JSON.stringify(base);
    const result = mutateScenario(base, seed, 3);
    expect(result.meta.briefing).toEqual(base.meta.briefing);
    expect(result).toEqual(mutateScenario(base, seed, 3));
    expect(JSON.stringify(base)).toBe(before);
    expect(result.hypotheses).toEqual(base.hypotheses);
    expect(result.assets).toEqual(base.assets);
    expect(result.scoreWeights).toEqual(base.scoreWeights);
    expect(result.model).toEqual(base.model);
    expect(result.decisionPoints).toEqual(base.decisionPoints);
    const jitter = random.rng(seed ^ 0x51);
    const reliability = random.rng(seed ^ 0x52);
    base.events.forEach((event, index) => {
      if (event.kind === "TRUTH_CHANGE")
        expect(result.events[index]).toEqual(event);
      if (event.kind !== "REPORT_ISSUE" && event.kind !== "CHANNEL_DEGRADE")
        return;
      const time = Math.max(
        60,
        Math.min(1680, event.atSec + (Math.floor(jitter.next() * 3) - 1) * 60),
      );
      expect(result.events[index]!.atSec).toBe(time);
      if (event.kind === "REPORT_ISSUE") {
        expect(
          result.reports.find((r) => r.id === event.reportId)!.issuedAtSec,
        ).toBe(time);
      }
    });
    base.reports.forEach((report, index) => {
      expect(result.reports[index]!.rho).toBe(
        Math.max(
          0.55,
          Math.min(0.95, report.rho + reliability.next() * 0.1 - 0.05),
        ),
      );
    });
    const decoyRng = random.rng(seed ^ 0x53);
    const channel = decoyRng.next() < 0.5 ? "CYBER" : "EW";
    const rho = 0.55 + decoyRng.next() * 0.07;
    const start = Math.min(
      ...result.events
        .filter((e) => e.kind === "CHANNEL_DEGRADE")
        .map((e) => e.atSec),
    );
    const issuedAtSec =
      start + Math.floor(decoyRng.next() * (1620 - start + 1));
    expect(result.reports.at(-1)).toMatchObject({
      id: "DECOY1",
      channel,
      rho,
      issuedAtSec,
      evidenceGroup: "GDECOY1",
      stance: -1,
      hypothesisId: "north_pass",
    });
    expect(result.events.at(-1)).toEqual({
      kind: "REPORT_ISSUE",
      atSec: issuedAtSec,
      reportId: "DECOY1",
    });
    expect(scenarioHash(mutateScenario(base, 24, 3))).not.toBe(
      scenarioHash(result),
    );
  });

  it.each(levels)(
    "satisfies runtime, contradiction and useful-verification gates for seeds 1..200 / level %s",
    (level) => {
      for (let seed = 1; seed <= 200; seed += 1) {
        const result = mutateScenario(flagship, seed, level);
        assertGates(result);
        expect(result.hypotheses).toEqual(flagship.hypotheses);
        expect(result.assets).toEqual(flagship.assets);
      }
    },
    120000,
  );

  it.each([2, 3, 4] as const)(
    "passes both harbour DP gates for seeds 1..50 / level %s",
    (level) => {
      for (let seed = 1; seed <= 50; seed += 1)
        assertGates(mutateScenario(harbourScenario, seed, level));
    },
    120000,
  );

  it("retries from the base using hash(seed + attempt), not the previous variant or seed", () => {
    const seed = 7;
    const firstRho = Math.max(
      0.55,
      Math.min(
        0.95,
        flagship.reports[0]!.rho + random.rng(seed ^ 0x52).next() * 0.1 - 0.05,
      ),
    );
    const actual = loader.validateRuntimeScenario;
    vi.spyOn(loader, "validateRuntimeScenario").mockImplementation((raw) => {
      const parsed = actual(raw);
      if (parsed.reports[0]!.rho === firstRho)
        throw new ScenarioValidationError([
          {
            path: ["reports"],
            code: "custom",
            message: "Synthetic retry fixture",
          },
        ]);
      return parsed;
    });
    const retrySeed = random.hashString(String(seed + 1));
    expect(mutateScenario(flagship, seed, 3)).toEqual(
      mutateScenario(flagship, retrySeed, 3),
    );
  });

  it("tries the original seed plus 20 hashed retries, then returns a validated fallback with an explicit warning", () => {
    const actual = loader.validateRuntimeScenario;
    const observed: number[] = [];
    const rng = random.rng;
    vi.spyOn(random, "rng").mockImplementation((seed) => {
      observed.push(seed);
      return rng(seed);
    });
    vi.spyOn(loader, "validateRuntimeScenario").mockImplementation((raw) => {
      const parsed = actual(raw);
      if (parsed.reports[0]!.rho !== flagship.reports[0]!.rho)
        throw new ScenarioValidationError([
          {
            path: ["reports"],
            code: "custom",
            message: "Synthetic seeded-failure fixture",
          },
        ]);
      return parsed;
    });
    const result = mutateScenario(flagship, 9, 3);
    expect(observed.filter((_, index) => index % 3 === 0).slice(0, 21)).toEqual(
      [
        9,
        ...Array.from({ length: 20 }, (_, index) =>
          random.hashString(String(10 + index)),
        ),
      ].map((seed) => seed ^ 0x51),
    );
    expect(result.meta.briefing.at(-1)).toContain("Warning: Seed 9");
    expect(result.reports).toEqual(flagship.reports);
    assertGates(result);
  });

  it("never returns an invalid fallback when verification has no useful candidate", () => {
    const invalid = structuredClone(flagship);
    invalid.assets.forEach((asset) => {
      asset.costUnits = 10000;
    });
    expect(() => mutateScenario(invalid, 12, 3)).toThrow(
      "no feasible nonnegative-net verification",
    );
    expect(() => mutateScenario(invalid, 0, 3)).toThrow(
      "no feasible nonnegative-net verification",
    );
  });

  it("does not swallow unexpected engine/validation failures as mutation retries", () => {
    const actual = loader.validateRuntimeScenario;
    vi.spyOn(loader, "validateRuntimeScenario")
      .mockImplementationOnce(actual)
      .mockImplementation(() => {
        throw new Error("Unexpected validation failure");
      });
    expect(() => mutateScenario(flagship, 5, 3)).toThrow(
      "Unexpected validation failure",
    );
  });

  it("preserves reserved decoy IDs/groups by rejecting the seeded variant and warning on a valid deterministic fallback", () => {
    const base = structuredClone(flagship);
    const oldId = base.reports[0]!.id;
    base.reports[0]!.id = "DECOY1";
    base.reports[0]!.evidenceGroup = "GDECOY1";
    for (const event of base.events) {
      if (event.kind === "REPORT_ISSUE" && event.reportId === oldId)
        event.reportId = "DECOY1";
    }
    const result = mutateScenario(base, 3, 3);
    expect(result.reports).toEqual(base.reports);
    expect(result.meta.briefing.at(-1)).toContain("deterministic-only");
    assertGates(result);
  });

  it("opposes initial truth for decoys, not the later hidden truth", () => {
    const base = structuredClone(flagship);
    base.hypotheses[0]!.initialTruth = false;
    const result = mutateScenario(base, 23, 3);
    expect(result.reports.at(-1)).toMatchObject({ id: "DECOY1", stance: 1 });
    expect(result.hypotheses).toEqual(base.hypotheses);
    expect(
      result.events.filter((event) => event.kind === "TRUTH_CHANGE"),
    ).toEqual(base.events.filter((event) => event.kind === "TRUTH_CHANGE"));
  });

  it("scales sub-minute delays to at least 60 seconds", () => {
    const base = structuredClone(flagship);
    const delay = base.events.find(
      (event) => event.kind === "CHANNEL_DEGRADE" && event.mode === "DELAY",
    );
    if (!delay || delay.kind !== "CHANNEL_DEGRADE")
      throw new Error("Missing delay fixture");
    delay.extraDelaySec = 1;
    const result = mutateScenario(base, 0, 1);
    expect(
      result.events.find(
        (event) => event.kind === "CHANNEL_DEGRADE" && event.mode === "DELAY",
      ),
    ).toMatchObject({ extraDelaySec: 60 });
  });

  it("rejects missing contradiction, malformed bases and invalid ingress", () => {
    const noContradiction = structuredClone(flagship);
    noContradiction.reports.forEach((report) => {
      if (report.stance !== 0) report.stance = 1;
    });
    expect(() => mutateScenario(noContradiction, 0, 3)).toThrow("no reachable");
    const malformed = structuredClone(flagship);
    malformed.reports[0]!.issuedAtSec += 1;
    expect(() => mutateScenario(malformed, 2, 3)).toThrow("times must match");
    for (const seed of [NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => mutateScenario(flagship, seed, 3)).toThrow();
    }
    // @ts-expect-error Exercise the runtime level boundary.
    expect(() => mutateScenario(flagship, 0, 6)).toThrow();
  });

  it("keeps integer-second cutoff and horizon semantics without minute rounding or duration extension", () => {
    const base = structuredClone(flagship);
    base.decisionPoints[0]!.closeSec = 1801;
    const result = mutateScenario(base, 0, 1);
    expect(result.decisionPoints[0]!.closeSec).toBe(2041);
    expect(result.meta.durationSec).toBe(2160);
    assertGates(result);
    const tooShort = structuredClone(base);
    tooShort.meta.durationSec = 1861;
    expect(() => mutateScenario(tooShort, 1, 1)).toThrow("Exercise horizon");
  });
});
