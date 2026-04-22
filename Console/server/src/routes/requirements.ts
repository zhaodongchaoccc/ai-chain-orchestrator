import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { FastifyInstance } from "fastify";

import { listTmuxSessions } from "../lib/tmux-utils";
import { addRequirementChain, deleteRequirement, findRequirement, getRequirementDetail, listRequirementSummaries, listSessionViews, loadProjectStatus, replaceRequirementChains, updateChainStatus, writeInterfaceDoc, type ProjectChainRecord } from "../services/project-status";
import { toWorkspaceRelativeWorktreePath } from "../services/workspace-registry";
import type { ffPaths } from "../config";

const execFileAsync = promisify(execFile);

export function registerRequirementRoutes(server: FastifyInstance, paths: typeof ffPaths) {
  server.post<{ Body: { title?: string; background?: string } }>("/api/requirements", async (request, reply) => {
    const title = request.body?.title?.trim();
    const background = request.body?.background?.trim() ?? "";
    if (!title) {
      return reply.status(400).send({ message: "Requirement title is required" });
    }

    const projectStatusResult = await loadProjectStatus(paths.shareRoot);
    const sourceId = buildRequirementId(title);
    if ((projectStatusResult.value.requirements ?? []).some((item) => item.id === sourceId)) {
      return reply.status(409).send({ message: `Requirement already exists: ${sourceId}` });
    }

    const docRelativePath = `Projects/飞枢系统/demands/${sourceId}/${title}.md`;
    const docAbsoluteDir = path.join(paths.projectRoot, "demands", sourceId);
    const docAbsolutePath = path.join(docAbsoluteDir, `${title}.md`);
    await mkdir(docAbsoluteDir, { recursive: true });
    await writeFile(docAbsolutePath, buildRequirementTemplate(title, background), "utf8");

    const nextRequirement = {
      id: sourceId,
      title,
      status: "idle",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      docPath: docRelativePath,
      worktreePath: toWorkspaceRelativeWorktreePath(paths.projectRoot, path.join(process.env.FF_WORKTREES_ROOT ?? path.join(process.env.HOME ?? "", "ff-worktrees"), sourceId)),
      kind: "single" as const,
      draftIncomplete: true,
      chains: [buildDefectChain(sourceId)]
    };

    const nextStatus = {
      ...projectStatusResult.value,
      requirements: [...(projectStatusResult.value.requirements ?? []), nextRequirement]
    };
    await writeFile(path.join(paths.shareRoot, "project-status.json"), `${JSON.stringify(nextStatus, null, 2)}\n`, "utf8");

    return {
      success: true,
      requirement: nextRequirement
    };
  });

  server.get("/api/requirements", async () => {
    const [projectStatusResult, tmuxSessions] = await Promise.all([
      loadProjectStatus(paths.shareRoot),
      safeListSessions()
    ]);

    return {
      requirements: listRequirementSummaries(projectStatusResult.value, tmuxSessions)
    };
  });

  server.get<{ Params: { id: string } }>("/api/requirements/:id", async (request, reply) => {
    const tmuxSessions = await safeListSessions();
    const detail = await getRequirementDetail(paths.projectRoot, paths.shareRoot, request.params.id, tmuxSessions);
    if (!detail) {
      return reply.status(404).send({ message: `Unknown requirement id: ${request.params.id}` });
    }

    return detail;
  });

  server.delete<{ Params: { id: string } }>("/api/requirements/:id", async (request, reply) => {
    const projectStatusResult = await loadProjectStatus(paths.shareRoot);
    const requirement = findRequirement(projectStatusResult.value, request.params.id);
    if (!requirement) {
      return reply.status(404).send({ message: `Unknown requirement id: ${request.params.id}` });
    }

    const result = await deleteRequirement(paths.projectRoot, paths.shareRoot, request.params.id);
    return { success: true, archivePath: result.archivePath };
  });

  server.post<{ Params: { id: string }; Body: { title?: string; type?: string; repoKey?: string; summary?: string } }>("/api/requirements/:id/chains", async (request, reply) => {
    const projectStatusResult = await loadProjectStatus(paths.shareRoot);
    const requirement = findRequirement(projectStatusResult.value, request.params.id);
    if (!requirement) {
      return reply.status(404).send({ message: `Unknown requirement id: ${request.params.id}` });
    }

    const title = request.body?.title?.trim();
    if (!title) {
      return reply.status(400).send({ message: "Chain title is required" });
    }

    const type = request.body?.type === "frontend" ? "frontend" : "backend";
    const repoKey = request.body?.repoKey?.trim() || (type === "frontend" ? "frontend" : "backend");
    const chainId = buildChainId(title, type);
    const chain: ProjectChainRecord = {
      id: chainId,
      titleZh: title,
      type,
      repoKey,
      branch: `feature/${request.params.id}-${type}`,
      status: type === "frontend" ? "idle" : "active",
      stage: type === "frontend" ? "PENDING" : "S1",
      session: `chain-${request.params.id}-${chainId}`,
      updatedAt: new Date().toISOString(),
      summary: request.body?.summary?.trim() || (type === "frontend" ? "手动新增前端链，等待接口约定后推进。" : "手动新增后端链，等待定位入口和最小改动方案。"),
      blocked: false
    };

    await addRequirementChain(paths.shareRoot, request.params.id, chain);
    return { success: true, chain };
  });

  server.post<{ Params: { id: string; chainId: string } }>("/api/requirements/:id/chains/:chainId/start", async (request, reply) => {
    await execFileAsync("bash", [path.join(paths.playbooksRoot, "start-chain-session.sh"), request.params.chainId, request.params.id], {
      cwd: paths.projectRoot,
      env: process.env
    });

    return { success: true };
  });

  server.get<{ Params: { id: string; chainId: string } }>("/api/requirements/:id/chains/:chainId/attach", async (request, reply) => {
    const detail = await getRequirementDetail(paths.projectRoot, paths.shareRoot, request.params.id, await safeListSessions());
    const chain = detail?.chains.find((item) => item.id === request.params.chainId) ?? null;

    if (!chain || !chain.session) {
      return reply.status(404).send({ message: `Unknown chain id: ${request.params.chainId}` });
    }

    return {
      command: `tmux attach -t ${chain.session}`,
      session: chain.session,
      running: chain.sessionRunning
    };
  });

  server.post<{ Params: { id: string; chainId: string } }>("/api/requirements/:id/chains/:chainId/attach/open", async (request, reply) => {
    const detail = await getRequirementDetail(paths.projectRoot, paths.shareRoot, request.params.id, await safeListSessions());
    const chain = detail?.chains.find((item) => item.id === request.params.chainId) ?? null;

    if (!chain || !chain.session) {
      return reply.status(404).send({ message: `Unknown chain id: ${request.params.chainId}` });
    }

    const command = `tmux attach -t ${chain.session}`;
    await execFileAsync("osascript", [
      "-e",
      'tell application "Terminal" to activate',
      "-e",
      `tell application "Terminal" to do script "${command}"`
    ], { cwd: paths.projectRoot, env: process.env });

    return {
      success: true,
      command,
      session: chain.session
    };
  });

  server.post<{ Params: { id: string; chainId: string }; Body: { summary?: string } }>("/api/requirements/:id/chains/:chainId/done", async (request) => {
    const updatedAt = new Date().toISOString();
    await updateChainStatus(paths.shareRoot, request.params.id, request.params.chainId, {
      status: "done",
      stage: "S5",
      updatedAt,
      summary: request.body?.summary,
      blocked: false
    });

    return { success: true, updatedAt };
  });

  server.post<{ Params: { id: string } }>("/api/requirements/:id/decompose", async (request, reply) => {
    const projectStatusResult = await loadProjectStatus(paths.shareRoot);
    const requirement = findRequirement(projectStatusResult.value, request.params.id);
    if (!requirement) {
      return reply.status(404).send({ message: `Unknown requirement id: ${request.params.id}` });
    }

    const docText = await readProjectDoc(paths.projectRoot, requirement.docPath);
    const titleSeed = slugify(requirement.title || request.params.id);
    const nextChains = buildSuggestedChains(requirement, docText, titleSeed);
    await replaceRequirementChains(paths.shareRoot, request.params.id, nextChains);

    return {
      success: true,
      chains: nextChains,
      message: `已为 ${request.params.id} 生成 ${nextChains.length} 条建议链。`
    };
  });

  server.post<{ Params: { id: string } }>("/api/requirements/:id/interface-gen", async (request, reply) => {
    const projectStatusResult = await loadProjectStatus(paths.shareRoot);
    const requirement = findRequirement(projectStatusResult.value, request.params.id);
    if (!requirement) {
      return reply.status(404).send({ message: `Unknown requirement id: ${request.params.id}` });
    }

    const detail = await getRequirementDetail(paths.projectRoot, paths.shareRoot, request.params.id, await safeListSessions());
    if (!detail) {
      return reply.status(404).send({ message: `Unknown requirement id: ${request.params.id}` });
    }

    const content = buildInterfaceDoc(detail);
    const outputPath = await writeInterfaceDoc(paths.projectRoot, requirement.docPath, content);

    return {
      success: true,
      path: outputPath
    };
  });

  server.post<{ Params: { id: string } }>("/api/requirements/:id/codelist-gen", async (request, reply) => {
    const projectStatusResult = await loadProjectStatus(paths.shareRoot);
    const requirement = findRequirement(projectStatusResult.value, request.params.id);
    if (!requirement) {
      return reply.status(404).send({ message: `Unknown requirement id: ${request.params.id}` });
    }

    const outputPath = await generateRequirementCodeList(paths.projectRoot, requirement);
    return {
      success: true,
      path: outputPath
    };
  });
}

export function registerSessionRoutes(server: FastifyInstance) {
  server.get("/api/sessions", async () => {
    const sessions = await safeListSessions();
    return {
      sessions: listSessionViews(sessions)
    };
  });
}

async function safeListSessions() {
  try {
    return await listTmuxSessions();
  } catch {
    return [];
  }
}

async function readProjectDoc(projectRoot: string, docPath: string) {
  const normalized = docPath.replace(/\\/g, "/");
  const relative = normalized.startsWith("Projects/飞枢系统/") ? normalized.slice("Projects/飞枢系统/".length) : normalized;
  try {
    return await readFile(path.join(projectRoot, relative), "utf8");
  } catch {
    return "";
  }
}

function slugify(value: string) {
  const ascii = value
    .replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");

  if (!ascii) {
    return "Requirement";
  }

  return ascii
    .replace(/[\u4e00-\u9fa5]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1).toLowerCase())
    .join("") || "Requirement";
}

function buildSuggestedChains(requirement: { id: string; title: string; chains?: ProjectChainRecord[] }, docText: string, titleSeed: string): ProjectChainRecord[] {
  const sourceId = requirement.id;
  const existing = Array.isArray(requirement.chains) ? requirement.chains.filter((chain) => chain.id !== "Defect") : [];
  if (existing.length > 0) {
    return [...existing, buildDefectChain(sourceId)];
  }

  const text = `${requirement.title}\n${docText}`;
  const needsFrontend = /(前端|页面|列表|弹窗|按钮|跳转|筛选|工作台|展示|UI)/u.test(text);
  const needsBackend = /(后端|接口|统计|查询|service|controller|mapper|数据库|口径|规则|计算)/iu.test(text) || !needsFrontend;
  const chains: ProjectChainRecord[] = [];

  if (needsBackend) {
    chains.push({
      id: `${titleSeed}Backend`,
      titleZh: `${requirement.title}后端链`,
      type: "backend",
      repoKey: "backend",
      branch: `feature/${sourceId}-backend`,
      status: "active",
      stage: "S1",
      session: `chain-${sourceId}-${titleSeed}Backend`,
      updatedAt: new Date().toISOString(),
      summary: "AI 初步拆解：先定位后端入口、口径和最小改动方案。",
      blocked: false
    });
  }

  if (needsFrontend) {
    chains.push({
      id: `${titleSeed}Frontend`,
      titleZh: `${requirement.title}前端链`,
      type: "frontend",
      repoKey: "frontend",
      branch: `feature/${sourceId}-frontend`,
      status: "idle",
      stage: "PENDING",
      session: `chain-${sourceId}-${titleSeed}Frontend`,
      updatedAt: new Date().toISOString(),
      summary: "AI 初步拆解：等待接口约定后并行推进页面和交互改造。",
      blocked: false
    });
  }

  chains.push(buildDefectChain(sourceId));
  return chains;
}

function buildDefectChain(sourceId: string): ProjectChainRecord {
  return {
    id: "Defect",
    titleZh: "缺陷处理",
    type: "backend",
    repoKey: "backend",
    branch: null,
    status: "idle",
    stage: "PENDING",
    session: `chain-${sourceId}-Defect`,
    updatedAt: null,
    summary: "缺陷专用容器链，默认空闲，等待缺陷进入。",
    blocked: false
  };
}

function buildInterfaceDoc(detail: NonNullable<Awaited<ReturnType<typeof getRequirementDetail>>>) {
  const backendChains = detail.chains.filter((chain) => chain.type !== "frontend");
  const frontendChains = detail.chains.filter((chain) => chain.type === "frontend");
  return [
    `# ${detail.title} 接口约定`,
    "",
    "## 背景摘要",
    detail.background || "暂无背景摘要。",
    "",
    "## 业务链分工",
    ...detail.chains.map((chain) => `- ${chain.type === "frontend" ? "[F]" : "[B]"} ${chain.titleZh} | repo=${chain.repoKey} | stage=${chain.stage}`),
    "",
    "## 后端接口草案",
    ...(backendChains.length > 0 ? backendChains.map((chain, index) => [
      `### 接口 ${index + 1}: ${chain.titleZh}`,
      `- 方法：POST /api/${detail.id}/${chain.id}`,
      `- 责任链：${chain.id}`,
      "- 请求字段：待补充具体业务字段",
      "- 响应字段：success、message、data",
      "- 错误码：400 参数错误 / 409 状态冲突 / 500 服务异常",
      ""
    ].join("\n")) : ["- 当前无后端链，待补充。"]),
    "",
    "## 前端联调约定",
    ...(frontendChains.length > 0 ? frontendChains.map((chain) => `- ${chain.titleZh}：优先依赖后端接口草案联调，页面字段与筛选条件以需求文档为准。`) : ["- 当前无前端链，待补充。"]),
    "",
    "## 说明",
    "- 本文件为飞枢台自动生成的首版接口约定草案。",
    "- 后续应在联调前补齐请求/响应字段、筛选条件、状态枚举与异常口径。",
    ""
  ].join("\n");
}

async function generateRequirementCodeList(projectRoot: string, requirement: { id: string; chains?: ProjectChainRecord[] }) {
  const chains = (Array.isArray(requirement.chains) ? requirement.chains : []).filter((chain) => typeof chain?.id === "string" && chain.id.length > 0);
  const codeListsDir = path.join(projectRoot, "chain-assets", "代码清单", requirement.id);
  await mkdir(path.dirname(codeListsDir), { recursive: true });
  await mkdir(codeListsDir, { recursive: true });

  const fileRows = await collectRequirementCodeFiles(projectRoot, requirement.id, chains);
  const uniqueFilePaths = [...new Set(fileRows.map((row) => row.filePath))].sort((left, right) => left.localeCompare(right));
  const rows = [
    "# 需求代码文件清单",
    "",
    `- 需求：${requirement.id}`,
    "- 说明：这份文档只保留当前需求实际改动过的代码文件路径，适合直接提供给 AI 做跨分支合并、补丁迁移和影响分析。",
    "",
    "## 代码文件路径",
    ""
  ];

  if (uniqueFilePaths.length === 0) {
    rows.push("- 暂无可提取代码文件。", "", "## 备注", "- 当前链级代码清单里还没有明确的实际改动文件记录。先补链级代码清单，再重新生成。");
  } else {
    for (const filePath of uniqueFilePaths) {
      rows.push(`- \`${filePath}\``);
    }

    rows.push("", "## 来源业务链（辅助）", "");
    for (const fileRow of fileRows) {
      rows.push(`- ${fileRow.chainId} / ${fileRow.chainNameZh} -> \`${fileRow.filePath}\``);
    }
  }

  const outputPath = path.join(codeListsDir, "需求代码文件清单.md");
  await writeFile(outputPath, `${rows.join("\n")}\n`, "utf8");
  return outputPath;
}

async function collectRequirementCodeFiles(projectRoot: string, requirementId: string, chains: ProjectChainRecord[]) {
  const records: Array<{ filePath: string; chainId: string; chainNameZh: string }> = [];
  const seen = new Set<string>();
  const allowedExtensions = [".java", ".xml", ".sql", ".ts", ".tsx", ".js", ".jsx", ".py", ".sh", ".jrxml"];

  for (const chain of chains) {
    const chainId = chain.id;
    const chainNameZh = chain.titleZh ?? chainId;
    const codeListPath = path.join(projectRoot, "chain-assets", "代码清单", requirementId, `${chainId}.md`);
    try {
      const content = await readFile(codeListPath, "utf8");
      const matches = [...content.matchAll(/^\|\s*`([^`]+)`\s*\|/gmu)];
      for (const match of matches) {
        const filePath = match[1]?.trim();
        if (!filePath || filePath === "无") {
          continue;
        }
        if (filePath.startsWith("Projects/飞枢系统/")) {
          continue;
        }
        if (!allowedExtensions.some((extension) => filePath.endsWith(extension))) {
          continue;
        }
        const key = `${chainId}::${filePath}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        records.push({ filePath, chainId, chainNameZh });
      }
    } catch {
      // ignore missing chain-level codelist file
    }
  }

  return records.sort((left, right) => left.filePath.localeCompare(right.filePath) || left.chainId.localeCompare(right.chainId));
}

function buildRequirementId(title: string) {
  if (/^[A-Za-z0-9_-]+$/u.test(title)) {
    return title.toLowerCase();
  }

  return `req-${createHash("sha1").update(title).digest("hex").slice(0, 8)}`;
}

function buildRequirementTemplate(title: string, background: string) {
  return [
    `# ${title}`,
    "",
    "需求标题：",
    title,
    "",
    "需求类型：",
    "待补充",
    "",
    "背景：",
    background || "待补充",
    "",
    "现象 / 问题：",
    "待补充",
    "",
    "相关位置：",
    "待补充",
    "",
    "期望结果：",
    "待补充",
    "",
    "约束：",
    "待补充",
    "",
    "验收标准：",
    "待补充",
    ""
  ].join("\n");
}

function buildChainId(title: string, type: string) {
  const normalized = title
    .replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((segment) => segment.replace(/[\u4e00-\u9fa5]/g, ""))
    .filter(Boolean)
    .map((segment) => segment.slice(0, 1).toUpperCase() + segment.slice(1))
    .join("");

  return `${normalized || "ManualChain"}${type === "frontend" ? "Frontend" : "Backend"}`;
}
