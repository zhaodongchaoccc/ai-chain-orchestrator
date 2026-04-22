import { appendFile, readFile, writeFile } from "node:fs/promises";

import type { ControlInboxItem, ControlInboxStatus } from "../../../shared/event-model";

export async function readControlInbox(filePath: string): Promise<ControlInboxItem[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ControlInboxItem);
  } catch (error) {
    if (error instanceof Error && /ENOENT/u.test(error.message)) {
      return [];
    }

    throw error;
  }
}

export async function appendControlInboxItem(filePath: string, item: ControlInboxItem) {
  await appendFile(filePath, `${JSON.stringify(item)}\n`, "utf8");
}

export async function updateControlInboxItem(filePath: string, eventId: string, patch: Partial<Pick<ControlInboxItem, "status" | "claimedBy" | "resolvedAt">>) {
  const items = await readControlInbox(filePath);
  const nextItems = items.map((item) => (item.eventId === eventId ? { ...item, ...patch } : item));
  if (!nextItems.some((item) => item.eventId === eventId)) {
    throw new Error(`Unknown control inbox event: ${eventId}`);
  }
  await writeFile(filePath, `${nextItems.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  return nextItems.find((item) => item.eventId === eventId)!;
}

export function buildControlInboxItem(input: {
  eventId: string;
  scopeFrom: ControlInboxItem["scopeFrom"];
  scopeTo: ControlInboxItem["scopeTo"];
  sourceId: string;
  chainId: ControlInboxItem["chainId"];
  severity: ControlInboxItem["severity"];
  reason: string;
  requestedAction: string;
  createdAt: string;
}): ControlInboxItem {
  return {
    ...input,
    status: "open",
    claimedBy: null,
    resolvedAt: null
  };
}

export function canResolveControlInboxItem(status: ControlInboxStatus) {
  return status === "open" || status === "claimed" || status === "escalated";
}
