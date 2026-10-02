import { describe, expect, it } from "vitest";
import {
  advanceTo,
  applyIntent,
  createSession,
  projectTraineeView,
} from "../../src/engine";
import { flagship } from "./fixtures";

function accept(
  state: ReturnType<typeof createSession>,
  intent: Parameters<typeof applyIntent>[2],
) {
  const result = applyIntent(state, flagship, intent);
  expect(result.result).toMatchObject({ ok: true });
  return result.state;
}

describe("authoritative analyst relay", () => {
  it("keeps analyst-only evidence private until a structured relay arrives", () => {
    let state = createSession(flagship, {
      seed: 0,
      difficultyLevel: 3,
      mode: "NETWORKED",
      aidMode: "ALWAYS",
    });
    state = accept(state, { type: "START", t: 0, role: "INSTRUCTOR" });
    state = advanceTo(state, flagship, 900).state;

    const beforeView = projectTraineeView(flagship, state, "COMMANDER");
    const before = JSON.stringify(beforeView);
    expect(before).not.toContain('"id":"R04"');
    expect(before).not.toContain('"truth"');
    expect(
      JSON.stringify(projectTraineeView(flagship, state, "ANALYST")),
    ).toContain('"id":"R04"');

    state = accept(state, {
      type: "RELAY",
      t: 900,
      role: "ANALYST",
      reportId: "R04",
      note: "Sensor feed conflicts with patrol timing",
    });
    const pending = state.reports.RLY1;
    expect(pending).toMatchObject({
      status: "IN_TRANSIT",
      origin: "RELAY",
      deliveredAtSec: 1020,
      def: { issuedAtSec: 480, evidenceGroup: "G4" },
      relayedFrom: { role: "ANALYST", atSec: 900 },
    });
    expect(
      JSON.stringify(projectTraineeView(flagship, state, "COMMANDER")),
    ).not.toContain('"id":"RLY1"');

    state = advanceTo(state, flagship, 1020).state;
    const commander = projectTraineeView(flagship, state, "COMMANDER");
    expect(commander.reports).toContainEqual(
      expect.objectContaining({
        id: "RLY1",
        origin: "RELAY",
        evidenceGroup: "G4",
      }),
    );
    expect(JSON.stringify(commander)).not.toContain('"id":"R04"');
    expect(commander.belief?.perHypothesis.north_pass?.p).not.toBe(
      beforeView.belief?.perHypothesis.north_pass?.p,
    );
  });

  it("rejects unauthorized, hidden, undelivered, and over-capacity relays", () => {
    let state = createSession(flagship, {
      seed: 0,
      difficultyLevel: 3,
      mode: "NETWORKED",
      aidMode: "ALWAYS",
    });
    state = accept(state, { type: "START", t: 0, role: "INSTRUCTOR" });
    state = advanceTo(state, flagship, 900).state;

    const commander = applyIntent(state, flagship, {
      type: "RELAY",
      t: 900,
      role: "COMMANDER",
      reportId: "R04",
    });
    expect(commander.result).toMatchObject({
      ok: false,
      error: "RELAY_FORBIDDEN",
    });
    const hidden = applyIntent(state, flagship, {
      type: "RELAY",
      t: 900,
      role: "ANALYST",
      reportId: "R05",
    });
    expect(hidden.result).toMatchObject({ ok: false, error: "UNKNOWN_REPORT" });

    for (const reportId of ["R04", "R04", "R04", "R04"]) {
      const relay = applyIntent(state, flagship, {
        type: "RELAY",
        t: 900,
        role: "ANALYST",
        reportId,
      });
      if (state.relays.length < 3) {
        expect(relay.result.ok).toBe(true);
        state = relay.state;
      } else {
        expect(relay.result).toMatchObject({ ok: false, error: "RELAY_LIMIT" });
      }
    }
  });

  it("rejects a client attempt to forge relay provenance", () => {
    const state = createSession(flagship, {
      seed: 0,
      difficultyLevel: 3,
      mode: "NETWORKED",
      aidMode: "ALWAYS",
    });
    const result = applyIntent(state, flagship, {
      type: "RELAY",
      t: 0,
      role: "COMMANDER",
      reportId: "R04",
    });
    expect(result.result).toMatchObject({
      ok: false,
      error: "RELAY_FORBIDDEN",
    });
    expect(result.state.relays).toEqual([]);
  });
});
