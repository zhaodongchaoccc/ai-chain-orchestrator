import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function parseTmuxSessionNames(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/^([^:]+):/u)?.[1]?.trim() ?? null)
    .filter((name): name is string => Boolean(name));
}

export async function listTmuxSessions(): Promise<string[]> {
  const { stdout } = await execFileAsync("tmux", ["ls"]);
  return parseTmuxSessionNames(stdout);
}
