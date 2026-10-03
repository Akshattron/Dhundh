import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildTeamMetrics } from "../../src/engine/team";
import { TeamMetricsPanel } from "../../src/features/aar/TeamMetricsPanel";
import { flagship, logFor } from "../engine/fixtures";

afterEach(cleanup);
describe("team metrics presentation", () => {
  it("shows authoritative values, source counts, timeline context and limitations", () => {
    const report = buildTeamMetrics(
      flagship,
      logFor(
        [
          { type: "START", t: 0, role: "INSTRUCTOR" },
          { type: "RELAY", t: 600, role: "ANALYST", reportId: "R04" },
          {
            type: "SET_ESTIMATE",
            t: 600,
            role: "ANALYST",
            hypothesisId: "north_pass",
            p: 0.5,
          },
          {
            type: "SET_ESTIMATE",
            t: 750,
            role: "COMMANDER",
            hypothesisId: "north_pass",
            p: 0.5,
          },
          {
            type: "DECIDE",
            t: 900,
            role: "COMMANDER",
            actionId: "STAND_DOWN",
            rationale: null,
          },
        ],
        flagship,
        { mode: "NETWORKED" },
      ),
    );
    render(<TeamMetricsPanel report={report} />);
    expect(screen.getByTestId("sharing-rate-DP1").textContent).toBe("100.0%");
    expect(screen.getByTestId("convergence-DP1").textContent).toBe("100.0%");
    expect(screen.getByTestId("coordination-latency-DP1").textContent).toBe(
      "30.0 sec",
    );
    expect(
      screen.getByText(/1 of 1 meaningful original reports sent/),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "DP1 relay responses" }).textContent,
    ).toContain("12:00");
    expect(screen.getByText(/not a composite team score/)).toBeTruthy();
    expect(screen.getByText("Exact definitions and limitations")).toBeTruthy();
  });

  it("distinguishes absent data from zero latency or perfect convergence", () => {
    const report = buildTeamMetrics(
      flagship,
      logFor([{ type: "START", t: 0, role: "INSTRUCTOR" }], flagship, {
        mode: "NETWORKED",
      }),
    );
    render(<TeamMetricsPanel report={report} />);
    expect(screen.getByText("No opportunities")).toBeTruthy();
    expect(screen.getByText("Both estimates needed")).toBeTruthy();
    expect(screen.getByText("No matched response")).toBeTruthy();
    expect(
      screen.getByText(/No Analyst-to-Commander relay actions/),
    ).toBeTruthy();
  });
});
