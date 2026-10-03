import { z } from "zod";
import { PROFILES, type DifficultyLevel } from "./difficulty";
import { hashString, rng } from "./rng";
import {
  ScenarioValidationError,
  validateRuntimeScenario,
} from "./scenarioLoader";
import { assessScenarioReadiness } from "./scenarioReadiness";
import type { ScenarioDef } from "./types";

const mutationInput = z.strictObject({
  seed: z.number().refine(Number.isSafeInteger, "Seed must be a safe integer"),
  level: z.number().int().min(1).max(5),
});

function variant(
  base: ScenarioDef,
  seed: number,
  level: DifficultyLevel,
): ScenarioDef {
  const scenario = structuredClone(base);
  const profile = PROFILES[level];
  scenario.meta.difficulty = level;
  scenario.decisionPoints.forEach((dp) => {
    dp.closeSec = Math.max(
      dp.openSec + 600,
      dp.closeSec + profile.closeDeltaMin * 60,
    );
  });

  // Events belong to the first authored closing window after their original time.
  const closeFor = (atSec: number): number => {
    const index = base.decisionPoints.findIndex((dp) => atSec < dp.closeSec);
    return scenario.decisionPoints[
      index < 0 ? scenario.decisionPoints.length - 1 : index
    ]!.closeSec;
  };
  const jitter = rng(seed ^ 0x51);
  const reliability = rng(seed ^ 0x52);
  const decoys = rng(seed ^ 0x53);
  const reports = new Map(
    scenario.reports.map((report) => [report.id, report]),
  );
  const restores = new Map<number, number>();
  scenario.events.forEach((event, index) => {
    if (event.kind !== "CHANNEL_DEGRADE") return;
    const restoreIndex = base.events.findIndex(
      (restore) =>
        restore.kind === "CHANNEL_RESTORE" &&
        restore.channel === event.channel &&
        restore.atSec === event.untilSec,
    );
    restores.set(index, restoreIndex);
    if (event.extraDelaySec !== undefined) {
      event.extraDelaySec = Math.max(
        60,
        Math.round((event.extraDelaySec * profile.delayScale) / 60) * 60,
      );
    }
    if (event.mode === "DROPOUT") {
      event.untilSec = Math.min(
        event.untilSec + profile.dropoutExtensionMin * 60,
        closeFor(event.atSec) - 1,
      );
    }
  });

  if (seed !== 0) {
    scenario.events.forEach((event, index) => {
      if (event.kind !== "REPORT_ISSUE" && event.kind !== "CHANNEL_DEGRADE")
        return;
      const shiftMin =
        Math.floor(jitter.next() * (2 * profile.jitterMin + 1)) -
        profile.jitterMin;
      event.atSec = Math.max(
        60,
        Math.min(
          closeFor(base.events[index]!.atSec) - 120,
          event.atSec + shiftMin * 60,
        ),
      );
      if (event.kind === "REPORT_ISSUE") {
        reports.get(event.reportId)!.issuedAtSec = event.atSec;
      }
    });
    scenario.reports.forEach((report) => {
      report.rho = Math.max(
        0.55,
        Math.min(0.95, report.rho + reliability.next() * 0.1 - 0.05),
      );
    });
    const primary = scenario.hypotheses.find(
      (hypothesis) => hypothesis.primary,
    )!;
    const start = Math.min(
      ...scenario.events
        .filter((event) => event.kind === "CHANNEL_DEGRADE")
        .map((event) => event.atSec),
    );
    const end = closeFor(start) - 180;
    if (profile.decoys > 0 && (!Number.isFinite(start) || end < start)) {
      throw new ScenarioValidationError([
        {
          path: ["events"],
          code: "custom",
          message:
            "Decoys require a degradation start no later than deadline minus 180 seconds",
        },
      ]);
    }
    for (let n = 1; n <= profile.decoys; n += 1) {
      const channel = decoys.next() < 0.5 ? "CYBER" : "EW";
      const rho = 0.55 + decoys.next() * 0.07;
      const issuedAtSec = start + Math.floor(decoys.next() * (end - start + 1));
      const evidenceGroup = `GDECOY${n}`;
      const id = `DECOY${n}`;
      if (
        reports.has(id) ||
        scenario.reports.some(
          (report) => report.evidenceGroup === evidenceGroup,
        )
      ) {
        throw new ScenarioValidationError([
          {
            path: ["reports"],
            code: "custom",
            message: `Reserved decoy ID or evidence group already exists: ${id}/${evidenceGroup}`,
          },
        ]);
      }
      scenario.reports.push({
        id,
        channel,
        rho,
        issuedAtSec,
        evidenceGroup,
        hypothesisId: primary.id,
        stance: primary.initialTruth ? -1 : 1,
        claim: `Unconfirmed synthetic relay: ${primary.initialTruth ? primary.falseLabel : primary.trueLabel}`,
        detail:
          "Synthetic low-reliability decoy for information-conditioned decision training; not an independent verification.",
      });
      scenario.events.push({
        kind: "REPORT_ISSUE",
        atSec: issuedAtSec,
        reportId: id,
      });
    }
  }
  restores.forEach((restoreIndex, degradeIndex) => {
    const degradation = scenario.events[degradeIndex]!;
    if (degradation.kind === "CHANNEL_DEGRADE") {
      scenario.events[restoreIndex]!.atSec = degradation.untilSec;
    }
  });
  return scenario;
}

function validateVariant(candidate: ScenarioDef): ScenarioDef {
  const scenario = validateRuntimeScenario(candidate);
  const readiness = assessScenarioReadiness(scenario);
  if (readiness.issues.length)
    throw new ScenarioValidationError(readiness.issues);
  return scenario;
}

export function mutateScenario(
  base: ScenarioDef,
  seed: number,
  level: DifficultyLevel,
): ScenarioDef {
  mutationInput.parse({ seed, level });
  validateRuntimeScenario(base);
  if (seed === 0 && level === 3) {
    validateVariant(base);
    return base;
  }
  if (seed === 0) {
    return validateVariant(variant(base, 0, level));
  }
  for (let attempt = 0; attempt <= 20; attempt += 1) {
    const candidateSeed =
      attempt === 0 ? seed : hashString(String(BigInt(seed) + BigInt(attempt)));
    try {
      return validateVariant(variant(base, candidateSeed, level));
    } catch (error) {
      if (!(error instanceof ScenarioValidationError)) throw error;
    }
  }
  const fallback = validateVariant(variant(base, 0, level));
  fallback.meta.briefing.push(
    `Warning: Seed ${seed} failed mutation validity after 20 retries. Using the validated deterministic-only level ${level} profile; seeded jitter, reliability perturbations, and decoys were not applied.`,
  );
  return fallback;
}
