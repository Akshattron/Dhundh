import { expect, test } from "@playwright/test";

test("static fallback hides networking but keeps the local flagship demo", async ({
  page,
}) => {
  test.skip(
    process.env.VITE_FORCE_LOCAL !== "1",
    "Run with VITE_FORCE_LOCAL=1 to verify the static fallback build.",
  );

  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Create network session" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Join with code" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Join session" })).toHaveCount(0);

  for (const path of [
    "/sessions/new",
    "/join",
    "/lobby/ABC234",
    "/instructor/ABC234",
    "/session/network/kestrel-relief-corridor",
    "/presentation/network/ABC234",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("run-flagship-demo")).toBeVisible();
  }

  await page.getByTestId("run-flagship-demo").click();
  await expect(page.getByText("Live local exercise · synthetic")).toBeVisible();
});
