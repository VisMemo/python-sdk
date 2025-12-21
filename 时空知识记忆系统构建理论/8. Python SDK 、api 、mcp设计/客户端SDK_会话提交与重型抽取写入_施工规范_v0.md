# 客户端 SDK：会话提交（Session Commit）与重型抽取写入（Heavy Ingest）施工规范（V0）

> 状态：Draft（可施工）  
> 目标读者：接入方开发者、MOYAN 记忆服务端开发者、编排层/MCP 维护者  
> 本文定位：**施工标准**（约束接口、数据契约、失败语义与幂等规则），不是架构故事

---

## 0. 一句话结论（你应该怎么用）

- 会话进行中：每轮消息只做本地 `append_turn(...)`（不发网络，不抽取）。  
- 会话关闭：调用一次 `session.commit()`（异步），服务端自动执行 **Stage2 → Stage3** 的重型写入；任何一步失败都保留归档并定期重试，直到成功。  
- 会话重开：只对**新增 turns** append + commit（增量提交，幂等不重复写）。

---

## 1. 设计目标与硬边界

### 1.1 目标（必须达成）

1) **无需路由**：系统默认只走“重型写入”，不暴露 `normal/heavy` 给开发者。  
2) **异步可重试**：commit 只负责“交付输入 + 返回 job_id”，抽取/写入在后台执行并可自动重试。  
3) **原文可回放**：任意阶段失败都不丢会话原文；可回放、可审计、可重跑。  
4) **增量可续写**：支持 session 重开，只提交新增 turns，不重复污染图/索引。  
5) **外部观察一致性**：对外语义必须清晰：  
   - “未成功完成 Stage3”→ 视为**未写入**（仅归档存在）。  
   - 成功后可检索/可解释/可审计。

### 1.2 非目标（本规范明确不做）

- 不尝试从“任意 agent trace / host context dump”自动识别输入格式。  
- 不把 LLM 当作“入口路由器”来决定写入策略。  
- 不在客户端保存/传递模型 key（模型调用发生在服务端）。  

---

## 2. 面向开发者的心智模型（非常重要）

你要把 MOYAN 当成一个“**会话级写入引擎**”，而不是“每条消息都写一次的数据库”。

- **append**：你在本地把消息整理成标准 turns（越早越好，越稳定越好）。  
- **commit**：会话结束时一次性交给 MOYAN。MOYAN 承诺：  
  - 保存原文（归档）  
  - 尝试做治理与抽取写入（重试直到成功）  

> 这套模型等价于：你把会话提交到一个“最终一致”的数据管线里，而不是一次 RPC 必须完成所有工作。

---

## 3. SDK 设计（Python，客户端侧）

> 目标：开发者的代码只需要掌握 `append` 与 `commit`，其余能力通过 `status`/`wait` 获得。

### 3.1 关键对象

#### 3.1.1 `MemoryClient`

职责：
- 持有服务端 base_url、租户与用户上下文默认值、鉴权/签名配置
- 创建/恢复 `SessionBuffer`
- 查询 job/session 状态

建议构造参数（示意，不是代码）：
- `base_url`
- `tenant_id`
- `user_tokens: list[str]`
- `memory_domain: str = "dialog"`
- `auth`: token/jwt（若启用）
- `signing_secret`（若启用写操作签名）
- `timeouts/retry_policy`（客户端 HTTP 层）

#### 3.1.2 `SessionBuffer`

职责：
- 在本地缓存 `turns[]`（以及“已提交 cursor”）
- 提供 `append_turn(...)`
- 负责生成稳定的 `turn_id`
- 提供 `commit()` → 返回 `CommitHandle`

最小状态：
- `session_id: str`（稳定幂等 key）
- `turns: list[CanonicalTurnV1]`（本地累计）
- `cursor_last_committed: Optional[str|int]`（本地已提交位置）

#### 3.1.3 `CommitHandle`

职责：
- 表示一次 commit 返回的异步任务句柄
- 提供：`job_id`、`session_id`、`commit_id`
- 可选提供 `wait()`（轮询状态直到完成/超时）

### 3.2 开发者使用流程（伪代码）

```python
client = MemoryClient(
    base_url="http://memory:8000",
    tenant_id="t1",
    user_tokens=["u:1001"],
    memory_domain="dialog",
)

session = client.session(session_id="sess_2025_12_21_0001")

# 会话进行中：每轮只 append（不发网络）
session.append_turn(role="user", text="我想办领养，需要从哪里开始？", timestamp_iso="2025-12-21T10:00:00Z")
session.append_turn(role="assistant", text="先准备材料：...", timestamp_iso="2025-12-21T10:00:05Z")
session.append_turn(role="tool", text="tool=web_search result=...", timestamp_iso="2025-12-21T10:00:08Z")

# 会话关闭：一次 commit（异步）
handle = session.commit()

# 可选：等结果（通常不建议阻塞主线程）
status = handle.wait(timeout_s=30)  # 或 client.jobs.get(handle.job_id)
```

### 3.3 会话重开/增量提交（必须支持）

典型场景：窗口关闭又打开、断线重连、同一 thread 继续聊天。

SDK 必须做到：
- 仍使用同一个 `session_id`
- 新消息继续 append（turn_id 继续递增）
- commit 时只提交“未提交过”的 turns（增量）

建议策略（确定性）：
- SDK 本地记录 `cursor_last_committed`（例如最后一个已提交 turn_id）
- commit 时只发送 `turn_id > cursor_last_committed` 的 turns

> 即便客户端状态丢失，服务端也必须能靠幂等规则防止重复写（见第 8 节）。

---

## 4. CanonicalTurnV1：标准 turn 数据契约（SDK 输出 → 服务端输入）

> 约束：**Stage2 的无损 span 校验**要求 turn.text 的索引语义稳定。  
> 本规范统一：`span.start/end` 以 Python 字符串切片语义（Unicode codepoint 索引）为准。

### 4.1 Schema（V1）

```json
{
  "turn_id": "t0001",
  "role": "user|assistant|tool|system",
  "name": "可选：参与者名/工具名",
  "timestamp_iso": "可选：ISO8601",
  "text": "原文文本（UTF-8）",
  "attachments": [
    {
      "type": "tool_result|file|image_ref",
      "name": "web_search",
      "truncated": false,
      "sha256": "可选",
      "ref": "可选：外部引用（如 blob://...）"
    }
  ],
  "meta": {
    "upstream_message_id": "可选：上游 message id",
    "tool_call_id": "可选：工具调用关联",
    "any": "..."
  }
}
```

### 4.2 硬约束（必须写死）

1) `turn_id`：  
   - 必须在 session 内唯一  
   - 必须可排序（推荐固定宽度递增 `t0001`）  
2) `role`：仅允许枚举值 `user/assistant/tool/system`  
3) `text`：必须是原文，不允许客户端改写/总结  
4) `timestamp_iso`：可选；缺失不会报错，但会削弱时序能力  

---

## 5. 服务端 API：会话提交（异步）

> 本节是“服务端必须提供的接口形态”，以便 SDK 有稳定对接点。  
> 端点命名可调整，但必须版本化（`/v1`）。

### 5.1 提交会话（POST `/ingest/dialog/v1`）

用途：接收一次增量提交，完成“归档入队”，返回 job_id。

#### 5.1.1 Headers

- `X-Tenant-ID`：必填（或由 auth token 推导；仍建议显式传）
- `Content-Type: application/json`
- 鉴权：`X-API-Token` / JWT（若启用）
- 写签名：`X-Signature-Ts` + `X-Signature`（若启用写操作签名）

#### 5.1.2 Request Body（建议）

```json
{
  "session_id": "sess_2025_12_21_0001",
  "user_tokens": ["u:1001"],
  "memory_domain": "dialog",
  "turns": [ /* CanonicalTurnV1[] */ ],

  "commit_id": "可选：客户端生成的幂等 id（UUID）",
  "cursor": {
    "base_turn_id": "可选：客户端认为已提交到哪里"
  },
  "client_meta": {
    "sdk_version": "0.1.0",
    "platform": "python",
    "any": "..."
  }
}
```

约束：
- `turns` 必须为增量（允许为空，但空提交应直接返回“无变更”）
- 服务端必须基于幂等规则去重（见第 8 节）

#### 5.1.3 Response（接单成功）

```json
{
  "ok": true,
  "session_id": "sess_2025_12_21_0001",
  "job_id": "job_abc123",
  "accepted_turns": 42,
  "deduped_turns": 3,
  "status": "RECEIVED"
}
```

说明：
- 返回成功只代表“已归档 + 已入队”，不代表 Stage2/Stage3 成功。

---

## 6. 服务端 API：状态查询（异步任务必需）

### 6.1 查询 job 状态（GET `/ingest/jobs/{job_id}`）

用途：获取后台流水线状态（供 SDK 轮询或 UI 展示）。

建议返回：

```json
{
  "job_id": "job_abc123",
  "session_id": "sess_2025_12_21_0001",
  "status": "RECEIVED|STAGE2_RUNNING|STAGE2_FAILED|STAGE3_RUNNING|STAGE3_FAILED|COMPLETED",
  "attempts": {
    "stage2": 1,
    "stage3": 0
  },
  "next_retry_at": "2025-12-21T11:00:00Z",
  "last_error": {
    "stage": "stage2|stage3",
    "code": "timeout|schema_invalid|rate_limited|server_error",
    "message": "可选：简述"
  },
  "metrics": {
    "archived_turns": 42,
    "kept_turns": 15,
    "extracted_facts": 0,
    "graph_nodes_written": 0,
    "vector_points_written": 0
  }
}
```

### 6.2 查询 session 写入态（GET `/ingest/sessions/{session_id}`）

用途：从 session 维度看“已提交 cursor / 是否完成 / 最新 job”。

建议返回：

```json
{
  "session_id": "sess_2025_12_21_0001",
  "latest_job_id": "job_abc123",
  "latest_status": "STAGE3_FAILED",
  "cursor_committed": "t0042"
}
```

> 这个接口是实现“会话重开只提交增量”的重要支撑：客户端即便丢了本地 cursor，也能从服务端恢复。

---

## 7. 后台流水线：Stage2 → Stage3（默认重型）

### 7.1 Stage0：归档缓存（必成）

目标：
- 把本次 commit 的 turns 原文持久化到“归档缓存区”
- 写入 session/job 元信息与幂等索引

产物（至少）：
- `archive.turns.json`（或等价记录）
- `archive.commit_meta.json`
- `archive.cursor_state`

> 归档缓存区必须是“可持久”的：服务重启后仍可重试。

### 7.2 Stage2：价值标注（LLM）

输入：
- `CanonicalTurnV1[]`（全量或增量按你们策略；推荐对本次增量做标注，但要能引用历史上下文时再扩展）

输出（建议结构化存档）：

> 关键设计变更（必须遵守）：Stage2 **不要求也不允许** LLM “抄写原文片段（text_exact）”。  
> LLM 只输出 **标记与坐标**（turn_id + keep/drop + tags + 可选 span 的 start/end），由程序从原始 turns **规则式切片/拼接**得到“过滤后的文本”。  
> 目的：降低输出 token 成本，消除“抄写不可靠/抄错字导致校验失败”的问题。

- `stage2.decisions.json`：逐 turn 的标记结果（TurnMarkV1[]）
- `stage2.kept.json`：程序根据 decisions 规则化生成的 kept_turn_ids（以及可选 kept_spans），用于 Stage3 输入

TurnMarkV1（建议最小字段集）：

```json
{
  "turn_id": "t0007",
  "keep": true,
  "span": { "start": 0, "end": 42 },
  "user_triggered_save": false,
  "category": "fact|preference|task|rule",
  "subtype": "profile|constraint|commitment|decision|tool_grounded_fact",
  "evidence_level": "S0_user_claim|S1_ai_inference|S2_tool_grounded|S3_user_confirmed",
  "requires_confirmation": false,
  "importance": 0.0,
  "ttl_seconds": 0,
  "forget_policy": "permanent|until_changed|temporary",
  "reason": "一句话：为什么保留/为什么丢弃"
}
```

约束：
- `keep=false` 的 turn 允许出现（用于明确丢弃原因），但不会进入 Stage3。  
- `span` 为可选：默认建议 **turn-level**（不填 span 即“整条 turn 保留”）。仅在确有必要时才用 span（仍然不返回 text_exact）。  

强校验（程序化验收，失败进入重试）：
- `turn_id` 必须存在于输入 turns  
- `keep` 必须为布尔值  
- 若提供 `span`：`0 <= start < end <= len(turn.text)`（以 Unicode codepoint 索引为准）  
- `user_triggered_save`（若出现）必须为布尔值  
- `importance` ∈ [0, 1]，`ttl_seconds >= 0`，枚举字段必须在允许集合内

过滤文本生成（必须确定性）：
- kept_turn_ids = `[mark.turn_id for mark in marks if mark.keep]`（保持原顺序）  
- 若 mark.span 存在：取 `turn.text[start:end]`；否则取整条 `turn.text`  
- 将 kept 片段按 turn 顺序拼接成 `filtered_transcript`（仅用于 Stage3 输入/调试，不对外承诺稳定格式）

#### 7.2.1 用户主动保存信号（User-Triggered Save / Pin Intent）

> 目标：当用户在对话中明确表达“请记住这个/保存一下/这很重要”，我们应当尊重用户意图。  
> 但必须避免把“用户想保存”误当成“用户确认其为真”。因此：  
> - `evidence_level` **保持真实来源**（例如仍为 `S1_ai_inference`）；  
> - 通过 `user_triggered_save=true`（或等价字段）表达“用户强制保留/高优先级”；  
> - 并在 Stage3 写入一个可审计的 Knowledge/Note（带 source_turn_ids），而不是偷偷把推测写成硬事实。

**Stage2 识别与标记规则（写死，避免自由发挥）**

1) 触发条件（自然语言）  
   - 用户 turn 出现明确保存意图：例如“记住这个”“保存一下”“这很重要”“以后还要用”“别忘了”。  
2) 目标绑定（确定性默认）  
   - 默认将 `user_triggered_save=true` 施加到**最近窗口**：以触发指令前的最近 `K` 条 turns 为目标（推荐 `K=4`），且必须覆盖最近的 `assistant/tool` turn（如果存在）。  
   - 若用户明确引用某条内容（复述/引用/指代明确），可缩小窗口到被引用 turn。  
   - 若目标歧义无法消解：对目标 turns 仍可标记 `user_triggered_save=true`，但必须同时设置 `requires_confirmation=true`（表示“保存意图明确，但保存对象需确认”）。

**Stage2 输出要求**

- 对目标窗口内的 TurnMarkV1：  
  - `keep=true`  
  - `user_triggered_save=true`  
  - `importance` 建议提升到高值（例如 ≥0.9）  
  - `ttl_seconds`/`forget_policy` 采用更强保留策略（例如长期或更长 TTL）  

> 注意：Stage2 不做“即时写入”。它只产出 PinIntent 所需的结构化信号并写入归档缓存区。

**归档缓存：PinIntent（建议落盘为 stage2.pin_intents.json）**

为确保 Stage3 可确定性落库、可重试、可审计，建议 Stage2 额外产出 PinIntent 列表（由程序基于 marks/规则生成，LLM 不直接生成）：

```json
{
  "pin_id": "pin_001",
  "trigger_turn_id": "t0012",
  "target_turn_ids": ["t0008", "t0009", "t0010", "t0011"],
  "reason": "user_explicit_save",
  "importance_boost": 0.9,
  "ttl_seconds": 0,
  "requires_confirmation": false
}
```

**Stage3 落库语义（必须写死）**

- Stage3 在抽取建图时，若存在 PinIntent：必须额外写入一个 Knowledge/Note（建议 subtype=`user_pinned_note`）：  
  - 文本可做抽象总结，但必须携带 `source_turn_ids = target_turn_ids`（可回放）  
  - metadata/properties 透传 `user_triggered_save=true`、`importance/ttl_seconds/requires_confirmation/evidence_level`  
  - 若 `requires_confirmation=true`：不得将其当作“硬事实”传播（可写为 note/hypothesis，并等待后续确认闭环）

### 7.3 Stage3：抽取建图写入（LLM + 现有 pipeline）

输入：
- Stage2 的 kept 内容（由程序从原始 turns 按 decisions 生成的 turns/spans）+ tags（ttl/importance/evidence_level 等）

输出（写入后端）：
- Neo4j：TKG 节点/边
- Qdrant：向量点（utterance + facts）
- 透传：TTL/importance/evidence_level/requires_confirmation

**你已拍板的外部语义：**
- Stage3 未成功完成前：对外视为“未写入”（仅归档存在）
- 失败时：不做任何“部分写入可见化”的承诺

> 工程要求：Stage3 必须设计为幂等（多次重试不会产生重复事实与重复边），并且必须通过“可见性门闩”杜绝“部分写入”对外可见。

#### 7.3.1 Stage3 幂等硬约束（必须写死）

Stage3 的写入必须满足以下约束，否则必然出现：
- 重试导致 Neo4j/Qdrant 重复写入
- Neo4j 已写但 Qdrant 失败导致“部分写入”对外可见

**硬约束 A：每个节点/边/向量点必须有稳定幂等 key（可重算）**

推荐的幂等 key 形态（示例）：

- `turn` 级原文证据（Utterance/Evidence/Entry）：
  - `idempotency_key = tenant_id + session_id + turn_id`
- `event`（若按 turn 建 event）：
  - `idempotency_key = tenant_id + session_id + turn_id`
- `knowledge/fact`：
  - `idempotency_key = tenant_id + session_id + fact_hash`
  - `fact_hash` 必须由“规范化后的 statement + 来源 turn_id 列表 + subtype/layer”等确定性字段生成
- `edge`：
  - `idempotency_key = tenant_id + src_id + dst_id + rel_type + layer/kind`

> 关键原则：幂等 key 必须可由输入确定性重建；不得依赖数据库自增 id 或随机 UUID。

**硬约束 B：写入操作必须是 upsert/MERGE（禁止 insert-only）**

- Neo4j：节点/边必须使用 `MERGE`（或等价 upsert）按幂等 key 落库；不允许“每次重试新建一批 node/edge”。  
- Qdrant：point id 必须是稳定的（例如由幂等 key hash 得到），写入必须是 upsert；不允许用随机 UUID 作为 point id。

#### 7.3.2 “部分写入不可见”门闩（必须写死）

> 注意：即使你做了 upsert，仍可能出现“Neo4j 写成功但 Qdrant 失败”的物理部分写入。  
> 我们的对外承诺是“未成功完成 Stage3 前对外视为未写入”。这必须靠**可见性门闩**实现，而不是靠祈祷。

**门闩目标**

- 在 Stage3 完整成功前，任何新写入的数据对外检索/图查询都必须“不可见”（不可被 `/search`、Graph API 等召回）。

**推荐门闩实现（至少选一种，写死为实现要求）**

方案 1（推荐）：`published` / `ingest_status` 字段 + 查询强制过滤

- Neo4j：所有 Stage3 新写入的节点/边默认带：
  - `ingest_job_id=<job_id>`
  - `published=false`
- Qdrant：所有 Stage3 写入的向量点 payload 默认带：
  - `ingest_job_id=<job_id>`
  - `published=false`
- 对外读路径硬约束：
  - `/search` 必须强制过滤 `published=true`
  - Graph 查询接口（`/graph/v0/*`、`/graph/v1/*`）必须默认只返回 `published=true`（或提供显式 debug 参数才可看未发布数据）
- 当 Neo4j 与 Qdrant 均写入成功后，执行“发布步骤”：
  - Neo4j：一次性把该 job 写入的节点/边 `SET published=true`
  - Qdrant：对相关 points 做一次 payload patch（或重 upsert）把 `published=true`

方案 2：Staging/Prod 双集合（两阶段发布）

- Stage3 先写入 staging collection/label；成功后做“发布搬运/切换指针”。  
- 成本更高，但语义更干净；适用于后续规模化治理。

**失败与重试语义（对齐门闩）**

- Stage3 失败：允许存在 `published=false` 的“半成品”；它们必须对外不可见。  
- 重试 Stage3：必须复用相同幂等 key 进行 upsert，并最终完成 publish；不得产生多套半成品。

#### 7.3.3 requires_confirmation 的闭环（必须明确责任归属）

当 Stage2/Stage3 产生 `requires_confirmation=true` 的条目：

- 当前阶段（V0）硬约束：
  - 允许落库，但必须标记为“待确认”（例如 `status=pending_confirmation` 或等价字段），且默认不作为“硬事实”参与高置信推理。
  - Retrieval/Agent 侧应将其作为“需要用户确认”的提示信息，而不是直接当结论引用。
- 确认闭环的责任归属（V0）：
  - **由上游产品/Agent 负责**：在合适时机向用户发起确认，并在用户确认后调用记忆编辑接口（例如 `/update`）把该条目从 pending → confirmed（并可提升 evidence_level）。

> 说明：闭环的具体 UI/交互不属于本施工文档的实现范围，但“字段写进去没人管”是失败设计，因此必须明确 owner。

---

## 8. 幂等与增量提交（必须写死，否则必然污染）

### 8.1 幂等键

最小幂等边界：
- `tenant_id + session_id + turn_id`

规则：
- 同一 `turn_id` 若内容完全一致：重复提交视为 dedupe（不报错）
- 同一 `turn_id` 若内容不一致：视为数据损坏/上游 bug，返回 `409 conflict`

### 8.2 session cursor（服务端真实提交位置）

服务端必须维护：
- `cursor_committed`：该 session 已被“接收归档”的最大 turn_id（或最大序号）

用途：
- 客户端重开 session 时可用服务端 cursor 恢复增量位置

### 8.3 commit_id（可选但强烈建议）

客户端可传 `commit_id`（UUID）作为“本次提交幂等 id”：
- 服务端应保证：同一 `commit_id` 重复请求不产生新 job

---

## 9. 失败语义、重试与调度策略（直到成功）

### 9.1 失败时保留什么

- Stage2 失败：保留 Stage0 归档 turns
- Stage3 失败：保留 Stage0 + Stage2 产物（便于只重试 Stage3）

### 9.2 重试策略（建议）

默认：指数退避 + 上限间隔（例如 1min → 5min → 30min → 2h → 12h）。

> 你要求“直到成功”。工程上可以实现“无限重试”，但必须有两条护栏：
> - 记录 attempt_count 与 last_error，保证可观测  
> - 若连续失败超过阈值，进入 `PAUSED` 并告警（仍可人工恢复），避免无限烧钱/刷日志

### 9.3 失败分类（必须标准化）

至少区分：
- `timeout`
- `rate_limited`
- `schema_invalid`（Stage2 span 校验失败）
- `model_error`
- `backend_error`（Neo4j/Qdrant）

不同错误对应不同退避与告警级别。

---

## 10. 安全与合规（SaaS 必须考虑）

### 10.1 鉴权与写签名

由于 `/ingest/*` 属于写接口，建议与现有 `/write` 相同安全等级：
- 支持 token/jwt
- 支持写签名（HMAC）防重放与误写

### 10.2 归档缓存的数据治理

归档区存放的是“原始对话文本”，必须定义：
- 存储位置（数据库/对象存储/文件系统）
- 加密策略（at rest）
- 访问审计（谁读了归档）
- 归档 TTL（是否永久保留？是否按 tenant 策略）

---

## 11. 可观测性（上线后你靠什么运营）

必须打点（最低）：
- 每个 job 的 `stage2_latency_ms / stage3_latency_ms / attempts`
- `stage2_failed_total{reason=...}`、`stage3_failed_total{reason=...}`
- `jobs_completed_total`
- `archive_bytes_total`（归档体积）
- `retry_queue_depth`

必须在 job 状态中可见（对开发者/控制台）：
- 当前阶段
- 上一次错误原因
- 下次重试时间

---

## 12. MCP 关系（避免误解）

本节只回答一个问题：**MCP 在本方案里做什么、不做什么。**

### 12.1 边界结论（写死）

- MCP 的职责：为 LLM 提供“读/检索/查询”能力（例如 `memory.search`），以及业务侧工具调用（非记忆写入）。  
- MCP 不做：
  - 不负责把任意 trace/context dump 标准化成 turns（标准化在 SDK/编排层完成）。  
  - 不负责触发 ingest/commit（本方案的写入是系统级管线，不应交给 LLM 自主触发）。  

> 原因很简单：写入是高权限、高成本、可污染的数据操作，交给 LLM 工具调用等于把数据库写权限交给“概率模型”。

### 12.2 推荐的集成形态（编排层）

```
Agent Runtime
  ├─ 本地：append_turn(...) 累积 turns
  ├─ 会话关闭：SDK/HTTP 调用 /ingest/dialog/v1  (写入管线，非 MCP)
  └─ 推理时：MCP 工具调用 memory.search / graph.query (读路径)
```

### 12.3 本方案范围内的 MCP 写操作策略

- 本方案默认：**MCP 不涉及写操作**。  
- 未来如果要开放“治理型写”给 MCP（例如 `memory.confirm`、`memory.pin`），必须满足：
  - 强鉴权 + 强审计  
  - 明确的幂等键  
  - 受控的写入范围（只允许更新少量字段，不允许任意写图）
  - 默认关闭、按租户白名单开启

---

## 13. 验收清单（施工完成的定义）

### 13.1 SDK 验收

- 支持 append 四种 role（user/assistant/tool/system）
- commit 异步返回 job_id
- 支持会话重开增量提交（cursor 生效）
- 支持查询 job/session 状态

### 13.2 服务端验收

- `/ingest/dialog/v1` 接收 turns 并归档入队（必成）
- job 状态可查询（阶段、错误、重试）
- Stage2 span 校验严格执行
- Stage3 成功后才可见写入；失败不产生对外“写入成功”的假象
- 幂等：重复 turn 不重复写；冲突 turn 409

### 13.3 重试验收

- Stage2 失败会进入重试队列并按策略重试
- Stage3 失败会保留 Stage2 产物并重试 Stage3
