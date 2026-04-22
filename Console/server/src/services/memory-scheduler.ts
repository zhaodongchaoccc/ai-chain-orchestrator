import type { ffPaths } from "../config";
import { distillMemory, loadDistillState, saveDistillState } from "./memory-distill-service";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemorySchedulerConfig {
  enabled: boolean;
  /** Hour in local time to run daily distillation (0–23). Default: 2 (02:00) */
  scheduledHour: number;
}

export interface MemorySchedulerStatus extends MemorySchedulerConfig {
  lastRanAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  running: boolean;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

export class MemoryScheduler {
  private readonly paths: typeof ffPaths;
  private readonly config: MemorySchedulerConfig;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(paths: typeof ffPaths, config?: Partial<MemorySchedulerConfig>) {
    this.paths = paths;
    this.config = {
      enabled: config?.enabled ?? true,
      scheduledHour: config?.scheduledHour ?? 2
    };
  }

  /** Start the daily scheduler. Schedules the first run at the next occurrence of scheduledHour. */
  start(): void {
    if (!this.config.enabled) return;
    this.scheduleNext();
  }

  /** Stop the scheduler. */
  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Immediately trigger a distillation run (regardless of schedule). */
  async triggerNow(): Promise<ReturnType<typeof distillMemory>> {
    this.running = true;
    try {
      const result = await distillMemory(this.paths);
      const state = await loadDistillState(this.paths);
      await saveDistillState(this.paths, {
        lastRanAt: result.distilledAt,
        lastResult: result,
        runCount: (state.runCount ?? 0) + 1
      });
      return result;
    } finally {
      this.running = false;
    }
  }

  async getStatus(): Promise<MemorySchedulerStatus> {
    const state = await loadDistillState(this.paths);
    return {
      enabled: this.config.enabled,
      scheduledHour: this.config.scheduledHour,
      lastRanAt: state.lastRanAt,
      nextRunAt: this.computeNextRunAt(),
      runCount: state.runCount,
      running: this.running
    };
  }

  private computeNextRunAt(): string | null {
    if (!this.config.enabled) return null;

    const now = new Date();
    const next = new Date(now);
    next.setHours(this.config.scheduledHour, 0, 0, 0);

    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }

    const pad = (n: number) => String(n).padStart(2, "0");
    return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())} ${pad(next.getHours())}:00:00`;
  }

  private computeMsUntilNextRun(): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(this.config.scheduledHour, 0, 0, 0);

    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }

    return Math.max(0, next.getTime() - now.getTime());
  }

  private scheduleNext(): void {
    const ms = this.computeMsUntilNextRun();
    const pad = (n: number) => String(n).padStart(2, "0");
    const nextDate = new Date(Date.now() + ms);
    console.log(
      `[memory-scheduler] 下次蒸馏任务：${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())} ` +
      `${pad(nextDate.getHours())}:${pad(nextDate.getMinutes())} (${Math.round(ms / 60000)} 分钟后)`
    );

    this.timer = setTimeout(() => {
      void this.runAndReschedule();
    }, ms);
  }

  private async runAndReschedule(): Promise<void> {
    try {
      const result = await this.triggerNow();
      console.log(`[memory-scheduler] 蒸馏完成：${result.distilledAt}，原始 ${result.stats.originalLines} 行 → 蒸馏 ${result.stats.distilledLines} 条`);
    } catch (error) {
      console.error("[memory-scheduler] 蒸馏任务失败：", error instanceof Error ? error.message : String(error));
    } finally {
      this.scheduleNext();
    }
  }
}

/** Singleton instance – created once and reused across the server lifetime. */
let _scheduler: MemoryScheduler | null = null;

export function getMemoryScheduler(paths: typeof ffPaths, config?: Partial<MemorySchedulerConfig>): MemoryScheduler {
  if (!_scheduler) {
    _scheduler = new MemoryScheduler(paths, config);
  }
  return _scheduler;
}
