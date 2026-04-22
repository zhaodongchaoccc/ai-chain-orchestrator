import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadControlPlaneSources } from "./state-loader";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

async function makeFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-console-state-loader-"));
  const shareRoot = path.join(projectRoot, "share");
  const workItemsRoot = path.join(shareRoot, "work-items");
  const playbooksRoot = path.join(projectRoot, "Playbooks");
  const mapsRoot = path.join(projectRoot, "Maps");
  const reviewsRoot = path.join(projectRoot, "Reviews");
  const notificationsRoot = path.join(projectRoot, "notifications");
  const sessionsRoot = path.join(projectRoot, "Sessions");
  const sourceSessionsRoot = path.join(sessionsRoot, "sources", "newfee");
  const chainResumeRoot = path.join(sourceSessionsRoot, "chain-resume");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(workItemsRoot, { recursive: true }),
    mkdir(playbooksRoot, { recursive: true }),
    mkdir(mapsRoot, { recursive: true }),
    mkdir(reviewsRoot, { recursive: true }),
    mkdir(notificationsRoot, { recursive: true }),
    mkdir(chainResumeRoot, { recursive: true })
  ]);

  await Promise.all([
    writeJson(path.join(shareRoot, "chain-registry.json"), [
      { id: "HomepageReminder", nameZh: "首页合同到期提醒", priorityWave: "P1", sequence: 10, enabled: true }
    ]),
    writeJson(path.join(shareRoot, "chain-status.json"), {
      HomepageReminder: { stage: "S1", updatedAt: "2026-03-28 10:00:00", summary: "blocked", blocked: true }
    }),
    writeJson(path.join(shareRoot, "dispatch-queue.json"), {
      maxConcurrent: 2,
      pendingStart: ["HomepageReminder"],
      nextCandidate: "HomepageReminder",
      updatedAt: "2026-03-28 10:00:00"
    }),
    writeJson(path.join(shareRoot, "scheduler-state.json"), {
      desiredState: "running",
      updatedAt: "2026-03-28 10:00:00",
      updatedBy: "resume-scheduler.sh"
    }),
    writeJson(path.join(shareRoot, "chinese-chain-names.json"), {
      HomepageReminder: "首页合同到期提醒"
    }),
    writeJson(path.join(workItemsRoot, "HomepageReminder.json"), {
      chainId: "HomepageReminder",
      mode: "blocked",
      currentTask: "保持阻塞并记录恢复条件",
      expectedOutput: "输出阻塞原因与恢复条件",
      allowedActions: ["确认阻塞原因", "确认恢复条件"],
      forbiddenActions: ["实现", "测试验证"],
      lastVerifiedAt: "2026-03-28 10:00:00"
    }),
    writeFile(path.join(shareRoot, "action-events.jsonl"), ""),
    writeFile(path.join(playbooksRoot, "dispatch-watcher.pid"), "1234\n"),
    writeFile(path.join(playbooksRoot, "dispatch-watcher.log"), "[2026-03-28 10:00:00] 当前有效并发: 1/2\n"),
    writeFile(path.join(mapsRoot, "HomepageReminder.md"), "# HomepageReminder\n\n## 当前阶段状态\n- S1 阶段：已标识阻塞\n"),
    writeFile(path.join(mapsRoot, "PaymentPermissionAdjustment.md"), "# PaymentPermissionAdjustment\n\n## 当前阶段状态\n- PENDING 阶段：待定\n"),
    writeFile(path.join(reviewsRoot, "Wave2-P1.md"), "# Wave2-P1\n"),
    writeJson(path.join(sourceSessionsRoot, "main-control-resume.json"), {
      generatedAt: "2026-03-28-1000",
      handoffPath: "Projects/飞枢系统/Sessions/sources/newfee/2026-03-28-1000-main-control-handoff.md",
      running: ["HomepageReminder"],
      pending: [],
      blocked: ["HomepageReminder"],
      rollback: [],
      completedKept: [],
      queue: { pendingStart: [], nextCandidate: null, updatedAt: "2026-03-28 10:00:00" },
      trackedChains: {},
      workItems: {},
      delta: { changedChains: [], queueAdded: [], queueRemoved: [], modeChanged: [], taskChanged: [] }
    }),
    writeJson(path.join(chainResumeRoot, "HomepageReminder.json"), {
      generatedAt: "2026-03-28-1000",
      chainId: "HomepageReminder",
      stage: "S1",
      summary: "blocked",
      mode: "blocked",
      currentTask: "确认阻塞原因与恢复条件",
      recoverable: false,
      queued: false,
      sessionRunning: true,
      blocked: true,
      rollback: false,
      paths: {
        map: "Projects/飞枢系统/Maps/HomepageReminder.md",
        codeList: "Projects/飞枢系统/CodeLists/HomepageReminder.md",
        workItem: "Projects/飞枢系统/share/work-items/HomepageReminder.json"
      },
      delta: {
        stageChanged: false,
        modeChanged: false,
        taskChanged: false,
        summaryChanged: false,
        queuedChanged: false,
        sessionRunningChanged: false
      }
    }),
    writeFile(
      path.join(notificationsRoot, "20260328-1005-HomepageReminder.md"),
      "---\nchain: HomepageReminder\nupdatedAt: 2026-03-28 10:05\nsummary: HomepageReminder blocked.\n---\n# 阻塞通知\n需要主控检查。\n"
    ),
    writeFile(
      path.join(notificationsRoot, "20260328-1010-OperationLogTracking.md"),
      "# 无 frontmatter 通知\n仅用于测试 fallback。\n"
    )
  ]);

  return { projectRoot, shareRoot, playbooksRoot, mapsRoot, reviewsRoot, notificationsRoot };
}

test("loadControlPlaneSources loads work-items when present", async () => {
  const fixture = await makeFixture();
  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-HomepageReminder"],
      isProcessAlive: async () => true
    }
  );

  assert.equal(sources.workItems.HomepageReminder?.mode, "blocked");
  assert.equal(sources.workItems.HomepageReminder?.currentTask, "保持阻塞并记录恢复条件");
  assert.equal(sources.mainControlResume?.handoffPath, "Projects/飞枢系统/Sessions/sources/newfee/2026-03-28-1000-main-control-handoff.md");
  assert.equal(sources.chainResumePackets.HomepageReminder?.mode, "blocked");
});

test("loadControlPlaneSources prefers newfee source-scoped session artifacts for the default workspace", async () => {
  const fixture = await makeFixture();
  const scopedSessionsRoot = path.join(fixture.projectRoot, "Sessions", "sources", "newfee");
  const scopedChainResumeRoot = path.join(scopedSessionsRoot, "chain-resume");

  await mkdir(scopedChainResumeRoot, { recursive: true });
  await Promise.all([
    writeJson(path.join(scopedSessionsRoot, "main-control-resume.json"), {
      generatedAt: "2026-03-28-1005",
      handoffPath: "Projects/飞枢系统/Sessions/sources/newfee/2026-03-28-1005-main-control-handoff.md",
      running: ["HomepageReminder"],
      pending: [],
      blocked: [],
      rollback: [],
      completedKept: [],
      queue: { pendingStart: [], nextCandidate: null, updatedAt: "2026-03-28 10:05:00" },
      trackedChains: {},
      workItems: {},
      delta: { changedChains: [], queueAdded: [], queueRemoved: [], modeChanged: [], taskChanged: [] }
    }),
    writeJson(path.join(scopedChainResumeRoot, "HomepageReminder.json"), {
      generatedAt: "2026-03-28-1005",
      chainId: "HomepageReminder",
      stage: "S1",
      summary: "active",
      mode: "active",
      currentTask: "恢复 newfee 上下文",
      recoverable: true,
      queued: false,
      sessionRunning: true,
      blocked: false,
      rollback: false,
      paths: {
        map: "Projects/飞枢系统/Maps/newfee/HomepageReminder.md",
        codeList: "Projects/飞枢系统/CodeLists/newfee/HomepageReminder.md",
        workItem: "Projects/飞枢系统/share/sources/newfee/work-items/HomepageReminder.json"
      },
      delta: {
        stageChanged: false,
        modeChanged: false,
        taskChanged: false,
        summaryChanged: false,
        queuedChanged: false,
        sessionRunningChanged: false
      }
    })
  ]);

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-HomepageReminder"],
      isProcessAlive: async () => true
    }
  );

  assert.equal(sources.mainControlResume?.handoffPath, "Projects/飞枢系统/Sessions/sources/newfee/2026-03-28-1005-main-control-handoff.md");
  assert.equal(sources.chainResumePackets.HomepageReminder?.currentTask, "恢复 newfee 上下文");
});

test("loadControlPlaneSources reads source runtime state policy and control inbox for scoped workspaces", async () => {
  const fixture = await makeFixture();
  const scopedShareRoot = path.join(fixture.shareRoot, "sources", "testall");
  const scopedWorkItemsRoot = path.join(scopedShareRoot, "work-items");
  const scopedNotificationsRoot = path.join(scopedShareRoot, "notifications");
  const scopedMapsRoot = path.join(fixture.mapsRoot, "testall");
  const scopedReviewsRoot = path.join(fixture.reviewsRoot, "testall");
  const globalDir = path.join(fixture.projectRoot, "share", "global");

  await Promise.all([
    mkdir(scopedShareRoot, { recursive: true }),
    mkdir(scopedWorkItemsRoot, { recursive: true }),
    mkdir(scopedNotificationsRoot, { recursive: true }),
    mkdir(scopedMapsRoot, { recursive: true }),
    mkdir(scopedReviewsRoot, { recursive: true }),
    mkdir(globalDir, { recursive: true })
  ]);

  await Promise.all([
    writeJson(path.join(scopedShareRoot, "chain-registry.json"), [
      { id: "HomepageReminder", nameZh: "首页合同到期提醒", priorityWave: "P1", sequence: 10, enabled: true }
    ]),
    writeJson(path.join(scopedShareRoot, "chain-status.json"), {
      HomepageReminder: { stage: "S1", updatedAt: "2026-03-28 10:00:00", summary: "active" }
    }),
    writeJson(path.join(scopedShareRoot, "dispatch-queue.json"), {
      maxConcurrent: 1,
      pendingStart: [],
      nextCandidate: null,
      updatedAt: "2026-03-28 10:00:00"
    }),
    writeJson(path.join(scopedShareRoot, "scheduler-state.json"), {
      desiredState: "running",
      updatedAt: "2026-03-28 10:00:00",
      updatedBy: "resume-scheduler.sh"
    }),
    writeJson(path.join(scopedShareRoot, "chinese-chain-names.json"), {
      HomepageReminder: "首页合同到期提醒"
    }),
    writeJson(path.join(scopedShareRoot, "policy.json"), {
      autoSleep: true,
      idleSleepMinutes: 45,
      pinned: true,
      maxConcurrentChains: 2
    }),
    writeFile(path.join(scopedShareRoot, "control-inbox.jsonl"), '{"eventId":"control:1","scopeFrom":"chain","scopeTo":"source","sourceId":"testall","chainId":"HomepageReminder","severity":"warning","reason":"need","requestedAction":"confirm","status":"open","createdAt":"2026-04-03 10:00:00","claimedBy":null,"resolvedAt":null}\n'),
    writeJson(path.join(globalDir, "orchestration-state.json"), {
      maxRunningSources: 5,
      runningSources: ["testall"],
      sourceStates: {
        testall: {
          sourceId: "testall",
          runtimeState: "pinned",
          lastActiveAt: "2026-04-03T10:00:00Z",
          pinned: true
        }
      },
      updatedAt: "2026-04-03 10:05:00"
    }),
    writeFile(path.join(scopedShareRoot, "action-events.jsonl"), ""),
    writeFile(path.join(scopedMapsRoot, "HomepageReminder.md"), "# HomepageReminder\n"),
    writeFile(path.join(scopedReviewsRoot, "Wave2-P1.md"), "# Wave2-P1\n")
  ]);

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: scopedShareRoot,
      actionEventsPath: path.join(scopedShareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: scopedMapsRoot,
      reviewsRoot: scopedReviewsRoot,
      notificationsRoot: scopedNotificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-testall-HomepageReminder"],
      isProcessAlive: async () => true
    }
  );

  assert.equal(sources.sourceRuntimeState?.runtimeState, "pinned");
  assert.equal(sources.sourcePolicy?.idleSleepMinutes, 45);
  assert.equal(sources.controlInboxItems[0]?.eventId, "control:1");
  assert.equal(sources.orchestrationState?.runningSources[0], "testall");
});

test("loadControlPlaneSources preserves Defect work-item metadata for scoped workspaces", async () => {
  const fixture = await makeFixture();
  const scopedShareRoot = path.join(fixture.shareRoot, "sources", "testall");
  const scopedWorkItemsRoot = path.join(scopedShareRoot, "work-items");
  const scopedNotificationsRoot = path.join(scopedShareRoot, "notifications");
  const scopedMapsRoot = path.join(fixture.mapsRoot, "testall");
  const scopedReviewsRoot = path.join(fixture.reviewsRoot, "testall");

  await Promise.all([
    mkdir(scopedShareRoot, { recursive: true }),
    mkdir(scopedWorkItemsRoot, { recursive: true }),
    mkdir(scopedNotificationsRoot, { recursive: true }),
    mkdir(scopedMapsRoot, { recursive: true }),
    mkdir(scopedReviewsRoot, { recursive: true })
  ]);

  await Promise.all([
    writeJson(path.join(scopedShareRoot, "chain-registry.json"), [
      { id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true }
    ]),
    writeJson(path.join(scopedShareRoot, "chain-status.json"), {
      Defect: { stage: "PENDING", updatedAt: "2026-04-03 10:00:00", summary: "缺陷专用容器链，默认空闲，等待缺陷进入" }
    }),
    writeJson(path.join(scopedShareRoot, "dispatch-queue.json"), {
      maxConcurrent: 1,
      pendingStart: [],
      nextCandidate: null,
      updatedAt: "2026-04-03 10:00:00"
    }),
    writeJson(path.join(scopedShareRoot, "scheduler-state.json"), {
      desiredState: "paused",
      updatedAt: "2026-04-03 10:00:00",
      updatedBy: "test"
    }),
    writeJson(path.join(scopedShareRoot, "chinese-chain-names.json"), {
      Defect: "缺陷处理"
    }),
    writeJson(path.join(scopedWorkItemsRoot, "Defect.json"), {
      chainId: "Defect",
      mode: "hold",
      currentTask: "定位合同收费列表金额显示错误",
      expectedOutput: "输出根因与修复验证范围",
      allowedActions: ["恢复上下文", "缺陷归因", "最小修复方案"],
      forbiddenActions: ["擅自扩展为新功能"],
      sourceChainId: "ContractAddAndFee",
      severity: "high",
      regression: true,
      expectedBehavior: "列表金额应显示合同明细金额",
      actualBehavior: "列表金额显示为 0",
      verificationScope: ["ContractControllerTest", "合同收费列表人工回归"]
    }),
    writeFile(path.join(scopedShareRoot, "action-events.jsonl"), ""),
    writeFile(path.join(scopedMapsRoot, "Defect.md"), "# Defect\n"),
    writeFile(path.join(scopedReviewsRoot, "Wave3-P2.md"), "# Wave3-P2\n")
  ]);

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: scopedShareRoot,
      actionEventsPath: path.join(scopedShareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: scopedMapsRoot,
      reviewsRoot: scopedReviewsRoot,
      notificationsRoot: scopedNotificationsRoot
    },
    {
      listTmuxSessions: async () => [],
      isProcessAlive: async () => true
    }
  );

  assert.equal(sources.workItems.Defect?.sourceChainId, "ContractAddAndFee");
  assert.equal(sources.workItems.Defect?.severity, "high");
  assert.equal(sources.workItems.Defect?.regression, true);
  assert.equal(sources.workItems.Defect?.expectedBehavior, "列表金额应显示合同明细金额");
  assert.equal(sources.workItems.Defect?.actualBehavior, "列表金额显示为 0");
  assert.deepEqual(sources.workItems.Defect?.verificationScope, ["ContractControllerTest", "合同收费列表人工回归"]);
});

test("loadControlPlaneSources reads defect-items for scoped workspaces", async () => {
  const fixture = await makeFixture();
  const scopedShareRoot = path.join(fixture.shareRoot, "sources", "testall");
  const scopedWorkItemsRoot = path.join(scopedShareRoot, "work-items");
  const scopedDefectItemsRoot = path.join(scopedShareRoot, "defect-items");
  const scopedNotificationsRoot = path.join(scopedShareRoot, "notifications");
  const scopedMapsRoot = path.join(fixture.mapsRoot, "testall");
  const scopedReviewsRoot = path.join(fixture.reviewsRoot, "testall");

  await Promise.all([
    mkdir(scopedShareRoot, { recursive: true }),
    mkdir(scopedWorkItemsRoot, { recursive: true }),
    mkdir(scopedDefectItemsRoot, { recursive: true }),
    mkdir(scopedNotificationsRoot, { recursive: true }),
    mkdir(scopedMapsRoot, { recursive: true }),
    mkdir(scopedReviewsRoot, { recursive: true })
  ]);

  await Promise.all([
    writeJson(path.join(scopedShareRoot, "chain-registry.json"), [
      { id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true }
    ]),
    writeJson(path.join(scopedShareRoot, "chain-status.json"), {
      Defect: { stage: "PENDING", updatedAt: "2026-04-03 10:00:00", summary: "缺陷专用容器链，默认空闲，等待缺陷进入" }
    }),
    writeJson(path.join(scopedShareRoot, "dispatch-queue.json"), {
      maxConcurrent: 1,
      pendingStart: [],
      nextCandidate: null,
      updatedAt: "2026-04-03 10:00:00"
    }),
    writeJson(path.join(scopedShareRoot, "scheduler-state.json"), {
      desiredState: "paused",
      updatedAt: "2026-04-03 10:00:00",
      updatedBy: "test"
    }),
    writeJson(path.join(scopedShareRoot, "chinese-chain-names.json"), {
      Defect: "缺陷处理"
    }),
    writeJson(path.join(scopedWorkItemsRoot, "Defect.json"), {
      chainId: "Defect",
      mode: "hold",
      currentTask: "跟进最近 1 条缺陷"
    }),
    writeJson(path.join(scopedDefectItemsRoot, "2026-04-03-100500-OperationLogTracking-001.json"), {
      sourceChainId: "OperationLogTracking",
      reason: "分页日志缺少合同 ID",
      severity: "high",
      regression: true,
      expectedBehavior: "分页日志应包含合同 ID",
      actualBehavior: "当前响应缺少合同 ID",
      verificationScope: ["OperationLogTracking 单测"],
      createdAt: "2026-04-03 10:05:00",
      createdBy: "main-control-testall"
    }),
    writeFile(path.join(scopedShareRoot, "action-events.jsonl"), ""),
    writeFile(path.join(scopedMapsRoot, "Defect.md"), "# Defect\n"),
    writeFile(path.join(scopedReviewsRoot, "Wave3-P2.md"), "# Wave3-P2\n")
  ]);

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: scopedShareRoot,
      actionEventsPath: path.join(scopedShareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: scopedMapsRoot,
      reviewsRoot: scopedReviewsRoot,
      notificationsRoot: scopedNotificationsRoot
    },
    {
      listTmuxSessions: async () => [],
      isProcessAlive: async () => true
    }
  );

  assert.equal(sources.defectItems.Defect?.length, 1);
  assert.equal(sources.defectItems.Defect?.[0]?.sourceChainId, "OperationLogTracking");
});

test("loadControlPlaneSources marks work-items unreadable when a work-item file is malformed", async () => {
  const fixture = await makeFixture();

  await writeFile(path.join(fixture.shareRoot, "work-items", "HomepageReminder.json"), "not json");

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-HomepageReminder"],
      isProcessAlive: async () => true
    }
  );

  assert.equal(sources.healthChecks.workItems?.readable, false);
});

test("loadControlPlaneSources parses notification frontmatter and filename fallback", async () => {
  const fixture = await makeFixture();
  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-HomepageReminder"],
      isProcessAlive: async () => true
    }
  );

  const structured = sources.notifications.find((item) => item.id === "20260328-1005-HomepageReminder");
  const fallback = sources.notifications.find((item) => item.id === "20260328-1010-OperationLogTracking");

  assert.equal(structured?.targetId, "HomepageReminder");
  assert.equal(structured?.timestamp, "2026-03-28 10:05");
  assert.equal(structured?.summary, "HomepageReminder blocked.");
  assert.equal(fallback?.targetId, "OperationLogTracking");
  assert.equal(fallback?.timestamp, "2026-03-28 10:10");
  assert.equal(fallback?.title, "无 frontmatter 通知");
});

test("loadControlPlaneSources parses map stages including PENDING", async () => {
  const fixture = await makeFixture();
  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => [],
      isProcessAlive: async () => true
    }
  );

  assert.equal(sources.mapStages.HomepageReminder, "S1");
  assert.equal(sources.mapStages.PaymentPermissionAdjustment, "PENDING");
});

test("loadControlPlaneSources keeps tmux visibility for scoped workspaces", async () => {
  const fixture = await makeFixture();
  const scopedShareRoot = path.join(fixture.shareRoot, "sources", "testall");
  const scopedWorkItemsRoot = path.join(scopedShareRoot, "work-items");
  const scopedNotificationsRoot = path.join(scopedShareRoot, "notifications");
  const scopedMapsRoot = path.join(fixture.mapsRoot, "testall");
  const scopedReviewsRoot = path.join(fixture.reviewsRoot, "testall");

  await Promise.all([
    mkdir(scopedShareRoot, { recursive: true }),
    mkdir(scopedWorkItemsRoot, { recursive: true }),
    mkdir(scopedNotificationsRoot, { recursive: true }),
    mkdir(scopedMapsRoot, { recursive: true }),
    mkdir(scopedReviewsRoot, { recursive: true })
  ]);

  await Promise.all([
    writeJson(path.join(scopedShareRoot, "chain-registry.json"), [
      { id: "HomepageReminder", nameZh: "首页合同到期提醒", priorityWave: "P1", sequence: 10, enabled: true }
    ]),
    writeJson(path.join(scopedShareRoot, "chain-status.json"), {
      HomepageReminder: { stage: "S1", updatedAt: "2026-03-28 10:00:00", summary: "active" }
    }),
    writeJson(path.join(scopedShareRoot, "dispatch-queue.json"), {
      maxConcurrent: 1,
      pendingStart: [],
      nextCandidate: null,
      updatedAt: "2026-03-28 10:00:00"
    }),
    writeJson(path.join(scopedShareRoot, "scheduler-state.json"), {
      desiredState: "running",
      updatedAt: "2026-03-28 10:00:00",
      updatedBy: "resume-scheduler.sh"
    }),
    writeJson(path.join(scopedShareRoot, "chinese-chain-names.json"), {
      HomepageReminder: "首页合同到期提醒"
    }),
    writeJson(path.join(scopedWorkItemsRoot, "HomepageReminder.json"), {
      chainId: "HomepageReminder",
      mode: "active",
      currentTask: "恢复上下文",
      expectedOutput: "输出下一步",
      allowedActions: ["恢复上下文"],
      forbiddenActions: ["直接实现"]
    }),
    writeFile(path.join(scopedShareRoot, "action-events.jsonl"), ""),
    writeFile(path.join(scopedMapsRoot, "HomepageReminder.md"), "# HomepageReminder\n"),
    writeFile(path.join(scopedReviewsRoot, "Wave2-P1.md"), "# Wave2-P1\n")
  ]);

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: scopedShareRoot,
      actionEventsPath: path.join(scopedShareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: scopedMapsRoot,
      reviewsRoot: scopedReviewsRoot,
      notificationsRoot: scopedNotificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-HomepageReminder"],
      isProcessAlive: async () => true
    }
  );

  assert.deepEqual(sources.tmuxSessions, ["chain-HomepageReminder"]);
  assert.equal(sources.healthChecks.tmux?.readable, true);
});

test("loadControlPlaneSources reads source-scoped session artifacts for scoped workspaces", async () => {
  const fixture = await makeFixture();
  const scopedShareRoot = path.join(fixture.shareRoot, "sources", "testall");
  const scopedWorkItemsRoot = path.join(scopedShareRoot, "work-items");
  const scopedNotificationsRoot = path.join(scopedShareRoot, "notifications");
  const scopedMapsRoot = path.join(fixture.mapsRoot, "testall");
  const scopedReviewsRoot = path.join(fixture.reviewsRoot, "testall");
  const scopedSessionsRoot = path.join(fixture.projectRoot, "Sessions", "sources", "testall");
  const scopedChainResumeRoot = path.join(scopedSessionsRoot, "chain-resume");

  await Promise.all([
    mkdir(scopedShareRoot, { recursive: true }),
    mkdir(scopedWorkItemsRoot, { recursive: true }),
    mkdir(scopedNotificationsRoot, { recursive: true }),
    mkdir(scopedMapsRoot, { recursive: true }),
    mkdir(scopedReviewsRoot, { recursive: true }),
    mkdir(scopedChainResumeRoot, { recursive: true })
  ]);

  await Promise.all([
    writeJson(path.join(scopedShareRoot, "chain-registry.json"), [
      { id: "HomepageReminder", nameZh: "首页合同到期提醒", priorityWave: "P1", sequence: 10, enabled: true }
    ]),
    writeJson(path.join(scopedShareRoot, "chain-status.json"), {
      HomepageReminder: { stage: "S1", updatedAt: "2026-03-28 10:00:00", summary: "active" }
    }),
    writeJson(path.join(scopedShareRoot, "dispatch-queue.json"), {
      maxConcurrent: 1,
      pendingStart: [],
      nextCandidate: null,
      updatedAt: "2026-03-28 10:00:00"
    }),
    writeJson(path.join(scopedShareRoot, "scheduler-state.json"), {
      desiredState: "running",
      updatedAt: "2026-03-28 10:00:00",
      updatedBy: "resume-scheduler.sh"
    }),
    writeJson(path.join(scopedShareRoot, "chinese-chain-names.json"), {
      HomepageReminder: "首页合同到期提醒"
    }),
    writeJson(path.join(scopedWorkItemsRoot, "HomepageReminder.json"), {
      chainId: "HomepageReminder",
      mode: "active",
      currentTask: "恢复 testall 上下文",
      expectedOutput: "输出下一步",
      allowedActions: ["恢复上下文"],
      forbiddenActions: ["直接实现"]
    }),
    writeFile(path.join(scopedShareRoot, "action-events.jsonl"), ""),
    writeFile(path.join(scopedMapsRoot, "HomepageReminder.md"), "# HomepageReminder\n"),
    writeFile(path.join(scopedReviewsRoot, "Wave2-P1.md"), "# Wave2-P1\n"),
    writeJson(path.join(scopedSessionsRoot, "main-control-resume.json"), {
      generatedAt: "2026-03-28-1005",
      handoffPath: "Projects/飞枢系统/Sessions/sources/testall/2026-03-28-1005-main-control-handoff.md",
      running: ["HomepageReminder"],
      pending: [],
      blocked: [],
      rollback: [],
      completedKept: [],
      queue: { pendingStart: [], nextCandidate: null, updatedAt: "2026-03-28 10:05:00" },
      trackedChains: {},
      workItems: {},
      delta: { changedChains: [], queueAdded: [], queueRemoved: [], modeChanged: [], taskChanged: [] }
    }),
    writeJson(path.join(scopedChainResumeRoot, "HomepageReminder.json"), {
      generatedAt: "2026-03-28-1005",
      chainId: "HomepageReminder",
      stage: "S1",
      summary: "active",
      mode: "active",
      currentTask: "恢复 testall 上下文",
      recoverable: true,
      queued: false,
      sessionRunning: true,
      blocked: false,
      rollback: false,
      paths: {
        map: "Projects/飞枢系统/Maps/testall/HomepageReminder.md",
        codeList: "Projects/飞枢系统/CodeLists/testall/HomepageReminder.md",
        workItem: "Projects/飞枢系统/share/sources/testall/work-items/HomepageReminder.json"
      },
      delta: {
        stageChanged: false,
        modeChanged: false,
        taskChanged: false,
        summaryChanged: false,
        queuedChanged: false,
        sessionRunningChanged: false
      }
    })
  ]);

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: scopedShareRoot,
      actionEventsPath: path.join(scopedShareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: scopedMapsRoot,
      reviewsRoot: scopedReviewsRoot,
      notificationsRoot: scopedNotificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-HomepageReminder"],
      isProcessAlive: async () => true
    }
  );

  assert.equal(sources.mainControlResume?.handoffPath, "Projects/飞枢系统/Sessions/sources/testall/2026-03-28-1005-main-control-handoff.md");
  assert.equal(sources.chainResumePackets.HomepageReminder?.currentTask, "恢复 testall 上下文");
  assert.equal(sources.chainResumePackets.HomepageReminder?.paths.workItem, "Projects/飞枢系统/share/sources/testall/work-items/HomepageReminder.json");
});

test("loadControlPlaneSources falls back safely for malformed registry and missing chain-status", async () => {
  const fixture = await makeFixture();

  await writeFile(path.join(fixture.shareRoot, "chain-registry.json"), "not json");
  await writeFile(path.join(fixture.shareRoot, "chain-status.json"), "");

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => [],
      isProcessAlive: async () => true
    }
  );

  assert.deepEqual(sources.registry, []);
  assert.equal(sources.healthChecks.chainRegistry.readable, false);
  assert.equal(sources.healthChecks.chainStatus.readable, false);
  assert.deepEqual(sources.chainStatus, {});
});

test("loadControlPlaneSources does not inherit global watcher runtime for scoped workspaces", async () => {
  const fixture = await makeFixture();
  const scopedShareRoot = path.join(fixture.shareRoot, "sources", "b");
  const scopedNotificationsRoot = path.join(scopedShareRoot, "notifications");

  await mkdir(scopedNotificationsRoot, { recursive: true });
  await Promise.all([
    writeJson(path.join(scopedShareRoot, "chain-registry.json"), []),
    writeJson(path.join(scopedShareRoot, "chain-status.json"), {}),
    writeJson(path.join(scopedShareRoot, "dispatch-queue.json"), {
      maxConcurrent: 0,
      pendingStart: [],
      nextCandidate: null,
      updatedAt: null
    }),
    writeJson(path.join(scopedShareRoot, "scheduler-state.json"), {
      desiredState: "paused",
      updatedAt: null,
      updatedBy: null
    }),
    writeJson(path.join(scopedShareRoot, "chinese-chain-names.json"), {}),
    writeFile(path.join(scopedShareRoot, "action-events.jsonl"), "")
  ]);

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: scopedShareRoot,
      actionEventsPath: path.join(scopedShareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: path.join(fixture.mapsRoot, "b"),
      reviewsRoot: path.join(fixture.reviewsRoot, "b"),
      notificationsRoot: scopedNotificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-ChargeStatistical"],
      isProcessAlive: async () => true
    }
  );

  assert.deepEqual(sources.tmuxSessions, ["chain-ChargeStatistical"]);
  assert.equal(sources.watcherPid, null);
  assert.equal(sources.watcherAlive, null);
});
