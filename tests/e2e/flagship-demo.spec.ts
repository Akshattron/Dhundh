import { expect, test } from "@playwright/test";

test("flagship demo reaches the real consequence, AAR, and reset", async ({
  page,
}) => {
  const clockStart = new Date("2026-01-01T00:00:00.000Z");
  await page.clock.install({ time: clockStart });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  let clockNow = new Date(clockStart.getTime() + 60_000);
  let elapsedDemoMs = 0;
  await page.clock.pauseAt(clockNow);
  const advanceDemo = async (wallMs: number) => {
    const target = new Date(clockNow.getTime() + wallMs);
    await page.clock.fastForward(wallMs);
    await page.clock.pauseAt(target);
    clockNow = target;
    elapsedDemoMs += wallMs;
  };
  await expect(
    page.getByText("Synthetic scenario — fictional entities"),
  ).toBeVisible();
  const startupStartedAt = performance.now();
  await page.getByTestId("run-flagship-demo").click();
  await expect(page.getByText("Live local exercise · synthetic")).toBeVisible();
  console.info(
    `Gate 4 measured demo startup: ${(performance.now() - startupStartedAt).toFixed(1)} ms`,
  );
  await expect(page.getByTestId("demo-presenter-controls")).toBeVisible();
  await expect(page.getByTestId("demo-guide")).toBeVisible();
  await page.getByRole("button", { name: "Dismiss presenter guide" }).click();
  await expect(page.getByTestId("demo-guide")).toHaveCount(0);

  const timeBeforePause = await page.getByTestId("session-clock").textContent();
  await page.getByTestId("demo-pause").click();
  await advanceDemo(2000);
  await expect(page.getByTestId("session-clock")).toHaveText(
    timeBeforePause ?? "",
  );
  await page.getByTestId("demo-resume").click();

  await page.keyboard.press("?");
  await expect(
    page.getByText("Complete the real path and open AAR"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Complete the real path and open AAR"),
  ).toHaveCount(0);

  await page.locator("body").press("i");
  await expect(page.getByText("Control drawer")).toBeVisible();
  await page.locator("body").press("i");
  await expect(page.getByText("Control drawer")).toHaveCount(0);

  await page.keyboard.press("n");
  await expect(page.getByTestId("session-clock")).toHaveText("3:00");
  await page.keyboard.press("d");
  await expect(page.getByTestId("session-clock")).toHaveText("0:00");

  await page.keyboard.press("j");
  await expect(page.getByTestId("open-decision")).toBeVisible();
  await expect(page.getByTestId("session-clock")).toHaveText("12:00");
  await page.keyboard.press("d");
  await expect(page.getByTestId("session-clock")).toHaveText("0:00");

  await page.keyboard.press("a");
  await expect(page.getByText("Decision-quality profile")).toBeVisible();
  await expect(page.getByText("Timed out", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Reset demo/ }).click();
  await expect(page.getByTestId("session-clock")).toHaveText("0:00");

  await page.locator("body").press("h");
  await expect(page.getByTestId("run-flagship-demo")).toBeVisible();
  await page.getByTestId("run-flagship-demo").click();
  await expect(page.getByTestId("demo-guide")).toBeVisible();
  await page.getByTestId("demo-reset").click();
  await expect(page.getByTestId("session-clock")).toHaveText("0:00");
  await page.getByTestId("demo-reset").click();
  await expect(page.getByTestId("session-clock")).toHaveText("0:00");
  elapsedDemoMs = 0;
  await page.getByRole("button", { name: "Dismiss presenter guide" }).click();

  await advanceDemo(18_000);
  for (const reportId of ["R01", "R02", "R03", "R04"]) {
    await page.getByTestId(`open-report-${reportId}`).click();
  }

  await advanceDemo(18_000);
  const estimate = page.getByLabel(
    "Veer Pass (north route) is passable estimate percentage",
  );
  await estimate.focus();
  await page.keyboard.press("d");
  await expect(page.getByTestId("session-clock")).toHaveText("18:00");
  await estimate.fill("80");
  await page.getByRole("button", { name: "Record" }).click();
  await page.getByTestId("open-report-R05").click();

  await advanceDemo(8_000);
  await expect(page.getByTestId("demo-wow")).toBeVisible();
  await expect(page.getByTestId("demo-wow")).toContainText(
    "Delayed evidence now conflicts",
  );
  await expect(page.getByText(/^\+\d\.\d{2} since prior event$/)).toBeVisible();
  expect(elapsedDemoMs).toBeLessThanOrEqual(60_000);
  console.info(
    `Gate 4 measured WOW arrival: ${elapsedDemoMs} ms simulated wall time`,
  );
  await page.getByTestId("open-report-R06").click();
  await page.getByTestId("verify-UAV_SORTIE").click();

  await advanceDemo(4_000);
  await page.getByTestId("open-report-R07").click();
  await advanceDemo(8_000);
  await page.getByTestId("open-report-V01").click();

  await advanceDemo(2_000);
  await estimate.fill("25");
  await page.getByRole("button", { name: "Record" }).click();
  await page.getByTestId("open-decision").click();
  await page.getByTestId("decide-GO_SOUTH").click();
  await expect(
    page.getByText("Decision committed. Consequence pending."),
  ).toBeVisible();
  await expect(page.getByTestId("consequence-reveal")).toHaveCount(0);

  await advanceDemo(14_000);
  await expect(page.getByTestId("consequence-reveal")).toBeVisible();
  await page.getByTestId("open-aar").click();
  await expect(page.getByText("Decision-quality profile")).toBeVisible();
  await expect(
    page.getByText("Truth at decision · revealed after completion"),
  ).toBeVisible();
  await expect(page.getByTestId("aar-scrubber")).toBeVisible();
  await expect(page.getByText("88.5", { exact: true })).toBeVisible();
  expect(elapsedDemoMs).toBeLessThanOrEqual(180_000);
  console.info(
    `Gate 4 measured AAR arrival: ${elapsedDemoMs} ms simulated wall time`,
  );

  const annotationOrder = await page
    .getByTestId("replay-annotation")
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-source-id")),
    );
  const replaySlider = page.getByRole("slider");
  for (const speed of [0.5, 1, 2, 4]) {
    await page
      .getByRole("combobox", { name: "Replay speed" })
      .selectOption(String(speed));
    await replaySlider.focus();
    await replaySlider.press("Home");
    await page
      .getByRole("button", { name: `Play replay at ${speed}x` })
      .click();
    await page.clock.fastForward(1000 / speed);
    await expect(replaySlider).toHaveValue("1");
    await page.getByRole("button", { name: "Pause replay" }).click();
  }
  await page
    .getByRole("button", { name: /Jump to decision at 29:00: Decision cut/ })
    .click();
  await expect(page.getByTestId("replay-position")).toContainText(
    "before commitment",
  );
  await expect(replaySlider).toBeFocused();
  expect(
    await page
      .getByTestId("replay-annotation")
      .evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-source-id")),
      ),
  ).toEqual(annotationOrder);
  await expect(page.getByText("88.5", { exact: true })).toBeVisible();
  await expect(
    page.getByText("COUNTERFACTUAL — simulated, not what happened").first(),
  ).toBeVisible();

  await page.getByRole("button", { name: /Return to exercise/ }).click();
  const resetStartedAt = performance.now();
  await page.getByTestId("demo-reset").click();
  await expect(page.getByTestId("session-clock")).toHaveText("0:00");
  expect(performance.now() - resetStartedAt).toBeLessThan(3000);
  console.info(
    `Gate 4 measured reset: ${(performance.now() - resetStartedAt).toFixed(1)} ms`,
  );
  const repeatedResetStartedAt = performance.now();
  await page.getByTestId("demo-reset").click();
  await expect(page.getByTestId("session-clock")).toHaveText("0:00");
  expect(performance.now() - repeatedResetStartedAt).toBeLessThan(3000);
  console.info(
    `Gate 4 measured repeated reset: ${(performance.now() - repeatedResetStartedAt).toFixed(1)} ms`,
  );
});
