import { expect, test } from "@playwright/test";

import { getApiBaseURL } from "./helpers";

test("system page shows memory and lifecycle panels", async ({ page, request }) => {
  const healthResponse = await request.get(`${getApiBaseURL(page)}/api/health`);
  expect(healthResponse.ok()).toBeTruthy();
  const health = await healthResponse.json() as { ok: boolean };
  expect(health.ok).toBeTruthy();

  await page.goto("/system");

  await expect(page.getByRole("heading", { name: "蒸馏记忆" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "全局主控" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "系统迭代" })).toBeVisible();
  await expect(page.getByRole("button", { name: "立即蒸馏" })).toBeVisible();
  await expect(page.getByText("系统健康：正常")).toBeVisible();
});
