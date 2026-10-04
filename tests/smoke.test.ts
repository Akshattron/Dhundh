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
        name: /What did you know.*when you decided/,
      },
      { timeout: 5000 },
    ),
  ).toBeTruthy();
  expect(
    screen.getByText("A decision-training simulator · synthetic scenarios")
      .textContent,
  ).toBe("A decision-training simulator · synthetic scenarios");
  expect(screen.getByText("Synthetic training environment").textContent).toBe(
    "Synthetic training environment",
  );
  expect(screen.getByTestId("run-flagship-demo")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Browse scenarios/ })).toBeTruthy();
});
