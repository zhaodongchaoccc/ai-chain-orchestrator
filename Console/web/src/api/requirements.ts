export interface RequirementSummary {
  id: string;
  title: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  docPath: string;
  chainCount: number;
  backendChainCount: number;
  frontendChainCount: number;
  completedChainCount: number;
  activeChainCount: number;
  idleChainCount: number;
  progressPercent: number;
}

export interface RequirementChain {
  id: string;
  titleZh: string;
  type?: string;
  repoKey: string;
  branch?: string | null;
  status: string;
  stage: string;
  session: string | null;
  sessionRunning: boolean;
  updatedAt?: string | null;
  summary?: string;
  blocked?: boolean;
}

export interface RequirementDetail extends RequirementSummary {
  background: string;
  interfaceDocPath: string | null;
  interfaceExcerpt: string | null;
  requirementCodeListPath: string | null;
  requirementCodeListGenerated: boolean;
  chains: RequirementChain[];
}

export interface SessionRecord {
  name: string;
  kind: "main-control" | "system" | "chain" | "other";
  sourceId: string | null;
  chainId: string | null;
  running: boolean;
}

export interface HealthStatus {
  ok: boolean;
  platform?: string;
}

export interface LifecycleResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  command?: string;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  const payload = await response.json().catch(() => null) as { message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `Request failed for ${path}: ${response.status}`);
  }

  return payload as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `Request failed for ${path}: ${response.status}`);
  }

  return payload as T;
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "DELETE" });
  const payload = await response.json().catch(() => null) as { message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `Request failed for ${path}: ${response.status}`);
  }

  return payload as T;
}

export async function createRequirement(title: string, background: string): Promise<{ success: boolean; requirement: RequirementDetail | RequirementSummary }> {
  return postJson("/api/requirements", { title, background });
}

export async function deleteRequirement(requirementId: string): Promise<void> {
  await deleteJson(`/api/requirements/${encodeURIComponent(requirementId)}`);
}

export async function fetchRequirements(signal?: AbortSignal): Promise<RequirementSummary[]> {
  const response = await getJson<{ requirements: RequirementSummary[] }>("/api/requirements", signal);
  return response.requirements;
}

export async function fetchRequirementDetail(id: string, signal?: AbortSignal): Promise<RequirementDetail> {
  return getJson<RequirementDetail>(`/api/requirements/${encodeURIComponent(id)}`, signal);
}

export async function startRequirementChain(requirementId: string, chainId: string): Promise<void> {
  await postJson(`/api/requirements/${encodeURIComponent(requirementId)}/chains/${encodeURIComponent(chainId)}/start`);
}

export async function createRequirementChain(requirementId: string, input: { title: string; type: "backend" | "frontend"; repoKey?: string; summary?: string }): Promise<void> {
  await postJson(`/api/requirements/${encodeURIComponent(requirementId)}/chains`, input);
}

export async function markRequirementChainDone(requirementId: string, chainId: string): Promise<void> {
  await postJson(`/api/requirements/${encodeURIComponent(requirementId)}/chains/${encodeURIComponent(chainId)}/done`, {});
}

export async function fetchRequirementChainAttach(requirementId: string, chainId: string): Promise<{ command: string; session: string; running: boolean }> {
  return getJson(`/api/requirements/${encodeURIComponent(requirementId)}/chains/${encodeURIComponent(chainId)}/attach`);
}

export async function openRequirementChainAttach(requirementId: string, chainId: string): Promise<void> {
  await postJson(`/api/requirements/${encodeURIComponent(requirementId)}/chains/${encodeURIComponent(chainId)}/attach/open`, {});
}

export async function decomposeRequirement(requirementId: string): Promise<void> {
  await postJson(`/api/requirements/${encodeURIComponent(requirementId)}/decompose`, {});
}

export async function generateRequirementInterface(requirementId: string): Promise<{ success: boolean; path: string }> {
  return postJson(`/api/requirements/${encodeURIComponent(requirementId)}/interface-gen`, {});
}

export async function generateRequirementCodeList(requirementId: string): Promise<{ success: boolean; path: string }> {
  return postJson(`/api/requirements/${encodeURIComponent(requirementId)}/codelist-gen`, {});
}

export async function fetchSessions(signal?: AbortSignal): Promise<SessionRecord[]> {
  const response = await getJson<{ sessions: SessionRecord[] }>("/api/sessions", signal);
  return response.sessions;
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return getJson<HealthStatus>("/api/health", signal);
}

export async function runLifecycle(path: string): Promise<LifecycleResult> {
  return postJson<LifecycleResult>(path, {});
}
