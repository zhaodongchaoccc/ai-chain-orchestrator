# 飞枢台

`飞枢台` 是飞枢系统当前“业务链驱动的多智能体研发编排系统”的总控可视化控制壳。

它不替代现有执行层，而是对以下系统做统一聚合与展示：

- `tmux`
- `Playbooks/*.sh`
- `share/*.json`
- `share/notifications/*.md`
- `Maps/*.md`
- `Reviews/*.md`

## 当前状态
- 当前实现已完成 Task 1 ~ Task 14
- 当前已具备本地可启动、可验证、可人工验收的完整控制台闭环
- 当前控制台仍不替代现有 FF 执行层，而是对主控工作流做受控可视化与操作壳层

## 目录结构
- `server/`：本机 control-plane 服务
- `web/`：浏览器本地控制台
- `shared/`：共享领域模型与类型
- `docs/`：实现状态、迭代日志、启动检查清单

## 当前 API
- `GET /health`
- `GET /api/health`
- `GET /api/overview`
- `GET /api/chains`
- `GET /api/chains/:id`
- `GET /api/queue`
- `GET /api/events`
- `GET /api/notifications`
- `GET /api/risks`
- `GET /api/wave`
- `POST /api/actions`
- `POST /api/ai/chat`
- `POST /api/ai/dispatch`

## 启动方式

### 一套启动整个控制中心
```bash
bash "~/PasObsidian/Projects/飞枢系统/Playbooks/start/start-飞枢台.sh"
```

### 一套停止整个控制中心
```bash
bash "~/PasObsidian/Projects/飞枢系统/Playbooks/start/stop-飞枢台.sh"
```

### 一套查看整个控制中心状态
```bash
bash "~/PasObsidian/Projects/飞枢系统/Playbooks/start/status-飞枢台.sh"
```

### 一套重启整个控制中心
```bash
bash "~/PasObsidian/Projects/飞枢系统/Playbooks/start/restart-飞枢台.sh"
```

这组脚本会统一管理两层：
- `ff parallel workspace` 执行层
- `Console` 浏览器控制台层

需求子主控仍支持单独管理：
- `bash "~/PasObsidian/Projects/飞枢系统/Playbooks/start-source-main-control.sh" <sourceId>`
- `bash "~/PasObsidian/Projects/飞枢系统/Playbooks/sleep-source-main-control.sh" <sourceId>`
- `bash "~/PasObsidian/Projects/飞枢系统/Playbooks/rotate-source-main-control.sh" <sourceId>`

### 启动
```bash
bash "~/PasObsidian/Projects/飞枢系统/Playbooks/start-console.sh"
```

### 重启
```bash
bash "~/PasObsidian/Projects/飞枢系统/Playbooks/restart-console.sh"
```

### 停止
```bash
bash "~/PasObsidian/Projects/飞枢系统/Playbooks/stop-console.sh"
```

### 状态
```bash
bash "~/PasObsidian/Projects/飞枢系统/Playbooks/status-console.sh"
```

### 清理遗留 `work-item` 运行态字段
```bash
bash "~/PasObsidian/Projects/飞枢系统/Playbooks/cleanup-legacy-work-item-modes.sh"
```

这个脚本会批量移除 `share/**/work-items/*.json` 里的遗留 `mode` / `recoverable`，用于把历史文件迁移到“真值派生 mode”的新模型。

### 浏览器
打开：
`http://127.0.0.1:4173`

## 当前能力
- 聚合 FF 当前真值文件与运行态
- 提供总览、链详情、队列、事件、通知、风险、Wave、健康检查 API
- 提供白名单控制动作：
  - 调度器暂停 / 恢复
  - 队列重算 / 提升
  - 主控汇总
  - Wave 汇总
  - attach 命令准备
- 提供 AI Dock：
  - 问答
  - 文档解释
  - 调度提案
  - 开发委派提案
- 提供通知与风险中心
- 提供 Wave 页面与历史 Review 列表
- 支持桌面与窄窗 / 平板响应式布局
- 提供全局焦点切换条，支持快速切页与快速跳链
- 页面与动态文案已统一为稳定中文口径

## 当前限制
- 当前控制台默认围绕现有 FF 真值体系工作
- 多需求源切换（不只 `newfee`）尚未正式实现
- 当前不提供任意 shell / git / 文件写入能力
- 所有危险动作仍需经过受控白名单与确认门禁

## 真值来源
- `Projects/飞枢系统/share/chain-registry.json`
- `Projects/飞枢系统/share/scheduler-state.json`
- `Projects/飞枢系统/share/sources/newfee/chain-status.json`
- `Projects/飞枢系统/share/sources/newfee/dispatch-queue.json`
- `Projects/飞枢系统/share/chinese-chain-names.json`
- `Projects/飞枢系统/share/notifications/`
- `Projects/飞枢系统/share/action-events.jsonl`
- `Projects/飞枢系统/Playbooks/dispatch-watcher.pid`
- `Projects/飞枢系统/Playbooks/dispatch-watcher.log`
- `Projects/飞枢系统/chain-assets/地图/`
- `Projects/飞枢系统/chain-assets/波次总结/`
- `tmux ls`

## 支撑文档
- `Console/docs/implementation-status.md`
- `Console/docs/iteration-log.md`
- `Console/docs/launch-checklist.md`

## Launch 验证

当前 launch 验证与人工 smoke 结果记录在：

- `Console/docs/launch-checklist.md`
