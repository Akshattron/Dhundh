import { z } from "zod";
import type { Quadrant, ScenarioMeta } from "./types";

export type DifficultyLevel = ScenarioMeta["difficulty"];

export interface DifficultyProfile {
  level: DifficultyLevel;
  delayScale: number;
  dropoutExtensionMin: number;
  closeDeltaMin: number;
  jitterMin: number;
  decoys: number;
}

export const PROFILES: Record<DifficultyLevel, DifficultyProfile> = {
  1: {
    level: 1,
    delayScale: 0.5,
    dropoutExtensionMin: 0,
    closeDeltaMin: 4,
    jitterMin: 0,
    decoys: 0,
  },
  2: {
    level: 2,
    delayScale: 0.75,
    dropoutExtensionMin: 0,
    closeDeltaMin: 2,
    jitterMin: 1,
    decoys: 0,
  },
  3: {
    level: 3,
    delayScale: 1,
    dropoutExtensionMin: 0,
    closeDeltaMin: 0,
    jitterMin: 1,
    decoys: 1,
  },
  4: {
    level: 4,
    delayScale: 1.25,
    dropoutExtensionMin: 1,
    closeDeltaMin: -2,
    jitterMin: 2,
    decoys: 1,
  },
  5: {
    level: 5,
    delayScale: 1.5,
    dropoutExtensionMin: 2,
    closeDeltaMin: -3,
    jitterMin: 2,
    decoys: 2,
  },
};

const adaptiveInput = z.strictObject({
  current: z.number().int().min(1).max(5),
  scores: z.strictObject({
    dq: z.number().finite().min(0).max(1),
    infoUtil: z.number().finite().min(0).max(1),
    quadrant: z.enum(["SOUND_SUCCESS", "SOUND_UNLUCKY", "LUCKY", "POOR"]),
  }),
});

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function nextDifficulty(
  current: DifficultyLevel,
  scores: { dq: number; infoUtil: number; quadrant: Quadrant },
): { level: DifficultyLevel; reason: string; changes: string[] } {
  adaptiveInput.parse({ current, scores });
  const levels: readonly DifficultyLevel[] = [1, 2, 3, 4, 5];
  const strong =
    scores.dq >= 0.8 && scores.infoUtil >= 0.7 && scores.quadrant !== "LUCKY";
  const weak = scores.dq < 0.5;
  const level =
    levels[
      Math.max(0, Math.min(4, current - 1 + (strong ? 1 : weak ? -1 : 0)))
    ]!;
  const before = PROFILES[current];
  const after = PROFILES[level];
  const changes: string[] = [];
  if (before.delayScale !== after.delayScale) {
    changes.push(`Delays x${after.delayScale}`);
  }
  if (before.dropoutExtensionMin !== after.dropoutExtensionMin) {
    changes.push(
      `Dropout duration ${signed(after.dropoutExtensionMin - before.dropoutExtensionMin)} min`,
    );
  }
  if (before.closeDeltaMin !== after.closeDeltaMin) {
    changes.push(
      `Deadline ${signed(after.closeDeltaMin - before.closeDeltaMin)} min`,
    );
  }
  if (before.jitterMin !== after.jitterMin) {
    changes.push(`Report/degradation jitter +/-${after.jitterMin} min`);
  }
  if (before.decoys !== after.decoys) {
    const delta = after.decoys - before.decoys;
    changes.push(
      `${signed(delta)} decoy report${Math.abs(delta) === 1 ? "" : "s"}`,
    );
  }
  return {
    level,
    reason: strong
      ? "Strong decision quality with good use of evidence."
      : weak
        ? "Decision quality was below 50%."
        : "Held at the current level.",
    changes,
  };
}
