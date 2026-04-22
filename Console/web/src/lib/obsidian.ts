const VAULT_NAME = "PasObsidian";
const PROJECT_PREFIX = "Projects/飞枢系统/";

export function toVaultPath(relativePath: string) {
  return relativePath.startsWith("Projects/") ? relativePath : `${PROJECT_PREFIX}${relativePath}`;
}

export function buildObsidianOpenUrl(relativePath: string) {
  return `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(toVaultPath(relativePath))}`;
}
