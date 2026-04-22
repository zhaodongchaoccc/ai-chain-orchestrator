import assert from "node:assert/strict";
import test from "node:test";

import { parseDemandSourceDoc } from "./demand-source-parser";

test("parseDemandSourceDoc extracts title, background, constraints and expected result from standard template", () => {
  const parsed = parseDemandSourceDoc({
    demandName: "B需求",
    relativePath: "Projects/飞枢系统/B需求.md",
    content: `# B需求

需求标题：
升级 B 流程

背景：
当前 B 流程拆分不清晰。

期望结果：
主控可以基于 B 需求快速拆链。

约束：
先不要改老的 newfee 真值。
`
  });

  assert.equal(parsed.title, "升级 B 流程");
  assert.equal(parsed.background, "当前 B 流程拆分不清晰。");
  assert.equal(parsed.expectedResult, "主控可以基于 B 需求快速拆链。");
  assert.equal(parsed.constraints, "先不要改老的 newfee 真值。");
  assert.equal(parsed.kind, "single");
  assert.deepEqual(parsed.missingFields, []);
});

test("parseDemandSourceDoc classifies combined demand sources using explicit combined hints", () => {
  const parsed = parseDemandSourceDoc({
    demandName: "newfee",
    relativePath: "Projects/飞枢系统/demands与模板/10-组合需求入口（newfee）.md",
    content: `# 组合需求入口（newfee）

## 当前定位
- newfee.md 是当前 ff 项目的组合型需求源文件
- 它记录的是一组相关能力升级，不是单个独立功能点
`
  });

  assert.equal(parsed.kind, "combined");
});

test("parseDemandSourceDoc reports missing fields for incomplete template docs", () => {
  const parsed = parseDemandSourceDoc({
    demandName: "C需求",
    relativePath: "Projects/飞枢系统/C需求.md",
    content: `# C需求

背景：
只有背景，没有标题和约束。
`
  });

  assert.equal(parsed.kind, "single");
  assert.deepEqual(parsed.missingFields, ["title", "constraints", "expectedResult"]);
  assert.equal(parsed.draftIncomplete, true);
});
