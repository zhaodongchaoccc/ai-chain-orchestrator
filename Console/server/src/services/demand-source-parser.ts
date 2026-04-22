import type { WorkspaceKind } from "../../../shared/event-model";

export interface ParseDemandSourceDocInput {
  demandName: string;
  relativePath: string;
  content: string;
}

export interface ParsedDemandSourceDoc {
  demandName: string;
  relativePath: string;
  title: string | null;
  background: string | null;
  expectedResult: string | null;
  constraints: string | null;
  kind: WorkspaceKind;
  missingFields: Array<"title" | "background" | "expectedResult" | "constraints">;
  draftIncomplete: boolean;
}

const MISSING_FIELD_ORDER = ["title", "background", "constraints", "expectedResult"] as const;

export function parseDemandSourceDoc(input: ParseDemandSourceDocInput): ParsedDemandSourceDoc {
  const title = extractSection(input.content, ["需求标题", "需求"]);
  const background = extractSection(input.content, ["背景"]);
  const expectedResult = extractSection(input.content, ["期望结果"]);
  const constraints = extractSection(input.content, ["约束"]);
  const kind = detectKind(input.relativePath, input.content, input.demandName);
  const missingFields = ([
    ["title", title],
    ["background", background],
    ["expectedResult", expectedResult],
    ["constraints", constraints]
  ] as const)
    .filter(([, value]) => !value)
    .map(([field]) => field)
    .sort((left, right) => MISSING_FIELD_ORDER.indexOf(left) - MISSING_FIELD_ORDER.indexOf(right));

  return {
    demandName: input.demandName,
    relativePath: input.relativePath,
    title,
    background,
    expectedResult,
    constraints,
    kind,
    missingFields,
    draftIncomplete: missingFields.length > 0
  };
}

function detectKind(relativePath: string, content: string, demandName: string): WorkspaceKind {
  if (/组合需求|需求池|不是单个独立功能点/u.test(content) || /组合需求入口/u.test(relativePath) || demandName === "newfee") {
    return "combined";
  }

  return "single";
}

function extractSection(content: string, labels: string[]) {
  const lines = content.split(/\r?\n/u);

  for (const label of labels) {
    const prefix = `${label}：`;
    const fallbackPrefix = `${label}:`;

    for (let index = 0; index < lines.length; index += 1) {
      const currentLine = lines[index]?.trim() ?? "";
      if (!currentLine.startsWith(prefix) && !currentLine.startsWith(fallbackPrefix)) {
        continue;
      }

      const sameLineValue = currentLine.slice(currentLine.indexOf(":") >= 0 ? currentLine.indexOf(":") + 1 : currentLine.indexOf("：") + 1).trim();
      if (sameLineValue) {
        return normalizeValue(sameLineValue);
      }

      const block: string[] = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const nextLine = lines[cursor] ?? "";
        const trimmed = nextLine.trim();
        if (!trimmed) {
          break;
        }
        block.push(trimmed);
      }

      if (block.length > 0) {
        return normalizeValue(block.join("\n"));
      }
    }
  }

  return null;
}

function normalizeValue(value: string) {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).join(" ");
}
