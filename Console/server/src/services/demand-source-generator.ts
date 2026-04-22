import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ParsedDemandSourceDoc } from "./demand-source-parser";
import { upsertWorkspaceManifestEntry } from "./demand-source-manifest";
import { resolveWorkspaceWorktreePath } from "./workspace-registry";

interface GenerateDemandSourceSkeletonOptions {
  projectRoot: string;
  shareRoot: string;
  mapsRoot: string;
  reviewsRoot: string;
  codeListsRoot: string;
  demandTemplatesRoot: string;
  worktreesRoot: string;
  parsedDoc: ParsedDemandSourceDoc;
}

interface GenerateDemandSourceSkeletonResult {
  workspace: Awaited<ReturnType<typeof upsertWorkspaceManifestEntry>>;
  entryDocPath: string;
}

const DEFECT_CHAIN_REGISTRY_ENTRY = {
  id: "Defect",
  nameZh: "缺陷处理",
  priorityWave: "P2",
  sequence: 999,
  enabled: true
} as const;

const DEFECT_CHAIN_STATUS_ENTRY = {
  stage: "PENDING",
  updatedAt: null,
  summary: "缺陷专用容器链，默认空闲，等待缺陷进入"
} as const;

const DEFECT_CHAIN_NAME_ENTRY = {
  Defect: "缺陷处理"
} as const;

const DEFECT_WORK_ITEM = {
  chainId: "Defect",
  mode: "hold",
  currentTask: "等待缺陷进入并由主控派发当前唯一缺陷任务",
  expectedOutput: "输出缺陷归因、影响范围、修复结论和验证范围",
  allowedActions: ["恢复上下文", "缺陷归因", "状态判断", "最小修复方案"],
  forbiddenActions: ["擅自扩展为新功能", "无来源链直接进入大改"],
  resumeSignal: {
    type: "manual-or-inbox",
    description: "当主控派发缺陷或 control-inbox 收到缺陷处理指令时恢复"
  },
  sourceChainId: null,
  severity: null,
  regression: null,
  expectedBehavior: null,
  actualBehavior: null,
  verificationScope: [],
  lastVerifiedAt: null,
  lastVerifiedBy: "main-control",
  updatedAt: null
} as const;

export async function generateDemandSourceSkeleton(options: GenerateDemandSourceSkeletonOptions): Promise<GenerateDemandSourceSkeletonResult> {
  const workspace = await upsertWorkspaceManifestEntry({
    projectRoot: options.projectRoot,
    shareRoot: options.shareRoot,
    worktreesRoot: options.worktreesRoot,
    demandName: options.parsedDoc.demandName,
    sourceDocPath: options.parsedDoc.relativePath,
    kind: options.parsedDoc.kind,
    draftIncomplete: options.parsedDoc.draftIncomplete
  });

  const sourceShareRoot = path.join(options.shareRoot, "sources", workspace.sourceId);
  const sourceSessionsRoot = path.join(options.projectRoot, "Sessions", "sources", workspace.sourceId);
  const sourceChainResumeRoot = path.join(sourceSessionsRoot, "chain-resume");
  const sourceWorkItemsRoot = path.join(sourceShareRoot, "work-items");
  const worktreeRoot = resolveWorkspaceWorktreePath(options.projectRoot, workspace.worktreePath) ?? path.join(options.worktreesRoot, workspace.sourceId);
  const mapsRoot = path.join(options.mapsRoot, workspace.sourceId);
  const reviewsRoot = path.join(options.reviewsRoot, workspace.sourceId);
  const codeListsRoot = path.join(options.codeListsRoot, workspace.sourceId);
  const notificationsRoot = path.join(sourceShareRoot, "notifications");

  await Promise.all([
    mkdir(sourceShareRoot, { recursive: true }),
    mkdir(sourceChainResumeRoot, { recursive: true }),
    mkdir(sourceWorkItemsRoot, { recursive: true }),
    mkdir(worktreeRoot, { recursive: true }),
    mkdir(mapsRoot, { recursive: true }),
    mkdir(reviewsRoot, { recursive: true }),
    mkdir(codeListsRoot, { recursive: true }),
    mkdir(notificationsRoot, { recursive: true })
  ]);

  await Promise.all([
    ensureJsonFile(path.join(sourceShareRoot, "chain-registry.json"), [DEFECT_CHAIN_REGISTRY_ENTRY]),
    ensureJsonFile(path.join(sourceShareRoot, "chain-status.json"), { Defect: DEFECT_CHAIN_STATUS_ENTRY }),
    ensureJsonFile(path.join(sourceShareRoot, "chinese-chain-names.json"), DEFECT_CHAIN_NAME_ENTRY),
    ensureJsonFile(path.join(sourceShareRoot, "dispatch-queue.json"), {
      maxConcurrent: 0,
      pendingStart: [],
      nextCandidate: null,
      updatedAt: null
    }),
    ensureJsonFile(path.join(sourceShareRoot, "scheduler-state.json"), {
      desiredState: "paused",
      updatedAt: null,
      updatedBy: null
    }),
    ensureJsonFile(path.join(sourceShareRoot, "policy.json"), {
      autoSleep: true,
      idleSleepMinutes: 30,
      pinned: false,
      maxConcurrentChains: 3
    }),
    ensureJsonFile(path.join(sourceWorkItemsRoot, "Defect.json"), DEFECT_WORK_ITEM),
    ensureTextFile(path.join(sourceShareRoot, "control-inbox.jsonl"), ""),
    ensureTextFile(path.join(sourceShareRoot, "action-events.jsonl"), "")
  ]);

  const demandRoot = path.dirname(options.demandTemplatesRoot);
  const entryDocPath = path.join(demandRoot, workspace.sourceId, "README.md");
  await mkdir(path.dirname(entryDocPath), { recursive: true });
  await writeFile(entryDocPath, buildEntryDoc(workspace.sourceId, options.parsedDoc), "utf8");

  return {
    workspace,
    entryDocPath
  };
}

export async function ensureDefectChainForSource(options: {
  projectRoot: string;
  shareRoot: string;
  sourceId: string;
}) {
  const sourceShareRoot = path.join(options.shareRoot, "sources", options.sourceId);
  const sourceWorkItemsRoot = path.join(sourceShareRoot, "work-items");
  const [registry, chainStatus, chineseNames] = await Promise.all([
    readJsonFile(path.join(sourceShareRoot, "chain-registry.json"), [] as Array<Record<string, unknown>>),
    readJsonFile(path.join(sourceShareRoot, "chain-status.json"), {} as Record<string, unknown>),
    readJsonFile(path.join(sourceShareRoot, "chinese-chain-names.json"), {} as Record<string, unknown>)
  ]);

  const hasDefect = registry.some((entry) => entry.id === DEFECT_CHAIN_REGISTRY_ENTRY.id)
    && typeof chainStatus.Defect === "object"
    && chainStatus.Defect !== null
    && chineseNames.Defect === DEFECT_CHAIN_NAME_ENTRY.Defect;
  if (hasDefect) {
    try {
      await access(path.join(sourceWorkItemsRoot, "Defect.json"));
      return false;
    } catch {
      // Continue and backfill the missing work-item only.
    }
  }

  await mkdir(sourceWorkItemsRoot, { recursive: true });
  const nextRegistry = registry.some((entry) => entry.id === DEFECT_CHAIN_REGISTRY_ENTRY.id)
    ? registry
    : [...registry, DEFECT_CHAIN_REGISTRY_ENTRY];
  const nextStatus = "Defect" in chainStatus
    ? chainStatus
    : { ...chainStatus, Defect: DEFECT_CHAIN_STATUS_ENTRY };
  const nextNames = chineseNames.Defect === DEFECT_CHAIN_NAME_ENTRY.Defect
    ? chineseNames
    : { ...chineseNames, ...DEFECT_CHAIN_NAME_ENTRY };

  await Promise.all([
    writeJson(path.join(sourceShareRoot, "chain-registry.json"), nextRegistry),
    writeJson(path.join(sourceShareRoot, "chain-status.json"), nextStatus),
    writeJson(path.join(sourceShareRoot, "chinese-chain-names.json"), nextNames),
    ensureJsonFile(path.join(sourceWorkItemsRoot, "Defect.json"), DEFECT_WORK_ITEM)
  ]);

  return true;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(filePath, "utf8"))) as T;
  } catch {
    return fallback;
  }
}

async function ensureJsonFile(filePath: string, value: unknown) {
  try {
    await access(filePath);
  } catch {
    await writeJson(filePath, value);
  }
}

async function ensureTextFile(filePath: string, value: string) {
  try {
    await access(filePath);
  } catch {
    await writeFile(filePath, value, "utf8");
  }
}

function buildEntryDoc(sourceId: string, parsedDoc: ParsedDemandSourceDoc) {
  return `# 需求源入口（${parsedDoc.demandName}）

## 原始文件
- ${parsedDoc.relativePath}

## 当前定位
- 需求源 ID：\`${sourceId}\`
- 需求类型：${parsedDoc.kind === "combined" ? "组合型需求源" : "单需求源"}

## 自动解析摘要
- 标题：${parsedDoc.title ?? "待补充"}
- 背景：${parsedDoc.background ?? "待补充"}
- 期望结果：${parsedDoc.expectedResult ?? "待补充"}
- 约束：${parsedDoc.constraints ?? "待补充"}

## 当前状态
- ${parsedDoc.draftIncomplete ? "受限模式需求源草稿" : "需求源骨架已建立"}
- 待后续进入拆链流程

## 固定落点
- 原始需求：${parsedDoc.relativePath}
- 需求目录：Projects/飞枢系统/05-需求/${sourceId}/
- 业务链地图：Projects/飞枢系统/03-业务链资产/地图/${sourceId}/
- 代码清单：Projects/飞枢系统/03-业务链资产/代码清单/${sourceId}/
- 波次总结：Projects/飞枢系统/03-业务链资产/波次总结/${sourceId}/
`;
}
