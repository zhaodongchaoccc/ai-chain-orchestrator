import type { ChainCodeListPath, ChainId, ChainMapPath } from "../../../shared/event-model";

interface WorkspaceScope {
  sourceId: string;
  legacyRoot: boolean;
}

export interface WorkspaceChainPaths {
  mapPath: ChainMapPath;
  codeListPath: ChainCodeListPath;
  chainStatusPath: string;
  workItemPath: string;
  manualSessionHoldsPath: string;
  notificationPath: (notificationId: string) => string;
}

export function resolveWorkspaceChainPaths(workspace: WorkspaceScope | undefined, chainId: ChainId): WorkspaceChainPaths {
  const scope = normalizeWorkspaceScope(workspace);
  const mapPath = buildScopedPath("Maps", scope, `${chainId}.md`) as ChainMapPath;
  const codeListPath = buildScopedPath("CodeLists", scope, `${chainId}.md`) as ChainCodeListPath;
  const sharePrefix = scope.legacyRoot ? "share" : `share/sources/${scope.sourceId}`;

  return {
    mapPath,
    codeListPath,
    chainStatusPath: `${sharePrefix}/chain-status.json`,
    workItemPath: `${sharePrefix}/work-items/${chainId}.json`,
    manualSessionHoldsPath: `${sharePrefix}/manual-session-holds.json`,
    notificationPath: (notificationId: string) => `${sharePrefix}/notifications/${notificationId}.md`
  };
}

function normalizeWorkspaceScope(workspace: WorkspaceScope | undefined): WorkspaceScope {
  if (!workspace || workspace.legacyRoot) {
    return {
      sourceId: "newfee",
      legacyRoot: true
    };
  }

  if (!workspace.sourceId) {
    throw new Error("Scoped workspace is missing sourceId");
  }

  return workspace;
}

function buildScopedPath(root: "Maps" | "CodeLists", workspace: WorkspaceScope, fileName: string) {
  const relativePath = workspace.legacyRoot ? `${root}/${fileName}` : `${root}/${workspace.sourceId}/${fileName}`;
  const expectedPrefix = workspace.legacyRoot ? `${root}/` : `${root}/${workspace.sourceId}/`;

  if (!relativePath.startsWith(expectedPrefix)) {
    throw new Error(`Resolved ${root} path escaped workspace scope: ${relativePath}`);
  }

  return relativePath;
}
