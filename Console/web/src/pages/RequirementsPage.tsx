import { useEffect, useState } from "react";

import { createRequirement, decomposeRequirement, deleteRequirement, fetchRequirements, type RequirementSummary } from "../api/requirements";
import { WorkbenchLayout } from "../components/layout/WorkbenchLayout";

interface RequirementsPageProps {
  onOpenRequirement: (id: string) => void;
  onOpenSystem: () => void;
}

const POLL_INTERVAL_MS = 5000;

export function RequirementsPage({ onOpenRequirement, onOpenSystem }: RequirementsPageProps) {
  const [requirements, setRequirements] = useState<RequirementSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyRequirementId, setBusyRequirementId] = useState<string | null>(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createBackground, setCreateBackground] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timerId: number | undefined;

    const load = async () => {
      try {
        const nextRequirements = await fetchRequirements();
        if (cancelled) {
          return;
        }
        setRequirements(nextRequirements);
        setError(null);
        setLoading(false);
      } catch (caughtError) {
        if (cancelled) {
          return;
        }
        setError(caughtError instanceof Error ? caughtError.message : "加载需求失败");
        setLoading(false);
      }
    };

    void load();
    timerId = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timerId !== undefined) {
        window.clearInterval(timerId);
      }
    };
  }, []);

  return (
    <WorkbenchLayout
      title="需求"
      subtitle="按需求查看链状态和跨仓库开发进度"
      activeNav="requirements"
      onOpenRequirements={() => undefined}
      onOpenSystem={onOpenSystem}
    >
      {showCreateSheet ? (
        <div className="sheet-backdrop">
          <button aria-label="关闭新建需求面板" className="sheet-backdrop__scrim" onClick={() => !creating && setShowCreateSheet(false)} type="button" />
          <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="create-requirement-title">
            <div className="sheet__header">
              <div>
                <h2 id="create-requirement-title">新建需求</h2>
                <p className="muted">先建需求卡片，后续再做 AI 拆解和接口约定。</p>
              </div>
              <button className="button button--secondary" disabled={creating} onClick={() => setShowCreateSheet(false)} type="button">关闭</button>
            </div>

            <label className="field">
              <span className="field__label">需求标题</span>
              <input className="field__input" onChange={(event) => setCreateTitle(event.target.value)} placeholder="例如：合同收费统计前端改造" value={createTitle} />
            </label>

            <label className="field">
              <span className="field__label">背景</span>
              <textarea className="field__textarea" onChange={(event) => setCreateBackground(event.target.value)} placeholder="为什么要做、当前痛点、预期目标" value={createBackground} />
            </label>

            <div className="sheet__actions">
              <button className="button button--secondary" disabled={creating} onClick={() => setShowCreateSheet(false)} type="button">取消</button>
              <button
                className="button button--primary"
                disabled={creating || !createTitle.trim()}
                onClick={async () => {
                  setCreating(true);
                  try {
                    await createRequirement(createTitle.trim(), createBackground.trim());
                    const next = await fetchRequirements();
                    setRequirements(next);
                    setCreateTitle("");
                    setCreateBackground("");
                    setShowCreateSheet(false);
                    setError(null);
                  } catch (caughtError) {
                    setError(caughtError instanceof Error ? caughtError.message : "新建需求失败");
                  } finally {
                    setCreating(false);
                  }
                }}
                type="button"
              >
                创建
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {error ? <section className="banner banner--error">{error}</section> : null}
      <section className="panel-stack">
        {/* 统计摘要 */}
        {!loading && requirements.length > 0 ? (
          <section className="panel">
            <div className="stats-bar">
              <div className="stat-item">
                <span className="stat-item__value">{requirements.length}</span>
                <span className="stat-item__label">总需求</span>
              </div>
              <div className="stat-item">
                <span className="stat-item__value" style={{ color: "var(--brand)" }}>{requirements.filter((r) => r.status === "active").length}</span>
                <span className="stat-item__label">进行中</span>
              </div>
              <div className="stat-item">
                <span className="stat-item__value" style={{ color: "var(--success)" }}>{requirements.filter((r) => r.status === "done").length}</span>
                <span className="stat-item__label">已完成</span>
              </div>
              <div className="stat-item">
                <span className="stat-item__value" style={{ color: "var(--done)" }}>{requirements.reduce((sum, r) => sum + r.chainCount, 0)}</span>
                <span className="stat-item__label">业务链</span>
              </div>
            </div>
          </section>
        ) : null}

        <section className="panel">
          <div className="panel__title-row">
            <div>
              <h2>需求列表</h2>
              <p className="muted">新建需求、查看进度、按需触发 AI 拆解。</p>
            </div>
            <button className="button button--primary" onClick={() => setShowCreateSheet(true)} type="button">+ 新建需求</button>
          </div>
        </section>

        {loading ? (
          <section className="panel">
            <div className="empty-state">
              <div className="empty-state__icon">⏳</div>
              <p>正在加载需求列表...</p>
            </div>
          </section>
        ) : null}

        {!loading && requirements.length === 0 ? (
          <section className="panel">
            <div className="empty-state">
              <div className="empty-state__icon">📝</div>
              <p>暂无需求</p>
              <p className="muted">点击上方「新建需求」开始创建</p>
            </div>
          </section>
        ) : null}

        {requirements.map((requirement) => (
          <section
            className={[
              "requirement-card",
              requirement.status === "done" ? "requirement-card--done" : "",
              requirement.backendChainCount > 0 && requirement.frontendChainCount === 0 ? "requirement-card--backend" : "",
              requirement.frontendChainCount > 0 && requirement.backendChainCount === 0 ? "requirement-card--frontend" : "",
            ].filter(Boolean).join(" ")}
            data-requirement-id={requirement.id}
            data-testid="requirement-card"
            key={requirement.id}
          >
            <div className="requirement-card__header">
              <div>
                <h2>{requirement.title}</h2>
                <p className="muted">{requirement.id}</p>
              </div>
              <span className={`badge badge--${requirement.status}`}>{formatRequirementStatus(requirement.status)}</span>
            </div>
            <div className="requirement-card__meta">
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand)", display: "inline-block" }} />
                {requirement.chainCount} 条链
              </span>
              {requirement.backendChainCount > 0 ? <span style={{ color: "var(--backend-accent)" }}>后端 {requirement.backendChainCount}</span> : null}
              {requirement.frontendChainCount > 0 ? <span style={{ color: "var(--frontend-accent)" }}>前端 {requirement.frontendChainCount}</span> : null}
              <span>完成 {requirement.completedChainCount}/{requirement.chainCount}</span>
              <span className="muted">更新于 {formatTime(requirement.updatedAt)}</span>
            </div>
            <div className="progress">
              <div className="progress__bar" style={{ width: `${requirement.progressPercent}%` }} />
            </div>
            {requirement.status === "done" ? <p className="requirement-card__footnote">该需求已完成收口，仅保留查看与归档前清理操作。</p> : null}
            <div className="requirement-card__actions">
              <button className="button button--primary" onClick={() => onOpenRequirement(requirement.id)} type="button">查看详情</button>
              {requirement.chainCount <= 1 ? (
                <button
                  className="button button--secondary"
                  disabled={busyRequirementId === requirement.id}
                  onClick={async () => {
                    setBusyRequirementId(requirement.id);
                    try {
                      await decomposeRequirement(requirement.id);
                      const next = await fetchRequirements();
                      setRequirements(next);
                    } catch (caughtError) {
                      setError(caughtError instanceof Error ? caughtError.message : "AI 拆解失败");
                    } finally {
                      setBusyRequirementId(null);
                    }
                  }}
                  type="button"
                >
                  AI 拆解
                </button>
              ) : null}
              <button
                className="button button--danger"
                disabled={busyRequirementId === requirement.id}
                onClick={async () => {
                  if (!window.confirm(`确认删除需求“${requirement.title}”？`)) {
                    return;
                  }

                  setBusyRequirementId(requirement.id);
                  try {
                    await deleteRequirement(requirement.id);
                    const next = await fetchRequirements();
                    setRequirements(next);
                    setError(null);
                  } catch (caughtError) {
                    setError(caughtError instanceof Error ? caughtError.message : "删除需求失败");
                  } finally {
                    setBusyRequirementId(null);
                  }
                }}
                type="button"
              >
                删除
              </button>
            </div>
          </section>
        ))}
      </section>
    </WorkbenchLayout>
  );
}

function formatRequirementStatus(status: string) {
  return {
    active: "进行中",
    done: "已完成",
    idle: "待开始",
    archived: "已归档"
  }[status] ?? status;
}

function formatTime(value: string | null) {
  return value ? value.replace("T", " ").slice(0, 16) : "-";
}
