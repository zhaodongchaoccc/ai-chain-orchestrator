import os from "node:os";
import path from "node:path";

import { serverConfig } from "../config";
import { createDemandSourceByName } from "../services/create-demand-source";

async function main() {
  const demandName = process.argv.slice(2).join(" ").trim();

  if (!demandName) {
    throw new Error("Usage: create-demand-source <需求名>");
  }

  const result = await createDemandSourceByName({
    projectRoot: serverConfig.paths.projectRoot,
    shareRoot: serverConfig.paths.shareRoot,
    mapsRoot: serverConfig.paths.mapsRoot,
    reviewsRoot: serverConfig.paths.reviewsRoot,
    codeListsRoot: serverConfig.paths.projectRoot + "/CodeLists",
    demandTemplatesRoot: serverConfig.paths.projectRoot + "/demands与模板",
    worktreesRoot: process.env.FF_WORKTREES_ROOT ?? path.join(process.env.HOME ?? os.homedir(), "ff-worktrees"),
    demandName
  });

  process.stdout.write(`${JSON.stringify({
    demandName,
    sourceId: result.workspace.sourceId,
    sourceDocPath: result.workspace.sourceDocPath,
    kind: result.workspace.kind,
    draftIncomplete: result.workspace.draftIncomplete,
    entryDocPath: result.entryDocPath,
    suggestedOverviewPath: `/ws/${result.workspace.sourceId}/overview`
  }, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
