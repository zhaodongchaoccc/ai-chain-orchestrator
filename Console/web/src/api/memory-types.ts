export interface DistilledItem {
  text: string;
  updatedAt: string;
}

export interface DistilledCategory {
  id: string;
  label: string;
  items: Array<DistilledItem | string>;
  sourceHeadings: string[];
}

export interface MemoryDistillResult {
  distilledAt: string;
  sourcesProcessed: string[];
  categories: DistilledCategory[];
  stats: {
    originalLines: number;
    distilledLines: number;
    compressionRatio: number;
  };
  compressedMemoryPath: string;
}

export interface MemorySchedulerStatus {
  enabled: boolean;
  scheduledHour: number;
  lastRanAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  running: boolean;
}
