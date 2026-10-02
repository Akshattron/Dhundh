// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildAar,
  exportAarDecisionsCsv,
  exportAarJson,
  exportAarTimelineCsv,
} from "../../src/engine";
import { flagship, logFor } from "./fixtures";
import { pathIntents } from "../golden/flagship.expected";

describe("completed AAR exports", () => {
  const aar = buildAar(flagship, logFor(pathIntents.A));

  it("exports the full authorized report as deterministic JSON", () => {
    const json = exportAarJson(aar);
    expect(JSON.parse(json)).toEqual(aar);
    expect(json).toContain(aar.dataProvenance);
  });

  it("writes a provenance-bearing timeline CSV with correctly escaped fields", () => {
    const fixture = {
      ...aar,
      timeline: [
        {
          ...aar.timeline[0]!,
          summary: 'Claim, with "quotes"\r\nand another line',
        },
      ],
    };
    const csv = exportAarTimelineCsv(fixture);
    expect(
      csv.startsWith(
        '"atSec","lane","kind","summary","reportId","revealedToTrainee","dataProvenance"',
      ),
    ).toBe(true);
    expect(csv).toContain('"Claim, with ""quotes""\r\nand another line"');
    expect(csv).toContain(aar.dataProvenance);
  });

  it("writes the decision cut, scores, rationale, citations, and provenance", () => {
    const csv = exportAarDecisionsCsv(aar);
    expect(csv.split("\r\n")[0]).toBe(
      '"role","decisionPointId","atSec","action","belief","regret","dq","outcome","trainingScore","rationaleText","citedReports","tags","dataProvenance"',
    );
    expect(csv).toContain('"Take the south route (Tamsa Ford)"');
    expect(csv).toContain('"R06|V01"');
    expect(csv).toContain("Rockfall report plus the sortie result");
    expect(csv).toContain(aar.dataProvenance);
  });
});
