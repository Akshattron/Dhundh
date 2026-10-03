// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { buildAar } from "../../src/engine/aar";
import { buildTeamAar } from "../../server/teamAar";
import { SessionManager } from "../../server/sessions";
import { networkAarSchema } from "../../src/session/protocol";
import { flagship, freeze } from "../engine/fixtures";

const managers: SessionManager[] = [];
function team() {
  let now = 0;
  const manager = new SessionManager([flagship], { now: () => now });
  managers.push(manager);
  const { session, credential } = manager.create({
    scenarioId: flagship.meta.id,
    seed: 0,
    difficultyLevel: 3,
    aidMode: "ALWAYS",
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
  manager.dispatch(credential.clientId, { type: "START" });
  const advance = (atSec: number) => {
    now = ((atSec * session.speedSecPerMin) / 60) * 1000;
    manager.advanceClocks(now);
  };
  advance(600);
  manager.dispatch(analyst.clientId, { type: "RELAY", reportId: "R04" });
  manager.dispatch(analyst.clientId, {
    type: "SET_ESTIMATE",
    hypothesisId: "north_pass",
    p: 0.6,
  });
  advance(750);
  manager.dispatch(commander.clientId, {
    type: "SET_ESTIMATE",
    hypothesisId: "north_pass",
    p: 0.6,
  });
  manager.dispatch(commander.clientId, {
    type: "DECIDE",
    actionId: "STAND_DOWN",
    rationale: null,
  });
  return { manager, session, commander, analyst, advance };
}
afterEach(() => managers.splice(0).forEach((manager) => manager.removeAll()));

describe("authoritative team AAR boundary", () => {
  it("keeps metrics and private role estimates out of live trainee views", () => {
    const { manager, session, commander, analyst } = team();
    for (const participant of [commander, analyst]) {
      const view = manager.view(session, participant);
      expect(view.truth).toBeUndefined();
      expect(JSON.stringify(view)).not.toContain("informationSharingRate");
      expect(JSON.stringify(view)).not.toContain("decisionMetrics");
      expect(JSON.stringify(view)).not.toContain('"team"');
    }
    expect(() =>
      buildTeamAar(buildAar(session.scenario, session.log), session),
    ).toThrow("authoritative completion");
  });

  it("enriches only a completed matching AAR and validates all P3 data for remote clients", () => {
    const { session, advance } = team();
    advance(930);
    const aar = freeze(buildAar(session.scenario, session.log));
    const before = JSON.stringify(aar);
    const teamAar = buildTeamAar(aar, session);
    expect(teamAar.team?.metrics).toMatchObject({
      informationSharingRate: 1,
      estimateConvergence: 1,
      medianCoordinationLatencySec: 30,
    });
    expect(teamAar.team?.participants.map((item) => item.name)).toEqual([
      "Commander",
      "Analyst",
    ]);
    expect(networkAarSchema.safeParse(teamAar).success).toBe(true);
    expect(JSON.stringify(aar)).toBe(before);
    expect(() =>
      buildTeamAar(
        { ...aar, scenario: { ...aar.scenario, hash: "00000000" } },
        session,
      ),
    ).toThrow("does not match");
  });

  it("rejects nonfinite/out-of-range metrics, invalid response horizons and false annotation positions", () => {
    const { session, advance } = team();
    advance(930);
    const aar = buildTeamAar(buildAar(session.scenario, session.log), session);
    for (const value of [NaN, Infinity, -0.1, 1.1]) {
      const invalid = structuredClone(aar);
      invalid.team!.metrics.informationSharingRate = value;
      expect(networkAarSchema.safeParse(invalid).success).toBe(false);
    }
    const badResponse = structuredClone(aar);
    const relay = badResponse.team!.decisionMetrics[0]!.relays[0]!;
    relay.response!.atSec = 9999;
    expect(networkAarSchema.safeParse(badResponse).success).toBe(false);
    const badAnnotation = structuredClone(aar);
    badAnnotation.frames[0]!.markers[0]!.frameIndex = 1;
    expect(networkAarSchema.safeParse(badAnnotation).success).toBe(false);
  });
});
