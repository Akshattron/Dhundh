import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectReferenceModel } from "../../src/engine/view";
import { ContradictionMeter } from "../../src/features/trainee/ContradictionMeter";
import {
  EvidenceWaterfall,
  type WaterfallHypothesis,
} from "../../src/features/trainee/EvidenceWaterfall";
import { ReferenceModelDrawer } from "../../src/features/trainee/ReferenceModelDrawer";
import { flagship } from "../engine/fixtures";

afterEach(cleanup);

describe("P1 signature visualizations", () => {
  it("opens and dismisses the reference model with an accessible dialog", () => {
    render(<ReferenceModelDrawer model={projectReferenceModel(flagship)} />);
    const trigger = screen.getByRole("button", { name: /reference model/i });
    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Reference model" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /transparent normative baseline for this synthetic scenario/i,
      ),
    ).toBeTruthy();
    const dialog = screen.getByRole("dialog", { name: "Reference model" });
    const close = screen.getByRole("button", { name: "Close reference model" });
    const summaries = dialog.querySelectorAll("summary");
    const lastSummary = summaries.item(summaries.length - 1);
    lastSummary.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastSummary);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("renders signed evidence groups with a text summary and keyboard open action", () => {
    const onOpen = vi.fn();
    const hypotheses: WaterfallHypothesis[] = [
      {
        id: "north",
        label: "North route",
        priorLogOdds: 0,
        currentLogOdds: 0.4,
        contributions: [
          {
            reportId: "R01",
            group: "G1",
            channel: "LAND",
            claim: "A fictional route report",
            gradeLabel: "B",
            ageSec: 60,
            effectiveAccuracy: null,
            llr: null,
            inspected: false,
          },
          {
            reportId: "R02",
            group: "G2",
            channel: "AIR",
            claim: "A second fictional report",
            gradeLabel: "A",
            ageSec: 30,
            effectiveAccuracy: 0.9,
            llr: 0.4,
            inspected: true,
          },
        ],
      },
    ];
    render(<EvidenceWaterfall hypotheses={hypotheses} onOpen={onOpen} />);
    const unopened = screen.getByRole("button", {
      name: /R01, A fictional route report/,
    });
    fireEvent.keyDown(unopened, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith("R01");
    expect(
      screen.getByText(/prior log-odds 0.000, posterior log-odds 0.400/i),
    ).toBeTruthy();
    expect(screen.getByText("G1")).toBeTruthy();
  });

  it("explains split evidence using rails, values, and a threshold state", () => {
    render(
      <ContradictionMeter
        hypothesis="North route"
        positiveNats={0.8}
        negativeNats={0.7}
        index={0.93}
        threshold={0.65}
        minimumNats={0.2}
        contradicted
      />,
    );
    expect(screen.getByText(/The evidence is split/)).toBeTruthy();
    expect(screen.getByText(/Supports true: 0.80 nats/)).toBeTruthy();
    expect(screen.getByText("Evidence conflicts")).toBeTruthy();
  });
});
