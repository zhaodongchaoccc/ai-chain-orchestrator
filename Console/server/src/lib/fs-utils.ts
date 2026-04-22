import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface SafeReadResult<T> {
  readable: boolean;
  value: T;
  detail?: string;
}

export interface MarkdownFileRecord {
  name: string;
  relativePath: string;
  absolutePath: string;
  content: string;
}

export async function readTextFileSafe(filePath: string, fallback = ""): Promise<SafeReadResult<string>> {
  try {
    const value = await readFile(filePath, "utf8");
    return { readable: true, value };
  } catch (error) {
    return { readable: false, value: fallback, detail: toErrorDetail(error) };
  }
}

export async function readJsonFileSafe<T>(filePath: string, fallback: T): Promise<SafeReadResult<T>> {
  const textResult = await readTextFileSafe(filePath);

  if (!textResult.readable) {
    return { readable: false, value: fallback, detail: textResult.detail };
  }

  try {
    return { readable: true, value: JSON.parse(textResult.value) as T };
  } catch (error) {
    return { readable: false, value: fallback, detail: toErrorDetail(error) };
  }
}

export async function readMarkdownFilesSafe(dirPath: string, relativeRoot: string): Promise<SafeReadResult<MarkdownFileRecord[]>> {
  try {
    const names = (await readdir(dirPath)).filter((name) => name.endsWith(".md")).sort();
    const files = await Promise.all(
      names.map(async (name) => {
        const absolutePath = path.join(dirPath, name);
        const content = await readFile(absolutePath, "utf8");

        return {
          name,
          absolutePath,
          relativePath: path.join(relativeRoot, name).replace(/\\/g, "/"),
          content
        };
      })
    );

    return { readable: true, value: files };
  } catch (error) {
    return { readable: false, value: [], detail: toErrorDetail(error) };
  }
}

function toErrorDetail(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
