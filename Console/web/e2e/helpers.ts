import { expect, type APIRequestContext, type Page } from "@playwright/test";

export interface RequirementSummary {
  id: string;
  title: string;
  chainCount: number;
}

export interface RequirementChain {
  id: string;
  status: string;
  stage: string;
}

export interface RequirementDetail {
  id: string;
  background: string;
  interfaceDocPath: string | null;
  requirementCodeListPath: string | null;
  chains: RequirementChain[];
}

export function getApiBaseURL(page: Page) {
  void page;
  return process.env.FF_CONSOLE_E2E_API_URL ?? "http://127.0.0.1:8787";
}

export async function fetchRequirements(request: APIRequestContext, page: Page) {
  const response = await request.get(`${getApiBaseURL(page)}/api/requirements`);
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { requirements: RequirementSummary[] };
  return payload.requirements;
}

export async function fetchRequirementDetail(request: APIRequestContext, page: Page, requirementId: string) {
  const response = await request.get(`${getApiBaseURL(page)}/api/requirements/${encodeURIComponent(requirementId)}`);
  expect(response.ok()).toBeTruthy();
  return await response.json() as RequirementDetail;
}
