export type SimSeconds = number;
export type ChannelId = "LAND" | "AIR" | "CYBER" | "EW";
export type RoleId = "SOLO" | "COMMANDER" | "ANALYST" | "INSTRUCTOR";
export type SessionMode = "LOCAL" | "NETWORKED";
export type Stance = -1 | 0 | 1;
export type HypothesisId = string;
export type ReportId = string;
export type ActionId = string;
export type AssetId = string;
export type EvidenceGroupId = string;

export type ChannelMode = "HEALTHY" | "DELAY" | "DROPOUT" | "BURST" | "NOISE";
export type ChannelHealth = "HEALTHY" | "DEGRADED" | "DOWN";
export type ReportStatus = "SCHEDULED" | "IN_TRANSIT" | "DELIVERED" | "DROPPED";
export type Phase = "IDLE" | "RUNNING" | "PAUSED" | "CONSEQUENCE" | "COMPLETE";
export type Quadrant = "SOUND_SUCCESS" | "SOUND_UNLUCKY" | "LUCKY" | "POOR";
export type Posture = "BALANCED" | "OVER_COMMITTED" | "OVER_CAUTIOUS";

export interface ScenarioMeta {
  id: string;
  version: number;
  title: string;
  subtitle: string;
  synthetic: true;
  difficulty: 1 | 2 | 3 | 4 | 5;
  durationSec: SimSeconds;
  summary: string;
  briefing: string[];
  tags: string[];
}

export interface HypothesisDef {
  id: HypothesisId;
  label: string;
  trueLabel: string;
  falseLabel: string;
  prior: number;
  primary: boolean;
  initialTruth: boolean;
}

export interface ChannelDef {
  id: ChannelId;
  label: string;
  sourceLabel: string;
  tauSec: SimSeconds;
  baseDelaySec: SimSeconds;
  visibleTo: RoleId[];
}

export interface ReportDef {
  id: ReportId;
  channel: ChannelId;
  hypothesisId: HypothesisId | null;
  stance: Stance;
  claim: string;
  detail: string;
  rho: number;
  evidenceGroup: EvidenceGroupId;
  issuedAtSec: SimSeconds;
}

export type ScenarioEvent =
  | {
      kind: "TRUTH_CHANGE";
      atSec: SimSeconds;
      hypothesisId: HypothesisId;
      value: boolean;
    }
  | {
      kind: "CHANNEL_DEGRADE";
      atSec: SimSeconds;
      channel: ChannelId;
      mode: Exclude<ChannelMode, "HEALTHY">;
      extraDelaySec?: SimSeconds;
      healthMultiplier?: number;
      untilSec: SimSeconds;
      note: string;
    }
  | { kind: "CHANNEL_RESTORE"; atSec: SimSeconds; channel: ChannelId }
  | { kind: "REPORT_ISSUE"; atSec: SimSeconds; reportId: ReportId };

export interface UtilityRule {
  when: Record<HypothesisId, boolean>;
  value: number;
}

export interface ActionDef {
  id: ActionId;
  label: string;
  description: string;
  terminal: true;
  delayCostApplies: boolean;
  utility: UtilityRule[];
  consequences: {
    when: Record<HypothesisId, boolean>;
    headline: string;
    narrative: string;
    arrivalSec: SimSeconds;
  }[];
}

export interface AssetDef {
  id: AssetId;
  label: string;
  channel: ChannelId;
  hypothesisId: HypothesisId;
  delaySec: SimSeconds;
  costUnits: number;
  rho: number;
  capacity: number;
  resultClaims: { supports: string; contradicts: string };
}

export interface DecisionPointDef {
  id: string;
  title: string;
  prompt: string;
  openSec: SimSeconds;
  closeSec: SimSeconds;
  departureSec: SimSeconds;
  delayCostPerMin: number;
  timeoutActionId: ActionId;
  actions: ActionDef[];
  assets: AssetId[];
  requiredEstimates: HypothesisId[];
}

export interface ScenarioDef {
  meta: ScenarioMeta;
  hypotheses: HypothesisDef[];
  channels: ChannelDef[];
  reports: ReportDef[];
  events: ScenarioEvent[];
  assets: AssetDef[];
  decisionPoints: DecisionPointDef[];
  outcomeScale: { min: number; max: number };
  verifyOutcomeMode: "TRUTH_CONSISTENT" | "STOCHASTIC";
  injectPresets: InjectPresetDef[];
  scoreWeights: ScoreWeights;
  model: ModelParams;
}

export interface ModelParams {
  llrClamp: number;
  contradictionMinNats: number;
  contradictionThreshold: number;
  tieEpsilon: number;
}

export interface ScoreWeights {
  decisionQuality: number;
  informationUtilization: number;
  outcome: number;
  timeliness: number;
  verificationEfficiency: number;
  calibration: number;
}

export interface InjectPresetDef {
  id: string;
  label: string;
  description: string;
  effect:
    | {
        kind: "DEGRADE";
        channel: ChannelId;
        mode: Exclude<ChannelMode, "HEALTHY">;
        extraDelaySec?: SimSeconds;
        durationSec: SimSeconds;
        healthMultiplier?: number;
      }
    | { kind: "RESTORE_ALL" }
    | {
        kind: "FALSE_REPORT";
        channel: ChannelId;
        hypothesisId: HypothesisId;
        stance: Stance;
        rho: number;
        claim: string;
        detail: string;
      };
}

export interface ChannelRuntime {
  id: ChannelId;
  mode: ChannelMode;
  health: ChannelHealth;
  extraDelaySec: SimSeconds;
  healthMultiplier: number;
  untilSec: SimSeconds | null;
  note: string | null;
  lastDeliveredAtSec: SimSeconds | null;
}

export interface ReportRuntime {
  def: ReportDef;
  status: ReportStatus;
  deliveredAtSec: SimSeconds | null;
  droppedReason: "DROPOUT" | null;
  origin: "SCENARIO" | "INJECT" | "VERIFY" | "RELAY";
  relayedFrom?: { role: RoleId; atSec: SimSeconds; note?: string };
  sequence: number;
  healthAtIssue: number;
}

export interface EstimateRecord {
  atSec: SimSeconds;
  hypothesisId: HypothesisId;
  p: number;
  role: RoleId;
}

export interface InspectRecord {
  atSec: SimSeconds;
  reportId: ReportId;
  role: RoleId;
}

export interface VerificationRecord {
  id: string;
  assetId: AssetId;
  hypothesisId: HypothesisId;
  requestedAtSec: SimSeconds;
  deliversAtSec: SimSeconds;
  costUnits: number;
  resultReportId: ReportId;
  role: RoleId;
  decisionPointId: string;
}

export interface Rationale {
  text: string;
  citedReportIds: ReportId[];
  tags: RationaleTag[];
}

export type RationaleTag =
  | "RELIED_ON_FRESH_REPORT"
  | "DISCOUNTED_STALE_REPORT"
  | "WEIGHED_CONTRADICTION"
  | "PRIORITIZED_SAFETY"
  | "PRIORITIZED_TIME"
  | "AWAITED_VERIFICATION"
  | "FOLLOWED_TEAM_ADVICE"
  | "OTHER";

export interface DecisionRecord {
  decisionPointId: string;
  atSec: SimSeconds;
  actionId: ActionId;
  role: RoleId;
  timedOut: boolean;
  rationale: Rationale | null;
  estimates: Record<HypothesisId, number>;
  consultedAid: boolean;
}

export interface BeliefSnapshot {
  atSec: SimSeconds;
  perHypothesis: Record<HypothesisId, HypothesisBelief>;
  fogIndex: number;
}

export interface HypothesisBelief {
  p: number;
  logOdds: number;
  entropyBits: number;
  contributions: EvidenceContribution[];
  positiveNats: number;
  negativeNats: number;
  contradictionIndex: number;
  contradicted: boolean;
}

export interface EvidenceContribution {
  reportId: ReportId;
  group: EvidenceGroupId;
  channel: ChannelId;
  stance: Stance;
  rho: number;
  ageSec: SimSeconds;
  effectiveAccuracy: number;
  llr: number;
  weight: number;
}

// Internal state and events are not trainee-facing projections.
export interface SimState {
  scenarioId: string;
  scenarioVersion: number;
  seed: number;
  difficultyLevel: number;
  mode: SessionMode;
  phase: Phase;
  nowSec: SimSeconds;
  channels: Record<ChannelId, ChannelRuntime>;
  reports: Record<ReportId, ReportRuntime>;
  truth: Record<HypothesisId, boolean>;
  nextSequence: number;
  inspections: InspectRecord[];
  estimates: EstimateRecord[];
  verifications: VerificationRecord[];
  decisions: DecisionRecord[];
  currentDecisionPointIndex: number;
  consequenceRevealAtSec: SimSeconds | null;
  aidRevealedAtSecByRole: Partial<Record<RoleId, SimSeconds>>;
  pausedAtSec: SimSeconds | null;
  relays: {
    fromRole: RoleId;
    reportId: ReportId;
    atSec: SimSeconds;
    relayReportId: ReportId;
    note?: string;
  }[];
  advice: {
    role: RoleId;
    atSec: SimSeconds;
    actionId: ActionId;
    note?: string;
  }[];
  aidMode: "ALWAYS" | "AFTER_ESTIMATE";
  eventTimeline: InternalEvent[];
  nextEventOrder: number;
  processedEventCursor: number;
  injectedCounter: number;
}

export interface InternalEvent {
  atSec: SimSeconds;
  priority: number;
  order: number;
  kind:
    | "TRUTH_CHANGE"
    | "CHANNEL_DEGRADE"
    | "CHANNEL_RESTORE"
    | "CHANNEL_FORCE_RESTORE"
    | "REPORT_ISSUE"
    | "REPORT_DELIVER"
    | "DECISION_OPEN"
    | "DECISION_CLOSE"
    | "CONSEQUENCE_REVEAL";
  payload: unknown;
}

export type Intent =
  | { type: "START"; t: SimSeconds; role: RoleId }
  | { type: "PAUSE"; t: SimSeconds; role: RoleId }
  | { type: "RESUME"; t: SimSeconds; role: RoleId }
  | {
      type: "OPEN_REPORT";
      t: SimSeconds;
      reportId: ReportId;
      role: RoleId;
    }
  | {
      type: "SET_ESTIMATE";
      t: SimSeconds;
      hypothesisId: HypothesisId;
      p: number;
      role: RoleId;
    }
  | { type: "REVEAL_AID"; t: SimSeconds; role: RoleId }
  | { type: "VERIFY"; t: SimSeconds; assetId: AssetId; role: RoleId }
  | {
      type: "RELAY";
      t: SimSeconds;
      reportId: ReportId;
      role: RoleId;
      note?: string;
    }
  | {
      type: "ADVISE";
      t: SimSeconds;
      role: RoleId;
      actionId: ActionId;
      note?: string;
    }
  | {
      type: "DECIDE";
      t: SimSeconds;
      actionId: ActionId;
      role: RoleId;
      rationale: Rationale | null;
    }
  | {
      type: "INJECT";
      t: SimSeconds;
      presetId: string;
      role: "INSTRUCTOR";
    }
  | { type: "RESET"; t: SimSeconds; role: RoleId };

export type EngineErrorCode =
  | "NOT_RUNNING"
  | "WINDOW_NOT_OPEN"
  | "WINDOW_CLOSED"
  | "ESTIMATE_REQUIRED"
  | "ROLE_FORBIDDEN"
  | "UNKNOWN_REPORT"
  | "REPORT_NOT_DELIVERED"
  | "UNKNOWN_ACTION"
  | "UNKNOWN_ASSET"
  | "ASSET_EXHAUSTED"
  | "VERIFY_TOO_LATE"
  | "INVALID_ESTIMATE"
  | "UNKNOWN_PRESET"
  | "RELAY_LIMIT"
  | "RELAY_FORBIDDEN"
  | "ADVICE_FORBIDDEN"
  | "INVALID_TIME"
  | "INVALID_INTENT";

export type EngineEffect =
  | { kind: "REPORT_DELIVERED"; reportId: ReportId; atSec: SimSeconds }
  | { kind: "REPORT_DROPPED"; reportId: ReportId; atSec: SimSeconds }
  | { kind: "CHANNEL_CHANGED"; channel: ChannelId; atSec: SimSeconds }
  | { kind: "TRUTH_CHANGED"; atSec: SimSeconds }
  | {
      kind: "DECISION_WINDOW_OPENED" | "DECISION_WINDOW_CLOSED";
      decisionPointId: string;
      atSec: SimSeconds;
    }
  | { kind: "PHASE_CHANGED"; phase: Phase; atSec: SimSeconds };

export type EngineResult<T = void> =
  | { ok: true; value: T; effects: EngineEffect[] }
  | {
      ok: false;
      error: EngineErrorCode;
      message: string;
      effects: EngineEffect[];
    };

export interface SessionLog {
  logVersion: 1;
  scenarioId: string;
  scenarioVersion: number;
  scenarioHash: string;
  seed: number;
  difficultyLevel: number;
  mode: SessionMode;
  aidMode: "ALWAYS" | "AFTER_ESTIMATE";
  intents: Intent[];
}
