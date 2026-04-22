from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
import sys


DEFAULT_P1_CHAINS = [
    "ContractAutoNumbering",
    "OperationLogTracking",
    "PaymentPermissionAdjustment",
    "HomepageReminder",
]
DEFAULT_P2_CHAINS = [
    "ReceiptPrinting",
    "OldDataUpgrade",
    "ChargeStatistical",
    "EmployeePerformance",
]
DEFAULT_P0_CHAINS = [
    "ContractAddAndFee",
    "CustomerServiceStatus",
    "ContractDetailFields",
]
DEFAULT_ALL_CHAINS = DEFAULT_P0_CHAINS + DEFAULT_P1_CHAINS + DEFAULT_P2_CHAINS
DEFAULT_CHAIN_ZH = {
    "ContractAddAndFee": "合同创建并收费",
    "CustomerServiceStatus": "客户服务状态",
    "ContractDetailFields": "合同明细扩展字段",
    "ContractAutoNumbering": "合同自动编号",
    "OperationLogTracking": "操作日志记录",
    "PaymentPermissionAdjustment": "收费记录权限调整",
    "HomepageReminder": "首页合同到期提醒",
    "ReceiptPrinting": "收款单收据打印",
    "OldDataUpgrade": "旧版数据升级",
    "ChargeStatistical": "合同收费统计",
    "EmployeePerformance": "员工绩效",
}
DEFAULT_SOURCE_ID = "newfee"
SCOPED_CHAIN_SESSION_PATTERN = re.compile(r"^chain-(.+)-([A-Z][A-Za-z0-9]*)$")
LEGACY_CHAIN_SESSION_PATTERN = re.compile(r"^chain-([A-Z][A-Za-z0-9]*)$")

SHARE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = SHARE_ROOT.parent

CHAIN_REGISTRY_PATH = SHARE_ROOT / "chain-registry.json"
SCHEDULER_POLICY_PATH = SHARE_ROOT / "scheduler-policy.json"
MANUAL_SESSION_HOLDS_PATH = SHARE_ROOT / "manual-session-holds.json"
CHAIN_STATUS_PATH = SHARE_ROOT / "sources" / DEFAULT_SOURCE_ID / "chain-status.json"
WORK_ITEMS_DIR = SHARE_ROOT / "sources" / DEFAULT_SOURCE_ID / "work-items"
SESSIONS_DIR = PROJECT_ROOT / "Sessions"
CHAIN_RESUME_DIRNAME = "chain-resume"
WORK_ITEM_MODES = {"active", "hold", "blocked", "done", "escalate"}
WAVE_ORDER = {"P0": 0, "P1": 1, "P2": 2}


def _get_project_root() -> Path:
    project_root = os.environ.get("PROJECT_ROOT")
    if project_root:
        return Path(project_root).expanduser()
    return PROJECT_ROOT


def _get_vault_root() -> Path:
    vault_root = os.environ.get("VAULT")
    if vault_root:
        return Path(vault_root).expanduser()
    return _get_project_root().parents[1]


def _get_ff_repo_path() -> Path:
    for key in ("FF_REPO_PATH", "FF_PRIMARY_REPO", "FF_WORKDIR"):
        value = os.environ.get(key)
        if value:
            return Path(value).expanduser()
    return Path.home() / "ff"


def _get_frontend_repo_path() -> Path:
    for key in ("FRONTEND_REPO_PATH", "FRONTEND_PRIMARY_REPO"):
        value = os.environ.get(key)
        if value:
            return Path(value).expanduser()
    return Path.home() / "ccweb" / "saas-cc-web-ydzee"


def _get_ff_worktrees_root() -> Path:
    value = os.environ.get("FF_WORKTREES_ROOT")
    if value:
        return Path(value).expanduser()
    return Path.home() / "ff-worktrees"


def _get_frontend_worktrees_root() -> Path:
    for key in ("FRONTEND_WORKTREES_ROOT", "CCWEB_WORKTREES_ROOT"):
        value = os.environ.get(key)
        if value:
            return Path(value).expanduser()
    return Path.home() / "ccweb-worktrees"


def _project_path(*parts: str) -> Path:
    return _get_project_root().joinpath(*parts)


def _project_str(*parts: str) -> str:
    return str(_project_path(*parts))


def _share_str(*parts: str) -> str:
    return str(_project_path("share", *parts))


def _sessions_str(*parts: str) -> str:
    return str(_project_path("Sessions", *parts))


def normalize_source_id(source_id: Optional[str] = None) -> str:
    if isinstance(source_id, str) and source_id.strip():
        return source_id.strip()
    return DEFAULT_SOURCE_ID


def build_chain_session_name(chain_id: str, source_id: Optional[str] = None) -> str:
    return f"chain-{normalize_source_id(source_id)}-{chain_id}"


def build_source_chain_asset_paths(chain_id: str, source_id: Optional[str] = None) -> Dict[str, str]:
    effective_source_id = normalize_source_id(source_id)
    return {
        "map": f"Projects/飞枢系统/03-业务链资产/地图/{effective_source_id}/{chain_id}.md",
        "codeList": f"Projects/飞枢系统/03-业务链资产/代码清单/{effective_source_id}/{chain_id}.md",
        "workItem": f"Projects/飞枢系统/share/sources/{effective_source_id}/work-items/{chain_id}.json",
    }


def build_source_control_paths(source_id: Optional[str] = None) -> Dict[str, str]:
    effective_source_id = normalize_source_id(source_id)
    return {
        "mainPacket": f"Projects/飞枢系统/Sessions/sources/{effective_source_id}/main-control-resume.json",
        "chainStatus": f"Projects/飞枢系统/share/sources/{effective_source_id}/chain-status.json",
        "queue": f"Projects/飞枢系统/share/sources/{effective_source_id}/dispatch-queue.json",
        "registry": f"Projects/飞枢系统/share/sources/{effective_source_id}/chain-registry.json",
        "scheduler": f"Projects/飞枢系统/share/sources/{effective_source_id}/scheduler-state.json",
        "codeListsOverview": f"Projects/飞枢系统/03-业务链资产/代码清单/{effective_source_id}/需求代码文件清单.md",
    }


def parse_chain_session_name(session_name: str) -> Optional[Tuple[Optional[str], str]]:
    scoped_match = SCOPED_CHAIN_SESSION_PATTERN.match(session_name)
    if scoped_match:
        return scoped_match.group(1), scoped_match.group(2)

    legacy_match = LEGACY_CHAIN_SESSION_PATTERN.match(session_name)
    if legacy_match:
        return None, legacy_match.group(1)

    return None


def iter_chain_ids_from_sessions(
    session_names: Iterable[str],
    *,
    source_id: Optional[str] = None,
    include_legacy: bool = True,
) -> List[str]:
    normalized_source_id = normalize_source_id(source_id)
    chain_ids: List[str] = []
    for session_name in session_names:
        if not isinstance(session_name, str):
            continue
        parsed = parse_chain_session_name(session_name)
        if parsed is None:
            continue
        session_source_id, chain_id = parsed
        if session_source_id == normalized_source_id or (session_source_id is None and include_legacy and normalized_source_id == DEFAULT_SOURCE_ID):
            chain_ids.append(chain_id)
    return chain_ids


def _default_chain_registry_metadata() -> Dict[str, object]:
    return {
        "p0": list(DEFAULT_P0_CHAINS),
        "p1": list(DEFAULT_P1_CHAINS),
        "p2": list(DEFAULT_P2_CHAINS),
        "all": list(DEFAULT_ALL_CHAINS),
        "zh": dict(DEFAULT_CHAIN_ZH),
    }


def _default_scheduler_policy() -> Dict[str, object]:
    return {
        "maxConcurrent": 2,
        "temporaryPinnedChains": [],
        "pinnedChainsConsumeSlots": False,
        "manualSessionHoldMinutes": 15,
    }


def resolve_scheduler_policy(path: Optional[Path] = None) -> Dict[str, object]:
    policy_path = Path(path) if path is not None else SCHEDULER_POLICY_PATH
    default_policy = _default_scheduler_policy()

    try:
        if not policy_path.exists():
            return default_policy

        with open(policy_path, "r", encoding="utf-8") as fh:
            policy = json.load(fh)
        if not isinstance(policy, dict):
            return default_policy

        max_concurrent = policy.get("maxConcurrent")
        pinned_chains = policy.get("temporaryPinnedChains")
        pinned_consume_slots = policy.get("pinnedChainsConsumeSlots")
        manual_session_hold_minutes = policy.get("manualSessionHoldMinutes", default_policy["manualSessionHoldMinutes"])

        if not isinstance(max_concurrent, int) or isinstance(max_concurrent, bool) or max_concurrent < 1:
            return default_policy
        if not isinstance(pinned_chains, list) or any(not isinstance(chain_id, str) or not chain_id for chain_id in pinned_chains):
            return default_policy
        if not isinstance(pinned_consume_slots, bool):
            return default_policy
        if not isinstance(manual_session_hold_minutes, int) or isinstance(manual_session_hold_minutes, bool) or manual_session_hold_minutes < 1:
            return default_policy

        deduped_pinned_chains: List[str] = []
        seen = set()
        for chain_id in pinned_chains:
            if chain_id in seen:
                continue
            seen.add(chain_id)
            deduped_pinned_chains.append(chain_id)

        return {
            "maxConcurrent": max_concurrent,
            "temporaryPinnedChains": deduped_pinned_chains,
            "pinnedChainsConsumeSlots": pinned_consume_slots,
            "manualSessionHoldMinutes": manual_session_hold_minutes,
        }
    except Exception:
        return default_policy


def get_manual_session_hold_minutes(policy: Optional[Dict[str, object]] = None) -> int:
    effective_policy = policy or resolve_scheduler_policy()
    value = effective_policy.get("manualSessionHoldMinutes", 15)
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else 15


def is_temporarily_pinned_chain(chain_id: str, policy: Optional[Dict[str, object]] = None) -> bool:
    effective_policy = policy or resolve_scheduler_policy()
    pinned_chains = effective_policy.get("temporaryPinnedChains", [])
    return chain_id in pinned_chains if isinstance(pinned_chains, list) else False


def get_running_pinned_chain_ids(
    session_names: Iterable[str],
    chain_status: Dict[str, Dict[str, str]],
    policy: Optional[Dict[str, object]] = None,
    source_id: Optional[str] = None,
) -> List[str]:
    effective_policy = policy or resolve_scheduler_policy()
    running_pinned: List[str] = []
    for chain_id in iter_chain_ids_from_sessions(session_names, source_id=source_id):
        if not is_temporarily_pinned_chain(chain_id, effective_policy):
            continue
        if is_chain_blocked(chain_id, chain_status) or is_chain_rollback(chain_id, chain_status) or is_chain_pending(chain_id, chain_status):
            continue
        running_pinned.append(chain_id)
    return running_pinned


def resolve_chain_registry_metadata(path: Optional[Path] = None) -> Dict[str, object]:
    registry_path = Path(path) if path is not None else CHAIN_REGISTRY_PATH
    default_metadata = _default_chain_registry_metadata()

    try:
        if not registry_path.exists():
            return default_metadata

        with open(registry_path, "r", encoding="utf-8") as fh:
            registry = json.load(fh)
        if not isinstance(registry, list):
            return default_metadata

        enabled_entries = []
        for item in registry:
            if not isinstance(item, dict):
                return default_metadata

            chain_id = item.get("id")
            name_zh = item.get("nameZh")
            priority_wave = item.get("priorityWave")
            sequence = item.get("sequence")
            enabled = item.get("enabled")

            if not isinstance(chain_id, str) or not chain_id:
                return default_metadata
            if not isinstance(name_zh, str) or not name_zh:
                return default_metadata
            if priority_wave not in WAVE_ORDER:
                return default_metadata
            if not isinstance(sequence, int) or isinstance(sequence, bool):
                return default_metadata
            if not isinstance(enabled, bool):
                return default_metadata

            if enabled:
                enabled_entries.append((priority_wave, sequence, chain_id, name_zh))

        enabled_entries.sort(key=lambda item: (WAVE_ORDER[item[0]], item[1], item[2]))

        p0 = [chain_id for wave, _, chain_id, _ in enabled_entries if wave == "P0"]
        p1 = [chain_id for wave, _, chain_id, _ in enabled_entries if wave == "P1"]
        p2 = [chain_id for wave, _, chain_id, _ in enabled_entries if wave == "P2"]
        all_chains = [chain_id for _, _, chain_id, _ in enabled_entries]
        chain_zh = {chain_id: name_zh for _, _, chain_id, name_zh in enabled_entries}
        return {
            "p0": p0,
            "p1": p1,
            "p2": p2,
            "all": all_chains,
            "zh": chain_zh,
        }
    except Exception:
        return default_metadata


CHAIN_REGISTRY_METADATA = resolve_chain_registry_metadata()
P0_CHAINS = CHAIN_REGISTRY_METADATA["p0"]
P1_CHAINS = CHAIN_REGISTRY_METADATA["p1"]
P2_CHAINS = CHAIN_REGISTRY_METADATA["p2"]
ALL_CHAINS = CHAIN_REGISTRY_METADATA["all"]
CHAIN_ZH = CHAIN_REGISTRY_METADATA["zh"]


def get_priority_wave(chain_id: str) -> str:
    if chain_id in P0_CHAINS:
        return "P0"
    if chain_id in P1_CHAINS:
        return "P1"
    if chain_id in P2_CHAINS:
        return "P2"
    return "unknown"


def format_chain_refs(chain_ids: Iterable[str]) -> str:
    return "、".join(f"`{chain_id}`" for chain_id in chain_ids)


def format_progress_line(label: str, chain_ids: Iterable[str]) -> str:
    chain_ids = list(chain_ids)
    if chain_ids:
        return f"- **{label}**：{format_chain_refs(chain_ids)}"
    return f"- **{label}**：无"


def load_json(path: Path, default):
    if not path or not Path(path).exists():
        return default
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return default


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)


def get_work_item_path(chain_id: str, work_items_dir: Optional[Path] = None) -> Path:
    base_dir = Path(work_items_dir) if work_items_dir is not None else WORK_ITEMS_DIR
    return base_dir / f"{chain_id}.json"


def _normalize_string_list(raw_value) -> List[str]:
    if not isinstance(raw_value, list):
        return []
    return [item.strip() for item in raw_value if isinstance(item, str) and item.strip()]


def _default_current_task_for_mode(mode: str) -> str:
    defaults = {
        "active": "继续当前唯一任务",
        "hold": "保持挂起，等待恢复信号",
        "blocked": "确认阻塞原因与恢复条件",
        "done": "保持只读参考，不重新开工",
        "escalate": "交回主控裁决当前动作",
    }
    return defaults.get(mode, defaults["escalate"])


def _defect_work_item_defaults() -> Dict[str, object]:
    return {
        "currentTask": "等待缺陷进入并由主控派发当前唯一缺陷任务",
        "expectedOutput": "输出缺陷归因、影响范围、修复结论和验证范围",
        "allowedActions": ["恢复上下文", "缺陷归因", "状态判断", "最小修复方案"],
        "forbiddenActions": ["擅自扩展为新功能", "无来源链直接进入大改"],
        "resumeSignal": {
            "type": "manual-or-inbox",
            "description": "当主控派发缺陷或 control-inbox 收到缺陷处理指令时恢复",
        },
        "sourceChainId": None,
        "severity": None,
        "regression": None,
        "expectedBehavior": None,
        "actualBehavior": None,
        "verificationScope": [],
    }


def _normalize_optional_bool(value) -> Optional[bool]:
    return value if isinstance(value, bool) else None


def _normalize_optional_string(value) -> Optional[str]:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _apply_defect_work_item_metadata(raw_payload: Dict[str, object], normalized: Dict[str, object]) -> Dict[str, object]:
    if normalized["chainId"] != "Defect":
        return normalized

    defaults = _defect_work_item_defaults()
    normalized["currentTask"] = _normalize_optional_string(raw_payload.get("currentTask")) or defaults["currentTask"]
    normalized["expectedOutput"] = _normalize_optional_string(raw_payload.get("expectedOutput")) or defaults["expectedOutput"]
    normalized["allowedActions"] = _normalize_string_list(raw_payload.get("allowedActions")) or list(defaults["allowedActions"])
    normalized["forbiddenActions"] = _normalize_string_list(raw_payload.get("forbiddenActions")) or list(defaults["forbiddenActions"])
    normalized["resumeSignal"] = raw_payload.get("resumeSignal") if isinstance(raw_payload.get("resumeSignal"), dict) else dict(defaults["resumeSignal"])
    normalized["sourceChainId"] = _normalize_optional_string(raw_payload.get("sourceChainId"))
    normalized["severity"] = _normalize_optional_string(raw_payload.get("severity"))
    normalized["regression"] = _normalize_optional_bool(raw_payload.get("regression"))
    normalized["expectedBehavior"] = _normalize_optional_string(raw_payload.get("expectedBehavior"))
    normalized["actualBehavior"] = _normalize_optional_string(raw_payload.get("actualBehavior"))
    normalized["verificationScope"] = _normalize_string_list(raw_payload.get("verificationScope"))
    return normalized


def _default_expected_output_for_mode(mode: str) -> str:
    defaults = {
        "active": "输出当前阶段、守门结论、当前风险和唯一下一步",
        "hold": "输出当前阶段、当前风险和继续挂起的判断",
        "blocked": "输出阻塞原因、恢复条件和下一次检查点",
        "done": "输出当前阶段、参考价值和是否需要主控介入",
        "escalate": "输出冲突点并交回主控裁决",
    }
    return defaults.get(mode, defaults["escalate"])


def _default_allowed_actions_for_mode(mode: str) -> List[str]:
    defaults = {
        "active": ["恢复上下文", "定位代码入口", "影响分析", "继续当前唯一任务"],
        "hold": ["恢复上下文", "只读分析", "状态判断"],
        "blocked": ["确认阻塞原因", "确认恢复条件", "状态判断"],
        "done": ["只读核对", "联调口径说明", "样板参考"],
        "escalate": ["恢复上下文", "整理冲突点", "交主控裁决"],
    }
    return defaults.get(mode, defaults["escalate"])


def _default_forbidden_actions_for_mode(mode: str) -> List[str]:
    defaults = {
        "active": [],
        "hold": ["实现", "测试验证", "发送 S5 完成通知"],
        "blocked": ["实现", "测试验证"],
        "done": ["重新开工", "发送新的完成通知"],
        "escalate": ["实现", "测试验证", "擅自改状态"],
    }
    return defaults.get(mode, defaults["escalate"])


def normalize_work_item(chain_id: str, payload) -> Dict[str, object]:
    raw_payload = payload if isinstance(payload, dict) else {}
    current_task = raw_payload.get("currentTask")
    expected_output = raw_payload.get("expectedOutput")
    resume_signal = raw_payload.get("resumeSignal")

    normalized = {
        "chainId": chain_id,
        "currentTask": current_task.strip() if isinstance(current_task, str) and current_task.strip() else "",
        "expectedOutput": expected_output.strip() if isinstance(expected_output, str) and expected_output.strip() else "",
        "resumeChecks": _normalize_string_list(raw_payload.get("resumeChecks")),
        "allowedActions": _normalize_string_list(raw_payload.get("allowedActions")),
        "forbiddenActions": _normalize_string_list(raw_payload.get("forbiddenActions")),
        "resumeSignal": resume_signal if isinstance(resume_signal, dict) else {"type": "truth-driven", "description": "以主控真值为准"},
        "lastVerifiedAt": raw_payload.get("lastVerifiedAt", "") if isinstance(raw_payload.get("lastVerifiedAt", ""), str) else "",
        "lastVerifiedBy": raw_payload.get("lastVerifiedBy", "") if isinstance(raw_payload.get("lastVerifiedBy", ""), str) else "",
        "updatedAt": raw_payload.get("updatedAt", "") if isinstance(raw_payload.get("updatedAt", ""), str) else "",
    }
    return _apply_defect_work_item_metadata(raw_payload, normalized)


def load_work_item(chain_id: str, work_items_dir: Optional[Path] = None) -> Dict[str, object]:
    path = get_work_item_path(chain_id, work_items_dir)
    return normalize_work_item(chain_id, load_json(path, {}))


def _hydrate_worker_prompt_work_item(work_item: Dict[str, object], mode: str, *, replace_with_mode_defaults: bool) -> Dict[str, object]:
    hydrated = dict(work_item)
    if replace_with_mode_defaults or not hydrated.get("currentTask"):
        hydrated["currentTask"] = _default_current_task_for_mode(mode)
    if replace_with_mode_defaults or not hydrated.get("allowedActions"):
        hydrated["allowedActions"] = _default_allowed_actions_for_mode(mode)
    if replace_with_mode_defaults or not hydrated.get("forbiddenActions"):
        hydrated["forbiddenActions"] = _default_forbidden_actions_for_mode(mode)
    if replace_with_mode_defaults or not hydrated.get("expectedOutput"):
        hydrated["expectedOutput"] = _default_expected_output_for_mode(mode)
    return hydrated


def resolve_worker_mode(
    chain_id: str,
    chain_status: Dict[str, Dict[str, str]],
    work_item: Optional[Dict[str, object]] = None,
) -> str:
    if chain_id not in chain_status:
        return "escalate"

    if is_chain_blocked(chain_id, chain_status):
        return "blocked"

    stage = get_chain_stage(chain_id, chain_status)
    if stage == "PENDING":
        return "hold"
    if stage == "S5":
        return "done"
    if stage == "ROLLBACK":
        return "escalate"
    if stage in {"S1", "S2", "S3", "S4"}:
        return "active"
    return "escalate"


def resolve_work_item_mode(
    chain_id: str,
    chain_status: Dict[str, Dict[str, str]],
    queue: Optional[Dict] = None,
    tmux_sessions: Optional[Iterable[str]] = None,
    work_item: Optional[Dict[str, object]] = None,
    source_id: Optional[str] = None,
) -> str:
    if chain_id in chain_status:
        return resolve_worker_mode(chain_id, chain_status, work_item)

    queued = queue.get("pendingStart", []) if isinstance(queue, dict) else []
    if isinstance(queued, list) and chain_id in queued:
        return "hold"

    session_names = tmux_sessions or []
    if chain_id in iter_chain_ids_from_sessions(session_names, source_id=source_id):
        return "active"
    return "escalate"


def _format_action_line(label: str, actions: List[str]) -> str:
    if not actions:
        return f"- {label}：无"
    return f"- {label}：{'、'.join(actions)}"


def _default_resume_checks_for_mode(mode: str) -> List[str]:
    defaults = {
        "active": [
            "确认 chain-status.json 当前仍为 S1~S4 活跃态",
            "确认当前未被标记 blocked 或 pending",
            "确认本轮只继续当前唯一任务",
        ],
        "hold": [
            "确认 chain-status.json 当前仍为 PENDING",
            "确认当前没有主控明确恢复指令",
            "确认本次不进入实现",
        ],
        "blocked": [
            "确认当前仍处于阻塞态",
            "确认恢复条件尚未满足",
            "确认本次不进入实现",
        ],
        "done": [
            "确认 chain-status.json 当前仍为 S5",
            "确认本次保持只读参考",
        ],
        "escalate": [
            "确认当前真值缺失或冲突",
            "整理冲突点并交回主控裁决",
        ],
    }
    return defaults.get(mode, defaults["escalate"])


def _default_resume_signal_for_mode(mode: str) -> Dict[str, str]:
    defaults = {
        "active": {"type": "truth-active", "description": "链真值保持活跃态即可继续当前唯一任务"},
        "hold": {"type": "manual-only", "description": "仅当主控明确说明状态变化时恢复"},
        "blocked": {"type": "manual-or-requirement-change", "description": "仅当主控明确解除阻塞或需求发生变化时恢复"},
        "done": {"type": "read-only", "description": "默认只读参考，不重新开工"},
        "escalate": {"type": "manual-review", "description": "需要主控人工裁决后再继续"},
    }
    return defaults.get(mode, defaults["escalate"])


def _format_work_item_timestamp(now: Optional[datetime] = None) -> str:
    return (now or datetime.now()).strftime("%Y-%m-%d %H:%M")


def _order_chain_ids(chain_ids: Iterable[str]) -> List[str]:
    unique = {chain_id for chain_id in chain_ids if isinstance(chain_id, str) and chain_id}
    known = [chain_id for chain_id in ALL_CHAINS if chain_id in unique]
    extras = sorted(unique - set(known))
    return known + extras


def list_existing_work_item_ids(work_items_dir: Optional[Path] = None) -> List[str]:
    base_dir = Path(work_items_dir) if work_items_dir is not None else WORK_ITEMS_DIR
    if not base_dir.exists():
        return []
    return _order_chain_ids(path.stem for path in base_dir.glob("*.json"))


def collect_tracked_chain_ids(
    chain_status: Dict[str, Dict[str, str]],
    queue: Dict,
    tmux_sessions: Iterable[str],
    *,
    work_items_dir: Optional[Path] = None,
    source_id: Optional[str] = None,
) -> List[str]:
    tracked = set(list_existing_work_item_ids(work_items_dir))

    for chain_id, meta in chain_status.items():
        if not isinstance(chain_id, str) or not chain_id:
            continue
        stage = meta.get("stage") if isinstance(meta, dict) else None
        if stage != "S5":
            tracked.add(chain_id)

    for chain_id in queue.get("pendingStart", []):
        if isinstance(chain_id, str) and chain_id:
            tracked.add(chain_id)

    for chain_id in iter_chain_ids_from_sessions(tmux_sessions, source_id=source_id):
        tracked.add(chain_id)

    return _order_chain_ids(tracked)


def build_default_work_item(
    chain_id: str,
    chain_status: Dict[str, Dict[str, str]],
    *,
    queue: Optional[Dict] = None,
    tmux_sessions: Optional[Iterable[str]] = None,
    now_str: Optional[str] = None,
    source_id: Optional[str] = None,
) -> Dict[str, object]:
    mode = resolve_work_item_mode(chain_id, chain_status, queue, tmux_sessions, source_id=source_id)
    effective_now = now_str or _format_work_item_timestamp()
    payload = {
        "chainId": chain_id,
        "currentTask": _default_current_task_for_mode(mode),
        "expectedOutput": _default_expected_output_for_mode(mode),
        "resumeChecks": _default_resume_checks_for_mode(mode),
        "allowedActions": _default_allowed_actions_for_mode(mode),
        "forbiddenActions": _default_forbidden_actions_for_mode(mode),
        "resumeSignal": _default_resume_signal_for_mode(mode),
        "lastVerifiedAt": effective_now,
        "lastVerifiedBy": "main-control",
        "updatedAt": effective_now,
    }
    return _apply_defect_work_item_metadata({}, payload)


def reconcile_work_item_with_truth(
    chain_id: str,
    chain_status: Dict[str, Dict[str, str]],
    existing_item,
    *,
    queue: Optional[Dict] = None,
    tmux_sessions: Optional[Iterable[str]] = None,
    now_str: Optional[str] = None,
    touched: bool = False,
) -> Dict[str, object]:
    normalized = normalize_work_item(chain_id, existing_item)
    mode = resolve_work_item_mode(chain_id, chain_status, queue, tmux_sessions, normalized)
    effective_now = now_str or _format_work_item_timestamp()

    reconciled = dict(normalized)
    if not reconciled.get("currentTask"):
        reconciled["currentTask"] = _default_current_task_for_mode(mode)
    if not reconciled.get("expectedOutput"):
        reconciled["expectedOutput"] = _default_expected_output_for_mode(mode)
    if not reconciled.get("allowedActions"):
        reconciled["allowedActions"] = _default_allowed_actions_for_mode(mode)
    if not reconciled.get("forbiddenActions"):
        reconciled["forbiddenActions"] = _default_forbidden_actions_for_mode(mode)
    if not reconciled.get("resumeChecks"):
        reconciled["resumeChecks"] = _default_resume_checks_for_mode(mode)
    if touched:
        reconciled["lastVerifiedAt"] = effective_now
        reconciled["lastVerifiedBy"] = "main-control"
    return reconciled


def write_work_item(chain_id: str, payload: Dict[str, object], work_items_dir: Optional[Path] = None) -> None:
    write_json(get_work_item_path(chain_id, work_items_dir), payload)


def sync_work_items_once(
    chain_status: Dict[str, Dict[str, str]],
    queue: Dict,
    tmux_sessions: Iterable[str],
    *,
    work_items_dir: Optional[Path] = None,
    touched_chains: Optional[Iterable[str]] = None,
    now_str: Optional[str] = None,
) -> Dict[str, List[str]]:
    effective_now = now_str or _format_work_item_timestamp()
    touched = {chain_id for chain_id in (touched_chains or []) if isinstance(chain_id, str) and chain_id}
    tracked_chain_ids = collect_tracked_chain_ids(chain_status, queue, tmux_sessions, work_items_dir=work_items_dir)

    created: List[str] = []
    updated: List[str] = []
    frozen: List[str] = []

    for chain_id in tracked_chain_ids:
        path = get_work_item_path(chain_id, work_items_dir)
        if path.exists():
            existing_payload = load_json(path, {})
            reconciled = reconcile_work_item_with_truth(
                chain_id,
                chain_status,
                existing_payload,
                queue=queue,
                tmux_sessions=tmux_sessions,
                now_str=effective_now,
                touched=chain_id in touched,
            )
            if existing_payload != reconciled:
                write_work_item(chain_id, reconciled, work_items_dir)
                updated.append(chain_id)
                current_mode = resolve_work_item_mode(chain_id, chain_status, queue, tmux_sessions, reconciled)
                if current_mode in {"hold", "blocked", "done"}:
                    frozen.append(chain_id)
            continue

        payload = build_default_work_item(chain_id, chain_status, queue=queue, tmux_sessions=tmux_sessions, now_str=effective_now)
        write_work_item(chain_id, payload, work_items_dir)
        created.append(chain_id)
        current_mode = resolve_work_item_mode(chain_id, chain_status, queue, tmux_sessions, payload)
        if current_mode in {"hold", "blocked", "done"}:
            frozen.append(chain_id)

    return {
        "created_work_items": created,
        "updated_work_items": updated,
        "frozen_work_items": frozen,
    }


def _parse_hold_timestamp(raw_value: str) -> Optional[datetime]:
    try:
        return datetime.strptime(raw_value, "%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def load_manual_session_holds(
    path: Optional[Path] = None,
    now: Optional[datetime] = None,
) -> Dict[str, str]:
    holds_path = Path(path) if path is not None else MANUAL_SESSION_HOLDS_PATH
    payload = load_json(holds_path, {})
    current_time = now or datetime.now()

    if not isinstance(payload, dict):
        return {}

    kept: Dict[str, str] = {}
    for chain_id, expires_at in payload.items():
        if not isinstance(chain_id, str) or not isinstance(expires_at, str):
            continue
        parsed = _parse_hold_timestamp(expires_at)
        if parsed is None or parsed <= current_time:
            continue
        kept[chain_id] = expires_at

    return kept


def write_manual_session_hold(
    chain_id: str,
    *,
    path: Optional[Path] = None,
    ttl_minutes: Optional[int] = None,
    policy_path: Optional[Path] = None,
    now: Optional[datetime] = None,
) -> Dict[str, str]:
    holds_path = Path(path) if path is not None else MANUAL_SESSION_HOLDS_PATH
    current_time = now or datetime.now()
    policy = resolve_scheduler_policy(policy_path) if policy_path is not None else None
    fallback_ttl = get_manual_session_hold_minutes(policy)
    ttl = ttl_minutes if isinstance(ttl_minutes, int) and not isinstance(ttl_minutes, bool) and ttl_minutes > 0 else fallback_ttl
    holds = load_manual_session_holds(holds_path, now=current_time)
    holds[chain_id] = (current_time + timedelta(minutes=ttl)).strftime("%Y-%m-%d %H:%M:%S")
    write_json(holds_path, holds)
    return holds


def has_manual_session_hold(
    chain_id: str,
    *,
    holds: Optional[Dict[str, str]] = None,
    path: Optional[Path] = None,
    now: Optional[datetime] = None,
) -> bool:
    effective_holds = holds if holds is not None else load_manual_session_holds(path=path, now=now)
    return chain_id in effective_holds


def get_chain_stage(chain_id: str, chain_status: Dict[str, Dict[str, str]]) -> str:
    return chain_status.get(chain_id, {}).get("stage", "S1")


def is_chain_blocked(chain_id: str, chain_status: Dict[str, Dict[str, str]]) -> bool:
    return bool(chain_status.get(chain_id, {}).get("blocked", False))


def is_chain_rollback(chain_id: str, chain_status: Dict[str, Dict[str, str]]) -> bool:
    return get_chain_stage(chain_id, chain_status) == "ROLLBACK"


def is_chain_pending(chain_id: str, chain_status: Dict[str, Dict[str, str]]) -> bool:
    return get_chain_stage(chain_id, chain_status) == "PENDING"


def get_effective_active_sessions(
    session_names: Iterable[str],
    chain_status: Dict[str, Dict[str, str]],
    policy: Optional[Dict[str, object]] = None,
    source_id: Optional[str] = None,
) -> List[str]:
    effective_policy = policy or resolve_scheduler_policy()
    pinned_consume_slots = bool(effective_policy.get("pinnedChainsConsumeSlots", False))
    active = []
    for session_name in session_names:
        parsed = parse_chain_session_name(session_name) if isinstance(session_name, str) else None
        if parsed is None:
            continue
        session_source_id, chain_id = parsed
        if session_source_id not in {None, normalize_source_id(source_id)}:
            continue
        if (
            pinned_consume_slots
            and is_temporarily_pinned_chain(chain_id, effective_policy)
            and not is_chain_blocked(chain_id, chain_status)
            and not is_chain_rollback(chain_id, chain_status)
            and not is_chain_pending(chain_id, chain_status)
        ):
            active.append(session_name)
            continue
        if (
            get_chain_stage(chain_id, chain_status) != "S5"
            and not is_chain_blocked(chain_id, chain_status)
            and not is_chain_rollback(chain_id, chain_status)
            and not is_chain_pending(chain_id, chain_status)
        ):
            active.append(session_name)
    return active


def get_available_start_slots(
    session_names: Iterable[str],
    chain_status: Dict[str, Dict[str, str]],
    policy: Optional[Dict[str, object]] = None,
    source_id: Optional[str] = None,
) -> int:
    effective_policy = policy or resolve_scheduler_policy()
    max_concurrent = effective_policy.get("maxConcurrent", 2)
    if not isinstance(max_concurrent, int) or isinstance(max_concurrent, bool) or max_concurrent < 1:
        max_concurrent = 2
    active_count = len(get_effective_active_sessions(session_names, chain_status, effective_policy, source_id=source_id))
    return max(max_concurrent - active_count, 0)


def select_chains_to_start(pending_chain_ids: Iterable[str], available_slots: int) -> List[str]:
    if available_slots <= 0:
        return []
    return list(pending_chain_ids)[:available_slots]


def sanitize_pending_queue(
    pending: Iterable[str],
    chain_status: Dict[str, Dict[str, str]],
    running_chain_ids: Optional[Iterable[str]] = None,
) -> Tuple[List[str], List[str]]:
    kept: List[str] = []
    skipped: List[str] = []
    running = set(running_chain_ids or [])
    for chain_id in pending:
        if (
            get_chain_stage(chain_id, chain_status) == "S5"
            or is_chain_blocked(chain_id, chain_status)
            or is_chain_rollback(chain_id, chain_status)
            or is_chain_pending(chain_id, chain_status)
            or chain_id in running
        ):
            skipped.append(chain_id)
        else:
            kept.append(chain_id)
    return kept, skipped


def rebuild_pending_start_queue(
    chain_status: Dict[str, Dict[str, str]],
    running_chain_ids: Optional[Iterable[str]] = None,
) -> List[str]:
    kept, _ = sanitize_pending_queue(
        ALL_CHAINS,
        chain_status,
        running_chain_ids=running_chain_ids,
    )
    return kept


def build_initial_pending_queue(
    ordered_chain_ids: Iterable[str],
    chain_status: Dict[str, Dict[str, str]],
    running_chain_ids: Optional[Iterable[str]] = None,
) -> List[str]:
    kept, _ = sanitize_pending_queue(
        ordered_chain_ids,
        chain_status,
        running_chain_ids=running_chain_ids,
    )
    return kept


def parse_notification_frontmatter(path: Path) -> Dict[str, str]:
    content = path.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---", content, re.S)
    if not match:
        return {}

    payload: Dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        payload[key.strip()] = value.strip()
    return payload


def stage_for_overview(chain_id: str, chain_status: Dict[str, Dict[str, str]]) -> str:
    if is_chain_rollback(chain_id, chain_status):
        return "ROLLBACK"
    if is_chain_blocked(chain_id, chain_status):
        return "BLOCKED"
    return get_chain_stage(chain_id, chain_status)


def extract_code_entries_from_map(map_path: Path) -> List[Tuple[str, str, str]]:
    if not map_path.exists():
        return []
    text = map_path.read_text(encoding="utf-8")
    items = re.findall(r"`([^`]+)`", text)
    code_items = []
    seen = set()
    for item in items:
        if item.endswith(".md"):
            continue
        if not any(token in item for token in [".java", ".xml", ".sql", ".sh", ".py", ".ts", ".js"]):
            continue
        if item in seen:
            continue
        seen.add(item)
        role = "其他"
        lowered = item.lower()
        if "controller" in lowered:
            role = "Controller"
        elif "service" in lowered:
            role = "Service"
        elif "dto" in lowered:
            role = "DTO"
        elif "vo" in lowered:
            role = "VO"
        elif "domain" in lowered or "entity" in lowered:
            role = "Domain"
        elif "test" in lowered:
            role = "Test"
        elif item.endswith(".sql") or "deployment_scripts" in lowered:
            role = "SQL/脚本"
        elif item.endswith(".xml"):
            role = "Mapper/XML"
        code_items.append((item, role, "待补充说明"))
    return code_items


def count_existing_code_rows(content: str) -> int:
    rows = re.findall(r"^\| `([^`]+)` \|", content, re.M)
    return len([row for row in rows if row != "无"])


def extract_section(text: str, title: str) -> str:
    match = re.search(rf"## {re.escape(title)}[\s\S]*?(?=\n## |\Z)", text)
    return match.group(0) if match else ""


def classify_code_list_status(stage: str, map_path: Path, code_entries: List[Tuple[str, str, str]]) -> Tuple[str, str, str]:
    map_text = map_path.read_text(encoding="utf-8") if map_path.exists() else ""
    stage_text = extract_section(map_text, "当前阶段状态")
    rollback_markers = ["已撤回", "已作废", "原 S5 完成结论已作废", "原完成结论已作废"]
    no_code_markers = ["无需额外开发", "无需改动", "无后端开发", "无需额外后端开发"]

    if stage == "ROLLBACK" or any(marker in stage_text for marker in rollback_markers):
        return "已回滚", "是", "已回滚"
    if stage == "BLOCKED":
        return "待更新", ("是" if code_entries else "未开始"), "阻塞"
    if stage == "S5":
        if any(marker in map_text for marker in no_code_markers) and not code_entries:
            return "无代码改动", "否", "无需改动"
        return "已更新", ("是" if code_entries else "待补"), ("已验证" if code_entries else "待补")
    return "待更新", ("是" if code_entries else "未开始"), "未验证"


def ensure_code_list_doc(
    code_list_path: Path,
    *,
    chain_id: str,
    chain_name_zh: str,
    stage: str,
    summary: str,
    map_path: Path,
) -> None:
    code_entries = extract_code_entries_from_map(map_path)
    clean_status, code_changed, verify_status = classify_code_list_status(stage, map_path, code_entries)
    file_rows = ["| 文件路径 | 角色 | 改动类型 | 说明 |", "|---|---|---|---|"]
    if code_entries:
        for path_str, role, desc in code_entries:
            file_rows.append(f"| `{path_str}` | {role} | 待补 | {desc} |")
    else:
        file_rows.append("| `无` | - | - | 待补充 |")

    base_content = "\n".join(
        [
            f"# {chain_id} 代码清单",
            "",
            "## 关联文档",
            f"- 业务链地图：`Projects/飞枢系统/03-业务链资产/地图/newfee/{chain_id}.md`",
            f"- 项目首页：`Projects/飞枢系统/README.md`",
            "",
            "## 基本信息",
            f"- 业务链：`{chain_id}`",
            f"- 中文名：`{chain_name_zh}`",
            f"- 当前阶段：`{stage}`",
            f"- 清单状态：`{clean_status}`",
            f"- 本轮是否改代码：`{code_changed}`",
            f"- 文件数：`{max(len(code_entries), 0)}`",
            f"- 验证状态：`{verify_status}`",
            f"- 关联业务链地图：`Projects/飞枢系统/03-业务链资产/地图/newfee/{chain_id}.md`",
            "",
            "## 本轮结论",
            f"- 当前结论：{summary or '待补充'}",
            "- 备注：待补充",
            "",
            "## 实际改动文件清单",
            *file_rows,
            "",
            "## 验证",
            "- 验证命令：",
            "  - 待补充",
            "- 验证结果：待补充",
            "",
            "## 特殊说明",
            "- 无代码改动 / 回滚 / 阻塞原因：待补充",
            "",
        ]
    )

    code_list_path.parent.mkdir(parents=True, exist_ok=True)
    if not code_list_path.exists():
        code_list_path.write_text(base_content, encoding="utf-8")
        return

    content = code_list_path.read_text(encoding="utf-8")
    existing_file_count = count_existing_code_rows(content)
    effective_entries = code_entries if code_entries else [('_', '_', '_')] * existing_file_count
    clean_status, code_changed, verify_status = classify_code_list_status(stage, map_path, effective_entries)
    existing_meta = parse_code_list_meta(code_list_path)
    existing_conclusion_match = re.search(r"## 本轮结论\n- 当前结论：(.*)\n- 备注：", content)
    existing_conclusion = existing_conclusion_match.group(1) if existing_conclusion_match else "待补充"
    if existing_file_count > 0:
        code_changed = "是"
        current_verify = existing_meta.get("验证状态")
        if stage == "S5":
            verify_status = "已验证"
        elif current_verify not in {"待补", "未验证", None}:
            verify_status = current_verify
        else:
            verify_status = verify_status
    if stage == "PENDING" and existing_meta.get("清单状态") == "已回滚":
        clean_status = "已回滚"
        code_changed = "是"
        verify_status = "已回滚"
    if stage == "S5" and existing_meta.get("清单状态") == "无代码改动":
        clean_status = "无代码改动"
        code_changed = "否"
        verify_status = "无需改动"

    basic_info = "\n".join(
        [
            "## 基本信息",
            f"- 业务链：`{chain_id}`",
            f"- 中文名：`{chain_name_zh}`",
            f"- 当前阶段：`{stage}`",
            f"- 清单状态：`{clean_status}`",
            f"- 本轮是否改代码：`{code_changed}`",
            f"- 文件数：`{max(len(code_entries), existing_file_count, 0)}`",
            f"- 验证状态：`{verify_status}`",
            f"- 关联业务链地图：`Projects/飞枢系统/03-业务链资产/地图/newfee/{chain_id}.md`",
        ]
    )
    conclusion = "\n".join(
        [
            "## 本轮结论",
            f"- 当前结论：{summary or existing_conclusion or '待补充'}",
            "- 备注：待补充",
        ]
    )

    content = re.sub(r"## 基本信息[\s\S]*?(?=\n## |\Z)", basic_info, content, count=1)
    content = re.sub(r"## 本轮结论[\s\S]*?(?=\n## |\Z)", conclusion, content, count=1)
    if not content.endswith("\n"):
        content += "\n"
    code_list_path.write_text(content, encoding="utf-8")


def parse_code_list_meta(path: Path) -> Dict[str, str]:
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    result: Dict[str, str] = {}
    for field in ["当前阶段", "清单状态", "本轮是否改代码", "文件数", "验证状态"]:
        match = re.search(rf"- {field}：`([^`]+)`", text)
        if match:
            result[field] = match.group(1)
    return result


def ensure_map_links(map_path: Path, chain_id: str) -> None:
    if not map_path.exists():
        return

    content = map_path.read_text(encoding="utf-8")
    links_block = "\n".join(
        [
            "## 关联文档",
            f"- 代码清单：`Projects/飞枢系统/03-业务链资产/代码清单/newfee/{chain_id}.md`",
        ]
    )

    if "## 关联文档" in content:
        content = re.sub(
            r"## 关联文档[\s\S]*?(?=\n## |\Z)",
            links_block,
            content,
            count=1,
        )
    elif "## 当前阶段状态" in content:
        content = re.sub(
            r"(## 当前阶段状态[\s\S]*?(?=\n## |\Z))",
            r"\1\n\n" + links_block,
            content,
            count=1,
        )
    else:
        title_end = content.find("\n")
        if title_end == -1:
            content += "\n\n" + links_block + "\n"
        else:
            content = content[: title_end + 1] + "\n" + links_block + "\n\n" + content[title_end + 1 :]

    if not content.endswith("\n"):
        content += "\n"
    map_path.write_text(content, encoding="utf-8")


def build_code_lists_overview(code_lists_dir: Path, chain_status: Dict[str, Dict[str, str]]) -> str:
    rows = [
        "# 飞枢系统代码清单总览",
        "",
        "## 说明",
        "- 这份文档按业务链汇总实际代码改动清单",
        "- 主控在业务链进入 `S5 / ROLLBACK / BLOCKED` 时同步更新",
        "",
        "## 当前清单状态",
        "",
        "| 业务链 | 中文名 | 阶段 | 清单状态 | 本轮是否改代码 | 文件数 | 验证状态 | 地图 | 明细 |",
        "|---|---|---|---|---|---:|---|---|---|",
    ]

    for chain_id in ALL_CHAINS:
        meta = parse_code_list_meta(code_lists_dir / f"{chain_id}.md")
        stage = stage_for_overview(chain_id, chain_status)
        clean_status = meta.get("清单状态", "待更新")
        code_changed = meta.get("本轮是否改代码", "未开始" if stage not in {"S5", "ROLLBACK"} else "待补")
        file_count = meta.get("文件数", "0")
        verify_status = meta.get(
            "验证状态",
            "阻塞" if stage == "BLOCKED" else "已回滚" if stage == "ROLLBACK" else "未验证",
        )
        rows.append(
            f"| {chain_id} | {CHAIN_ZH.get(chain_id, chain_id)} | {stage} | {clean_status} | {code_changed} | {file_count} | {verify_status} | `03-业务链资产/地图/newfee/{chain_id}.md` | `03-业务链资产/代码清单/newfee/{chain_id}.md` |"
        )

    return "\n".join(rows) + "\n"


def classify_runtime_buckets(chain_status: Dict[str, Dict[str, str]], tmux_sessions: Iterable[str], source_id: Optional[str] = None):
    candidate_chain_ids = _order_chain_ids(set(ALL_CHAINS) | set(chain_status.keys()) | set(iter_chain_ids_from_sessions(tmux_sessions, source_id=source_id)))
    chain_sessions = iter_chain_ids_from_sessions(tmux_sessions, source_id=source_id)
    running = []
    pending = []
    blocked = [chain_id for chain_id in candidate_chain_ids if is_chain_blocked(chain_id, chain_status)]
    rollback = [chain_id for chain_id in candidate_chain_ids if is_chain_rollback(chain_id, chain_status)]
    completed_kept = []
    pending = [chain_id for chain_id in candidate_chain_ids if is_chain_pending(chain_id, chain_status)]
    for chain_id in chain_sessions:
        if is_chain_blocked(chain_id, chain_status):
            continue
        elif is_chain_rollback(chain_id, chain_status):
            continue
        elif is_chain_pending(chain_id, chain_status):
            continue
        elif get_chain_stage(chain_id, chain_status) == "S5":
            completed_kept.append(chain_id)
        else:
            running.append(chain_id)
    return running, blocked, rollback, completed_kept, pending


def _load_work_items_for_chain_ids(
    chain_ids: Iterable[str],
    *,
    work_items_dir: Optional[Path] = None,
) -> Dict[str, Dict[str, object]]:
    loaded: Dict[str, Dict[str, object]] = {}
    for chain_id in _order_chain_ids(chain_ids):
        path = get_work_item_path(chain_id, work_items_dir)
        if not path.exists():
            continue
        loaded[chain_id] = load_work_item(chain_id, work_items_dir)
    return loaded


def get_main_control_resume_packet_path(sessions_dir: Optional[Path] = None) -> Path:
    base_dir = Path(sessions_dir) if sessions_dir is not None else SESSIONS_DIR
    return base_dir / "main-control-resume.json"


def get_chain_resume_packet_path(chain_id: str, sessions_dir: Optional[Path] = None) -> Path:
    base_dir = Path(sessions_dir) if sessions_dir is not None else SESSIONS_DIR
    return base_dir / CHAIN_RESUME_DIRNAME / f"{chain_id}.json"


def _build_resume_summary_entry(
    chain_id: str,
    *,
    chain_status: Dict[str, Dict[str, str]],
    tmux_sessions: Iterable[str],
    work_items: Dict[str, Dict[str, object]],
    running: Iterable[str],
    pending: Iterable[str],
    blocked: Iterable[str],
    rollback: Iterable[str],
    queued: Iterable[str] = (),
    completed_kept: Iterable[str] = (),
    source_id: Optional[str] = None,
) -> Dict[str, object]:
    running_set = set(running)
    pending_set = set(pending)
    blocked_set = set(blocked)
    rollback_set = set(rollback)
    queued_set = set(queued)
    completed_kept_set = set(completed_kept)

    truth_mode: Optional[str] = None
    if chain_id in running_set:
        truth_mode = "active"
    elif chain_id in pending_set:
        truth_mode = "hold"
    elif chain_id in blocked_set:
        truth_mode = "blocked"
    elif chain_id in rollback_set:
        truth_mode = "escalate"
    elif chain_id in chain_status and get_chain_stage(chain_id, chain_status) in {"S1", "S2", "S3", "S4"}:
        truth_mode = "active"
    elif chain_id in queued_set:
        truth_mode = "hold"
    elif chain_id in completed_kept_set:
        truth_mode = "done"

    item = work_items.get(chain_id)
    if isinstance(item, dict) and truth_mode is None:
        mode = "escalate"
        task = item.get("currentTask", "待补充")
    elif isinstance(item, dict) and truth_mode is not None:
        mode = truth_mode
        task = item.get("currentTask", _default_current_task_for_mode(truth_mode))
    else:
        mode = truth_mode or "escalate"
        task = _default_current_task_for_mode(mode if isinstance(mode, str) else "escalate")

    session_running = chain_id in set(iter_chain_ids_from_sessions(tmux_sessions, source_id=source_id))
    return {
        "chainId": chain_id,
        "stage": get_chain_stage(chain_id, chain_status) or None,
        "summary": chain_status.get(chain_id, {}).get("summary", "") if isinstance(chain_status.get(chain_id, {}), dict) else "",
        "mode": mode,
        "currentTask": task,
        "recoverable": bool(mode == "active"),
        "queued": chain_id in queued_set,
        "sessionRunning": session_running,
        "blocked": chain_id in blocked_set,
        "rollback": chain_id in rollback_set,
    }


def _format_main_control_work_item_line(entry: Dict[str, object]) -> str:
    mode = entry.get("mode", "escalate")
    return f"- `{entry['chainId']}`：mode=`{mode}`；任务={entry.get('currentTask', '待补充')}；可恢复={_format_resume_flag(mode if isinstance(mode, str) else 'escalate')}"


def build_main_control_resume_packet(
    *,
    generated_at: str,
    handoff_path: str,
    chain_status: Dict[str, Dict[str, str]],
    queue: Dict,
    tmux_sessions: Iterable[str],
    work_items: Dict[str, Dict[str, object]],
    previous_packet: Optional[Dict[str, object]] = None,
    source_id: Optional[str] = None,
) -> Dict[str, object]:
    running, blocked, rollback, completed_kept, pending = classify_runtime_buckets(chain_status, tmux_sessions, source_id=source_id)
    queued = list(queue.get("pendingStart", []))
    tracked_chain_ids = _order_chain_ids(list(running) + list(pending) + list(blocked) + list(rollback) + list(queued) + list(completed_kept))
    tracked_chains = {
        chain_id: _build_resume_summary_entry(
            chain_id,
            chain_status=chain_status,
            tmux_sessions=tmux_sessions,
            work_items=work_items,
            running=running,
            pending=pending,
            blocked=blocked,
            rollback=rollback,
            queued=queued,
            completed_kept=completed_kept,
            source_id=source_id,
        )
        for chain_id in tracked_chain_ids
    }
    work_item_summary = {
        chain_id: {
            "mode": tracked_chains[chain_id]["mode"],
            "currentTask": tracked_chains[chain_id]["currentTask"],
            "recoverable": tracked_chains[chain_id]["recoverable"],
        }
        for chain_id in tracked_chain_ids
    }

    packet = {
        "generatedAt": generated_at,
        "handoffPath": handoff_path,
        "running": running,
        "pending": pending,
        "blocked": blocked,
        "rollback": rollback,
        "completedKept": completed_kept,
        "queue": {
            "pendingStart": list(queue.get("pendingStart", [])),
            "nextCandidate": queue.get("nextCandidate"),
            "updatedAt": queue.get("updatedAt"),
        },
        "trackedChains": tracked_chains,
        "workItems": work_item_summary,
    }
    packet["delta"] = build_main_control_delta(previous_packet, packet)
    return packet


def build_main_control_delta(previous_packet: Optional[Dict[str, object]], current_packet: Dict[str, object]) -> Dict[str, object]:
    if not isinstance(previous_packet, dict):
        return {
            "changedChains": [],
            "queueAdded": list(current_packet.get("queue", {}).get("pendingStart", [])),
            "queueRemoved": [],
            "modeChanged": [],
            "taskChanged": [],
        }

    previous_tracked = previous_packet.get("trackedChains", {}) if isinstance(previous_packet.get("trackedChains", {}), dict) else {}
    current_tracked = current_packet.get("trackedChains", {}) if isinstance(current_packet.get("trackedChains", {}), dict) else {}
    changed_chains: List[str] = []
    mode_changed: List[Dict[str, object]] = []
    task_changed: List[Dict[str, object]] = []

    for chain_id in _order_chain_ids(set(previous_tracked.keys()) | set(current_tracked.keys())):
        previous_entry = previous_tracked.get(chain_id, {}) if isinstance(previous_tracked.get(chain_id, {}), dict) else {}
        current_entry = current_tracked.get(chain_id, {}) if isinstance(current_tracked.get(chain_id, {}), dict) else {}
        if previous_entry != current_entry:
            changed_chains.append(chain_id)
            if previous_entry.get("mode") != current_entry.get("mode"):
                mode_changed.append(
                    {
                        "chainId": chain_id,
                        "from": previous_entry.get("mode"),
                        "to": current_entry.get("mode"),
                    }
                )
            if previous_entry.get("currentTask") != current_entry.get("currentTask"):
                task_changed.append(
                    {
                        "chainId": chain_id,
                        "from": previous_entry.get("currentTask"),
                        "to": current_entry.get("currentTask"),
                    }
                )

    previous_queue = previous_packet.get("queue", {}) if isinstance(previous_packet.get("queue", {}), dict) else {}
    current_queue = current_packet.get("queue", {}) if isinstance(current_packet.get("queue", {}), dict) else {}
    previous_pending = list(previous_queue.get("pendingStart", [])) if isinstance(previous_queue.get("pendingStart", []), list) else []
    current_pending = list(current_queue.get("pendingStart", [])) if isinstance(current_queue.get("pendingStart", []), list) else []

    return {
        "changedChains": changed_chains,
        "queueAdded": [chain_id for chain_id in current_pending if chain_id not in previous_pending],
        "queueRemoved": [chain_id for chain_id in previous_pending if chain_id not in current_pending],
        "modeChanged": mode_changed,
        "taskChanged": task_changed,
    }


def build_chain_resume_packet(
    *,
    chain_id: str,
    generated_at: str,
    chain_status: Dict[str, Dict[str, str]],
    queue: Dict,
    tmux_sessions: Iterable[str],
    work_items: Dict[str, Dict[str, object]],
    previous_packet: Optional[Dict[str, object]] = None,
    source_id: Optional[str] = None,
) -> Dict[str, object]:
    running, blocked, rollback, completed_kept, pending = classify_runtime_buckets(chain_status, tmux_sessions, source_id=source_id)
    entry = _build_resume_summary_entry(
        chain_id,
        chain_status=chain_status,
        tmux_sessions=tmux_sessions,
        work_items=work_items,
        running=running,
        pending=pending,
        blocked=blocked,
        rollback=rollback,
        queued=list(queue.get("pendingStart", [])),
        completed_kept=completed_kept,
        source_id=source_id,
    )
    packet = {
        "generatedAt": generated_at,
        "chainId": chain_id,
        "stage": entry["stage"],
        "summary": entry["summary"],
        "mode": entry["mode"],
        "currentTask": entry["currentTask"],
        "recoverable": entry["recoverable"],
        "queued": entry["queued"],
        "sessionRunning": entry["sessionRunning"],
        "blocked": entry["blocked"],
        "rollback": entry["rollback"],
        "paths": build_source_chain_asset_paths(chain_id, source_id=source_id),
    }
    previous = previous_packet if isinstance(previous_packet, dict) else {}
    packet["delta"] = {
        "stageChanged": previous.get("stage") != packet["stage"] if previous else False,
        "modeChanged": previous.get("mode") != packet["mode"] if previous else False,
        "taskChanged": previous.get("currentTask") != packet["currentTask"] if previous else False,
        "summaryChanged": previous.get("summary") != packet["summary"] if previous else False,
        "queuedChanged": previous.get("queued") != packet["queued"] if previous else False,
        "sessionRunningChanged": previous.get("sessionRunning") != packet["sessionRunning"] if previous else False,
    }
    return packet


def write_resume_packets(
    *,
    sessions_dir: Path,
    generated_at: str,
    handoff_path: str,
    chain_status: Dict[str, Dict[str, str]],
    queue: Dict,
    tmux_sessions: Iterable[str],
    work_items: Dict[str, Dict[str, object]],
    source_id: Optional[str] = None,
) -> Dict[str, object]:
    sessions_dir.mkdir(parents=True, exist_ok=True)
    chain_resume_dir = sessions_dir / CHAIN_RESUME_DIRNAME
    chain_resume_dir.mkdir(parents=True, exist_ok=True)

    main_packet_path = get_main_control_resume_packet_path(sessions_dir)
    previous_main_packet = load_json(main_packet_path, None)
    main_packet = build_main_control_resume_packet(
        generated_at=generated_at,
        handoff_path=handoff_path,
        chain_status=chain_status,
        queue=queue,
        tmux_sessions=tmux_sessions,
        work_items=work_items,
        previous_packet=previous_main_packet,
        source_id=source_id,
    )
    write_json(main_packet_path, main_packet)

    chain_packets: Dict[str, Dict[str, object]] = {}
    for chain_id in main_packet.get("trackedChains", {}).keys():
        chain_packet_path = get_chain_resume_packet_path(chain_id, sessions_dir)
        previous_chain_packet = load_json(chain_packet_path, None)
        chain_packet = build_chain_resume_packet(
            chain_id=chain_id,
            generated_at=generated_at,
            chain_status=chain_status,
            queue=queue,
            tmux_sessions=tmux_sessions,
            work_items=work_items,
            previous_packet=previous_chain_packet,
            source_id=source_id,
        )
        write_json(chain_packet_path, chain_packet)
        chain_packets[chain_id] = chain_packet

    for stale_path in chain_resume_dir.glob("*.json"):
        if stale_path.stem not in chain_packets:
            stale_path.unlink()

    return {
        "main": main_packet,
        "chains": chain_packets,
    }


def resolve_existing_handoff_path(sessions_dir: Path) -> str:
    latest_path = sessions_dir / "LATEST.md"
    if latest_path.exists():
        latest_handoff = extract_latest_handoff_path(latest_path.read_text(encoding="utf-8"))
        if latest_handoff:
            return latest_handoff

    existing_packet = load_json(get_main_control_resume_packet_path(sessions_dir), None)
    if isinstance(existing_packet, dict):
        handoff_path = existing_packet.get("handoffPath")
        if isinstance(handoff_path, str) and handoff_path.strip():
            return handoff_path.strip()

    return _build_sessions_relative_path(sessions_dir, "LATEST.md")


def refresh_resume_packets(
    *,
    sessions_dir: Path,
    chain_status: Dict[str, Dict[str, str]],
    queue: Dict,
    tmux_sessions: Iterable[str],
    work_items_dir: Optional[Path] = None,
    source_id: Optional[str] = None,
    generated_at: Optional[str] = None,
) -> Dict[str, object]:
    running, blocked, rollback, completed_kept, pending = classify_runtime_buckets(chain_status, tmux_sessions, source_id=source_id)
    work_items = _load_work_items_for_chain_ids(
        list(running) + list(pending) + list(blocked) + list(rollback) + list(queue.get("pendingStart", [])) + list(completed_kept),
        work_items_dir=work_items_dir,
    )
    return write_resume_packets(
        sessions_dir=sessions_dir,
        generated_at=generated_at or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        handoff_path=resolve_existing_handoff_path(sessions_dir),
        chain_status=chain_status,
        queue=queue,
        tmux_sessions=tmux_sessions,
        work_items=work_items,
        source_id=source_id,
    )


def _format_resume_flag(mode: str) -> str:
    if mode == "active":
        return "是"
    if mode in {"hold", "blocked", "done"}:
        return "否"
    return "待裁决"


def build_main_control_work_item_section(
    work_items: Dict[str, Dict[str, object]],
    *,
    chain_status: Dict[str, Dict[str, str]],
    running: Iterable[str],
    pending: Iterable[str],
    blocked: Iterable[str],
    rollback: Iterable[str],
    queued: Iterable[str] = (),
    completed_kept: Iterable[str] = (),
) -> List[str]:
    summary_ids = _order_chain_ids(list(running) + list(pending) + list(blocked) + list(rollback) + list(queued) + list(completed_kept))
    lines = ["## 当前 work-item 摘要"]
    rendered = 0
    for chain_id in summary_ids:
        entry = _build_resume_summary_entry(
            chain_id,
            chain_status=chain_status,
            tmux_sessions=[],
            work_items=work_items,
            running=running,
            pending=pending,
            blocked=blocked,
            rollback=rollback,
            queued=queued,
            completed_kept=completed_kept,
        )
        lines.append(_format_main_control_work_item_line(entry))
        rendered += 1
    if rendered == 0:
        lines.append("- 无")
    return lines


def build_main_control_delta_section(delta: Optional[Dict[str, object]]) -> List[str]:
    payload = delta if isinstance(delta, dict) else {}
    changed = payload.get("changedChains", []) if isinstance(payload.get("changedChains", []), list) else []
    queue_added = payload.get("queueAdded", []) if isinstance(payload.get("queueAdded", []), list) else []
    queue_removed = payload.get("queueRemoved", []) if isinstance(payload.get("queueRemoved", []), list) else []
    mode_changed = payload.get("modeChanged", []) if isinstance(payload.get("modeChanged", []), list) else []
    task_changed = payload.get("taskChanged", []) if isinstance(payload.get("taskChanged", []), list) else []
    mode_changed_ids = [f"`{item.get('chainId')}`" for item in mode_changed if isinstance(item, dict) and item.get("chainId")]
    task_changed_ids = [f"`{item.get('chainId')}`" for item in task_changed if isinstance(item, dict) and item.get("chainId")]

    return [
        "## 本次增量变化",
        f"- 发生变化的链：{'、'.join(f'`{chain_id}`' for chain_id in changed) if changed else '无'}",
        f"- 新增待启动：{'、'.join(f'`{chain_id}`' for chain_id in queue_added) if queue_added else '无'}",
        f"- 移出待启动：{'、'.join(f'`{chain_id}`' for chain_id in queue_removed) if queue_removed else '无'}",
        f"- mode 变化：{'、'.join(mode_changed_ids) if mode_changed_ids else '无'}",
        f"- 任务变化：{'、'.join(task_changed_ids) if task_changed_ids else '无'}",
    ]


def build_handoff_doc(
    *,
    timestamp: str,
    chain_status: Dict[str, Dict[str, str]],
    queue: Dict,
    tmux_sessions: Iterable[str],
    work_items: Optional[Dict[str, Dict[str, object]]] = None,
    delta: Optional[Dict[str, object]] = None,
) -> str:
    running, blocked, rollback, completed_kept, pending = classify_runtime_buckets(chain_status, tmux_sessions)
    queued = list(queue.get("pendingStart", []))
    return "\n".join(
        [
            f"# {timestamp} main-control handoff",
            "",
            "## 本次会话结论",
            "- 本次做了什么：已完成主控真值快照、控制台状态同步与交接文档刷新。",
            "- 当前全局状态：已完成主控真值快照",
            "- 当前风险：已完成链 session 若仍保留，应视为不占并发的保留现场；当前波次未收口前，不触发下一波次 Wave 汇总。",
            "",
            "## 当前真值",
            "- `Projects/飞枢系统/share/chain-status.json`",
            "- `Projects/飞枢系统/share/dispatch-queue.json`",
            "- `tmux ls`",
            "",
            "## 当前运行态",
            f"- 运行中：{'、'.join(f'`{x}`' for x in running) if running else '无'}",
            f"- 当前挂起：{'、'.join(f'`{x}`' for x in pending) if pending else '无'}",
            f"- 已完成保留：{'、'.join(f'`{x}`' for x in completed_kept) if completed_kept else '无'}",
            f"- 当前阻塞：{'、'.join(f'`{x}`' for x in blocked) if blocked else '无'}",
            f"- 当前撤回：{'、'.join(f'`{x}`' for x in rollback) if rollback else '无'}",
            "",
            "## 当前队列",
            *([f"- `{item}`" for item in queue.get("pendingStart", [])] or ["- 无"]),
            "",
            *build_main_control_delta_section(delta),
            "",
            *build_main_control_work_item_section(
                work_items or {},
                chain_status=chain_status,
                running=running,
                pending=pending,
                blocked=blocked,
                rollback=rollback,
                queued=queued,
                completed_kept=completed_kept,
            ),
            "",
            "## 文档状态",
            "- Maps：已存在",
            "- CodeLists：已存在",
            "- 首页：已存在",
            "- 记忆：已存在",
            "",
            *build_control_center_progress_section(),
            "",
            "## 下一任主控先做什么",
            "1. 读取 `Projects/飞枢系统/Sessions/LATEST.md`",
            "2. 对齐 `chain-status.json`、`dispatch-queue.json` 与 `tmux ls`",
            "3. 继续处理后续主控事项",
            "",
        ]
    )


def build_latest_handoff_doc(
    *,
    handoff_path: str,
    chain_status: Optional[Dict[str, Dict[str, str]]] = None,
    running: Iterable[str],
    pending: Iterable[str] = (),
    blocked: Iterable[str],
    rollback: Iterable[str],
    next_chains: Iterable[str],
    work_items: Optional[Dict[str, Dict[str, object]]] = None,
    completed_kept: Iterable[str] = (),
    delta: Optional[Dict[str, object]] = None,
    control_paths: Optional[Dict[str, str]] = None,
) -> str:
    running = list(running)
    pending = list(pending)
    blocked = list(blocked)
    rollback = list(rollback)
    next_chains = list(next_chains)
    effective_control_paths = control_paths or build_source_control_paths()
    effective_chain_status = chain_status or {}
    return "\n".join(
        [
            "# 飞枢系统主控最新交接",
            "",
            "## 最新交接页",
            f"- `{handoff_path}`",
            "",
            "## 先读这些",
            f"1. `{effective_control_paths['mainPacket']}`",
            "2. `Projects/飞枢系统/share/memory-distilled.md`",
            "3. `Projects/飞枢系统/README.md`",
            f"4. `{effective_control_paths['chainStatus']}`",
            f"5. `{effective_control_paths['queue']}`",
            f"6. `{effective_control_paths['codeListsOverview']}`",
            "",
            "## 当前真值来源",
            f"- 链状态：`{effective_control_paths['chainStatus']}`",
            f"- 队列：`{effective_control_paths['queue']}`",
            f"- 链注册表：`{effective_control_paths['registry']}`",
            f"- 调度器期望状态：`{effective_control_paths['scheduler']}`",
            "- 运行态：`tmux ls`",
            "",
            *build_control_center_progress_section(),
            "",
            "## 当前重点",
            f"- 当前运行中：{'、'.join(f'`{x}`' for x in running) if running else '无'}",
            f"- 当前挂起：{'、'.join(f'`{x}`' for x in pending) if pending else '无'}",
            f"- 当前阻塞：{'、'.join(f'`{x}`' for x in blocked) if blocked else '无'}",
            f"- 当前撤回：{'、'.join(f'`{x}`' for x in rollback) if rollback else '无'}",
            f"- 下一步优先链：{'、'.join(f'`{x}`' for x in next_chains) if next_chains else '无'}",
            "",
            *build_main_control_delta_section(delta),
            "",
            *build_main_control_work_item_section(
                work_items or {},
                chain_status=effective_chain_status,
                running=running,
                pending=pending,
                blocked=blocked,
                rollback=rollback,
                queued=next_chains,
                completed_kept=completed_kept,
            ),
            "",
            "## 上下文阈值规则",
            "- 70%：开始交接提醒",
            "- 77%：强制切新 session",
            "- 70% 后不再开启新的大任务",
            "- 77% 后只允许做最后同步与交接输出",
            "",
        ]
    )


def extract_latest_handoff_path(content: str) -> Optional[str]:
    match = re.search(r"## 最新交接页\n- `([^`]+)`", content)
    return match.group(1) if match else None


def build_main_control_resume_prompt(*, latest_path: str, work_items_dir: Optional[Path] = None, chain_status_path: Optional[str] = None, queue_path: Optional[str] = None, code_lists_overview_path: Optional[str] = None, main_packet_path: Optional[str] = None) -> str:
    """全局主控恢复提示词：跨 source 摘要视角，不读链级细节。"""
    global_resume_packet_path = _sessions_str("global-main-control-resume.json")
    memory_distilled_path = _share_str("memory-distilled.md")
    workspaces_path = _share_str("workspaces.json")
    return "\n".join(
        [
            "你现在是飞枢系统的全局主控 session。",
            "",
            "【职责范围 —— 只做这些】",
            "- 跨 source 全局调度与并发管理",
            "- 全局 preflight 与健康检查",
            "- 各 source 状态摘要汇总与波次判断",
            "- 接收子主控 / Worker 通知，输出全局状态面板",
            "- 主控上下文交接与轮换",
            "",
            "【禁止越界 —— 这些不归你】",
            "- 不直接进入任何 source 的链实现细节",
            "- 不读写 share/sources/{sourceId}/ 下的链级文件",
            "- 子主控负责的工作不要替代",
            "",
            "先不要做任何实现，先恢复上下文。",
            "",
            "按顺序读取（全局视角，不读链级细节）：",
            f"1. {memory_distilled_path}",
            f"2. {global_resume_packet_path}",
            f"3. {latest_path}",
            "4. tmux ls（了解当前全局运行态）",
            "5. 如仍需补充，再读：",
            f"   - {workspaces_path}",
            "   - 某个 source 的 Sessions/sources/{sourceId}/LATEST.md（按需，遇到具体 source 决策时才读）",
            "",
            "恢复前先检查 Console `/api/health` 或顶部 freshness banner。",
            "若 freshness 为 `DRIFT`，先停止高风险动作并处理漂移。",
            "",
            "恢复后只输出：",
            "- 当前活跃 source 数与全局并发状态",
            "- 各 source 摘要（运行中 / 挂起 / 阻塞）",
            "- 全局待办",
            "- 下一步建议",
        ]
    )


def build_source_main_control_resume_prompt(
    source_id: str,
    *,
    source_label: str = "",
    latest_path: str = "",
    main_packet_path: str = "",
    chain_status_path: str = "",
    queue_path: str = "",
    source_doc_path: str = "",
    work_items_dir: str = "",
) -> str:
    """子主控恢复提示词：单 source 视角，不跨 source，职责边界硬约束。"""
    proj = str(_get_project_root())
    label = source_label or source_id
    effective_main_packet = main_packet_path or f"{proj}/Sessions/sources/{source_id}/main-control-resume.json"
    effective_latest = latest_path or f"{proj}/Sessions/sources/{source_id}/LATEST.md"
    effective_chain_status = chain_status_path or f"{proj}/share/sources/{source_id}/chain-status.json"
    effective_queue = queue_path or f"{proj}/share/sources/{source_id}/dispatch-queue.json"
    effective_work_items = work_items_dir or f"{proj}/share/sources/{source_id}/work-items"
    effective_source_doc = source_doc_path or f"{proj}/05-需求/{source_id}/"
    return "\n".join(
        [
            f"你现在是飞枢系统 [{source_id} / {label}] 需求源的子主控 session。",
            "",
            f"【职责范围 —— 只管 {source_id}】",
            f"- 管理当前需求源 {source_id} 下的所有业务链：拆解、推进、验证、收口",
            "- 处理 Defect 链的缺陷",
            "- 完成阶段后通过 notify-main-control.sh 通知全局主控",
            "",
            "【禁止越界 —— 这些不归你】",
            "- 不操作其他 source 的任何文件或 session",
            "- 不调整全局并发上限或全局调度策略",
            f"- 不直接修改 Sessions/LATEST.md 或全局文件（你的范围是 Sessions/sources/{source_id}/）",
            "",
            "先不要做任何实现，先恢复上下文。",
            "",
            f"按顺序读取（{source_id} 范围，禁止引入其他 source 状态）：",
            f"1. {proj}/share/memory-distilled.md",
            f"2. {effective_main_packet}",
            f"3. {effective_latest}",
            f"4. {effective_chain_status}",
            f"5. {effective_queue}",
            f"6. tmux ls | grep chain-{source_id}（了解当前 source 运行态）",
            "7. 如链状态摘要不足以理解 source 目标，再补读：",
            f"   - {effective_source_doc} 下对应需求文档的【背景】节（只读第一个 H2 节，不读全文）",
            "8. 处理具体链决策时，按需补读：",
            f"   - {effective_work_items}/{{ChainId}}.json",
            "",
            "恢复前先检查 Console `/api/health` 或顶部 freshness banner。",
            "若 freshness 为 `DRIFT`，先停止实施并上报全局主控。",
            "",
            "恢复后只输出：",
            f"- 当前 source [{label}] 的链状态摘要",
            "- 运行中 / 挂起 / 阻塞",
            f"- 当前 {source_id} 有效待办",
            "- 唯一下一步",
        ]
    )


def build_system_iteration_prompt(current_task: str = "") -> str:
    """飞枢系统迭代会话恢复提示词：只改飞枢系统本身，禁止做业务实现。"""
    proj = str(_get_project_root())
    state_path = Path(proj) / "share" / "global" / "system-iteration-state.json"
    state_task = ""
    state_updated_at = ""
    if state_path.exists():
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
        except Exception:
            state = {}
        state_task = state.get("currentTask", "") if isinstance(state.get("currentTask", ""), str) else ""
        state_updated_at = state.get("updatedAt", "") if isinstance(state.get("updatedAt", ""), str) else ""
    effective_task = current_task or state_task
    task_line = f"\n当前迭代任务：{effective_task}\n" if effective_task else "\n当前迭代任务：待命维护模式\n"
    return "\n".join(
        [
            "你现在是飞枢系统的系统迭代 session。",
            task_line,
            (f"上次任务更新时间：{state_updated_at}" if state_updated_at else "上次任务更新时间：未知"),
            "",
            "【职责范围 —— 只改飞枢系统本身】",
            "- 维护和迭代 runtime_sync.py、Playbooks/*.sh、Console/、02-协作规范/*.md",
            "- 优化提示词模板、记忆体系、目录结构",
            "- 补写 07-决策记录/ 决策记录",
            "",
            "【禁止越界 —— 严格禁止】",
            "- 不做任何 ff 仓库业务链实现",
            "- 不修改 share/sources/{sourceId}/ 下的业务真值文件",
            "- 不操作任何 chain-* 或 main-control-{sourceId} session",
            "",
            "先恢复上下文，不要直接开始改动。",
            "",
            "按顺序读取（系统视角）：",
            f"1. {proj}/share/memory-distilled.md",
            f"2. {proj}/02-协作规范/rules.md",
            f"3. {proj}/02-协作规范/ops.md",
            f"4. {proj}/07-决策记录/（了解历史决策，避免重复踩坑）",
            f"5. {proj}/Console/docs/implementation-status.md",
            f"6. {proj}/README.md",
            "",
            "按需补读（做具体改动时才读）：",
            f"- {proj}/share/runtime_sync.py（改记忆/提示词逻辑时）",
            f"- {proj}/Console/server/src/（改飞枢台后端时）",
            f"- {proj}/Console/web/src/（改飞枢台前端时）",
            f"- {proj}/Playbooks/*.sh（改脚本时）",
            "",
            "【完成每次改动后必须执行】",
            f"1. 补写 {proj}/07-决策记录/YYYY-MM-DD-{{主题}}.md",
            "2. 触发蒸馏刷新：POST http://127.0.0.1:8787/api/memory/distill",
            "3. 运行受影响的定向测试",
            "4. 如果本次任务来自 system todo，调用 POST /api/system/todos/:id/complete 标记完成",
            "5. 标记完成后，再调用 GET /api/system/todos 或检查返回结果，确认对应 todo 已从 pending 变为 done",
            "6. 如果任务未完成或有阻塞，不得调用完成 API，必须明确说明原因",
            "",
            "恢复后只输出：",
            "- 当前系统迭代任务",
            "- 上次改到哪了",
            "- 当前风险",
            "- 唯一下一步",
        ]
    )


def build_global_resume_packet(
    *,
    workspaces_path: str,
    sessions_dir: str,
    share_dir: str,
    tmux_sessions: Optional[Iterable[str]] = None,
    generated_at: Optional[str] = None,
) -> Dict[str, object]:
    """生成跨 source 全局主控恢复包，内容为 source 级摘要聚合。"""
    from datetime import datetime as _dt
    effective_at = generated_at or _dt.now().strftime("%Y-%m-%d %H:%M:%S")
    effective_sessions = list(tmux_sessions) if tmux_sessions is not None else get_tmux_session_names()

    try:
        raw = Path(workspaces_path).read_text(encoding="utf-8")
        workspaces = json.loads(raw) if raw.strip() else []
        if not isinstance(workspaces, list):
            workspaces = []
    except Exception:
        workspaces = []

    source_summaries = []
    for ws in workspaces:
        if not isinstance(ws, dict) or not ws.get("enabled"):
            continue
        source_id = ws.get("sourceId", "")
        label = ws.get("label", source_id)
        if not source_id:
            continue

        cs_path = Path(share_dir) / "sources" / source_id / "chain-status.json"
        try:
            chain_status: Dict[str, Dict[str, str]] = json.loads(cs_path.read_text(encoding="utf-8"))
        except Exception:
            chain_status = {}

        running_chains = [c for c, v in chain_status.items() if v.get("stage") not in {"S5", "PENDING", "BLOCKED", "ROLLBACK"} and not v.get("blocked")]
        blocked_chains = [c for c, v in chain_status.items() if v.get("blocked") or v.get("stage") == "BLOCKED"]
        pending_chains = [c for c, v in chain_status.items() if v.get("stage") == "PENDING"]
        done_count = sum(1 for v in chain_status.values() if v.get("stage") == "S5")
        total_count = len(chain_status)

        source_session_name = f"main-control-{source_id}"
        session_running = source_session_name in effective_sessions

        chain_sessions_for_source = [s for s in effective_sessions if s.startswith(f"chain-{source_id}-")]

        source_summaries.append({
            "sourceId": source_id,
            "label": label,
            "running": running_chains,
            "blocked": blocked_chains,
            "pending": pending_chains,
            "done": done_count,
            "total": total_count,
            "mainControlSessionRunning": session_running,
            "activeChainSessions": chain_sessions_for_source,
        })

    all_chain_sessions = [s for s in effective_sessions if s.startswith("chain-")]
    active_source_count = sum(1 for s in source_summaries if s["mainControlSessionRunning"] or s["activeChainSessions"])

    return {
        "generatedAt": effective_at,
        "activeSources": active_source_count,
        "totalSources": len(source_summaries),
        "activeChainSessions": all_chain_sessions,
        "sources": source_summaries,
    }


def build_worker_read_order_lines(
    chain_id: str,
    *,
    stage: Optional[str] = None,
    chain_resume_path: Optional[str] = None,
    map_path: Optional[str] = None,
    chain_status_path: Optional[str] = None,
    work_item_path: Optional[str] = None,
    code_list_path: Optional[str] = None,
    source_doc_path: Optional[str] = None,
) -> List[str]:
    project_root = _get_project_root()
    effective_chain_resume_path = chain_resume_path or get_chain_resume_packet_path(chain_id)
    effective_map_path = map_path or str(project_root / "03-业务链资产" / "地图" / DEFAULT_SOURCE_ID / f"{chain_id}.md")
    effective_chain_status_path = chain_status_path or str(project_root / "share" / "sources" / DEFAULT_SOURCE_ID / "chain-status.json")
    effective_work_item_path = work_item_path or str(project_root / "share" / "sources" / DEFAULT_SOURCE_ID / "work-items" / f"{chain_id}.json")
    effective_code_list_path = code_list_path or str(project_root / "03-业务链资产" / "代码清单" / DEFAULT_SOURCE_ID / f"{chain_id}.md")
    effective_source_doc_path = source_doc_path or str(project_root / f"{DEFAULT_SOURCE_ID}.md")
    ops_path = _project_str("02-协作规范", "ops.md")
    if stage == "S5":
        return [
            "按顺序重新读取（S5 轻量恢复）：",
            "### 必读热区",
            f"1. 若存在，读取 {effective_chain_resume_path}",
            f"2. {effective_chain_status_path} 中当前链的 `stage` 与 `summary`",
            f"3. {effective_code_list_path}",
            "   - 只读 `## 本轮结论`、`## 实际改动文件清单`、`## 验证`",
            "### 默认不要做",
            f"4. 不要默认全量阅读 {effective_map_path}",
            f"5. 不要默认回读 {effective_source_doc_path} 原始需求文档",
            "### 必要时补读",
            f"6. 只有在 summary 与代码清单不足以支撑 reopen 判断时，再补读 {effective_map_path} 的 `当前进展摘要/当前阻塞 / 风险/下一步动作`",
        ]

    return [
        "按顺序重新读取（只读最小必要信息，不要默认全量读文档）：",
        "### 必读热区",
        f"1. 若存在，读取 {effective_chain_resume_path}",
        f"2. {effective_chain_status_path} 中当前链的 `stage` 与 `summary`",
        f"3. 若存在，读取 {effective_work_item_path}",
        f"4. {effective_map_path}",
        "   - 只读 `## 当前进展摘要`、`## 当前阻塞 / 风险`、`## 下一步动作`",
        f"5. {effective_code_list_path}",
        "   - 只读 `## 本轮结论`、`## 实际改动文件清单`、`## 验证`",
        "### 默认不要做",
        f"6. 不要默认全量阅读 {effective_map_path} 正文",
        f"7. 不要默认全量阅读 {effective_code_list_path} 全文",
        f"8. 不要默认回读 {effective_source_doc_path} 原始需求文档",
        "### 必要时补读",
        f"9. 只有热区不足以支持当前唯一任务时，才补读 {effective_map_path} 其他 section",
        f"10. 只有要核对接口背景或边界来源时，才回读 {effective_source_doc_path} 的背景部分",
        f"11. {ops_path}（仅在动作规范不明确时补读）",
    ]


def build_worker_guardrail_lines(chain_id: str, mode: str, work_item: Dict[str, object]) -> List[str]:
    conclusion = {
        "active": "CONTINUE",
        "hold": "HOLD",
        "blocked": "BLOCKED",
        "done": "HOLD",
        "escalate": "ESCALATE",
    }.get(mode, "ESCALATE")
    mode_notes = {
        "active": "当前链处于活跃阶段，只允许继续当前唯一任务。",
        "hold": "当前真值为挂起/待定态，只允许恢复上下文、只读分析和状态判断。",
        "blocked": "当前真值为阻塞态，只允许确认阻塞原因与恢复条件。",
        "done": "当前真值为已完成态，默认只读参考，不重新开工。",
        "escalate": "当前状态存在冲突或缺少关键信息，需交回主控裁决。",
    }
    return [
        "## 恢复守门清单（必须先过，未通过不得开工）",
        "0. 先检查 Console `/api/health` 或顶部 freshness banner；若 freshness 为 `DRIFT`，先停止实施并交回主控。",
        "1. 先确认 chain-status.json 当前真值状态。",
        "2. 若存在，再确认 work-item 当前唯一任务与允许动作；若不存在，按真值守门。",
        "3. 如果文档与真值冲突，以 chain-status.json、dispatch-queue.json、tmux 运行态为准。",
        "4. 若当前模式不是 `active`，不得进入实现/测试。",
        "",
        "## 当前执行模式",
        f"- 当前模式：`{mode}`",
        f"- 守门结论：`{conclusion}`",
        f"- 当前唯一任务：{work_item['currentTask']}",
        _format_action_line("可做", work_item["allowedActions"]),
        _format_action_line("不得", work_item["forbiddenActions"]),
        f"- 模式说明：{mode_notes.get(mode, mode_notes['escalate'])}",
        f"- 期望输出：{work_item['expectedOutput']}",
        "",
    ]


def build_worker_output_contract_lines() -> List[str]:
    return [
        "读取完成后，只输出：",
        "- 当前阶段",
        "- 守门结论（CONTINUE/HOLD/BLOCKED/ESCALATE）",
        "- 当前风险",
        "- 唯一下一步",
    ]


def build_worker_prompt(
    *,
    chain_id: str,
    chain_name_zh: str,
    light_resume: bool,
    chain_status: Optional[Dict[str, Dict[str, str]]] = None,
    work_item: Optional[Dict[str, object]] = None,
    work_items_dir: Optional[Path] = None,
    chain_resume_path: Optional[str] = None,
    map_path: Optional[str] = None,
    chain_status_path: Optional[str] = None,
    work_item_path: Optional[str] = None,
    code_list_path: Optional[str] = None,
    source_doc_path: Optional[str] = None,
) -> str:
    effective_chain_status = chain_status if chain_status is not None else load_json(CHAIN_STATUS_PATH, {})
    raw_work_item = work_item if isinstance(work_item, dict) else load_json(get_work_item_path(chain_id, work_items_dir), {})
    effective_work_item = normalize_work_item(chain_id, raw_work_item)
    original_mode = raw_work_item.get("mode") if isinstance(raw_work_item, dict) else None
    if original_mode not in WORK_ITEM_MODES:
        original_mode = None
    mode = resolve_worker_mode(chain_id, effective_chain_status, effective_work_item)
    stage = get_chain_stage(chain_id, effective_chain_status)
    effective_work_item = _hydrate_worker_prompt_work_item(
        effective_work_item,
        mode,
        replace_with_mode_defaults=original_mode is not None and mode != original_mode,
    )

    intro_lines = [
        "你现在是飞枢系统的业务链 worker session。",
        f"当前业务链：`{chain_id}`（`{chain_name_zh}`）",
        "",
    ]
    if light_resume:
        intro_lines.append("这是 LIGHT resume：不要重启 session，不要新开 pane，不要清空当前 pane，只恢复上下文。")
    else:
        intro_lines.append("这是 fresh start：先恢复上下文，再严格按守门结论执行当前唯一任务。")

    return "\n".join(
        intro_lines
        + [""]
        + build_worker_read_order_lines(
            chain_id,
            stage=stage,
            chain_resume_path=chain_resume_path,
            map_path=map_path,
            chain_status_path=chain_status_path,
            work_item_path=work_item_path,
            code_list_path=code_list_path,
            source_doc_path=source_doc_path,
        )
        + [""]
        + build_worker_guardrail_lines(chain_id, mode, effective_work_item)
        + [f"如果文档与运行态冲突，以当前真值、{_get_ff_repo_path()} 真实代码和当前 tmux session 内已存在上下文为准。", ""]
        + build_worker_output_contract_lines()
    )


def build_worker_start_prompt(
    *,
    chain_id: str,
    chain_name_zh: str,
    chain_status: Optional[Dict[str, Dict[str, str]]] = None,
    work_item: Optional[Dict[str, object]] = None,
    work_items_dir: Optional[Path] = None,
    chain_resume_path: Optional[str] = None,
    map_path: Optional[str] = None,
    chain_status_path: Optional[str] = None,
    work_item_path: Optional[str] = None,
    code_list_path: Optional[str] = None,
    source_doc_path: Optional[str] = None,
) -> str:
    return build_worker_prompt(
        chain_id=chain_id,
        chain_name_zh=chain_name_zh,
        light_resume=False,
        chain_status=chain_status,
        work_item=work_item,
        work_items_dir=work_items_dir,
        chain_resume_path=chain_resume_path,
        map_path=map_path,
        chain_status_path=chain_status_path,
        work_item_path=work_item_path,
        code_list_path=code_list_path,
        source_doc_path=source_doc_path,
    )


def build_worker_resume_prompt(
    *,
    chain_id: str,
    chain_name_zh: str,
    chain_status: Optional[Dict[str, Dict[str, str]]] = None,
    work_item: Optional[Dict[str, object]] = None,
    work_items_dir: Optional[Path] = None,
    chain_resume_path: Optional[str] = None,
    map_path: Optional[str] = None,
    chain_status_path: Optional[str] = None,
    work_item_path: Optional[str] = None,
    code_list_path: Optional[str] = None,
    source_doc_path: Optional[str] = None,
) -> str:
    return build_worker_prompt(
        chain_id=chain_id,
        chain_name_zh=chain_name_zh,
        light_resume=True,
        chain_status=chain_status,
        work_item=work_item,
        work_items_dir=work_items_dir,
        chain_resume_path=chain_resume_path,
        map_path=map_path,
        chain_status_path=chain_status_path,
        work_item_path=work_item_path,
        code_list_path=code_list_path,
        source_doc_path=source_doc_path,
    )


def build_control_center_status_section() -> List[str]:
    server_cmd = f"npm --prefix {_project_str('Console', 'server')} run dev"
    web_cmd = f"npm --prefix {_project_str('Console', 'web')} run dev"
    return [
        "## 飞枢台当前状态",
        "- `飞枢台` 已从设计阶段进入实现阶段",
        "- 当前已完成：",
        "  - Console bootstrap（server / web / shared）",
        "  - truth-layer 状态加载与聚合",
        "  - `/api/overview`、`/api/chains`、`/api/queue`、`/api/events`、`/api/notifications`、`/api/health`",
        "  - Overview 总览页（总览条、运行链、队列、阶段分布、最近事件）",
        "  - 中文固定版第一轮",
        "- 当前仍未完成：",
        "  - 链详情页",
        "  - 浏览器内白名单动作",
        "  - AI 主控区实际交互",
        "  - 风险系统 / Wave 页 / 响应式布局 / 最终打磨",
        "",
        "## 当前可用能力",
        "- 浏览器查看当前全局状态",
        "- 查看当前运行链与待启动队列",
        "- 查看最近事件与通知",
        "- 查看调度器状态与主控健康状态",
        "",
        "## 当前限制",
        "- 当前以读态控制台为主",
        "- 浏览器内暂未开放受控动作",
        "- AI 主控区仍为预留区",
        "- 当前阶段临时并发策略：maxConcurrent=3，OldDataUpgrade 作为 pinned 第三并发",
        "",
        "## 启动入口",
        f"- server：`{server_cmd}`",
        f"- web：`{web_cmd}`",
        "- 浏览器：`http://127.0.0.1:4173`",
    ]


def build_control_center_progress_section() -> List[str]:
    server_cmd = f"npm --prefix {_project_str('Console', 'server')} run dev"
    web_cmd = f"npm --prefix {_project_str('Console', 'web')} run dev"
    resume_worker_cmd = f"bash {_project_str('Playbooks', 'resume-chain-session.sh')} <链中文名|ChainId>"
    pause_scheduler_cmd = f"bash {_project_str('Playbooks', 'pause-scheduler.sh')}"
    resume_scheduler_cmd = f"bash {_project_str('Playbooks', 'resume-scheduler.sh')}"
    return [
        "## 当前 control-center 进度",
        "- `飞枢台` 已完成 Task 1~5：bootstrap、shared models、state loader、events/notifications、overview UI",
        "- 当前总览页已完成第一轮中文固定版",
        "- 当前可读能力：`overview / chains / queue / events / notifications / health`",
        "- 当前启动入口：`Projects/飞枢系统/Console/README.md`",
        "- 当前实现状态：`Projects/飞枢系统/Console/docs/implementation-status.md`",
        "- 新人入口：`Projects/飞枢系统/01-项目总览/00-入口.md`",
        "- 当前调度策略：`Projects/飞枢系统/share/scheduler-policy.json`（临时 pinned 第三并发：OldDataUpgrade）",
        "",
        "## 当前推荐命令",
        f"- Console server：`{server_cmd}`",
        f"- Console web：`{web_cmd}`",
        "- 浏览器：`http://127.0.0.1:4173`",
        f"- 恢复 worker：`{resume_worker_cmd}`",
        f"- 暂停调度器：`{pause_scheduler_cmd}`",
        f"- 恢复调度器：`{resume_scheduler_cmd}`",
        "",
        "## 当前未完成模块",
        "- 链详情页",
        "- 浏览器侧白名单动作",
        "- AI 主控区实际交互",
        "- 风险系统",
        "- Wave 页面",
        "- 响应式与界面 polish",
        "",
        "## 推荐下一步",
        "- 先补链详情页和对应 API drill-down",
        "- 再补浏览器白名单动作，保持只对白名单脚本放权",
        "- 之后推进 AI 主控区、风险系统、Wave 页面与响应式",
    ]


def extract_chain_status_from_project_status_dict(project_status: Dict) -> Dict[str, Dict[str, str]]:
    """从 project-status.json 字典提取链状态，兼容旧 chain-status.json 格式。"""
    chain_status: Dict[str, Dict[str, str]] = {}
    requirements = project_status.get("requirements", [])
    if not isinstance(requirements, list):
        return chain_status
    for req in requirements:
        if not isinstance(req, dict):
            continue
        for chain in req.get("chains", []):
            if not isinstance(chain, dict) or not chain.get("id"):
                continue
            chain_id = chain["id"]
            entry: Dict[str, str] = {
                "stage": str(chain.get("stage", "")),
                "updatedAt": str(chain.get("updatedAt", "")),
                "summary": str(chain.get("summary", "")),
            }
            if chain.get("blocked"):
                entry["blocked"] = "true"
            if chain.get("status") == "done":
                entry["stage"] = "S5"
            chain_status[chain_id] = entry
    return chain_status


def derive_queue_from_chain_status(chain_status: Dict[str, Dict[str, str]]) -> Dict:
    """从 chain_status 推导 queue 数据，替代 dispatch-queue.json。"""
    pending = [
        chain_id for chain_id, meta in chain_status.items()
        if meta.get("stage") == "PENDING" or meta.get("status") == "idle"
    ]
    return {
        "maxConcurrent": 2,
        "pendingStart": pending,
        "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def _maybe_extract_chain_status(raw_data):
    """自动检测数据格式：project-status.json 或旧 chain-status.json。"""
    if isinstance(raw_data, dict) and "requirements" in raw_data:
        return extract_chain_status_from_project_status_dict(raw_data)
    return raw_data if isinstance(raw_data, dict) else {}


def write_handoff_files(
    *,
    sessions_dir: Path,
    chain_status: Dict[str, Dict[str, str]],
    queue: Dict,
    tmux_sessions: Iterable[str],
    timestamp: str,
    work_items_dir: Optional[Path] = None,
    source_id: Optional[str] = None,
) -> Tuple[Path, Path]:
    sessions_dir.mkdir(parents=True, exist_ok=True)
    handoff_name = f"{timestamp}-main-control-handoff.md"
    handoff_path = sessions_dir / handoff_name
    latest_path = sessions_dir / "LATEST.md"
    handoff_rel = _build_sessions_relative_path(sessions_dir, handoff_name)
    running, blocked, rollback, completed_kept, pending = classify_runtime_buckets(chain_status, tmux_sessions, source_id=source_id)
    work_items = _load_work_items_for_chain_ids(
        list(running) + list(pending) + list(blocked) + list(rollback) + list(queue.get("pendingStart", [])) + list(completed_kept),
        work_items_dir=work_items_dir,
    )
    packets = write_resume_packets(
        sessions_dir=sessions_dir,
        generated_at=timestamp,
        handoff_path=handoff_rel,
        chain_status=chain_status,
        queue=queue,
        tmux_sessions=tmux_sessions,
        source_id=source_id,
        work_items=work_items,
    )
    handoff_path.write_text(
        build_handoff_doc(
            timestamp=timestamp,
            chain_status=chain_status,
            queue=queue,
            tmux_sessions=tmux_sessions,
            work_items=packets["main"].get("workItems", work_items),
            delta=packets["main"].get("delta"),
        ),
        encoding="utf-8",
    )
    latest_path.write_text(
        build_latest_handoff_doc(
            handoff_path=handoff_rel,
            chain_status=chain_status,
            running=running,
            pending=pending,
            blocked=blocked,
            rollback=rollback,
            next_chains=queue.get("pendingStart", []),
            work_items=packets["main"].get("workItems", work_items),
            completed_kept=completed_kept,
            delta=packets["main"].get("delta"),
            control_paths=build_source_control_paths(source_id),
        ),
        encoding="utf-8",
    )
    return handoff_path, latest_path


def _build_sessions_relative_path(sessions_dir: Path, file_name: str) -> str:
    try:
        relative = sessions_dir.resolve().relative_to(SESSIONS_DIR.resolve())
    except ValueError:
        return f"Projects/飞枢系统/Sessions/{file_name}"

    relative_str = relative.as_posix().strip("/")
    if not relative_str:
        return f"Projects/飞枢系统/Sessions/{file_name}"
    return f"Projects/飞枢系统/Sessions/{relative_str}/{file_name}"


def get_tmux_session_names() -> List[str]:
    try:
        output = subprocess.check_output("tmux ls 2>/dev/null | awk -F ':' '{print $1}'", shell=True, text=True)
    except Exception:
        return []
    return [line.strip() for line in output.splitlines() if line.strip()]


def build_project_homepage(chain_status: Dict[str, Dict[str, str]], queue: Dict) -> str:
    ff_repo_path = _get_ff_repo_path()
    project_root = _get_project_root()
    completed = [chain for chain, meta in chain_status.items() if meta.get("stage") == "S5"]
    pending = queue.get("pendingStart", [])
    pending_set = set(pending)

    def lines_for(chain_ids: List[str]) -> List[str]:
        rows = []
        for chain_id in chain_ids:
            suffix = "（阻塞）" if is_chain_blocked(chain_id, chain_status) else ""
            rows.append(f"- `{chain_id}`：{get_chain_stage(chain_id, chain_status)}{suffix}")
        return rows

    def classify(chain_ids: List[str]):
        done = [chain_id for chain_id in chain_ids if get_chain_stage(chain_id, chain_status) == "S5"]
        rollback = [chain_id for chain_id in chain_ids if is_chain_rollback(chain_id, chain_status) and chain_id not in done]
        blocked = [chain_id for chain_id in chain_ids if is_chain_blocked(chain_id, chain_status) and chain_id not in done]
        pending_stage = [
            chain_id for chain_id in chain_ids if is_chain_pending(chain_id, chain_status) and chain_id not in done and chain_id not in blocked
        ]
        waiting = [chain_id for chain_id in chain_ids if chain_id in pending_set]
        running = [
            chain_id
            for chain_id in chain_ids
            if chain_id not in done and chain_id not in waiting and chain_id not in blocked and chain_id not in rollback and chain_id not in pending_stage
        ]
        return done, rollback, blocked, pending_stage, running, waiting

    p0_done, _, _, _, _, _ = classify(P0_CHAINS)
    p1_done, p1_rollback, p1_blocked, p1_pending, p1_running, p1_waiting = classify(P1_CHAINS)
    p2_done, p2_rollback, p2_blocked, p2_pending, p2_running, p2_waiting = classify(P2_CHAINS)

    content = [
        "# 飞枢系统首页",
        "",
        "## 项目定位",
        "- 中文财税 SaaS",
        "- Java / Spring Boot / Maven / 多模块微服务",
        "- 主路径：`saas-* -> paas-core-*-api -> paas-core-* -> paas-common-api`",
        "",
        "## 仓库位置",
        f"- 代码仓库：`{ff_repo_path}`",
        f"- Obsidian 项目目录：`{project_root}`",
        "",
        "## 当前判断",
        "- 典型大业务仓库，不适合大范围重构",
        "- 最适合先做业务链地图、影响分析、最小改动",
        "- 当前已形成“主控 + worker + 自动调度 + Obsidian 沉淀”的工作流",
        "- 下一阶段重点不只是继续做链，还要建设 `飞枢台` 可视化主控面板",
        "",
        "## 当前工作流状态",
        "- 主控模式：`main-control + worker + dispatch-watcher`",
        f"- 并发上限：`{queue.get('maxConcurrent', 2)}`",
        f"- 当前业务链总数：`{len(ALL_CHAINS)}`",
        f"- 当前已完成：`{len(completed)}`",
        f"- 当前待启动：`{len(pending)}`",
        "",
        "## 当前业务链进度",
        "",
        "### P0（已完成）",
        *(lines_for(p0_done) or ["- 无"]),
        "",
        "### P1（已完成）",
        *lines_for(p1_done),
        "",
        "### P1（已撤回）",
        *(lines_for(p1_rollback) or ["- 无"]),
        "",
        "### P1（阻塞）",
        *(lines_for(p1_blocked) or ["- 无"]),
        "",
        "### P1（挂起）",
        *(lines_for(p1_pending) or ["- 无"]),
        "",
        "### P1（运行中）",
        *(lines_for(p1_running) or ["- 无"]),
        "",
        "### P1（待启动）",
        *(lines_for(p1_waiting) or ["- 无"]),
        "",
        "### P2（已完成）",
        *(lines_for(p2_done) or ["- 无"]),
        "",
        "### P2（已撤回）",
        *(lines_for(p2_rollback) or ["- 无"]),
        "",
        "### P2（阻塞）",
        *(lines_for(p2_blocked) or ["- 无"]),
        "",
        "### P2（挂起）",
        *(lines_for(p2_pending) or ["- 无"]),
        "",
        "### P2（运行中）",
        *(lines_for(p2_running) or ["- 无"]),
        "",
        "### P2（待启动）",
        *(lines_for(p2_waiting) or ["- 无"]),
        "",
        "## 当前队列状态",
        f"- `dispatch-queue.json` 当前剩余：`{len(pending)}` 条待启动链",
        *([f"  - `{item}`" for item in pending] if pending else []),
        "",
        "## 当前风险",
        "- 已完成链 session 若仍保留，应视为不占并发的保留现场",
        "- 当前波次未收口前，不触发下一波次 Wave 汇总",
        "",
        *build_control_center_status_section(),
        "",
        "## 当前重点产物",
        "- 业务链地图：`Projects/飞枢系统/03-业务链资产/地图/**/*.md`",
        "- 代码清单：`Projects/飞枢系统/03-业务链资产/代码清单/**/*.md`",
        "- 主控交接：`Projects/飞枢系统/Sessions/*.md`",
        "- 波次回顾：`Projects/飞枢系统/03-业务链资产/波次总结/**/*.md`",
        "- 主控共享状态：`Projects/飞枢系统/share/sources/newfee/chain-status.json`",
        "- 调度队列：`Projects/飞枢系统/share/sources/newfee/dispatch-queue.json`",
        "- 协作记忆：`Projects/飞枢系统/share/memory-distilled.md`",
        "",
        "## 可视化主控控制台文档",
        "- 设计文档：`Projects/飞枢系统/04-控制台与方案/设计文档/2026-03-23-飞枢台-design.md`",
        "- 实施计划：`Projects/飞枢系统/04-控制台与方案/实施计划/2026-03-23-飞枢台-implementation-plan.md`",
        "",
        "## 下次启动时先看什么",
        "1. `Projects/飞枢系统/share/memory-distilled.md`",
        "2. `Projects/飞枢系统/Sessions/LATEST.md`",
        "3. `Projects/飞枢系统/share/sources/newfee/chain-status.json`",
        "4. `Projects/飞枢系统/share/sources/newfee/dispatch-queue.json`",
        "5. 当前活跃链的 `03-业务链资产/地图/newfee/*.md`",
        "6. `Projects/飞枢系统/03-业务链资产/代码清单/newfee/需求代码文件清单.md`",
        "",
        "## 协作入口",
        "- 项目总览：`Projects/飞枢系统/README.md`",
        "- 新需求提报模板：`Projects/飞枢系统/05-需求/templates/新需求提报模板.md`",
        "- 协作蒸馏快照：`Projects/飞枢系统/share/memory-distilled.md`",
        "- 当前组合型需求入口：`Projects/飞枢系统/05-需求/newfee/newfee.md`",
        "- 业务链阶段回顾模板：`Projects/飞枢系统/05-需求/templates/阶段回顾模板.md`",
        "- 启动脚本：`Projects/飞枢系统/Playbooks/start-ff-parallel-workspace.sh`",
        "- 关闭脚本：`Projects/飞枢系统/Playbooks/stop-ff-parallel-workspace.sh`",
        "- 状态脚本：`Projects/飞枢系统/Playbooks/status-ff-parallel-workspace.sh`",
    ]
    return "\n".join(content) + "\n"


def update_memory_doc(memory_path: Path, chain_status: Dict[str, Dict[str, str]], queue: Dict) -> None:
    if not memory_path or not memory_path.exists():
        return

    def table_stage(chain_id: str) -> str:
        suffix = "（阻塞）" if is_chain_blocked(chain_id, chain_status) else ""
        return f"{get_chain_stage(chain_id, chain_status)}{suffix}{' ✅' if get_chain_stage(chain_id, chain_status) == 'S5' else ''}"

    pending_set = set(queue.get("pendingStart", []))

    def classify(chain_ids: List[str]):
        done = [chain_id for chain_id in chain_ids if get_chain_stage(chain_id, chain_status) == "S5"]
        rollback = [chain_id for chain_id in chain_ids if is_chain_rollback(chain_id, chain_status) and chain_id not in done]
        blocked = [chain_id for chain_id in chain_ids if is_chain_blocked(chain_id, chain_status) and chain_id not in done]
        pending_stage = [
            chain_id for chain_id in chain_ids if is_chain_pending(chain_id, chain_status) and chain_id not in done and chain_id not in blocked
        ]
        waiting = [chain_id for chain_id in chain_ids if chain_id in pending_set]
        running = [
            chain_id
            for chain_id in chain_ids
            if chain_id not in done and chain_id not in blocked and chain_id not in rollback and chain_id not in waiting and chain_id not in pending_stage
        ]
        return done, rollback, blocked, pending_stage, running, waiting

    p0_done, p0_rollback, p0_blocked, p0_pending, p0_running, p0_waiting = classify(P0_CHAINS)
    p1_done, p1_rollback, p1_blocked, p1_pending, p1_running, p1_waiting = classify(P1_CHAINS)
    p2_done, p2_rollback, p2_blocked, p2_pending, p2_running, p2_waiting = classify(P2_CHAINS)

    content = memory_path.read_text(encoding="utf-8")
    chain_table_rows = [
        "### 业务链地图全量（2026-03-20 建立）",
        "| 文件名                         | 中文名      | 阶段   | 优先级 |",
        "| --------------------------- | -------- | ---- | --- |",
    ]
    for chain_id in ALL_CHAINS:
        wave = get_priority_wave(chain_id)
        chain_table_rows.append(
            f"| {chain_id:<27} | {CHAIN_ZH.get(chain_id, chain_id):<8} | {table_stage(chain_id)} | {wave}  |"
        )
    chain_table_rows.extend(["", "### Reviews 波次总结"])
    chain_table = "\n".join(chain_table_rows)

    progress = "\n".join(
        [
            "## 当前推进进度（自动同步）",
            format_progress_line("P0 已完成", p0_done),
            format_progress_line("P0 已撤回", p0_rollback),
            format_progress_line("P0 阻塞", p0_blocked),
            format_progress_line("P0 挂起", p0_pending),
            format_progress_line("P0 运行中", p0_running),
            format_progress_line("P0 待启动", p0_waiting),
            format_progress_line("P1 已完成", p1_done),
            format_progress_line("P1 已撤回", p1_rollback),
            format_progress_line("P1 阻塞", p1_blocked),
            format_progress_line("P1 挂起", p1_pending),
            format_progress_line("P1 运行中", p1_running),
            format_progress_line("P1 待启动", p1_waiting),
            format_progress_line("P2 已完成", p2_done),
            format_progress_line("P2 已撤回", p2_rollback),
            format_progress_line("P2 阻塞", p2_blocked),
            format_progress_line("P2 挂起", p2_pending),
            format_progress_line("P2 运行中", p2_running),
            format_progress_line("P2 待启动", p2_waiting),
            f"- **当前机器状态**：`dispatch-queue.json` 当前剩余 {len(queue.get('pendingStart', []))} 条待启动链",
            "- **主控新规划**：`飞枢台` 已完成 Task 1 ~ Task 5，当前具备读态控制台能力，后续继续推进链详情、白名单动作、风险系统与 AI 主控区。",
        ]
    )

    content = re.sub(
        r"### 业务链地图全量（2026-03-20 建立）[\s\S]*?### Reviews 波次总结",
        chain_table,
        content,
        count=1,
    )
    content = re.sub(
        r"## 当前推进进度（(?:2026-03-23|自动同步)）[\s\S]*?## 当前形成的协作原则",
        progress + "\n\n## 当前形成的协作原则",
        content,
        count=1,
    )
    memory_path.write_text(content, encoding="utf-8")


def update_map_doc(map_path: Path, stage: str, summary: str, blocked: bool = False) -> None:
    if not map_path.exists():
        return

    content = map_path.read_text(encoding="utf-8")
    if blocked:
        stage_block = "## 当前阶段状态\n- S1 阶段：已标识阻塞\n- 结果：主控暂停推进，等待后续恢复\n"
    elif stage == "ROLLBACK":
        stage_block = "## 当前阶段状态\n- 已撤回，待重新分析\n- 原完成结论已作废\n"
    elif stage == "S5":
        stage_block = "## 当前阶段状态\n- S5 阶段：验证通过，完整收口\n- 结果：已完成当前阶段闭环\n"
    else:
        stage_block = f"## 当前阶段状态\n- {stage} 阶段：状态已更新\n"

    if "## 当前阶段状态" in content:
        content = re.sub(
            r"## 当前阶段状态[\s\S]*?(?=\n## |\Z)",
            stage_block.rstrip(),
            content,
            count=1,
        )
    else:
        content += "\n" + stage_block

    progress_line = f"- {summary}"
    if "## 当前进展" in content:
        content = re.sub(
            r"## 当前进展[\s\S]*?(?=\n## |\Z)",
            f"## 当前进展\n{progress_line}",
            content,
            count=1,
        )
    else:
        content += f"\n\n## 当前进展\n{progress_line}\n"

    if not content.endswith("\n"):
        content += "\n"
    map_path.write_text(content, encoding="utf-8")


def process_notifications_once(
    *,
    status_path: Path,
    queue_path: Path,
    notifications_dir: Path,
    processed_path: Path,
    project_home_path: Optional[Path],
    memory_path: Optional[Path],
    maps_dir: Optional[Path] = None,
    code_lists_dir: Optional[Path] = None,
    work_items_dir: Optional[Path] = None,
    tmux_sessions: Optional[Iterable[str]] = None,
) -> Dict[str, List[str]]:
    processed_state = load_json(processed_path, {"processed": []})
    already_processed = set(processed_state.get("processed", []))
    raw_status = load_json(status_path, {})
    chain_status = _maybe_extract_chain_status(raw_status)
    queue = load_json(queue_path, {"maxConcurrent": 2, "pendingStart": [], "updatedAt": ""})
    if (not queue or not queue.get("pendingStart")) and isinstance(raw_status, dict) and "requirements" in raw_status:
        queue = derive_queue_from_chain_status(chain_status)
    effective_tmux_sessions = list(tmux_sessions) if tmux_sessions is not None else get_tmux_session_names()

    processed_files: List[str] = []
    removed_from_queue: List[str] = []
    touched_chains: List[str] = []

    notification_files = sorted(notifications_dir.glob("*.md"))
    for notif_file in notification_files:
        if notif_file.name in already_processed:
            continue

        payload = parse_notification_frontmatter(notif_file)
        chain_id = payload.get("chain")
        stage = payload.get("stage")
        summary = payload.get("summary", "")
        if chain_id:
            touched_chains.append(chain_id)
        if chain_id and stage == "S5" and chain_id in queue.get("pendingStart", []):
            queue["pendingStart"] = [item for item in queue.get("pendingStart", []) if item != chain_id]
            queue["updatedAt"] = payload.get("updatedAt") or datetime.now().strftime("%Y-%m-%d %H:%M")
            removed_from_queue.append(chain_id)

        if chain_id and maps_dir:
            update_map_doc(
                Path(maps_dir) / f"{chain_id}.md",
                stage or "S1",
                summary,
                blocked=is_chain_blocked(chain_id, chain_status),
            )

        processed_files.append(notif_file.name)
        already_processed.add(notif_file.name)

    write_json(queue_path, queue)
    write_json(processed_path, {"processed": sorted(already_processed)})
    work_item_result = sync_work_items_once(
        chain_status,
        queue,
        effective_tmux_sessions,
        work_items_dir=work_items_dir,
        touched_chains=touched_chains,
    )

    if code_lists_dir:
        code_lists_dir.mkdir(parents=True, exist_ok=True)
        for chain_id in ALL_CHAINS:
            map_file = (maps_dir / f"{chain_id}.md") if maps_dir else Path(f"Projects/飞枢系统/03-业务链资产/地图/newfee/{chain_id}.md")
            ensure_code_list_doc(
                code_lists_dir / f"{chain_id}.md",
                chain_id=chain_id,
                chain_name_zh=CHAIN_ZH.get(chain_id, chain_id),
                stage=stage_for_overview(chain_id, chain_status),
                summary=chain_status.get(chain_id, {}).get("summary", "待补充"),
                map_path=map_file,
            )
            if maps_dir:
                ensure_map_links(map_file, chain_id)
        (code_lists_dir / "需求代码文件清单.md").write_text(
            build_code_lists_overview(code_lists_dir, chain_status),
            encoding="utf-8",
        )

    if project_home_path:
        project_home_path.write_text(build_project_homepage(chain_status, queue), encoding="utf-8")

    if memory_path:
        update_memory_doc(memory_path, chain_status, queue)

    return {
        "processed_files": processed_files,
        "removed_from_queue": removed_from_queue,
        **work_item_result,
    }


def main(argv: List[str]) -> int:
    if len(argv) < 2:
        print("usage: runtime_sync.py process-notifications <status> <queue> <notifications_dir> <processed> [home] [memory] [maps] [code_lists]")
        return 1

    command = argv[1]
    if command == "process-notifications":
        if len(argv) < 6:
            print("usage: runtime_sync.py process-notifications <status> <queue> <notifications_dir> <processed> [home] [memory] [maps] [code_lists]")
            return 1

        raw_status = load_json(Path(argv[2]), {})
        chain_status = _maybe_extract_chain_status(raw_status)
        queue = load_json(Path(argv[3]), {"maxConcurrent": 2, "pendingStart": [], "updatedAt": ""})

        result = process_notifications_once(
            status_path=Path(argv[2]),
            queue_path=Path(argv[3]),
            notifications_dir=Path(argv[4]),
            processed_path=Path(argv[5]),
            project_home_path=Path(argv[6]) if len(argv) > 6 and argv[6] else None,
            memory_path=Path(argv[7]) if len(argv) > 7 and argv[7] else None,
            maps_dir=Path(argv[8]) if len(argv) > 8 and argv[8] else None,
            code_lists_dir=Path(argv[9]) if len(argv) > 9 and argv[9] else None,
        )
        print(json.dumps(result, ensure_ascii=False))
        return 0

    if command == "write-handoff":
        if len(argv) < 5:
            print("usage: runtime_sync.py write-handoff <status> <queue> <sessions_dir> [timestamp]")
            return 1

        raw_status = load_json(Path(argv[2]), {})
        chain_status = _maybe_extract_chain_status(raw_status)
        queue = load_json(Path(argv[3]), {"maxConcurrent": 2, "pendingStart": [], "updatedAt": ""})
        if not queue or not queue.get("pendingStart"):
            queue = derive_queue_from_chain_status(chain_status)
        sessions_dir = Path(argv[4])
        timestamp = argv[5] if len(argv) > 5 and argv[5] else datetime.now().strftime("%Y-%m-%d-%H%M")
        handoff_path, latest_path = write_handoff_files(
            sessions_dir=sessions_dir,
            chain_status=chain_status,
            queue=queue,
            tmux_sessions=get_tmux_session_names(),
            timestamp=timestamp,
        )
        print(json.dumps({"handoff": str(handoff_path), "latest": str(latest_path)}, ensure_ascii=False))
        return 0

    if command == "refresh-resume-packets":
        if len(argv) < 5:
            print("usage: runtime_sync.py refresh-resume-packets <status> <queue> <sessions_dir> [work_items_dir] [source_id]")
            return 1

        status = load_json(Path(argv[2]), {})
        queue = load_json(Path(argv[3]), {"maxConcurrent": 2, "pendingStart": [], "updatedAt": ""})
        sessions_dir = Path(argv[4])
        work_items_dir = Path(argv[5]) if len(argv) > 5 and argv[5] else None
        source_id = argv[6] if len(argv) > 6 and argv[6] else None
        packets = refresh_resume_packets(
            sessions_dir=sessions_dir,
            chain_status=status,
            queue=queue,
            tmux_sessions=get_tmux_session_names(),
            work_items_dir=work_items_dir,
            source_id=source_id,
        )
        print(json.dumps({"generatedAt": packets["main"].get("generatedAt"), "mainPacket": str(get_main_control_resume_packet_path(sessions_dir))}, ensure_ascii=False))
        return 0

    print(f"unknown command: {command}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
