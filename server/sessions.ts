import { randomInt, randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  advanceTo,
  applyIntent,
  createSession,
  mutateScenario,
  PROFILES,
  projectTraineeView,
  scenarioHash,
} from "../src/engine";
import type {
  EngineErrorCode,
  Intent,
  RoleId,
  ScenarioDef,
  SessionLog,
  SimState,
} from "../src/engine";
import type { NetworkSessionView, ClientIntent } from "../src/session/protocol";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_INTENTS_PER_SECOND = 10;
const MAX_RECORDED_INTENTS = 10_000;
const MAX_EVENT_LOG = 50;

export interface Participant {
  clientId: string;
  token: string;
  role: Exclude<RoleId, "SOLO">;
  name: string;
  socket: WebSocket | null;
  connectedAtMs: number;
  lastSeenMs: number;
  intentTimes: number[];
  engineError?: { code: EngineErrorCode; message: string };
}

export interface ManagedSession {
  code: string;
  createdAtMs: number;
  lastActivityMs: number;
  scenarioId: string;
  seed: number;
  difficultyLevel: number;
  aidMode: "ALWAYS" | "AFTER_ESTIMATE";
  scenario: ScenarioDef;
  state: SimState;
  log: SessionLog;
  speedSecPerMin: number;
  clients: Map<string, Participant>;
  seq: number;
  finished: boolean;
  lastClockAtMs: number;
  fractionalSeconds: number;
  eventLog: Array<{ atSec: number; text: string }>;
}

export interface SessionCredential {
  code: string;
  clientId: string;
  token: string;
  role: "INSTRUCTOR";
  scenarioId: string;
  seed: number;
  difficultyLevel: number;
}

export type SessionFaultCode =
  | "SESSION_NOT_FOUND"
  | "ROLE_TAKEN"
  | "BAD_TOKEN"
  | "FORBIDDEN"
  | "SESSION_FINISHED"
  | "NOT_READY"
  | "RATE_LIMITED"
  | "TOO_MANY_SESSIONS";

export class SessionFault extends Error {
  constructor(
    readonly code: SessionFaultCode,
    message: string,
  ) {
    super(message);
    this.name = "SessionFault";
  }
}

export interface SessionManagerOptions {
  maxSessions?: number;
  ttlMs?: number;
  now?: () => number;
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly byClientId = new Map<string, ManagedSession>();
  private readonly now: () => number;
  private readonly maxSessions: number;
  private readonly ttlMs: number;

  constructor(
    private readonly scenarios: readonly ScenarioDef[],
    options: SessionManagerOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.maxSessions = options.maxSessions ?? 50;
    this.ttlMs = options.ttlMs ?? 6 * 60 * 60 * 1000;
  }

  get size(): number {
    this.sweepExpired();
    return this.sessions.size;
  }

  connectedParticipants(): Participant[] {
    this.sweepExpired();
    return [...this.sessions.values()].flatMap((session) =>
      [...session.clients.values()].filter(
        (participant) => participant.socket !== null,
      ),
    );
  }

  create(input: {
    scenarioId: string;
    seed: number;
    difficultyLevel: number;
    aidMode: "ALWAYS" | "AFTER_ESTIMATE";
  }): { session: ManagedSession; credential: SessionCredential } {
    this.sweepExpired();
    if (this.sessions.size >= this.maxSessions) {
      throw new SessionFault(
        "TOO_MANY_SESSIONS",
        "The session service is at capacity.",
      );
    }
    const baseScenario = this.scenarios.find(
      (item) => item.meta.id === input.scenarioId,
    );
    if (!baseScenario)
      throw new SessionFault("SESSION_NOT_FOUND", "Scenario was not found.");
    const difficultyProfile = Object.values(PROFILES).find(
      (profile) => profile.level === input.difficultyLevel,
    );
    if (!difficultyProfile) {
      throw new TypeError("Session difficulty must be an integer from 1 to 5.");
    }
    const scenario = mutateScenario(
      baseScenario,
      input.seed,
      difficultyProfile.level,
    );
    const now = this.now();
    const code = this.uniqueCode();
    const clientId = randomUUID();
    const reconnectToken = randomUUID().replaceAll("-", "");
    const state = createSession(scenario, {
      seed: input.seed,
      difficultyLevel: input.difficultyLevel,
      mode: "NETWORKED",
      aidMode: input.aidMode,
    });
    const log: SessionLog = {
      logVersion: 1,
      scenarioId: scenario.meta.id,
      scenarioVersion: scenario.meta.version,
      scenarioHash: scenarioHash(scenario),
      seed: input.seed,
      difficultyLevel: input.difficultyLevel,
      mode: "NETWORKED",
      aidMode: input.aidMode,
      intents: [],
    };
    const session: ManagedSession = {
      code,
      createdAtMs: now,
      lastActivityMs: now,
      scenarioId: scenario.meta.id,
      seed: input.seed,
      difficultyLevel: input.difficultyLevel,
      aidMode: input.aidMode,
      scenario,
      state,
      log,
      speedSecPerMin: 4,
      clients: new Map(),
      seq: 0,
      finished: false,
      lastClockAtMs: now,
      fractionalSeconds: 0,
      eventLog: [],
    };
    const instructor: Participant = {
      clientId,
      token: reconnectToken,
      role: "INSTRUCTOR",
      name: "Instructor",
      socket: null,
      connectedAtMs: now,
      lastSeenMs: now,
      intentTimes: [],
    };
    session.clients.set(clientId, instructor);
    this.sessions.set(code, session);
    this.byClientId.set(clientId, session);
    return {
      session,
      credential: {
        code,
        clientId,
        token: reconnectToken,
        role: "INSTRUCTOR",
        scenarioId: scenario.meta.id,
        seed: input.seed,
        difficultyLevel: input.difficultyLevel,
      },
    };
  }

  join(input: {
    code: string;
    role: Exclude<RoleId, "SOLO">;
    name: string;
    clientId?: string;
    token?: string;
  }): {
    session: ManagedSession;
    participant: Participant;
    reconnected: boolean;
  } {
    this.sweepExpired();
    const session = this.sessions.get(input.code);
    if (!session)
      throw new SessionFault(
        "SESSION_NOT_FOUND",
        "Session code was not found.",
      );
    const now = this.now();
    if (input.clientId !== undefined && input.token !== undefined) {
      const participant = session.clients.get(input.clientId);
      if (!participant || participant.token !== input.token) {
        throw new SessionFault(
          "BAD_TOKEN",
          "Reconnect details are invalid or expired.",
        );
      }
      if (participant.role !== input.role) {
        throw new SessionFault(
          "FORBIDDEN",
          "Reconnect role does not match the original role.",
        );
      }
      participant.name = input.name;
      participant.lastSeenMs = now;
      session.lastActivityMs = now;
      return { session, participant, reconnected: true };
    }
    if (input.role === "INSTRUCTOR") {
      throw new SessionFault(
        "FORBIDDEN",
        "Instructor access requires its issued reconnect credential.",
      );
    }
    if (session.state.phase === "COMPLETE") {
      throw new SessionFault("SESSION_FINISHED", "This exercise is complete.");
    }
    if (
      [...session.clients.values()].some((client) => client.role === input.role)
    ) {
      throw new SessionFault(
        "ROLE_TAKEN",
        "That participant role is already occupied.",
      );
    }
    const participant: Participant = {
      clientId: randomUUID(),
      token: randomUUID().replaceAll("-", ""),
      role: input.role,
      name: input.name,
      socket: null,
      connectedAtMs: now,
      lastSeenMs: now,
      intentTimes: [],
    };
    session.clients.set(participant.clientId, participant);
    this.byClientId.set(participant.clientId, session);
    session.lastActivityMs = now;
    this.recordEvent(session, `${input.role} joined`);
    this.touch(session);
    return { session, participant, reconnected: false };
  }

  attach(participant: Participant, socket: Participant["socket"]): void {
    participant.socket?.close(4000, "A newer connection replaced this one.");
    participant.socket = socket;
    participant.lastSeenMs = this.now();
    const session = this.byClientId.get(participant.clientId);
    if (session) {
      session.lastActivityMs = this.now();
      this.recordEvent(session, `${participant.role} connected`);
      this.touch(session);
    }
  }

  disconnect(clientId: string, socket: Participant["socket"]): void {
    const session = this.byClientId.get(clientId);
    const participant = session?.clients.get(clientId);
    if (!session || !participant || participant.socket !== socket) return;
    participant.socket = null;
    participant.lastSeenMs = this.now();
    session.lastActivityMs = this.now();
    this.recordEvent(session, `${participant.role} disconnected`);
    this.touch(session);
  }

  dispatch(
    clientId: string,
    command: ClientIntent,
  ): { session: ManagedSession; changed: boolean } {
    const session = this.byClientId.get(clientId);
    const participant = session?.clients.get(clientId);
    if (!session || !participant) {
      throw new SessionFault(
        "SESSION_NOT_FOUND",
        "Session is no longer available.",
      );
    }
    if (
      command.type === "START" &&
      ![...session.clients.values()].some(
        (client) => client.role === "COMMANDER" || client.role === "ANALYST",
      )
    ) {
      throw new SessionFault(
        "NOT_READY",
        "At least one trainee must join before the instructor can start.",
      );
    }
    const now = this.now();
    participant.intentTimes = participant.intentTimes.filter(
      (time) => now - time < 1000,
    );
    if (participant.intentTimes.length >= MAX_INTENTS_PER_SECOND) {
      throw new SessionFault(
        "RATE_LIMITED",
        "Too many actions. Wait briefly and try again.",
      );
    }
    if (
      command.type !== "RESET" &&
      session.log.intents.length >= MAX_RECORDED_INTENTS
    ) {
      throw new SessionFault(
        "RATE_LIMITED",
        "The action history reached its safe limit. Reset the exercise to continue.",
      );
    }
    participant.intentTimes.push(now);
    participant.lastSeenMs = now;
    session.lastActivityMs = now;
    const intent = stampIntent(command, participant.role, session.state.nowSec);
    const previous = session.state;
    const result = applyIntent(previous, session.scenario, intent);
    session.state = result.state;
    if (result.result.ok) {
      participant.engineError = undefined;
      if (command.type === "RESET") {
        session.log.intents = [];
        session.eventLog = [];
        session.finished = false;
        session.fractionalSeconds = 0;
        session.lastClockAtMs = now;
      } else {
        session.log.intents.push(structuredClone(intent));
      }
      this.recordEvent(session, this.describeIntent(participant.role, command));
    } else {
      participant.engineError = {
        code: result.result.error,
        message: result.result.message,
      };
    }
    session.finished = session.state.phase === "COMPLETE";
    this.touch(session);
    return { session, changed: true };
  }

  advanceClocks(now = this.now()): ManagedSession[] {
    const changed: ManagedSession[] = [];
    this.sweepExpired(now);
    for (const session of this.sessions.values()) {
      const elapsedMs = Math.max(0, now - session.lastClockAtMs);
      session.lastClockAtMs = now;
      if (
        session.state.phase !== "RUNNING" &&
        session.state.phase !== "CONSEQUENCE"
      )
        continue;
      session.fractionalSeconds +=
        (elapsedMs * 60) / (session.speedSecPerMin * 1000);
      const wholeSeconds = Math.floor(session.fractionalSeconds);
      if (wholeSeconds <= 0) continue;
      session.fractionalSeconds -= wholeSeconds;
      const previous = session.state;
      const result = advanceTo(
        previous,
        session.scenario,
        previous.nowSec + wholeSeconds,
      );
      if (result.error) continue;
      session.state = result.state;
      session.finished = result.state.phase === "COMPLETE";
      if (session.state !== previous) {
        this.touch(session);
        changed.push(session);
      }
    }
    return changed;
  }

  view(session: ManagedSession, participant: Participant): NetworkSessionView {
    const base = projectTraineeView(
      session.scenario,
      session.state,
      participant.role,
      participant.engineError,
    );
    const allVisibleReports = Object.values(session.state.reports).filter(
      (report) =>
        report.status === "DELIVERED" &&
        report.deliveredAtSec !== null &&
        report.deliveredAtSec <= session.state.nowSec,
    );
    const participantViews = [...session.clients.values()].filter(
      (client): client is Participant & { role: "COMMANDER" | "ANALYST" } =>
        client.role === "COMMANDER" || client.role === "ANALYST",
    );
    const view: NetworkSessionView = {
      ...base,
      scenario: {
        ...base.scenario,
        difficulty: session.difficultyLevel,
      },
      seq: session.seq,
      speedSecPerMin: session.speedSecPerMin,
      roster: [...session.clients.values()].map(({ role, name, socket }) => ({
        role,
        name,
        connected: socket !== null && socket.readyState === 1,
      })),
      relayCapacityLeft: Math.max(0, 3 - session.state.relays.length),
      advice:
        participant.role === "COMMANDER" || participant.role === "INSTRUCTOR"
          ? session.state.advice.map((item) => ({
              atSec: item.atSec,
              actionId: item.actionId,
              ...(item.note === undefined ? {} : { note: item.note }),
            }))
          : [],
      ...(participant.role === "INSTRUCTOR"
        ? {
            truth: { ...session.state.truth },
            instructor: {
              eventLog: [...session.eventLog].reverse(),
              inTransitCount: Object.values(session.state.reports).filter(
                (item) => item.status === "IN_TRANSIT",
              ).length,
              droppedCount: Object.values(session.state.reports).filter(
                (item) => item.status === "DROPPED",
              ).length,
              traineeSnapshots: participantViews.map((client) => {
                const channelIds = new Set(
                  session.scenario.channels
                    .filter((channel) =>
                      channel.visibleTo.includes(client.role),
                    )
                    .map((channel) => channel.id),
                );
                const delivered = allVisibleReports.filter((report) =>
                  channelIds.has(report.def.channel),
                );
                const opened = session.state.inspections.filter(
                  (item) => item.role === client.role,
                );
                const estimate = [...session.state.estimates]
                  .reverse()
                  .find(
                    (item) =>
                      item.role === client.role &&
                      session.scenario.hypotheses.find(
                        (hypothesis) => hypothesis.id === item.hypothesisId,
                      )?.primary,
                  );
                return {
                  role: client.role,
                  opened: opened.length,
                  delivered: delivered.length,
                  lastOpened: opened.at(-1)?.reportId ?? null,
                  estimate: estimate?.p ?? null,
                  aidRevealed:
                    session.state.aidMode === "ALWAYS" ||
                    Object.hasOwn(
                      session.state.aidRevealedAtSecByRole,
                      client.role,
                    ),
                  decided: session.state.decisions.some(
                    (item) => item.role === client.role,
                  ),
                };
              }),
            },
          }
        : {}),
    };
    return view;
  }

  find(code: string): ManagedSession | undefined {
    this.sweepExpired();
    return this.sessions.get(code);
  }

  removeAll(): void {
    this.sessions.clear();
    this.byClientId.clear();
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = "";
      for (let index = 0; index < 6; index += 1) {
        code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      }
      if (!this.sessions.has(code)) return code;
    }
    throw new Error("Unable to allocate a unique session code.");
  }

  private sweepExpired(now = this.now()): void {
    for (const [code, session] of this.sessions) {
      if (now - session.lastActivityMs < this.ttlMs) continue;
      for (const participant of session.clients.values()) {
        participant.socket?.close(4002, "Session expired.");
        this.byClientId.delete(participant.clientId);
      }
      this.sessions.delete(code);
    }
  }

  private touch(session: ManagedSession): void {
    session.seq += 1;
  }

  private recordEvent(session: ManagedSession, text: string): void {
    session.eventLog.push({ atSec: session.state.nowSec, text });
    if (session.eventLog.length > MAX_EVENT_LOG) session.eventLog.shift();
  }

  private describeIntent(role: RoleId, command: ClientIntent): string {
    switch (command.type) {
      case "START":
        return "Instructor started the exercise";
      case "PAUSE":
        return "Instructor paused the exercise";
      case "RESUME":
        return "Instructor resumed the exercise";
      case "RESET":
        return "Instructor reset the exercise";
      case "OPEN_REPORT":
        return `${role} opened a report`;
      case "SET_ESTIMATE":
        return `${role} recorded an estimate`;
      case "REVEAL_AID":
        return `${role} revealed reference aid`;
      case "VERIFY":
        return `${role} requested a verification`;
      case "RELAY":
        return "Analyst relayed a report";
      case "ADVISE":
        return "Analyst sent structured advice";
      case "DECIDE":
        return "Commander committed a decision";
      case "INJECT":
        return `Instructor used preset ${command.presetId}`;
    }
  }
}

export function publicSession(session: ManagedSession) {
  return {
    code: session.code,
    scenarioId: session.scenarioId,
    phase: session.state.phase,
    roster: [...session.clients.values()].map(({ role, name, socket }) => ({
      role,
      name,
      connected: socket !== null && socket.readyState === 1,
    })),
    createdAtIso: new Date(session.createdAtMs).toISOString(),
    difficultyLevel: session.difficultyLevel,
  };
}

function stampIntent(
  command: ClientIntent,
  role: Exclude<RoleId, "SOLO">,
  t: number,
): Intent {
  switch (command.type) {
    case "START":
    case "PAUSE":
    case "RESUME":
    case "RESET":
    case "REVEAL_AID":
      return { type: command.type, t, role };
    case "OPEN_REPORT":
    case "SET_ESTIMATE":
    case "VERIFY":
    case "RELAY":
    case "ADVISE":
    case "DECIDE":
      return { ...command, t, role };
    case "INJECT":
      return { ...command, t, role: "INSTRUCTOR" };
  }
}
