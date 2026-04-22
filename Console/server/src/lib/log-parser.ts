export function summarizeWatcherLog(logContent: string): string | null {
  const line = logContent
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1);

  if (!line) {
    return null;
  }

  const match = line.match(/^\[(.+?)\]\s*(.+)$/u);
  if (!match) {
    return line;
  }

  return `${match[1]} ${match[2]}`;
}
