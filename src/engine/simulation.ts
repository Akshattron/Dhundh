import { z } from "zod";
import { createChannels, degradeChannel, restoreChannel } from "./channels";
import { issueReport } from "./degradation";
import { buildEventTimeline, readEvent, scheduleEvent } from "./events";
import type { EngineEvent } from "./events";
import { hashString, rng } from "./rng";
import { scenarioHash, validateRuntimeScenario } from "./scenarioLoader";
import type {
  ActionDef,
  DecisionPointDef,
  EngineEffect,
  EngineErrorCode,
  EngineResult,
  Intent,
  Rationale,
  ReportRuntime,
  RoleId,
  ScenarioDef,
  SessionLog,
  SessionMode,
  SimSeconds,
  SimState,
} from "./types";

export type { EngineEffect, EngineResult } from "./types";

const seconds = z.number().int().nonnegative();
const role = z.enum(["SOLO", "COMMANDER", "ANALYST", "INSTRUCTOR"]);
const authority = { t: seconds, role };
const id = z.string().min(1);
const rationale = z.strictObject({
  text: z.string().max(280),
  citedReportIds: z.array(id).max(12),
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
});
const intentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("START"), ...authority }),
  z.strictObject({ type: z.literal("PAUSE"), ...authority }),
  z.strictObject({ type: z.literal("RESUME"), ...authority }),
  z.strictObject({ type: z.literal("RESET"), ...authority }),
  z.strictObject({
    type: z.literal("OPEN_REPORT"),
    ...authority,
    reportId: id,
  }),
  z.strictObject({
    type: z.literal("SET_ESTIMATE"),
    ...authority,
    hypothesisId: id,
    p: z.number().finite().min(0).max(1),
  }),
  z.strictObject({ type: z.literal("REVEAL_AID"), ...authority }),
  z.strictObject({ type: z.literal("VERIFY"), ...authority, assetId: id }),
  z.strictObject({
    type: z.literal("RELAY"),
    ...authority,
    reportId: id,
    note: z.string().max(80).optional(),
  }),
  z.strictObject({
    type: z.literal("ADVISE"),
    ...authority,
    actionId: id,
    note: z.string().max(80).optional(),
  }),
  z.strictObject({
    type: z.literal("DECIDE"),
    ...authority,
    actionId: id,
    rationale: rationale.nullable(),
  }),
  z.strictObject({
    type: z.literal("INJECT"),
    t: seconds,
    role: z.literal("INSTRUCTOR"),
    presetId: id,
  }),
]);
const configurationSchema = z.strictObject({
  seed: z.number().int(),
  difficultyLevel: z.number().int().min(1).max(5),
  mode: z.enum(["LOCAL", "NETWORKED"]),
  aidMode: z.enum(["ALWAYS", "AFTER_ESTIMATE"]),
});
const logSchema = configurationSchema.extend({
  logVersion: z.literal(1),
  scenarioId: id,
  scenarioVersion: z.number().int().positive(),
  scenarioHash: z.string().regex(/^[0-9a-f]{8}$/),
  intents: z.array(intentSchema),
});

function permissionError(
  mode: SessionMode,
  intent: Intent,
): EngineErrorCode | null {
  if (
    (mode === "LOCAL" &&
      intent.role !== "SOLO" &&
      intent.role !== "INSTRUCTOR") ||
    (mode === "NETWORKED" && intent.role === "SOLO")
  ) {
    return "ROLE_FORBIDDEN";
  }
  switch (intent.type) {
    case "START":
    case "PAUSE":
    case "RESUME":
    case "RESET":
      return intent.role === "SOLO" || intent.role === "INSTRUCTOR"
        ? null
        : "ROLE_FORBIDDEN";
    case "OPEN_REPORT":
    case "SET_ESTIMATE":
    case "REVEAL_AID":
      return intent.role === "INSTRUCTOR" ? "ROLE_FORBIDDEN" : null;
    case "VERIFY":
    case "DECIDE":
      return intent.role === "SOLO" || intent.role === "COMMANDER"
        ? null
        : "ROLE_FORBIDDEN";
    case "RELAY":
      return intent.role === "ANALYST" ? null : "RELAY_FORBIDDEN";
    case "ADVISE":
      return intent.role === "ANALYST" ? null : "ADVICE_FORBIDDEN";
    case "INJECT":
      return intent.role === "INSTRUCTOR" ? null : "ROLE_FORBIDDEN";
  }
}

function invalidTime(state: SimState, tSec: SimSeconds): string | null {
  if (!Number.isSafeInteger(tSec) || tSec < 0 || tSec < state.nowSec) {
    return "Time must be a nonnegative integer at or after the current simulated time";
  }
  return null;
}

function success(
  state: SimState,
  effects: EngineEffect[] = [],
): {
  state: SimState;
  result: EngineResult;
} {
  return { state, result: { ok: true, value: undefined, effects } };
}

function failure(
  state: SimState,
  error: EngineErrorCode,
  message: string,
  effects: EngineEffect[] = [],
): { state: SimState; result: EngineResult } {
  return { state, result: { ok: false, error, message, effects } };
}

export function createSession(
  scenario: ScenarioDef,
  opts: {
    seed: number;
    difficultyLevel: number;
    mode: SessionMode;
    aidMode: "ALWAYS" | "AFTER_ESTIMATE";
  },
): SimState {
  const config = configurationSchema.parse(opts);
  const validated = validateRuntimeScenario(scenario);
  const reports: Record<string, ReportRuntime> = Object.fromEntries(
    validated.reports.map((def, sequence) => [
      def.id,
      {
        def,
        status: "SCHEDULED",
        deliveredAtSec: null,
        droppedReason: null,
        origin: "SCENARIO",
        sequence,
        healthAtIssue: 1,
      },
    ]),
  );
  return {
    scenarioId: validated.meta.id,
    scenarioVersion: validated.meta.version,
    ...config,
    phase: "IDLE",
    nowSec: 0,
    channels: createChannels(),
    reports,
    truth: Object.fromEntries(
      validated.hypotheses.map((hypothesis) => [
        hypothesis.id,
        hypothesis.initialTruth,
      ]),
    ),
    nextSequence: validated.reports.length,
    inspections: [],
    estimates: [],
    verifications: [],
    decisions: [],
    currentDecisionPointIndex: 0,
    consequenceRevealAtSec: null,
    aidRevealedAtSecByRole:
      config.aidMode === "ALWAYS"
        ? config.mode === "LOCAL"
          ? { SOLO: 0 }
          : { COMMANDER: 0, ANALYST: 0 }
        : {},
    pausedAtSec: null,
    relays: [],
    advice: [],
    eventTimeline: [],
    nextEventOrder: 0,
    processedEventCursor: 0,
    injectedCounter: 0,
  };
}

function commitDecision(
  state: SimState,
  scenario: ScenarioDef,
  dp: DecisionPointDef,
  action: ActionDef,
  actor: RoleId,
  timedOut: boolean,
  reason: Rationale | null,
): { state: SimState; effects: EngineEffect[] } {
  const estimates = Object.fromEntries(
    state.estimates
      .filter((estimate) => estimate.role === actor)
      .map((estimate) => [estimate.hypothesisId, estimate.p]),
  );
  let next: SimState = {
    ...state,
    decisions: [
      ...state.decisions,
      {
        decisionPointId: dp.id,
        atSec: state.nowSec,
        actionId: action.id,
        role: actor,
        timedOut,
        rationale: reason === null ? null : structuredClone(reason),
        estimates,
        consultedAid:
          state.aidMode === "ALWAYS" ||
          Object.hasOwn(state.aidRevealedAtSecByRole, actor),
      },
    ],
  };
  if (state.currentDecisionPointIndex < scenario.decisionPoints.length - 1) {
    return {
      state: {
        ...next,
        currentDecisionPointIndex: state.currentDecisionPointIndex + 1,
      },
      effects: [],
    };
  }
  const consequence = action.consequences.find((rule) =>
    Object.entries(rule.when).every(
      ([key, value]) => state.truth[key] === value,
    ),
  );
  if (!consequence)
    throw new Error("Validated action has no matching consequence");
  const revealAtSec =
    state.nowSec +
    Math.max(...action.consequences.map((rule) => rule.arrivalSec));
  next = scheduleEvent(
    { ...next, phase: "CONSEQUENCE", consequenceRevealAtSec: revealAtSec },
    {
      kind: "CONSEQUENCE_REVEAL",
      atSec: revealAtSec,
      decisionPointId: dp.id,
      actionId: action.id,
      decisionAtSec: state.nowSec,
      truthAtDecision: { ...state.truth },
      consequence,
    },
  );
  return {
    state: next,
    effects: [
      { kind: "PHASE_CHANGED", phase: "CONSEQUENCE", atSec: state.nowSec },
    ],
  };
}

function processEvent(
  state: SimState,
  scenario: ScenarioDef,
  event: EngineEvent,
): { state: SimState; effects: EngineEffect[] } {
  switch (event.kind) {
    case "TRUTH_CHANGE":
      return {
        state: {
          ...state,
          truth: { ...state.truth, [event.hypothesisId]: event.value },
        },
        effects: [{ kind: "TRUTH_CHANGED", atSec: event.atSec }],
      };
    case "CHANNEL_DEGRADE":
      return {
        state: {
          ...state,
          channels: {
            ...state.channels,
            [event.channel]: degradeChannel(
              state.channels[event.channel],
              event,
            ),
          },
        },
        effects: [
          {
            kind: "CHANNEL_CHANGED",
            channel: event.channel,
            atSec: event.atSec,
          },
        ],
      };
    case "CHANNEL_RESTORE": {
      const channel = restoreChannel(
        state.channels[event.channel],
        event.atSec,
      );
      if (channel === state.channels[event.channel])
        return { state, effects: [] };
      return {
        state: {
          ...state,
          channels: { ...state.channels, [event.channel]: channel },
        },
        effects: [
          {
            kind: "CHANNEL_CHANGED",
            channel: event.channel,
            atSec: event.atSec,
          },
        ],
      };
    }
    case "REPORT_ISSUE": {
      const report = Object.hasOwn(state.reports, event.reportId)
        ? state.reports[event.reportId]
        : undefined;
      if (!report) throw new Error("Scheduled report does not exist");
      const channel = scenario.channels.find(
        (item) => item.id === report.def.channel,
      );
      if (!channel) throw new Error("Scheduled report channel does not exist");
      const issued = issueReport(
        report,
        state.channels[channel.id],
        channel.baseDelaySec,
        event.atSec,
      );
      if (issued === report) return { state, effects: [] };
      const next = {
        ...state,
        reports: { ...state.reports, [event.reportId]: issued },
      };
      if (issued.status === "DROPPED") {
        return {
          state: next,
          effects: [
            {
              kind: "REPORT_DROPPED",
              reportId: event.reportId,
              atSec: event.atSec,
            },
          ],
        };
      }
      if (issued.deliveredAtSec === null)
        throw new Error("In-transit report has no delivery time");
      return {
        state: scheduleEvent(next, {
          kind: "REPORT_DELIVER",
          atSec: issued.deliveredAtSec,
          reportId: event.reportId,
        }),
        effects: [],
      };
    }
    case "REPORT_DELIVER": {
      const report = Object.hasOwn(state.reports, event.reportId)
        ? state.reports[event.reportId]
        : undefined;
      if (!report) throw new Error("Delivery report does not exist");
      if (report.status !== "IN_TRANSIT") return { state, effects: [] };
      return {
        state: {
          ...state,
          reports: {
            ...state.reports,
            [event.reportId]: { ...report, status: "DELIVERED" },
          },
          channels: {
            ...state.channels,
            [report.def.channel]: {
              ...state.channels[report.def.channel],
              lastDeliveredAtSec: event.atSec,
            },
          },
        },
        effects: [
          {
            kind: "REPORT_DELIVERED",
            reportId: event.reportId,
            atSec: event.atSec,
          },
        ],
      };
    }
    case "DECISION_OPEN":
      return {
        state,
        effects: [
          {
            kind: "DECISION_WINDOW_OPENED",
            decisionPointId: event.decisionPointId,
            atSec: event.atSec,
          },
        ],
      };
    case "DECISION_CLOSE": {
      const effects: EngineEffect[] = [
        {
          kind: "DECISION_WINDOW_CLOSED",
          decisionPointId: event.decisionPointId,
          atSec: event.atSec,
        },
      ];
      const dp = scenario.decisionPoints[state.currentDecisionPointIndex];
      if (
        state.phase !== "RUNNING" ||
        dp?.id !== event.decisionPointId ||
        state.decisions.some((decision) => decision.decisionPointId === dp.id)
      ) {
        return { state, effects };
      }
      const action = dp.actions.find((item) => item.id === dp.timeoutActionId);
      if (!action) throw new Error("Validated timeout action does not exist");
      const committed = commitDecision(
        state,
        scenario,
        dp,
        action,
        state.mode === "LOCAL" ? "SOLO" : "COMMANDER",
        true,
        null,
      );
      return {
        state: committed.state,
        effects: [...effects, ...committed.effects],
      };
    }
    case "CONSEQUENCE_REVEAL":
      return {
        state: { ...state, phase: "COMPLETE" },
        effects: [
          { kind: "PHASE_CHANGED", phase: "COMPLETE", atSec: event.atSec },
        ],
      };
  }
}

export function advanceTo(
  state: SimState,
  scenario: ScenarioDef,
  tSec: SimSeconds,
): {
  state: SimState;
  effects: EngineEffect[];
  error?: { code: "INVALID_TIME"; message: string };
} {
  const message = invalidTime(state, tSec);
  if (message) {
    return { state, effects: [], error: { code: "INVALID_TIME", message } };
  }
  if (state.phase !== "RUNNING" && state.phase !== "CONSEQUENCE") {
    return { state, effects: [] };
  }
  const first = state.eventTimeline[state.processedEventCursor];
  if (tSec === state.nowSec && (!first || first.atSec > tSec)) {
    return { state, effects: [] };
  }
  let next = structuredClone(state);
  const effects: EngineEffect[] = [];
  while (next.phase === "RUNNING" || next.phase === "CONSEQUENCE") {
    const pending = next.eventTimeline[next.processedEventCursor];
    if (!pending || pending.atSec > tSec) break;
    const result = processEvent(
      {
        ...next,
        nowSec: pending.atSec,
        processedEventCursor: next.processedEventCursor + 1,
      },
      scenario,
      readEvent(pending),
    );
    next = result.state;
    effects.push(...result.effects);
  }
  if (next.phase === "RUNNING" || next.phase === "CONSEQUENCE") {
    next.nowSec = tSec;
  }
  return { state: next, effects };
}

function reportAvailable(
  state: SimState,
  scenario: ScenarioDef,
  reportId: string,
  actor: RoleId,
): boolean {
  const report = Object.hasOwn(state.reports, reportId)
    ? state.reports[reportId]
    : undefined;
  return (
    report?.status === "DELIVERED" &&
    scenario.channels.some(
      (channel) =>
        channel.id === report.def.channel && channel.visibleTo.includes(actor),
    )
  );
}

export function applyIntent(
  state: SimState,
  scenario: ScenarioDef,
  intent: Intent,
): { state: SimState; result: EngineResult } {
  const parsed = intentSchema.safeParse(intent);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path[0]);
    if (paths.includes("t"))
      return failure(
        state,
        "INVALID_TIME",
        "Intent time must be a nonnegative integer second",
      );
    if (paths.includes("p"))
      return failure(
        state,
        "INVALID_ESTIMATE",
        "Estimate must be a finite probability between 0 and 1",
      );
    if (
      paths.includes("role") &&
      intent !== null &&
      typeof intent === "object" &&
      role.safeParse(intent.role).success
    ) {
      return failure(
        state,
        "ROLE_FORBIDDEN",
        "Role is not permitted to perform this intent",
      );
    }
    return failure(
      state,
      "INVALID_INTENT",
      "Intent does not match the strict engine contract",
    );
  }
  const request = parsed.data;
  const forbidden = permissionError(state.mode, request);
  if (forbidden)
    return failure(
      state,
      forbidden,
      "Role is not permitted to perform this intent",
    );
  const timeError = invalidTime(state, request.t);
  if (timeError) return failure(state, "INVALID_TIME", timeError);
  if (state.phase === "PAUSED" && request.t !== state.nowSec) {
    return failure(
      state,
      "INVALID_TIME",
      "Paused intents must use the frozen simulated time",
    );
  }
  if (request.type === "START" && request.t !== 0) {
    return failure(state, "INVALID_TIME", "START must use time 0");
  }
  if (request.type === "RESET") {
    return success(
      createSession(scenario, {
        seed: state.seed,
        difficultyLevel: state.difficultyLevel,
        mode: state.mode,
        aidMode: state.aidMode,
      }),
      [{ kind: "PHASE_CHANGED", phase: "IDLE", atSec: 0 }],
    );
  }

  const admittedDp = scenario.decisionPoints[state.currentDecisionPointIndex];
  const progressed = advanceTo(state, scenario, request.t);
  const effects = progressed.effects;
  const current = progressed.state;
  if (progressed.error)
    return failure(
      current,
      progressed.error.code,
      progressed.error.message,
      effects,
    );
  if (request.type === "INJECT") {
    const known = scenario.injectPresets.some(
      (preset) => preset.id === request.presetId,
    );
    return failure(
      current,
      known ? "INVALID_INTENT" : "UNKNOWN_PRESET",
      known
        ? "Live instructor injects are deferred beyond Gate 1"
        : "Inject preset is not available",
      effects,
    );
  }
  if (request.type === "RELAY" || request.type === "ADVISE") {
    return failure(
      current,
      "INVALID_INTENT",
      "Multiplayer actions are deferred to P2",
      effects,
    );
  }
  if (
    (request.type === "DECIDE" || request.type === "VERIFY") &&
    admittedDp &&
    request.t >= admittedDp.closeSec &&
    !state.decisions.some(
      (decision) => decision.decisionPointId === admittedDp.id,
    )
  ) {
    return failure(
      current,
      "WINDOW_CLOSED",
      "Decision window is closed",
      effects,
    );
  }
  if (request.type === "START") {
    if (current.phase !== "IDLE")
      return failure(
        current,
        "NOT_RUNNING",
        "Exercise has already started",
        effects,
      );
    const started: SimState = {
      ...structuredClone(current),
      ...buildEventTimeline(scenario),
      phase: "RUNNING",
    };
    const due = advanceTo(started, scenario, 0);
    return success(due.state, [
      ...effects,
      { kind: "PHASE_CHANGED", phase: "RUNNING", atSec: 0 },
      ...due.effects,
    ]);
  }
  if (request.type === "RESUME") {
    if (current.phase !== "PAUSED")
      return failure(current, "NOT_RUNNING", "Exercise is not paused", effects);
    return success(
      { ...structuredClone(current), phase: "RUNNING", pausedAtSec: null },
      [
        ...effects,
        { kind: "PHASE_CHANGED", phase: "RUNNING", atSec: current.nowSec },
      ],
    );
  }
  if (
    current.phase !== "RUNNING" &&
    !(request.type === "OPEN_REPORT" && current.phase === "CONSEQUENCE")
  ) {
    return failure(current, "NOT_RUNNING", "Exercise is not running", effects);
  }
  if (request.type === "PAUSE") {
    return success(
      {
        ...structuredClone(current),
        phase: "PAUSED",
        pausedAtSec: current.nowSec,
      },
      [
        ...effects,
        { kind: "PHASE_CHANGED", phase: "PAUSED", atSec: current.nowSec },
      ],
    );
  }
  if (request.type === "OPEN_REPORT") {
    if (!reportAvailable(current, scenario, request.reportId, request.role)) {
      return failure(
        current,
        "UNKNOWN_REPORT",
        "Report is not available",
        effects,
      );
    }
    if (
      current.inspections.some(
        (record) =>
          record.reportId === request.reportId && record.role === request.role,
      )
    ) {
      return success(current, effects);
    }
    const next = structuredClone(current);
    next.inspections.push({
      reportId: request.reportId,
      role: request.role,
      atSec: next.nowSec,
    });
    return success(next, effects);
  }
  if (request.type === "SET_ESTIMATE") {
    const hypothesis = scenario.hypotheses.find(
      (item) => item.id === request.hypothesisId,
    );
    if (!hypothesis)
      return failure(
        current,
        "INVALID_ESTIMATE",
        "Hypothesis is not available",
        effects,
      );
    const next = structuredClone(current);
    next.estimates.push({
      hypothesisId: request.hypothesisId,
      p: request.p,
      role: request.role,
      atSec: next.nowSec,
    });
    if (
      hypothesis.primary &&
      next.aidMode === "AFTER_ESTIMATE" &&
      !Object.hasOwn(next.aidRevealedAtSecByRole, request.role)
    ) {
      next.aidRevealedAtSecByRole[request.role] = next.nowSec;
    }
    return success(next, effects);
  }
  if (request.type === "REVEAL_AID") {
    const primary = scenario.hypotheses.find(
      (hypothesis) => hypothesis.primary,
    );
    if (
      current.aidMode === "AFTER_ESTIMATE" &&
      !current.estimates.some(
        (estimate) =>
          estimate.role === request.role &&
          estimate.hypothesisId === primary?.id,
      )
    ) {
      return failure(
        current,
        "ESTIMATE_REQUIRED",
        "Log your own primary estimate before revealing the aid",
        effects,
      );
    }
    if (Object.hasOwn(current.aidRevealedAtSecByRole, request.role))
      return success(current, effects);
    const next = structuredClone(current);
    next.aidRevealedAtSecByRole[request.role] = next.nowSec;
    return success(next, effects);
  }

  const dp = scenario.decisionPoints[current.currentDecisionPointIndex];
  if (!dp || current.nowSec >= dp.closeSec)
    return failure(
      current,
      "WINDOW_CLOSED",
      "Decision window is closed",
      effects,
    );
  if (current.nowSec < dp.openSec)
    return failure(
      current,
      "WINDOW_NOT_OPEN",
      "Decision window is not open",
      effects,
    );
  if (request.type === "VERIFY") {
    const asset = scenario.assets.find(
      (item) => item.id === request.assetId && dp.assets.includes(item.id),
    );
    if (!asset)
      return failure(
        current,
        "UNKNOWN_ASSET",
        "Verification asset is not available",
        effects,
      );
    if (
      current.verifications.filter(
        (record) =>
          record.decisionPointId === dp.id && record.assetId === asset.id,
      ).length >= asset.capacity
    ) {
      return failure(
        current,
        "ASSET_EXHAUSTED",
        "Verification asset capacity is exhausted",
        effects,
      );
    }
    const deliversAtSec = current.nowSec + asset.delaySec;
    if (deliversAtSec >= dp.closeSec) {
      return failure(
        current,
        "VERIFY_TOO_LATE",
        "Result would arrive at or after the deadline",
        effects,
      );
    }
    let ordinal = current.verifications.length + 1;
    let verificationId = `V${String(ordinal).padStart(2, "0")}`;
    while (Object.hasOwn(current.reports, verificationId)) {
      ordinal += 1;
      verificationId = `V${String(ordinal).padStart(2, "0")}`;
    }
    const truthStance = current.truth[asset.hypothesisId] ? 1 : -1;
    const matches =
      scenario.verifyOutcomeMode === "TRUTH_CONSISTENT" ||
      rng(current.seed ^ hashString(verificationId)).next() < asset.rho;
    const stance = matches ? truthStance : truthStance === 1 ? -1 : 1;
    const claim =
      stance === 1
        ? asset.resultClaims.supports
        : asset.resultClaims.contradicts;
    let next = structuredClone(current);
    next.reports[verificationId] = {
      def: {
        id: verificationId,
        channel: asset.channel,
        hypothesisId: asset.hypothesisId,
        stance,
        claim,
        detail: claim,
        rho: asset.rho,
        evidenceGroup: `GV-${verificationId}`,
        issuedAtSec: deliversAtSec,
      },
      status: "IN_TRANSIT",
      deliveredAtSec: deliversAtSec,
      droppedReason: null,
      origin: "VERIFY",
      sequence: next.nextSequence,
      healthAtIssue: 1,
    };
    next.nextSequence += 1;
    next.verifications.push({
      id: verificationId,
      assetId: asset.id,
      hypothesisId: asset.hypothesisId,
      requestedAtSec: next.nowSec,
      deliversAtSec,
      costUnits: asset.costUnits,
      resultReportId: verificationId,
      role: request.role,
      decisionPointId: dp.id,
    });
    next = scheduleEvent(next, {
      kind: "REPORT_DELIVER",
      atSec: deliversAtSec,
      reportId: verificationId,
    });
    const due = advanceTo(next, scenario, next.nowSec);
    return success(due.state, [...effects, ...due.effects]);
  }

  const action = dp.actions.find((item) => item.id === request.actionId);
  if (!action)
    return failure(
      current,
      "UNKNOWN_ACTION",
      "Action is not available",
      effects,
    );
  if (
    dp.requiredEstimates.some(
      (hypothesisId) =>
        !current.estimates.some(
          (estimate) =>
            estimate.hypothesisId === hypothesisId &&
            estimate.role === request.role,
        ),
    )
  ) {
    return failure(
      current,
      "ESTIMATE_REQUIRED",
      "Log your own required estimates before deciding",
      effects,
    );
  }
  if (
    request.rationale?.citedReportIds.some(
      (reportId) => !reportAvailable(current, scenario, reportId, request.role),
    )
  ) {
    return failure(
      current,
      "UNKNOWN_REPORT",
      "Report is not available",
      effects,
    );
  }
  const committed = commitDecision(
    structuredClone(current),
    scenario,
    dp,
    action,
    request.role,
    false,
    request.rationale,
  );
  const due = advanceTo(committed.state, scenario, committed.state.nowSec);
  return success(due.state, [...effects, ...committed.effects, ...due.effects]);
}

export function replayLog(
  scenario: ScenarioDef,
  log: SessionLog,
  opts?: { upToSec: SimSeconds; upToIntentIndex?: number },
): SimState {
  const parsed = logSchema.parse(log);
  if (
    parsed.scenarioId !== scenario.meta.id ||
    parsed.scenarioVersion !== scenario.meta.version ||
    parsed.scenarioHash !== scenarioHash(scenario)
  ) {
    throw new Error(
      "Session log does not match the scenario ID, version, and hash",
    );
  }
  let state = createSession(scenario, {
    seed: parsed.seed,
    difficultyLevel: parsed.difficultyLevel,
    mode: parsed.mode,
    aidMode: parsed.aidMode,
  });
  let previousSec = 0;
  parsed.intents.forEach((intent, index) => {
    if (intent.t < previousSec)
      throw new Error(`Session log intent ${index} is backdated`);
    if (permissionError(parsed.mode, intent))
      throw new Error(`Session log intent ${index} has a forbidden role`);
    if (intent.type === "RESET")
      throw new Error("RESET requires a fresh exercise log");
    previousSec = intent.t;
  });
  const options =
    opts === undefined
      ? undefined
      : z
          .strictObject({
            upToSec: seconds,
            upToIntentIndex: z.number().int().nonnegative().optional(),
          })
          .parse(opts);
  if (
    options?.upToIntentIndex !== undefined &&
    options.upToIntentIndex >= parsed.intents.length
  ) {
    throw new RangeError("Replay intent index is outside the accepted log");
  }
  const intents =
    options === undefined
      ? parsed.intents
      : options.upToIntentIndex === undefined
        ? parsed.intents.filter((intent) => intent.t <= options.upToSec)
        : parsed.intents.slice(0, options.upToIntentIndex + 1);
  for (const [index, intent] of intents.entries()) {
    if (options && intent.t > options.upToSec) {
      throw new RangeError("Replay horizon precedes an included intent");
    }
    const applied = applyIntent(state, scenario, intent);
    if (!applied.result.ok) {
      throw new Error(
        `Session log intent ${index} was not accepted: ${applied.result.error}: ${applied.result.message}`,
      );
    }
    state = applied.state;
  }
  if (options) {
    const result = advanceTo(state, scenario, options.upToSec);
    if (result.error) throw new RangeError(result.error.message);
    return result.state;
  }
  while (state.phase === "RUNNING" || state.phase === "CONSEQUENCE") {
    const next = state.eventTimeline[state.processedEventCursor];
    if (!next)
      throw new Error("Session schedule ended without a terminal consequence");
    const result = advanceTo(state, scenario, next.atSec);
    if (result.error) throw new RangeError(result.error.message);
    state = result.state;
  }
  return state;
}
