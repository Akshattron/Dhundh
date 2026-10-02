import type { Aar } from "./aar";

const TIMELINE_COLUMNS = [
  "atSec",
  "lane",
  "kind",
  "summary",
  "reportId",
  "revealedToTrainee",
  "dataProvenance",
] as const;

const DECISION_COLUMNS = [
  "role",
  "decisionPointId",
  "atSec",
  "action",
  "belief",
  "regret",
  "dq",
  "outcome",
  "trainingScore",
  "rationaleText",
  "citedReports",
  "tags",
  "dataProvenance",
] as const;

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(
  values: readonly (string | number | boolean | null | undefined)[],
) {
  return values.map(csvCell).join(",");
}

export function exportAarJson(aar: Aar): string {
  return JSON.stringify(aar, null, 2);
}

export function exportAarTimelineCsv(aar: Aar): string {
  return [
    csvRow(TIMELINE_COLUMNS),
    ...aar.timeline.map((entry) =>
      csvRow([
        entry.atSec,
        entry.lane,
        entry.kind,
        entry.summary,
        entry.reportId,
        entry.revealedToTrainee,
        aar.dataProvenance,
      ]),
    ),
  ].join("\r\n");
}

export function exportAarDecisionsCsv(aar: Aar): string {
  return [
    csvRow(DECISION_COLUMNS),
    ...aar.decisions.map(({ decision, scores }) =>
      csvRow([
        decision.role,
        decision.decisionPointId,
        decision.atSec,
        decision.actionLabel,
        JSON.stringify(decision.belief),
        decision.regret,
        scores.dq,
        scores.outcome,
        scores.trainingScore,
        decision.rationale?.text ?? "",
        decision.rationale?.citedReportIds.join("|") ?? "",
        decision.rationale?.tags.join("|") ?? "",
        aar.dataProvenance,
      ]),
    ),
  ].join("\r\n");
}
