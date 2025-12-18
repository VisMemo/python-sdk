# 对话管线 API（V1）施工规范
（`memory.session_write` / `memory.retrieval`，方案 B：仅客户端库，不新增服务端口）

> 这是一份“施工文档”：以**可直接实现**为目标，尽可能把命名、入参出参、隔离规则、默认值、回退策略、错误语义与可观测性全部写死，避免实现阶段出现“大家各写各的”。
>
> 本文与 `docs/时空知识记忆系统构建理论/5. 文本层设计/文本记忆统一接入方案.md` 保持兼容：我们沿用其 **Session 归档（archive_session）思想**与 **抽取 Schema（fact/preference/task/rule + 溯源）**，但在 V1 采用“客户端编排（方案 B）”先落地。

---

## 0. 总体思想（给非技术同学看的）

我们要解决的不是“多写几个接口”，而是让**记忆**像水电一样可用：

- 用户只要把一段对话交给系统（就像“把聊天记录归档”），系统就能：
  1) 把对话中未来可能用得上的信息提炼出来（偏好/事实/任务/规则），  
  2) 写进长期记忆库，  
  3) 并且在后续检索时能更稳定地找回证据（原话 + 提炼事实 + 时序关联）。
- 我们不会去动已经稳定的底层 `/search` 和 `/write`，避免破坏现有调用方。
- 我们新增一层“对话管线 API”，只在**客户端库**里做轻量编排：
  - `memory.session_write`：对话 → 抽取 → 调用现有 `/write`
  - `memory.retrieval`：高级检索编排 → 调用现有 `/search`（1 次或多次）→ 融合排序 → 输出 debug
- 这层还必须支持**用户自带模型 Key**：用户可以提供自己的 LLM provider + API key；如果用户没提供，我们也要定义明确的回退行为（要么报错，要么降级但仍可用）。

一句话：**把“对话归档”和“对话检索”做成可用的产品能力，并且不破坏底座。**

---

## 1. 范围 / 非目标

### 1.1 范围（V1 必做）
- 新增客户端库 API：
  - `memory.session_write(...)`
  - `memory.retrieval(..., strategy="dialog_v1"|"video_v1")`
- `dialog_v1` 必须对齐 benchmark 的高分做法：
  - **分路召回（semantic/fact + episodic/event）**
  - **reference_trace（事实溯源回原话）**
  - **score 归一化 + source 权重融合**
  - rerank 默认关闭，但作为可选配置保留
- 隔离规则必须“可产品化”：
  - `tenant_id` + principals（用户/产品共享/公共）作为硬边界

### 1.2 非目标（V1 不做）
- 不改服务端 `/search` 与 `/write` 的语义与响应结构
- 不在服务端新增新端点（方案 B）
- 不实现企业最终形态的 ACL/权限系统（只定义可扩展的字段与原则）

---

## 2. 分层与依赖（方案 B）

### 2.1 分层
- **底层 Memory Service（既存）**
  - HTTP：`POST /write`、`POST /search`（以及现有 config 端点）
  - 责任：向量/图存储、基础 ANN+图扩展+内置重排、稳定返回 `SearchResult`
- **客户端管线（本方案新增）**
  - 责任：
    - 调用 LLM 做对话事实抽取（可使用用户自带 key）
    - 调用底层 `/write` 写入 event/fact
    - 调用底层 `/search`（1 次或多次）并在客户端融合排序
    - 输出统一 debug（便于 benchmark 与线上诊断）

### 2.2 关键约束
- 用户提供的 LLM key **只在客户端使用**，不传给 Memory Service。
- 所有跨租户/跨用户/跨产品的隔离，都必须通过**写入 metadata**与**检索 filters**显式表达，避免“看起来隔离，其实只是约定”。

---

## 3. 统一命名与策略（V1 固定）

### 3.1 API 名称（固定）
- `memory.session_write(...)`
- `memory.retrieval(...)`

### 3.2 strategy（固定枚举，后续只加不改）
- `dialog_v1`：对话检索/对话记忆（文本为主）
- `video_v1`：视频/生活流检索（多模态）

> 后续迭代用 `dialog_v2` / `video_v2` 追加，不改旧策略语义。

---

## 4. 身份与隔离（V1 规范）

### 4.1 四个核心概念
- `tenant_id`：租户边界（强隔离）；由调用方提供（未来由 API Key/JWT 映射产生）。
- `product_id`：产品边界（如陪伴机器人产品线/APP）。
- `user_id`：最终用户边界（一个人）。
- `visibility`：数据可见性（V1 用 principals 编码，不新增字段）。

### 4.2 principals 编码（V1 统一写入 metadata.user_id）
为了不改底层 schema，同时实现“用户私有 + 产品共享 + 公共”三层隔离，V1 约定：

- 用户私有 principal：`u:{user_id}`
- 产品共享 principal：`p:{product_id}`（可选；没有产品则不写）
- 公共 principal：`pub`（V1 默认不使用，仅保留扩展位）

写入时：
- `metadata.user_id` 必须是 `List[str]`，至少包含 `u:{user_id}`。
- 若 `product_id` 提供，必须同时写入 `p:{product_id}`。

检索时：
- `filters.user_id` 取同一套 principal 列表。
- `filters.user_match="any"`（默认）：命中用户私有或产品共享都算可见。

### 4.3 tenant 强隔离（必须同时满足）
**必须同时满足两件事**（因为当前服务端 `/search` 不会自动把 header tenant 注入 filter）：

1) HTTP Header 必须带：`X-Tenant-ID: <tenant_id>`
2) `/search` 的 `filters.tenant_id` 必须显式传入同一个 `<tenant_id>`

否则会出现“同一套 Qdrant collection 下跨 tenant 混检”的风险。

---

## 5. 数据写入规范（V1：dialog 领域）

> 下述字段与 `MemoryEntry`/`SearchFilters` 保持一致（见 `modules/memory/contracts/memory_models.py`）。

### 5.1 事件（episodic turn）写入规范
用于后续 `event_search` 与证据回溯。

- `kind`: `"episodic"`
- `modality`: `"text"`
- `contents`: `["<turn_text>"]`
- `metadata`（必须字段）：
  - `tenant_id`: 由服务端 `/write` 根据 `X-Tenant-ID` 自动注入；客户端可不写但必须保证 header 正确
  - `user_id`: principals 列表（见 4.2）
  - `memory_domain`: `"dialog"`
  - `run_id`: `session_id`（V1 统一用 run_id 表示会话归档 ID）
  - `source`: `"conversation"`（用于与 semantic fact 区分）
  - `turn_id`: int 或 str（来自 turns）
  - `role`: `"user"|"assistant"|...`
  - `timestamp`: 可选（ISO 或 epoch；一致性优先）

### 5.2 事实（semantic fact）写入规范
抽取输出必须兼容《文本记忆统一接入方案》的 Schema（V1 只落库 ADD）。

- `kind`: `"semantic"`
- `modality`: `"text"`
- `contents`: `["<statement>"]`
- `metadata`（必须字段）：
  - `tenant_id`: 同上
  - `user_id`: principals 列表
  - `memory_domain`: `"dialog"`
  - `source`: `"mem0"`（表示 mem0 风格抽取；与统一接入方案保持一致）
  - `fact_type`: `"fact"|"preference"|"task"|"rule"`（统一接入方案中的 `type`）
  - `status`: `"open"|"done"|"cancelled"|"n/a"`
  - `scope`: `"permanent"|"until_changed"|"temporary"`
  - `importance`: `"low"|"medium"|"high"`
  - `source_session_id`: `session_id`
  - `source_turn_ids`: `List[int|str]`
  - `rationale`: 可选（一句话说明）

> 备注：V1 暂不实现 UPDATE/DELETE 的图层“状态机更新”，但 metadata 字段必须先对齐，以便 V2 直接升级而不改数据模型。

---

## 6. `memory.session_write(...)` 施工规范

### 6.1 函数职责（MUST）
- 输入：一段会话 turns（完整或增量），外加隔离信息（tenant/user/product）。
- 行为：
  1) （可选）调用 LLM 抽取 facts（结构化 JSON，兼容统一接入方案）。
  2) 组装 `MemoryEntry` 列表（events + facts）。
  3) 调用现有 `POST /write` 写入。
- 输出：写入版本号 + 写入统计 +（可选）抽取结果摘要 + debug。

### 6.2 入参契约（建议形态）
（具体语言实现可以是 dataclass/pydantic，但字段含义必须一致）

- `tenant_id: str`（必填）
- `user_id: str`（必填，原始用户 ID，不带前缀）
- `product_id: str | None`（可选）
- `session_id: str`（必填；用于 run_id/幂等/溯源）
- `turns: list[Turn]`（必填）
- `memory_api: { base_url, auth_headers?, timeout_s? }`（必填：如何访问 Memory Service）
- `extract: bool = True`
- `write_events: bool = True`
- `write_facts: bool = True`（若 `extract=False` 则必须视为 false）
- `graph_upsert: bool = True`（默认：同步写入 TKG 主图；可显式关闭，见 6.2.3）
- `graph_policy: "require" | "best_effort" = "best_effort"`（图写入失败语义，见 6.2.3）
- `overwrite_existing: bool = False`（幂等策略开关，见 6.2.1）

#### LLM 配置（必须支持“用户自带 key”）
- `llm: { provider, model, api_key, base_url?, timeout_s? } | None`
- `llm_policy: "require" | "best_effort" = "require"`

**llm_policy 的两种行为（这是必须写死的产品语义）：**
- `require`：没有可用的 LLM 配置就直接报错（不写入任何内容），错误码/异常信息必须明确是“缺少 LLM 配置”
- `best_effort`：没有可用的 LLM 配置时：
  - 自动降级为“只写 events，不写 facts”（仍然调用 `/write`），并在返回 debug 中明确标记 `facts_skipped_reason="llm_missing"`

**“可用的 LLM 配置”判定：**
1) 若调用方传入 `llm.provider + llm.api_key`：使用用户提供 key（BYOK）
2) 否则：允许从环境变量/默认配置加载平台 key（platform-managed）
3) 若两者都没有：按 `llm_policy` 执行 require/best_effort

#### 6.2.1 `session_id` 幂等与 `overwrite_existing`（必须写死）

对齐 `文本记忆统一接入方案.md` 的设计：`session_id` 必须作为全系统唯一去重键（绑定到 `run_id`）。

- 默认：`overwrite_existing=false`
  - 若检测到该 `session_id` 已经“归档完成”（completed），则**跳过**本次调用，返回 `status="skipped_existing"`（不抽取、不写入）。
- 当 `overwrite_existing=true`
  - 视为“覆盖更新”：
    - 重新执行抽取；
    - 对同一 `session_id` 的既有 facts 执行更新（V1 实现策略：依赖 `session_marker.metadata.fact_ids` 精确定位旧 facts；写入成功后仅删除“新抽取结果不再包含”的旧 fact ids，避免误删与避免重复）。

**关键点：如何判定“已归档完成”？**

不能仅依据 “`run_id=session_id` 下是否存在任何条目” 来判断（因为失败重试时可能只写入了部分 events）。

必须写入一个 `session_marker`（推荐实现细节）：
- `kind="semantic"`, `modality="text"`（实现约束：当前 QdrantStore 会跳过 `structured` 模态写入，因此 marker 必须可被向量存储检索到）
- `contents`: `["session_marker {session_id}"]`（便于用 `/search` 精确命中）
- `metadata`（最小集合）：
  - `{ "memory_domain":"dialog", "run_id": session_id, "node_type":"session_marker", "source":"dialog_session_marker", "status":"completed|in_progress|failed", "fact_ids":[...], ... }`
- 只有当 “events+facts（以及必要 links）” 写入成功后，才将 marker 标记为 `completed`。

**补充（实现已落地的关键约束）**：
- raw turn / pipeline-managed entries 必须设置 `metadata.dedup_skip=true`，禁止 neighbor-based merge（否则重试/重复提交可能合并掉对话证据）；服务端写入前会移除该内部字段，避免污染持久化 metadata。

#### 6.2.2 抽取成功但写入失败的回滚语义（必须明确）

场景：LLM 抽取成功，但写入失败（例如 Neo4j 超时导致 `/write` 返回 5xx）。

- 默认策略：**不回滚已写入的 events**，采用“幂等 upsert + 安全重试”。
  - 原因：现有系统的回滚能力主要覆盖 UPDATE/DELETE 的快照回滚，不保证 batch ADD 的跨存储原子回滚；硬回滚更容易误删正确数据。
  - 行为：
    - 本次返回 `status="failed"`，并提供 `error_reason`；
    - `session_marker` 不得标记为 `completed`；
    - 调用方可用同一 `session_id` 重试，系统应收敛到一致状态（不产生重复 facts）。
- 可选（默认关闭）：若启用 `cleanup_on_failure`，可 best-effort 删除本次已写入的 session 条目，但必须严格带 tenant+principals+run_id 过滤并要求强确认，避免误删历史数据。

#### 6.2.3 GraphUpsert（对话同步进入 TKG 主图，可选但推荐）

背景：当前系统存在两类“图形态”——`MemoryEntry + Edge` 的检索索引图（服务 `/search` 的 expand_graph），以及 `GraphUpsertRequest` 的 TKG 主图（服务 explain/timeslice/event 链路与 L4/L5 harness）。对话接入要走向 v1.0，必须让对话也进入 TKG 主图。

- `graph_upsert=true`（默认）
  - 先写入 `/write`（MemoryEntry+Edge），再额外构造 `GraphUpsertRequest` 并调用 `POST /graph/v0/upsert` 写入 TKG 主图（注意：路径仍是 v0，这是兼容面；能力按 v1.0 语义演进）。
- `graph_upsert=false`（显式关闭）
  - 仅写入 `/write`（MemoryEntry+Edge），不写 TKG 主图。
- `graph_policy` 语义（必须可预测）：
  - `best_effort`：
    - 图写入失败不影响本次 `session_write` 的主结果（events/facts 仍视为成功写入）；
    - 返回 debug/trace 中必须标记 `graph_upsert_status="failed"` 与错误摘要；
    - 允许后续用同一 `session_id` 重试补齐图写入（幂等 upsert）。
  - `require`：
    - 图写入失败视为本次会话归档失败：返回 `status="failed"`，并确保 `session_marker.status != "completed"`，以便调用方用同一 `session_id` 重试补齐。

### 6.3 抽取输出（必须兼容统一接入方案）
抽取器输出 JSON 必须满足以下最小结构（V1 子集）：

```json
{
  "facts": [
    {
      "op": "ADD",
      "type": "fact | preference | task | rule",
      "title": "可选",
      "statement": "用于落库的自然语言事实",
      "status": "open | done | cancelled | n/a",
      "scope": "permanent | until_changed | temporary",
      "importance": "low | medium | high",
      "source_session_id": "session_xxx",
      "source_turn_ids": [1, 2],
      "rationale": "可选"
    }
  ]
}
```

映射到 `MemoryEntry` 时：
- `statement` → `contents[0]`
- `type` → `metadata.fact_type`
- 其余字段原样映射到 metadata

### 6.4 `/write` 调用规范（必须）
- URL：`{memory_api.base_url}/write`
- Headers（至少）：
  - `Content-Type: application/json`
  - `X-Tenant-ID: <tenant_id>`
  - 认证：按部署选择 `X-API-Token` 或 JWT（若启用）
  - 签名：若服务端要求签名（生产建议），客户端必须支持注入签名头（本文不定义签名算法，按现有 server 规范）
- Body：
  - `{"entries":[MemoryEntry...], "links":[], "upsert": true}`

### 6.5 返回与 debug（建议必须包含）
- `version`：来自 `/write` 响应
- `counts`：
  - `events_written`
  - `facts_written`
  - `facts_skipped_reason`（若跳过）
- `debug`：
  - `llm_used: {provider, model, byok: bool}`（严禁回传 api_key）
  - `latency_ms: {extract_ms, write_ms, total_ms}`

---

## 7. `memory.retrieval(...)` 施工规范

### 7.1 函数职责（MUST）
- 输入：query + strategy + 隔离信息（tenant/user/product）+ 可选 rerank 配置
- 行为：调用 `/search`（1 次或多次）并在客户端完成融合排序，输出统一 hits 与 debug
- 输出必须包含 debug（至少包含每路召回的 trace/耗时/数量），否则排障会变成玄学

### 7.2 入参契约（建议形态）
- `query: str`
- `strategy: "dialog_v1" | "video_v1"`
- `tenant_id: str`
- `user_id: str`
- `product_id: str | None`
- `topk: int = 30`
- `memory_api: { base_url, auth_headers?, timeout_s? }`
- `rerank: { enabled: bool = False, model?, top_n?, ... }`（预留；默认关闭）

#### rerank LLM 配置（预留 BYOK）
- `llm: { provider, model, api_key, ... } | None`
- `llm_policy: "require" | "best_effort" = "best_effort"`
- 若 `rerank.enabled=true` 且 LLM 不可用：
  - `require`：报错（不返回结果）
  - `best_effort`：自动把 rerank 当作关闭（并在 debug 标记）

### 7.3 strategy = `dialog_v1`（必须对齐 benchmark）

#### 7.3.1 三路召回定义（V1 固定）
- A) `fact_search`：semantic/text（提炼事实）
- B) `event_search`：episodic/text（原始对话/原话）
- C) `reference_trace`：从 fact 的 `source_turn_ids` 生成“引用证据”（不额外调接口）

#### 7.3.2 `/search` 调用（V1 固定过滤）
所有 `/search` 调用必须带：
- Header：`X-Tenant-ID: tenant_id`
- filters：必须包含 `tenant_id`、principals、`memory_domain`

**A) fact_search**
- `filters`：
  - `tenant_id: tenant_id`
  - `user_id: ["u:{user_id}", "p:{product_id}"?]`
  - `user_match: "all"`（推荐；强隔离，避免串租户/串主体）
  - `memory_domain: "dialog"`
  - `memory_type: ["semantic"]`
  - `modality: ["text"]`
  - `source: ["locomo_text_pipeline"]`（对齐 benchmark 管线写入的 source）
- `expand_graph: false`（默认）

**B) event_search**
- `filters`：
  - `tenant_id: tenant_id`
  - `user_id: principals`
  - `user_match: "all"`（推荐；与 fact_search 一致）
  - `memory_domain: "dialog"`
  - `memory_type: ["episodic"]`
  - `modality: ["text"]`
  - `source`: 可选（V1 默认不加，避免漏召回其他对话源；LoCoMo 写入默认为 `locomo_text_pipeline`）
- `expand_graph: true`（默认；利用当前默认 3-hop 图扩展触及时序证据）

> 说明：`expand_graph=true` 在服务端当前实现里主要用于“邻域加分/提示”，不会自动把邻居节点加入 hits；因此我们仍需要 fact_search + reference_trace 来稳定拿到证据链。

#### 7.3.3 融合排序（必须做，否则分数不稳定）
**目标：对齐 benchmark：固定权重融合 + 去重（不做跨路归一化）。**

1) 固定 source 权重（V1 写死，后续只允许通过新增 strategy 调整）：
   - `fact_search = 2.0`
   - `reference_trace = 1.8`
   - `event_search = 1.0`
2) `final_score = score * source_weight`
3) 去重策略（V1）：
   - 以 `hit.id` 为主键（若不存在则退回 `entry.metadata.event_id/turn_id`）
   - 同一主键保留 `final_score` 更高者
4) 截断：返回 topk

#### 7.3.4 debug（必须输出）
`memory.retrieval` 返回必须包含：
- `debug.plan`（对齐 benchmark 口径）：
  - `latency_ms` / `retrieval_latency_ms` /（可选）`qa_latency_ms` / `total_latency_ms`
- `debug.executed_calls`：每路调用记录（对齐 benchmark 字段，额外补齐 `latency_ms` 便于排障）：
  - `api`: `"fact_search"|"event_search"|"trace_references"`
  - `count`
  - `latency_ms`
  - `error`（若失败）
- `debug.evidence_count`

#### 7.3.5 QA 生成（可选，但建议对齐 benchmark）

当调用方需要“直接拿到答案”而不是只拿证据时，允许在客户端库侧增加一步 QA 汇总：

- 入参（新增）：
  - `with_answer: bool = false`（true 时返回 `answer`）
  - `task: str = "GENERAL"`（透传给 QA user_prompt）
  - `llm_policy: "require" | "best_effort" = "best_effort"`
- 行为（对齐 `benchmark/adapters/moyan_memory_qa_adapter.py::_generate_answer`）：
  - system_prompt：使用 `QA_SYSTEM_PROMPT_GENERAL`（必须由单测锁死与 benchmark 一致）
  - user_prompt：按 “Question/Task type/Evidence 列表” 拼装（Top-15，类型映射 Fact/Reference/Event）
  - 输出：`answer: str`

### 7.4 strategy = `video_v1`（V1 先做最小实现）
- 只调用一次 `/search`：
  - `filters.tenant_id = tenant_id`
  - `filters.user_id = principals`
  - `filters.user_match = "any"`
  - `filters.memory_domain = "lifelog"`（与 TKG 分层设计一致）
  - `filters.modality`：若调用方未指定，则使用服务端默认（当前默认为 text+clip_image）
  - `expand_graph = true`
- 不做多路融合（V2 再上）
- 返回结构与 debug 仍然沿用 `memory.retrieval` 统一格式，`debug.strategy="video_v1"`

---

## 8. BYOK（用户自带模型 Key）与“不提供时的两种行为”

### 8.1 需要支持 BYOK 的原因（MUST）
- C 端用户可能希望：
  - 记忆服务 token 由我们提供（或用户自建）
  - LLM key 由用户自己提供（OpenAI/Claude/GLM/Qwen…）
- 如果我们把 LLM key 固化在服务端，就无法支持“用户用自己的大模型 key”。

### 8.2 统一原则（MUST）
- `provider/model/api_key` 只能在客户端用于调用 LLM。
- Memory Service **不接收、也不存储**用户 LLM key。
- 返回值与日志里 **严禁包含 api_key**（只允许显示 provider/model/byok=true|false）。

### 8.3 两种“未提供 key”的行为（必须一致）
对 `session_write`（抽取）与 `retrieval`（可选 QA/可选 rerank）统一采用：

- `llm_policy="require"`：没 key 就报错（硬失败）
- `llm_policy="best_effort"`：没 key 则降级（软失败）
  - session_write：只写 events，跳过 facts
  - retrieval：
    - `with_answer=false`：不需要 LLM（只做融合排序）
    - `with_answer=true`：返回可预测的降级答案（无证据→`insufficient information`；有证据→`Unable to answer in dummy mode.`）
    - （未来）rerank.enabled=true 且无 key：自动关闭 rerank（并在 debug 标记）

---

## 9. 与《文本记忆统一接入方案》的兼容性声明

本方案是统一接入方案的 **V1 落地形态**：
- `memory.session_write` ≈ `archive_session`（只是抽取执行位置从服务端变为客户端）
- `dialog_v1` 的 facts schema 与统一接入方案保持一致（V1 子集）
- `source/memory_domain` 的约定与统一接入方案一致：
  - facts/events: `source="locomo_text_pipeline"`, `memory_domain="dialog"`（对齐 benchmark 管线）

未来如果把抽取迁回服务端（真正的 `/dialog/v1/archive_session`），只需要把 `session_write` 的“抽取+写入”放到服务端实现，客户端签名与 payload 不变，数据模型不需要迁移。

---

## 10. 施工清单（实现与验收）

### 10.1 必实现项（V1）
- [ ] 客户端库新增 `memory.session_write`
- [ ] 客户端库新增 `memory.retrieval(strategy=dialog_v1|video_v1)`
- [ ] `dialog_v1` 的融合排序：固定 source 权重 + 去重（对齐 benchmark）
- [ ] `dialog_v1` 的可选 QA：`with_answer=true` 时输出 `answer`（prompt/格式对齐 benchmark）
- [ ] principals（u:/p:/pub）编码落库与检索一致
- [ ] tenant 强隔离：`X-Tenant-ID` + `filters.tenant_id` 双保险
- [ ] BYOK：provider/model/api_key 透传到抽取/（可选）QA/（可选）rerank
- [ ] llm_policy 两种行为在两函数里一致

### 10.2 建议测试用例（至少这些）
- [ ] `session_write` 在 `llm_policy=require` 且无 key 时硬失败
- [ ] `session_write` 在 `llm_policy=best_effort` 且无 key 时仅写 events
- [ ] `retrieval` 在 rerank.enabled 且无 key 时按 llm_policy 决定 error/disable
- [ ] `retrieval` 在 with_answer=true 且无 key 时按 llm_policy 决定 error/降级答案
- [ ] QA prompt 与 user_prompt 拼装格式锁死对齐 benchmark
- [ ] principals 隔离：不同 `u:` 不互相召回；同 `p:` 可共享召回
- [ ] tenant 隔离：不同 tenant_id 不互相召回（必须验证 filters.tenant_id 生效）
- [ ] `dialog_v1` 的权重融合稳定性（固定输入 → 固定排序）
