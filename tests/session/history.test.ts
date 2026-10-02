// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSessionHistory,
  MAX_SESSION_HISTORY,
  readSessionHistory,
  recordSessionHistory,
} from "../../src/session/history";
import type { SessionHistoryEntry } from "../../src/session/history";

const entry = (id: string, completedAt: string): SessionHistoryEntry => ({
  id,
  completedAt,
  scenarioId: "synthetic-test",
  scenarioTitle: "Synthetic test",
  difficultyLevel: 3,
  source: "LOCAL",
  decisionCount: 1,
  trainingScore: 80,
  decisionQuality: 0.8,
  outcome: 0.7,
  informationUse: 0.6,
  brierUser: null,
});

beforeEach(() => localStorage.clear());

describe("local session history", () => {
  it("stores only validated summaries, orders newest first, and replaces duplicate runs", () => {
    recordSessionHistory(entry("run-a", "2026-01-01T00:00:00.000Z"));
    recordSessionHistory(entry("run-b", "2026-01-02T00:00:00.000Z"));
    recordSessionHistory({
      ...entry("run-a", "2026-01-03T00:00:00.000Z"),
      trainingScore: 91,
    });

    expect(
      readSessionHistory().map(({ id, trainingScore }) => [id, trainingScore]),
    ).toEqual([
      ["run-a", 91],
      ["run-b", 80],
    ]);
  });

  it("caps history at the newest 100 entries and can clear it", () => {
    for (let index = 0; index < MAX_SESSION_HISTORY + 5; index += 1) {
      const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
      recordSessionHistory(entry(`run-${index}`, timestamp));
    }

    expect(readSessionHistory()).toHaveLength(MAX_SESSION_HISTORY);
    expect(readSessionHistory()[0]?.id).toBe("run-104");
    clearSessionHistory();
    expect(readSessionHistory()).toEqual([]);
  });

  it("surfaces malformed stored data instead of silently discarding it", () => {
    localStorage.setItem("dhundh.v1.session-history", "{bad json");
    expect(() => readSessionHistory()).toThrow(/malformed/i);
    expect(() =>
      recordSessionHistory(entry("run", "2026-01-01T00:00:00.000Z")),
    ).toThrow(/malformed/i);
  });
});
