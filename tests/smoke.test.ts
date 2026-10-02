import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, test } from "vitest";
import App from "@/App";

afterEach(cleanup);

test("the root route renders the Gate 0 foundation", () => {
  render(createElement(App));

  expect(
    screen.getByRole("heading", { level: 1, name: "DHUNDH" }).textContent,
  ).toBe("DHUNDH");
  expect(
    screen.getByText("Decision Training Under Degraded Information")
      .textContent,
  ).toBe("Decision Training Under Degraded Information");
  expect(screen.getByText("Synthetic training environment").textContent).toBe(
    "Synthetic training environment",
  );
  expect(
    screen.getByRole("heading", {
      level: 2,
      name: "Gate 0 \u2014 Engineering Foundation",
    }).textContent,
  ).toBe("Gate 0 \u2014 Engineering Foundation");
});
