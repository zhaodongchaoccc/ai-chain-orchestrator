import path from "node:path";

import { cleanupLegacyWorkItemRuntimeFields } from "../services/work-item-cleanup";

async function main() {
  const projectRoot = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "../../../..");

  const result = await cleanupLegacyWorkItemRuntimeFields(projectRoot);
  process.stdout.write(`${JSON.stringify({
    projectRoot,
    scanned_files: result.scannedFiles,
    updated_files: result.updatedFiles,
    updated_paths: result.updatedPaths
  }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
