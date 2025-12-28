# PROCESS — omem SDK

本文件记录 omem SDK 的工程演进，确保每次变更都有清晰的“范围/动机/验证”。

---

## 2025-12-25 — SaaS Phase1：请求头标准化 + 错误分类 + 重试
- **范围**：
  - `omem/client.py`：新增 Authorization: Bearer、X-Request-ID、重试策略与错误分类。
  - `omem/__init__.py`：导出 RetryConfig 与错误类型。
  - `modules/memory/tests/unit/test_omem_sdk_http.py`：新增重试测试与请求头断言。
- **决策（Why）**：
  - SaaS 网关需要标准 `Authorization` 与 `X-Request-ID` 便于追踪；
  - SDK 侧必须能识别 401/403/429/402 等错误并进行可靠重试。
- **实现（What/How）**：
  - 默认生成 `X-Request-ID` 并透传；
  - 按状态码抛出明确的异常类型；
  - 429/5xx 与网络错误触发指数退避重试（支持 Retry-After）。
- **验证（Test）**：
  - `.venv/bin/python -m pytest modules/memory/tests/unit/test_omem_sdk_http.py modules/memory/tests/unit/test_api_auth_security.py modules/memory/tests/unit/test_api_scope_coverage.py -q`
  - **结果**：通过（19 passed）。

---

## 2025-12-27 — SDK BYOK 用量上报（LLMUsageReporter）
- **范围**：
  - `omem/usage.py`：新增 `LLMUsageReporter`，负责 BYOK `llm` 用量上报。
  - `omem/__init__.py`：导出 BYOK 相关 API（LLMAdapter/usage hook/reporting）。
  - `SDK使用说明.md`：补齐 BYOK 用量上报示例。
- **决策（Why）**：
  - BYOK 发生在 SDK/Agent 进程内，控制面无法自动计量；
  - 统一 SDK 侧上报入口，避免每个 Agent 手写 token 上报逻辑。
- **实现（What/How）**：
  - 事件结构与数据面一致（`event_type=llm` + `metrics`），并按 `tenant_id + (job_id/request_id) + stage + call_index` 生成幂等 `event_id`；
  - 提供 `context()` 以复用 LLMAdapter 的 usage hook（可自动上报）。
- **验证（Test）**：
  - `.venv/bin/python -m pytest modules/memory/tests/unit/test_omem_sdk_byok_usage.py -q`
  - **结果**：通过（2 passed）。
