import type { MemoryDistillResult, MemorySchedulerStatus } from "./memory-types";

export type { MemoryDistillResult, MemorySchedulerStatus };

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  const payload = await response.json().catch(() => null) as { message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `Request failed for ${path}: ${response.status}`);
  }

  return payload as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const hasBody = body !== undefined;
  const response = await fetch(path, {
    method: "POST",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? `Request failed for ${path}: ${response.status}`);
  }

  return payload as T;
}

export interface MemoryStatusResponse {
  scheduler: MemorySchedulerStatus;
  lastResult: MemoryDistillResult | null;
  runCount: number;
}

export interface MemoryDistillResponse {
  success: boolean;
  result: MemoryDistillResult;
}

export async function fetchMemoryStatus(signal?: AbortSignal): Promise<MemoryStatusResponse> {
  return getJson<MemoryStatusResponse>("/api/memory/status", signal);
}

export async function triggerMemoryDistill(): Promise<MemoryDistillResponse> {
  return postJson<MemoryDistillResponse>("/api/memory/distill");
}
