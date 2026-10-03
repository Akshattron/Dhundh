import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "../../src/components/AppShell";
import AarPage from "../../src/features/aar/AarPage";
import DemoPage from "../../src/features/demo/DemoPage";
import { DemoController } from "../../src/features/demo/DemoController";
import SessionPage from "../../src/features/session/SessionPage";
import PresentationPage from "../../src/features/presentation/PresentationPage";
import { createLocalSession } from "../../src/session/LocalSessionClient";
import { RemoteSessionClient } from "../../src/session/RemoteSessionClient";
import { useCompletedAar } from "../../src/session/useCompletedAar";
import { useSessionView } from "../../src/session/useSessionView";
import { visibleTimeline } from "../../src/session/visibleTimeline";
import { useSessionStore } from "../../src/state/useSessionStore";
import { buildAar, type Aar } from "../../src/engine/aar";
import { buildTeamAar } from "../../server/teamAar";
import { SessionManager } from "../../server/sessions";
import { flagship } from "../engine/fixtures";

class TestSocket extends EventTarget {
  static OPEN = 1;
  static instances: TestSocket[] = [];
  readyState = TestSocket.OPEN;
  sent: string[] = [];
  constructor() {
    super();
    TestSocket.instances.push(this);
  }
  send(text: string) {
    this.sent.push(text);
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
  receive(value: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(value) }),
    );
  }
}
const managers: SessionManager[] = [];
const remotes: RemoteSessionClient[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  useSessionStore.getState().clear();
  remotes.splice(0).forEach((remote) => remote.dispose());
  managers.splice(0).forEach((manager) => manager.removeAll());
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of [
    "fullscreenElement",
    "fullscreenEnabled",
    "exitFullscreen",
  ])
    Reflect.deleteProperty(document, key);
  Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
  TestSocket.instances.length = 0;
  vi.useRealTimers();
});

function show(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/presentation/:mode/:id"
            element={<PresentationPage />}
          />
          <Route path="/session/local/:id" element={<SessionPage />} />
          <Route path="/session/network/:id" element={<SessionPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/aar/:id" element={<AarPage />} />
          <Route path="/" element={<h1>Home</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
function local(aidMode: "ALWAYS" | "AFTER_ESTIMATE" = "ALWAYS") {
  const client = createLocalSession(flagship, {
    seed: 0,
    difficultyLevel: 3,
    aidMode,
    speedSecPerMin: 4,
  });
  client.dispatch({ type: "START" });
  useSessionStore.getState().setClient(client, client.getSnapshot());
  return client;
}
function demo() {
  const client = new DemoController(flagship).createSession();
  useSessionStore.getState().setClient(client, client.getSnapshot(), "DEMO");
  return client;
}
function fullscreenSupport() {
  let element: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => element,
  });
  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    value: true,
  });
  const enter = vi.fn(function (this: HTMLElement) {
    element = this;
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  });
  const exit = vi.fn(() => {
    element = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: enter,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exit,
  });
  return { enter, exit };
}
async function remote(
  role: "COMMANDER" | "ANALYST" | "INSTRUCTOR" = "COMMANDER",
) {
  vi.stubGlobal("WebSocket", TestSocket);
  let now = 0;
  const manager = new SessionManager([flagship], { now: () => now });
  managers.push(manager);
  const { session, credential } = manager.create({
    scenarioId: flagship.meta.id,
    seed: 0,
    difficultyLevel: 3,
    aidMode: "AFTER_ESTIMATE",
  });
  const commander = manager.join({
    code: session.code,
    role: "COMMANDER",
    name: "Commander",
  }).participant;
  const analyst = manager.join({
    code: session.code,
    role: "ANALYST",
    name: "Analyst",
  }).participant;
  const participant =
    role === "INSTRUCTOR"
      ? session.clients.get(credential.clientId)!
      : role === "COMMANDER"
        ? commander
        : analyst;
  manager.dispatch(credential.clientId, { type: "START" });
  const client = RemoteSessionClient.join({
    code: session.code,
    role,
    name: participant.name,
  });
  remotes.push(client);
  const socket = TestSocket.instances.at(-1)!;
  socket.dispatchEvent(new Event("open"));
  socket.receive({
    type: "WELCOME",
    clientId: participant.clientId,
    token: participant.token,
    role,
    view: manager.view(session, participant),
  });
  await client.ready;
  const publish = () =>
    socket.receive({ type: "VIEW", view: manager.view(session, participant) });
  const advance = (atSec: number) => {
    now +=
      (((atSec - session.state.nowSec) * session.speedSecPerMin) / 60) * 1000;
    manager.advanceClocks(now);
    publish();
  };
  const restart = () => {
    manager.dispatch(credential.clientId, { type: "RESET" });
    manager.dispatch(credential.clientId, { type: "START" });
    advance(1980);
  };
  return {
    client,
    manager,
    session,
    commander,
    analyst,
    socket,
    advance,
    publish,
    restart,
  };
}

describe("live presentation", () => {
  it("subscribes to real client snapshots, simplifies chrome and restores contextual focus without resetting", async () => {
    const client = demo();
    show("/demo");
    const log = JSON.stringify(client.getLog());
    fireEvent.click(screen.getByTestId("enter-presentation"));
    expect(
      screen.queryByRole("navigation", { name: "Primary navigation" }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Exit presentation" }),
    );
    act(() => client.advanceToSeconds(180));
    expect(screen.getByTestId("presentation-clock").textContent).toBe("3:00");
    expect(
      screen.getByRole("region", { name: "Visible event timeline" })
        .textContent,
    ).toContain("R01 delivered");
    expect(useSessionStore.getState().view?.nowSec).toBe(0);
    expect(JSON.stringify(client.getLog())).toBe(log);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Exit presentation" }),
      ),
    );
    expect(screen.getByTestId("session-clock").textContent).toContain("3:00");
    expect(document.activeElement).toBe(
      screen.getByTestId("enter-presentation"),
    );
    expect(useSessionStore.getState().client).toBe(client);
    expect(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeTruthy();
  });

  it("supports owned fullscreen, native state changes, Escape and cleanup without disposing the exercise", async () => {
    const client = local();
    const api = fullscreenSupport();
    const { unmount } = show(`/presentation/local/${flagship.meta.id}`);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" })),
    );
    expect(api.enter).toHaveBeenCalledOnce();
    expect(
      screen
        .getByRole("button", { name: "Leave fullscreen" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await act(async () => fireEvent.keyDown(window, { key: "Escape" }));
    expect(api.exit).toHaveBeenCalledOnce();
    expect(screen.getByTestId("presentation-page")).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" })),
    );
    unmount();
    expect(api.exit).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(4000));
    expect(client.getSnapshot().nowSec).toBe(60);
  });

  it("surfaces unsupported and denied fullscreen while preserving the windowed view", async () => {
    local();
    show(`/presentation/local/${flagship.meta.id}`);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" })),
    );
    expect(screen.getByRole("alert").textContent).toContain("not supported");
    const api = fullscreenSupport();
    api.enter.mockRejectedValueOnce(new Error("Fullscreen permission denied"));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" })),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "permission denied",
    );
    expect(screen.getByTestId("presentation-clock").textContent).toBe("0:00");
  });

  it("withholds aid, uninspected report internals and truth until authorized by the real session", () => {
    const client = local("AFTER_ESTIMATE");
    client.advanceToSeconds(1320);
    show(`/presentation/local/${flagship.meta.id}`);
    expect(screen.getByTestId("presentation-belief").textContent).toBe(
      "Withheld",
    );
    expect(screen.getByTestId("presentation-fog").textContent).toBe("Withheld");
    expect(screen.queryByTestId("presentation-aar")).toBeNull();
    expect(
      screen.queryByText(
        /effective accuracy|truth at decision|outcome revealed/i,
      ),
    ).toBeNull();
    const log = client.getLog();
    act(() =>
      client.dispatch({
        type: "SET_ESTIMATE",
        hypothesisId: "north_pass",
        p: 0.4,
      }),
    );
    expect(screen.getByTestId("presentation-belief").textContent).not.toBe(
      "Withheld",
    );
    expect(client.getLog().intents).toHaveLength(log.intents.length + 1);
    expect(screen.getByText(/Truth and outcome are withheld/)).toBeTruthy();
  });

  it("uses the real demo controller for WOW, pause, decision, completion and reset without intercepting typing", async () => {
    demo();
    show(`/presentation/demo/${flagship.meta.id}`);
    const input = document.createElement("textarea");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "j" });
    expect(screen.getByTestId("presentation-clock").textContent).toBe("0:00");
    input.remove();
    fireEvent.keyDown(window, { key: "j" });
    expect(screen.getByTestId("presentation-clock").textContent).toBe("12:00");
    fireEvent.click(screen.getByRole("button", { name: "Show WOW event" }));
    expect(screen.getByTestId("presentation-wow")).toBeTruthy();
    expect(screen.getByTestId("presentation-clock").textContent).toBe("22:00");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    const time = useSessionStore.getState().client?.getSnapshot().nowSec;
    fireEvent.keyDown(window, { key: "a" });
    expect(useSessionStore.getState().client?.getSnapshot().nowSec).toBe(time);
    expect(screen.getByRole("alert").textContent).toContain("Resume");
    fireEvent.click(screen.getByRole("button", { name: "Run / resume" }));
    fireEvent.keyDown(window, { key: "a" });
    expect(screen.getByTestId("presentation-aar").textContent).toContain(
      "Post-completion review",
    );
    expect(useSessionStore.getState().client?.getSnapshot().phase).toBe(
      "COMPLETE",
    );
    fireEvent.keyDown(window, { key: "d" });
    expect(screen.queryByTestId("presentation-aar")).toBeNull();
    expect(screen.getByTestId("presentation-clock").textContent).toBe("0:00");
    await act(async () => fireEvent.keyDown(window, { key: "i" }));
    expect(screen.getByText("Control drawer")).toBeTruthy();
  });

  it("opens the actual decision console and avoids rebuilding completed AAR for presentation-only state", async () => {
    const client = demo();
    show(`/presentation/demo/${flagship.meta.id}`);
    fireEvent.keyDown(window, { key: "j" });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Open decision console" }),
      ),
    );
    expect(screen.getByTestId("decide-GO_SOUTH")).toBeTruthy();
    cleanup();
    act(() => client.advanceToSeconds(1980));
    const build = vi.spyOn(client, "getAar");
    show(`/presentation/demo/${flagship.meta.id}`);
    const before = JSON.stringify(client.getLog());
    const calls = build.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));
    fireEvent.click(screen.getByRole("button", { name: "Shortcuts" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Enter fullscreen" })),
    );
    expect(build).toHaveBeenCalledTimes(calls);
    expect(JSON.stringify(client.getLog())).toBe(before);
  });

  it.each([
    "/presentation/unknown/missing",
    "/presentation/local/missing",
    "/presentation/network/AAAAAA",
  ])("provides deliberate recovery for %s", (path) => {
    local();
    show(path);
    expect(screen.getByRole("alert").textContent).toMatch(
      /Unsupported|unavailable/,
    );
    expect(screen.queryByTestId("presentation-fog")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open flagship demo" }),
    ).toBeTruthy();
  });

  it("uses only the network role projection and labels disconnection rather than advancing the server clock", async () => {
    const fixture = await remote();
    fixture.advance(540);
    useSessionStore
      .getState()
      .setClient(fixture.client, fixture.client.getSnapshot());
    show(`/presentation/network/${fixture.session.code}`);
    expect(screen.getByTestId("presentation-clock").textContent).toBe("9:00");
    expect(
      screen.getByRole("region", { name: "Visible event timeline" })
        .textContent,
    ).not.toContain("R04");
    expect(screen.queryByTestId("presentation-aar")).toBeNull();
    act(() =>
      fixture.manager.dispatch(fixture.analyst.clientId, {
        type: "SET_ESTIMATE",
        hypothesisId: "north_pass",
        p: 0.99,
      }),
    );
    act(fixture.publish);
    expect(screen.getByTestId("presentation-belief").textContent).toBe(
      "Withheld",
    );
    act(() => fixture.socket.close());
    expect(screen.getByRole("alert").textContent).toContain(
      "Last authoritative snapshot",
    );
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByTestId("presentation-clock").textContent).toBe("9:00");
    expect(
      visibleTimeline(fixture.client.getSnapshot()).every(
        (event) => event.atSec <= 540,
      ),
    ).toBe(true);
  });

  it("does not present live instructor truth or diagnostics as a trainee/judge projection", async () => {
    const fixture = await remote("INSTRUCTOR");
    fixture.advance(540);
    expect(fixture.client.getSnapshot().truth).toBeDefined();
    useSessionStore
      .getState()
      .setClient(fixture.client, fixture.client.getSnapshot());
    show(`/presentation/network/${fixture.session.code}`);
    expect(
      screen.getByRole("heading", {
        name: "Use a trainee view for live presentation",
      }),
    ).toBeTruthy();
    expect(screen.queryByTestId("presentation-fog")).toBeNull();
    expect(screen.queryByTestId("presentation-aar")).toBeNull();
  });
});

function AarProbe({ client }: { client: RemoteSessionClient }) {
  const view = useSessionView(client);
  const { aar, error, loading, retry } = useCompletedAar(client, view);
  return (
    <div>
      {loading ? <p>Loading AAR</p> : null}
      {aar ? <p>{aar.scenario.title}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button onClick={retry}>Retry</button>
    </div>
  );
}
describe("completed network AAR lifecycle", () => {
  it("retries failures and refetches a reset/recompleted run even at the identical terminal second", async () => {
    const fixture = await remote();
    fixture.advance(1980);
    const aar = buildTeamAar(
      buildAar(fixture.session.scenario, fixture.session.log),
      fixture.session,
    );
    const fetchAar = vi
      .spyOn(fixture.client, "fetchAar")
      .mockRejectedValueOnce(new Error("Service unavailable"))
      .mockResolvedValue(aar);
    await act(async () => render(<AarProbe client={fixture.client} />));
    expect(screen.getByRole("alert").textContent).toBe("Service unavailable");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Retry" })),
    );
    expect(screen.getByText(flagship.meta.title)).toBeTruthy();
    await act(async () => fixture.restart());
    expect(fetchAar).toHaveBeenCalledTimes(3);
    expect(screen.getByText(flagship.meta.title)).toBeTruthy();
  });

  it("ignores an old in-flight AAR when a newer completed snapshot supersedes it", async () => {
    const fixture = await remote();
    fixture.advance(1980);
    const aar = buildTeamAar(
      buildAar(fixture.session.scenario, fixture.session.log),
      fixture.session,
    );
    let resolveOld: ((value: Aar) => void) | undefined;
    vi.spyOn(fixture.client, "fetchAar")
      .mockImplementationOnce(
        () =>
          new Promise<Aar>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue(aar);
    await act(async () => render(<AarProbe client={fixture.client} />));
    expect(screen.getByText("Loading AAR")).toBeTruthy();
    await act(async () => fixture.restart());
    expect(screen.getByText(flagship.meta.title)).toBeTruthy();
    await act(async () =>
      resolveOld?.({
        ...aar,
        scenario: { ...aar.scenario, title: "Stale response" },
      }),
    );
    expect(screen.queryByText("Stale response")).toBeNull();
    expect(screen.getByText(flagship.meta.title)).toBeTruthy();
  });
});
