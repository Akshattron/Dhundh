import { hashString } from "./rng";
import {
  scenarioAuthoringSchema,
  scenarioRuntimeSchema,
} from "./scenarioSchema";
import type {
  ChannelMode,
  HypothesisDef,
  HypothesisId,
  ScenarioDef,
  ScenarioEvent,
} from "./types";

interface ValidationIssue {
  path: PropertyKey[];
  code: string;
  message: string;
}

export class ScenarioValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(
      issues
        .map(
          (issue) =>
            `$${issue.path
              .map((part) =>
                typeof part === "number" ? `[${part}]` : `.${String(part)}`,
              )
              .join("")}: ${issue.code}: ${issue.message}`,
        )
        .join("\n"),
    );
    this.name = "ScenarioValidationError";
    this.issues = issues;
  }
}

export function enumerateStates(
  hyps: HypothesisDef[],
): Record<HypothesisId, boolean>[] {
  if (hyps.length > 6) {
    throw new RangeError(
      "Joint-state enumeration supports at most 6 hypotheses",
    );
  }
  return Array.from({ length: 2 ** hyps.length }, (_, mask) =>
    Object.fromEntries(
      hyps.map((hypothesis, index) => [
        hypothesis.id,
        (mask & (1 << index)) !== 0,
      ]),
    ),
  );
}

export function validateRuntimeScenario(raw: unknown): ScenarioDef {
  const parsed = scenarioRuntimeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ScenarioValidationError(parsed.error.issues);
  }
  const scenario = parsed.data;
  const issues: ValidationIssue[] = [];
  const fail = (path: PropertyKey[], message: string) => {
    issues.push({ path, code: "custom", message });
  };
  const unique = (
    values: string[],
    path: PropertyKey[],
    memberField?: string,
  ) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        fail(
          [...path, index, ...(memberField ? [memberField] : [])],
          `Duplicate ID "${value}"`,
        );
      }
      seen.add(value);
    });
  };
  const ref = (value: string, ids: Set<string>, path: PropertyKey[]) => {
    if (!ids.has(value)) {
      fail(path, `Unknown reference "${value}"`);
    }
  };
  const hypotheses = new Set(scenario.hypotheses.map((item) => item.id));
  const channels = new Set(scenario.channels.map((item) => item.id));
  const reports = new Set(scenario.reports.map((item) => item.id));
  const assets = new Set(scenario.assets.map((item) => item.id));

  for (const collection of [
    "hypotheses",
    "channels",
    "reports",
    "assets",
    "decisionPoints",
    "injectPresets",
  ] as const) {
    unique(
      scenario[collection].map((item) => item.id),
      [collection],
      "id",
    );
  }
  if (scenario.hypotheses.filter((item) => item.primary).length !== 1) {
    fail(["hypotheses"], "Exactly one hypothesis must be primary");
  }
  scenario.channels.forEach((item, index) => {
    unique(item.visibleTo, ["channels", index, "visibleTo"]);
  });

  const checkDegradation = (
    effect: {
      mode: Exclude<ChannelMode, "HEALTHY">;
      extraDelaySec?: number;
      healthMultiplier?: number;
    },
    path: PropertyKey[],
  ) => {
    if ((effect.mode === "DELAY") !== (effect.extraDelaySec !== undefined)) {
      fail(
        [...path, "extraDelaySec"],
        "extraDelaySec is required for DELAY and forbidden for other modes",
      );
    }
    if ((effect.mode === "NOISE") !== (effect.healthMultiplier !== undefined)) {
      fail(
        [...path, "healthMultiplier"],
        "healthMultiplier is required for NOISE and forbidden for other modes",
      );
    }
  };

  scenario.reports.forEach((item, index) => {
    const path = ["reports", index];
    ref(item.channel, channels, [...path, "channel"]);
    if (item.hypothesisId !== null) {
      ref(item.hypothesisId, hypotheses, [...path, "hypothesisId"]);
    }
    if ((item.stance === 0) !== (item.hypothesisId === null)) {
      fail(
        [...path, "stance"],
        "stance is 0 if and only if hypothesisId is null",
      );
    }
    const scheduled = scenario.events.filter(
      (event) => event.kind === "REPORT_ISSUE" && event.reportId === item.id,
    );
    if (scheduled.length !== 1) {
      fail([...path, "id"], "Report must have exactly one REPORT_ISSUE event");
    }
    if (scheduled.some((event) => event.atSec !== item.issuedAtSec)) {
      fail(
        [...path, "issuedAtSec"],
        "Report and REPORT_ISSUE times must match",
      );
    }
  });

  scenario.events.forEach((event, index) => {
    const path = ["events", index];
    switch (event.kind) {
      case "TRUTH_CHANGE":
        ref(event.hypothesisId, hypotheses, [...path, "hypothesisId"]);
        break;
      case "REPORT_ISSUE":
        ref(event.reportId, reports, [...path, "reportId"]);
        break;
      case "CHANNEL_RESTORE":
        ref(event.channel, channels, [...path, "channel"]);
        break;
      case "CHANNEL_DEGRADE":
        ref(event.channel, channels, [...path, "channel"]);
        checkDegradation(event, path);
        if (event.untilSec <= event.atSec) {
          fail([...path, "untilSec"], "Restoration must follow degradation");
        }
        if (
          !scenario.events.some(
            (restore) =>
              restore.kind === "CHANNEL_RESTORE" &&
              restore.channel === event.channel &&
              restore.atSec === event.untilSec,
          )
        ) {
          fail(path, "Degradation must have a matching automatic restore");
        }
        break;
    }
  });

  scenario.assets.forEach((item, index) => {
    ref(item.channel, channels, ["assets", index, "channel"]);
    ref(item.hypothesisId, hypotheses, ["assets", index, "hypothesisId"]);
  });

  const states = enumerateStates(scenario.hypotheses);
  scenario.decisionPoints.forEach((dp, index) => {
    const path = ["decisionPoints", index];
    unique(
      dp.actions.map((item) => item.id),
      [...path, "actions"],
      "id",
    );
    unique(dp.assets, [...path, "assets"]);
    unique(dp.requiredEstimates, [...path, "requiredEstimates"]);
    if (dp.closeSec <= dp.openSec) {
      fail([...path, "closeSec"], "Decision close must be after open");
    }
    ref(dp.timeoutActionId, new Set(dp.actions.map((item) => item.id)), [
      ...path,
      "timeoutActionId",
    ]);
    dp.requiredEstimates.forEach((value, estimateIndex) =>
      ref(value, hypotheses, [...path, "requiredEstimates", estimateIndex]),
    );
    dp.assets.forEach((value, assetIndex) => {
      ref(value, assets, [...path, "assets", assetIndex]);
      const item = scenario.assets.find((candidate) => candidate.id === value);
      if (item && dp.openSec + item.delaySec >= dp.closeSec) {
        fail(
          [...path, "assets", assetIndex],
          "Asset must have a request opportunity with a result strictly before close",
        );
      }
    });
    dp.actions.forEach((item, actionIndex) => {
      for (const collection of ["utility", "consequences"] as const) {
        const rulePath = [...path, "actions", actionIndex, collection];
        item[collection].forEach((rule, ruleIndex) => {
          Object.keys(rule.when).forEach((key) =>
            ref(key, hypotheses, [...rulePath, ruleIndex, "when", key]),
          );
        });
        for (const state of states) {
          if (
            !item[collection].some((rule) =>
              Object.entries(rule.when).every(
                ([key, value]) =>
                  Object.hasOwn(state, key) && state[key] === value,
              ),
            )
          ) {
            fail(
              rulePath,
              `No rule covers joint truth state ${JSON.stringify(state)}`,
            );
          }
        }
      }
    });
  });

  scenario.injectPresets.forEach((preset, index) => {
    const effect = preset.effect;
    const path = ["injectPresets", index, "effect"];
    if (effect.kind !== "RESTORE_ALL") {
      ref(effect.channel, channels, [...path, "channel"]);
    }
    if (effect.kind === "DEGRADE") {
      checkDegradation(effect, path);
    } else if (effect.kind === "FALSE_REPORT") {
      ref(effect.hypothesisId, hypotheses, [...path, "hypothesisId"]);
      if (effect.stance === 0) {
        fail(
          [...path, "stance"],
          "A report about a hypothesis cannot be neutral",
        );
      }
    }
  });

  if (scenario.outcomeScale.min >= scenario.outcomeScale.max) {
    fail(["outcomeScale"], "Outcome minimum must be less than maximum");
  }
  const weightSum = Object.values(scenario.scoreWeights).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (Math.abs(weightSum - 1) > 1e-9) {
    fail(["scoreWeights"], "Score weights must sum to 1 within 1e-9");
  }
  if (scenario.scoreWeights.outcome > 0.15) {
    fail(["scoreWeights", "outcome"], "Outcome weight must not exceed 0.15");
  }
  if (scenario.scoreWeights.calibration > 0.05) {
    fail(
      ["scoreWeights", "calibration"],
      "Calibration weight must not exceed 0.05",
    );
  }
  const horizonMinimum =
    Math.max(
      ...scenario.decisionPoints.map((dp) => dp.closeSec),
      ...scenario.decisionPoints.flatMap((dp) =>
        dp.actions.flatMap((item) =>
          item.consequences.map((rule) => rule.arrivalSec),
        ),
      ),
    ) + 60;
  if (scenario.meta.durationSec < horizonMinimum) {
    fail(
      ["meta", "durationSec"],
      `Exercise horizon must be at least ${horizonMinimum} seconds; it is not a completion ceiling`,
    );
  }
  if (issues.length > 0) {
    throw new ScenarioValidationError(issues);
  }
  return scenario;
}

export function loadScenario(raw: unknown): ScenarioDef {
  const parsed = scenarioAuthoringSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ScenarioValidationError(parsed.error.issues);
  }
  const authored = parsed.data;
  const seconds = (value: number) => Math.round(value * 60);
  const { durationMin, ...meta } = authored.meta;
  return validateRuntimeScenario({
    ...authored,
    meta: { ...meta, durationSec: seconds(durationMin) },
    channels: authored.channels.map(({ tauMin, baseDelayMin, ...item }) => ({
      ...item,
      tauSec: seconds(tauMin),
      baseDelaySec: seconds(baseDelayMin),
    })),
    reports: authored.reports.map(({ issuedAtMin, ...item }) => ({
      ...item,
      issuedAtSec: seconds(issuedAtMin),
    })),
    events: authored.events.flatMap<ScenarioEvent>(({ atMin, ...event }) => {
      const atSec = seconds(atMin);
      if (event.kind !== "CHANNEL_DEGRADE") {
        return [{ ...event, atSec }];
      }
      const { untilMin, extraDelayMin, ...degradation } = event;
      const untilSec = seconds(untilMin);
      return [
        {
          ...degradation,
          atSec,
          untilSec,
          ...(extraDelayMin === undefined
            ? {}
            : { extraDelaySec: seconds(extraDelayMin) }),
        },
        { kind: "CHANNEL_RESTORE", atSec: untilSec, channel: event.channel },
      ];
    }),
    assets: authored.assets.map(({ delayMin, ...item }) => ({
      ...item,
      delaySec: seconds(delayMin),
    })),
    decisionPoints: authored.decisionPoints.map(
      ({ openMin, closeMin, departureMin, actions, ...dp }) => ({
        ...dp,
        openSec: seconds(openMin),
        closeSec: seconds(closeMin),
        departureSec: seconds(departureMin),
        actions: actions.map(({ consequences, ...item }) => ({
          ...item,
          consequences: consequences.map(({ arrivalMin, ...rule }) => ({
            ...rule,
            arrivalSec: seconds(arrivalMin),
          })),
        })),
      }),
    ),
    injectPresets: authored.injectPresets.map(({ effect, ...preset }) => {
      if (effect.kind !== "DEGRADE") {
        return { ...preset, effect };
      }
      const { durationMin: duration, extraDelayMin, ...degradation } = effect;
      return {
        ...preset,
        effect: {
          ...degradation,
          durationSec: seconds(duration),
          ...(extraDelayMin === undefined
            ? {}
            : { extraDelaySec: seconds(extraDelayMin) }),
        },
      };
    }),
  });
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  throw new TypeError("Scenario hash requires finite JSON data");
}

export function scenarioHash(def: ScenarioDef): string {
  return hashString(canonicalJson(def)).toString(16).padStart(8, "0");
}
