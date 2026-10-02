// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nextDifficulty, PROFILES } from "../../src/engine";
import type { DifficultyLevel, Quadrant } from "../../src/engine";

describe("adaptive difficulty", () => {
  it("uses the exact Section 26.1 profiles", () => {
    expect(Object.values(PROFILES).map((p) => Object.values(p))).toEqual([
      [1, 0.5, 0, 4, 0, 0],
      [2, 0.75, 0, 2, 1, 0],
      [3, 1, 0, 0, 1, 1],
      [4, 1.25, 1, -2, 2, 1],
      [5, 1.5, 2, -3, 2, 2],
    ]);
  });

  it.each<[DifficultyLevel, number, number, Quadrant, DifficultyLevel, string]>(
    [
      [
        3,
        0.8,
        0.7,
        "SOUND_SUCCESS",
        4,
        "Strong decision quality with good use of evidence.",
      ],
      [
        3,
        0.8,
        0.7,
        "SOUND_UNLUCKY",
        4,
        "Strong decision quality with good use of evidence.",
      ],
      [3, 1, 1, "LUCKY", 3, "Held at the current level."],
      [3, 0.7999, 1, "POOR", 3, "Held at the current level."],
      [3, 1, 0.6999, "SOUND_SUCCESS", 3, "Held at the current level."],
      [3, 0.5, 0, "POOR", 3, "Held at the current level."],
      [3, 0.4999, 1, "LUCKY", 2, "Decision quality was below 50%."],
      [1, 0, 0, "POOR", 1, "Decision quality was below 50%."],
      [
        5,
        1,
        1,
        "SOUND_SUCCESS",
        5,
        "Strong decision quality with good use of evidence.",
      ],
    ],
  )(
    "applies thresholds and bounds at level %s / DQ %s / IU %s / %s",
    (current, dq, infoUtil, quadrant, level, reason) => {
      expect(nextDifficulty(current, { dq, infoUtil, quadrant })).toMatchObject(
        { level, reason },
      );
    },
  );

  it("explains only changed profile parameters, and no deltas at a bound or hold", () => {
    expect(
      nextDifficulty(3, { dq: 1, infoUtil: 1, quadrant: "SOUND_SUCCESS" })
        .changes,
    ).toEqual([
      "Delays x1.25",
      "Dropout duration +1 min",
      "Deadline -2 min",
      "Report/degradation jitter +/-2 min",
    ]);
    expect(
      nextDifficulty(2, { dq: 1, infoUtil: 1, quadrant: "SOUND_SUCCESS" })
        .changes,
    ).toContain("+1 decoy report");
    expect(
      nextDifficulty(3, { dq: 0, infoUtil: 0, quadrant: "POOR" }).changes,
    ).toContain("-1 decoy report");
    expect(
      nextDifficulty(5, { dq: 1, infoUtil: 1, quadrant: "SOUND_SUCCESS" })
        .changes,
    ).toEqual([]);
    expect(
      nextDifficulty(2, { dq: 0.6, infoUtil: 1, quadrant: "POOR" }).changes,
    ).toEqual([]);
  });

  it("rejects malformed external scores and levels", () => {
    for (const dq of [NaN, Infinity, -0.1, 1.1]) {
      expect(() =>
        nextDifficulty(3, { dq, infoUtil: 0.8, quadrant: "POOR" }),
      ).toThrow();
    }
    expect(() =>
      nextDifficulty(3, { dq: 0.8, infoUtil: NaN, quadrant: "POOR" }),
    ).toThrow();
    expect(() =>
      // @ts-expect-error Exercise the runtime level boundary.
      nextDifficulty(6, { dq: 1, infoUtil: 1, quadrant: "POOR" }),
    ).toThrow();
  });
});
