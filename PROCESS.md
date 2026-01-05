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

---

## 2025-01-05 — SDK v2 高层 API 重构

- **范围**：
  - `omem/models.py`：新增强类型返回模型（MemoryItem, SearchResult, Entity, Event, AddResult）
  - `omem/memory.py`：新增高层 Memory 和 Conversation 类
  - `omem/client.py`：新增 TKG HTTP 方法（graph_resolve_entities, graph_entity_timeline, graph_search_events 等）
  - `omem/__init__.py`：导出高层 API（Memory, Conversation, 强类型模型）
  - `omem/tests/test_memory.py`：新增 23 个单元测试
  - `SDK使用说明.md`：新增 Quick Start 和两种写入模式文档

- **决策（Why）**：
  - 原 MemoryClient 概念层次过多（client/session/buffer/handle/job），对开发者不友好
  - 返回值全是 Dict，无法 IDE 补全，不够 Pythonic
  - 需要暴露 TKG 图查询能力（omem 核心差异化）
  - 需要兼容 OpenAI messages 格式（行业惯例）
  - user_tokens 默认为 [tenant_id]（伴侣机器人场景简化）

- **实现（What/How）**：
  - **高层 API 设计原则**：
    - 简单场景一行搞定：`mem.add("conv-001", messages)`
    - 复杂场景保留控制：`conv.commit()` 显式提交
    - 强类型返回值：`SearchResult` 支持迭代、bool 判断、`to_prompt()`
  - **两种写入模式**：
    - `add()`: 自动 commit（80% 场景）
    - `conversation().commit()`: 显式 commit（批量控制）
  - **TKG API 暴露**：
    - `resolve_entity()`: 实体解析
    - `get_entity_timeline()`: 实体时间线
    - `search_events()`: 结构化事件搜索
    - `get_events_by_time()`: 时间范围查询
  - **错误处理**：
    - `search(fail_silent=True)`: 静默返回空结果
    - 默认抛出异常，明确错误边界
  - **commit 语义保留**：
    - 显式 commit 减少 TKG 图变更次数
    - with 语句支持自动 commit（无异常时）
    - 异常时不自动 commit，防止脏数据写入

- **API 映射**：

  | SDK 方法 | 后端端点 |
  |----------|----------|
  | `add()` | `POST /ingest/dialog/v1` |
  | `search()` | `POST /retrieval/dialog/v2` |
  | `resolve_entity()` | `GET /graph/v0/entities/resolve` |
  | `get_entity_timeline()` | `GET /graph/v0/entities/{id}/timeline` |
  | `search_events()` | `POST /graph/v1/search` |
  | `get_events_by_time()` | `GET /graph/v0/timeslices/range` |

- **验证（Test）**：
  - `uv run python -m pytest omem/tests/test_memory.py -v`
  - **结果**：23 passed（覆盖初始化、写入、commit 行为、搜索、错误处理）
