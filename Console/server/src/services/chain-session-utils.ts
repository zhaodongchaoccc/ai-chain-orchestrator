import { buildChainSessionName, DEFAULT_SOURCE_ID, normalizeSourceId, parseChainSessionName } from "../../../shared/event-model";

export function getWorkspaceChainSessions(sessionNames: string[], sourceId: string, knownChainIds: Iterable<string>) {
  const normalizedSourceId = normalizeSourceId(sourceId);
  const known = new Set(knownChainIds);

  return sessionNames.filter((sessionName) => {
    const parsed = parseChainSessionName(sessionName);
    if (!parsed) {
      return false;
    }

    if (parsed.sourceId === normalizedSourceId) {
      return known.size === 0 || known.has(parsed.chainId);
    }

    return parsed.legacy && normalizedSourceId === DEFAULT_SOURCE_ID && known.has(parsed.chainId);
  });
}

export function isChainSessionRunning(sessionNames: string[], sourceId: string, chainId: string) {
  const normalizedSourceId = normalizeSourceId(sourceId);

  return sessionNames.some((sessionName) => {
    const parsed = parseChainSessionName(sessionName);
    if (!parsed || parsed.chainId !== chainId) {
      return false;
    }

    return parsed.sourceId === normalizedSourceId || (parsed.legacy && normalizedSourceId === DEFAULT_SOURCE_ID);
  });
}

export function buildWorkspaceChainSessionName(sourceId: string, chainId: string) {
  return buildChainSessionName(sourceId, chainId);
}
