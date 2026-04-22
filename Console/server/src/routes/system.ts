import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { FastifyInstance } from "fastify";

import type { ffPaths } from "../config";

const execFileAsync = promisify(execFile);

export interface SystemTodo {
  id: string;
  text: string;
  tag: "AI" | "人工" | null;
  status: "pending" | "done";
  sourceFile: string;
  line: number;
}

export interface TodosResponse {
  todos: SystemTodo[];
  summary: {
    total: number;
    pending: number;
    done: number;
    aiPending: number;
  };
}

const TODO_REGEX = /^- \[( |x)\](?:\s*\[(AI|人工)\])?\s*(.+)$/gm;
const DECISIONS_DIR = "decisions";

export function registerSystemRoutes(server: FastifyInstance, paths: typeof ffPaths) {
  server.get("/api/system/todos", async () => {
    const todos = await scanTodos(paths);
    return {
      todos,
      summary: {
        total: todos.length,
        pending: todos.filter((t) => t.status === "pending").length,
        done: todos.filter((t) => t.status === "done").length,
        aiPending: todos.filter((t) => t.tag === "AI" && t.status === "pending").length,
      },
    };
  });

  server.post<{ Params: { id: string } }>("/api/system/todos/:id/execute", async (request, reply) => {
    const todo = await findTodoById(paths, request.params.id);
    if (!todo) {
      return reply.status(404).send({ message: `未找到代办: ${request.params.id}` });
    }
    if (todo.status === "done") {
      return reply.status(409).send({ message: "该代办已完成" });
    }
    if (todo.tag !== "AI") {
      return reply.status(409).send({ message: "该代办未标记为 [AI]，无法自动执行" });
    }

    const scriptPath = path.join(paths.projectRoot, "Playbooks", "start", "start-system-iteration-session.sh");
    const { stdout, stderr } = await execFileAsync("bash", [scriptPath, "--todo-id", todo.id, todo.text], {
      cwd: paths.projectRoot,
      env: process.env,
    });

    return {
      success: true,
      todo: { id: todo.id, text: todo.text },
      stdout,
      stderr,
    };
  });

  server.post<{ Params: { id: string } }>("/api/system/todos/:id/complete", async (request, reply) => {
    const result = await markTodoDone(paths, request.params.id);
    if (!result.success) {
      return reply.status(404).send({ message: result.error });
    }
    return { success: true, todo: { id: request.params.id, text: result.text } };
  });
}

async function scanTodos(paths: typeof ffPaths): Promise<SystemTodo[]> {
  const dir = path.join(paths.projectRoot, DECISIONS_DIR);
  const files = await listMarkdownFiles(dir);
  const todos: SystemTodo[] = [];

  for (const fileName of files) {
    const filePath = path.join(dir, fileName);
    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      TODO_REGEX.lastIndex = 0;
      const match = TODO_REGEX.exec(line);
      if (!match) continue;

      const status = match[1] === "x" ? "done" : "pending";
      const tag = (match[2] as "AI" | "人工") || null;
      const text = match[3].trim();

      todos.push({
        id: `${fileName}:${i + 1}`,
        text,
        tag,
        status,
        sourceFile: `${DECISIONS_DIR}/${fileName}`,
        line: i + 1,
      });
    }
  }

  return todos.sort((a, b) => {
    if (a.sourceFile !== b.sourceFile) return a.sourceFile.localeCompare(b.sourceFile);
    return a.line - b.line;
  });
}

async function findTodoById(paths: typeof ffPaths, id: string): Promise<SystemTodo | null> {
  const todos = await scanTodos(paths);
  return todos.find((t) => t.id === id) ?? null;
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function markTodoDone(paths: typeof ffPaths, id: string): Promise<{ success: boolean; text?: string; error?: string }> {
  const [fileName, lineStr] = id.split(":");
  if (!fileName || !lineStr) {
    return { success: false, error: "无效的代办 ID 格式" };
  }
  const lineNum = Number(lineStr);
  if (!Number.isFinite(lineNum) || lineNum < 1) {
    return { success: false, error: "无效的行号" };
  }

  const filePath = path.join(paths.projectRoot, DECISIONS_DIR, fileName);
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return { success: false, error: "决策记录文件不存在" };
  }
  const lines = content.split("\n");

  if (lineNum > lines.length) {
    return { success: false, error: "行号超出文件范围" };
  }

  const line = lines[lineNum - 1];
  TODO_REGEX.lastIndex = 0;
  const match = TODO_REGEX.exec(line);
  if (!match) {
    return { success: false, error: "目标行不是有效的代办格式" };
  }

  const tag = match[2] ? ` [${match[2]}]` : "";
  const text = match[3];
  const newLine = `- [x]${tag} ${text}`;
  lines[lineNum - 1] = newLine;

  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, lines.join("\n"), "utf8");

  return { success: true, text };
}
