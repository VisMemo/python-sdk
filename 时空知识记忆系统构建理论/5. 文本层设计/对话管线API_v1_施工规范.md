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
- `dialog_v2`：对话检索/对话记忆（**Event-first + 多路并行召回 + 有界单向证据扩散**；见 7.4）
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
- `strategy: "dialog_v1" | "dialog_v2" | "video_v1"`
- `tenant_id: str`
- `user_id: str`
- `product_id: str | None`
- `topk: int = 30`
- `memory_api: { base_url, auth_headers?, timeout_s? }`
- `rerank: { enabled: bool = False, model?, top_n?, ... }`（预留；默认关闭）

#### dialog_v2 可选参数（新增，但必须有稳定默认）
> 目标：避免“路由/分类器”成为依赖；所有子路都并行跑，结果统一进入 Event 候选池（K=50），再做去重与补位。

- `candidate_k: int = 50`
  - dialog_v2 的统一候选池大小（固定默认 50；不与 `topk` 绑定）
- `seed_topn: int = 15`
  - 证据扩散（explain）最多对多少个 Event seed 执行（上限必须硬控）
- `e_vec_oversample: int = 3`
  - E_vec（向量 utterance index）超采样倍数：请求 `candidate_k * e_vec_oversample`，用于对冲“多 utterance 命中同一 event”导致的去重坍缩
- `graph_cap: int = 15`
  - E_graph 进入候选池的上限（防止倒排召回吞掉全部名额）
- `rrf_k: int = 60`
  - RRF 融合的平滑常数（越大越“去极值”）
- `qa_evidence_cap_l2: int = 12`
- `qa_evidence_cap_l4: int = 12`
- `enable_entity_route: bool = True`
- `enable_time_route: bool = True`
- `entity_hints: list[str] | None = None`
  - 可选：上层若已知可用实体标签（例如 `["Caroline","Melanie","face1"]`），可直接提供以避免从 query 里猜（不要求一定有）
- `time_hints: {start_iso?: str, end_iso?: str, timezone?: str} | None = None`
  - 可选：上层若已经解析出绝对时间区间，直接提供；否则 dialog_v2 将 best-effort 解析（并允许降级）

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

---

## 7.4 strategy = `dialog_v2`（API 升级：多路并行 + Event 候选池 + 单向证据扩散）

> 你必须先理解一件事：**Graph-first ≠ 向量语义检索。**
>
> - `POST /graph/v1/search` 的第一轮召回是 **Neo4j fulltext（倒排）**：它擅长“名字/face1/关键词短语”等字面锚点，但不保证同义改写的语义近似。
> - `E_vec`（Qdrant utterance index）才是 embedding 语义近似召回：它擅长 paraphrase，但会带来向量噪声。
>
> dialog_v2 的策略是：**两者并行 + 动态补位**，避免“精准但太少”浪费候选池，也避免“只向量漏斗”错过图结构能力。

### 7.4.1 总体目标与硬约束（MUST）
- 统一候选单位：**Event**（候选池只收 `event_id`）
- 多路并行召回，不依赖路由：
  - Route_E：Event 召回（Graph-first + 向量补召回）
  - Route_K：Knowledge/Fact 召回（向量语义；用于时间与综合性事实锚点）
  - Route_EN：Entity 视角召回（若能从 query/hints 拿到实体标签）
  - Route_T：TimeSlice 视角召回（若能拿到可靠绝对时间锚；否则必须降级）
- 候选池大小固定：`candidate_k=50`
- 任何扩散必须有界：`seed_topn` 与 `neighbor_cap_per_seed` 必须硬控
- 永不浪费候选池容量：E_graph 命中少时，E_vec 必须自动补位填满（经过去重后尽量填满 50）

### 7.4.2 三路并行命令定义（Executed Calls）

#### A) Route_E：Event 召回（两子路并行；都进入候选池）
1) `E_graph`：Graph-first（精准、少）
   - API：`POST /graph/v1/search`
   - 入参：`query`, `topk=candidate_k`, 可选 `source_id`
   - 输出：`[{event_id, score, ...}]`
2) `E_vec`：Utterance 向量召回（语义、足量）
   - API：`POST /search`
   - filters（固定约束，必须写死）：
     - `tenant_id`
     - `user_id=principals`, `user_match="all"`（强隔离）
     - `memory_domain="dialog"`
     - `memory_type=["semantic"]`（索引条目是 semantic）
     - `modality=["text"]`
     - `source=["tkg_dialog_utterance_index_v1"]`
   - 参数：
     - `topk = candidate_k * e_vec_oversample`（默认 150）
     - `expand_graph=false`（这一步只负责候选生成，不扩散）
   - 输出：utterance hits（每条必须携带 `metadata.tkg_event_id`）
   - 映射：`event_id = metadata.tkg_event_id`（无此字段则丢弃该 hit）

> 关键：E_graph 与 E_vec 都可能命中同一 event，合并阶段必须以 `event_id` 去重，并保留两路的分数贡献。

#### B) Route_K：Knowledge/Fact 召回（语义锚点；用于时序与综合性问题）

目标：把“被抽取过的事实陈述”作为候选入口，反向映射回 Event。

- API：`POST /search`
- filters（固定约束，必须写死）：
  - `tenant_id`
  - `user_id=principals`, `user_match="all"`
  - `memory_domain="dialog"`
  - `memory_type=["semantic"]`
  - `modality=["text"]`
  - `source=["locomo_text_pipeline"]`
- 输出：fact hits（每条包含 `source_turn_ids` 与 `source_sample_id`）
- 映射：`event_id = <sample_id>_<turn_id>`（与 benchmark 的 `_extract_fact_hits_v2` 对齐）

> 解释：L2/L4/L5 类型问题很容易缺失显式时间锚，Knowledge/Fact 是唯一可控的“时间/关系表述层”。

#### C) Route_EN：Entity 视角召回（best-effort；允许为空）
目标：当用户问题显式提到“Caroline/face1/某个 speaker label”时，用实体视角拉出其相关事件集合。

输入来源（顺序优先）：
1) `entity_hints`（若调用方提供）
2) 从 query 中 best-effort 抽取实体标签：
   - 规则：优先匹配 `face\\d+`、英文专名 token（首字母大写连续词）、以及调用方可选提供的已知 speaker 列表（若上层有）
   - **禁止**把“他/她/那个人”等指代当作实体标签（指代消解不在检索层解决）

实体 ID 获取（两种模式；实现优先级顺序）：
1) **索引解析（推荐，用于“名字不完全一致/存在别名/face1 等标签不确定”的场景）**
   - 需要图侧提供“实体解析”能力（建议新增端点；若未提供则跳过该步骤）：
     - `GET /graph/v0/entities/resolve?name=<query>&limit=...&type=PERSON`
     - 返回：`[{entity_id, name, score}]`
   - 说明：这是文本索引（fulltext/等价），不是向量检索；用于把 query 里的实体字符串映射到图里的 `Entity.id`。
2) **确定性生成（fallback，用于 speaker label 已知且与写入规则一致的场景）**
   - 使用写入时同一规则生成 speaker entity_id（与 `dialog_tkg_graph_v1` 对齐）：
     - `entity_id = uuid5_like("tkg.dialog.entity", key="tenant|domain|user_tokens|speaker_label")`
   - `speaker_label` 约定等于 `Entity.name`（允许是 `face1` 这种未命名标签）。

事件拉取（需要图查询能力；若不可用则该路返回空并在 debug 标记）：
- 推荐 API：`GET /graph/v0/entities/{entity_id}/timeline?limit=...`
- 兼容 API（若 timeline 不可用）：`GET /graph/v0/events?entity_id=...&limit=...`
- 输出：一组与该实体相关的 event_id（或可映射到 event_id 的证据/segment）

#### D) Route_T：TimeSlice 视角召回（强依赖绝对时间；必须自适应降级）

**现实约束（必须写死）**：
- 在对话写入中，`TimeSlice.t_abs_start/end` 只有在 turns 提供 `timestamp_iso` 或调用方提供 `reference_time_iso` 时才有值；否则为 None。
- 因此：当数据缺失绝对时间时，任何“昨天/上周/日期”的匹配都不可靠，Route_T 必须降级为“不参与候选生成”。

Route_T 启用条件：
1) 能从 `time_hints` 或 query 解析得到绝对时间区间 `(start_iso,end_iso)`，且
2) 图侧 TimeSlice 存在可用 `t_abs_start/end`

建议的图查询能力（若服务端未提供则 Route_T 返回空，并在 debug 标记 `time_route_unavailable`）：
- `GET /graph/v0/timeslices/range?kind=dialog_session&start_iso=...&end_iso=...&limit=...`
  - 返回匹配的 timeslice_ids + event_ids（沿 `COVERS_EVENT`）

降级策略（必须）：
- 若 Route_T 不可用：该路返回空，不得尝试“list_timeslices 全量扫库”。
- L2 的时序需求由后续的 **受限 Event→Event 补候选** 承担（见 7.4.5）。

### 7.4.3 候选池合并与“动态补位”（核心算法，必须写死）

定义：
- `K = candidate_k`（默认 50）
- 统一候选 key：`event_id`

步骤：
1) 并行执行多路（Route_E/K/EN/T），得到若干 `event_candidates`（全部归一到 event_id）。
2) 合并去重（按 event_id）：
   - 对每个 event_id，记录 `score_E_graph / score_E_vec / score_K_vec / score_EN / score_T`（缺失则为 0），以及 `sources[]` 与 `reasons[]`。
3) **图路上限（Graph Cap）**：
   - 只保留 `E_graph` 的 Top-G（默认 `G=15`，且 `G<=K`），避免倒排召回吞掉整个池子。
4) **RRF 融合打分（必须）**：
   - 对每一路按分数排序得到 rank；
   - `score = Σ_w (1 / (rrf_k + rank)) + recency_weight * recency`；
   - 默认 `rrf_k=60`，路由权重 `graph/vec/knowledge/entity/time` 独立配置。
5) **自动补位**：用 RRF 分数从其余候选填满剩余名额。
   - 绝不浪费槽位：只要 `E_vec`/`K_vec` 有足够 unique event，就必须把池子尽量填满到 K。

> 注意：补位不等于“只用 E_vec”。EN/T 仍可进入池子，但默认权重更低；它们更重要的价值是提供“锚点理由/证据结构”，而不是抢占大量名额。

### 7.4.4 单向证据扩散（explain 驱动，一跳为主）

目标：对候选 Event 生成可解释证据包（utterance/knowledge/entity/timeslice/...），并生成 graph_signal 参与重排。

- seeds：候选池按 `candidate_score` 取 top `seed_topn`（默认 15）
- 对每个 seed：
  - 调用 `graph_explain_event_evidence(tenant_id,event_id)`
  - 只抽取一跳邻居（`UtteranceEvidence/Knowledge/Entity/TimeSlice/Place`），并对邻居数量做 cap（`neighbor_cap_per_seed`）

**QA 证据压缩（仅在 with_answer=true 时）**：
- L2/L4 任务默认只取前 12 条证据喂给 QA（降低噪声与“相似句”误导）。

### 7.4.5 可选增强：受限 Event→Event 补候选（仅用于时序题的“邻近事件”）
当（且仅当）需要时序补全时，允许对 seeds 做“非常有限”的 Event→Event 扩展：
- 关系白名单：`NEXT_EVENT`（可选 `CAUSES`）
- 每个 seed 最多补 `prev=1`、`next=1` 两个 event（硬上限 2）
- 补出来的 event 进入候选池但标记 `source="E_graph_hop"`，并计入 K 的填充逻辑（仍去重）

### 7.4.6 融合打分（建议默认；必须可解释）
**RRF 融合 + recency + graph_signal：**
`candidate_score = Σ_w (1 / (rrf_k + rank)) + w_recency*recency + w_signal*graph_signal`
- 默认建议：
  - `w_graph >= w_vec`（E_graph 少但准，作为强锚点）
  - `w_knowledge` 用于强化“已抽取事实”的时间/关系表述
  - `w_en/w_t` 较小（作为锚点加分，不主导）
- 输出 debug 必须包含每路贡献，便于调参。

### 7.4.7 debug（必须输出；否则无法排障）
`debug.executed_calls` 必须至少包含：
- `event_search_graph`（/graph/v1/search）：count/latency_ms/error
- `event_search_utterance_vec`（/search source=tkg_dialog_utterance_index_v1）：hits/unique_event_ids/latency_ms/error
- `fact_search`（/search source=locomo_text_pipeline）：count/latency_ms/error
- `entity_route`：entity_labels_used、events_found、latency_ms、skipped_reason（若为空）
- `time_route`：time_window、timeslices_found、events_found、latency_ms、skipped_reason（若为空）
- `tkg_explain_event_evidence`：seeds、enriched、latency_ms

另外，`debug.plan` 必须包含：`candidate_k/seed_topn/graph_cap/rrf_k`。

---

### 7.5 strategy = `video_v1`（V1 先做最小实现）
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
- [ ] `dialog_v2`：多路并行召回（E/K/EN/T）+ Event 候选池（K=50）+ Graph Cap + RRF 融合 + 动态补位 + 去重 + explain 有界扩散（不破坏 dialog_v1）
- [ ] 图侧前置能力：Entity.name 可检索（fulltext/等价索引）+ TimeSlice 绝对时间可用时支持范围查询（缺失时允许降级）

### 10.2 建议测试用例（至少这些）
- [ ] `session_write` 在 `llm_policy=require` 且无 key 时硬失败
- [ ] `session_write` 在 `llm_policy=best_effort` 且无 key 时仅写 events
- [ ] `retrieval` 在 rerank.enabled 且无 key 时按 llm_policy 决定 error/disable
- [ ] `retrieval` 在 with_answer=true 且无 key 时按 llm_policy 决定 error/降级答案
- [ ] QA prompt 与 user_prompt 拼装格式锁死对齐 benchmark
- [ ] principals 隔离：不同 `u:` 不互相召回；同 `p:` 可共享召回
- [ ] tenant 隔离：不同 tenant_id 不互相召回（必须验证 filters.tenant_id 生效）
- [ ] `dialog_v1` 的权重融合稳定性（固定输入 → 固定排序）
