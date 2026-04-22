import assert from "node:assert/strict";
import test from "node:test";

import type { EventRecord } from "../../../shared/event-model";

import { normalizeLegacyEventForDisplay } from "./event-store";

// Pin worktrees root so tests are portable across environments
process.env.FF_WORKTREES_ROOT = "/Users/zhaodongchao/ff-worktrees";

test("normalizeLegacyEventForDisplay rewrites legacy chain session names and resume hints", () => {
  const event: EventRecord = {
    id: "e1",
    type: "action_executed",
    timestamp: "2026-04-02 09:27:17",
    chainId: "ContractAddAndFeeLogEnhancement",
    level: "info",
    title: "合同创建并收费日志补强 已启动链 session",
    summary: "[OK] 已启动 session: chain-ContractAddAndFeeLogEnhancement\n[INFO] 如需恢复上下文，请运行: bash /Users/zhaodongchao/PasObsidian/Projects/飞枢系统/Playbooks/resume-chain-session.sh ContractAddAndFeeLogEnhancement",
    source: "action",
    relatedPath: null,
    relatedSession: "chain-ContractAddAndFeeLogEnhancement",
    actionable: false
  };

  const normalized = normalizeLegacyEventForDisplay(event, "testall");

  assert.match(normalized.summary, /chain-testall-ContractAddAndFeeLogEnhancement/);
  assert.match(normalized.summary, /resume-chain-session\.sh ContractAddAndFeeLogEnhancement testall/);
  assert.equal(normalized.relatedSession, "chain-testall-ContractAddAndFeeLogEnhancement");
});

test("normalizeLegacyEventForDisplay rewrites old workdir hints to source worktree", () => {
  const event: EventRecord = {
    id: "e2",
    type: "action_executed",
    timestamp: "2026-04-02 08:58:39",
    chainId: "ContractAddAndFeeLogEnhancement",
    level: "info",
    title: "合同创建并收费日志补强 已启动链 session",
    summary: "[OK] opencode 工作目录: /Users/zhaodongchao\n[OK] 提示词文件: /tmp/ff-worker-prompt-ContractAddAndFeeLogEnhancement.md",
    source: "action",
    relatedPath: null,
    relatedSession: "chain-ContractAddAndFeeLogEnhancement",
    actionable: false
  };

  const normalized = normalizeLegacyEventForDisplay(event, "testall");

  assert.match(normalized.summary, /\/Users\/zhaodongchao\/ff-worktrees\/testall/);
});

test("normalizeLegacyEventForDisplay does not duplicate already scoped resume hints or workdir", () => {
  const event: EventRecord = {
    id: "e3",
    type: "action_executed",
    timestamp: "2026-04-07 01:23:50",
    chainId: "ContractAddAndFee",
    level: "info",
    title: "合同创建并收费 已启动链 session",
    summary: "[OK] 已启动 session: chain-newfee-ContractAddAndFee\n[INFO] 如需恢复上下文，请运行: bash /Users/zhaodongchao/PasObsidian/Projects/飞枢系统/Playbooks/resume-chain-session.sh ContractAddAndFee newfee\n[OK] opencode 工作目录: /Users/zhaodongchao/ff-worktrees/newfee",
    source: "action",
    relatedPath: null,
    relatedSession: "chain-newfee-ContractAddAndFee",
    actionable: false
  };

  const normalized = normalizeLegacyEventForDisplay(event, "newfee");

  assert.equal(normalized.summary, event.summary);
  assert.equal(normalized.relatedSession, event.relatedSession);
});
