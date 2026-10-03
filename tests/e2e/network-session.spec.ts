import { expect, test } from "@playwright/test";

test("authoritative session partitions reports, relays analyst evidence, reconnects, and opens team AAR", async ({
  browser,
  page: instructor,
}) => {
  test.setTimeout(240_000);
  const commanderContext = await browser.newContext();
  const analystContext = await browser.newContext();
  const commander = await commanderContext.newPage();
  const analyst = await analystContext.newPage();
  try {
    await instructor.goto("/sessions/new");
    await instructor
      .getByLabel("Instructor display name")
      .fill("Gate 5 instructor");
    await instructor
      .getByRole("button", { name: "Create instructor session" })
      .click();
    await expect(instructor).toHaveURL(/\/instructor\/[A-HJ-NP-Z2-9]{6}$/);
    const code = new URL(instructor.url()).pathname.split("/").at(-1);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    await commander.goto(`/join?code=${code}`);
    await commander.getByLabel("Display name").fill("Commander One");
    await commander.getByLabel("Role").selectOption("COMMANDER");
    await commander.getByRole("button", { name: "Join session" }).click();
    await expect(commander).toHaveURL(new RegExp(`/lobby/${code}$`));

    await analyst.goto(`/join?code=${code}`);
    await analyst.getByLabel("Display name").fill("Analyst One");
    await analyst.getByLabel("Role").selectOption("ANALYST");
    await analyst.getByRole("button", { name: "Join session" }).click();
    await expect(analyst).toHaveURL(new RegExp(`/lobby/${code}$`));
    await analyst.reload();
    await expect(
      analyst.getByText("Connected to the authoritative session."),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      instructor.getByRole("heading", { name: "Live participant monitor" }),
    ).toBeVisible();
    await expect(
      instructor.getByText("Commander One", { exact: true }),
    ).toBeVisible();
    await expect(
      instructor.getByText("Analyst One", { exact: true }),
    ).toBeVisible();
    expect(
      (await commander.request.get(`/api/sessions/${code}/aar`)).status(),
    ).toBe(401);

    await expect(
      instructor.getByRole("button", { name: "Start exercise" }),
    ).toBeEnabled();
    await instructor.getByRole("button", { name: "Start exercise" }).click();
    await expect(
      commander.getByRole("button", { name: "Open training console" }),
    ).toBeVisible();
    await expect(
      analyst.getByRole("button", { name: "Open training console" }),
    ).toBeVisible();
    await commander
      .getByRole("button", { name: "Open training console" })
      .click();
    await analyst
      .getByRole("button", { name: "Open training console" })
      .click();
    await expect(commander.getByTestId("session-clock")).toBeVisible();
    await expect(analyst.getByTestId("session-clock")).toBeVisible();
    await expect(commander.locator('[data-report-id="R04"]')).toHaveCount(0);
    await expect(analyst.locator('[data-report-id="R04"]')).toBeVisible({
      timeout: 40_000,
    });
    await expect(analyst.getByTestId("open-decision")).toHaveCount(0);
    await analyst.getByTestId("relay-report-R04").click();
    await expect(commander.locator('[data-report-id="RLY1"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(commander.locator('[data-report-id="R04"]')).toHaveCount(0);
    await expect(commander.getByTestId("sharing-rate-DP1")).toHaveCount(0);
    await commander.getByTestId("enter-presentation").click();
    await expect(commander).toHaveURL(
      new RegExp(`/presentation/network/${code}$`),
    );
    await expect(commander.getByTestId("presentation-clock")).toBeVisible();
    await expect(
      commander.getByRole("region", { name: "Visible event timeline" }),
    ).not.toContainText("report R04");
    await commander.getByRole("button", { name: "Exit presentation" }).click();
    await expect(commander.getByTestId("enter-presentation")).toBeFocused();

    await expect(commander.getByTestId("open-decision")).toBeVisible({
      timeout: 25_000,
    });
    await analyst
      .getByLabel("Veer Pass (north route) is passable estimate percentage")
      .fill("65");
    await analyst.getByRole("button", { name: "Record" }).click();
    await commander
      .getByLabel("Veer Pass (north route) is passable estimate percentage")
      .fill("65");
    await commander.getByRole("button", { name: "Record" }).click();
    await commander.getByTestId("open-decision").click();
    await commander.getByTestId("decide-GO_SOUTH").click();
    await expect(commander.getByTestId("open-aar")).toBeVisible({
      timeout: 100_000,
    });
    await commander.getByTestId("open-aar").click();
    await expect(
      commander.getByRole("heading", { name: "Shared work, separate roles" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      commander.getByText(/COMMANDER · Commander One/),
    ).toBeVisible();
    await expect(commander.getByText(/ANALYST · Analyst One/)).toBeVisible();
    await expect(commander.getByText("Analyst handoffs")).toBeVisible();
    await expect(commander.getByText(/R04 → RLY1/)).toBeVisible();
    await expect(commander.getByTestId("sharing-rate-DP1")).toHaveText(
      "100.0%",
    );
    await expect(commander.getByTestId("convergence-DP1")).toHaveText("100.0%");
    await expect(commander.getByTestId("coordination-latency-DP1")).toHaveText(
      /^\d+\.\d sec$/,
    );
    await commander.getByText("Exact definitions and limitations").click();
    await expect(
      commander.getByText(
        /not scientifically validated learning-transfer measures/,
      ),
    ).toBeVisible();
    await commander.getByRole("link", { name: "History" }).click();
    await expect(
      commander.getByRole("heading", { name: "Session history" }),
    ).toBeVisible();
    await expect(commander.getByText("Recorded runs")).toBeVisible();
    await expect(commander.getByText("Harbour Flood Response")).toHaveCount(0);
    await expect(commander.getByText("Relief Corridor KESTREL")).toBeVisible();
  } finally {
    await commanderContext.close();
    await analystContext.close();
  }
});
