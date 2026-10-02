import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Route, Routes, MemoryRouter } from "react-router-dom";
import AppShell from "../../src/components/AppShell";
import AarPage from "../../src/features/aar/AarPage";
import BriefingPage from "../../src/features/briefing/BriefingPage";
import DemoPage from "../../src/features/demo/DemoPage";
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
          <Route path="/aar/:id" element={<AarPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  useSessionStore.getState().clear();
});

describe("local trainee journey", () => {
  it("browses a validated scenario, starts the engine, and opens a delivered report", () => {
    renderJourney("/scenarios");
    fireEvent.click(screen.getByTestId("scenario-launch"));
    expect(screen.getByText("Exercise briefing")).toBeTruthy();

    fireEvent.click(screen.getByTestId("start-exercise"));
    expect(screen.getByText("Live local exercise · synthetic")).toBeTruthy();
    expect(useSessionStore.getState().view?.phase).toBe("RUNNING");

    act(() => useSessionStore.getState().client?.advanceToSeconds(180));
    expect(screen.getByTestId("open-report-R01")).toBeTruthy();
    fireEvent.click(screen.getByTestId("open-report-R01"));
    expect(screen.getByText("Opened")).toBeTruthy();
  });

  it("quick-starts the same real local scenario from the deterministic demo entry", () => {
    renderJourney("/demo");
    fireEvent.click(screen.getByTestId("demo-start"));
    expect(screen.getAllByText("Live local exercise · synthetic")).toHaveLength(
      1,
    );
    expect(useSessionStore.getState().client?.getLog()).toMatchObject({
      seed: 0,
      mode: "LOCAL",
      intents: [{ type: "START", t: 0, role: "SOLO" }],
    });
    expect(useSessionStore.getState().view?.scenario.id).toBe(
      scenarios[0].meta.id,
    );
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
    expect(screen.getByTestId("aar-scrubber")).toBeTruthy();
    expect(screen.getByText("88.5")).toBeTruthy();
  });
});
