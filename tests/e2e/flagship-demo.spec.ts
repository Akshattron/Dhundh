import { expect, test } from "@playwright/test";

test("flagship demo reaches the real consequence, AAR, and reset", async ({
  page,
}) => {
  const clockStart = new Date("2026-01-01T00:00:00.000Z");
  await page.clock.install({ time: clockStart });
  await page.goto("/demo");
  let clockNow = new Date(clockStart.getTime() + 60_000);
  await page.clock.pauseAt(clockNow);
  const advanceDemo = async (wallMs: number) => {
    const target = new Date(clockNow.getTime() + wallMs);
    await page.clock.fastForward(wallMs);
    await page.clock.pauseAt(target);
    clockNow = target;
  };
  await page.getByTestId("demo-start").click();
  await expect(page.getByText("Live local exercise · synthetic")).toBeVisible();

  await advanceDemo(18_000);
  for (const reportId of ["R01", "R02", "R03", "R04"]) {
    await page.getByTestId(`open-report-${reportId}`).click();
  }

  await advanceDemo(18_000);
  const estimate = page.getByLabel(
    "Veer Pass (north route) is passable estimate percentage",
  );
  await estimate.fill("80");
  await page.getByRole("button", { name: "Record" }).click();
  await page.getByTestId("open-report-R05").click();

  await advanceDemo(8_000);
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
  await expect(page.getByText("88.5")).toBeVisible();

  await page.getByRole("button", { name: /Return to exercise/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Reset exercise/ }).click();
  await expect(page.getByText("Exercise ready")).toBeVisible();
  await expect(page.getByTestId("session-clock")).toHaveText("0:00");
});
