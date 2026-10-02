import { z } from "zod";
import type { Aar } from "../engine/aar";
import type { EngineErrorCode, Intent, Phase, RoleId } from "../engine/types";
import type { TraineeView } from "../engine/view";

export type ClientIntent = Intent extends infer T
  ? T extends Intent
    ? Omit<T, "t" | "role">
    : never
  : never;

export interface NetworkSessionView extends TraineeView {
  seq: number;
  speedSecPerMin: number;
  roster: Array<{ role: RoleId; name: string; connected: boolean }>;
  relayCapacityLeft: number;
  advice: Array<{ atSec: number; actionId: string; note?: string }>;
  instructor?: {
    eventLog: Array<{ atSec: number; text: string }>;
    inTransitCount: number;
    droppedCount: number;
    traineeSnapshots: Array<{
      role: "COMMANDER" | "ANALYST";
      opened: number;
      delivered: number;
      lastOpened: string | null;
      estimate: number | null;
      aidRevealed: boolean;
      decided: boolean;
    }>;
  };
}

const sessionCode = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);
const clientId = z.string().uuid();
const token = z.string().regex(/^[0-9a-f]{32}$/);
const role = z.enum(["COMMANDER", "ANALYST", "INSTRUCTOR"]);
const engineRole = z.enum(["SOLO", "COMMANDER", "ANALYST", "INSTRUCTOR"]);
const identifier = z.string().min(1).max(120);
const estimate = z.number().finite().min(0).max(1);
const rationale = z
  .strictObject({
    text: z.string().max(280),
    citedReportIds: z.array(identifier).max(12),
    tags: z.array(
      z.enum([
        "RELIED_ON_FRESH_REPORT",
        "DISCOUNTED_STALE_REPORT",
        "WEIGHED_CONTRADICTION",
        "PRIORITIZED_SAFETY",
        "PRIORITIZED_TIME",
        "AWAITED_VERIFICATION",
        "FOLLOWED_TEAM_ADVICE",
        "OTHER",
      ]),
    ),
  })
  .nullable();

export const clientIntentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("START") }),
  z.strictObject({ type: z.literal("PAUSE") }),
  z.strictObject({ type: z.literal("RESUME") }),
  z.strictObject({ type: z.literal("RESET") }),
  z.strictObject({ type: z.literal("OPEN_REPORT"), reportId: identifier }),
  z.strictObject({
    type: z.literal("SET_ESTIMATE"),
    hypothesisId: identifier,
    p: estimate,
  }),
  z.strictObject({ type: z.literal("REVEAL_AID") }),
  z.strictObject({ type: z.literal("VERIFY"), assetId: identifier }),
  z.strictObject({
    type: z.literal("RELAY"),
    reportId: identifier,
    note: z.string().max(80).optional(),
  }),
  z.strictObject({
    type: z.literal("ADVISE"),
    actionId: identifier,
    note: z.string().max(80).optional(),
  }),
  z.strictObject({
    type: z.literal("DECIDE"),
    actionId: identifier,
    rationale,
  }),
  z.strictObject({ type: z.literal("INJECT"), presetId: identifier }),
]);

export const clientMessageSchema = z.discriminatedUnion("type", [
  z
    .strictObject({
      type: z.literal("HELLO"),
      code: sessionCode,
      role,
      name: z.string().trim().min(2).max(40),
      clientId: clientId.optional(),
      token: token.optional(),
    })
    .refine(
      (message) =>
        (message.clientId === undefined) === (message.token === undefined),
      "Reconnect clientId and token must be supplied together",
    ),
  z.strictObject({ type: z.literal("INTENT"), intent: clientIntentSchema }),
  z.strictObject({ type: z.literal("PING"), ts: z.number().finite() }),
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isNetworkSessionView(value: unknown): value is NetworkSessionView {
  if (!isRecord(value)) return false;
  if (
    !Number.isSafeInteger(value.seq) ||
    !Number.isSafeInteger(value.nowSec) ||
    typeof value.speedSecPerMin !== "number" ||
    !Number.isFinite(value.speedSecPerMin) ||
    value.speedSecPerMin <= 0 ||
    !engineRole.safeParse(value.role).success ||
    !z
      .enum(["IDLE", "RUNNING", "PAUSED", "CONSEQUENCE", "COMPLETE"])
      .safeParse(value.phase).success ||
    !isRecord(value.scenario) ||
    !Array.isArray(value.reports) ||
    !Array.isArray(value.channels) ||
    !Array.isArray(value.hypotheses) ||
    !Array.isArray(value.roster) ||
    !Number.isInteger(value.relayCapacityLeft) ||
    !Array.isArray(value.advice)
  ) {
    return false;
  }
  const scenario = value.scenario;
  if (
    typeof scenario.id !== "string" ||
    typeof scenario.title !== "string" ||
    !Array.isArray(scenario.briefing) ||
    !value.reports.every(isRecord) ||
    !value.channels.every(isRecord) ||
    !value.hypotheses.every(isRecord) ||
    !value.roster.every(
      (item) =>
        isRecord(item) &&
        engineRole.safeParse(item.role).success &&
        typeof item.name === "string" &&
        typeof item.connected === "boolean",
    )
  ) {
    return false;
  }
  if (value.instructor !== undefined && !isRecord(value.instructor)) {
    return false;
  }
  return true;
}

export const networkSessionViewSchema =
  z.custom<NetworkSessionView>(isNetworkSessionView);

const teamParticipantSchema = z.strictObject({
  role: z.enum(["COMMANDER", "ANALYST"]),
  name: z.string().min(2).max(40),
  openedReportIds: z.array(z.string()),
  estimates: z.array(
    z.strictObject({
      hypothesisId: z.string(),
      p: z.number().finite().min(0).max(1),
      atSec: z.number().int().nonnegative(),
    }),
  ),
  decisions: z.array(
    z.strictObject({
      decisionPointId: z.string(),
      actionId: z.string(),
      atSec: z.number().int().nonnegative(),
      timedOut: z.boolean(),
    }),
  ),
  verificationCount: z.number().int().nonnegative(),
  aidRevealedAtSec: z.number().int().nonnegative().nullable(),
});
const teamAarSchema = z.strictObject({
  participants: z.array(teamParticipantSchema),
  relays: z.array(
    z.strictObject({
      fromRole: z.literal("ANALYST"),
      reportId: z.string(),
      relayReportId: z.string(),
      atSec: z.number().int().nonnegative(),
      deliveredAtSec: z.number().int().nonnegative(),
      note: z.string().max(80).optional(),
    }),
  ),
  advice: z.array(
    z.strictObject({
      role: z.literal("ANALYST"),
      atSec: z.number().int().nonnegative(),
      actionId: z.string(),
      note: z.string().max(80).optional(),
    }),
  ),
});
const aarBoundarySchema = z
  .object({
    schemaVersion: z.literal(1),
    dataProvenance: z.string().min(1),
    scenario: z
      .object({
        id: z.string().min(1),
        version: z.number().int().positive(),
        title: z.string().min(1),
      })
      .passthrough(),
    decision: z
      .object({
        decisionPointId: z.string().min(1),
        atSec: z.number().int().nonnegative(),
        actionId: z.string().min(1),
      })
      .passthrough(),
    decisions: z.array(z.record(z.string(), z.unknown())).min(1),
    scores: z
      .object({
        dq: z.number().finite(),
        outcome: z.number().finite(),
        trainingScore: z.number().finite(),
      })
      .passthrough(),
    truth: z.record(z.string(), z.boolean()),
    consequence: z
      .object({ headline: z.string(), narrative: z.string() })
      .passthrough(),
    timeline: z.array(z.record(z.string(), z.unknown())),
    frames: z.array(z.record(z.string(), z.unknown())),
    information: z.record(z.string(), z.unknown()),
    team: teamAarSchema,
  })
  .passthrough();

export const networkAarSchema = z.custom<Aar>(
  (value) => aarBoundarySchema.safeParse(value).success,
);

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("WELCOME"),
    clientId,
    token,
    role: engineRole,
    view: networkSessionViewSchema,
  }),
  z.strictObject({ type: z.literal("VIEW"), view: networkSessionViewSchema }),
  z.strictObject({
    type: z.literal("ERROR"),
    code: z.enum([
      "SESSION_NOT_FOUND",
      "ROLE_TAKEN",
      "BAD_TOKEN",
      "BAD_MESSAGE",
      "RATE_LIMITED",
      "FORBIDDEN",
      "SESSION_FINISHED",
      "NOT_READY",
      "INVALID_INTENT",
      "NOT_RUNNING",
      "WINDOW_NOT_OPEN",
      "WINDOW_CLOSED",
      "ESTIMATE_REQUIRED",
      "UNKNOWN_REPORT",
      "REPORT_NOT_DELIVERED",
      "UNKNOWN_ACTION",
      "UNKNOWN_ASSET",
      "ASSET_EXHAUSTED",
      "VERIFY_TOO_LATE",
      "INVALID_ESTIMATE",
      "UNKNOWN_PRESET",
      "RELAY_LIMIT",
      "RELAY_FORBIDDEN",
      "ADVICE_FORBIDDEN",
      "INVALID_TIME",
      "ROLE_FORBIDDEN",
    ]),
    message: z.string().max(240),
  }),
  z.strictObject({ type: z.literal("PONG"), ts: z.number().finite() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function parseClientIntent(value: unknown): ClientIntent | null {
  const result = clientIntentSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function engineErrorCode(value: string): EngineErrorCode | null {
  const result = z
    .enum([
      "NOT_RUNNING",
      "WINDOW_NOT_OPEN",
      "WINDOW_CLOSED",
      "ESTIMATE_REQUIRED",
      "ROLE_FORBIDDEN",
      "UNKNOWN_REPORT",
      "REPORT_NOT_DELIVERED",
      "UNKNOWN_ACTION",
      "UNKNOWN_ASSET",
      "ASSET_EXHAUSTED",
      "VERIFY_TOO_LATE",
      "INVALID_ESTIMATE",
      "UNKNOWN_PRESET",
      "RELAY_LIMIT",
      "RELAY_FORBIDDEN",
      "ADVICE_FORBIDDEN",
      "INVALID_TIME",
      "INVALID_INTENT",
    ])
    .safeParse(value);
  return result.success ? result.data : null;
}

export function isPhase(value: unknown): value is Phase {
  return z
    .enum(["IDLE", "RUNNING", "PAUSED", "CONSEQUENCE", "COMPLETE"])
    .safeParse(value).success;
}
