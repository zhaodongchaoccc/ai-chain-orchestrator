# 飞枢台 Launch Checklist

> 更新日期：2026-04-22
> 用途：控制台启动后的人肉核对清单，优先覆盖最关键主路径与控制面状态。

## 启动前

- `bash Playbooks/status-ff-parallel-workspace.sh` 可正常返回
- `bash Playbooks/status-console.sh` 可看到 server / web 状态
- `http://127.0.0.1:8787/api/health` 返回 `ok`
- `http://127.0.0.1:4173` 可打开

## 必查路径

### `/`
- 页面可正常加载，无空白页、红屏、明显布局错位
- 总览条、链列表、队列、事件、通知区域可见
- 健康状态与并发信息可正常显示

### `/req/:reqId`
- 需求详情可加载
- 链列表、阶段、摘要、生命周期按钮可见
- 不存在需求时返回明确空态或 404 提示

### `/system`
- 系统代办面板可加载
- `[AI]` / `[人工]` 标签区分正常
- 蒸馏状态与系统动作入口可见

## 关键动作核对

- 需求列表加载正常
- 需求详情打开正常
- 生命周期动作按钮状态与当前真值一致
- 系统代办可读取 `07-决策记录/*.md`
- 手动蒸馏可触发成功
- 归档 / 删除类动作有确认门禁

## API 快速抽查

- `GET /api/health`
- `GET /api/overview`
- `GET /api/workspaces`
- `GET /api/requirements`
- `GET /api/system/todos`

## 通过标准

- 页面主路径可访问
- 关键 API 返回正常
- 控制台状态与真值文件无明显漂移
- 无阻断级报错

## 最近一次基线

- 2026-04-22：`Console/server` 自动化测试 `216 passed, 0 failed`
