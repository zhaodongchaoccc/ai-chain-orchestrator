import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

import type { ffPaths } from "../config";
import { loadProjectStatus } from "./project-status";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DistilledCategory {
  id: string;
  label: string;
  items: Array<{ text: string; updatedAt: string }>;
  sourceHeadings: string[];
}

export interface MemoryDistillResult {
  distilledAt: string;
  sourcesProcessed: string[];
  categories: DistilledCategory[];
  stats: {
    originalLines: number;
    distilledLines: number;
    compressionRatio: number;
  };
  compressedMemoryPath: string;
}

export interface MemoryDistillState {
  lastRanAt: string | null;
  lastResult: MemoryDistillResult | null;
  runCount: number;
}

// ─── Category config ─────────────────────────────────────────────────────────

const CATEGORY_MAP: Array<{
  id: string;
  label: string;
  headingPatterns: RegExp[];
}> = [
  {
    id: "project",
    label: "项目基础",
    headingPatterns: [
      /项目基础/u,
      /当前项目目标/u,
      /已达成的认知/u,
      /后续协作模式/u,
      /这份笔记/u,
    ]
  },
  {
    id: "principles",
    label: "协作原则",
    headingPatterns: [
      /协作原则/u,
      /默认执行顺序/u,
      /我默认的执行顺序/u,
      /worker.*checklist/ui,
      /阶段完成.*checklist/ui,
      /通知偏好/u,
      /接口文档标注/u,
    ]
  },
  {
    id: "stages",
    label: "阶段与流程",
    headingPatterns: [
      /阶段定义/u,
      /chain-notify/ui,
      /主控收到/u,
      /wave.*汇总/ui,
      /通知机制/u,
      /静默通知/u,
      /脚本做三件事/u,
    ]
  },
  {
    id: "tools",
    label: "工具规则",
    headingPatterns: [
      /工具优先级/u,
      /浏览器操作/u,
      /browser.*priority/ui,
      /browser.*workflow/ui,
      /playwright-cli/u,
      /firecrawl-browser/u,
      /smoke/ui,
    ]
  },
  {
    id: "workflow",
    label: "工作流配置",
    headingPatterns: [
      /并行工作流/u,
      /session.*命名/ui,
      /自动调度/u,
      /管理脚本/u,
      /关键配置/u,
      /attach.*resume/ui,
      /交接规则/u,
      /上下文阈值/u,
      /启动顺序/u,
      /新 session/ui,
      /开启下一段/u,
    ]
  },
  {
    id: "console",
    label: "控制台与蒸馏",
    headingPatterns: [
      /控制台/u,
      /console/ui,
      /记忆蒸馏/u,
      /启动命令/u,
      /调度器接管/u,
    ]
  },
  {
    id: "progress",
    label: "当前进度快照",
    headingPatterns: [
      /当前进度/u,
      /推进进度/u,
    ]
  }
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Return true if the section heading contains a date older than maxAgeDays */
function isSectionDateStale(heading: string, maxAgeDays = 180): boolean {
  const match = /（(\d{4})-(\d{2})-(\d{2})/u.exec(heading);
  if (!match) return false;
  const entryDate = new Date(`${match[1]}-${match[2]}-${match[3]}`);
  return (Date.now() - entryDate.getTime()) > maxAgeDays * 24 * 60 * 60 * 1000;
}

/** Return true if a bullet looks like a pure file-path index entry */
function isFileIndexBullet(bullet: string): boolean {
  return /^`?Projects\/ff\/|^`?[\w/-]+\.(md|json|sh|ts|java)`?/u.test(bullet) &&
    !/：|:|\s{2}/u.test(bullet);
}

/** Return true if a section body is mostly file-path index entries */
function isMostlyFileIndex(bullets: string[]): boolean {
  if (bullets.length < 3) return false;
  const pathCount = bullets.filter(isFileIndexBullet).length;
  return pathCount / bullets.length > 0.6;
}

function assignCategory(heading: string): string {
  for (const cat of CATEGORY_MAP) {
    if (cat.headingPatterns.some((re) => re.test(heading))) {
      return cat.id;
    }
  }
  return "principles"; // default
}

/** Parse markdown into sections. Each section includes its heading, level, and parsed items. */
interface Section {
  heading: string;
  level: number;
  bullets: string[];
  codeBlocks: string[];
  table: string | null;
}

interface DistilledItem {
  text: string;
  updatedAt: string;
}

function parseSections(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split("\n");

  let heading = "";
  let level = 0;
  let bodyLines: string[] = [];

  function flushSection() {
    if (!heading) return;
    sections.push({ heading, level, ...extractSectionParts(bodyLines) });
    bodyLines = [];
  }

  for (const line of lines) {
    const headingMatch = /^(#{1,4})\s+(.+)/u.exec(line);
    if (headingMatch) {
      flushSection();
      level = headingMatch[1].length;
      heading = headingMatch[2].trim();
    } else {
      bodyLines.push(line);
    }
  }
  flushSection();
  return sections;
}

function extractSectionParts(bodyLines: string[]): Pick<Section, "bullets" | "codeBlocks" | "table"> {
  const bullets: string[] = [];
  const codeBlocks: string[] = [];
  let tableLines: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let inTable = false;

  for (const line of bodyLines) {
    // Code block toggle
    if (line.trim().startsWith("```")) {
      if (inCode) {
        const block = codeBuf.join("\n").trim();
        if (block) codeBlocks.push(block);
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    // Table
    if (line.trim().startsWith("|")) {
      inTable = true;
      tableLines.push(line.trim());
      continue;
    }
    if (inTable && line.trim() === "") {
      inTable = false;
    }
    // Bullets
    const bulletMatch = /^(\s*)[-*]\s+(.+)/u.exec(line);
    if (bulletMatch) {
      const raw = bulletMatch[2].trim();
      if (raw) bullets.push(raw);
    }
  }
  if (inCode && codeBuf.length > 0) {
    codeBlocks.push(codeBuf.join("\n").trim());
  }

  return {
    bullets,
    codeBlocks,
    table: tableLines.length >= 2 ? tableLines.join("\n") : null
  };
}

/** Merge bullet + first associated code block into a single descriptive item */
function mergeWithCodeBlock(bullet: string, codeBlocks: string[]): string {
  if (codeBlocks.length === 0) return bullet;
  const first = codeBlocks[0];
  if (!first) return bullet;
  // Only attach if the bullet looks like a label (ends with `:` or is short)
  if (bullet.endsWith(":") || bullet.length < 30) {
    const firstLine = first.split("\n")[0]?.trim() ?? "";
    if (firstLine) return `${bullet} \`${firstLine}\``;
  }
  return bullet;
}

function normalizeItemKey(item: string): string {
  return item.replace(/`/gu, "").replace(/（更新于\s*\d{4}-\d{2}-\d{2}.*?）/gu, "").toLowerCase().trim();
}

function pickLatestItems(items: DistilledItem[]): DistilledItem[] {
  const latest = new Map<string, DistilledItem>();
  for (const item of items) {
    const key = normalizeItemKey(item.text);
    const current = latest.get(key);
    if (!current || item.updatedAt > current.updatedAt) {
      latest.set(key, item);
    }
  }
  return Array.from(latest.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function dedup(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeItemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLegacyWorkflowItem(text: string, hasProjectStatus: boolean) {
  if (!hasProjectStatus) {
    return false;
  }

  return [
    /dispatch-watcher\.sh/u,
    /main-control-sync\.sh/u,
    /share\/sources\/newfee\/dispatch-queue\.json/u,
    /share\/scheduler-policy\.json/u,
    /share\/scheduler-state\.json/u,
    /share\/sources\/newfee\/chain-registry\.json/u,
    /share\/sources\/newfee\/chinese-chain-names\.json/u,
    /\/control\/global/u,
    /\/ws\/:sourceId\//u,
    /overview\s*\/\s*chains\s*\/\s*queue/u,
    /状态矩阵|能力矩阵/u,
    /调度器/u,
    /待启动队列/u
  ].some((pattern) => pattern.test(text));
}

function buildRequirementProgressItems(projectStatus: Awaited<ReturnType<typeof loadProjectStatus>>["value"]) {
  const requirements = Array.isArray(projectStatus.requirements) ? projectStatus.requirements : [];
  const done: string[] = [];
  const active: string[] = [];
  const idle: string[] = [];

  for (const requirement of requirements) {
    if (!requirement || typeof requirement !== "object") {
      continue;
    }
    const title = typeof requirement.title === "string" && requirement.title.trim() ? requirement.title.trim() : String(requirement.id ?? "unknown");
    const chains = Array.isArray(requirement.chains) ? requirement.chains.filter((chain) => chain && chain.id !== "Defect") : [];
    const allDone = chains.length > 0 && chains.every((chain) => chain.stage === "S5" || chain.status === "done");
    const anyActive = chains.some((chain) => chain.status === "active" || (typeof chain.stage === "string" && /^S[1-4]$/u.test(chain.stage)));

    if (allDone) {
      done.push(title);
    } else if (anyActive) {
      active.push(title);
    } else {
      idle.push(title);
    }
  }

  const items: string[] = [];
  if (done.length > 0) items.push(`已完成需求：${done.join("、")}`);
  if (active.length > 0) items.push(`进行中需求：${active.join("、")}`);
  if (idle.length > 0) items.push(`待开始/挂起需求：${idle.join("、")}`);
  return items;
}

function extractSectionUpdatedAt(section: Section, fallback: string): string {
  const headingDate = /(?:\(|（)(\d{4}-\d{2}-\d{2})(?:\)|）)/u.exec(section.heading)?.[1];
  if (headingDate) return `${headingDate} 00:00:00`;

  for (const bullet of section.bullets) {
    const inlineDate = /(最近更新时间|更新时间|updatedAt)[：:]\s*`?(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)`?/iu.exec(bullet);
    if (inlineDate?.[2]) {
      const value = inlineDate[2].trim();
      return value.length === 10 ? `${value} 00:00:00` : value;
    }
  }

  return fallback;
}

function buildChainProgressItems(
  chainStatus: Record<string, { stage: string; summary?: string }>,
  s5ChainIds: Set<string>
): string[] {
  const stageGroups: Record<string, string[]> = {
    S5: [], S4: [], S3: [], S2: [], S1: [],
    BLOCKED: [], PENDING: [], ROLLBACK: []
  };

  for (const [id, data] of Object.entries(chainStatus)) {
    const stage = (data.stage ?? "S1") as string;
    (stageGroups[stage] ?? stageGroups["S1"]!).push(id);
  }

  const result: string[] = [];
  if (stageGroups.S5!.length) result.push(`已完成(S5)：${stageGroups.S5!.join("、")}`);
  if (stageGroups.S4!.length) result.push(`待验证(S4)：${stageGroups.S4!.join("、")}`);
  if (stageGroups.S3!.length) result.push(`方案已定(S3)：${stageGroups.S3!.join("、")}`);
  if (stageGroups.S2!.length) result.push(`实现中(S2)：${stageGroups.S2!.join("、")}`);
  if (stageGroups.S1!.length) result.push(`需求收敛(S1)：${stageGroups.S1!.join("、")}`);
  if (stageGroups.BLOCKED!.length) result.push(`阻塞：${stageGroups.BLOCKED!.join("、")}`);
  if (stageGroups.PENDING!.length) result.push(`挂起：${stageGroups.PENDING!.join("、")}`);
  if (stageGroups.ROLLBACK!.length) result.push(`已撤回：${stageGroups.ROLLBACK!.join("、")}`);

  void s5ChainIds; // used by caller for stale filtering
  return result;
}

async function readJsonSafe<T>(filePath: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(filePath, "utf8")) as T; }
  catch { return fallback; }
}

async function readFileSafe(filePath: string): Promise<string> {
  try { return await readFile(filePath, "utf8"); }
  catch { return ""; }
}

// ─── Stale detection ──────────────────────────────────────────────────────────

/**
 * A section is considered chain-implementation-stale when:
 * 1. Its heading explicitly mentions an S5 chain name, OR
 * 2. Its bullets contain implementation-specific patterns (interface paths, test paths)
 *    and the primary chain they mention is S5.
 */
function isSectionStaleForChain(section: Section, s5ChainIds: Set<string>): boolean {
  if (s5ChainIds.size === 0) return false;

  // Check heading explicitly names an S5 chain
  for (const id of s5ChainIds) {
    if (section.heading.includes(id)) return true;
  }

  // Check if body is mostly implementation-specific lines referencing S5 chains
  const implPatterns = [
    /\/example-module\//u,
    /src\/test\/java\//u,
    /mvn.*-Dtest=/u,
    /discountAmount|paymentMethod|bizTypeEnum|expenseTypeEnum/u,
  ];
  const implLines = section.bullets.filter((b) =>
    implPatterns.some((re) => re.test(b))
  );
  if (implLines.length > 2) {
    // Check if they relate to S5 chains
    for (const id of s5ChainIds) {
      const relatedLines = section.bullets.filter((b) => b.includes(id) || implPatterns.some((re) => re.test(b)));
      if (relatedLines.length / Math.max(1, section.bullets.length) > 0.5) return true;
    }
  }

  return false;
}

// ─── Main distillation function ──────────────────────────────────────────────

export async function distillMemory(
  paths: typeof ffPaths,
  options: { now?: () => Date } = {}
): Promise<MemoryDistillResult> {
  const now = options.now ?? (() => new Date());
  const distilledAt = formatTimestamp(now());

  // ── Read sources ──────────────────────────────────────────────────────────
  const rulesPath = path.join(paths.projectRoot, "02-协作规范", "rules.md");
  const opsPath = path.join(paths.projectRoot, "02-协作规范", "ops.md");
  const agentsPath = path.join(paths.projectRoot, "02-协作规范", "AGENTS.md");
  const projectStatusPath = path.join(paths.shareRoot, "project-status.json");
  const chainStatusPath = path.join(paths.shareRoot, "sources", "newfee", "chain-status.json");
  const dispatchQueuePath = path.join(paths.shareRoot, "sources", "newfee", "dispatch-queue.json");

  const [rulesContent, opsContent, agentsContent, projectStatusResult, legacyChainStatus, dispatchQueue] = await Promise.all([
    readFileSafe(rulesPath),
    readFileSafe(opsPath),
    readFileSafe(agentsPath),
    loadProjectStatus(paths.shareRoot),
    readJsonSafe<Record<string, { stage: string; summary?: string }>>(chainStatusPath, {}),
    readJsonSafe<{ pendingStart?: string[]; maxConcurrent?: number }>(dispatchQueuePath, {})
  ]);

  const projectStatus = projectStatusResult.readable ? projectStatusResult.value : { requirements: [] };
  const hasProjectStatus = Array.isArray(projectStatus.requirements) && projectStatus.requirements.length > 0;
  const chainStatus = buildDistillChainStatus(projectStatus, legacyChainStatus);

  // ── Build S5 chain set for stale detection ────────────────────────────────
  const s5ChainIds = new Set<string>(
    Object.entries(chainStatus)
      .filter(([, v]) => v.stage === "S5")
      .map(([k]) => k)
  );

  const sourcesProcessed: string[] = [];
  if (rulesContent) sourcesProcessed.push("02-协作规范/rules.md");
  if (opsContent) sourcesProcessed.push("02-协作规范/ops.md");
  if (agentsContent) sourcesProcessed.push("02-协作规范/AGENTS.md");
  if (hasProjectStatus) {
    sourcesProcessed.push("share/project-status.json");
  } else if (Object.keys(chainStatus).length) {
    sourcesProcessed.push("share/sources/newfee/chain-status.json");
  }
  if (!hasProjectStatus && dispatchQueue.pendingStart !== undefined) sourcesProcessed.push("share/sources/newfee/dispatch-queue.json");

  const originalLines = (rulesContent + "\n" + opsContent).split("\n").length;

  // ── Initialize category buckets ───────────────────────────────────────────
  const categoryBuckets = new Map<string, { items: DistilledItem[]; headings: string[] }>(
    CATEGORY_MAP.map((c) => [c.id, { items: [], headings: [] }])
  );

  // ── Process source files: rules.md and ops.md ─────────────────────────────
  for (const [label, content] of [["rules", rulesContent], ["ops", opsContent]] as const) {
    if (!content) continue;
    const sections = parseSections(content);

    for (const section of sections) {
      // Skip meta/title sections
      if (section.level === 1) continue;

      // Skip sections with dates older than 180 days
      if (isSectionDateStale(section.heading)) continue;

      // Skip mostly-file-index sections
      if (isMostlyFileIndex(section.bullets)) continue;

      // Skip implementation-stale sections (S5 chain specifics)
      if (isSectionStaleForChain(section, s5ChainIds)) continue;

      const catId = assignCategory(section.heading);
      const bucket = categoryBuckets.get(catId) ?? categoryBuckets.get("principles")!;
      bucket.headings.push(section.heading);
      const updatedAt = extractSectionUpdatedAt(section, distilledAt);

      // Merge bullets with code blocks where appropriate
      const items = section.bullets.map((b, i) =>
        i === 0 && section.bullets.length === 1
          ? mergeWithCodeBlock(b, section.codeBlocks)
          : b
      );

      // For sections that are mostly code (like script lists), use code blocks directly
      if (section.bullets.length === 0 && section.codeBlocks.length > 0) {
        for (const block of section.codeBlocks) {
          for (const line of block.split("\n")) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith("#") && !isLegacyWorkflowItem(trimmed, hasProjectStatus)) {
              bucket.items.push({ text: trimmed, updatedAt });
            }
          }
        }
      } else {
        bucket.items.push(...items.filter((i) => i.length > 0 && !isLegacyWorkflowItem(i, hasProjectStatus)).map((text) => ({ text, updatedAt })));
      }

      void label;
    }
  }

  // ── AGENTS.md → tools category (authoritative, not deduplicated with ops) ──
  if (agentsContent) {
    const agentSections = parseSections(agentsContent);
    const toolsBucket = categoryBuckets.get("tools")!;
    // Clear any previously added tool items – AGENTS.md is the authority
    toolsBucket.items = [];
    toolsBucket.headings = [];
    for (const sec of agentSections) {
      if (sec.level === 1) continue;
      toolsBucket.headings.push(sec.heading);
        toolsBucket.items.push(...sec.bullets.filter((text) => !isLegacyWorkflowItem(text, hasProjectStatus)).map((text) => ({ text, updatedAt: distilledAt })));
        for (const block of sec.codeBlocks) {
          for (const line of block.split("\n")) {
            const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && !isLegacyWorkflowItem(trimmed, hasProjectStatus)) toolsBucket.items.push({ text: trimmed, updatedAt: distilledAt });
        }
      }
    }
  }

  // ── Live chain progress → progress category ───────────────────────────────
  if (Object.keys(chainStatus).length > 0) {
    const progressBucket = categoryBuckets.get("progress")!;
    progressBucket.items = []; // always rebuild from machine data
    progressBucket.headings = [hasProjectStatus ? "需求与链实时状态（project-status.json）" : "实时链状态（chain-status.json）"];

    const liveItems = buildChainProgressItems(chainStatus, s5ChainIds);
    progressBucket.items.push(...liveItems.map((text) => ({ text, updatedAt: distilledAt })));

    if (hasProjectStatus) {
      const requirementItems = buildRequirementProgressItems(projectStatus);
      progressBucket.items.unshift(...requirementItems.map((text) => ({ text, updatedAt: distilledAt })));
    } else if (dispatchQueue.pendingStart !== undefined) {
      const queueStr = dispatchQueue.pendingStart.length > 0
        ? `待启动队列：${dispatchQueue.pendingStart.join("、")}`
        : "待启动队列：（空）";
      progressBucket.items.unshift(
        { text: queueStr, updatedAt: distilledAt },
        { text: `并发上限：${dispatchQueue.maxConcurrent ?? "?"}`, updatedAt: distilledAt }
      );
    }
  }

  // ── Build result categories ───────────────────────────────────────────────
  const categories: DistilledCategory[] = CATEGORY_MAP.map((c) => {
    const bucket = categoryBuckets.get(c.id)!;
    return {
      id: c.id,
      label: c.label,
      items: pickLatestItems(bucket.items).filter((item) => item.text.length > 2).slice(0, 40),
      sourceHeadings: dedup(bucket.headings)
    };
  }).filter((c) => c.items.length > 0);

  const distilledLines = categories.reduce((sum, c) => sum + c.items.length, 0);
  const compressionRatio = originalLines > 0
    ? Math.round((1 - distilledLines / originalLines) * 100) / 100
    : 0;

  const result: MemoryDistillResult = {
    distilledAt,
    sourcesProcessed,
    categories,
    stats: { originalLines, distilledLines, compressionRatio },
    compressedMemoryPath: "share/memory-distilled.md"
  };

  // ── Write output files ────────────────────────────────────────────────────
  await mkdir(paths.shareRoot, { recursive: true });

  await writeFile(
    path.join(paths.shareRoot, "memory-distilled.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );

  const mdLines: string[] = [
    `# 飞枢系统蒸馏记忆快照`,
    ``,
    `> 生成于 ${distilledAt}，来源：${sourcesProcessed.join("、")}`,
    `> 原始行数 ${originalLines} → 蒸馏后 ${distilledLines} 条，压缩率 ${Math.round(compressionRatio * 100)}%`,
    ``,
    `---`,
    ``
  ];

  for (const cat of categories) {
    mdLines.push(`## ${cat.label}`);
    for (const item of cat.items) {
      mdLines.push(`- ${item.text}（更新于 ${item.updatedAt.slice(0, 10)}）`);
    }
    mdLines.push("");
  }

  mdLines.push(
    `---`,
    ``,
    `> 本文件由 memory-distill-service 自动生成，请勿手动编辑。`,
    `> 源文件：02-协作规范/rules.md（永久原则）+ 02-协作规范/ops.md（操作规范）`
  );

  await writeFile(
    path.join(paths.shareRoot, "memory-distilled.md"),
    mdLines.join("\n"),
    "utf8"
  );

  return result;
}

function buildDistillChainStatus(
  projectStatus: Awaited<ReturnType<typeof loadProjectStatus>>["value"],
  fallback: Record<string, { stage: string; summary?: string }>
) {
  const requirements = Array.isArray(projectStatus.requirements) ? projectStatus.requirements : [];
  const next: Record<string, { stage: string; summary?: string }> = {};

  for (const requirement of requirements) {
    if (!Array.isArray(requirement.chains)) {
      continue;
    }

    for (const chain of requirement.chains) {
      if (typeof chain?.id !== "string" || chain.id.trim().length === 0) {
        continue;
      }

      next[chain.id.trim()] = {
        stage: typeof chain.stage === "string" && chain.stage.trim().length > 0 ? chain.stage : "PENDING",
        summary: typeof chain.summary === "string" ? chain.summary : undefined
      };
    }
  }

  return Object.keys(next).length > 0 ? next : fallback;
}

// ─── Persist / load distill state ────────────────────────────────────────────

export async function loadDistillState(paths: typeof ffPaths): Promise<MemoryDistillState> {
  try {
    return JSON.parse(
      await readFile(path.join(paths.shareRoot, "memory-distill-state.json"), "utf8")
    ) as MemoryDistillState;
  } catch {
    return { lastRanAt: null, lastResult: null, runCount: 0 };
  }
}

export async function saveDistillState(paths: typeof ffPaths, state: MemoryDistillState): Promise<void> {
  await mkdir(paths.shareRoot, { recursive: true });
  await writeFile(
    path.join(paths.shareRoot, "memory-distill-state.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  );
}
