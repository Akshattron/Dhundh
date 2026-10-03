import { expect, test } from "@playwright/test";

test("history and analytics URLs render the shared history surface", async ({
  page,
}) => {
  for (const path of ["/history", "/analytics"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Session history" }),
    ).toBeVisible();
  }
});
