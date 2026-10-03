// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import flagshipJson from "../../src/scenarios/kestrel-relief-corridor.json";
import harbourJson from "../../src/scenarios/harbour-flood-response.json";
import {
  AUTHORING_MAX_CHARACTERS,
  validateScenarioDraft,
} from "../../src/engine/authoring";
import { assessScenarioReadiness } from "../../src/engine/scenarioReadiness";
import { scenarioHash } from "../../src/engine/scenarioLoader";
import { flagship, freeze } from "./fixtures";

describe("bounded scenario authoring pipeline", () => {
  it.each([
    [flagshipJson, "1f7af0fb"],
    [harbourJson, "cdcc6039"],
  ] as const)(
    "validates bundled authoring JSON without rewriting it",
    (raw, hash) => {
      const text = JSON.stringify(raw, null, 2);
      const before = text;
      const result = validateScenarioDraft(text);
      expect(result.previewReady).toBe(true);
      expect(result.checks.every((check) => check.status === "PASS")).toBe(
        true,
      );
      expect(result.issues).toEqual([]);
      expect(result.hash).toBe(hash);
      expect(text).toBe(before);
      expect(result.scenario?.meta.durationSec).toBe(raw.meta.durationMin * 60);
      expect(JSON.parse(text)).not.toHaveProperty("meta.durationSec");
    },
  );

  it("distinguishes syntax failures, schema errors, runtime references, and coverage errors", () => {
    expect(validateScenarioDraft("{").checks[0]?.status).toBe("FAIL");
    const schema = structuredClone(flagshipJson);
    schema.meta.synthetic = false;
    expect(validateScenarioDraft(JSON.stringify(schema)).issues[0]?.path).toBe(
      "meta.synthetic",
    );
    const reference = structuredClone(flagshipJson);
    reference.reports[0]!.hypothesisId = "unknown";
    expect(
      validateScenarioDraft(JSON.stringify(reference)).issues.some(
        (issue) => issue.path === "reports.0.hypothesisId",
      ),
    ).toBe(true);
    const badTiming = structuredClone(flagshipJson);
    badTiming.decisionPoints[0]!.closeMin =
      badTiming.decisionPoints[0]!.openMin;
    expect(
      validateScenarioDraft(JSON.stringify(badTiming)).issues.some(
        (issue) => issue.path === "decisionPoints.0.closeSec",
      ),
    ).toBe(true);
    const uncovered = structuredClone(flagshipJson);
    uncovered.decisionPoints[0]!.actions[0]!.utility = [
      uncovered.decisionPoints[0]!.actions[0]!.utility[0]!,
    ];
    uncovered.decisionPoints[0]!.actions[0]!.consequences = [
      uncovered.decisionPoints[0]!.actions[0]!.consequences[0]!,
    ];
    const result = validateScenarioDraft(JSON.stringify(uncovered));
    expect(
      result.checks
        .filter((check) => check.name.endsWith("coverage"))
        .map((check) => check.status),
    ).toEqual(["FAIL", "FAIL"]);
    expect(result.scenario).toBeNull();
    expect(result.previewReady).toBe(false);
  });

  it("separates legal schema/invariants from unavailable training readiness", () => {
    const noAssets = structuredClone(flagshipJson);
    noAssets.decisionPoints.forEach((point) => {
      point.assets = [];
    });
    const result = validateScenarioDraft(JSON.stringify(noAssets));
    expect(result.scenario).not.toBeNull();
    expect(
      result.checks.find((check) => check.name === "Runtime invariants")
        ?.status,
    ).toBe("PASS");
    expect(
      result.checks.find((check) => check.name === "Feasible verification")
        ?.status,
    ).toBe("FAIL");
    expect(result.previewReady).toBe(false);
    const noConflict = structuredClone(flagshipJson);
    noConflict.reports.forEach((report) => {
      if (report.hypothesisId === "north_pass") report.stance = 1;
    });
    expect(
      validateScenarioDraft(JSON.stringify(noConflict)).checks.find(
        (check) => check.name === "Reachable contradiction",
      )?.status,
    ).toBe("FAIL");
  });

  it("bounds text, entity counts, time horizons, and consequence delays before simulation", () => {
    expect(
      validateScenarioDraft(" ".repeat(AUTHORING_MAX_CHARACTERS + 1)).issues[0]
        ?.message,
    ).toContain("limit");
    for (const alter of [
      (raw: typeof flagshipJson) => {
        raw.reports = Array.from({ length: 65 }, () => raw.reports[0]!);
      },
      (raw: typeof flagshipJson) => {
        raw.decisionPoints[0]!.closeMin = 1_000_000;
      },
      (raw: typeof flagshipJson) => {
        raw.decisionPoints[0]!.actions[0]!.consequences[0]!.arrivalMin = 1_000_000;
      },
    ]) {
      const raw = structuredClone(flagshipJson);
      alter(raw);
      const result = validateScenarioDraft(JSON.stringify(raw));
      expect(
        result.checks.find((check) => check.name === "Editor resource limits")
          ?.status,
      ).toBe("FAIL");
      expect(result.scenario).toBeNull();
    }
  });

  it("rejects code and normalized runtime JSON instead of evaluating or double-converting them", () => {
    expect(
      validateScenarioDraft('(() => { throw new Error("executed"); })()')
        .checks[0]?.status,
    ).toBe("FAIL");
    const normalized = validateScenarioDraft(JSON.stringify(flagship));
    expect(
      normalized.checks.find((check) => check.name === "Authoring schema")
        ?.status,
    ).toBe("FAIL");
    expect(normalized.previewReady).toBe(false);
  });

  it("reuses the pure minute-grid gate and preserves automatic restores exactly once", () => {
    const scenario = freeze(structuredClone(flagship));
    const before = scenarioHash(scenario);
    const date = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Wall clock");
    });
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Random global");
    });
    try {
      expect(assessScenarioReadiness(scenario)).toEqual(
        assessScenarioReadiness(scenario),
      );
      const result = validateScenarioDraft(JSON.stringify(flagshipJson));
      expect(result.readiness).toEqual(assessScenarioReadiness(scenario));
      expect(
        result.scenario?.events.filter(
          (event) => event.kind === "CHANNEL_RESTORE",
        ).length,
      ).toBe(
        flagship.events.filter((event) => event.kind === "CHANNEL_RESTORE")
          .length,
      );
      expect(scenarioHash(scenario)).toBe(before);
    } finally {
      date.mockRestore();
      random.mockRestore();
    }
  });
});
