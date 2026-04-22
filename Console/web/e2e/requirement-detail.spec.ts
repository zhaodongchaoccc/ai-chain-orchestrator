import { expect, test } from "@playwright/test";

import { fetchRequirementDetail, fetchRequirements } from "./helpers";

test("requirement detail shows background and chain actions by completion state", async ({ page, request }) => {
  const requirements = await fetchRequirements(request, page);
  expect(requirements.length).toBeGreaterThan(0);

  const targetRequirement = requirements.find((item) => item.chainCount > 0) ?? requirements[0];
  const detail = await fetchRequirementDetail(request, page, targetRequirement.id);

  await page.goto(`/req/${targetRequirement.id}`);

  await expect(page.getByRole("heading", { name: "需求背景" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "开发进度" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "接口文档" })).toBeVisible();

  if (detail.background.trim()) {
    await expect(page.getByText(detail.background.trim().slice(0, 20))).toBeVisible();
  } else {
    await expect(page.getByText("暂无背景摘要")).toBeVisible();
  }

  if (detail.requirementCodeListPath) {
    await expect(page.getByRole("heading", { name: "需求代码文件清单" })).toBeVisible();
  }

  const completedChains = page.locator('[data-testid="chain-item"][data-chain-completed="true"]');
  if (await completedChains.count()) {
    const firstCompleted = completedChains.first();
    await expect(firstCompleted.getByRole("button", { name: "打开地图" })).toBeVisible();
    await expect(firstCompleted.getByRole("button", { name: "进入" })).toHaveCount(0);
    await expect(firstCompleted.getByRole("button", { name: "恢复" })).toHaveCount(0);
  }

  const activeChains = page.locator('[data-testid="chain-item"][data-chain-completed="false"]');
  if (await activeChains.count()) {
    const firstActive = activeChains.first();
    await expect(firstActive.getByRole("button", { name: "进入" })).toBeVisible();
    await expect(firstActive.getByRole("button", { name: "恢复" })).toBeVisible();
  }
});
