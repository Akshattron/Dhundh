// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import kestrel from "../../src/scenarios/kestrel-relief-corridor.json";
import { scenarios } from "../../src/scenarios";
import {
  enumerateStates,
  loadScenario,
  ScenarioValidationError,
  scenarioHash,
  validateRuntimeScenario,
} from "../../src/engine/scenarioLoader";
import {
  scenarioAuthoringSchema,
  scenarioRuntimeSchema,
} from "../../src/engine/scenarioSchema";

type Authored = typeof kestrel;
const invalidCases: [string, (raw: Authored) => void, string][] = [
  [
    "synthetic disclosure",
    (raw) => {
      raw.meta.synthetic = false;
    },
    "synthetic",
  ],
  [
    "scenario ID",
    (raw) => {
      raw.meta.id = "Not Kebab Case";
    },
    "meta.id",
  ],
  [
    "duplicate reports",
    (raw) => {
      raw.reports.push(raw.reports[0]!);
    },
    "Duplicate ID",
  ],
  [
    "duplicate channels",
    (raw) => {
      raw.channels[1] = raw.channels[0]!;
    },
    "Duplicate ID",
  ],
  [
    "missing channel",
    (raw) => {
      raw.channels.pop();
    },
    "channels",
  ],
  [
    "duplicate hypotheses",
    (raw) => {
      raw.hypotheses[1]!.id = "north_pass";
    },
    "Duplicate ID",
  ],
  [
    "no primary",
    (raw) => {
      raw.hypotheses[0]!.primary = false;
    },
    "primary",
  ],
  [
    "two primaries",
    (raw) => {
      raw.hypotheses[1]!.primary = true;
    },
    "primary",
  ],
  [
    "zero prior",
    (raw) => {
      raw.hypotheses[0]!.prior = 0;
    },
    "prior",
  ],
  [
    "unit prior",
    (raw) => {
      raw.hypotheses[0]!.prior = 1;
    },
    "prior",
  ],
  [
    "half reliability",
    (raw) => {
      raw.reports[0]!.rho = 0.5;
    },
    "rho",
  ],
  [
    "unit reliability",
    (raw) => {
      raw.assets[0]!.rho = 1;
    },
    "rho",
  ],
  [
    "nonfinite number",
    (raw) => {
      raw.meta.durationMin = Infinity;
    },
    "durationMin",
  ],
  [
    "invalid half-minute",
    (raw) => {
      raw.reports[0]!.issuedAtMin = 3.1;
    },
    "issuedAtMin",
  ],
  [
    "negative time",
    (raw) => {
      raw.events[0]!.atMin = -1;
    },
    "atMin",
  ],
  [
    "zero decay",
    (raw) => {
      raw.channels[0]!.tauMin = 0;
    },
    "tauMin",
  ],
  [
    "neutral hypothesis",
    (raw) => {
      raw.reports[0]!.stance = 0;
    },
    "stance",
  ],
  [
    "informational stance",
    (raw) => {
      raw.reports[4]!.stance = 1;
    },
    "stance",
  ],
  [
    "empty evidence group",
    (raw) => {
      raw.reports[0]!.evidenceGroup = "";
    },
    "evidenceGroup",
  ],
  [
    "unknown report hypothesis",
    (raw) => {
      raw.reports[0]!.hypothesisId = "missing";
    },
    "Unknown reference",
  ],
  [
    "unknown report channel",
    (raw) => {
      raw.reports[0]!.channel = "OTHER";
    },
    "channel",
  ],
  [
    "missing issue",
    (raw) => {
      raw.events = raw.events.filter((event) => event.reportId !== "R01");
    },
    "exactly one",
  ],
  [
    "duplicate issue",
    (raw) => {
      raw.events.push(raw.events.find((event) => event.reportId === "R01")!);
    },
    "exactly one",
  ],
  [
    "unknown issued report",
    (raw) => {
      raw.events.find((event) => event.reportId === "R01")!.reportId =
        "MISSING";
    },
    "Unknown reference",
  ],
  [
    "mismatched issue",
    (raw) => {
      raw.reports[0]!.issuedAtMin = 4;
    },
    "times must match",
  ],
  [
    "unknown truth hypothesis",
    (raw) => {
      raw.events[0]!.hypothesisId = "missing";
    },
    "Unknown reference",
  ],
  [
    "backdated restore",
    (raw) => {
      raw.events[1]!.untilMin = 15;
    },
    "follow degradation",
  ],
  [
    "missing delay amount",
    (raw) => {
      delete raw.events[1]!.extraDelayMin;
    },
    "extraDelaySec",
  ],
  [
    "zero capacity",
    (raw) => {
      raw.assets[0]!.capacity = 0;
    },
    "capacity",
  ],
  [
    "fractional capacity",
    (raw) => {
      raw.assets[0]!.capacity = 0.5;
    },
    "capacity",
  ],
  [
    "negative asset cost",
    (raw) => {
      raw.assets[0]!.costUnits = -1;
    },
    "costUnits",
  ],
  [
    "unknown asset hypothesis",
    (raw) => {
      raw.assets[0]!.hypothesisId = "missing";
    },
    "Unknown reference",
  ],
  [
    "unknown DP asset",
    (raw) => {
      raw.decisionPoints[0]!.assets.push("MISSING");
    },
    "Unknown reference",
  ],
  [
    "unknown required estimate",
    (raw) => {
      raw.decisionPoints[0]!.requiredEstimates.push("missing");
    },
    "Unknown reference",
  ],
  [
    "infeasible asset",
    (raw) => {
      raw.assets[0]!.delayMin = 18;
    },
    "strictly before close",
  ],
  [
    "invalid window",
    (raw) => {
      raw.decisionPoints[0]!.closeMin = 12;
    },
    "after open",
  ],
  [
    "unknown timeout action",
    (raw) => {
      raw.decisionPoints[0]!.timeoutActionId = "MISSING";
    },
    "Unknown reference",
  ],
  [
    "duplicate actions",
    (raw) => {
      raw.decisionPoints[0]!.actions.push(raw.decisionPoints[0]!.actions[0]!);
    },
    "Duplicate ID",
  ],
  [
    "utility coverage",
    (raw) => {
      raw.decisionPoints[0]!.actions[0]!.utility.pop();
    },
    "No rule covers",
  ],
  [
    "consequence coverage",
    (raw) => {
      raw.decisionPoints[0]!.actions[0]!.consequences.pop();
    },
    "No rule covers",
  ],
  [
    "weight sum",
    (raw) => {
      raw.scoreWeights.timeliness = 0.2;
    },
    "sum to 1",
  ],
  [
    "negative weight",
    (raw) => {
      raw.scoreWeights.timeliness = -0.1;
    },
    "timeliness",
  ],
  [
    "outcome weight cap",
    (raw) => {
      raw.scoreWeights.outcome = 0.2;
      raw.scoreWeights.decisionQuality = 0.35;
    },
    "exceed 0.15",
  ],
  [
    "calibration weight cap",
    (raw) => {
      raw.scoreWeights.calibration = 0.1;
      raw.scoreWeights.decisionQuality = 0.35;
    },
    "exceed 0.05",
  ],
  [
    "outcome bounds",
    (raw) => {
      raw.outcomeScale.min = 100;
    },
    "less than maximum",
  ],
  [
    "exercise horizon",
    (raw) => {
      raw.meta.durationMin = 30;
    },
    "at least 1860",
  ],
];

describe("scenario contract", () => {
  it("preserves every authored flagship value from master Section 18.2", () => {
    const master = readFileSync(
      new URL(
        "../../COPILOT_MASTER_ENGINEERING_SPEC_AUDITED_v1.2.md",
        import.meta.url,
      ),
      "utf8",
    );
    const section = master.split("### 18.2 CREATE")[1]?.split("18.2.1 JSON")[0];
    const json = section?.match(/```json\s*([\s\S]*?)```/)?.[1];
    expect(json).toBeDefined();
    expect(kestrel).toEqual(JSON.parse(json!));
  });

  it("validates and registers only the implemented flagship through the loader", () => {
    const scenario = loadScenario(kestrel);
    expect(scenarioAuthoringSchema.safeParse(kestrel).success).toBe(true);
    expect(scenarioRuntimeSchema.safeParse(scenario).success).toBe(true);
    expect(scenarios).toEqual([scenario]);
    expect(scenario.meta).toMatchObject({
      id: "kestrel-relief-corridor",
      synthetic: true,
      version: 1,
      durationSec: 2160,
    });
  });

  it("converts once and inserts each automatic restore beside its source", () => {
    const rawBefore = JSON.stringify(kestrel);
    const scenario = loadScenario(kestrel);
    expect(scenario.events.slice(0, 5)).toEqual([
      {
        kind: "TRUTH_CHANGE",
        atSec: 840,
        hypothesisId: "north_pass",
        value: false,
      },
      {
        kind: "CHANNEL_DEGRADE",
        atSec: 960,
        channel: "LAND",
        mode: "DELAY",
        extraDelaySec: 360,
        untilSec: 1560,
        note: kestrel.events[1]!.note,
      },
      { kind: "CHANNEL_RESTORE", atSec: 1560, channel: "LAND" },
      {
        kind: "CHANNEL_DEGRADE",
        atSec: 1080,
        channel: "AIR",
        mode: "DROPOUT",
        untilSec: 1440,
        note: kestrel.events[2]!.note,
      },
      { kind: "CHANNEL_RESTORE", atSec: 1440, channel: "AIR" },
    ]);
    expect(scenario.channels[0]).toMatchObject({
      tauSec: 1200,
      baseDelaySec: 0,
    });
    expect(scenario.assets.map((asset) => asset.delaySec)).toEqual([360, 300]);
    expect(scenario.decisionPoints[0]).toMatchObject({
      openSec: 720,
      closeSec: 1800,
      departureSec: 720,
    });
    expect(
      scenario.decisionPoints[0]!.actions[1]!.consequences.map(
        (rule) => rule.arrivalSec,
      ),
    ).toEqual([420, 360]);
    expect(scenario.injectPresets[0]!.effect).toMatchObject({
      extraDelaySec: 360,
      durationSec: 600,
    });
    expect(JSON.stringify(scenario)).not.toMatch(
      /"(?:at|until|duration|issuedAt|arrival|delay|extraDelay|open|close|departure|tau|baseDelay)Min":/,
    );
    expect(() => loadScenario(scenario)).toThrow(ScenarioValidationError);
    expect(validateRuntimeScenario(scenario)).toEqual(scenario);
    expect(JSON.stringify(kestrel)).toBe(rawBefore);
  });

  it("accepts half-minute authoring and integer-second normalized changes", () => {
    const raw = structuredClone(kestrel);
    raw.reports[0]!.issuedAtMin = 3.5;
    raw.events.find((event) => event.reportId === "R01")!.atMin = 3.5;
    const scenario = loadScenario(raw);
    expect(scenario.reports[0]!.issuedAtSec).toBe(210);
    scenario.reports[0]!.issuedAtSec = 211;
    scenario.events.find(
      (event) => event.kind === "REPORT_ISSUE" && event.reportId === "R01",
    )!.atSec = 211;
    expect(validateRuntimeScenario(scenario).reports[0]!.issuedAtSec).toBe(211);
    scenario.reports[0]!.issuedAtSec = 211.5;
    expect(() => validateRuntimeScenario(scenario)).toThrow("issuedAtSec");
  });

  it.each(invalidCases)(
    "rejects %s deterministically with an actionable path",
    (_, change, message) => {
      const raw = structuredClone(kestrel);
      change(raw);
      const errors: string[] = [];
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          loadScenario(raw);
          expect.fail("Invalid scenario was accepted");
        } catch (error) {
          expect(error).toBeInstanceOf(ScenarioValidationError);
          if (!(error instanceof ScenarioValidationError)) throw error;
          expect(error.message).toContain(message);
          expect(error.message).toMatch(/\$\.[a-zA-Z]/);
          expect(error.issues.length).toBeGreaterThan(0);
          errors.push(error.message);
        }
      }
      expect(errors[0]).toBe(errors[1]);
    },
  );

  it("rejects unknown keys recursively and author-written restores", () => {
    for (const raw of [
      { ...kestrel, extra: true },
      { ...kestrel, meta: { ...kestrel.meta, extra: true } },
      {
        ...kestrel,
        reports: [
          { ...kestrel.reports[0], extra: true },
          ...kestrel.reports.slice(1),
        ],
      },
      {
        ...kestrel,
        assets: [
          {
            ...kestrel.assets[0],
            resultClaims: { ...kestrel.assets[0]!.resultClaims, extra: true },
          },
          ...kestrel.assets.slice(1),
        ],
      },
      {
        ...kestrel,
        events: [
          ...kestrel.events,
          { kind: "CHANNEL_RESTORE", atMin: 26, channel: "LAND" },
        ],
      },
    ]) {
      expect(() => loadScenario(raw)).toThrow(ScenarioValidationError);
    }
  });

  it("rejects unknown rule keys and missing normalized restores", () => {
    const scenario = loadScenario(kestrel);
    scenario.decisionPoints[0]!.actions[0]!.utility[0]!.when.missing = true;
    expect(() => validateRuntimeScenario(scenario)).toThrow("when.missing");
    scenario.events = scenario.events.filter(
      (event) => event.kind !== "CHANNEL_RESTORE",
    );
    expect(() => validateRuntimeScenario(scenario)).toThrow(
      "matching automatic restore",
    );
  });

  it("accepts partial first-match rules, shared evidence groups and no-assets DPs", () => {
    const raw = structuredClone(kestrel);
    raw.reports[1]!.evidenceGroup = "G1";
    raw.assets = [];
    raw.decisionPoints[0]!.assets = [];
    const scenario = loadScenario(raw);
    expect(scenario.decisionPoints[0]!.actions[2]!.utility).toEqual([
      { when: {}, value: 10 },
    ]);
    expect(scenario.assets).toEqual([]);
  });

  it("enumerates all joint truth states in deterministic hypothesis order", () => {
    const scenario = loadScenario(kestrel);
    expect(enumerateStates(scenario.hypotheses)).toEqual([
      { north_pass: false, south_ford: false },
      { north_pass: true, south_ford: false },
      { north_pass: false, south_ford: true },
      { north_pass: true, south_ford: true },
    ]);
    expect(enumerateStates([])).toEqual([{}]);
    expect(() =>
      enumerateStates(Array.from({ length: 7 }, () => scenario.hypotheses[0]!)),
    ).toThrow(RangeError);
  });

  it("hashes canonical runtime JSON, preserving arrays and UTF-8/UTF-16 rules", () => {
    const scenario = loadScenario(kestrel);
    const { summary, ...metadata } = scenario.meta;
    const reordered = { ...scenario, meta: { summary, ...metadata } };
    expect(scenarioHash(reordered)).toBe(scenarioHash(scenario));
    expect(scenarioHash(scenario)).toMatch(/^[0-9a-f]{8}$/);

    scenario.meta.title =
      "Synthetic \u0938\u0942\u091a\u0928\u093e \ud83c\udf2b";
    for (const id of ["2", "10", "\ue000", "\ud800\udc00"]) {
      scenario.hypotheses.push({
        id,
        label: id,
        trueLabel: "Yes",
        falseLabel: "No",
        prior: 0.5,
        primary: false,
        initialTruth: false,
      });
    }
    scenario.decisionPoints[0]!.actions[0]!.utility.unshift({
      when: { "2": true, "10": false, "\ue000": true, "\ud800\udc00": false },
      value: 10,
    });
    const canonical = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
      if (value !== null && typeof value === "object") {
        const entries = Object.entries(value);
        return `{${entries
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
          .join(",")}}`;
      }
      return JSON.stringify(value);
    };
    let expected = 0x811c9dc5;
    for (const byte of Buffer.from(canonical(scenario), "utf8")) {
      expected = Math.imul(expected ^ byte, 0x01000193) >>> 0;
    }
    expect(scenarioHash(validateRuntimeScenario(scenario))).toBe(
      expected.toString(16).padStart(8, "0"),
    );
    const reversed = { ...scenario, reports: [...scenario.reports].reverse() };
    expect(scenarioHash(reversed)).not.toBe(scenarioHash(scenario));
    expect(() =>
      scenarioHash({
        ...scenario,
        meta: { ...scenario.meta, durationSec: NaN },
      }),
    ).toThrow("finite JSON");
  });
});
