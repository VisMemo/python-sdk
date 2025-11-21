# 🏗️ TKG-Graph-v0.1-SCHEMA

**版本**：v0.1  
**定位**：时空知识记忆系统（多模态记忆子系统，当前以视觉 + 文本为主）的**唯一图谱 Schema 锚点**，用于所有图存储与图算法的建模依据。  
**适用范围**：  
- 图数据库层（Neo4j 等）的节点/边类型与属性约束；  
- 图相关服务（写入、查询、聚类、事件生成）的数据契约；  
- 后续 TKG / STKG 理论实现的最小内核，不含高阶本体与模式挖掘。

> 本文档只定义 **v0.1 内核 Schema**，不覆盖所有未来扩展。任何与本规范不兼容的图结构视为实现缺陷，必须经架构评审后方可修改。

---

## 1. 设计原则（Design Principles）

1. **时间轴为骨架**  
   - 所有节点必须可追溯到媒体时间（Media Time），如有条件再映射为物理时间（Absolute Time）。  
   - 时间语义与《系统讨论_需求与方案总结.md》中 Time Axis v1 保持一致。

2. **Clip 为锚点**  
   - `MediaSegment` 是连接感知与认知的最小物理单元：  
     - 向下挂原始检测证据；  
     - 向上被事件节点进行语义总结。

3. **证据与身份分离**  
   - 检测结果（Evidence）**不可变**；  
   - 聚类身份（Entity）**可演化**，但不允许直接修改证据。

4. **多租户强隔离**  
   - 所有节点与边都带 `tenant_id`，**禁止跨租户建边**。  
   - 租户信息仅由服务端注入，客户端不可指定。

5. **Schema First & Backward Compatible**  
   - 所有图相关代码必须以本 Schema 为唯一来源，不得私自扩展核心节点/边。  
   - 对外 API 的兼容性以本 Schema 为准：不允许破坏现有字段语义。

---

## 2. 节点类型（Nodes）

v0.1 定义 5 种核心节点类型，所有图结构必须由这 5 类节点组合而成。  
如需扩展其它节点（如 Pattern、TimeSlice 实体化等），必须通过新增标签且**不得改变本节定义的字段语义**。

### 2.1 `MediaSegment` —— 媒体片段 / Clip

**语义**：  
- 媒体流中一段连续片段，是**所有视觉证据与事件的时间锚点**。  
- 时序链表（通过 `NEXT_SEGMENT`）构成媒体级时间轴。

**标签**：`MediaSegment`

**必选属性**：
- `id: UUID`  
  - 片段唯一标识，图内主键。  
  - 不随任何重算/聚类改变。
- `tenant_id: string`  
  - 多租户隔离标识。  
  - 所有与本节点相连的节点/边必须具有相同 `tenant_id`。
- `source_id: string`  
  - 媒体源标识（文件名/流 ID 等）。  
  - 在 `(tenant_id, source_id, t_media_start, t_media_end)` 上推荐建唯一约束。
- `t_media_start: float`  
  - 媒体内部起始时间（秒）。
- `t_media_end: float`  
  - 媒体内部结束时间（秒），必须满足 `t_media_end > t_media_start`。
- `recorded_at: datetime | null`  
  - 媒体录制起始物理时间：  
    - 若未知则为 `null`，并配合 `has_physical_time=false`。
- `has_physical_time: bool`  
  - 是否可以可信地映射为物理时间。  
  - `true` 表示 `recorded_at` 有意义；`false` 表示仅能使用媒体时间。
- `time_origin: enum("physical","media","ingestion")`  
  - 时间来源：  
    - `"physical"`：来自设备/外部可信时间源；  
    - `"media"`：仅为媒体内部逻辑时间；  
    - `"ingestion"`：由服务端写入时间近似代表。

**可选属性**：
- `duration_seconds: float`（冗余存储，等于 `t_media_end - t_media_start`）  
- `vector_id: string | null`（指向 Qdrant 中该片段的 clip 向量）  
- `thumbnail_ref: string | null`（指向缩略图/关键帧对象存储路径）
- `modality: enum("video","audio","text","mixed") | null`  
  - 片段主模态类型：  
    - `"video"`：视频/图像片段；  
    - `"audio"`：纯音频；  
    - `"text"`：对话/日志等文本会话片段；  
    - `"mixed"`：多模态复合片段。  
  - 文本记忆接入时，推荐将一个对话 session 映射为一系列 `MediaSegment(modality="text")`。

**不可变性约束**：  
- 一旦写入，`tenant_id`、`id` 不可修改。  
- `t_media_start/end` 一经确定，仅允许通过离线迁移脚本批量调整，不允许线上随意更新。

---

### 2.2 `Evidence` —— 原始检测证据

**语义**：  
- 从 `MediaSegment` 中直接检测出的原始结果（人脸、物体、轨迹、语音片段等）。  
- 是图中最底层的“事实单元”，只反映“检测到了什么”，不做 ID/因果推断。

**标签**：至少包含 `Evidence`，可叠加子类型标签：  
- 视觉/音频：`FaceEvidence` / `ObjectEvidence` / `VoiceEvidence` / `OCREvidence` / `TrackEvidence` 等；  
- 文本：`TextEvidence`（对话/日志中的片段或事实）。

**必选属性**：
- `id: UUID`  
  - 证据唯一标识，图内主键。
- `tenant_id: string`
- `source_id: string`  
  - 对齐所在媒体源（通常与其所属 `MediaSegment.source_id` 一致）。
- `algorithm: string`  
  - 算法名称，如 `"yolov8"` / `"face-det-v1"`。
- `algorithm_version: string`  
  - 算法版本，如 `"yolov8-2024.10"`。
- `confidence: float`  
  - [0,1] 之间的检测置信度。
- `embedding_ref: string | null`  
  - 指向向量库中该证据特征向量的引用（可为空）。
- `bbox: string | null`  
  - JSON 字符串，表示 `[x, y, w, h]` 或多边形；  
  - 对于纯文本证据（`TextEvidence`），可为空。
- `offset_in_segment: float | null`  
  - 证据在对应 `MediaSegment` 内的时间偏移（秒）。  
  - 若为跨帧轨迹，可为起点或代表时间；  
  - 对文本证据，可表示相对会话起点的时间或消息序号映射。

**文本证据可选属性（`TextEvidence`）**：
- `text: string | null`  
  - 原始文本或片段内容（必要时可截断/摘要）。  
- `utterance_id: string | null`  
  - 指向上层对话/消息 ID，用于回放。  
- `span_start: int | null`  
  - 在 `utterance` 或会话中的起始位置（字符/Token 索引）。  
- `span_end: int | null`  
  - 在 `utterance` 或会话中的结束位置。

**不可变性约束**：  
- 除少数技术性修正（如回填 `embedding_ref`）外，`Evidence` 节点视为**只读**：  
  - 不允许修改 `tenant_id`、`source_id`、`algorithm*`、`bbox`、`offset_in_segment` 等字段。  
  - 算法升级产生的新结果应以新 Evidence 节点表示，而非覆盖旧节点。

---

### 2.3 `Entity` —— 聚类身份 / 逻辑实体

**语义**：  
- 对多个 `Evidence` 的逻辑聚合，代表系统认为属于同一“人/物/地点”的实体。  
- ID 是**聚类结果**，**不是物理世界绝对真值**，允许随时间演化。

**标签**：`Entity`

**必选属性**：
- `id: UUID`  
  - 实体内部稳定标识符（主键）。**不得复用，不得重写。**
- `tenant_id: string`
- `type: enum("PERSON","OBJECT","PLACE","OTHER")`

**可选属性**：
- `cluster_label: string | null`  
  - 聚类标签，如 `"person_cluster_001"`；可由聚类算法更新。  
  - 与 `id` 不同，可以发生变化。
- `manual_name: string | null`  
- `created_at: datetime`  
- `updated_at: datetime`

**演化约束**：
- 合并/拆分实体时：  
  - 不得修改历史 `Evidence` 节点；  
  - 通过增删 `BELONGS_TO_ENTITY` 边实现重新归属；  
  - 如需表达“某实体被合并”，可新增可选边 `(:Entity)-[:EQUIV_TO {reason,...}]->(:Entity)`，但不得删主键节点。

---

### 2.4 `Event` —— 逻辑事件

**语义**：  
- 对一个或多个 `MediaSegment` 的语义总结，是“发生了什么”的最小逻辑单元。  
- 既用于表示视觉事件（来自视频/音频片段），也用于表示文本事件（会话级摘要、事实抽取等）；  
- 与 STKG 理论中的事件节点对应，但 v0.1 保持轻量。

**标签**：`Event`

**必选属性**：
- `id: UUID`
- `tenant_id: string`
- `summary: string`  
  - 自然语言描述，如 `"男人在厨房倒水"`。
- `t_abs_start: datetime | null`  
- `t_abs_end: datetime | null`

**时间语义约束**：
- 若相关 `MediaSegment.has_physical_time=true`：  
  - 则 `t_abs_start/end` 应由参与片段的 `recorded_at + t_media_*` 聚合获得。  
- 若不存在可信物理时间：  
  - `t_abs_start/end` = `null`，仅通过关联 `MediaSegment` 的媒体时间进行排序。

**可选属性**：
- `time_origin: enum("physical","media","predicted")`  
  - `"predicted"` 用于未来 TKG 模块写入的预测事件。  
- `importance: int | null`（用于记忆经济学/TTL 策略）  
- `source: string | null`（如 `"vlm-v1"` / `"rule-step-3"`）

---

### 2.5 `Place` —— 空间位置（可选）

**语义**：  
- 表示一个具有语义意义的地点，如“厨房”“客厅 A”“办公室 3F”。  
- v0.1 仅定义非常朴素的属性，后续空间本体扩展通过新增属性/节点实现。

**标签**：`Place`

**必选属性**：
- `id: UUID`
- `tenant_id: string`
- `name: string`

**可选属性**：
- `geo_location: string | null`（如 `"lat,lon"` 或 JSON）  
- `floor: string | null`  
- `area_type: string | null`（如 `"kitchen"`, `"office"`, `"corridor"`）

---

## 3. 边类型（Edges）

所有边必须满足：  
- 两端节点的 `tenant_id` 完全相同；  
- 不允许在两个不同租户间创建任何边。

### 3.1 `NEXT_SEGMENT` —— 媒体时间链

**模式**：  
- `(:MediaSegment)-[:NEXT_SEGMENT]->(:MediaSegment)`

**语义**：  
- 表示同一媒体源内的时间顺序：  
  - 出度 ≤ 1，入度 ≤ 1（每个片段最多有一个前驱/后继）。  
  - 仅在 `source_id` 相同的片段间建立。

**约束**：
- 逻辑上应满足：  
  - `a.t_media_end <= b.t_media_start + ε`（允许少量重叠/间隙）。  
- 不要求强连通（允许片段缺失，中间断链）。

---

### 3.2 `CONTAINS_EVIDENCE` —— 证据挂载

**模式**：  
- `(:MediaSegment)-[:CONTAINS_EVIDENCE]->(:Evidence)`

**语义**：  
- 表示某证据来自该媒体片段。  
- 证据与片段的时间对齐通过 `offset_in_segment` + `t_media_start` 实现。

**约束**：  
- 边两端 `tenant_id` 必须一致。  
- `Evidence.source_id` 应与 `MediaSegment.source_id` 一致。

---

### 3.3 `BELONGS_TO_ENTITY` —— 证据归属实体

**模式**：  
- `(:Evidence)-[:BELONGS_TO_ENTITY {confidence: float}]->(:Entity)`

**语义**：  
- 表示该证据被当前聚类逻辑归为某个实体的证据之一。

**属性**：
- `confidence: float`  
  - 归属置信度 [0,1]。

**约束**：  
- 可存在多个 `BELONGS_TO_ENTITY` 边指向不同 `Entity`，但实现中应尽量保持稀疏。  
- 聚类策略升级时，仅允许**增删此类边**，不得修改 Evidence 内容。

---

### 3.4 `SUMMARIZES` —— 事件总结片段

**模式**：  
- `(:Event)-[:SUMMARIZES]->(:MediaSegment)`

**语义**：  
- 表示事件对一个或多个媒体片段的语义总结。  
- 支持一个事件跨多个片段，也支持多个事件总结同一片段（不同视角）。

**约束**：  
- 事件的时间区间应与所有关联 `MediaSegment` 的时间区间存在交集。

---

### 3.5 `INVOLVES` —— 实体参与事件

**模式**：  
- `(:Entity)-[:INVOLVES {role: string | null}]->(:Event)`

**语义**：  
- 表示某实体参与了该事件，可选记录角色（如 `"speaker"`, `"listener"`, `"object"`）。

**约束**：  
- `role` 白名单可由业务层约定，Schema 不做强约束。  
- 实体参与关系的依据应可追溯到相关 Evidence（通过 `BELONGS_TO_ENTITY` + `CONTAINS_EVIDENCE`）。

---

### 3.6 `OCCURS_AT` —— 事件发生地点（可选）

**模式**：  
- `(:Event)-[:OCCURS_AT]->(:Place)`

**语义**：  
- 表示事件发生的大致地点。  
- v0.1 不强制要求所有事件必须有地点。

---

## 4. 多租户与安全约束

1. **节点级约束**：  
   - 所有核心节点必须包含 `tenant_id` 属性。  
   - 图数据库层建议对 `(label, tenant_id, id)` 建立联合索引。

2. **边级约束**：  
   - 任何边两端节点的 `tenant_id` 必须一致。  
   - 在写入 adapter 中强制校验，不满足则拒绝写入。

3. **查询约束**：  
   - 任何图查询 API 都不得由客户端直接传入 `tenant_id`：  
     - `tenant_id` 由 API Key / 认证中间件解析注入；  
     - 所有 Cypher 查询模板必须包含 `WHERE n.tenant_id = $tenant_id` 之类条件。

---

## 5. 与存储/服务的映射约定

### 5.1 Neo4j

- 所有节点按本 Schema 进行标签与属性定义。  
- 建议索引/约束示例：  
  - `CREATE CONSTRAINT media_id IF NOT EXISTS FOR (s:MediaSegment) REQUIRE s.id IS UNIQUE;`  
  - `CREATE INDEX media_tenant_time IF NOT EXISTS FOR (s:MediaSegment) ON (s.tenant_id, s.recorded_at);`  
  - `CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE;`  
  - 其余索引按查询模式补充。

### 5.2 Qdrant

- `MediaSegment.vector_id` 用于指向 Qdrant 中 clip 级向量。  
- Payload 至少包含：`tenant_id`, `segment_id`, `source_id`, `t_media_start`, `t_media_end`。  
- 所有向量检索必须在 Payload 级别加 `tenant_id` 过滤。

---

## 6. 版本与演进策略

1. **版本号语义**：  
   - `v0.1`：仅包含本文件定义的 5 个节点类型与 6 种边类型。  
   - 后续版本（如 `v0.2`）若新增核心节点/边，必须在文档顶部标明，并提供迁移策略。

2. **兼容性原则**：  
   - 禁止更改现有字段的数据类型与语义。  
   - 新增字段必须为可选（带默认值），不得破坏旧数据与旧查询。

3. **扩展节点/边**：  
   - 如需引入 `TimeSlice`、`Pattern`, `CausalEdge` 等高阶概念：  
     - 必须使用新标签或新关系类型；  
     - 不得修改本文件中已有节点/边的语义；  
     - 需要在单独的扩展文档中定义清晰的数据契约。

---

## 7. MVP 实现建议（非强制）

为保证实现收敛，推荐 v0.1 优先实现以下最小闭环：

1. **仅使用以下节点/边：**  
   - 节点：`MediaSegment`, `Evidence`, `Entity`  
   - 边：`NEXT_SEGMENT`, `CONTAINS_EVIDENCE`, `BELONGS_TO_ENTITY`

2. **基础能力闭环：**  
   - 视频 → 切片 → 写入 `MediaSegment` + `NEXT_SEGMENT`；  
   - 检测 → 写入 `Evidence` + `CONTAINS_EVIDENCE`；  
   - 简单聚类 → 写入 `Entity` + `BELONGS_TO_ENTITY`；  
   - 基于 `tenant_id + 时间 + clip 相似度` 提供基础搜索服务。

3. **随后再引入：**  
   - `Event` + `SUMMARIZES` + `INVOLVES`；  
   - `Place` + `OCCURS_AT`；  
   - 更复杂的 TKG/预测模块。

本 Schema 一经落地，后续所有图相关设计与实现，应以本文件为“头文件”，一切讨论先对齐这里，再谈算法与工程细节。

---

## 8. 实现验收标准（Acceptance Criteria）

为便于分工与验收，v0.1 Schema 在工程上的“完成”至少需满足以下可验证条件：

1. **时间轴与多租户约束**  
   - 任意写入的 `MediaSegment`：  
     - 必须包含：`id`, `tenant_id`, `source_id`, `t_media_start`, `t_media_end`, `has_physical_time`, `time_origin` 字段；  
     - 同一 `source_id` 下，相邻片段应通过 `NEXT_SEGMENT` 形成时间链（允许中间断链），且 `tenant_id` 一致。  
   - 任意图查询 API：  
     - 在 Adapter 层自动注入 `tenant_id` 过滤，客户端无法跨租户访问节点或边（可通过构造多租户测试数据验证）。

2. **Evidence / Entity 层实现与不可变性**  
   - 新增检测结果写入时：  
     - `Evidence` 节点满足本 Schema 的必选字段，并通过 `CONTAINS_EVIDENCE` 连接到对应 `MediaSegment`；  
     - 代码层面对 `Evidence` 做“只追加不更新”约束（除技术性回填外），有相应单元测试覆盖。  
   - 聚类/实体解析逻辑：  
     - 通过创建/更新 `Entity` 节点与 `BELONGS_TO_ENTITY` 边来表达归属关系；  
     - 聚类策略更新仅增删 `BELONGS_TO_ENTITY`，不直接修改历史 Evidence 内容。

3. **多模态基础打通（视觉 + 文本骨架）**  
   - 系统能够 ingest：  
     - 至少一种视觉流（video/image）→ 生成 `MediaSegment(modality="video")` 与对应视觉 Evidence；  
     - 至少一种文本会话（dialog/log）→ 生成 `MediaSegment(modality="text")` 与至少一种 `TextEvidence`（包含 `text` 与 `utterance_id`）。  
   - 不论模态，所有 Evidence 最终都可以通过 `BELONGS_TO_ENTITY` 关联到统一的 `Entity`，实现跨模态身份统一。

4. **最小查询能力**  
   - 提供并通过测试的基础查询：  
     - 按时间范围 + `tenant_id` 检索 `MediaSegment`（支持 `modality` 过滤）；  
     - 查询某 `Entity` 在时间轴上的所有出现（通过 Evidence → Segment 链路），返回有序时间点或片段列表。  
   - 以上查询均通过 Neo4j 层的实际执行结果验证。
