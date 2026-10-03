import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScenarioAuthoringPage from "../../src/features/authoring/ScenarioAuthoringPage";
import flagshipJson from "../../src/scenarios/kestrel-relief-corridor.json";
import { createLocalSession } from "../../src/session/LocalSessionClient";
import { useSessionStore } from "../../src/state/useSessionStore";
import { flagship } from "../engine/fixtures";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  useSessionStore.getState().clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const show = () =>
  render(
    <MemoryRouter>
      <ScenarioAuthoringPage />
    </MemoryRouter>,
  );
const validate = () =>
  fireEvent.click(screen.getByRole("button", { name: "Validate now" }));
describe("scenario authoring editor", () => {
  it("debounces validation, recovers syntax errors, and stops stale previews without replacing the active client", () => {
    const active = createLocalSession(flagship, {
      seed: 0,
      difficultyLevel: 3,
      aidMode: "ALWAYS",
      speedSecPerMin: 4,
    });
    useSessionStore.getState().setClient(active, active.getSnapshot());
    show();
    expect(
      screen.getByText(
        /Do not enter real-world operational or classified content/,
      ),
    ).toBeTruthy();
    act(() => vi.advanceTimersByTime(300));
    expect(
      screen.getByTestId("authoring-validation-status").textContent,
    ).toContain("Ready");
    fireEvent.click(screen.getByRole("button", { name: "Preview scenario" }));
    expect(screen.getByTestId("authoring-preview")).toBeTruthy();
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByTestId("preview-clock").textContent).toBe("1:00");
    expect(useSessionStore.getState().client).toBe(active);
    expect(active.getSnapshot().phase).toBe("IDLE");
    fireEvent.change(screen.getByLabelText("Scenario JSON draft"), {
      target: { value: "{" },
    });
    expect(screen.queryByTestId("authoring-preview")).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Preview scenario",
      }).disabled,
    ).toBe(true);
    validate();
    expect(screen.getByText("Actionable issues")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset draft" }));
    validate();
    expect(
      screen.getByTestId("authoring-validation-status").textContent,
    ).toContain("Ready");
    expect(vi.getTimerCount()).toBe(2); // Active idle client and current validation debounce only.
  });

  it("keeps loader-valid but unready scenarios editable and exportable, not previewable", () => {
    show();
    const draft = structuredClone(flagshipJson);
    draft.decisionPoints[0]!.assets = [];
    fireEvent.change(screen.getByLabelText("Scenario JSON draft"), {
      target: { value: JSON.stringify(draft) },
    });
    validate();
    expect(
      screen.getByTestId("authoring-validation-status").textContent,
    ).toContain("training readiness is blocked");
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Preview scenario",
      }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Export JSON" })
        .disabled,
    ).toBe(false);
    fireEvent.change(screen.getByRole("combobox", { name: "Template" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reload template" }));
    validate();
    expect(
      screen.getByTestId("authoring-validation-status").textContent,
    ).toContain("Ready");
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("Scenario JSON draft").value,
    ).toContain("Harbour Flood Response");
  });

  it("reports clipboard failures and exports exact authoring JSON with object URL cleanup", async () => {
    show();
    validate();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("Permission denied")),
      },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Copy JSON" })),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Permission denied",
    );
    expect(document.activeElement).toBe(
      screen.getByLabelText("Scenario JSON draft"),
    );
    const create = vi.fn(() => "blob:synthetic-draft");
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: create,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revoke,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(click).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(1));
    expect(revoke).toHaveBeenCalledWith("blob:synthetic-draft");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("Scenario JSON draft").value,
    ).toContain('"durationMin"');
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("Scenario JSON draft").value,
    ).not.toContain('"durationSec"');
  });

  it("imports JSON and ignores an outstanding import superseded by typing", async () => {
    show();
    const file = new File(["{"], "broken.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.resolve("{") });
    await act(async () =>
      fireEvent.change(screen.getByLabelText("Import scenario JSON"), {
        target: { files: [file] },
      }),
    );
    validate();
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("Scenario JSON draft").value,
    ).toBe("{");
    let finish: ((text: string) => void) | undefined;
    const later = new File(["{}"], "late.json");
    Object.defineProperty(later, "text", {
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    fireEvent.change(screen.getByLabelText("Import scenario JSON"), {
      target: { files: [later] },
    });
    fireEvent.change(screen.getByLabelText("Scenario JSON draft"), {
      target: { value: '{"kept":true}' },
    });
    await act(async () => finish?.('{"overwritten":true}'));
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("Scenario JSON draft").value,
    ).toBe('{"kept":true}');
  });
});
