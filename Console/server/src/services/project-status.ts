import path from "node:path";
import { readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";

import type { ParsedChainSessionName, WorkspaceKind, WorkspaceRegistryEntry } from "../../../shared/event-model";
import { parseChainSessionName } from "../../../shared/event-model";
import { readJsonFileSafe, readTextFileSafe } from "../lib/fs-utils";

export interface ProjectRepoRecord {
  path: string;
  worktreesBase: string;
}

export interface ProjectChainRecord {
  id: string;
  titleZh?: string;
  type?: string;
  repoKey?: string;
  branch?: string | null;
  status?: string;
  stage?: string;
  session?: string | null;
  updatedAt?: string | null;
  summary?: string;
  blocked?: boolean;
}

export interface ProjectRequirementRecord {
  id: string;
  title: string;
  status?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  docPath: string;
  worktreePath?: string | null;
  kind?: WorkspaceKind;
  draftIncomplete?: boolean;
  chains?: ProjectChainRecord[];
}

export interface ProjectStatusRecord {
  repos?: Record<string, ProjectRepoRecord>;
  requirements?: ProjectRequirementRecord[];
}

export interface RequirementChainView extends ProjectChainRecord {
  titleZh: string;
  repoKey: string;
  status: string;
  stage: string;
  session: string | null;
  sessionRunning: boolean;
  codeListPath: string | null;
}

export interface RequirementSummaryView {
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

export interface RequirementDetailView extends RequirementSummaryView {
  background: string;
  interfaceDocPath: string | null;
  interfaceExcerpt: string | null;
  requirementCodeListPath: string | null;
  requirementCodeListGenerated: boolean;
  chains: RequirementChainView[];
}

export interface SessionView {
  name: string;
  kind: "main-control" | "system" | "chain" | "other";
  sourceId: string | null;
  chainId: string | null;
  running: boolean;
}

export interface DeleteRequirementResult {
  archivePath: string;
  deletedPaths: string[];
}

const EMPTY_PROJECT_STATUS: ProjectStatusRecord = {
  repos: {},
  requirements: []
};

export async function loadProjectStatus(shareRoot: string) {
  return readJsonFileSafe<ProjectStatusRecord>(path.join(shareRoot, "project-status.json"), EMPTY_PROJECT_STATUS);
}

export function hasProjectStatusData(status: ProjectStatusRecord | null | undefined) {
  return Array.isArray(status?.requirements) && status.requirements.length > 0;
}

export function projectStatusToWorkspaceEntries(status: ProjectStatusRecord): WorkspaceRegistryEntry[] {
  const requirements = Array.isArray(status.requirements) ? status.requirements : [];
  return requirements
    .filter((requirement) => typeof requirement?.id === "string" && requirement.id.trim().length > 0)
    .map((requirement) => ({
      sourceId: requirement.id.trim(),
      label: typeof requirement.title === "string" && requirement.title.trim().length > 0 ? requirement.title.trim() : requirement.id.trim(),
      kind: requirement.kind === "single" ? "single" : "combined",
      enabled: requirement.status !== "archived",
      sourceDocPath: typeof requirement.docPath === "string" && requirement.docPath.trim().length > 0 ? requirement.docPath.trim() : `Projects/飞枢系统/demands/${requirement.id.trim()}/${requirement.id.trim()}.md`,
      worktreePath: typeof requirement.worktreePath === "string" && requirement.worktreePath.trim().length > 0 ? requirement.worktreePath.trim() : null,
      legacyRoot: false,
      draftIncomplete: requirement.draftIncomplete === true
    }));
}

export function findRequirement(status: ProjectStatusRecord, sourceId: string) {
  return (status.requirements ?? []).find((requirement) => requirement.id === sourceId) ?? null;
}

export function findRequirementChain(status: ProjectStatusRecord, sourceId: string, chainId: string) {
  const requirement = findRequirement(status, sourceId);
  if (!requirement || !Array.isArray(requirement.chains)) {
    return null;
  }

  return requirement.chains.find((chain) => chain.id === chainId) ?? null;
}

export function listRequirementSummaries(status: ProjectStatusRecord, tmuxSessions: string[]): RequirementSummaryView[] {
  return (status.requirements ?? []).map((requirement) => buildRequirementSummary(requirement, tmuxSessions));
}

export async function getRequirementDetail(projectRoot: string, shareRoot: string, sourceId: string, tmuxSessions: string[]): Promise<RequirementDetailView | null> {
  const projectStatusResult = await loadProjectStatus(shareRoot);
  const requirement = findRequirement(projectStatusResult.value, sourceId);
  if (!requirement) {
    return null;
  }

  const summary = buildRequirementSummary(requirement, tmuxSessions);
  const chains = (requirement.chains ?? []).map((chain) => normalizeChain(chain, tmuxSessions));
  const background = await readRequirementBackground(projectRoot, requirement.docPath);
  const interfaceDocPath = resolveInterfaceDocPath(requirement.docPath);
  const interfaceExcerpt = interfaceDocPath ? await readExcerpt(projectRoot, interfaceDocPath) : null;
  const requirementCodeListPath = `Projects/飞枢系统/chain-assets/代码清单/${sourceId}/需求代码文件清单.md`;
  const requirementCodeListGenerated = await hasProjectDoc(projectRoot, requirementCodeListPath);

  return {
    ...summary,
    background,
    interfaceDocPath,
    interfaceExcerpt,
    requirementCodeListPath,
    requirementCodeListGenerated,
    chains
  };
}

export function listSessionViews(tmuxSessions: string[]): SessionView[] {
  return tmuxSessions.map((session) => buildSessionView(session));
}

export async function updateChainStatus(
  shareRoot: string,
  sourceId: string,
  chainId: string,
  patch: Partial<Pick<ProjectChainRecord, "status" | "stage" | "updatedAt" | "summary" | "blocked">>
) {
  const filePath = path.join(shareRoot, "project-status.json");
  const current = await readJsonFileSafe<ProjectStatusRecord>(filePath, EMPTY_PROJECT_STATUS);
  const requirements = Array.isArray(current.value.requirements) ? current.value.requirements : [];
  const nextRequirements = requirements.map((requirement) => {
    if (requirement.id !== sourceId || !Array.isArray(requirement.chains)) {
      return requirement;
    }

    return {
      ...requirement,
      updatedAt: patch.updatedAt ?? requirement.updatedAt ?? null,
      chains: requirement.chains.map((chain) => chain.id === chainId ? { ...chain, ...patch } : chain)
    };
  });

  const nextStatus: ProjectStatusRecord = {
    ...current.value,
    requirements: nextRequirements
  };

  await writeFile(filePath, `${JSON.stringify(nextStatus, null, 2)}\n`, "utf8");
}

export async function replaceRequirementChains(
  shareRoot: string,
  sourceId: string,
  chains: ProjectChainRecord[]
) {
  const filePath = path.join(shareRoot, "project-status.json");
  const current = await readJsonFileSafe<ProjectStatusRecord>(filePath, EMPTY_PROJECT_STATUS);
  const requirements = Array.isArray(current.value.requirements) ? current.value.requirements : [];
  const nextRequirements = requirements.map((requirement) => requirement.id === sourceId ? {
    ...requirement,
    updatedAt: new Date().toISOString(),
    chains
  } : requirement);

  const nextStatus: ProjectStatusRecord = {
    ...current.value,
    requirements: nextRequirements
  };

  await writeFile(filePath, `${JSON.stringify(nextStatus, null, 2)}\n`, "utf8");
}

export async function writeInterfaceDoc(projectRoot: string, requirementDocPath: string, content: string) {
  const interfacePath = resolveProjectDocPath(projectRoot, resolveInterfaceDocPath(requirementDocPath) ?? requirementDocPath);
  await writeFile(interfacePath, `${content.trim()}\n`, "utf8");
  return interfacePath;
}

export async function addRequirementChain(shareRoot: string, sourceId: string, chain: ProjectChainRecord) {
  const filePath = path.join(shareRoot, "project-status.json");
  const current = await readJsonFileSafe<ProjectStatusRecord>(filePath, EMPTY_PROJECT_STATUS);
  const requirements = Array.isArray(current.value.requirements) ? current.value.requirements : [];
  const nextRequirements = requirements.map((requirement) => {
    if (requirement.id !== sourceId) {
      return requirement;
    }

    const chains = Array.isArray(requirement.chains) ? requirement.chains : [];
    return {
      ...requirement,
      updatedAt: new Date().toISOString(),
      chains: [...chains.filter((item) => item.id !== chain.id), chain]
    };
  });

  await writeFile(filePath, `${JSON.stringify({ ...current.value, requirements: nextRequirements }, null, 2)}\n`, "utf8");
}

export async function deleteRequirement(projectRoot: string, shareRoot: string, sourceId: string) {
  const filePath = path.join(shareRoot, "project-status.json");
  const workspacesPath = path.join(shareRoot, "workspaces.json");
  const current = await readJsonFileSafe<ProjectStatusRecord>(filePath, EMPTY_PROJECT_STATUS);
  const requirements = Array.isArray(current.value.requirements) ? current.value.requirements : [];
  const target = requirements.find((item) => item.id === sourceId) ?? null;
  if (!target) {
    throw new Error(`Unknown requirement id: ${sourceId}`);
  }

  const archiveDir = path.join(projectRoot, "archives");
  await mkdir(archiveDir, { recursive: true });
  const archiveFilename = `${sourceId}-${sanitizeFilename(target.title)}-${new Date().toISOString().slice(0, 10)}.md`;
  const archivePath = path.join(archiveDir, archiveFilename);
  const archiveContent = await generateRequirementArchive(projectRoot, target);
  await writeFile(archivePath, `${archiveContent.trim()}\n`, "utf8");

  const nextRequirements = requirements.filter((item) => item.id !== sourceId);

  await writeFile(filePath, `${JSON.stringify({ ...current.value, requirements: nextRequirements }, null, 2)}\n`, "utf8");

  const workspacesResult = await readJsonFileSafe<Array<Record<string, unknown>>>(workspacesPath, []);
  if (Array.isArray(workspacesResult.value)) {
    const nextWorkspaces = workspacesResult.value.filter((item) => !(typeof item?.sourceId === "string" && item.sourceId === sourceId));
    await writeFile(workspacesPath, `${JSON.stringify(nextWorkspaces, null, 2)}\n`, "utf8");
  }

  const deletedPaths: string[] = [];
  for (const candidate of [
    path.dirname(resolveProjectDocPath(projectRoot, target.docPath)),
    path.join(projectRoot, "chain-assets", "地图", sourceId),
    path.join(projectRoot, "chain-assets", "代码清单", sourceId),
    path.join(projectRoot, "chain-assets", "波次总结", sourceId),
    path.join(shareRoot, "sources", sourceId),
    path.join(projectRoot, "Sessions", "sources", sourceId)
  ]) {
    await rm(candidate, { recursive: true, force: true });
    deletedPaths.push(candidate);
  }

  return {
    archivePath,
    deletedPaths
  } satisfies DeleteRequirementResult;
}

async function generateRequirementArchive(projectRoot: string, requirement: ProjectRequirementRecord) {
  const chains = requirement.chains ?? [];
  const completedCount = chains.filter((chain) => chain.stage === "S5" || chain.status === "done").length;
  const background = await readRequirementBackground(projectRoot, requirement.docPath);
  const interfacePath = resolveInterfaceDocPath(requirement.docPath);
  const interfaceExcerpt = interfacePath ? (await readProjectDoc(projectRoot, interfacePath)).trim() : "";
  const codeListDir = path.join(projectRoot, "chain-assets", "代码清单", requirement.id);
  const techSummaries = await readMarkdownDirectory(codeListDir);
  const riskChains = chains.filter((chain) => chain.stage !== "S5" && chain.status !== "done");

  return [
    `# ${requirement.title} 归档总结`,
    "",
    `> 需求 ID：${requirement.id}`,
    `> 归档时间：${new Date().toISOString().replace("T", " ").slice(0, 19)}`,
    `> 链数量：${chains.length} 条，已完成 ${completedCount} 条`,
    "",
    "## 一、需求背景",
    background || "暂无可提取背景。",
    "",
    "## 二、业务交付结论",
    ...(chains.length > 0 ? chains.map((chain) => `- [${chain.type === "frontend" ? "F" : "B"}] ${chain.titleZh ?? chain.id}（${chain.stage ?? "PENDING"}）：${chain.summary ?? "暂无总结"}`) : ["- 暂无业务链记录。"]),
    "",
    "## 三、技术改动摘要",
    techSummaries.length > 0 ? techSummaries.join("\n\n") : "暂无可提取技术摘要。",
    "",
    "## 四、接口约定",
    interfaceExcerpt || "暂无接口约定内容。",
    "",
    "## 五、验证路径",
    extractVerificationLines(techSummaries).join("\n") || "暂无验证记录。",
    "",
    "## 六、遗留与风险",
    ...(riskChains.length > 0 ? riskChains.map((chain) => `- ${chain.titleZh ?? chain.id}：stage=${chain.stage ?? "PENDING"}，status=${chain.status ?? "idle"}，${chain.summary ?? "暂无补充说明"}`) : ["- 无未收口链。"]),
    "",
    "## 七、关联资产（已清理）",
    `- demands/${requirement.id}/`,
    `- chain-assets/地图/${requirement.id}/`,
    `- chain-assets/代码清单/${requirement.id}/`,
    `- chain-assets/波次总结/${requirement.id}/`,
    `- share/sources/${requirement.id}/`,
    `- Sessions/sources/${requirement.id}/`,
    "",
    "> 接口文档目录本轮未清理。"
  ].join("\n");
}

async function readMarkdownDirectory(dirPath: string) {
  try {
    const names = (await readdir(dirPath)).filter((name) => name.endsWith(".md")).sort();
    const contents = await Promise.all(names.map(async (name) => {
      const raw = await readFile(path.join(dirPath, name), "utf8");
      const conclusion = extractSection(raw, "本轮结论");
      const changedFiles = extractTableSection(raw, "实际改动文件清单");
      const verification = extractSection(raw, "验证");
      return [
        `### ${name.replace(/\.md$/u, "")}`,
        conclusion || "暂无本轮结论。",
        changedFiles || "暂无改动文件摘要。",
        verification ? `验证：\n${verification}` : ""
      ].filter(Boolean).join("\n\n");
    }));
    return contents;
  } catch {
    return [] as string[];
  }
}

function extractSection(raw: string, heading: string) {
  const match = raw.match(new RegExp(`##\\s+${escapeRegExp(heading)}\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "u"));
  return match?.[1]?.trim() ?? "";
}

function extractTableSection(raw: string, heading: string) {
  return extractSection(raw, heading);
}

function extractVerificationLines(sections: string[]) {
  return sections
    .flatMap((section) => section.split(/\r?\n/u))
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-") || line.startsWith("验证：") || line.startsWith("验证结果"));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "requirement";
}

function buildRequirementSummary(requirement: ProjectRequirementRecord, tmuxSessions: string[]): RequirementSummaryView {
  const chains = (requirement.chains ?? []).map((chain) => normalizeChain(chain, tmuxSessions));
  const deliveryChains = chains.filter((chain) => chain.id !== "Defect");
  const chainCount = chains.length;
  const completedChainCount = deliveryChains.filter((chain) => chain.status === "done" || chain.stage === "S5").length;
  const activeChainCount = deliveryChains.filter((chain) => chain.status === "active").length;
  const idleChainCount = deliveryChains.filter((chain) => chain.status === "idle").length;
  const backendChainCount = deliveryChains.filter((chain) => chain.type === "backend").length;
  const frontendChainCount = deliveryChains.filter((chain) => chain.type === "frontend").length;
  const updatedAt = chains.map((chain) => chain.updatedAt ?? "").sort().at(-1) || requirement.updatedAt || null;

  return {
    id: requirement.id,
    title: requirement.title,
    status: inferRequirementStatus(deliveryChains, requirement.status),
    createdAt: requirement.createdAt ?? null,
    updatedAt,
    docPath: requirement.docPath,
    chainCount,
    backendChainCount,
    frontendChainCount,
    completedChainCount,
    activeChainCount,
    idleChainCount,
    progressPercent: deliveryChains.length === 0 ? 0 : Math.round((completedChainCount / deliveryChains.length) * 100)
  };
}

function normalizeChain(chain: ProjectChainRecord, tmuxSessions: string[]): RequirementChainView {
  const session = typeof chain.session === "string" && chain.session.trim().length > 0 ? chain.session.trim() : null;
  const sourceId = typeof session === "string" ? session.split("-").slice(1, -1).join("-") : null;
  const codeListPath = sourceId ? `Projects/飞枢系统/chain-assets/代码清单/${sourceId}/${chain.id}.md` : null;
  return {
    ...chain,
    titleZh: typeof chain.titleZh === "string" && chain.titleZh.trim().length > 0 ? chain.titleZh.trim() : chain.id,
    repoKey: typeof chain.repoKey === "string" && chain.repoKey.trim().length > 0 ? chain.repoKey.trim() : "backend",
    status: typeof chain.status === "string" && chain.status.trim().length > 0 ? chain.status.trim() : inferChainStatus(chain.stage),
    stage: typeof chain.stage === "string" && chain.stage.trim().length > 0 ? chain.stage.trim() : "PENDING",
    session,
    sessionRunning: session !== null && tmuxSessions.includes(session),
    codeListPath
  };
}

function inferRequirementStatus(chains: RequirementChainView[], persistedStatus?: string) {
  if (chains.length > 0 && chains.every((chain) => chain.status === "done" || chain.stage === "S5")) {
    return "done";
  }
  if (chains.some((chain) => chain.status === "active")) {
    return "active";
  }
  if (typeof persistedStatus === "string" && persistedStatus.trim()) {
    return persistedStatus;
  }
  return "idle";
}

function inferChainStatus(stage?: string) {
  if (stage === "S5") {
    return "done";
  }
  if (typeof stage === "string" && stage && stage !== "PENDING") {
    return "active";
  }
  return "idle";
}

function resolveInterfaceDocPath(docPath: string) {
  const normalized = docPath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return null;
  }
  return `${normalized.slice(0, lastSlash)}/interface.md`;
}

async function readRequirementBackground(projectRoot: string, docPath: string) {
  const raw = await readProjectDoc(projectRoot, docPath);
  if (!raw) {
    return "";
  }

  const backgroundMatch = raw.match(/(?:^|\n)(?:##\s*背景|背景：)([\s\S]*?)(?:\n##\s|\n[A-Za-z\u4e00-\u9fa5]+：|$)/u);
  if (backgroundMatch?.[1]) {
    return backgroundMatch[1].trim();
  }

  return raw.split(/\r?\n/u).slice(0, 12).join("\n").trim();
}

async function readExcerpt(projectRoot: string, docPath: string) {
  const raw = await readProjectDoc(projectRoot, docPath);
  if (!raw) {
    return null;
  }
  return raw.split(/\r?\n/u).slice(0, 10).join("\n").trim();
}

async function readProjectDoc(projectRoot: string, docPath: string) {
  const filePath = resolveProjectDocPath(projectRoot, docPath);
  const result = await readTextFileSafe(filePath, "");
  return result.readable ? result.value : "";
}

async function hasProjectDoc(projectRoot: string, docPath: string) {
  const filePath = resolveProjectDocPath(projectRoot, docPath);
  const result = await readTextFileSafe(filePath, "");
  return result.readable;
}

function resolveProjectDocPath(projectRoot: string, docPath: string) {
  const normalized = docPath.replace(/\\/g, "/");
  const prefix = "Projects/飞枢系统/";
  if (normalized.startsWith(prefix)) {
    return path.join(projectRoot, normalized.slice(prefix.length));
  }
  return path.isAbsolute(docPath) ? docPath : path.join(projectRoot, docPath);
}

function buildSessionView(sessionName: string): SessionView {
  const parsed = parseChainSessionName(sessionName);
  if (parsed) {
    return {
      name: sessionName,
      kind: "chain",
      sourceId: parsed.sourceId,
      chainId: parsed.chainId,
      running: true
    };
  }

  if (sessionName === "main-control") {
    return { name: sessionName, kind: "main-control", sourceId: null, chainId: null, running: true };
  }

  if (sessionName === "system-iteration") {
    return { name: sessionName, kind: "system", sourceId: null, chainId: null, running: true };
  }

  return { name: sessionName, kind: "other", sourceId: null, chainId: null, running: true };
}
