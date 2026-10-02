// @vitest-environment node
import { describe, expect, it } from "vitest";
import { advanceTo, applyIntent, projectTraineeView } from "../../src/engine";
import { config, flagship, started } from "./fixtures";

function keysRecursively(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysRecursively);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) => [
    key,
    ...keysRecursively(entry),
  ]);
}

describe("trainee projection", () => {
  it("withholds truth, future reports, raw stance/reliability, and uninspected detail", () => {
    const state = advanceTo(started(), flagship, 600).state;
    const view = projectTraineeView(flagship, state, "SOLO");
    expect(view.reports.map((report) => report.id)).toEqual([
      "R04",
      "R03",
      "R02",
      "R01",
    ]);
    expect(JSON.stringify(view)).not.toContain("R05");
    expect(JSON.stringify(view)).not.toContain("R10");
    expect(keysRecursively(view)).not.toContain("truth");
    expect(keysRecursively(view)).not.toContain("initialTruth");
    expect(keysRecursively(view)).not.toContain("rho");
    expect(keysRecursively(view)).not.toContain("stance");
    expect(view.reports.every((report) => report.detail === null)).toBe(true);
    expect(
      view.reports.every((report) => report.contributionNats === null),
    ).toBe(true);
  });

  it("projects report detail/math only after inspection and aid gates", () => {
    let state = advanceTo(started(), flagship, 600).state;
    const request = applyIntent(state, flagship, {
      type: "OPEN_REPORT",
      t: 600,
      role: "SOLO",
      reportId: "R01",
    });
    expect(request.result.ok).toBe(true);
    state = request.state;
    let view = projectTraineeView(flagship, state, "SOLO");
    expect(
      view.reports.find((report) => report.id === "R01")?.detail,
    ).toBeTruthy();
    expect(
      view.reports.find((report) => report.id === "R01")?.contributionNats,
    ).not.toBeNull();
    expect(
      view.reports.find((report) => report.id === "R02")?.detail,
    ).toBeNull();

    const gated = structuredClone(flagship);
    const afterEstimateSession = started(gated, {
      ...config,
      aidMode: "AFTER_ESTIMATE",
    });
    const progressed = advanceTo(afterEstimateSession, gated, 600).state;
    view = projectTraineeView(gated, progressed, "SOLO");
    expect(view.belief).toBeNull();
    expect(view.beliefHidden).toBe(true);
  });

  it("reveals the truth and selected consequence only after COMPLETE", () => {
    const startedState = started();
    const complete = advanceTo(startedState, flagship, 1980).state;
    const view = projectTraineeView(flagship, complete, "SOLO");
    expect(view.truth).toEqual({ north_pass: false, south_ford: true });
    expect(view.consequence?.headline).toBe("Convoy holds at Camp Alder");
    expect(view.aarReady).toBe(true);
  });
});
