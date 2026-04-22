# 飞枢台实现状态

> 更新日期：2026-04-22
> 当前口径：以 `Console/server` 全量测试、现有 Playbooks、以及当前 README 中仍有效的系统事实为准。

## 当前结论

- 飞枢台已具备本地可启动、可停止、可重启、可状态检查的控制台闭环
- `Console/server` 当前测试结果：`216 passed, 0 failed`
- 控制台已覆盖全局视角、source-scoped 视角、系统代办、需求管理、链会话生命周期、AI 提案与受控动作
- 当前文档为存量引用补位文件，替代已缺失的旧实现状态页

## 已完成

### 控制台基础设施
- `Console/server` / `Console/web` / `Console/shared` 三层结构已落地
- `start-console.sh` / `stop-console.sh` / `restart-console.sh` / `status-console.sh` 可直接管理本地控制台生命周期
- Console 生命周期脚本已覆盖 runtime pid、listener pid、端口检查、重启替换旧实例

### 后端能力
- 健康检查与总览聚合：`/health`、`/api/health`、`/api/overview`
- 全局视图：`/api/global/overview`、`/api/global/health`、`/api/global/control`、`/api/global/actions`
- 业务链视图：`/api/chains`、`/api/chains/:id`
- source-scoped 视图：`/api/workspaces`、`/api/workspaces/:sourceId/*`
- 事件与通知：`/api/events`、`/api/notifications`
- 风险与波次：`/api/risks`、`/api/wave`
- 需求管理：`/api/requirements`、需求详情、拆链、接口文档生成、手动加链、归档删除
- 系统代办：`/api/system/todos`、执行、完成
- AI Dock：`/api/ai/chat`、`/api/ai/dispatch`，以及 source-scoped AI chat

### 执行层集成
- 已接入 `tmux`、`Playbooks/*.sh`、`share/*.json`、`share/notifications/*.md`
- 已支持链 session 的启动、恢复、attach、Terminal 打开、主控轮换、source main-control 生命周期
- 已支持系统迭代 session 的独立生命周期入口

### 测试与环境兼容
- 历史环境相关测试失败已于 2026-04-22 修复
- Playbooks 项目根解析现支持测试沙箱优先，避免误回退真实仓库
- 目录名正式统一为 `Projects/飞枢系统/`，历史 `Projects/ff/` 仅保留必要兼容回退

## 当前限制

- `Console/docs/` 三份支撑文档已恢复，但内容仍需在后续迭代中持续更新
- `README.md` 顶层对飞枢台状态的描述仍偏旧，和当前能力存在时间差
- 控制台仍是飞枢系统的可视化控制壳，不替代 `tmux + Playbooks + 真值文件` 的执行层
- 高风险动作仍必须经过白名单与确认门禁，不开放任意 shell / git / 文件写入

## 建议的下一步维护动作

1. 把顶层 `README.md` 中飞枢台“仍未完成”的旧描述更新到当前实现口径
2. 后续新增关键控制面能力时，同步回写 `implementation-status.md` 与 `iteration-log.md`
3. 如启动/冒烟流程发生变化，优先更新 `launch-checklist.md`
