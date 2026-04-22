import { useEffect, useState } from "react";

import { fetchHealth, fetchSessions, runLifecycle, type SessionRecord } from "../api/requirements";
import { triggerMemoryDistill, fetchMemoryStatus, type MemoryStatusResponse } from "../api/memory";
import { fetchSystemTodos, executeSystemTodo, completeSystemTodo, type SystemTodo, type TodosResponse } from "../api/system-todos";
import { WorkbenchLayout } from "../components/layout/WorkbenchLayout";

interface SystemPageProps {
  onOpenRequirements: () => void;
}

export function SystemPage({ onOpenRequirements }: SystemPageProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [memory, setMemory] = useState<MemoryStatusResponse | null>(null);
  const [todosData, setTodosData] = useState<TodosResponse | null>(null);
  const [todosLoading, setTodosLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [distilling, setDistilling] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [todoBusy, setTodoBusy] = useState<string | null>(null);
  const [confirmTodo, setConfirmTodo] = useState<SystemTodo | null>(null);
  const [showDoneTodos, setShowDoneTodos] = useState(false);

  const load = async () => {
    try {
      const [nextSessions, nextHealth, nextMemory] = await Promise.all([
        fetchSessions(),
        fetchHealth(),
        fetchMemoryStatus()
      ]);
      setSessions(nextSessions);
      setHealthOk(nextHealth.ok);
      setPlatform(nextHealth.platform ?? null);
      setMemory(nextMemory);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载系统状态失败");
    }
  };

  const loadTodos = async () => {
    setTodosLoading(true);
    try {
      const data = await fetchSystemTodos();
      setTodosData(data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载系统代办失败");
    } finally {
      setTodosLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void loadTodos();
  }, []);

  const handleDistill = async () => {
    setDistilling(true);
    try {
      await triggerMemoryDistill();
      await load();
      setError(null);
      setNotice("蒸馏已完成并刷新系统状态。");
    } finally {
      setDistilling(false);
    }
  };

  const handleLifecycle = async (apiPath: string, successMessage: string, reload = false) => {
    try {
      setBusyAction(apiPath);
      await runLifecycle(apiPath);
      if (reload) {
        await load();
      }
      setError(null);
      setNotice(successMessage);
    } catch (caughtError) {
      setNotice(null);
      setError(caughtError instanceof Error ? caughtError.message : "系统动作执行失败");
    } finally {
      setBusyAction(null);
    }
  };

  const handleAttach = async (apiPath: string, label: string) => {
    try {
      setBusyAction(apiPath);
      if (platform === "wsl2") {
        const result = await runLifecycle(apiPath);
        if (result.command && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(result.command);
          setNotice(`已复制 ${label} attach 命令：${result.command}，请在 Windows Terminal 中粘贴执行。`);
        }
      } else {
        await runLifecycle(apiPath);
        setNotice(`已尝试打开 Terminal 并${label}。`);
      }
      setError(null);
    } catch (caughtError) {
      setNotice(null);
      setError(caughtError instanceof Error ? caughtError.message : "会话动作执行失败");
    } finally {
      setBusyAction(null);
    }
  };

  const handleExecuteTodo = async (todo: SystemTodo) => {
    setTodoBusy(todo.id);
    try {
      const result = await executeSystemTodo(todo.id);
      setError(null);
      setNotice(`已启动系统迭代 AI 执行：${todo.text}`);
      if (result.stdout) {
        // eslint-disable-next-line no-console
        console.log("[system-iteration]", result.stdout);
      }
    } catch (caughtError) {
      setNotice(null);
      setError(caughtError instanceof Error ? caughtError.message : "启动系统迭代失败");
    } finally {
      setTodoBusy(null);
      setConfirmTodo(null);
    }
  };

  const handleCompleteTodo = async (todo: SystemTodo) => {
    setTodoBusy(todo.id);
    try {
      await completeSystemTodo(todo.id);
      setError(null);
      setNotice(`已标记完成：${todo.text}`);
      await loadTodos();
    } catch (caughtError) {
      setNotice(null);
      setError(caughtError instanceof Error ? caughtError.message : "标记完成失败");
    } finally {
      setTodoBusy(null);
    }
  };

  const openDecisionRecord = (sourceFile: string) => {
    const obsidianPath = `Projects/飞枢系统/${sourceFile}`;
    window.location.href = `obsidian://open?vault=PasObsidian&file=${encodeURIComponent(obsidianPath)}`;
  };

  const todos = todosData?.todos ?? [];
  const pendingTodos = todos.filter((t) => t.status === "pending");
  const doneTodos = todos.filter((t) => t.status === "done");

  return (
    <WorkbenchLayout
      title="系统"
      subtitle="蒸馏、主控与系统迭代状态"
      activeNav="system"
      onOpenRequirements={onOpenRequirements}
      onOpenSystem={() => undefined}
    >
      {notice ? <section className="banner banner--success">{notice}</section> : null}
      {error ? <section className="banner banner--error">{error}</section> : null}
      <div className="panel-stack">
        <section className="panel">
          <div className="panel__title-row">
            <div>
              <h2>蒸馏记忆</h2>
              <p className="muted">维护飞枢系统的长期记忆压缩结果。</p>
            </div>
            <button className="button button--primary" disabled={distilling} onClick={handleDistill} type="button">立即蒸馏</button>
          </div>
          <p className="muted">上次运行：{memory?.lastResult?.distilledAt ?? "-"}</p>
          <p className="muted">运行次数：{memory?.runCount ?? 0}</p>
          <p className="muted">系统健康：{healthOk === null ? "-" : healthOk ? "正常" : "异常"}</p>
        </section>

        <section className="panel">
          <h2>全局主控</h2>
          <p className="muted">状态：{sessions.some((session) => session.name === "main-control") ? "在线" : "离线"}</p>
          <div className="chain-item__actions">
            <button className="button button--secondary" disabled={busyAction !== null} onClick={() => { void handleLifecycle("/api/lifecycle/main-control/start", "已启动全局主控。", true); }} type="button">启动</button>
            <button className="button button--secondary" disabled={busyAction !== null} onClick={() => { void handleLifecycle("/api/lifecycle/main-control/resume", "已向全局主控注入恢复上下文。"); }} type="button">恢复</button>
            <button className="button button--secondary" disabled={busyAction !== null} onClick={() => { void handleLifecycle("/api/lifecycle/main-control/rotate", "已轮换全局主控上下文。"); }} type="button">轮换</button>
            <button className="button button--primary" disabled={busyAction !== null} onClick={() => { void handleAttach("/api/lifecycle/main-control/attach/open", "进入全局主控"); }} type="button">{platform === "wsl2" ? "复制命令" : "进入"}</button>
          </div>
        </section>

        {/* ========== 系统代办 + 系统迭代整合（页面最下方） ========== */}
        <section className="panel">
          <div className="panel__title-row">
            <div>
              <h2>系统代办</h2>
              <p className="muted">来自 decisions 的待执行任务，由系统迭代 AI 或人工推进。</p>
            </div>
            <button className="button button--secondary" disabled={todosLoading} onClick={loadTodos} type="button">刷新</button>
          </div>

          {/* 系统迭代引擎状态（嵌入代办面板头部） */}
          <div className="detail-block" style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <span className="muted">系统迭代引擎：</span>
            <span className={`badge badge--${sessions.some((s) => s.name === "system-iteration") ? "active" : "idle"}`}>
              {sessions.some((s) => s.name === "system-iteration") ? "在线" : "离线"}
            </span>
            <div className="chain-item__actions" style={{ margin: 0 }}>
              <button className="button button--secondary button--small" disabled={busyAction !== null} onClick={() => { void handleLifecycle("/api/lifecycle/system-iteration/start", "已启动系统迭代会话。", true); }} type="button">启动</button>
              <button className="button button--secondary button--small" disabled={busyAction !== null} onClick={() => { void handleLifecycle("/api/lifecycle/system-iteration/resume", "已向系统迭代会话注入恢复上下文。"); }} type="button">恢复</button>
              <button className="button button--secondary button--small" disabled={busyAction !== null} onClick={() => { void handleLifecycle("/api/lifecycle/system-iteration/rotate", "已轮换系统迭代上下文。"); }} type="button">轮换</button>
              <button className="button button--primary button--small" disabled={busyAction !== null} onClick={() => { void handleAttach("/api/lifecycle/system-iteration/attach/open", "进入系统迭代会话"); }} type="button">{platform === "wsl2" ? "复制命令" : "进入"}</button>
            </div>
          </div>

          {todosLoading ? <p className="muted">正在加载代办列表...</p> : null}
          {!todosLoading && todos.length === 0 ? <p className="muted">暂无系统代办。</p> : null}

          {!todosLoading && todos.length > 0 ? (
            <div>
              <p className="muted">
                共 {todosData?.summary.total ?? 0} 项 · 待执行 {todosData?.summary.pending ?? 0}
                {todosData?.summary.aiPending ? `（含 AI ${todosData.summary.aiPending} 项）` : ""}
                · 已完成 {todosData?.summary.done ?? 0}
              </p>

              {confirmTodo ? (
                <section className="banner banner--warning" style={{ marginTop: "0.75rem" }}>
                  <p style={{ marginBottom: "0.5rem" }}>
                    确认启动系统迭代 AI 执行：<br />
                    <strong>{confirmTodo.text}</strong>
                  </p>
                  <div className="chain-item__actions">
                    <button className="button button--secondary" onClick={() => setConfirmTodo(null)} type="button">取消</button>
                    <button className="button button--primary" disabled={todoBusy === confirmTodo.id} onClick={() => { void handleExecuteTodo(confirmTodo); }} type="button">确认执行</button>
                  </div>
                </section>
              ) : null}

              {/* 待执行代办 */}
              <div style={{ marginTop: "0.75rem" }}>
                {pendingTodos.map((todo) => (
                  <div className="detail-block" key={todo.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", padding: "0.5rem 0" }}>
                    <span className="muted" style={{ minWidth: "1.5rem" }}>○</span>
                    <div style={{ flex: 1 }}>
                      <div>
                        {todo.tag ? <span className={`badge badge--${todo.tag === "AI" ? "active" : "idle"}`}>{todo.tag}</span> : null}
                        <span style={{ marginLeft: todo.tag ? "0.5rem" : 0 }}>{todo.text}</span>
                      </div>
                      <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
                        来源：{todo.sourceFile}:{todo.line}
                      </p>
                      <div className="chain-item__actions" style={{ marginTop: "0.25rem" }}>
                        {todo.tag === "AI" ? (
                          <button
                            className="button button--primary button--small"
                            disabled={todoBusy === todo.id}
                            onClick={() => setConfirmTodo(todo)}
                            type="button"
                          >
                            开始执行
                          </button>
                        ) : null}
                        <button
                          className="button button--secondary button--small"
                          disabled={todoBusy === todo.id}
                          onClick={() => { void handleCompleteTodo(todo); }}
                          type="button"
                        >
                          标记完成
                        </button>
                        <button
                          className="button button--secondary button--small"
                          onClick={() => openDecisionRecord(todo.sourceFile)}
                          type="button"
                        >
                          打开决策记录
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 已完成代办：折叠 */}
              {doneTodos.length > 0 ? (
                <div style={{ marginTop: "0.5rem" }}>
                  <button
                    className="button button--secondary button--small"
                    onClick={() => setShowDoneTodos((prev) => !prev)}
                    type="button"
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    {showDoneTodos ? "▲ 收起已完成" : `▼ 展开已完成 (${doneTodos.length} 项)`}
                  </button>
                  {showDoneTodos ? (
                    <div style={{ marginTop: "0.5rem", opacity: 0.75 }}>
                      {doneTodos.map((todo) => (
                        <div className="detail-block" key={todo.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.25rem 0" }}>
                          <span className="muted" style={{ minWidth: "1.5rem" }}>✓</span>
                          <span style={{ textDecoration: "line-through" }}>
                            {todo.tag ? `[${todo.tag}] ` : ""}{todo.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </WorkbenchLayout>
  );
}
