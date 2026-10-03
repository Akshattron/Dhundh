import { expect, test, type Page } from "@playwright/test";
import flagship from "../../src/scenarios/kestrel-relief-corridor.json" with { type: "json" };

async function expectResponsiveLayout(page: Page): Promise<void> {
  const originalViewport = page.viewportSize();
  if (!originalViewport) throw new Error("A fixed test viewport is required.");
  for (const width of [1920, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    const links = await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link")
      .all();
    for (const link of links) {
      await link.focus();
      await expect(link).toBeInViewport({ ratio: 1 });
    }
  }
  await page.setViewportSize(originalViewport);
}

function contrast(foreground: string, background: string): number {
  const luminance = (color: string) =>
    (color.match(/[\d.]+/g) ?? [])
      .slice(0, 3)
      .map(Number)
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!,
        0,
      );
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("authoring validates, recovers, exports minute JSON and previews an isolated real scenario", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/scenarios");
  await page
    .getByRole("button", { name: "Author a synthetic scenario" })
    .click();
  await expect(page).toHaveURL(/\/authoring$/);
  await expect(
    page.getByText(/Do not enter real-world operational or classified content/),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
  await expectResponsiveLayout(page);
  const draft = structuredClone(flagship);
  draft.meta.title = "Gate 6 synthetic editor preview";
  draft.meta.difficulty = 1;
  await page
    .getByLabel("Scenario JSON draft")
    .fill(JSON.stringify(draft, null, 2));
  await page.getByRole("button", { name: "Validate now" }).click();
  await expect(page.getByTestId("authoring-validation-status")).toHaveText(
    "Ready for isolated preview.",
  );
  await expect(page.getByText(draft.meta.title, { exact: true })).toBeVisible();
  const colors = await page
    .getByLabel("Scenario JSON draft")
    .evaluate((editor) => ({
      border: getComputedStyle(editor).borderTopColor,
      background: getComputedStyle(editor).backgroundColor,
      text: getComputedStyle(editor).color,
      surrounding: getComputedStyle(editor.closest("section")!).backgroundColor,
    }));
  expect(
    Math.min(
      contrast(colors.border, colors.background),
      contrast(colors.border, colors.surrounding),
    ),
  ).toBeGreaterThanOrEqual(3);
  expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
  const disclosureColors = await page
    .getByText(
      "Reliabilities and payoffs are authoring assumptions, not doctrine.",
    )
    .evaluate((element) => ({
      text: getComputedStyle(element).color,
      background: getComputedStyle(document.documentElement).backgroundColor,
    }));
  expect(
    contrast(disclosureColors.text, disclosureColors.background),
  ).toBeGreaterThanOrEqual(4.5);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: string[] = [];
  for await (const chunk of stream) chunks.push(String(chunk));
  const exported = chunks.join("");
  expect(JSON.parse(exported)).toEqual(draft);
  expect(exported).not.toContain('"durationSec"');

  await page.getByRole("button", { name: "Preview scenario" }).click();
  await expect(page.getByTestId("authoring-preview")).toBeVisible();
  await page.getByRole("button", { name: "Next preview event" }).click();
  await expect(page.getByTestId("preview-clock")).toHaveText(/^3:/);
  await page.getByRole("button", { name: "Pause preview" }).click();
  await page.screenshot({
    path: testInfo.outputPath("authoring-preview.png"),
    fullPage: true,
  });
  await page.getByLabel("Scenario JSON draft").fill("{");
  await expect(page.getByTestId("authoring-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "Validate now" }).click();
  await expect(page.getByText("Actionable issues")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preview scenario" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reset draft" }).click();
  await page.getByRole("button", { name: "Validate now" }).click();
  await expect(page.getByTestId("authoring-validation-status")).toHaveText(
    "Ready for isolated preview.",
  );
  await page.getByRole("button", { name: "Preview scenario" }).click();
  await expect(page.getByTestId("authoring-preview")).toContainText("RUNNING");
  await page.getByRole("button", { name: "Reset preview" }).click();
  await expect(page.getByTestId("preview-clock")).toHaveText("0:00");
});

test("presentation stays live offline, enters fullscreen, exits with focus and preserves demo shortcuts", async ({
  page,
  context,
}, testInfo) => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  await page.clock.install({ time: start });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/demo");
  await expect(page.getByTestId("demo-presenter-controls")).toBeVisible();
  await page.clock.pauseAt(new Date(start.getTime() + 60_000));
  await page.getByTestId("demo-reset").click();
  await expect(page.getByTestId("session-clock")).toHaveText("0:00");
  await page.getByTestId("enter-presentation").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`/presentation/demo/${flagship.meta.id}$`),
  );
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Exit presentation" }),
  ).toBeFocused();
  expect(
    await page
      .getByRole("button", { name: "Exit presentation" })
      .evaluate((button) => getComputedStyle(button).outlineWidth),
  ).toBe("2px");
  await expectResponsiveLayout(page);

  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.fullscreenElement?.getAttribute("data-testid"),
      ),
    )
    .toBe("presentation-page");
  await context.setOffline(true);
  await page.clock.fastForward(6000);
  await expect(page.getByTestId("presentation-clock")).toHaveText("3:00");
  await page.getByRole("button", { name: "Show WOW event" }).click();
  await expect(page.getByTestId("presentation-wow")).toBeVisible();
  await expect(page.getByTestId("presentation-clock")).toHaveText("22:00");
  await expect(page.getByTestId("presentation-aar")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("presentation-wow.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Leave fullscreen" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await page.getByRole("button", { name: "Exit presentation" }).click();
  await expect(page.getByTestId("enter-presentation")).toBeFocused();
  await expect(page.getByTestId("session-clock")).toHaveText("22:00");
  await page.keyboard.press("d");
  await expect(page.getByTestId("session-clock")).toHaveText("0:00");
  await page.keyboard.press("j");
  await expect(page.getByTestId("session-clock")).toHaveText("12:00");
  await context.setOffline(false);
  await page.getByTestId("enter-presentation").click();
  await expect(page.getByTestId("presentation-clock")).toHaveText("12:00");
  await expect(
    page.getByRole("button", { name: "Exit presentation" }),
  ).toBeFocused();
  await page.keyboard.press("a");
  await expect(page.getByTestId("presentation-aar")).toBeVisible();
  await expect(page.getByTestId("presentation-aar")).toContainText(
    "Post-completion review",
  );
  await page.getByRole("button", { name: "Open full AAR and replay" }).click();
  await expect(page.getByTestId("aar-scrubber")).toBeVisible();
  await expect(page.getByTestId("enter-presentation")).toBeFocused();
});
