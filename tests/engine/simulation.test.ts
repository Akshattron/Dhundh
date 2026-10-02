// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  advanceTo,
  applyIntent,
  createSession,
  validateRuntimeScenario,
} from "../../src/engine";
import type { Intent } from "../../src/engine";
import { readEvent } from "../../src/engine/events";
import { accept, config, flagship, freeze, started } from "./fixtures";

describe("session and phase foundation", () => {
  it("creates fresh deterministic IDLE state with no timeline or input sharing", () => {
    const initial = createSession(freeze(structuredClone(flagship)), config);
    expect(initial).toMatchObject({
      nowSec: 0,
      phase: "IDLE",
      seed: 0,
      difficultyLevel: 3,
      mode: "LOCAL",
      truth: { north_pass: true, south_ford: true },
      eventTimeline: [],
      processedEventCursor: 0,
      nextEventOrder: 0,
      decisions: [],
      verifications: [],
    });
    expect(
      Object.values(initial.reports).every(
        (report) => report.status === "SCHEDULED",
      ),
    ).toBe(true);
    expect(JSON.stringify(initial)).toBe(
      JSON.stringify(createSession(flagship, config)),
    );
    initial.reports.R01!.def.claim = "Changed only in this state";
    expect(flagship.reports[0]!.claim).not.toBe(initial.reports.R01!.def.claim);
    expect(advanceTo(initial, flagship, 900)).toEqual({
      state: initial,
      effects: [],
    });
  });

  it.each([
    { seed: NaN },
    { seed: Infinity },
    { seed: 0.5 },
    { difficultyLevel: 0 },
    { difficultyLevel: 6 },
    { difficultyLevel: 1.5 },
  ])("rejects malformed configuration %j", (options) => {
    expect(() => createSession(flagship, { ...config, ...options })).toThrow();
  });

  it("START at zero creates the running timeline and drains zero-time events", () => {
    const scenario = structuredClone(flagship);
    scenario.reports[0]!.issuedAtSec = 0;
    scenario.events.find(
      (event) => event.kind === "REPORT_ISSUE" && event.reportId === "R01",
    )!.atSec = 0;
    const initial = freeze(
      createSession(validateRuntimeScenario(scenario), config),
    );
    const result = applyIntent(initial, scenario, {
      type: "START",
      t: 0,
      role: "SOLO",
    });
    expect(result.state.phase).toBe("RUNNING");
    expect(result.state.reports.R01!.status).toBe("DELIVERED");
    expect(result.result).toMatchObject({
      ok: true,
      effects: [
        { kind: "PHASE_CHANGED", phase: "RUNNING", atSec: 0 },
        { kind: "REPORT_DELIVERED", reportId: "R01", atSec: 0 },
      ],
    });
    expect(initial.eventTimeline).toEqual([]);
    expect(
      applyIntent(createSession(flagship, config), flagship, {
        type: "START",
        t: 1,
        role: "SOLO",
      }).result,
    ).toMatchObject({ ok: false, error: "INVALID_TIME" });
    expect(
      applyIntent(result.state, scenario, { type: "START", t: 0, role: "SOLO" })
        .result,
    ).toMatchObject({ ok: false, error: "NOT_RUNNING" });
  });

  it("PAUSE freezes time and RESUME uses the frozen time", () => {
    const paused = accept(started(), { type: "PAUSE", t: 600, role: "SOLO" });
    freeze(paused);
    expect(paused).toMatchObject({
      phase: "PAUSED",
      nowSec: 600,
      pausedAtSec: 600,
    });
    const advance = advanceTo(paused, flagship, 1700);
    expect(advance.state).toBe(paused);
    expect(advance.effects).toEqual([]);
    expect(
      applyIntent(paused, flagship, { type: "RESUME", t: 601, role: "SOLO" })
        .result,
    ).toMatchObject({ error: "INVALID_TIME" });
    expect(
      applyIntent(paused, flagship, {
        type: "OPEN_REPORT",
        t: 600,
        reportId: "R01",
        role: "SOLO",
      }).result,
    ).toMatchObject({ error: "NOT_RUNNING" });
    const resumed = accept(paused, { type: "RESUME", t: 600, role: "SOLO" });
    expect(resumed).toMatchObject({
      phase: "RUNNING",
      nowSec: 600,
      pausedAtSec: null,
    });
    expect(advanceTo(resumed, flagship, 1200).state.nowSec).toBe(1200);
    expect(paused.phase).toBe("PAUSED");
  });

  it.each([-1, 899, 900.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid or backdated time %s without mutation",
    (time) => {
      const state = freeze(advanceTo(started(), flagship, 900).state);
      const advanced = advanceTo(state, flagship, time);
      expect(advanced.state).toBe(state);
      expect(advanced.effects).toEqual([]);
      expect(advanced.error?.code).toBe("INVALID_TIME");
      const applied = applyIntent(state, flagship, {
        type: "OPEN_REPORT",
        t: time,
        reportId: "R01",
        role: "SOLO",
      });
      expect(applied.state).toBe(state);
      expect(applied.result).toMatchObject({
        ok: false,
        error: "INVALID_TIME",
        effects: [],
      });
    },
  );

  it("never reads a wall clock or unseeded randomness", () => {
    const date = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("wall clock");
    });
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("random global");
    });
    try {
      const state = advanceTo(started(), flagship, 1980).state;
      expect(state.phase).toBe("COMPLETE");
      expect(date).not.toHaveBeenCalled();
      expect(random).not.toHaveBeenCalled();
    } finally {
      date.mockRestore();
      random.mockRestore();
    }
  });
});

describe("intent admission and action guards", () => {
  it("rejects malformed, unauthorized and invalid-time ingress before progression", () => {
    const state = freeze(advanceTo(started(), flagship, 600).state);
    const malformed = {
      type: "OPEN_REPORT",
      t: 1320,
      role: "SOLO",
      reportId: "R01",
      fromRole: "INSTRUCTOR",
    } as const;
    const requests: Intent[] = [
      malformed,
      {
        type: "DECIDE",
        t: 1320,
        role: "INSTRUCTOR",
        actionId: "GO_NORTH",
        rationale: null,
      },
      { type: "OPEN_REPORT", t: 599, role: "SOLO", reportId: "R01" },
      {
        type: "SET_ESTIMATE",
        t: 1320,
        role: "SOLO",
        hypothesisId: "north_pass",
        p: NaN,
      },
    ];
    for (const intent of requests) {
      const result = applyIntent(state, flagship, intent);
      expect(result.state).toBe(state);
      expect(result.result).toMatchObject({ ok: false, effects: [] });
      expect(result.state.nowSec).toBe(600);
    }
  });

  it("retains due progression and effects on an admitted state-guard rejection", () => {
    const state = freeze(started());
    for (const request of [
      {
        type: "DECIDE",
        t: 1320,
        role: "SOLO",
        actionId: "MISSING",
        rationale: null,
      },
      { type: "VERIFY", t: 1320, role: "SOLO", assetId: "MISSING" },
      {
        type: "SET_ESTIMATE",
        t: 1320,
        role: "SOLO",
        hypothesisId: "MISSING",
        p: 0.5,
      },
      { type: "OPEN_REPORT", t: 1320, role: "SOLO", reportId: "MISSING" },
    ] satisfies Intent[]) {
      const result = applyIntent(state, flagship, request);
      expect(result.result.ok).toBe(false);
      expect(result.state.nowSec).toBe(1320);
      expect(result.state.reports.R06!.status).toBe("DELIVERED");
      expect(result.result.effects).toContainEqual({
        kind: "REPORT_DELIVERED",
        reportId: "R06",
        atSec: 1320,
      });
      expect(result.state.inspections).toEqual([]);
      expect(result.state.estimates).toEqual([]);
      expect(result.state.verifications).toEqual([]);
      expect(result.state.decisions).toEqual([]);
      expect(result.state.nextSequence).toBe(state.nextSequence);
      expect(state.nowSec).toBe(0);
    }
  });

  it("uses the same unavailable-report error for missing, hidden, dropped and undelivered IDs", () => {
    const state = freeze(
      advanceTo(started(flagship, { mode: "NETWORKED" }), flagship, 1320).state,
    );
    for (const reportId of [
      "MISSING",
      "__proto__",
      "constructor",
      "R04",
      "R10",
      "R11",
      "R09",
    ]) {
      const result = applyIntent(state, flagship, {
        type: "OPEN_REPORT",
        t: 1320,
        role: "COMMANDER",
        reportId,
      });
      expect(result.result).toEqual({
        ok: false,
        error: "UNKNOWN_REPORT",
        message: "Report is not available",
        effects: [],
      });
      expect(result.state).toBe(state);
    }
  });

  it("records inspections once per report and role, not merely per report", () => {
    const scenario = structuredClone(flagship);
    scenario.channels[0]!.visibleTo.push("ANALYST");
    let state = started(scenario, { mode: "NETWORKED" });
    state = accept(
      state,
      { type: "OPEN_REPORT", t: 180, role: "COMMANDER", reportId: "R01" },
      scenario,
    );
    state = accept(
      state,
      { type: "OPEN_REPORT", t: 180, role: "COMMANDER", reportId: "R01" },
      scenario,
    );
    state = accept(
      state,
      { type: "OPEN_REPORT", t: 180, role: "ANALYST", reportId: "R01" },
      scenario,
    );
    expect(state.inspections).toEqual([
      { atSec: 180, role: "COMMANDER", reportId: "R01" },
      { atSec: 180, role: "ANALYST", reportId: "R01" },
    ]);
  });

  it("enforces own estimates and own aid gates without a bypass", () => {
    let state = started(flagship, {
      mode: "NETWORKED",
      aidMode: "AFTER_ESTIMATE",
    });
    expect(
      applyIntent(state, flagship, {
        type: "REVEAL_AID",
        t: 720,
        role: "COMMANDER",
      }).result,
    ).toMatchObject({ error: "ESTIMATE_REQUIRED" });
    state = accept(state, {
      type: "SET_ESTIMATE",
      t: 720,
      role: "ANALYST",
      hypothesisId: "north_pass",
      p: 0.8,
    });
    expect(state.aidRevealedAtSecByRole).toEqual({ ANALYST: 720 });
    expect(
      applyIntent(state, flagship, {
        type: "DECIDE",
        t: 720,
        role: "COMMANDER",
        actionId: "GO_NORTH",
        rationale: null,
      }).result,
    ).toMatchObject({ error: "ESTIMATE_REQUIRED" });
    state = accept(state, {
      type: "SET_ESTIMATE",
      t: 720,
      role: "COMMANDER",
      hypothesisId: "south_ford",
      p: 1,
    });
    expect(state.aidRevealedAtSecByRole.COMMANDER).toBeUndefined();
    state = accept(state, {
      type: "SET_ESTIMATE",
      t: 720,
      role: "COMMANDER",
      hypothesisId: "north_pass",
      p: 0,
    });
    state = accept(state, { type: "REVEAL_AID", t: 720, role: "COMMANDER" });
    const decided = accept(state, {
      type: "DECIDE",
      t: 720,
      role: "COMMANDER",
      actionId: "GO_NORTH",
      rationale: null,
    });
    expect(decided.decisions[0]).toMatchObject({
      estimates: { north_pass: 0, south_ford: 1 },
      consultedAid: true,
    });
    expect(decided.aidRevealedAtSecByRole).toEqual({
      ANALYST: 720,
      COMMANDER: 720,
    });
  });

  it.each(["START", "PAUSE", "RESUME", "RESET"] as const)(
    "forbids Commander lifecycle action %s without progression",
    (type) => {
      const state = freeze(
        createSession(flagship, { ...config, mode: "NETWORKED" }),
      );
      const result = applyIntent(state, flagship, {
        type,
        t: 0,
        role: "COMMANDER",
      });
      expect(result.state).toBe(state);
      expect(result.result).toMatchObject({
        error: "ROLE_FORBIDDEN",
        effects: [],
      });
    },
  );

  it("forbids Analyst verification/decision and instructor trainee-state writes", () => {
    const state = freeze(started(flagship, { mode: "NETWORKED" }));
    for (const request of [
      { type: "VERIFY", t: 1320, role: "ANALYST", assetId: "UAV_SORTIE" },
      {
        type: "DECIDE",
        t: 1320,
        role: "ANALYST",
        actionId: "GO_NORTH",
        rationale: null,
      },
      { type: "OPEN_REPORT", t: 1320, role: "INSTRUCTOR", reportId: "R01" },
      {
        type: "SET_ESTIMATE",
        t: 1320,
        role: "INSTRUCTOR",
        hypothesisId: "north_pass",
        p: 0.5,
      },
      { type: "REVEAL_AID", t: 1320, role: "INSTRUCTOR" },
    ] satisfies Intent[]) {
      const result = applyIntent(state, flagship, request);
      expect(result.result).toMatchObject({
        error: "ROLE_FORBIDDEN",
        effects: [],
      });
      expect(result.state).toBe(state);
    }
  });

  it("retains deferred intent contracts without implementing later-gate actions", () => {
    const state = freeze(started(flagship, { mode: "NETWORKED" }));
    for (const request of [
      { type: "INJECT", t: 1320, role: "INSTRUCTOR", presetId: "JAM_LAND" },
      { type: "RELAY", t: 1320, role: "ANALYST", reportId: "R04" },
      { type: "ADVISE", t: 1320, role: "ANALYST", actionId: "GO_SOUTH" },
    ] satisfies Intent[]) {
      const result = applyIntent(state, flagship, request);
      expect(result.result).toMatchObject({
        error: "INVALID_INTENT",
      });
      expect(result.result.effects).toContainEqual({
        kind: "REPORT_DELIVERED",
        reportId: "R06",
        atSec: 1320,
      });
      expect(result.state).toMatchObject({
        nowSec: 1320,
        injectedCounter: 0,
        relays: [],
        advice: [],
      });
      expect(state.nowSec).toBe(0);
    }
    expect(
      applyIntent(state, flagship, {
        type: "INJECT",
        t: 1320,
        role: "INSTRUCTOR",
        presetId: "MISSING",
      }).result,
    ).toMatchObject({ error: "UNKNOWN_PRESET" });
    expect(
      applyIntent(state, flagship, {
        type: "RELAY",
        t: 1320,
        role: "COMMANDER",
        reportId: "R04",
      }).result,
    ).toMatchObject({ error: "RELAY_FORBIDDEN" });
    expect(
      applyIntent(state, flagship, {
        type: "ADVISE",
        t: 1320,
        role: "COMMANDER",
        actionId: "GO_SOUTH",
      }).result,
    ).toMatchObject({ error: "ADVICE_FORBIDDEN" });
  });
});

describe("commitment and consequence boundaries", () => {
  it("opens inclusively and requires an estimate before commitment", () => {
    let state = started();
    const decide: Intent = {
      type: "DECIDE",
      t: 719,
      role: "SOLO",
      actionId: "GO_NORTH",
      rationale: null,
    };
    expect(applyIntent(state, flagship, decide).result).toMatchObject({
      error: "WINDOW_NOT_OPEN",
    });
    expect(
      applyIntent(state, flagship, { ...decide, t: 720 }).result,
    ).toMatchObject({ error: "ESTIMATE_REQUIRED" });
    state = accept(state, {
      type: "SET_ESTIMATE",
      t: 720,
      role: "SOLO",
      hypothesisId: "north_pass",
      p: 0.7,
    });
    state = accept(state, { ...decide, t: 720 });
    expect(state).toMatchObject({
      phase: "CONSEQUENCE",
      consequenceRevealAtSec: 1020,
    });
  });

  it("delivers at close before timeout, but rejects voluntary DECIDE at close", () => {
    const scenario = structuredClone(flagship);
    scenario.reports.push({
      ...scenario.reports[0]!,
      id: "R_CLOSE",
      channel: "CYBER",
      issuedAtSec: 1800,
      evidenceGroup: "G_CLOSE",
    });
    scenario.events.push({
      kind: "REPORT_ISSUE",
      atSec: 1800,
      reportId: "R_CLOSE",
    });
    let before = started(validateRuntimeScenario(scenario));
    before = accept(
      before,
      {
        type: "SET_ESTIMATE",
        t: 1799,
        role: "SOLO",
        hypothesisId: "north_pass",
        p: 0.5,
      },
      scenario,
    );
    freeze(before);
    const result = applyIntent(before, scenario, {
      type: "DECIDE",
      t: 1800,
      role: "SOLO",
      actionId: "GO_NORTH",
      rationale: null,
    });
    expect(result.result).toMatchObject({ ok: false, error: "WINDOW_CLOSED" });
    expect(result.result.effects).toEqual([
      { kind: "REPORT_DELIVERED", reportId: "R_CLOSE", atSec: 1800 },
      { kind: "DECISION_WINDOW_CLOSED", decisionPointId: "DP1", atSec: 1800 },
      { kind: "PHASE_CHANGED", phase: "CONSEQUENCE", atSec: 1800 },
    ]);
    expect(result.state.decisions[0]).toMatchObject({
      actionId: "STAND_DOWN",
      timedOut: true,
      atSec: 1800,
    });
    expect(before.decisions).toEqual([]);
  });

  it.each([true, false])(
    "keeps a legal late South commitment pending beyond 36:00 with truth=%s",
    (truth) => {
      const scenario = structuredClone(flagship);
      scenario.hypotheses[1]!.initialTruth = truth;
      let state = started(scenario);
      state = accept(
        state,
        {
          type: "SET_ESTIMATE",
          t: 1799,
          role: "SOLO",
          hypothesisId: "north_pass",
          p: 0.5,
        },
        scenario,
      );
      const committed = applyIntent(state, scenario, {
        type: "DECIDE",
        t: 1799,
        role: "SOLO",
        actionId: "GO_SOUTH",
        rationale: null,
      });
      expect(committed.state).toMatchObject({
        phase: "CONSEQUENCE",
        consequenceRevealAtSec: 2219,
      });
      expect(committed.result.effects).toEqual([
        { kind: "PHASE_CHANGED", phase: "CONSEQUENCE", atSec: 1799 },
      ]);
      state = advanceTo(committed.state, scenario, 2160).state;
      expect(state.phase).toBe("CONSEQUENCE");
      state = advanceTo(state, scenario, 2218).state;
      expect(state.phase).toBe("CONSEQUENCE");
      const complete = advanceTo(state, scenario, 2219);
      expect(complete.state.phase).toBe("COMPLETE");
      expect(complete.effects).toEqual([
        { kind: "PHASE_CHANGED", phase: "COMPLETE", atSec: 2219 },
      ]);
      expect(advanceTo(complete.state, scenario, 9999).state).toBe(
        complete.state,
      );
      expect(scenario.meta.durationSec).toBe(2160);
    },
  );

  it("pins the internal consequence to decision-cut truth while later truth and reports continue", () => {
    const scenario = structuredClone(flagship);
    scenario.events.push({
      kind: "TRUTH_CHANGE",
      atSec: 1750,
      hypothesisId: "south_ford",
      value: false,
    });
    let state = started(scenario);
    state = accept(
      state,
      {
        type: "SET_ESTIMATE",
        t: 1740,
        role: "SOLO",
        hypothesisId: "north_pass",
        p: 0.25,
      },
      scenario,
    );
    state = accept(
      state,
      {
        type: "DECIDE",
        t: 1740,
        role: "SOLO",
        actionId: "GO_SOUTH",
        rationale: null,
      },
      scenario,
    );
    const committed = JSON.stringify(state.decisions);
    const later = advanceTo(freeze(state), scenario, 1860);
    expect(later.state.truth.south_ford).toBe(false);
    expect(later.state.reports.R11!.status).toBe("DELIVERED");
    expect(
      later.effects.find((effect) => effect.kind === "TRUTH_CHANGED"),
    ).toEqual({ kind: "TRUTH_CHANGED", atSec: 1750 });
    state = accept(
      later.state,
      { type: "OPEN_REPORT", t: 1860, role: "SOLO", reportId: "R11" },
      scenario,
    );
    expect(JSON.stringify(state.decisions)).toBe(committed);
    const reveal = state.eventTimeline
      .map(readEvent)
      .find((event) => event.kind === "CONSEQUENCE_REVEAL");
    expect(reveal).toMatchObject({
      truthAtDecision: { south_ford: true },
      consequence: { headline: "Convoy crosses Tamsa Ford" },
    });
    expect(advanceTo(state, scenario, 2160).state.phase).toBe("COMPLETE");
  });

  it("rejects unavailable rationale citations without disclosing hidden report existence", () => {
    let state = started(flagship, { mode: "NETWORKED" });
    state = accept(state, {
      type: "SET_ESTIMATE",
      t: 1320,
      role: "COMMANDER",
      hypothesisId: "north_pass",
      p: 0.5,
    });
    freeze(state);
    for (const reportId of ["R04", "R10", "R11", "MISSING"]) {
      const result = applyIntent(state, flagship, {
        type: "DECIDE",
        t: 1320,
        role: "COMMANDER",
        actionId: "GO_NORTH",
        rationale: {
          text: "Synthetic test rationale",
          citedReportIds: [reportId],
          tags: [],
        },
      });
      expect(result.result).toEqual({
        ok: false,
        error: "UNKNOWN_REPORT",
        message: "Report is not available",
        effects: [],
      });
      expect(result.state).toBe(state);
    }
  });
});
