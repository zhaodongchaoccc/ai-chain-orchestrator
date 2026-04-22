import { describe, it } from "node:test";
import assert from "node:assert";
import Fastify from "fastify";
import { registerSystemRoutes } from "../routes/system";
import { writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";

const paths = {
  projectRoot: process.cwd().replace("/Console/server", ""),
  shareRoot: process.cwd().replace("/Console/server", "") + "/share",
  playbooksRoot: process.cwd().replace("/Console/server", "") + "/Playbooks",
};

const DECISIONS_DIR = path.join(paths.projectRoot, "decisions");

describe("system routes", () => {
  it("GET /api/system/todos returns parsed todos from decisions", async () => {
    const server = Fastify();
    registerSystemRoutes(server, paths);
    await server.ready();

    const response = await server.inject({ method: "GET", url: "/api/system/todos" });
    assert.strictEqual(response.statusCode, 200);

    const payload = JSON.parse(response.body) as {
      todos: Array<Record<string, unknown>>;
      summary: { total: number; pending: number; done: number; aiPending: number };
    };

    assert.ok(Array.isArray(payload.todos));
    assert.ok(payload.summary.total > 0);
    assert.ok(payload.summary.pending >= 0);
    assert.ok(payload.summary.done >= 0);

    // 验证 todo 结构
    const firstTodo = payload.todos[0];
    assert.ok(typeof firstTodo.id === "string");
    assert.ok(typeof firstTodo.text === "string");
    assert.ok(firstTodo.status === "pending" || firstTodo.status === "done");
    assert.ok(typeof firstTodo.sourceFile === "string");
    assert.ok(typeof firstTodo.line === "number");
  });

  it("POST /api/system/todos/:id/complete marks a pending todo done", async () => {
    // 创建临时测试文件
    const testFile = path.join(DECISIONS_DIR, "test-system-todo-complete.md");
    await writeFile(
      testFile,
      "# 测试决策记录\n\n- [ ] [AI] 这是一个测试代办项\n",
      "utf8"
    );

    try {
      const server = Fastify();
      registerSystemRoutes(server, paths);
      await server.ready();

      const response = await server.inject({
        method: "POST",
        url: "/api/system/todos/test-system-todo-complete.md:3/complete",
      });
      assert.strictEqual(response.statusCode, 200);

      const payload = JSON.parse(response.body) as { success: boolean; todo: { id: string; text?: string } };
      assert.strictEqual(payload.success, true);
      assert.strictEqual(payload.todo.id, "test-system-todo-complete.md:3");

      // 验证文件已修改
      const content = await readFile(testFile, "utf8");
      assert.ok(content.includes("- [x] [AI] 这是一个测试代办项"), "Todo should be marked done in file");
    } finally {
      await rm(testFile, { force: true });
    }
  });

  it("POST /api/system/todos/:id/execute rejects completed todos", async () => {
    // 创建临时测试文件，包含已完成的代办
    const testFile = path.join(DECISIONS_DIR, "test-system-todo-execute-done.md");
    await writeFile(
      testFile,
      "# 测试决策记录\n\n- [x] [AI] 已完成的代办项\n",
      "utf8"
    );

    try {
      const server = Fastify();
      registerSystemRoutes(server, paths);
      await server.ready();

      const response = await server.inject({
        method: "POST",
        url: "/api/system/todos/test-system-todo-execute-done.md:3/execute",
      });
      assert.strictEqual(response.statusCode, 409);

      const payload = JSON.parse(response.body) as { message?: string };
      assert.ok(payload.message?.includes("已完成"), `Expected "已完成" but got: ${payload.message}`);
    } finally {
      await rm(testFile, { force: true });
    }
  });

  it("POST /api/system/todos/:id/execute rejects non-AI todos", async () => {
    // 创建临时测试文件，包含 [人工] 代办
    const testFile = path.join(DECISIONS_DIR, "test-system-todo-manual.md");
    await writeFile(
      testFile,
      "# 测试决策记录\n\n- [ ] [人工] 人工确认代办项\n",
      "utf8"
    );

    try {
      const server = Fastify();
      registerSystemRoutes(server, paths);
      await server.ready();

      const response = await server.inject({
        method: "POST",
        url: "/api/system/todos/test-system-todo-manual.md:3/execute",
      });
      assert.strictEqual(response.statusCode, 409);

      const payload = JSON.parse(response.body) as { message?: string };
      assert.ok(
        payload.message?.includes("未标记为 [AI]") || payload.message?.includes("无法自动执行"),
        `Expected rejection message but got: ${payload.message}`
      );
    } finally {
      await rm(testFile, { force: true });
    }
  });

  it("POST /api/system/todos/:id/complete returns 404 for unknown id", async () => {
    const server = Fastify();
    registerSystemRoutes(server, paths);
    await server.ready();

    const response = await server.inject({
      method: "POST",
      url: "/api/system/todos/nonexistent.md:999/complete",
    });
    assert.strictEqual(response.statusCode, 404);

    const payload = JSON.parse(response.body) as { message?: string };
    assert.ok(payload.message?.includes("不存在") || payload.message?.includes("未找到"), `Expected 404 message but got: ${payload.message}`);
  });
});
