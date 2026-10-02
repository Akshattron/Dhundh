import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Route, Routes, MemoryRouter } from "react-router-dom";
import AppShell from "../../src/components/AppShell";
import AarPage from "../../src/features/aar/AarPage";
import BriefingPage from "../../src/features/briefing/BriefingPage";
import DemoPage from "../../src/features/demo/DemoPage";
import HistoryPage from "../../src/features/history/HistoryPage";
import HomePage from "../../src/features/home/HomePage";
import ScenarioLibraryPage from "../../src/features/library/ScenarioLibraryPage";
import SessionPage from "../../src/features/session/SessionPage";
import { scenarios } from "../../src/scenarios";
import { createLocalSession } from "../../src/session/LocalSessionClient";
import { useSessionStore } from "../../src/state/useSessionStore";

function renderJourney(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/scenarios" element={<ScenarioLibraryPage />} />
          <Route path="/scenario/:id/briefing" element={<BriefingPage />} />
          <Route path="/session/local/:id" element={<SessionPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/aar/:id" element={<AarPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  useSessionStore.getState().clear();
  localStorage.clear();
});

describe("local trainee journey", () => {
  it("withholds reference aid in estimate-first mode until the trainee estimates", () => {
    const scenario = scenarios[0]!;
    const client = createLocalSession(scenario, {
      seed: 0,
      difficultyLevel: scenario.meta.difficulty,
      aidMode: "AFTER_ESTIMATE",
      speedSecPerMin: 4,
    });
    client.dispatch({ type: "START" });
    client.advanceToSeconds(720);
    useSessionStore.getState().setClient(client, client.getSnapshot());
    renderJourney(`/session/local/${scenario.meta.id}`);

    expect(
      screen.queryByRole("button", { name: /Reference model/ }),
    ).toBeNull();
    expect(
      screen.getByText(
        "Reference aid unlocks after your first probability estimate.",
      ),
    ).toBeTruthy();

    const primary = scenario.hypotheses.find(
      (hypothesis) => hypothesis.primary,
    );
    if (!primary)
      throw new Error("Flagship scenario must define a primary hypothesis.");
    act(() =>
      client.dispatch({
        type: "SET_ESTIMATE",
        hypothesisId: primary.id,
        p: 0.6,
      }),
    );
    expect(
      screen.getByRole("button", { name: /Reference model/ }),
    ).toBeTruthy();
  });

  it("shows local learning analytics without requiring prior session data", () => {
    renderJourney("/history");
    expect(
      screen.getByRole("heading", { name: "Session history" }),
    ).toBeTruthy();
    expect(screen.getByText("Learning signals")).toBeTruthy();
    expect(
      screen.getByText(
        "Completed AARs will appear here after they are opened.",
      ),
    ).toBeTruthy();
  });

  it("browses a validated scenario, starts the engine, and opens a delivered report", () => {
    renderJourney("/scenarios");
    const flagshipCard = screen
      .getByText(scenarios[0]!.meta.title)
      .closest("article");
    expect(flagshipCard).not.toBeNull();
    fireEvent.click(within(flagshipCard!).getByTestId("scenario-launch"));
    expect(screen.getByText("Exercise briefing")).toBeTruthy();

    fireEvent.click(screen.getByTestId("start-exercise"));
    expect(screen.getByText("Live local exercise · synthetic")).toBeTruthy();
    expect(useSessionStore.getState().view?.phase).toBe("RUNNING");

    act(() => useSessionStore.getState().client?.advanceToSeconds(180));
    expect(screen.getByTestId("open-report-R01")).toBeTruthy();
    fireEvent.click(screen.getByTestId("open-report-R01"));
    expect(screen.getByText("Opened")).toBeTruthy();
  });

  it("launches the deterministic demo and presenter in one action from Home", () => {
    renderJourney("/");
    fireEvent.click(screen.getByTestId("run-flagship-demo"));
    expect(screen.getByTestId("demo-presenter-controls")).toBeTruthy();
    expect(screen.getByTestId("demo-guide")).toBeTruthy();
    expect(screen.getAllByText("Live local exercise · synthetic")).toHaveLength(
      1,
    );
    expect(useSessionStore.getState().client?.getLog()).toMatchObject({
      seed: 0,
      difficultyLevel: 3,
      mode: "LOCAL",
      aidMode: "ALWAYS",
      intents: [{ type: "START", t: 0, role: "SOLO" }],
    });
    expect(useSessionStore.getState().experience).toBe("DEMO");
    expect(useSessionStore.getState().view?.scenario.id).toBe(
      scenarios[0].meta.id,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss presenter guide" }),
    );
    expect(screen.queryByTestId("demo-guide")).toBeNull();
    fireEvent.click(screen.getByTestId("demo-skip-wow"));
    expect(useSessionStore.getState().view?.nowSec).toBe(22 * 60);
    expect(screen.getByTestId("demo-wow")).toBeTruthy();
    expect(screen.getByText(/^\+\d\.\d{2} since prior event$/)).toBeTruthy();
  });

  it("opens an AAR derived from the completed engine run with replay controls", () => {
    const scenario = scenarios[0];
    const client = createLocalSession(scenario, {
      seed: 0,
      difficultyLevel: scenario.meta.difficulty,
      aidMode: "ALWAYS",
      speedSecPerMin: 4,
    });
    client.dispatch({ type: "START" });
    client.advanceToSeconds(540);
    for (const reportId of ["R01", "R02", "R03", "R04"]) {
      client.dispatch({ type: "OPEN_REPORT", reportId });
    }
    client.advanceToSeconds(1080);
    client.dispatch({
      type: "SET_ESTIMATE",
      hypothesisId: "north_pass",
      p: 0.8,
    });
    client.dispatch({ type: "OPEN_REPORT", reportId: "R05" });
    client.advanceToSeconds(1320);
    client.dispatch({ type: "OPEN_REPORT", reportId: "R06" });
    client.dispatch({ type: "VERIFY", assetId: "UAV_SORTIE" });
    client.advanceToSeconds(1440);
    client.dispatch({ type: "OPEN_REPORT", reportId: "R07" });
    client.advanceToSeconds(1680);
    client.dispatch({ type: "OPEN_REPORT", reportId: "V01" });
    client.dispatch({
      type: "SET_ESTIMATE",
      hypothesisId: "north_pass",
      p: 0.25,
    });
    client.dispatch({
      type: "DECIDE",
      actionId: "GO_SOUTH",
      rationale: {
        text: "Rockfall report plus the sortie result outweigh the stale clear reports.",
        citedReportIds: ["R06", "V01"],
        tags: ["WEIGHED_CONTRADICTION", "AWAITED_VERIFICATION"],
      },
    });
    client.advanceToSeconds(2160);
    useSessionStore.getState().setClient(client, client.getSnapshot());

    renderJourney(`/session/local/${scenario.meta.id}`);
    fireEvent.click(screen.getByTestId("open-aar"));
    expect(screen.getByText("Decision-quality profile")).toBeTruthy();
    expect(
      screen.getByText("Truth at decision · revealed after completion"),
    ).toBeTruthy();
    const scrubber = screen.getByTestId("aar-scrubber") as HTMLInputElement;
    expect(scrubber).toBeTruthy();
    expect(screen.getByText("88.5")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Was additional information worth its cost?",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Knew" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Play replay at 4x" }),
    ).toBeTruthy();
    expect(
      screen.getAllByText("COUNTERFACTUAL — simulated, not what happened")
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Coach notes" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "End" }));
    expect(screen.getByText("1 decision")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Truth" }));
    expect(screen.getByText(/Post-mortem truth at/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Never saw" }));
    expect(screen.getByText(/Information not available by/)).toBeTruthy();
  }, 15000);

  it("keeps local instructor injects segregated and reproduces their effect", () => {
    const scenario = scenarios[0];
    const client = createLocalSession(scenario, {
      seed: 0,
      difficultyLevel: scenario.meta.difficulty,
      aidMode: "ALWAYS",
      speedSecPerMin: 4,
    });
    client.dispatch({ type: "START" });
    client.advanceToSeconds(600);
    useSessionStore.getState().setClient(client, client.getSnapshot());

    renderJourney(`/session/local/${scenario.meta.id}?controls=1`);
    expect(
      screen.queryByText("Diagnostics — not visible to trainees"),
    ).toBeNull();
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.keyDown(window, { key: "1" });
    expect(client.getInstructorDiagnostics().channels).toContainEqual({
      id: "LAND",
      health: "DEGRADED",
      mode: "DELAY",
    });
    expect(
      screen.queryByText("Diagnostics — not visible to trainees"),
    ).toBeNull();
    expect(screen.getByText("Control drawer")).toBeTruthy();
    fireEvent.keyDown(window, { key: "m" });
    expect(
      screen.getByText("Diagnostics — not visible to trainees"),
    ).toBeTruthy();
    fireEvent.keyDown(window, { key: "t" });
    expect(screen.getByText(/north_pass: (false|true)/)).toBeTruthy();
    expect(client.getLog().intents.at(-1)).toMatchObject({
      type: "INJECT",
      presetId: "JAM_LAND",
      role: "INSTRUCTOR",
      t: 600,
    });
    expect(
      client.getLog().intents.filter((intent) => intent.type === "INJECT"),
    ).toHaveLength(1);
  });
});
