// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalSession } from "../../src/session/LocalSessionClient";
import { flagship } from "../engine/fixtures";

const clients: ReturnType<typeof createLocalSession>[] = [];

function createClient(speedSecPerMin = 4) {
  const client = createLocalSession(flagship, {
    seed: 0,
    difficultyLevel: flagship.meta.difficulty,
    aidMode: "ALWAYS",
    speedSecPerMin,
  });
  clients.push(client);
  return client;
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
  vi.useRealTimers();
});

describe("LocalSessionClient", () => {
  it("advances on its configured simulation clock and holds time while paused", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const client = createClient(2);
    expect(client.getSnapshot().phase).toBe("IDLE");

    client.dispatch({ type: "START" });
    expect(client.getSnapshot().phase).toBe("RUNNING");
    vi.advanceTimersByTime(2000);
    expect(client.getSnapshot().nowSec).toBe(60);

    client.dispatch({ type: "PAUSE" });
    const pausedAt = client.getSnapshot().nowSec;
    vi.advanceTimersByTime(4000);
    expect(client.getSnapshot().nowSec).toBe(pausedAt);

    client.dispatch({ type: "RESUME" });
    vi.advanceTimersByTime(2000);
    expect(client.getSnapshot().nowSec).toBe(pausedAt + 60);
  });

  it("replaces the accepted-intent log on reset and stops publishing after disposal", () => {
    const client = createClient();
    let updates = 0;
    const unsubscribe = client.subscribe(() => {
      updates += 1;
    });
    client.dispatch({ type: "START" });
    client.advanceToSeconds(180);
    client.dispatch({ type: "OPEN_REPORT", reportId: "R01" });
    expect(client.getLog().intents.map((intent) => intent.type)).toEqual([
      "START",
      "OPEN_REPORT",
    ]);
    expect(client.getSnapshot().reports[0]?.opened).toBe(true);

    client.dispatch({ type: "RESET" });
    expect(client.getSnapshot().phase).toBe("IDLE");
    expect(client.getSnapshot().nowSec).toBe(0);
    expect(client.getLog().intents).toEqual([]);

    const beforeDispose = updates;
    client.dispose();
    unsubscribe();
    client.dispatch({ type: "START" });
    expect(updates).toBe(beforeDispose);
  });

  it("runs the recommended flagship path through a real consequence and scoreable AAR", () => {
    const client = createClient();
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
    expect(client.getSnapshot().phase).toBe("CONSEQUENCE");
    expect(client.getSnapshot().truth).toBeUndefined();
    client.advanceToSeconds(2160);

    expect(client.getSnapshot()).toMatchObject({
      phase: "COMPLETE",
      aarReady: true,
      truth: { north_pass: false, south_ford: true },
      consequence: { headline: expect.any(String) },
    });
    expect(client.getAar().scores.trainingScore).toBeCloseTo(88.47, 1);
    expect(client.getAar().header.completedAtIso).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(client.getLog().intents).toHaveLength(13);
  });
});
