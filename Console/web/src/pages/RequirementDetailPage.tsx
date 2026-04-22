import { useEffect, useState } from "react";

import { createRequirementChain, decomposeRequirement, fetchHealth, fetchRequirementChainAttach, fetchRequirementDetail, fetchSessions, generateRequirementCodeList, generateRequirementInterface, markRequirementChainDone, openRequirementChainAttach, runLifecycle, startRequirementChain, type RequirementDetail, type SessionRecord } from "../api/requirements";
import { WorkbenchLayout } from "../components/layout/WorkbenchLayout";

interface RequirementDetailPageProps {
  requirementId: string;
  onBack: () => void;
  onOpenSystem: () => void;
}

export function RequirementDetailPage({ requirementId, onBack, onOpenSystem }: RequirementDetailPageProps) {
  const [detail, setDetail] = useState<RequirementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyChainId, setBusyChainId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [showCreateChainSheet, setShowCreateChainSheet] = useState(false);
  const [chainTitle, setChainTitle] = useState("");
  const [chainType, setChainType] = useState<"backend" | "frontend">("backend");
  const [chainRepoKey, setChainRepoKey] = useState<"backend" | "frontend">("backend");
  const [chainSummary, setChainSummary] = useState("");
  const [showCompletedChains, setShowCompletedChains] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);

  const load = async () => {
    try {
      const [nextDetail, nextSessions, nextHealth] = await Promise.all([
        fetchRequirementDetail(requirementId),
        fetchSessions(),
        fetchHealth()
      ]);
      setDetail(nextDetail);
      setSessions(nextSessions);
      setPlatform(nextHealth.platform ?? null);
      setError(null);
      setLoading(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载需求详情失败");
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [requirementId]);

  const handleStart = async (chainId: string) => {
    setBusyChainId(chainId);
    try {
      await startRequirementChain(requirementId, chainId);
      await load();
      setError(null);
      setNotice(`已启动业务链 ${chainId}。`);
    } finally {
      setBusyChainId(null);
    }
  };

  const handleDone = async (chainId: string) => {
    setBusyChainId(chainId);
    try {
      await markRequirementChainDone(requirementId, chainId);
      await load();
      setError(null);
      setNotice(`已将业务链 ${chainId} 标记为完成。`);
    } finally {
      setBusyChainId(null);
    }
  };

  const handleLifecycle = async (apiPath: string, successMessage: string, options?: { reload?: boolean }) => {
    try {
      setBusyAction(apiPath);
      await runLifecycle(apiPath);
      if (options?.reload) {
        await load();
      }
      setError(null);
      setNotice(successMessage);
    } catch (caughtError) {
      setNotice(null);
      setError(caughtError instanceof Error ? caughtError.message : "会话动作执行失败");
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

  const hasDecomposedChains = (detail?.chains.filter((chain) => chain.id !== "Defect").length ?? 0) > 0;
  const sourceMainControlSession = `main-control-${requirementId}`;
  const sourceMainControlRunning = sessions.some((session) => session.name === sourceMainControlSession);
  const orderedChains = [...(detail?.chains ?? [])].sort(compareChainsForDisplay);

  return (
    <WorkbenchLayout
      title={detail?.title ?? "需求详情"}
      subtitle={requirementId}
      activeNav="requirements"
      onOpenRequirements={onBack}
      onOpenSystem={onOpenSystem}
      actions={
        <>
          <button className="button button--secondary" onClick={onBack} type="button">返回列表</button>
          {!hasDecomposedChains ? (
            <button
              className="button button--secondary"
              disabled={busyAction === "decompose"}
              onClick={async () => {
                setBusyAction("decompose");
                try {
                  await decomposeRequirement(requirementId);
                  await load();
                } catch (caughtError) {
                  setError(caughtError instanceof Error ? caughtError.message : "AI 拆解失败");
                } finally {
                  setBusyAction(null);
                }
              }}
              type="button"
            >
              AI 拆解
            </button>
          ) : null}
          <button className="button button--secondary" onClick={() => setShowCreateChainSheet(true)} type="button">新增业务链</button>
        </>
      }
    >
      {showCreateChainSheet ? (
        <div className="sheet-backdrop">
          <button aria-label="关闭新增业务链面板" className="sheet-backdrop__scrim" onClick={() => setShowCreateChainSheet(false)} type="button" />
          <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="create-chain-title">
            <div className="sheet__header">
              <div>
                <h2 id="create-chain-title">新增业务链</h2>
                <p className="muted">手动把新链绑定到当前需求，后续流程都围绕该需求推进。</p>
              </div>
              <button className="button button--secondary" onClick={() => setShowCreateChainSheet(false)} type="button">关闭</button>
            </div>

            <label className="field">
              <span className="field__label">链标题</span>
              <input className="field__input" onChange={(event) => setChainTitle(event.target.value)} placeholder="例如：合同收费统计前端页面" value={chainTitle} />
            </label>

            <label className="field">
              <span className="field__label">链类型</span>
              <select className="field__input" onChange={(event) => setChainType(event.target.value as "backend" | "frontend")} value={chainType}>
                <option value="backend">后端</option>
                <option value="frontend">前端</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">代码仓库</span>
              <select className="field__input" onChange={(event) => setChainRepoKey(event.target.value as "backend" | "frontend")} value={chainRepoKey}>
                <option value="backend">backend (~/ff)</option>
                <option value="frontend">frontend (~/frontend/your-frontend-repo)</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">摘要</span>
              <textarea className="field__textarea field__textarea--compact" onChange={(event) => setChainSummary(event.target.value)} placeholder="这条链的目标、边界或等待条件" value={chainSummary} />
            </label>

            <div className="sheet__actions">
              <button className="button button--secondary" onClick={() => setShowCreateChainSheet(false)} type="button">取消</button>
              <button
                className="button button--primary"
                disabled={busyAction === "create-chain" || !chainTitle.trim()}
                onClick={async () => {
                  setBusyAction("create-chain");
                  try {
                    await createRequirementChain(requirementId, {
                      title: chainTitle.trim(),
                      type: chainType,
                      repoKey: chainRepoKey,
                      summary: chainSummary.trim()
                    });
                    setChainTitle("");
                    setChainSummary("");
                    setChainType("backend");
                    setChainRepoKey("backend");
                    setShowCreateChainSheet(false);
                    await load();
                    setError(null);
                    setNotice(`已新增业务链 ${chainTitle.trim()}。`);
                  } catch (caughtError) {
                    setNotice(null);
                    setError(caughtError instanceof Error ? caughtError.message : "新增业务链失败");
                  } finally {
                    setBusyAction(null);
                  }
                }}
                type="button"
              >
                创建业务链
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {notice ? <section className="banner banner--success">{notice}</section> : null}
      {error ? <section className="banner banner--error">{error}</section> : null}
      {loading ? <section className="panel">正在加载需求详情...</section> : null}
      {detail ? (
        <div className="detail-grid">
          <section className="panel">
            <h2>需求背景</h2>
            <pre className="detail-text">{detail.background || "暂无背景摘要"}</pre>
            <div className="detail-block">
              <h3>需求子主控</h3>
              <p className="muted">状态：{sourceMainControlRunning ? "在线" : "离线"}</p>
              <div className="chain-item__actions">
                <button className="button button--secondary" disabled={busyAction !== null} onClick={() => { void handleLifecycle(`/api/requirements/${encodeURIComponent(requirementId)}/main-control/start`, "已启动需求子主控。", { reload: true }); }} type="button">启动</button>
                <button className="button button--secondary" disabled={busyAction !== null} onClick={() => { void handleLifecycle(`/api/requirements/${encodeURIComponent(requirementId)}/main-control/resume`, "已向需求子主控注入恢复上下文。"); }} type="button">恢复</button>
                <button className="button button--secondary" disabled={busyAction !== null} onClick={() => { void handleLifecycle(`/api/requirements/${encodeURIComponent(requirementId)}/main-control/rotate`, "已轮换需求子主控上下文。"); }} type="button">轮换</button>
                <button className="button button--primary" disabled={busyAction !== null} onClick={() => { void handleAttach(`/api/requirements/${encodeURIComponent(requirementId)}/main-control/attach/open`, "进入需求子主控"); }} type="button">{platform === "wsl2" ? "复制命令" : "进入"}</button>
              </div>
            </div>
            <div className="detail-block">
              <div className="detail-section-header">
                <h3>接口文档</h3>
                <span className={detail.interfaceDocPath ? "badge badge--done" : "badge badge--idle"}>{detail.interfaceDocPath ? "已生成" : "未生成"}</span>
              </div>
              <p className="muted">{detail.interfaceDocPath ?? "尚未生成 interface.md"}</p>
              <pre className="detail-text">{detail.interfaceExcerpt || "暂无接口约定内容"}</pre>
              <div>
                <button
                  className="button button--secondary"
                  disabled={busyAction === "interface"}
                  onClick={async () => {
                    setBusyAction("interface");
                    try {
                      await generateRequirementInterface(requirementId);
                      await load();
                      setError(null);
                      setNotice("已生成接口约定并刷新需求详情。");
                    } catch (caughtError) {
                      setNotice(null);
                      setError(caughtError instanceof Error ? caughtError.message : "生成接口约定失败");
                    } finally {
                      setBusyAction(null);
                    }
                  }}
                  type="button"
                >
                  生成接口文档
                </button>
              </div>
              {detail.requirementCodeListPath ? (
                <div className="detail-block detail-block--highlight">
                  <div className="detail-section-header">
                    <h3>需求代码文件清单</h3>
                    <span className={detail.requirementCodeListGenerated ? "badge badge--done" : "badge badge--idle"}>{detail.requirementCodeListGenerated ? "已生成" : "未生成"}</span>
                  </div>
                  <p className="muted">当前需求维度的纯代码文件路径清单，适合提供给 AI 做跨分支合并、变更核对和影响分析。</p>
                  <p className="muted">{detail.requirementCodeListPath}</p>
                  <div className="chain-item__actions">
                    <button
                      className="button button--primary"
                      disabled={busyAction === "codelist"}
                      onClick={async () => {
                        setBusyAction("codelist");
                        try {
                          await generateRequirementCodeList(requirementId);
                          await load();
                          setError(null);
                          setNotice("已生成当前需求的代码文件清单。");
                        } catch (caughtError) {
                          setNotice(null);
                          setError(caughtError instanceof Error ? caughtError.message : "生成代码文件清单失败");
                        } finally {
                          setBusyAction(null);
                        }
                      }}
                      type="button"
                    >
                      生成代码文件清单
                    </button>
                    <button
                      className="button button--secondary"
                      disabled={!detail.requirementCodeListGenerated}
                      onClick={() => {
                        openObsidianPath(detail.requirementCodeListPath!);
                        setError(null);
                        setNotice("已尝试打开需求代码文件清单。");
                      }}
                      type="button"
                    >
                      打开需求代码文件清单
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel__title-row">
              <h2>开发进度</h2>
              <span className={`badge badge--${detail.status}`}>{detail.status}</span>
            </div>
            <div className="chain-list">
              {/* 进行中链：始终显示 */}
              {orderedChains.filter((c) => !isCompletedChain(c)).map((chain) => (
                        <ChainCard chain={chain} requirementId={requirementId} busyChainId={busyChainId} busyAction={busyAction} platform={platform} handleStart={handleStart} handleDone={handleDone} handleLifecycle={handleLifecycle} onShowNotice={setNotice} key={chain.id} />
              ))}

              {/* 已完成链：可折叠 */}
              {orderedChains.filter((c) => isCompletedChain(c)).length > 0 ? (
                <div style={{ marginTop: "0.5rem" }}>
                  <button
                    className="button button--secondary button--small"
                    onClick={() => setShowCompletedChains((prev) => !prev)}
                    type="button"
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    {showCompletedChains ? "▲ 收起已完成" : `▼ 展开已完成 (${orderedChains.filter((c) => isCompletedChain(c)).length} 条)`}
                  </button>
                  {showCompletedChains ? (
                    <div style={{ marginTop: "0.5rem", opacity: 0.85 }}>
                      {orderedChains.filter((c) => isCompletedChain(c)).map((chain) => (
                <ChainCard chain={chain} requirementId={requirementId} busyChainId={busyChainId} busyAction={busyAction} platform={platform} handleStart={handleStart} handleDone={handleDone} handleLifecycle={handleLifecycle} onShowNotice={setNotice} key={chain.id} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </WorkbenchLayout>
  );
}

function formatRepoLabel(repoKey: string) {
  return {
    backend: "backend (~/ff)",
    frontend: "frontend (~/frontend/your-frontend-repo)"
  }[repoKey] ?? repoKey;
}

interface ChainCardProps {
  chain: RequirementDetail["chains"][number];
  requirementId: string;
  busyChainId: string | null;
  busyAction: string | null;
  platform: string | null;
  handleStart: (chainId: string) => void;
  handleDone: (chainId: string) => void;
  handleLifecycle: (apiPath: string, successMessage: string, options?: { reload?: boolean }) => Promise<void>;
  onShowNotice: (message: string) => void;
}

function ChainCard({ chain, requirementId, busyChainId, busyAction, platform, handleStart, handleDone, handleLifecycle, onShowNotice }: ChainCardProps) {
  return (
    <section className={isCompletedChain(chain) ? `chain-item chain-item--${chain.type ?? "backend"} chain-item--done` : `chain-item chain-item--${chain.type ?? "backend"}`} data-chain-completed={isCompletedChain(chain) ? "true" : "false"} data-chain-id={chain.id} data-chain-stage={chain.stage} data-chain-status={chain.status} data-testid="chain-item" key={chain.id}>
      <div className="chain-item__header">
        <div>
          <h3>{chain.titleZh}</h3>
          <p className="muted">{chain.id}</p>
        </div>
        <span className={`badge badge--${chain.status}`}>{chain.stage}</span>
      </div>
      <div className="chain-item__meta">
        <span>{chain.type === "frontend" ? "[F] 前端" : "[B] 后端"}</span>
        <span>代码仓库: {formatRepoLabel(chain.repoKey)}</span>
        <span>分支: {chain.branch ?? "未分配"}</span>
        <span>会话: {chain.session ?? "未创建"}</span>
        <span>{chain.sessionRunning ? "session 运行中" : "session 未运行"}</span>
      </div>
      <p className="chain-item__summary">{chain.summary || "暂无摘要"}</p>
      {isCompletedChain(chain) ? <p className="chain-item__footnote">该业务链已收口完成，默认不再提供恢复、轮换和完成动作。</p> : null}
      <div className="chain-item__actions">
        {!isCompletedChain(chain) ? (
          <button className="button button--primary" disabled={busyChainId === chain.id} onClick={() => handleStart(chain.id)} type="button">开启</button>
        ) : null}
        {!isCompletedChain(chain) ? (
          <button className="button button--secondary" disabled={busyAction !== null || busyChainId === chain.id} onClick={async () => { handleLifecycle(`/api/requirements/${encodeURIComponent(requirementId)}/chains/${encodeURIComponent(chain.id)}/resume`, `已向 ${chain.titleZh} 注入恢复上下文。`); }} type="button">恢复</button>
        ) : null}
        {!isCompletedChain(chain) ? (
          <button className="button button--secondary" disabled={busyAction !== null || busyChainId === chain.id} onClick={async () => { handleLifecycle(`/api/requirements/${encodeURIComponent(requirementId)}/chains/${encodeURIComponent(chain.id)}/rotate`, `已轮换 ${chain.titleZh} 的上下文。`); }} type="button">轮换</button>
        ) : null}
        {!isCompletedChain(chain) ? (
          <button
            className="button button--secondary"
            disabled={!chain.session}
            onClick={async () => {
              try {
                if (platform === "wsl2") {
                  const result = await fetchRequirementChainAttach(requirementId, chain.id);
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(result.command);
                    onShowNotice(`已复制 attach 命令：${result.command}，请在 Windows Terminal 中粘贴执行。`);
                  }
                } else if (chain.sessionRunning) {
                  await openRequirementChainAttach(requirementId, chain.id);
                } else {
                  const result = await fetchRequirementChainAttach(requirementId, chain.id);
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(result.command);
                  }
                }
              } catch (caughtError) {
                console.error(caughtError);
              }
            }}
            type="button"
          >
            {platform === "wsl2" ? "复制命令" : "进入"}
          </button>
        ) : null}
        {!isCompletedChain(chain) ? (
          <button className="button button--secondary" disabled={busyChainId === chain.id} onClick={() => handleDone(chain.id)} type="button">完成</button>
        ) : null}
        {isCompletedChain(chain) ? (
          <button
            className="button button--secondary"
            onClick={() => {
              openObsidianPath(`Projects/飞枢系统/chain-assets/地图/${requirementId}/${chain.id}.md`);
            }}
            type="button"
          >
            打开地图
          </button>
        ) : null}
      </div>
    </section>
  );
}

function isCompletedChain(chain: RequirementDetail["chains"][number]) {
  return chain.stage === "S5" || chain.status === "done";
}

function compareChainsForDisplay(
  left: RequirementDetail["chains"][number],
  right: RequirementDetail["chains"][number]
) {
  const leftDone = isCompletedChain(left);
  const rightDone = isCompletedChain(right);
  if (leftDone !== rightDone) {
    return leftDone ? 1 : -1;
  }

  if (left.id === "Defect" && right.id !== "Defect") {
    return 1;
  }
  if (right.id === "Defect" && left.id !== "Defect") {
    return -1;
  }

  return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") || left.titleZh.localeCompare(right.titleZh, "zh-CN");
}

function openObsidianPath(path: string) {
  const url = `obsidian://open?vault=PasObsidian&file=${encodeURIComponent(path)}`;
  window.location.href = url;
}
