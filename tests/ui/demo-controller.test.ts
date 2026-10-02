// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoController } from "../../src/features/demo/DemoController";
import type { SessionClient } from "../../src/session/SessionClient";
import { flagship } from "../engine/fixtures";

const clients: SessionClient[] = [];

function createDemo() {
  const controller = new DemoController(flagship);
  const client = controller.createSession();
  clients.push(client);
  return { controller, client };
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
  vi.useRealTimers();
});

describe("DemoController", () => {
  it("starts the exact deterministic local presentation preset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { client } = createDemo();

    expect(client.getSnapshot()).toMatchObject({
      phase: "RUNNING",
      nowSec: 0,
      aidMode: "ALWAYS",
    });
    expect(client.getLog()).toMatchObject({
      seed: 0,
      difficultyLevel: 3,
      mode: "LOCAL",
      aidMode: "ALWAYS",
      intents: [{ type: "START", t: 0, role: "SOLO" }],
    });

    vi.advanceTimersByTime(2000);
    expect(client.getSnapshot().nowSec).toBe(60);
  });

  it("steps to the next real engine event and jumps to the authored WOW state", () => {
    const { controller, client } = createDemo();

    expect(controller.stepForward(client)).toMatchObject({ ok: true });
    expect(client.getSnapshot().nowSec).toBe(180);
    expect(client.getSnapshot().reports.map((report) => report.id)).toContain(
      "R01",
    );
    client.advanceToSeconds(21 * 60);
    const fogBeforeDelayedReport =
      client.getSnapshot().belief?.fogIndex ?? Number.NaN;

    const result = controller.skipToWow(client);
    const view = client.getSnapshot();
    expect(result).toMatchObject({ ok: true });
    expect(view.nowSec).toBe(22 * 60);
    expect(view.channels.find((channel) => channel.id === "LAND")?.health).toBe(
      "DEGRADED",
    );
    expect(view.reports.find((report) => report.id === "R06")?.delaySec).toBe(
      6 * 60,
    );
    expect(view.belief?.fogIndex).toBeGreaterThan(fogBeforeDelayedReport);
    expect(controller.isWow(view)).toBe(true);
  });

  it("opens the legal decision window without committing a decision", () => {
    const { controller, client } = createDemo();

    const result = controller.skipToDecision(client);
    const view = client.getSnapshot();
    expect(result).toMatchObject({ ok: true });
    expect(view.phase).toBe("RUNNING");
    expect(view.decisionPoint?.status).toBe("OPEN");
    expect(view.decisions).toEqual([]);
  });

  it("reaches AAR through the engine's recorded timeout path", () => {
    const { controller, client } = createDemo();

    const result = controller.skipToAar(client);
    const view = client.getSnapshot();
    expect(result).toMatchObject({ ok: true, complete: true });
    expect(view.phase).toBe("COMPLETE");
    expect(view.aarReady).toBe(true);
    expect(view.decisions).toHaveLength(1);
    expect(view.decisions[0]?.timedOut).toBe(true);
    expect(client.getAar().header.timedOut).toBe(true);
    expect(Number.isFinite(client.getAar().scores.trainingScore)).toBe(true);
    expect(client.getLog().intents.map((intent) => intent.type)).toEqual([
      "START",
    ]);
  });

  it("preserves an unexpected legal action through consequence and AAR", () => {
    const { controller, client } = createDemo();
    expect(controller.skipToDecision(client).ok).toBe(true);
    client.dispatch({
      type: "SET_ESTIMATE",
      hypothesisId: "north_pass",
      p: 0.55,
    });
    client.dispatch({
      type: "DECIDE",
      actionId: "GO_NORTH",
      rationale: {
        text: "Presenter-selected alternative",
        citedReportIds: [],
        tags: ["PRIORITIZED_TIME"],
      },
    });

    expect(client.getSnapshot().phase).toBe("CONSEQUENCE");
    expect(client.getSnapshot().truth).toBeUndefined();
    expect(controller.skipToAar(client)).toMatchObject({
      ok: true,
      complete: true,
    });
    expect(client.getAar().decision).toMatchObject({
      actionId: "GO_NORTH",
      timedOut: false,
      rationale: { text: "Presenter-selected alternative" },
    });
  });

  it("refuses presenter progression while paused", () => {
    const { controller, client } = createDemo();
    client.dispatch({ type: "PAUSE" });
    const before = client.getSnapshot().nowSec;

    expect(controller.stepForward(client)).toMatchObject({ ok: false });
    expect(controller.skipToWow(client)).toMatchObject({ ok: false });
    expect(controller.skipToDecision(client)).toMatchObject({ ok: false });
    expect(controller.skipToAar(client)).toMatchObject({ ok: false });
    expect(client.getSnapshot().nowSec).toBe(before);
    expect(client.getSnapshot().phase).toBe("PAUSED");
  });
});
