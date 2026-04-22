import type { ChainDetailResponse, ChainState, DispatchQueueState, MainControlResumePacket } from "../../../shared/event-model";

export interface ResumePacketStaleness {
  stale: boolean;
  reasons: string[];
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const packetMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/u);
  if (packetMatch) {
    const [, year, month, day, hour, minute] = packetMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0).getTime();
  }

  const secondMatch = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/u);
  if (secondMatch) {
    const [, year, month, day, hour, minute, second = "0"] = secondMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime();
  }

  const dayMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (dayMatch) {
    const [, year, month, day] = dayMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0).getTime();
  }

  return null;
}

export function getMainControlResumeStaleness(packet: MainControlResumePacket | null | undefined, chains: ChainState[], queue: DispatchQueueState): ResumePacketStaleness {
  if (!packet) {
    return { stale: false, reasons: [] };
  }

  const packetTime = parseTimestamp(packet.generatedAt);
  if (packetTime === null) {
    return { stale: true, reasons: ["恢复包生成时间无法识别。"] };
  }

  const reasons: string[] = [];
  const queueTime = parseTimestamp(queue.updatedAt);
  if (queueTime !== null && queueTime > packetTime) {
    reasons.push("队列更新时间更新，主控恢复包可能已过期。");
  }

  for (const chain of chains) {
    const tracked = packet.trackedChains[chain.id];
    const chainUpdatedAt = parseTimestamp(chain.updatedAt);
    const workItemUpdatedAt = parseTimestamp(chain.workItemUpdatedAt);
    if (chainUpdatedAt !== null && chainUpdatedAt > packetTime) {
      reasons.push(`${chain.id} 的链状态已更新，主控恢复包可能已过期。`);
      break;
    }
    if (workItemUpdatedAt !== null && workItemUpdatedAt > packetTime) {
      reasons.push(`${chain.id} 的 work-item 已更新，主控恢复包可能已过期。`);
      break;
    }
    if (tracked && tracked.mode !== (chain.workItemMode ?? tracked.mode)) {
      reasons.push(`${chain.id} 的模式已变化，主控恢复包可能已过期。`);
      break;
    }
  }

  return { stale: reasons.length > 0, reasons };
}

export function getChainResumeStaleness(detail: ChainDetailResponse): ResumePacketStaleness {
  const packet = detail.chainResume;
  if (!packet) {
    return { stale: false, reasons: [] };
  }

  const packetTime = parseTimestamp(packet.generatedAt);
  if (packetTime === null) {
    return { stale: true, reasons: ["恢复包生成时间无法识别。"] };
  }

  const reasons: string[] = [];
  const chainUpdatedAt = parseTimestamp(detail.chain.updatedAt);
  const workItemUpdatedAt = parseTimestamp(detail.workItem?.updatedAt ?? null);
  if (chainUpdatedAt !== null && chainUpdatedAt > packetTime) {
    reasons.push("链状态晚于恢复包生成时间。");
  }
  if (workItemUpdatedAt !== null && workItemUpdatedAt > packetTime) {
    reasons.push("work-item 晚于恢复包生成时间。");
  }
  if (packet.stage !== detail.chain.stage) {
    reasons.push("恢复包中的阶段与当前链状态不一致。");
  }
  if (detail.workItem && packet.mode !== detail.workItem.mode) {
    reasons.push("恢复包中的模式与当前 work-item 不一致。");
  }

  return { stale: reasons.length > 0, reasons };
}
