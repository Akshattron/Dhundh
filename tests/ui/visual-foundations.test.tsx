import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../../src/components/ui/Button";
import { Tabs } from "../../src/components/ui/Tabs";
import AppShell from "../../src/components/AppShell";
import { ChannelHealthStrip } from "../../src/features/trainee/ChannelHealthStrip";
import { TeamRoster } from "../../src/features/network/TeamRoster";
import { useDialogFocus } from "../../src/components/ui/useDialogFocus";
import { MemoryRouter, Route, Routes } from "react-router-dom";

afterEach(cleanup);

describe("shared visual controls", () => {
  it("restores focus to a visible fallback after the invoking controls are hidden", () => {
    function Example() {
      const [open, setOpen] = useState(false);
      const [compact, setCompact] = useState(false);
      const fallback = useRef<HTMLButtonElement>(null);
      const dialog = useDialogFocus(open, () => setOpen(false), fallback);
      return (
        <>
          <button ref={fallback}>Tools</button>
          <div hidden={compact}>
            <button onClick={() => setOpen(true)}>Open details</button>
          </div>
          {open && (
            <section ref={dialog} role="dialog" aria-label="Details">
              <button onClick={() => setCompact(true)}>Compact layout</button>
            </section>
          )}
        </>
      );
    }
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Open details" });
    trigger.focus();
    fireEvent.click(trigger);
    const compact = screen.getByRole("button", { name: "Compact layout" });
    fireEvent.click(compact);
    fireEvent.keyDown(compact, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Tools" }),
    );
  });

  it("distinguishes a vacant role from a disconnected participant", () => {
    render(
      <TeamRoster
        currentRole="COMMANDER"
        roster={[
          { role: "INSTRUCTOR", name: "Facilitator", connected: true },
          { role: "COMMANDER", name: "Returning trainee", connected: false },
        ]}
      />,
    );
    expect(
      screen.getByRole("list", { name: "Session participants" }).children,
    ).toHaveLength(3);
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("Disconnected")).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(screen.getByText("Not joined yet")).toBeTruthy();
    expect(screen.getByText("COMMANDER · you")).toBeTruthy();
  });

  it("shows channel health with text while withholding restricted contact details", () => {
    render(
      <ChannelHealthStrip
        nowSec={120}
        channels={[
          {
            id: "LAND",
            label: "Land patrols",
            sourceLabel: "Visible source",
            health: "HEALTHY",
            lastDeliveredAtSec: 60,
            visible: true,
          },
          {
            id: "CYBER",
            label: "Telemetry",
            sourceLabel: "Restricted source",
            health: "DOWN",
            lastDeliveredAtSec: null,
            visible: false,
          },
        ]}
      />,
    );
    expect(screen.getByText("Healthy")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("Last receipt 1m old")).toBeTruthy();
    expect(screen.getByText("Health only")).toBeTruthy();
    expect(screen.queryByText("Restricted source")).toBeNull();
  });

  it("provides a focusable content bypass and an escapable compact navigation", () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<h1>Training</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Skip to content" }));
    expect(document.activeElement).toBe(screen.getByRole("main"));
    const menu = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    const home = screen.getByRole("link", { name: /^Home$/ });
    expect(home.getAttribute("aria-current")).toBe("page");
    home.focus();
    fireEvent.keyDown(home, { key: "Escape" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menu);
  });

  it("keeps the loading button name while preventing duplicate actions", () => {
    const action = vi.fn();
    const { rerender } = render(
      <Button loading onClick={action}>
        Create session
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Create session" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(action).not.toHaveBeenCalled();
    rerender(<Button onClick={action}>Create session</Button>);
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("preserves explicitly disabled buttons", () => {
    render(<Button disabled>Unavailable</Button>);
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("automatically activates tabs with arrows, Home and End", () => {
    function Example() {
      const [value, setValue] = useState("evidence");
      return (
        <Tabs
          id="console"
          label="Console sections"
          value={value}
          onChange={setValue}
          tabs={[
            {
              value: "evidence",
              label: "Evidence",
              controls: "evidence-panel",
            },
            {
              value: "situation",
              label: "Situation",
              controls: "situation-panel",
            },
            {
              value: "decision",
              label: "Decision",
              controls: "decision-panel",
            },
          ]}
        />
      );
    }
    render(<Example />);
    const evidence = screen.getByRole("tab", { name: "Evidence" });
    const situation = screen.getByRole("tab", { name: "Situation" });
    const decision = screen.getByRole("tab", { name: "Decision" });
    evidence.focus();
    fireEvent.keyDown(evidence, { key: "ArrowRight" });
    expect(document.activeElement).toBe(situation);
    expect(situation.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(situation, { key: "End" });
    expect(document.activeElement).toBe(decision);
    fireEvent.keyDown(decision, { key: "ArrowRight" });
    expect(document.activeElement).toBe(evidence);
    fireEvent.keyDown(evidence, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(decision);
    fireEvent.keyDown(decision, { key: "Home" });
    expect(document.activeElement).toBe(evidence);
    expect(evidence.getAttribute("aria-controls")).toBe("evidence-panel");
    expect(decision.getAttribute("tabindex")).toBe("-1");
    fireEvent.click(situation);
    expect(situation.getAttribute("aria-selected")).toBe("true");
  });
});
