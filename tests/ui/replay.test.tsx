import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { buildAar } from "../../src/engine/aar";
import AarPage from "../../src/features/aar/AarPage";
import { ReplayScrubber } from "../../src/features/aar/ReplayScrubber";
import { createLocalSession } from "../../src/session/LocalSessionClient";
import { useSessionStore } from "../../src/state/useSessionStore";
import { flagship, freeze, logFor } from "../engine/fixtures";
import { pathIntents } from "../golden/flagship.expected";

const aar = freeze(buildAar(flagship, logFor(pathIntents.A)));

afterEach(() => {
  cleanup();
  useSessionStore.getState().clear();
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("replay presentation controls", () => {
  it.each([0.5, 1, 2, 4])(
    "plays at %sx by changing only the wall-clock interval",
    (speed) => {
      vi.useFakeTimers();
      const before = JSON.stringify(aar);
      render(<ReplayScrubber aar={aar} />);
      fireEvent.change(screen.getByRole("combobox", { name: "Replay speed" }), {
        target: { value: String(speed) },
      });
      fireEvent.click(
        screen.getByRole("button", { name: `Play replay at ${speed}x` }),
      );
      const range = screen.getByRole<HTMLInputElement>("slider");
      act(() => vi.advanceTimersByTime(1000 / speed - 1));
      expect(range.value).toBe("0");
      act(() => vi.advanceTimersByTime(1));
      expect(range.value).toBe("1");
      expect(JSON.stringify(aar)).toBe(before);
    },
  );

  it("changes speed during playback without restarting or leaking an interval", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ReplayScrubber aar={aar} />);
    fireEvent.click(screen.getByRole("button", { name: "Play replay at 4x" }));
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByRole<HTMLInputElement>("slider").value).toBe("1");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });
    act(() => vi.advanceTimersByTime(999));
    expect(screen.getByRole<HTMLInputElement>("slider").value).toBe("1");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole<HTMLInputElement>("slider").value).toBe("2");
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("jumps to actual annotation cuts, pauses playback, and focuses the scrubber", () => {
    vi.useFakeTimers();
    render(<ReplayScrubber aar={aar} />);
    fireEvent.click(screen.getByText(/^Recorded event annotations/));
    const originalOrder = screen
      .getAllByTestId("replay-annotation")
      .map((element) => element.getAttribute("data-source-id"));
    fireEvent.click(screen.getByRole("button", { name: "Play replay at 4x" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /Jump to decision at 29:00: Decision cut/,
      }),
    );
    const index = aar.frames.findIndex((frame) => frame.cut === "DECISION");
    const range = screen.getByRole<HTMLInputElement>("slider");
    expect(range.value).toBe(String(index));
    expect(document.activeElement).toBe(range);
    expect(screen.getByTestId("replay-position").textContent).toContain(
      "before commitment",
    );
    expect(screen.queryByRole("button", { name: "Pause replay" })).toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(range.value).toBe(String(index));
    expect(
      screen
        .getAllByTestId("replay-annotation")
        .map((element) => element.getAttribute("data-source-id")),
    ).toEqual(originalOrder);
  });

  it("supports keyboard stepping and accessible information tabs without exposing truth in Knew", () => {
    const gated = buildAar(
      flagship,
      logFor(pathIntents.A, flagship, { aidMode: "AFTER_ESTIMATE" }),
    );
    render(<ReplayScrubber aar={gated} />);
    expect(
      within(screen.getByRole("tabpanel")).getByText(
        "Reference aid not available at this frame.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("tabpanel").textContent).not.toContain("Dropped");
    const knew = screen.getByRole("tab", { name: "Knew" });
    knew.focus();
    fireEvent.keyDown(knew, { key: "ArrowRight" });
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Truth" }),
    );
    expect(screen.getByRole("tabpanel").textContent).toContain(
      "Post-mortem truth",
    );
    const next = screen.getByRole("button", { name: "Next replay frame" });
    fireEvent.keyDown(next, { key: "End" });
    expect(screen.getByRole<HTMLInputElement>("slider").value).toBe(
      String(gated.frames.length - 1),
    );
    fireEvent.keyDown(next, { key: "Home" });
    expect(screen.getByRole<HTMLInputElement>("slider").value).toBe("0");
  });

  it("stops at the terminal frame and provides a deliberate empty state", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ReplayScrubber aar={aar} />);
    fireEvent.click(screen.getByRole("button", { name: "Play replay at 4x" }));
    act(() => vi.advanceTimersByTime(aar.frames.length * 250));
    expect(screen.getByTestId("replay-position").textContent).toContain(
      "COMPLETE",
    );
    expect(vi.getTimerCount()).toBe(0);
    rerender(<ReplayScrubber aar={{ ...aar, frames: [] }} />);
    expect(screen.getByRole("status").textContent).toContain(
      "No recorded replay frames",
    );
  });

  it("does not rebuild AAR or mutate history for playback, and withdraws it after reset", () => {
    vi.useFakeTimers();
    const client = createLocalSession(flagship, {
      seed: 0,
      difficultyLevel: 3,
      aidMode: "ALWAYS",
      speedSecPerMin: 4,
    });
    useSessionStore.getState().setClient(client, client.getSnapshot());
    client.dispatch({ type: "START" });
    client.advanceToSeconds(1980);
    const build = vi.spyOn(client, "getAar");
    render(
      <MemoryRouter initialEntries={[`/aar/${flagship.meta.id}`]}>
        <Routes>
          <Route path="/aar/:id" element={<AarPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const history = localStorage.getItem("dhundh.v1.session-history");
    const calls = build.mock.calls.length;
    const log = JSON.stringify(client.getLog());
    fireEvent.click(screen.getByRole("button", { name: "Play replay at 4x" }));
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.change(screen.getByRole("combobox", { name: "Replay speed" }), {
      target: { value: "0.5" },
    });
    expect(build).toHaveBeenCalledTimes(calls);
    expect(localStorage.getItem("dhundh.v1.session-history")).toBe(history);
    expect(JSON.stringify(client.getLog())).toBe(log);
    expect(
      screen.getAllByText("COUNTERFACTUAL — simulated, not what happened")
        .length,
    ).toBeGreaterThan(0);
    act(() => client.dispatch({ type: "RESET" }));
    expect(
      screen.getByRole("heading", { name: "After-action review is not ready" }),
    ).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
  });
});
