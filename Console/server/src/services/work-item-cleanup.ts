import path from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";

export interface WorkItemCleanupResult {
  scannedFiles: number;
  updatedFiles: number;
  updatedPaths: string[];
}

const LEGACY_RUNTIME_FIELDS = ["mode", "recoverable"] as const;

export async function cleanupLegacyWorkItemRuntimeFields(projectRoot: string): Promise<WorkItemCleanupResult> {
  const shareRoot = path.join(projectRoot, "share");
  const workItemDirs = await collectWorkItemDirs(shareRoot);
  const result: WorkItemCleanupResult = {
    scannedFiles: 0,
    updatedFiles: 0,
    updatedPaths: []
  };

  for (const directory of workItemDirs) {
    const names = await readdir(directory, { withFileTypes: true });
    for (const entry of names) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(directory, entry.name);
      result.scannedFiles += 1;
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      let changed = false;

      for (const field of LEGACY_RUNTIME_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(parsed, field)) {
          delete parsed[field];
          changed = true;
        }
      }

      if (!changed) {
        continue;
      }

      await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
      result.updatedFiles += 1;
      result.updatedPaths.push(filePath);
    }
  }

  return result;
}

async function collectWorkItemDirs(root: string): Promise<string[]> {
  const found = new Set<string>();
  await walk(root, found);
  return [...found].sort();
}

async function walk(directory: string, found: Set<string>): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nextPath = path.join(directory, entry.name);
    if (entry.name === "work-items") {
      found.add(nextPath);
      continue;
    }

    await walk(nextPath, found);
  }
}
