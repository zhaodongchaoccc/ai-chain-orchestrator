import type { SystemTodo, TodosResponse } from "../../../server/src/routes/system";

export type { SystemTodo, TodosResponse };

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
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.message ?? `Request failed for ${path}: ${response.status}`);
  }
  return payload as T;
}

export async function fetchSystemTodos(signal?: AbortSignal): Promise<TodosResponse> {
  return getJson<TodosResponse>("/api/system/todos", signal);
}

export async function executeSystemTodo(todoId: string): Promise<{ success: boolean; todo: { id: string; text: string }; stdout: string; stderr: string }> {
  return postJson(`/api/system/todos/${encodeURIComponent(todoId)}/execute`);
}

export async function completeSystemTodo(todoId: string): Promise<{ success: boolean; todo: { id: string; text?: string } }> {
  return postJson(`/api/system/todos/${encodeURIComponent(todoId)}/complete`);
}
