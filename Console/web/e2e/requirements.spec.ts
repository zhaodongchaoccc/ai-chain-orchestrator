import { expect, test } from "@playwright/test";

import { fetchRequirements } from "./helpers";

test("requirements page renders current requirement cards", async ({ page, request }) => {
  const requirements = await fetchRequirements(request, page);
  expect(requirements.length).toBeGreaterThan(0);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "需求列表" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ 新建需求" })).toBeVisible();

  const firstRequirement = requirements[0];
  const firstCard = page.locator(`[data-testid="requirement-card"][data-requirement-id="${firstRequirement.id}"]`);
  await expect(firstCard).toBeVisible();
  await expect(firstCard.getByRole("heading", { name: firstRequirement.title })).toBeVisible();
});
