# HTTP 端口现状与 SDK 对接规划（V0）

> 目标：把“现在后端到底暴露了哪些 HTTP 端口”与“施工完成后 SDK 需要调用哪些高阶端口”一次性对齐清楚，作为后续实现的硬约束参考。

---

## 1. 背景：为什么要做这份对齐

我们给开发者交付的 Python SDK 目标不是“薄封装一堆底层端点”，而是封装两条**高阶链路**：

- **写入链路（会话提交）**：开发者本地 `append_turn(...)` 累积 turns；会话关闭后 `commit()` 一次性提交到服务端，触发异步“抽取→建图→写向量”的重型写入。
- **召回链路（对话检索）**：开发者每轮对话需要回忆证据时，SDK 直接请求服务端的高阶 `retrieval(dialog_v2)`，拿到“可直接塞入上下文”的 evidence 包。

因此，我们需要把**高阶端点**（`/ingest/...` 与 `/retrieval/...`）明确为“SDK 默认调用面”，同时保证与现有 `/search` `/write` 等端点兼容共存。

> 方案选择：采用 **A**：`POST /ingest/dialog/v1` + `POST /retrieval/dialog/v2`。

---

## 2. 现状：当前后端已暴露的 HTTP 端口（来自 `modules/memory/api/server.py`）

### 2.1 核心读写端口（当前对外稳定面）

- `GET /health`
- `GET /metrics`
- `GET /metrics_prom`
- `POST /search`
- `POST /write`
- `POST /update`
- `POST /delete`
- `POST /link`
- `POST /rollback`
- `POST /batch_delete`
- `POST /batch_link`

### 2.2 图相关端口

- `POST /graph/v1/search`（Graph-first 事件候选）
- `POST /graph/v0/upsert`
- `GET /graph/v0/segments`
- `GET /graph/v0/entities/{entity_id}/timeline`
- `GET /graph/v0/entities/{entity_id}/evidences`
- `GET /graph/v0/entities/resolve`
- `GET /graph/v0/events`
- `GET /graph/v0/events/{event_id}`
- `GET /graph/v0/places`
- `GET /graph/v0/places/{place_id}`
- `GET /graph/v0/timeslices`
- `GET /graph/v0/timeslices/range`
- `GET /graph/v0/explain/first_meeting`
- `GET /graph/v0/explain/event/{event_id}`

### 2.3 高成本/专用端口（仍属于现状）

- `POST /timeline_summary`
- `POST /speech_search`
- `POST /entity_event_anchor`
- `POST /object_search`

### 2.4 配置与管理端口（现状）

- `GET|POST /config/search/rerank`
- `GET|POST /config/graph`
- `GET|POST /config/search/scoping`
- `GET|POST /config/search/ann`
- `GET|POST /config/search/modality_weights`
- `GET|POST /equiv/pending` + `POST /equiv/pending/*`
- `POST /admin/ensure_collections`
- `POST /admin/run_ttl`
- `POST /admin/decay_edges`
- `POST /graph/v0/admin/*`（equiv/ttl/构建辅助等）

---

## 3. 缺口：当前端口与“SDK 高阶链路”的不一致点

现状只有底层端口（`/search`、`/write`、`/graph/*`），但**没有** SDK 计划默认调用的两个高阶端口：

- `POST /ingest/dialog/v1`（会话提交：归档入队 → Stage2 → Stage3）
- `POST /retrieval/dialog/v2`（对话检索编排：多路召回 → 融合 →（可选）图解释/扩散 → 产出 evidence）

同时，当前代码里确实存在对应的 **in-proc 高阶函数**：

- `modules/memory/session_write.py: session_write(...)`
- `modules/memory/retrieval.py: retrieval(..., strategy="dialog_v2", ...)`

但它们目前主要由脚本直接 import 调用（例如 `modules/memory/scripts/e2e_dialog_conv26_session_write_and_retrieval.py`），而不是通过 HTTP 端点对外提供。

---

## 4. 施工完成后：新增端口（SDK 默认调用面）

> 说明：新增端口必须版本化；并且不得破坏现有 `/search` `/write` 的用户空间。

### 4.1 会话提交：`POST /ingest/dialog/v1`

用途：
- SDK 的 `commit()` 默认调用此端口。
- 服务端只承诺“已归档 + 已入队”，返回 `job_id`（异步）。

必备配套状态端口（SDK 轮询/控制台展示）：
- `GET /ingest/jobs/{job_id}`
- `GET /ingest/sessions/{session_id}`

对齐语义（与施工规范一致）：
- Stage3 未成功完成前：对外视为“未写入”（仅归档存在）
- 失败：保留归档与中间产物，后台重试直到成功

### 4.2 对话检索：`POST /retrieval/dialog/v2`

用途：
- SDK 每轮需要“回忆证据”时调用此端口。
- 端口内部执行 `retrieval(..., strategy="dialog_v2")` 的编排逻辑，返回 evidence（以及可选 debug）。

关键原则：
- SDK 不在本地复刻五路检索/融合/图扩散策略；策略属于服务端（可演进、可配置、可版本化）。
- 端口内部可以调用底层 `/search` 的等价逻辑（in-proc 或内部方法），但这属于实现细节，不对 SDK 暴露。

---

## 5. SDK 与后端的交互：时序与职责边界

> 对外发布的 Python SDK 包名（import name）统一为：`omem`（全小写）。

### 5.1 写入链路（会话提交）

SDK（本地）：
- `append_turn(...)`：只本地缓存 turns，不发网络
- `commit()`：一次 HTTP 调用提交增量 turns

服务端：
- `POST /ingest/dialog/v1`：归档 + 入队（返回 job_id）
- 后台 job：Stage2（价值标注）→ Stage3（抽取建图写向量）→ publish
- 失败：保留归档/中间产物 → 定期重试直到成功

### 5.2 召回链路（对话检索）

SDK（本地）：
- `retrieve(query, session_id, user_tokens, ...)` → `POST /retrieval/dialog/v2`

服务端：
- 运行 `retrieval(strategy="dialog_v2")`：
  - 多路召回（基于现有索引/图能力）
  - 候选融合与重排
  - 可选 TKG explain/有限扩散
  - 返回 evidence 包（可直接喂给上层 LLM）

---

## 6. 端口“现状 vs 施工后”对照表（摘要）

### 6.1 SDK 必依赖端口

现状（缺失）：
- ❌ `POST /ingest/dialog/v1`
- ❌ `GET /ingest/jobs/{job_id}`
- ❌ `GET /ingest/sessions/{session_id}`
- ❌ `POST /retrieval/dialog/v2`

施工后（新增）：
- ✅ `POST /ingest/dialog/v1`
- ✅ `GET /ingest/jobs/{job_id}`
- ✅ `GET /ingest/sessions/{session_id}`
- ✅ `POST /retrieval/dialog/v2`

### 6.2 底层端口（继续保留，不破坏用户空间）

现状（已有，继续保留）：
- ✅ `POST /search`
- ✅ `POST /write`
- ✅ `POST /update`
- ✅ `POST /delete`
- ✅ `POST /link`
- ✅ `POST /rollback`
- ✅ `POST /graph/v1/search`

施工后（仍然保留）：
- ✅ 全部保留，作为低层接入/诊断/兼容面
- ✅ 高阶端口内部也可复用这些能力（但对 SDK 透明）

---

## 7. 约束（写死，避免后续返工）

1) **版本化**：`/ingest/dialog/v1` 与 `/retrieval/dialog/v2` 均为版本化端点。  
2) **Never break userspace**：现有 `/search` `/write` 语义不改，只新增端点。  
3) **策略在服务端**：dialog_v2 的多路召回/融合/扩散/解释属于服务端实现；SDK 只传参，不复制策略。  
4) **可观测性**：job 状态必须可查询，包含阶段、错误、重试时间与粗粒度指标。  
