import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, test } from "vitest";
import App from "@/App";

afterEach(cleanup);

test("the root route renders the Gate 2 training home", async () => {
  render(createElement(App));

  expect(
    await screen.findByRole(
      "heading",
      {
        level: 1,
        name: /Decide on what you know.*Then see what happened/,
      },
      { timeout: 5000 },
    ),
  ).toBeTruthy();
  expect(
    screen.getByText("Decision Training Under Degraded Information")
      .textContent,
  ).toBe("Decision Training Under Degraded Information");
  expect(screen.getByText("Synthetic training environment").textContent).toBe(
    "Synthetic training environment",
  );
  expect(screen.getByTestId("run-flagship-demo")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Browse scenarios/ })).toBeTruthy();
});
