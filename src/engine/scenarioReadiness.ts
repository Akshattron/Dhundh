import { computeBelief } from "./belief";
import { advanceTo, applyIntent, createSession } from "./simulation";
import type { ScenarioDef } from "./types";
import { netVoi } from "./voi";

export interface ScenarioReadiness {
  decisions: Array<{
    id: string;
    contradictionAtSec: number | null;
    verificationAtSec: number | null;
    verificationAssetId: string | null;
  }>;
  issues: Array<{ path: (string | number)[]; code: string; message: string }>;
}

// Uses the same minute-grid gate as seeded variants, after runtime validation.
export function assessScenarioReadiness(
  scenario: ScenarioDef,
): ScenarioReadiness {
  const primary = scenario.hypotheses.find((hypothesis) => hypothesis.primary)!;
  const initial = createSession(scenario, {
    seed: 0,
    difficultyLevel: scenario.meta.difficulty,
    mode: "LOCAL",
    aidMode: "ALWAYS",
  });
  const started = applyIntent(initial, scenario, {
    type: "START",
    t: 0,
    role: "SOLO",
  });
  if (!started.result.ok) throw new Error(started.result.message);
  let state = started.state;
  const decisions: ScenarioReadiness["decisions"] = scenario.decisionPoints.map(
    (dp) => ({
      id: dp.id,
      contradictionAtSec: null,
      verificationAtSec: null,
      verificationAssetId: null,
    }),
  );
  const horizon = Math.max(...scenario.decisionPoints.map((dp) => dp.closeSec));
  for (let t = 0; t <= horizon; t += 60) {
    const advanced = advanceTo(state, scenario, t);
    if (advanced.error) throw new Error(advanced.error.message);
    state = advanced.state;
    const belief = computeBelief(scenario, state, t);
    scenario.decisionPoints.forEach((dp, index) => {
      const result = decisions[index]!;
      if (
        result.contradictionAtSec === null &&
        t <= dp.closeSec &&
        belief.perHypothesis[primary.id]!.contradicted
      ) {
        result.contradictionAtSec = t;
      }
      if (
        result.verificationAtSec !== null ||
        t < dp.openSec ||
        t >= dp.closeSec
      )
        return;
      const asset = dp.assets
        .map((id) => scenario.assets.find((item) => item.id === id)!)
        .find((item) => {
          const value = netVoi(dp, belief, t, item, scenario.hypotheses);
          return value.feasible && value.net >= 0;
        });
      if (asset) {
        result.verificationAtSec = t;
        result.verificationAssetId = asset.id;
      }
    });
    if (
      decisions.every(
        (result) =>
          result.contradictionAtSec !== null &&
          result.verificationAtSec !== null,
      )
    )
      break;
  }
  const issues = decisions.flatMap((result, index) => [
    ...(result.contradictionAtSec === null
      ? [
          {
            path: ["decisionPoints", index],
            code: "custom",
            message: `${result.id}: no reachable primary-hypothesis contradiction on the minute grid before close`,
          },
        ]
      : []),
    ...(result.verificationAtSec === null
      ? [
          {
            path: ["decisionPoints", index, "assets"],
            code: "custom",
            message: `${result.id}: no feasible nonnegative-net verification on the minute grid before close`,
          },
        ]
      : []),
  ]);
  return { decisions, issues };
}
