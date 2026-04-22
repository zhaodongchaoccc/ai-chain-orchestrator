import type { ParsedDemandSourceDoc } from "./demand-source-parser";

import { locateDemandSourceDoc, type LocatedDemandSourceDoc } from "./demand-source-manifest";
import { parseDemandSourceDoc } from "./demand-source-parser";
import { generateDemandSourceSkeleton } from "./demand-source-generator";

interface CreateDemandSourceByNameOptions {
  projectRoot: string;
  shareRoot: string;
  mapsRoot: string;
  reviewsRoot: string;
  codeListsRoot: string;
  demandTemplatesRoot: string;
  worktreesRoot: string;
  demandName: string;
}

interface CreateDemandSourceByNameResult {
  locatedDoc: LocatedDemandSourceDoc;
  parsed: ParsedDemandSourceDoc;
  workspace: Awaited<ReturnType<typeof generateDemandSourceSkeleton>>["workspace"];
  entryDocPath: string;
}

export async function createDemandSourceByName(options: CreateDemandSourceByNameOptions): Promise<CreateDemandSourceByNameResult> {
  const locatedDoc = await locateDemandSourceDoc(options.projectRoot, options.demandName);
  const content = await import("node:fs/promises").then(({ readFile }) => readFile(locatedDoc.filePath, "utf8"));
  const parsed = parseDemandSourceDoc({
    demandName: options.demandName,
    relativePath: locatedDoc.relativePath,
    content
  });
  const generated = await generateDemandSourceSkeleton({
    projectRoot: options.projectRoot,
    shareRoot: options.shareRoot,
    mapsRoot: options.mapsRoot,
    reviewsRoot: options.reviewsRoot,
    codeListsRoot: options.codeListsRoot,
    demandTemplatesRoot: options.demandTemplatesRoot,
    worktreesRoot: options.worktreesRoot,
    parsedDoc: parsed
  });

  return {
    locatedDoc,
    parsed,
    workspace: generated.workspace,
    entryDocPath: generated.entryDocPath
  };
}
