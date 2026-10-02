import { z } from "zod";
import type { Aar } from "../engine/aar";
import type { SessionLog } from "../engine/types";

export const MAX_SESSION_HISTORY = 100;
const HISTORY_KEY = "dhundh.v1.session-history";

const historyEntrySchema = z.strictObject({
  id: z.string().min(1).max(200),
  completedAt: z.string().datetime(),
  scenarioId: z.string().min(1).max(120),
  scenarioTitle: z.string().min(1).max(160),
  difficultyLevel: z.number().int().min(1).max(5),
  source: z.enum(["LOCAL", "NETWORKED"]),
  decisionCount: z.number().int().positive(),
  trainingScore: z.number().finite().min(0).max(100),
  decisionQuality: z.number().finite().min(0).max(1),
  outcome: z.number().finite().min(0).max(1),
  informationUse: z.number().finite().min(0).max(1),
  brierUser: z.number().finite().min(0).max(1).nullable(),
});

const historySchema = z.array(historyEntrySchema).max(MAX_SESSION_HISTORY);

export type SessionHistoryEntry = z.infer<typeof historyEntrySchema>;

export class SessionHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionHistoryError";
  }
}

export function readSessionHistory(): SessionHistoryEntry[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(HISTORY_KEY);
  } catch {
    throw new SessionHistoryError(
      "Browser storage is unavailable; session history could not be read.",
    );
  }
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SessionHistoryError(
      "Saved session history is malformed. Clear it to start a fresh history.",
    );
  }
  const parsed = historySchema.safeParse(value);
  if (!parsed.success) {
    throw new SessionHistoryError(
      "Saved session history is invalid. Clear it to start a fresh history.",
    );
  }
  return parsed.data;
}

export function recordSessionHistory(
  entry: SessionHistoryEntry,
): SessionHistoryEntry[] {
  const candidate = historyEntrySchema.safeParse(entry);
  if (!candidate.success) {
    throw new SessionHistoryError("The completed session summary is invalid.");
  }
  const next = [
    candidate.data,
    ...readSessionHistory().filter((item) => item.id !== candidate.data.id),
  ]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, MAX_SESSION_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    throw new SessionHistoryError(
      "Browser storage is unavailable; the completed session was not saved.",
    );
  }
  return next;
}

export function clearSessionHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    throw new SessionHistoryError(
      "Browser storage is unavailable; session history could not be cleared.",
    );
  }
}

export function createHistoryEntry(
  aar: Aar,
  id: string,
  source: SessionHistoryEntry["source"],
  completedAt = new Date().toISOString(),
): SessionHistoryEntry {
  return historyEntrySchema.parse({
    id,
    completedAt,
    scenarioId: aar.scenario.id,
    scenarioTitle: aar.scenario.title,
    difficultyLevel: aar.scenario.difficultyLevel,
    source,
    decisionCount: aar.decisions.length,
    trainingScore: aar.scores.trainingScore,
    decisionQuality: aar.scores.dq,
    outcome: aar.scores.outcome,
    informationUse: aar.scores.infoUtil,
    brierUser: aar.scores.brierUser,
  });
}

export function fingerprintSessionLog(log: SessionLog): string {
  const serialized = JSON.stringify(log);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
