import { expect } from "vitest";
import kestrel from "../../src/scenarios/kestrel-relief-corridor.json";
import {
  applyIntent,
  createSession,
  loadScenario,
  scenarioHash,
} from "../../src/engine";
import type {
  Intent,
  ScenarioDef,
  SessionLog,
  SimState,
} from "../../src/engine";

export const flagship = loadScenario(kestrel);
export const config = {
  seed: 0,
  difficultyLevel: 3,
  mode: "LOCAL",
  aidMode: "ALWAYS",
} as const;
type Configuration = Parameters<typeof createSession>[1];

export function accept(
  state: SimState,
  intent: Intent,
  scenario: ScenarioDef = flagship,
): SimState {
  const applied = applyIntent(state, scenario, intent);
  expect(applied.result).toMatchObject({ ok: true });
  return applied.state;
}

export function started(
  scenario: ScenarioDef = flagship,
  options: Partial<Configuration> = {},
): SimState {
  const creation = { ...config, ...options };
  return accept(
    createSession(scenario, creation),
    {
      type: "START",
      t: 0,
      role: creation.mode === "LOCAL" ? "SOLO" : "INSTRUCTOR",
    },
    scenario,
  );
}

export function logFor(
  intents: Intent[],
  scenario: ScenarioDef = flagship,
  options: Partial<Configuration> = {},
): SessionLog {
  return {
    logVersion: 1,
    scenarioId: scenario.meta.id,
    scenarioVersion: scenario.meta.version,
    scenarioHash: scenarioHash(scenario),
    ...config,
    ...options,
    intents: structuredClone(intents),
  };
}

export function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
