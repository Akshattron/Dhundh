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
import { recordSessionHistory } from "../../src/session/history";

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
  it("traps local instructor focus and restores it on Escape or the toggle shortcut", () => {
    renderJourney("/demo");
    const trigger = screen.getByRole("button", {
      name: "Open instructor controls",
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "Local instructor controls",
    });
    const close = within(dialog).getByRole("button", {
      name: "Close instructor controls",
    });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    const last = within(dialog).getByRole("button", {
      name: "Show diagnostics",
    });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Local instructor controls" }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(window, { key: "i" });
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Close instructor controls" }),
      { key: "i" },
    );
    expect(
      screen.queryByRole("dialog", { name: "Local instructor controls" }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("shows the existing local attempt record in the scenario library", () => {
    recordSessionHistory({
      id: "visual-library-record",
      completedAt: "2026-10-03T10:00:00.000Z",
      scenarioId: scenarios[0].meta.id,
      scenarioTitle: scenarios[0].meta.title,
      difficultyLevel: 3,
      source: "LOCAL",
      decisionCount: 1,
      trainingScore: 83.2,
      decisionQuality: 0.8,
      outcome: 0.7,
      informationUse: 0.9,
      brierUser: null,
    });
    renderJourney("/scenarios");
    expect(screen.getByText("83.2 / 100")).toBeTruthy();
    expect(screen.getByText("Not attempted in this browser")).toBeTruthy();
  });

  it("keeps scenario entry available when attempt history cannot be read", () => {
    localStorage.setItem("dhundh.v1.session-history", "invalid");
    renderJourney("/scenarios");
    expect(screen.getByRole("alert").textContent).toContain(
      "Exercises remain available.",
    );
    expect(screen.getAllByTestId("scenario-launch")).toHaveLength(
      scenarios.length,
    );
    expect(screen.queryByText("Not attempted in this browser")).toBeNull();
  });

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
    expect(screen.getByText(/^\+\d+\.\d pp since pre-conflict$/)).toBeTruthy();
  });

  it("keeps the decision interval distinct from paused actions and supports console tab keys", () => {
    const scenario = scenarios[0];
    const client = createLocalSession(scenario, {
      seed: 0,
      difficultyLevel: 3,
      aidMode: "ALWAYS",
      speedSecPerMin: 4,
    });
    client.dispatch({ type: "START" });
    client.advanceToSeconds(1320);
    client.dispatch({ type: "PAUSE" });
    useSessionStore.getState().setClient(client, client.getSnapshot());
    renderJourney(`/session/local/${scenario.meta.id}`);
    expect(client.getSnapshot().decisionPoint?.status).toBe("UPCOMING");
    expect(screen.getByText(/Window open · 12:00–30:00/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Resume to decide",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    const before = client.getLog().intents.length;
    const row = screen.getAllByRole("button", {
      name: /Inspection unavailable while the clock/,
    })[0]!;
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(client.getLog().intents).toHaveLength(before);
    const evidence = screen.getByRole("tab", { name: "Evidence" });
    evidence.focus();
    fireEvent.keyDown(evidence, { key: "ArrowRight" });
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Situation" }),
    );
    expect(
      screen
        .getByRole("tab", { name: "Situation" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Decision" }),
    );
    expect(screen.getByRole("tabpanel", { name: "Decision" }).id).toBe(
      "console-decision",
    );
  });

  it("inspects the focused report and restores focus after decision and shortcut dialogs", () => {
    const scenario = scenarios[0];
    const client = createLocalSession(scenario, {
      seed: 0,
      difficultyLevel: 3,
      aidMode: "ALWAYS",
      speedSecPerMin: 4,
    });
    client.dispatch({ type: "START" });
    client.advanceToSeconds(1320);
    useSessionStore.getState().setClient(client, client.getSnapshot());
    renderJourney(`/session/local/${scenario.meta.id}`);
    const report = screen.getByTestId("open-report-R04").closest("article")!;
    act(() => report.focus());
    fireEvent.keyDown(report, { key: "Enter" });
    expect(client.getSnapshot().inspections).toContain("R04");
    expect(client.getSnapshot().inspections).not.toContain("R01");
    const trigger = screen.getByTestId("open-decision");
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "Close" });
    const last = within(dialog).getAllByRole("button").at(-1)!;
    expect(document.activeElement).toBe(close);
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Shortcuts" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
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
    expect(screen.getByTestId("replay-position").textContent).toContain(
      "At decision, before commitment",
    );
    fireEvent.click(
      screen.getByRole("heading", { name: "Verification" }).closest("summary")!,
    );
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

  it("separates a verification request from its post-commitment arrival and restores disclosure state after print", () => {
    const scenario = scenarios[0];
    const client = createLocalSession(scenario, {
      seed: 0,
      difficultyLevel: 3,
      aidMode: "ALWAYS",
      speedSecPerMin: 4,
    });
    client.dispatch({ type: "START" });
    client.advanceToSeconds(1380);
    client.dispatch({ type: "VERIFY", assetId: "UAV_SORTIE" });
    client.advanceToSeconds(1680);
    client.dispatch({
      type: "SET_ESTIMATE",
      hypothesisId: "north_pass",
      p: 0.25,
    });
    client.dispatch({ type: "DECIDE", actionId: "GO_SOUTH", rationale: null });
    expect(client.getSnapshot().engineError).toBeUndefined();
    client.advanceToSeconds(2160);
    const verification = client.getAar()?.verification;
    useSessionStore.getState().setClient(client, client.getSnapshot());
    const { container } = renderJourney(`/aar/${scenario.meta.id}`);
    fireEvent.click(
      screen.getByRole("heading", { name: "Verification" }).closest("summary")!,
    );
    expect(
      screen.getByText(
        /The result arrived at 29:00, after commitment at 28:00/,
      ),
    ).toBeTruthy();
    expect(client.getAar()?.verification).toEqual(verification);
    const closed = [
      ...container.querySelectorAll<HTMLDetailsElement>("details:not([open])"),
    ];
    expect(closed.length).toBeGreaterThan(5);
    fireEvent(window, new Event("beforeprint"));
    expect(container.querySelectorAll("details:not([open])")).toHaveLength(0);
    fireEvent(window, new Event("beforeprint"));
    fireEvent(window, new Event("afterprint"));
    expect(container.querySelectorAll("details:not([open])")).toHaveLength(
      closed.length,
    );
    expect(
      container.querySelector<HTMLDetailsElement>("#aar-verification")?.open,
    ).toBe(true);
  });

  it("plots only retained history values in recorded order without changing persistence", () => {
    for (const [index, trainingScore, decisionQuality] of [
      [1, 62, 0.4],
      [2, 83, 0.8],
    ] as const) {
      recordSessionHistory({
        id: `trend-${index}`,
        completedAt: `2026-10-0${index}T10:00:00.000Z`,
        scenarioId: scenarios[0].meta.id,
        scenarioTitle: scenarios[0].meta.title,
        difficultyLevel: 3,
        source: "LOCAL",
        decisionCount: 1,
        trainingScore,
        decisionQuality,
        outcome: 0.7,
        informationUse: 0.9,
        brierUser: null,
      });
    }
    const before = localStorage.getItem("dhundh.v1.session-history");
    renderJourney("/history");
    const chart = screen.getByRole("img", { name: /across 2 recorded runs/ });
    expect(
      [...chart.querySelectorAll("title")].map((title) => title.textContent),
    ).toEqual([
      `Run 1 · ${scenarios[0].meta.title}: training score 62.0 / 100; decision quality 40.0%`,
      `Run 2 · ${scenarios[0].meta.title}: training score 83.0 / 100; decision quality 80.0%`,
    ]);
    expect(localStorage.getItem("dhundh.v1.session-history")).toBe(before);
    expect(
      screen.getByText(/not predictions or validated improvement/),
    ).toBeTruthy();
  });

  it("does not portray unreadable history as zero recorded runs", () => {
    localStorage.setItem("dhundh.v1.session-history", "invalid");
    renderJourney("/history");
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/History is unavailable/)).toBeTruthy();
    expect(screen.queryByText("Recorded runs")).toBeNull();
  });

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
    expect(
      screen.getByRole("dialog", { name: "Local instructor controls" }),
    ).toBeTruthy();
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
