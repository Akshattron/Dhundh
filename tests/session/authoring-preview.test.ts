// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLocalSession,
  type LocalSessionClient,
} from "../../src/session/LocalSessionClient";
import { scenarioHash } from "../../src/engine/scenarioLoader";
import { flagship } from "../engine/fixtures";

const clients: LocalSessionClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
  vi.useRealTimers();
});
describe("authored local preview", () => {
  it("preserves authored difficulty and second-normalized timing instead of mutating it", () => {
    vi.useFakeTimers();
    const scenario = structuredClone(flagship);
    scenario.meta.difficulty = 1;
    const before = JSON.stringify(scenario);
    const client = createLocalSession(scenario, {
      seed: 0,
      difficultyLevel: 1,
      aidMode: "ALWAYS",
      speedSecPerMin: 4,
      authoredPreview: true,
    });
    clients.push(client);
    expect(client.getLog().scenarioHash).toBe(scenarioHash(scenario));
    expect(client.getSnapshot().scenario.difficulty).toBe(1);
    expect(client.getSnapshot().decisionPoint?.closeSec).toBe(1800);
    client.dispatch({ type: "START" });
    vi.advanceTimersByTime(4000);
    expect(client.getSnapshot().nowSec).toBe(60);
    expect(client.getSnapshot().truth).toBeUndefined();
    expect(JSON.stringify(scenario)).toBe(before);
    client.dispose();
    const stopped = client.getSnapshot();
    vi.advanceTimersByTime(4000);
    expect(client.getSnapshot()).toBe(stopped);
  });

  it("retains validation/readiness gates and refuses misleading preview configuration", () => {
    const options = {
      seed: 0,
      difficultyLevel: 3,
      aidMode: "ALWAYS",
      speedSecPerMin: 4,
      authoredPreview: true,
    } as const;
    expect(() => createLocalSession(flagship, { ...options, seed: 5 })).toThrow(
      "seed 0",
    );
    expect(() =>
      createLocalSession(flagship, { ...options, difficultyLevel: 1 }),
    ).toThrow("authored difficulty");
    const scenario = structuredClone(flagship);
    scenario.decisionPoints[0]!.assets = [];
    expect(() => createLocalSession(scenario, options)).toThrow("verification");
  });
});
