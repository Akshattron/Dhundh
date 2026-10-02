// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  clientIntentSchema,
  clientMessageSchema,
} from "../../src/session/protocol";
import { mutateScenario, scenarioHash } from "../../src/engine";
import {
  SessionFault,
  SessionManager,
  type ManagedSession,
} from "../../server/sessions";
import { flagship } from "../engine/fixtures";

const managers: SessionManager[] = [];

function createManager(
  now: () => number,
  options: { maxSessions?: number; ttlMs?: number } = {},
) {
  const manager = new SessionManager([flagship], { now, ...options });
  managers.push(manager);
  return manager;
}

function createSession(manager: SessionManager) {
  return manager.create({
    scenarioId: flagship.meta.id,
    seed: 7,
    difficultyLevel: 3,
    aidMode: "AFTER_ESTIMATE",
  });
}

afterEach(() => {
  managers.splice(0).forEach((manager) => manager.removeAll());
});

describe("session protocol", () => {
  it("rejects authority-bearing intents and malformed role bindings", () => {
    expect(clientIntentSchema.safeParse({ type: "START", t: 4 }).success).toBe(
      false,
    );
    expect(
      clientIntentSchema.safeParse({
        type: "RELAY",
        reportId: "R04",
        role: "ANALYST",
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "HELLO",
        code: "ABC123",
        role: "COMMANDER",
        name: "Trainee",
        clientId: "6f1da9d8-4223-4d3d-bbd7-7f6951b094c8",
      }).success,
    ).toBe(false);
  });
});

describe("SessionManager", () => {
  it("issues bounded codes and scoped reconnect credentials, and rejects duplicate roles", () => {
    const manager = createManager(() => 1_000);
    const { session, credential } = createSession(manager);
    expect(credential.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(credential.token).toMatch(/^[0-9a-f]{32}$/);
    expect(session.clients.get(credential.clientId)?.role).toBe("INSTRUCTOR");

    const commander = manager.join({
      code: credential.code,
      role: "COMMANDER",
      name: "Commander",
    });
    expect(commander.reconnected).toBe(false);
    expect(() =>
      manager.join({
        code: credential.code,
        role: "COMMANDER",
        name: "Second commander",
      }),
    ).toThrowError(SessionFault);
    expect(() =>
      manager.join({
        code: credential.code,
        role: "INSTRUCTOR",
        name: "Impersonator",
      }),
    ).toThrowError(SessionFault);

    const resumed = manager.join({
      code: credential.code,
      role: "COMMANDER",
      name: "Commander",
      clientId: commander.participant.clientId,
      token: commander.participant.token,
    });
    expect(resumed).toMatchObject({
      reconnected: true,
      participant: { role: "COMMANDER" },
    });
    expect(() =>
      manager.join({
        code: credential.code,
        role: "ANALYST",
        name: "Escalated",
        clientId: commander.participant.clientId,
        token: commander.participant.token,
      }),
    ).toThrowError(SessionFault);
  });

  it("stamps trusted role/time, advances at the configured rate, and projects roles separately", () => {
    let now = 10_000;
    const manager = createManager(() => now);
    const { session, credential } = createSession(manager);
    const commander = manager.join({
      code: credential.code,
      role: "COMMANDER",
      name: "Command",
    }).participant;
    const analyst = manager.join({
      code: credential.code,
      role: "ANALYST",
      name: "Analysis",
    }).participant;

    manager.dispatch(credential.clientId, { type: "START" });
    manager.dispatch(commander.clientId, {
      type: "SET_ESTIMATE",
      hypothesisId: "north_pass",
      p: 0.4,
    });
    expect(session.log.intents).toMatchObject([
      { type: "START", role: "INSTRUCTOR", t: 0 },
      { type: "SET_ESTIMATE", role: "COMMANDER", t: 0, p: 0.4 },
    ]);
    expect(manager.view(session, commander).estimates).toHaveLength(1);
    expect(manager.view(session, analyst).estimates).toHaveLength(0);

    const commanderJson = JSON.stringify(manager.view(session, commander));
    expect(commanderJson).not.toContain('"truth"');
    expect(JSON.stringify(manager.view(session, analyst))).not.toContain(
      '"truth"',
    );
    expect(
      manager.view(session, credentialParticipant(session, credential.clientId))
        .truth,
    ).toEqual({ north_pass: true, south_ford: true });

    now += 2_000;
    expect(manager.advanceClocks(now)).toContain(session);
    expect(session.state.nowSec).toBe(30);
    expect(manager.view(session, commander).seq).toBeGreaterThan(0);
  });

  it("requires a trainee to join before the instructor starts", () => {
    const manager = createManager(() => 10_000);
    const { credential } = createSession(manager);
    expect(() =>
      manager.dispatch(credential.clientId, { type: "START" }),
    ).toThrowError(
      expect.objectContaining({
        code: "NOT_READY",
        message:
          "At least one trainee must join before the instructor can start.",
      }),
    );
    manager.join({
      code: credential.code,
      role: "ANALYST",
      name: "Analyst",
    });
    expect(
      manager.dispatch(credential.clientId, { type: "START" }).session.state
        .phase,
    ).toBe("RUNNING");
  });

  it("applies the selected deterministic scenario mutation before session creation", () => {
    const manager = createManager(() => 10_000);
    const expected = mutateScenario(flagship, 17, 4);
    const { session } = manager.create({
      scenarioId: flagship.meta.id,
      seed: 17,
      difficultyLevel: 4,
      aidMode: "ALWAYS",
    });

    expect(session.scenario).toEqual(expected);
    expect(session.state.difficultyLevel).toBe(4);
    expect(session.log.scenarioHash).toBe(scenarioHash(expected));
  });

  it("expires idle sessions and enforces the in-memory capacity", () => {
    let now = 0;
    const manager = createManager(() => now, { maxSessions: 1, ttlMs: 10_000 });
    const first = createSession(manager);
    expect(() => createSession(manager)).toThrowError(
      expect.objectContaining({ code: "TOO_MANY_SESSIONS" }),
    );
    now = 10_001;
    expect(manager.size).toBe(0);
    expect(createSession(manager).credential.code).not.toBe(
      first.credential.code,
    );
  });
});

function credentialParticipant(session: ManagedSession, clientId: string) {
  const participant = session.clients.get(clientId);
  if (!participant) throw new Error("Expected issued participant credential.");
  return participant;
}
