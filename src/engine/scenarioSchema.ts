import { z } from "zod";

const id = z.string().min(1);
const text = z.string().min(1);
const finite = z.number().finite();
const seconds = finite.int().nonnegative();
const minutes = finite.nonnegative().multipleOf(0.5);
const rho = finite.gt(0.5).lt(1);
const channel = z.enum(["LAND", "AIR", "CYBER", "EW"]);
const role = z.enum(["SOLO", "COMMANDER", "ANALYST", "INSTRUCTOR"]);
const stance = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
const degradationMode = z.enum(["DELAY", "DROPOUT", "BURST", "NOISE"]);
const when = z.record(id, z.boolean());

const meta = z.strictObject({
  id: id.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: finite.int().positive(),
  title: text,
  subtitle: text,
  synthetic: z.literal(true),
  difficulty: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  durationSec: seconds,
  summary: text.max(280),
  briefing: z.array(text).min(1),
  tags: z.array(text),
});

const hypothesis = z.strictObject({
  id,
  label: text,
  trueLabel: text,
  falseLabel: text,
  prior: finite.gt(0).lt(1),
  primary: z.boolean(),
  initialTruth: z.boolean(),
});

const channelDef = z.strictObject({
  id: channel,
  label: text,
  sourceLabel: text,
  tauSec: seconds.positive(),
  baseDelaySec: seconds,
  visibleTo: z.array(role).min(1),
});

const report = z.strictObject({
  id,
  channel,
  hypothesisId: id.nullable(),
  stance,
  claim: text.max(90),
  detail: text.max(400),
  rho,
  evidenceGroup: id,
  issuedAtSec: seconds,
});

const truthChange = z.strictObject({
  kind: z.literal("TRUTH_CHANGE"),
  atSec: seconds,
  hypothesisId: id,
  value: z.boolean(),
});

const channelDegrade = z.strictObject({
  kind: z.literal("CHANNEL_DEGRADE"),
  atSec: seconds,
  channel,
  mode: degradationMode,
  extraDelaySec: seconds.optional(),
  healthMultiplier: finite.gt(0).lt(1).optional(),
  untilSec: seconds,
  note: text,
});

const channelRestore = z.strictObject({
  kind: z.literal("CHANNEL_RESTORE"),
  atSec: seconds,
  channel,
});

const reportIssue = z.strictObject({
  kind: z.literal("REPORT_ISSUE"),
  atSec: seconds,
  reportId: id,
});

const consequence = z.strictObject({
  when,
  headline: text,
  narrative: text,
  arrivalSec: seconds,
});

const action = z.strictObject({
  id,
  label: text,
  description: text,
  terminal: z.literal(true),
  delayCostApplies: z.boolean(),
  utility: z.array(z.strictObject({ when, value: finite })).min(1),
  consequences: z.array(consequence).min(1),
});

const asset = z.strictObject({
  id,
  label: text,
  channel,
  hypothesisId: id,
  delaySec: seconds,
  costUnits: finite.nonnegative(),
  rho,
  capacity: finite.int().positive(),
  resultClaims: z.strictObject({
    supports: text.max(90),
    contradicts: text.max(90),
  }),
});

const decisionPoint = z.strictObject({
  id,
  title: text,
  prompt: text,
  openSec: seconds,
  closeSec: seconds,
  departureSec: seconds,
  delayCostPerMin: finite.nonnegative(),
  timeoutActionId: id,
  actions: z.array(action).min(1),
  assets: z.array(id),
  requiredEstimates: z.array(id),
});

const degradePreset = z.strictObject({
  kind: z.literal("DEGRADE"),
  channel,
  mode: degradationMode,
  extraDelaySec: seconds.optional(),
  durationSec: seconds.positive(),
  healthMultiplier: finite.gt(0).lt(1).optional(),
});

const restorePreset = z.strictObject({ kind: z.literal("RESTORE_ALL") });
const falseReportPreset = z.strictObject({
  kind: z.literal("FALSE_REPORT"),
  channel,
  hypothesisId: id,
  stance,
  rho,
  claim: text.max(90),
  detail: text.max(400),
});

const injectPreset = z.strictObject({
  id,
  label: text,
  description: text,
  effect: z.discriminatedUnion("kind", [
    degradePreset,
    restorePreset,
    falseReportPreset,
  ]),
});

export const scenarioRuntimeSchema = z.strictObject({
  meta,
  hypotheses: z.array(hypothesis).min(1).max(6),
  channels: z.array(channelDef).length(4),
  reports: z.array(report),
  events: z.array(
    z.discriminatedUnion("kind", [
      truthChange,
      channelDegrade,
      channelRestore,
      reportIssue,
    ]),
  ),
  assets: z.array(asset),
  decisionPoints: z.array(decisionPoint).min(1),
  outcomeScale: z.strictObject({ min: finite, max: finite }),
  verifyOutcomeMode: z.enum(["TRUTH_CONSISTENT", "STOCHASTIC"]),
  injectPresets: z.array(injectPreset),
  scoreWeights: z.strictObject({
    decisionQuality: finite.nonnegative(),
    informationUtilization: finite.nonnegative(),
    outcome: finite.nonnegative(),
    timeliness: finite.nonnegative(),
    verificationEfficiency: finite.nonnegative(),
    calibration: finite.nonnegative(),
  }),
  model: z.strictObject({
    llrClamp: finite.positive(),
    contradictionMinNats: finite.nonnegative(),
    contradictionThreshold: finite.min(0).max(1),
    tieEpsilon: finite.nonnegative(),
  }),
});

const authoredConsequence = consequence.omit({ arrivalSec: true }).extend({
  arrivalMin: minutes,
});

const authoredAction = action.extend({
  consequences: z.array(authoredConsequence).min(1),
});

export const scenarioAuthoringSchema = scenarioRuntimeSchema.extend({
  meta: meta.omit({ durationSec: true }).extend({ durationMin: minutes }),
  channels: z
    .array(
      channelDef.omit({ tauSec: true, baseDelaySec: true }).extend({
        tauMin: minutes.positive(),
        baseDelayMin: minutes,
      }),
    )
    .length(4),
  reports: z.array(
    report.omit({ issuedAtSec: true }).extend({ issuedAtMin: minutes }),
  ),
  events: z.array(
    z.discriminatedUnion("kind", [
      truthChange.omit({ atSec: true }).extend({ atMin: minutes }),
      channelDegrade
        .omit({ atSec: true, untilSec: true, extraDelaySec: true })
        .extend({
          atMin: minutes,
          untilMin: minutes,
          extraDelayMin: minutes.optional(),
        }),
      reportIssue.omit({ atSec: true }).extend({ atMin: minutes }),
    ]),
  ),
  assets: z.array(asset.omit({ delaySec: true }).extend({ delayMin: minutes })),
  decisionPoints: z
    .array(
      decisionPoint
        .omit({ openSec: true, closeSec: true, departureSec: true })
        .extend({
          openMin: minutes,
          closeMin: minutes,
          departureMin: minutes,
          actions: z.array(authoredAction).min(1),
        }),
    )
    .min(1),
  injectPresets: z.array(
    injectPreset.extend({
      effect: z.discriminatedUnion("kind", [
        degradePreset.omit({ extraDelaySec: true, durationSec: true }).extend({
          extraDelayMin: minutes.optional(),
          durationMin: minutes.positive(),
        }),
        restorePreset,
        falseReportPreset,
      ]),
    }),
  ),
});
