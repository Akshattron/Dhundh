import { z } from "zod";
import {
  loadScenario,
  scenarioHash,
  ScenarioValidationError,
} from "./scenarioLoader";
import {
  assessScenarioReadiness,
  type ScenarioReadiness,
} from "./scenarioReadiness";
import { scenarioAuthoringSchema } from "./scenarioSchema";
import type { ScenarioDef } from "./types";

export const AUTHORING_MAX_CHARACTERS = 200_000;
export const AUTHORING_CHECKS = [
  "JSON syntax",
  "Editor resource limits",
  "Authoring schema",
  "Runtime invariants",
  "Utility coverage",
  "Consequence coverage",
  "Reachable contradiction",
  "Feasible verification",
] as const;
type CheckName = (typeof AUTHORING_CHECKS)[number];
export interface DraftValidation {
  checks: Array<{ name: CheckName; status: "PASS" | "FAIL" | "BLOCKED" }>;
  issues: Array<{ path: string; message: string }>;
  scenario: ScenarioDef | null;
  readiness: ScenarioReadiness | null;
  hash: string | null;
  previewReady: boolean;
}

const actionBudget = z
  .object({
    utility: z.array(z.unknown()).max(64).optional(),
    consequences: z
      .array(
        z
          .object({
            arrivalMin: z.number().max(180).optional(),
          })
          .passthrough(),
      )
      .max(64)
      .optional(),
  })
  .passthrough();
const editorBudget = z
  .object({
    hypotheses: z.array(z.unknown()).max(6).optional(),
    channels: z.array(z.unknown()).max(4).optional(),
    reports: z
      .array(
        z.object({ issuedAtMin: z.number().max(180).optional() }).passthrough(),
      )
      .max(64)
      .optional(),
    events: z
      .array(
        z
          .object({
            atMin: z.number().max(180).optional(),
            untilMin: z.number().max(180).optional(),
            extraDelayMin: z.number().max(180).optional(),
          })
          .passthrough(),
      )
      .max(128)
      .optional(),
    assets: z
      .array(
        z.object({ delayMin: z.number().max(180).optional() }).passthrough(),
      )
      .max(12)
      .optional(),
    injectPresets: z.array(z.unknown()).max(16).optional(),
    meta: z
      .object({ durationMin: z.number().max(180).optional() })
      .passthrough()
      .optional(),
    decisionPoints: z
      .array(
        z
          .object({
            closeMin: z.number().max(120).optional(),
            actions: z.array(actionBudget).max(8).optional(),
          })
          .passthrough(),
      )
      .max(4)
      .optional(),
  })
  .passthrough();

export function validateScenarioDraft(text: string): DraftValidation {
  const result: DraftValidation = {
    checks: AUTHORING_CHECKS.map((name) => ({ name, status: "BLOCKED" })),
    issues: [],
    scenario: null,
    readiness: null,
    hash: null,
    previewReady: false,
  };
  const mark = (name: CheckName, status: "PASS" | "FAIL") => {
    result.checks.find((check) => check.name === name)!.status = status;
  };
  if (text.length > AUTHORING_MAX_CHARACTERS) {
    mark("Editor resource limits", "FAIL");
    result.issues.push({
      path: "$",
      message: `Draft exceeds the ${AUTHORING_MAX_CHARACTERS.toLocaleString("en-US")} character editor limit. No simulation was run.`,
    });
    return result;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    mark("JSON syntax", "FAIL");
    result.issues.push({ path: "$", message: error.message });
    return result;
  }
  mark("JSON syntax", "PASS");
  const budget = editorBudget.safeParse(raw);
  const budgetIssues = budget.success
    ? []
    : budget.error.issues.filter((issue) => issue.code === "too_big");
  if (budgetIssues.length) {
    mark("Editor resource limits", "FAIL");
    result.issues = budgetIssues.map((issue) => ({
      path: issue.path.join("."),
      message: `Editor limit: ${issue.message}`,
    }));
    return result;
  }
  mark("Editor resource limits", "PASS");
  const parsed = scenarioAuthoringSchema.safeParse(raw);
  if (!parsed.success) {
    mark("Authoring schema", "FAIL");
    result.issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "$",
      message: issue.message,
    }));
    return result;
  }
  mark("Authoring schema", "PASS");
  let scenario: ScenarioDef;
  try {
    scenario = loadScenario(parsed.data);
  } catch (error) {
    if (!(error instanceof ScenarioValidationError)) throw error;
    mark("Runtime invariants", "FAIL");
    result.issues = error.issues.map((issue) => ({
      path: issue.path.join(".") || "$",
      message: issue.message,
    }));
    if (error.issues.some((issue) => issue.path.includes("utility")))
      mark("Utility coverage", "FAIL");
    if (error.issues.some((issue) => issue.path.includes("consequences")))
      mark("Consequence coverage", "FAIL");
    return result;
  }
  mark("Runtime invariants", "PASS");
  mark("Utility coverage", "PASS");
  mark("Consequence coverage", "PASS");
  const readiness = assessScenarioReadiness(scenario);
  mark(
    "Reachable contradiction",
    readiness.decisions.every(
      (decision) => decision.contradictionAtSec !== null,
    )
      ? "PASS"
      : "FAIL",
  );
  mark(
    "Feasible verification",
    readiness.decisions.every((decision) => decision.verificationAtSec !== null)
      ? "PASS"
      : "FAIL",
  );
  result.scenario = scenario;
  result.hash = scenarioHash(scenario);
  result.readiness = readiness;
  result.issues = readiness.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  result.previewReady = readiness.issues.length === 0;
  return result;
}
