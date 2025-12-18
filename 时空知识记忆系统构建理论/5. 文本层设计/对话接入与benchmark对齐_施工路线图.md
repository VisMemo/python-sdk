# 文本对话接入 & Benchmark 对齐施工路线图

> 目标：把“真实用户对话 → 事实抽取 → MemoryEntry + Graph → `/write` / `/search`”这条链路，完全与 LoCoMo Benchmark 已跑通的管线对齐，并在不破坏现有 API 的前提下，为上层提供稳定的 `memory.session_write(...)` / `memory.retrieval(strategy="dialog_v1")` 能力。

本路线图按 Phase0–4 分阶段推进，每个阶段都必须给出清晰的：

- 目的（Why）
- 范围与具体改动（What）
- 验收标准（Done Definition）
- 测试要点（How to test）

最后一节给出“当前系统 vs 完成全部 Phase 后”的能力差异与新增功能对比，作为整体验收锚点。

---

## 实施进度（2025-12-17）

- 已完成：Phase 0 / 1 / 2 / 3（含 QA 生成 + rerank；并补齐 HTTP 客户端适配层）
- 已完成（第一批）：Phase 4（对话写入默认同步 upsert 到 TKG 主图 + utterance index；并补齐 explain 证据链）
- 已完成（第一版）：Phase 5 Step 3（服务端 `/search` 支持 `graph_backend="tkg"` 的图扩展/解释开关；默认仍为 `memory`，避免破坏旧用户空间）
- 进行中：Phase 5 Step 4（把 `/search` 的默认图扩展逐步迁移到 `tkg`，并补齐更通用的 TKG 邻域扩展/路径推理能力）
- 关键落地代码：
  - Phase 0：`modules/memory/application/service.py`（dedup 隔离 + `dedup_skip`）
  - Phase 1：`modules/memory/domain/dialog_text_pipeline_v1.py`（与 benchmark Step3 字段/UUID/边类型对齐）
  - Phase 2：`modules/memory/session_write.py`（`session_write` + session_marker/overwrite 语义）
  - Phase 3：`modules/memory/retrieval.py`（`retrieval(strategy="dialog_v1")` 3-way 融合 + 可选 QA 生成）
  - HTTP 适配层：`modules/memory/adapters/http_memory_port.py`（客户端调用 `/search`/`/write`/`/delete`）
  - QA：`modules/memory/application/qa_dialog_v1.py`（prompt + user_prompt 口径对齐 benchmark）
  - Rerank：`modules/memory/application/rerank_dialog_v1.py`（prompt/算法对齐 benchmark；可选）
- 关键单测入口（可回归）：
  - `modules/memory/tests/unit/test_write_dedup_isolation.py`
  - `modules/memory/tests/unit/test_dialog_text_pipeline_alignment.py`
  - `modules/memory/tests/unit/test_dialog_fact_extractor_prompt_alignment.py`
  - `modules/memory/tests/unit/test_dialog_qa_prompt_alignment.py`
  - `modules/memory/tests/unit/test_session_write_api.py`
  - `modules/memory/tests/unit/test_retrieval_dialog_v1.py`
  - `modules/memory/tests/unit/test_http_memory_port_adapter.py`
  - `modules/memory/tests/unit/test_dialog_tkg_graph_v1.py`
  - `modules/memory/tests/unit/test_session_write_graph_upsert.py`

---

## Phase 0：修复跨主体合并风险（写入去重/合并的隔离收紧）

### 0.1 目的

- 避免在多租户/多用户场景下，`MemoryService.write(...)` 的去重/合并逻辑跨 tenant/user/domain 误合并记忆，从根上保证“Never break userspace”。
- 在此基础上再叠加文本接入与 benchmark 对齐，避免在脏数据之上做精细检索。

### 0.2 范围与改动

- 修正 `modules/memory/application/service.py:MemoryService.write` 内部“找邻居进行 ADD/UPDATE/DELETE/NONE 决策”的搜索过滤：
  - 当前行为：只用 `{"modality": [e.modality]}` 调 `vectors.search_vectors(...)`，缺少 tenant/user/domain/run 过滤。
  - 目标行为：邻居搜索必须至少绑定：
    - `metadata.tenant_id`（若存在）
    - `metadata.user_id`（同一 principal 集合）
    - `metadata.memory_domain`
    - 可选：`metadata.run_id`（同一会话优先）  
  - 严格禁止跨 tenant/user/memory_domain 的合并与删除。
- 保持现有 `update_decider` 接口与 mem0-style 决策兼容，只收紧“候选 existing_list”的范围。

### 0.3 验收标准

- 代码层面：
  - `MemoryService.write` 中用于 dedup 的 `search_vectors` 调用，在构造 filters 时显式包含上述隔离键（有则用，无则不加）。
  - 若 entry.metadata 中缺失 tenant/user/domain，则行为与现状保持，但**不会主动跨 tenant/user/domain 合并**（即只在现有数据上下文中处理）。
- 测试层面：
  - 新增/扩展单测，覆盖以下情形：
    - 不同 `tenant_id` 的内容，即便文本完全相同，也不会互相 UPDATE/DELETE（只各自 ADD）。
    - 同 tenant 不同 `user_id` 下的文本不会互相 merge；
    - 同 tenant 同 `user_id` 但不同 `memory_domain` 的文本不会互相 merge。
  - 所有现有 `test_mem0_decider*` / `test_memory_service_write*` 仍然通过。

### 0.4 测试要点

- 单元测试（必做）：
  - 构造 InMemVectorStore + InMemGraphStore + AuditStore；
  - 预先写入 A 用户的若干条语义记忆，再用 B 用户的相同内容调用 `write(...)`，断言不会触发 UPDATE/DELETE；
  - 验证 Audit 中新增写入的 event 类型仍为 `ADD`。
- 集成测试（建议）：
  - 通过 HTTP `/write` 写入多个 tenant/user/domain 的内容，然后再通过 SDK 或直接调用服务的 `write(...)` 触发 dedup，确认不同主体之间无交叉影响。

---

## Phase 1：抽象 LoCoMo 管线的“对话→MemoryEntry/Edge”规范

> 目标：不在 Memory 里再发明一套“对话转 MemoryEntry”的私有逻辑，而是把 `benchmark/scripts/step1_convert_events.py` + `step3_build_graph.py` 中已经跑通的映射抽象成**通用库函数**，让 benchmark 与线上 `session_write` 共用同一规范。

### 1.1 目的

- 统一“文本对话→MemoryEntry+Edge” 的数据契约：
  - episodic（event turn）条目的字段布局；
  - semantic（fact）条目的字段布局；
  - event/fact/timeslice 之间的边类型与方向。
- 为 Phase 2 的 `memory.session_write(...)` 提供稳定、可复用的实现基线。

### 1.2 范围与改动

- 从 benchmark 中抽象出对话映射规范：
  - 从 `step1_convert_events.py` 抽象：
    - `sample.conversation` → turn 列表：speaker/dia_id/session/turn/text/...；
    - 生成标准 Event/TimeSlice 结构（含 `prev_event/timeslice/participants`）。
  - 从 `step3_build_graph.py` 抽象：
    - `event → MemoryEntry(kind="episodic", modality="text")`，metadata 至少包含：
      - `memory_domain="dialog"`
      - `source="locomo_text_pipeline"`（后续在通用化时参数化）
      - `event_id`（逻辑 ID，如 `conv-26_D1_3`）
      - `timestamp/timestamp_iso`
      - `session/turn/sample_id/dia_id/user_id`
    - `fact → MemoryEntry(kind="semantic", modality="text")`，metadata 至少包含：
      - `memory_domain="dialog"`
      - `fact_type/scope/status/importance`
      - `source_sample_id`
      - `source_turn_ids`
      - `speaker/mentions/temporal_grounding` 等扩展字段。
    - 关系边：
    - `REFERENCES(Fact→Event)`（由 `source_turn_ids` → event index 映射而来）；
      - `PART_OF(Fact→TimeSlice)`（由 `source_turn_ids` → session_index 映射而来）；
      - `OCCURS_AT(Event→TimeSlice)`。
- 工程落地方式（重要约束：**实现放在 Memory 模块内，benchmark 暂不改动**）：
  - 在 `modules/memory` 下新增专门的文本管线模块（例如 `modules/memory/etl/text_pipeline/`），**仅供 Memory 及上层 SDK 使用**；
  - 该模块内部暴露纯函数：
    - `turns_to_events_and_timeslices(...) -> list[EventRecord], list[TimeSliceRecord]`
    - `events_to_memory_entries(...) -> list[MemoryEntry]`
    - `facts_to_memory_entries_and_links(...) -> list[MemoryEntry], list[Edge]`
  - LoCoMo 的 Step1/Step3 **暂时保持原状**，作为“基准实现/规范来源”；Memory 侧的实现以它们的行为为标杆，做到：
    - prompt 语义等同（抽取器仍按 benchmark 的 FactItem 约定组织输出）；
    - schema/字段名含义等同（即使代码路径不同，落库结构应与 Step3 产物兼容）。

### 1.3 验收标准

- 代码：
  - `modules/memory/etl/text_pipeline`（名称示意）提供的函数可在不依赖 LoCoMo 具体 JSON 结构的前提下，完成“通用对话 turns → Event/Fact → MemoryEntry/Edge”的映射；
  - 函数的 schema（字段名/语义）与 benchmark 中 `step1_convert_events.py` / `step3_build_graph.py` 的产物保持一致（以文档 + 小样本对比为准）。
- 行为：
  - 在一份选定的 LoCoMo 样本上：
    - 用原有 Step1+Step3 pipeline 生成 `all_entries.jsonl`/`all_links.jsonl`；
    - 用新的 `modules/memory` 文本管线 + `session_write`（或等价测试钩子）生成 MemoryEntry/Edge，再导出为 JSON；
    - 二者在 entries/links 数量与字段语义上高度一致（允许 `source` 名称等少数字段不同，但 `kind/modality/memory_domain/fact_type/source_turn_ids/关系类型` 等核心字段必须对齐）。

### 1.4 测试要点

- 为 `modules/memory/etl/text_pipeline` 增加精确单测：
  - 使用小型对话样本（1–2 个 session，若干 turn），验证：
    - Event/TimeSlice 的 logical ID、timestamp、session/turn 等字段正确映射；
    - Fact 的 `source_turn_ids` → Event/TimeSlice 映射正确；
    - 生成的 `REFERENCES`/`PART_OF`/`OCCURS_AT` 边与预期一致。
- 增加一个“对齐性”测试脚本（可放在 benchmark 或 tools 下），用于人工/半自动验证：
  - 对同一个 LoCoMo 样本，分别跑原始 Step1+Step3 与 Memory 文本管线；
  - 将两侧产物做结构化对比（例如按 event_id/fact_id 对齐后对比 metadata 关键字段与关系类型）；
  - 在 PROCESS 中记录对齐结果与差异（如仅 `source` 字段不同）。

---

## Phase 2：在客户端实现 `memory.session_write(...)`，直接复用 LoCoMo 管线

### 2.1 目的

- 为上层提供一个**标准化的对话归档入口**：
  - 输入：一段会话 + tenant/user/product 标识；
  - 输出：已经按统一 schema 写入 Memory 服务的 events+facts；
  - 不改变现有 `/write` API 的任何行为。
- 确保线上“对话→记忆”与 LoCoMo Benchmark 的离线管线**共用同一映射规范**，便于指标对齐与问题定位。

### 2.2 范围与改动

- 在 **Memory 模块内部的客户端/SDK 层** 实现 `memory.session_write(...)`（可以是：
  - 顶层导出函数：`from modules.memory import session_write`，或
  - `modules.memory.client.Memory.session_write(...)` 方法；
  - 对外签名与 `docs/…/对话管线API_v1_施工规范.md` 中定义对齐）。
  - benchmark 侧只作为调用者/对标对象，通过 HTTP `/write` 使用该封装，不改其内部脚本逻辑。
- 实现管线逻辑（复用 Phase 1 的抽象）：
  1. 输入 `turns`（`[{role, content, turn_id?, timestamp?}, ...]`）+ `tenant_id/user_id/product_id/session_id`；
  2. 调用“turns→events/timeslices”转换，得到 Event/TimeSlice 记录；
  3. 如 `extract=True` 且存在可用 LLM（参见 llm_policy 定义），调用抽取器生成 FactItem 列表；
  4. 调用“facts→MemoryEntry+links”转换，得到 semantic facts 与关联边；
  5. 组装 entries+links：
     - Event entries：`kind="episodic", modality="text", metadata.memory_domain="dialog", source="conversation", run_id=session_id,...`
     - Fact entries：`kind="semantic", modality="text", metadata.memory_domain="dialog", source="mem0" 或可配置，fact_type/status/scope/importance/source_turn_ids/...`
  6. 调用 `/write` 或同进程 `MemoryService.write` 完成写入；
  7. 返回：`{"version": "...", "events_written": n_events, "facts_written": n_facts, "facts_skipped_reason": "...", "debug": {...}}`。
- llm_policy 行为必须与文档一致：
  - `require`：
    - 若无法构造可用 LLM（无 provider+api_key/平台 key），直接抛出/返回错误，**不写入 events/facts 任何内容**；
    - 错误信息中必须明确 `llm_missing` 或类似原因字段。
  - `best_effort`：
    - 无 LLM 时仍写入 events（episodic），facts 跳过；
    - 返回中带 `facts_skipped_reason="llm_missing"`。

#### 2.2.1 `session_id` 幂等语义（必须写死）

`session_id` 作为系统幂等键是对的，但必须明确重复提交的语义。这里对齐《文本记忆统一接入方案》中 `overwrite_existing` 的设计（`true=重新抽取并Diff更新; false=若已存在则跳过`），并补齐“失败重试”的工程语义：

- 新增参数：`overwrite_existing: bool = false`
- 状态判定：是否“已存在”不能只看 `run_id=session_id` 是否有任何 entry（可能是失败后的半成品），而应以“会话已完成标记”为准：
  - Memory 侧写入一个 session marker（建议：`kind="semantic", modality="structured"`，`metadata.node_type="session_marker"`，`metadata.run_id=session_id`，`metadata.status in {"in_progress","completed","failed"}`），仅在“events+facts(+links) 写入成功”后标记为 `completed`。
- 重复提交同一 `session_id` 时：
  - 若检测到 `status="completed"`：
    - `overwrite_existing=false`：**跳过**（返回 `status="skipped_existing"`，不产生任何写入与抽取）。
    - `overwrite_existing=true`：**覆盖更新**：
      - 重新抽取 facts，并按 V1 策略执行更新（最小可行：先删除该 session 下旧的 facts/events，再写入新的一套；或仅替换 facts，events 按 turn_id 幂等 upsert）。
  - 若检测到 `status!="completed"`（不存在/中断/失败）：
    - 视为“未完成”，**允许重试并补齐**（无论 `overwrite_existing` 取值如何）。

> 注意：V1 不要求做跨 session 的“事实状态机”合并；这里的 overwrite 仅作用于“同一 session_id 的归档结果”，保证不重复写入同一 session 的 facts。

#### 2.2.2 抽取成功但入库失败的回滚/补偿语义（必须明确）

场景：LLM 抽取成功，但写入失败（常见原因：Neo4j 超时、部分下游写入失败导致 `/write` 返回 5xx）。

- 默认策略（推荐，与 LoCoMo Step4 的行为一致）：**不回滚 events**，采用“幂等 upsert + 安全重试”：
  - 原因：当前系统的 `/rollback` 主要覆盖 UPDATE/DELETE 的快照回滚，无法对 batch ADD 提供可靠的跨 Qdrant+Neo4j 原子回滚；强行回滚容易把正确数据也删掉。
  - 实践策略：所有 session 写入使用稳定的 deterministic IDs（至少对 events；facts 视 V1 策略），确保重试不会产生重复条目。
  - 失败时返回：
    - `status="failed"` + `error_reason="graph_write_failed|vector_write_failed|unknown_partial"`；
    - 标记 session marker 为 `failed`/`in_progress`（不要 `completed`）。
  - 调用方处理：允许用同一 `session_id` 重试，系统应能“补齐/收敛到一致状态”。
- 可选策略（谨慎，默认关闭）：`cleanup_on_failure=true` 时，客户端在确认本次写入已生成确定的 entry ids 后，best-effort 调用 `/batch_delete` 清理本 session 的新写入条目；但该策略必须有强确认与边界过滤（tenant + principals + run_id），避免误删历史数据。

### 2.3 验收标准

- API 契约：
  - `session_write(...)` 的参数/返回结构与 `对话管线API_v1_施工规范.md` 中定义一致（可在该文档中标记实现状态与版本号）。
- 行为：
  - 在简单对话样例上，使用 `session_write` 写入后：
    - Qdrant 中可检索到 `episodic` 与 `semantic` 条目，metadata 中 `memory_domain/source/run_id/user_id/fact_type/...` 等字段与预期匹配；
    - Neo4j 中存在 `OCCURS_AT/REFERENCES/PART_OF` 等边（若通过 GraphUpsert 或后续 Phase 实现）。
  - llm_policy：
    - `require`：在无 LLM 配置时，函数直接失败，不产生任何写入（可通过 vector store dump 与 audit 验证）；
    - `best_effort`：在无 LLM 配置时，facts 条目数为 0，events 仍正常写入。
  - 幂等性与 overwrite_existing：
    - 第一次提交 `session_id=S` 成功后，第二次提交同一 `S`：
      - `overwrite_existing=false`：返回跳过且不会新增 facts；
      - `overwrite_existing=true`：最终库内不会出现“重复 facts”（以 `run_id=S` 过滤，facts count 应与最新抽取一致）。
  - 失败补偿：
    - 模拟 Neo4j 超时导致 `/write` 失败时：不会写入 `completed` marker；重试后最终能补齐写入并标记为 `completed`。

### 2.4 测试要点

- 单元测试：
  - 对 `session_write` 进行纯 Python 级别的检查：构造假 LLM 抽取器，验证 entries 和 links 的结构；
  - 分别测试 `llm_policy=require` / `best_effort` 分支下的行为。
  - 增加幂等测试：
    - 同一 `session_id` 连续调用两次，验证 skip/overwrite 语义与 facts 不重复。
  - 增加失败重试测试：
    - stub Neo4j 写入抛异常，验证 session marker 状态与可重试性。
- 集成测试（推荐）：
  - 启动 Memory API（本地 Qdrant+Neo4j 或内存实现），用 `session_write` 写入一段模拟 LoCoMo 对话；
  - 使用 `/search` 和图 API 校验：
    - `event_search` 可以按 run_id/tenant/user 回溯到原始对话片段；
    - `fact_search` 可以按 fact_type/importance/source_turn_ids 找到抽取出的事实；
    - 至少覆盖一个 L2/L3 问题的最小闭环（例如“昨天做了什么”）。

---

## Phase 3：实现 `memory.retrieval(strategy="dialog_v1")`，对齐 LoCoMo 三路检索+融合

### 3.1 目的

- 为“问记忆”提供一个高层检索入口，直接复用 LoCoMo pipeline 的 3 路检索策略：
  - fact_search（semantic facts）
  - event_search（episodic turns）
  - reference_trace（fact → event 回溯）
- 在证据检索之外，补齐可选的 QA 汇总步骤：把 evidence 综合为最终 `answer`（与 benchmark 的 QA prompt/格式保持一致）。
- 让线上 `dialog_v1` 的行为与 `benchmark/adapters/moyan_memory_qa_adapter.py` 的 3-way 检索 + QA 生成保持等价，避免 benchmark 与实际产品语义脱节。

### 3.2 范围与改动

- 在 **Memory 模块内部的 SDK 层** 实现：
  - 顶层函数：`memory.retrieval(..., strategy="dialog_v1")`；
  - 或方法：`Memory.retrieval(...)`，并从 `modules.memory` 顶层导出。
  - benchmark 继续使用自己的 Adapter（`MoyanMemoryQAAdapter`），仅在行为上对齐 `dialog_v1` 的 3-way 检索，不直接依赖其实现。
- `dialog_v1` 内部实现：
  - 3 路检索：
    - A) fact_search：
      - `filters` 至少包含：`tenant_id, user_id(principals), user_match, memory_domain="dialog", memory_type=["semantic"], modality=["text"], source ∈ {"mem0", "locomo_text_pipeline"}`；
      - `expand_graph=false`。
    - B) event_search：
      - `filters` 至少包含：`tenant_id, user_id(principals), user_match, memory_domain="dialog", memory_type=["episodic"], modality=["text"], source ∈ {"conversation", 其他对话源}`；
      - `expand_graph=true`（利用当前 MemoryService 的图扩展为事件打 graph 分数）。
    - C) reference_trace：
      - 从 fact_search 的结果中读取 `source_turn_ids/event_id`，生成对原始 events 的“溯源候选”（可通过一次 `/search` 或本地映射实现）；
      - 不额外改变底层模型，只是把 fact 和它们支持的 events 视为一个证据集合。
  - 分路归一化与融合：
    - **对齐 benchmark**：不做跨路归一化，直接使用固定权重对原始 score 加权：
      - `final_score = score * source_weight`
      - 固定权重：`fact_search=2.0`, `reference_trace=1.8`, `event_search=1.0`
    - 去重键：优先使用 `hit.id`，fallback 为 `entry.metadata.event_id` 或 `dia_id`；
    - 统一截断为 topk。
  - 可选 QA 生成（对齐 benchmark `_generate_answer`）：
    - 参数：`with_answer=true` 时启用；
    - Prompt：使用与 benchmark 完全一致的 `QA_SYSTEM_PROMPT_GENERAL`；
    - user_prompt：严格按 “Question/Task type/Evidence 列表” 组装；
    - `llm_policy=require|best_effort`：无可用 LLM 时硬失败/软降级。
  - debug 输出：
    - `debug.executed_calls`：列出每一路的 `api, count, latency_ms, error, trace`（trace 可以透传 MemoryService 的 search trace）；
    - `debug.fusion`：包含 `source_weights, normalization="minmax_v1", deduped_before/after`；
    - `debug.strategy="dialog_v1"`。

### 3.3 验收标准

- 功能：
  - 对于通过 Phase 2 写入的对话记忆，`retrieval(..., strategy="dialog_v1")` 能稳定返回：
    - facts（长期记忆）+ 原始对话片段 + 溯源 events 的组合 evidence；
    - `with_answer=true` 时返回 `answer`，且答案内容仅基于 evidence（不编造）。
    - 对于典型 L1–L3 问题（参考“记忆检索与推理对标清单”），返回结果至少包含足够回答问题的证据。
- 对齐 LoCoMo adapter：
  - 在相同的 Memory 数据（如通过 Step4 导入的 LoCoMo entries+links）上：
    - `dialog_v1` 的候选集合（以 event_id/dia_id 为主键）与 `MoyanMemoryQAAdapter` 的 3-way 检索候选集合高度重合；
    - 排序可能略有差异，但权重逻辑（facts 优于 events）保持一致。
    - `with_answer=true` 时，QA prompt 与证据拼装格式与 `MoyanMemoryQAAdapter._generate_answer` 一致。

### 3.4 测试要点

- 单元测试：
  - 在 InMemVectorStore + InMemGraphStore 环境中构造一个小规模“对话 + fact” 图，验证：
    - 3 路检索分别获取预期的集合；
    - 加权融合后，facts 主导排序；
    - 去重逻辑正确处理“同一 event 被多路命中”的情况。
- 集成测试：
  - 选取 LoCoMo 的一个 conv 样本，通过 Step4 导入 Memory，然后：
    - 用 `retrieval(strategy="dialog_v1")` 获取 evidence；
    - 对比 `MoyanMemoryQAAdapter` 的 `evidence_items`，至少在 top-K 范围内主键集合相同/相近；
    - 用简单 QA LLM（或 dummy QA）串起来，确保 `with_answer=true` 时 L1–L2 题目可被正确回答若干例。

---

## Phase 4：Graph/时序增强与整体验收（可选，但推荐）

### 4.1 目的

- 在 Phase 0–3 的基础上，进一步把对话中的时序与结构信息在 TKG 中物化，提升对 L2/L3/L4 类问题的可解释性：
  - 明确的 `NEXT_EVENT`/`COVERS_EVENT`/`SUPPORTED_BY(UtteranceEvidence)`/`SPOKEN_BY`/`INVOLVES` 等边；
  - TimeSlice（会话级）与 Event/Utterance 的对齐；
  - 对话/事实与视觉事件的“同一时间片”对齐。

### 4.2 范围与改动

- 在 `session_write` 完成基本写入后，提供可选的 graph upsert 步骤（可配置开关）：
  - 在客户端侧构造 `GraphUpsertRequest`（TKG 主图视图）并调用 `/graph/v0/upsert`：
    - 节点：`MediaSegment(modality="text")`、`TimeSlice(kind="dialog_session")`、`Event`、`UtteranceEvidence`、`Entity(Person)`；
    - 边：`COVERS_SEGMENT`、`COVERS_EVENT`、`NEXT_EVENT`、`SUPPORTED_BY`（Event→UtteranceEvidence）、`SPOKEN_BY`（Utterance→Entity）、`INVOLVES`（Event→Entity）、`SUMMARIZES`（Event→MediaSegment）；
  - 约束：默认 `graph_upsert=true`（对话写入默认同步 upsert 到 TKG 主图）；可显式 `graph_upsert=false` 关闭。失败语义由 `graph_policy=require|best_effort` 控制，默认 `best_effort`（不破坏旧调用/可用性）。
- 增强解释型 API（可复用 v0.7 explain 系列）：
  - 确保 `explain_event_evidence`/`explain_first_meeting` 等 API 能覆盖文本对话场景。

### 4.3 验收标准

- 图结构：
  - 针对至少一个“对话 + 视觉”混合样本，能够通过 Graph API 回答：
    - “某时间段内谁说过什么？”；
    - “某个决策/事件的证据链是什么？”
  - 对话中的 Event/Fact/TimeSlice 节点与视觉事件共享 tenant/user/domain 上下文，时空对齐可通过 2–3 hop 查询实现。
- 性能与资源：
  - graph upsert 过程中遵守配置中的 `max_hops/neighbor_cap_per_seed/rel_whitelist` 等门控，不出现爆炸式边增长；
  - explain API 有合理的缓存与指标监控。

### 4.4 测试要点

- 小图集成测试：
  - 构造一个包含多 session、多事件、多 fact 的对话样本，运行 `session_write` + graph upsert；
  - 使用 GraphService 的 explain/timeline API 验证证据链完整性与 hop 限制。
- LoCoMo 对标：
  - 选取 1–2 个 L2/L3 问题，检查在开启 graph upsert 后，解释路径中是否能看到 TimeSlice/REFERENCES/PART_OF 等结构化关系。

---

## Memory 图 vs TKG 图：历史与收敛路线

> 澄清“Memory 图（MemoryEntry 图）”与 “TKG 图（GraphUpsertRequest 图）”的关系，以及后续统一路线，避免架构在文档层面看起来是“分叉”的。

### 4.x.1 历史演进：为什么会有两种图形态？

- **第一阶段：只有 Memory 图（检索层小图）**
  - 早期版本里，图相关能力全部挂在 `MemoryService` 上：
    - 节点 = `MemoryEntry`（episodic/semantic/structured）；
    - 边 = `Edge(rel_type)`，语义较宽（`appears_in/said_by/located_in/...`），通过 `MemoryService.write(entries, links)` 落库；
    - `/search` 的 `expand_graph=True` 也是直接在这套“MemoryEntry 图”上做邻域扩展，用于向量召回后的补充证据与混合重排。
  - 这一层图本质上是“检索索引上的轻量关系层”，而不是完整的时空知识图谱。

- **第二阶段：TKG Graph v0.x/v1.0 能力落地（主图）**
  - 随着 `TKG-Graph-v1.0-Ultimate` 推进，我们在同一 Neo4j 上追加了严格 Schema 的 **TKG 图**：
    - 请求模型 = `GraphUpsertRequest`（`MediaSegment/Evidence/UtteranceEvidence/Entity/Event/Place/TimeSlice/...` + `GraphEdge`）；
    - 服务层 = `GraphService.upsert(...)` → `Neo4jStore.upsert_graph_v0(...)`；
    - HTTP 入口 = `/graph/v0/upsert` + `/graph/v0/*` 查询 / Explain / TTL / 导出等；
    - 配套 explain、TTL、gating、导出、L1–L5 harness 等能力。
  - 注意：底层函数名仍叫 `upsert_graph_v0`，HTTP 路径也仍是 `/graph/v0/*`，这是为了兼容性保留 v0 路径；能力本身已经按 v1.0 逻辑演进。

- **第三阶段：两种图在同一 Neo4j 并存**
  - 当前实际状态：
    - `Memory 图`：服务 `/search` 和 `MemoryService.search(..., expand_graph=True)`，节点/边都是 `MemoryEntry/Edge`；
    - `TKG 图`：服务 `/graph/v0/*`、Explain、benchmark_v1 L1–L5、小图 harness 脚本。
  - 这不是两套数据库，而是同一 Neo4j 中并存两种建模方式：
    - Memory 图 = “检索层索引图”，围绕 `MemoryEntry`；
    - TKG 图 = “时空知识主图”，围绕 `Event/Entity/TimeSlice/Evidence/UtteranceEvidence` 等。

### 4.x.2 收敛方向：未来检索统一基于 TKG 图

我们明确的路线不是继续分叉，而是逐步让所有检索都走 TKG 图，Memory 图退化为兼容层：

- **目标一：对话接入也挂到 TKG 主图上**
  - Phase 4 的 Graph upsert：让 `session_write(...)` 除了写 `MemoryEntry + Edge` 外，同步构造 `GraphUpsertRequest` 并写入 TKG 图：
    - 为对话 turn/事件创建 `Event/TimeSlice/UtteranceEvidence/Entity(Person)`；
    - 落地 `NEXT_EVENT/OCCURS_AT/COVERS_EVENT/SUPPORTED_BY/SPOKEN_BY` 等边。
  - 这样，对话记忆不再只存在于 Memory 图，而是成为 TKG v1.0 主图的一部分。

- **目标二：新能力优先落在 TKG 图上**
  - 所有新的检索/解释型 API（L3–L5 问题、Explain 视图、timeline 等）：
    - 主数据源优先使用 TKG 图中的 `Event/Entity/TimeSlice/Evidence/UtteranceEvidence`；
    - Memory 图上的 `Edge` 更多作为历史兼容或辅助索引，避免再往上叠新语义。

- **目标三：逐步让 `/search` 也重建在 TKG 之上**
  - 未来 `/search` 的理想形态：
    1. 向量召回产生种子（可以仍来自 `MemoryEntry`，也可以来自事件摘要向量）；  
    2. 将种子映射/对齐到 TKG 节点（事件 / 时间片 / 实体 / 证据）；  
    3. 通过 `GraphService` 在 TKG 上做邻域扩展（受 `max_hops/rel_whitelist/tenant_id` 等门控）；  
    4. 在 TKG 图结构基础上做混合重排与解释，而不是依赖 Memory 图上的松散 `Edge` 关系。
  - 迁移策略：
    - 短期：保持 Memory 图写入与 expand_graph 行为不变，保证现有 `/search` 不被破坏；
    - 中期：新策略 / 新场景优先走 TKG，Memory 图仅做“兜底”或只读兼容层；
    - 长期：当所有重要检索路径都迁移完成后，评估逐步停用 Memory 图的写入/扩展逻辑，只保留 TKG 图作为唯一的图真相源。

---

## Phase 5：默认检索迁移到 TKG（TKG-first Retrieval / Search）

> 共识更新（以本次协作结论为准）：
> 1) **写入侧**：LLM fact 抽取是“认知层入口”的刚需能力，而不是可选项；  
> 2) **检索侧**：不长期维护 `dialog_v1`（Memory 图）与 `dialog_tkg_v1`（TKG 图）两套并行策略；最终形态是 **直接把 `dialog_v1` 迁移为 TKG-first**，Memory 图逐步退化为兼容/缓冲层。
>
> 因此 Phase 5 的核心不是“再造一个检索系统”，而是把 **已有的向量召回能力** 变成 **TKG 图上的可解释证据链**，并将现有 `dialog_v1` 平滑迁移到 TKG 作为唯一主路径。

### 5.1 目的

- 让“默认检索”从依赖 `MemoryEntry/Edge` 的轻量索引图，迁移为基于 TKG 的 `Event/TimeSlice/UtteranceEvidence/Entity`：
  - 证据链可解释（能回放 utterance → event → timeslice → entity）；
  - L4/L5 场景能走同一套图模式（与 harness 一致）；
  - 为最终“封存 Memory 图”做准备。

### 5.2 关键设计约束（必须先讲清楚，否则你会把系统写坏）

- **向后兼容**：不能破坏现有 `/search` 的输出形态与主要语义；必须允许渐进迁移。
- **隔离一致**：TKG-first 的检索必须与当前向量检索同样严格的 `tenant_id + user_id + memory_domain (+ run_id)` 隔离，否则会引入跨主体证据污染。
- **桥接问题必须显式解决**：向量召回只给你“文本相似”，但 TKG 才是“结构化真相源”。你必须明确：
  - 种子如何映射到 TKG 节点（Event / UtteranceEvidence / TimeSlice）；
  - 证据如何展开（rel_whitelist/max_hops/neighbor_cap）；
  - 最终答案（QA）是否由检索层生成还是由上层 Agent 生成。

### 5.3 战术方案（推荐的最小可落地版本）

**Step 0：固化写入侧 LLM fact 抽取为刚需（认知层入口）**
- 默认语义应收敛为：`session_write` 必须完成 facts 抽取与落库（除非显式关闭 `extract/write_facts` 或处于 dev/测试模式）。
- 验收标准：
  - 未提供可用 LLM/抽取器时：默认失败并可重试（marker 不得为 completed）；
  - 抽取成功后：facts 必须带 `source_turn_ids` 等溯源字段，后续可映射到 TKG 的证据链。

**Step 1：建立“向量索引 ↔ TKG 节点”的稳定对齐（必须）**
- 写入侧（对话归档）继续保持两步：
  1) `/write` 写入 `MemoryEntry`（用于 benchmark-aligned 的 dialog_v1 检索与兼容）；
  2) `/graph/v0/upsert` 写入 TKG 主图（Phase 4 已默认启用）。
- 增量新增一个“桥接对齐”（二选一，按风险从低到高）：
  - A) **仅用 metadata 做桥接**：在对话的 `MemoryEntry(event)` 上写入稳定的 `tkg_event_id` / `tkg_timeslice_id`（或可逆生成），确保从向量命中的 event 可以无歧义定位到 TKG 的 Event/TimeSlice；
  - B) **新增 TKG evidence 向量条目**：为每条 `UtteranceEvidence`/Event 写一条专用向量索引条目（必须用可区分的 `metadata.source`，并确保不会污染现有 dialog_v1 的 event_search）。
    - 现已落地（第一批）：`metadata.source="tkg_dialog_utterance_index_v1"`，并在向量层默认排除该 source；只有显式 `filters.source` 指定时才会召回这些内部索引条目。

**Step 1.5：facts 同步进入 TKG 主图（Knowledge/Fact + 可回溯证据链）**
- 目的：facts 不再只存在于 `MemoryEntry(fact)`，必须进入 TKG 的 Cognition 层，成为主真相源的一部分。
- 最小落地形态（与现有 Neo4jStore/GraphUpsertRequest 兼容）：
  - 节点：每条 fact 映射为一个 `Knowledge` 节点（id 可复用 MemoryEntry 的 fact uuid，确保幂等与跨层可对齐）；
  - 边（必须闭合证据链）：
    - `TimeSlice -[:CONTAINS]-> Knowledge`（会话包含该认知记忆）；
    - `Knowledge -[:DERIVED_FROM]-> Event`（事实从哪些 turn/event 提炼）；
    - `Knowledge -[:SUPPORTED_BY]-> UtteranceEvidence`（事实可回溯到原话）；
    - `Knowledge -[:STATED_BY]-> Entity(Person)`（谁说的/归属谁的陈述）。
- 验收标准：
  - 任意 fact：通过 1–3 hop 可回到具体 utterance 与 speaker；
  - 重试同 session_id：不会产生重复 Knowledge 节点与重复边（幂等）。

**Step 2：将 `dialog_v1` 迁移为 TKG-first（迁移期允许开关，但不形成长期分叉）**
- 迁移方式：
  - 短期：增加一个后端开关（示例：`dialog_v1_backend="memory"|"tkg"`），用于灰度与对齐；
  - 长期：默认切到 `tkg`，并逐步封存 Memory 图的 `expand_graph` 作为兼容层。
- 行为（TKG-first）：
  1) 向量召回得到 seed（event 或 utterance）；
  2) seed 映射到 TKG 节点 id；
  3) 用 GraphService 在 TKG 上扩展证据链（Event→UtteranceEvidence→Entity→TimeSlice）；
  4) 输出统一的 evidence_items（并可选 QA 汇总）。
- 对齐策略：在迁移期对照 `dialog_v1(memory)` 与 `dialog_v1(tkg)` 的 top-K 证据集合差异，确保差异可解释且符合预期。

**Step 2.5：翻转默认到 TKG（保留兼容性兜底）**
- 目标：默认检索走 TKG；但必须保证历史数据或缺失索引时不“把用户空间弄死”。
- 推荐默认语义：
  - `dialog_v1` 默认 `backend="tkg"`；
  - 当 utterance index 缺失/无命中时，**自动 fallback** 到 legacy `event_search(episodic, expand_graph=True)`，保持可用性；
  - 在 debug/trace 中必须显式记录 fallback（避免“看起来是 TKG，但实际上跑了旧路由”的自欺）。

**Step 3：让 `/search` 支持 TKG backend（先加开关，后改默认）**
- 新增一个可选参数（示例）：
  - `graph_backend: "memory" | "tkg" = "memory"`（短期默认 memory，避免破坏 userspace）；
- 当 `graph_backend="tkg"`：
  - `/search` 仍可复用向量召回，但图扩展与解释走 TKG；
  - 返回结构保持一致（hits + neighbors/trace），但 trace 标记 `graph_backend=tkg` 与证据链来源。
- 当线上证据与稳定性验证完成后，再把默认从 `"memory"` 迁移到 `"tkg"`。

> 现状（已落地第一版）：
> - 服务端 `POST /search` 已支持 `graph_backend` 字段，默认 `"memory"`；
> - 当 `graph_backend="tkg"` 且 `expand_graph=true`：
>   - 通过 `GraphService.explain_event_evidence(...)` 构造 `neighbors`（best-effort）；
>   - 要求 `tenant_id`：优先取 `filters.tenant_id`，否则读取 `X-Tenant-ID` 头（缺失则自动降级回 `"memory"`）；
>   - 仅对可映射到 TKG event 的命中扩展（优先用 `metadata.tkg_event_id`），避免对“非 TKG 语义命中”胡乱造边；
>   - trace 中同时写入 `graph_backend_requested/graph_backend_used`，并记录 `tkg_expand` 统计字段用于排障。

### 5.4 验收标准（你不写清楚，就永远对不齐）

- 一致性：
  - 同一组 query（至少覆盖 L1–L3 的代表问题），`dialog_v1` 与 `dialog_tkg_v1` 的 top-K 证据集合应高度重合（允许排序差异，但必须可解释）。
  - tenant/user/domain 隔离在 TKG-first 路径上必须是硬约束（出现一次跨主体证据即判失败）。
- 可靠性：
  - TKG 图写入失败不应导致对话写入不可用（默认 best_effort）；但需可观测（trace/metrics）。
  - TKG-first 检索在图查询失败时必须可降级（返回向量证据或明确提示），不能返回“看似正确但来自错误 tenant”。
- 产品语义：
  - “证据 → QA 答案”默认 **不应强制启用**（检索层返回 evidence，是否生成 answer 由上层 Agent 选择）；但必须提供可选开关以对齐 benchmark 的 QA 评测口径。

## 完成全部 Phase 后与当前系统的功能差异与新增能力对比

### A. 与当前系统的主要差异

| 维度 | 当前系统 | 完成 Phase0–4 后 |
|------|----------|------------------|
| 去重/合并隔离 | dedup 搜索只按 modality 过滤，可能跨 tenant/user/domain 合并 | 去重/合并严格约束在同 tenant + user + memory_domain（可选 run_id）内，避免跨主体污染 |
| 对话写入入口 | 只有 `Memory.add`（P0 SDK），语义简化，未与 LoCoMo 管线对齐 | 提供 `memory.session_write(...)`，直接复用 LoCoMo 的 Event/Fact → MemoryEntry/Edge 规范 |
| 文本事实抽取规范 | mem0-style 抽取存在，但落库字段与 benchmark FactItem 不完全对齐 | 统一使用与 `FactItem` 兼容的 schema，fields：`fact_type/status/scope/importance/source_turn_ids/temporal_grounding/...` |
| 检索策略 | 只有底层 `/search` + MemoryService.search（ANN+BM25+graph+recency），上层自己拼 | 提供 `memory.retrieval(strategy="dialog_v1")`，固定 3 路检索+融合，与 LoCoMo adapter 行为一致 |
| Graph 时序结构 | 已有 TKG v0.1/v1 基础，但文本对话的时序/证据边使用不一 | 对话 Event/Fact/TimeSlice 明确挂上 `TEMPORAL_NEXT/OCCURS_AT/REFERENCES/PART_OF/SPOKEN_BY` 等边，解释链统一 |
| Benchmark 对齐 | LoCoMo pipeline 单独存在于 `benchmark/`，与线上入口弱耦合 | 线上 `session_write/retrieval(dialog_v1)` 与 LoCoMo pipeline 共用同一抽象层，指标可直接对齐分析 |

### B. 新增能力概览

- 标准化的对话归档入口：`memory.session_write(...)`，支持：
  - 会话后统一抽取（Post-Session Extraction）；
  - BYOK + `llm_policy=require|best_effort`；
  - 写入 events+facts+links，一次 `/write` 完成。
- 高层检索策略：`memory.retrieval(strategy="dialog_v1")`：
  - 固定 3 路检索（facts/events/reference_trace）；
  - min-max 归一化 + 固定 source 权重 + 去重；
  - 标准化 debug 输出，便于 benchmark 与线上排障。
- Text–Graph 对齐增强（Phase4 完成时）：
  - 对话中的事件序列和事实挂到 TKG Graph 上，与视觉事件共享结构；
  - 能使用统一的 explain/timeline API 做证据链回放。

### C. 测试与验收总览

- 单元测试：
  - 写入链路：去重/合并隔离、FactItem 映射、`session_write` 行为（含 llm_policy 分支）；
  - 检索链路：3-way 检索、融合排序、去重与 debug 结构。
- 集成测试：
  - 在 InMem 后端上跑 L1–L3 的最小问题集（参考“记忆检索与推理对标清单”），验证 `session_write + dialog_v1` 能给出正确证据；
  - 在本地 LoCoMo 样本上对比 `dialog_v1` 与 `MoyanMemoryQAAdapter` 的候选集合、排序和最终 J-Score。
- 验收标准：
  - 所有新加/扩展测试用例通过；
  - LoCoMo 上的 pipeline 使用 `session_write/retrieval(dialog_v1)` 能达到与当前 Benchmark 相当或更好的检索质量；
  - 现有外部调用 `/search` `/write` 的行为不被破坏（API 与旧数据格式保持向后兼容）。
