# 🧩 TKG-Graph-v0.2-EXTENSIONS

**版本**：v0.2  
**定位**：在 `TKG-Graph-v0.1-SCHEMA` 内核之上的**可选扩展层**，为“阶段 3：智能图构建与结构化回想”以及后续 TKG 视图提供事件时间线、语义共现与因果/审计能力，适用于视觉 + 文本等多模态事件。  
**前置依赖**：严格依赖并兼容 `TKG-Graph-v0.1-SCHEMA`，不得修改 v0.1 已有节点/边的语义。

> v0.2 只新增节点/边类型与可选属性，不改变 v0.1 的任何字段。实现可以选择只落地 v0.1；当需要事件时间线/因果/共现能力时，再引入本扩展。

---

## 1. 设计目标与约束

1. **事件时间线可显式建模**  
   - 在 `Event` 层建立可遍历的时间顺序（`NEXT_EVENT`），支撑“有时间顺序的事件链”和 TKG `(s,r,o,t)` 视图。

2. **语义共现与因果关系分层**  
   - 将“共现/关系/因果”作为高阶语义边，与 v0.1 的事实层严格区分：  
     - 事实层：`MediaSegment`, `Evidence`, `Entity`, `Event` 及其 v0.1 边；  
     - 语义层：`CO_OCCURS_WITH`, `CAUSES` 等概率性/解释性边。

3. **可审计的高层节点与边**  
   - 所有高层关系都必须可追溯到底层 Evidence/Segment：  
     - 通过 `SUPPORTED_BY` 边挂证据；  
     - 通过 `source`/`model_version` 等属性记录生成来源。

4. **兼容性与渐进式启用**  
   - v0.2 是**增量扩展**：  
     - 新节点/边仅增加，不移除、不重命名旧类型；  
     - 所有新增属性必须为可选，不破坏旧查询。

---

## 2. 新增节点类型（Nodes）

v0.2 只新增 1 类可选节点：`TimeSlice`。其它扩展全部通过新关系类型实现。

### 2.1 `TimeSlice` —— 逻辑时间片（可选）

**语义**：  
- 表示一个逻辑时间区间，用于：  
  - 把多个 `MediaSegment`/`Event` 聚合成更粗粒度的时间块；  
  - 为 TKG/分析任务提供时间离散化单元。  
- 不用于逐帧建模，**禁止以帧级粒度批量创建 TimeSlice**。

**典型使用场景**：  
- 每小时/每天一个 TimeSlice，用于统计/检索；  
- 某次“会话/活动”的整体时间段。

**标签**：`TimeSlice`

**必选属性**：
- `id: UUID`  
  - TimeSlice 唯一标识。  
- `tenant_id: string`
- `kind: enum("physical","media","logical")`  
  - `"physical"`：以绝对时间表示，如一天/一小时；  
  - `"media"`：以媒体内部时间表示，如某段剪辑时间窗；  
  - `"logical"`：如“某次会议”“某场活动”，时间边界由上层逻辑定义。

**可选属性**：
- `t_abs_start: datetime | null`  
- `t_abs_end: datetime | null`  
- `t_media_start: float | null`  
- `t_media_end: float | null`  
- `time_origin: enum("physical","media","ingestion","predicted") | null`  
- `granularity_level: int | null`  
  - 可用于表示粗细（如 0=5 秒，1=分钟，2=小时等）。

**约束与建议**：
- `TimeSlice` 不替代 `MediaSegment`/`Event` 的时间属性，仅作为**聚合/索引节点**。  
- 推荐每个 tenant 控制 TimeSlice 总量在可控规模（如按天/小时），禁止对每个 Segment/帧创建独立 TimeSlice。

---

## 3. 新增边类型（Edges）

v0.2 在 v0.1 的边基础上新增 5 类关系，用于事件时间线、共现、因果与审计。

### 3.1 `NEXT_EVENT` —— 事件时间顺序

**模式**：  
- `(:Event)-[:NEXT_EVENT {kind, source, confidence}]->(:Event)`

**语义**：  
- 表示在特定上下文中的事件时间顺序：  
  - 比如同一人物的行为序列、同一场景中的事件链，或同一对话 session 中的文本事件序列；  
- 区分“观测到的先后”（基于时间戳）与“逻辑上的紧邻”（经过算法裁剪）。

**属性**：
- `kind: enum("observed","derived")`  
  - `"observed"`：直接按 `t_abs_start` 排序得到的相邻事件；  
  - `"derived"`：经过算法/规则筛选出的“语义上紧邻”的事件。  
- `source: string | null`  
  - 如 `"timeline-builder-v1"`, `"vlm-sequence-v2"`。  
- `confidence: float | null`  
  - 对于 `"derived"` 类型，给出 [0,1] 置信度；`"observed"` 可为空或 1.0。  
- `layer: enum("fact","semantic") | null`  
  - 建议 `"observed"` 记为 `"fact"`，`"derived"` 记为 `"semantic"`。

**约束**：  
- 两端 `Event` 必须同一 `tenant_id`。  
- 不要求全局唯一链，可存在多条平行时间线（不同人物、视角）。

---

### 3.2 `CO_OCCURS_WITH` —— 实体共现关系

**模式**：  
- `(:Entity)-[:CO_OCCURS_WITH {scope, weight, first_seen_at, last_seen_at}]->(:Entity)`

**语义**：  
- 表示两个实体在某种上下文中“经常一起出现”：  
  - 如同一房间、同一事件、同一片段或同一对话/消息片段中频繁共现。  
- 主要服务于：  
  - 关系发现（谁和谁关系密切）；  
  - 下游图算法（社区发现、人物关系图等）。

**属性**：
- `scope: enum("segment","event","slice")`  
  - 共现统计的上下文粒度：片段级/事件级/TimeSlice 级。  
- `weight: float`  
  - 共现强度，可为归一化频率或 PMI 等。  
- `first_seen_at: datetime | null`  
- `last_seen_at: datetime | null`
- `layer: enum("semantic") | null`（推荐固定为 `"semantic"`）

**约束**：  
- 该边通常按无向关系对待，实现时可用双向边或在查询时视为无向。  
- 只作为高层统计/语义近邻，**不得被当作硬事实边**。

---

### 3.3 `CAUSES` —— 事件因果假设

**模式**：  
- `(:Event)-[:CAUSES {source, confidence, status, layer}]->(:Event)`

**语义**：  
- 表示“事件 A 可能导致了事件 B”的因果假设或结论。  
- 对应理论文档中的因果链与 CI（Causal Integrity）度量。

**属性**：
- `source: string`  
  - 生成来源，如 `"tkg-model-v1"`, `"rule-engine-v2"`, `"human-annotation"`。  
- `confidence: float`  
  - 因果置信度 [0,1]。  
- `status: enum("candidate","accepted","rejected")`  
  - `"candidate"`：模型/规则生成的候选因果；  
  - `"accepted"`：经人工/高阈值验证通过的因果；  
  - `"rejected"`：经验证被否决，但保留用于分析。  
- `layer: enum("hypothesis","fact")`  
  - `"hypothesis"` 对应 `"candidate"`；  
  - `"fact"` 仅用于非常慎重的 accepted 边。

**约束与使用建议**：
- 默认所有 `CAUSES` 边在查询和在线 API 中应视为**“二等公民”**：  
  - 高风险/审计场景默认不使用，除非显式开启。  
  - 在线服务可提供参数控制是否纳入因果边计算。  
- 评估指标中的 `CausalPrecision` 应基于 `status="accepted"` 边。

---

### 3.4 `SUPPORTED_BY` —— 高层节点的证据引用

**模式**：  
- `(:Event)-[:SUPPORTED_BY]->(:Evidence)`  
- `(:Entity)-[:SUPPORTED_BY]->(:Evidence)`

**语义**：  
- 表示某高层节点（事件/实体）的一个直接证据来源，用于审计与可解释性：  
  - Event 的 SUPPORTED_BY Evidence 可以是关键帧、关键轨迹、语音片段或关键 TextEvidence（某句话、某个事实性描述）；  
  - Entity 的 SUPPORTED_BY Evidence 通常是典型人脸、物体视角或典型文字提及（名字、描述语句等）。

**属性**：
- 可选：`role: string | null`（如 `"primary"`, `"auxiliary"`）  
- 可选：`source: string | null`（说明是哪个步骤挂上去的）

**约束**：  
- 不改变 v0.1 中 Evidence/Entity/Event 的任何属性，仅增加引用边。  
- SUPPORTED_BY 边可用于 UI 回放、审计追踪与 STF/CI 评估。

---

### 3.5 `COVERS_SEGMENT` / `COVERS_EVENT` —— TimeSlice 覆盖关系（可选）

**模式**：  
- `(:TimeSlice)-[:COVERS_SEGMENT]->(:MediaSegment)`  
- `(:TimeSlice)-[:COVERS_EVENT]->(:Event)`

**语义**：  
- 表示某 TimeSlice 覆盖的一组片段/事件，用于：  
  - 快速按粗粒度时间段检索相关内容；  
  - 作为 TKG 快照视图构造的基础（按 TimeSlice 聚合事件）。

**约束**：  
- `TimeSlice` 与其覆盖对象的时间区间应存在交集。  
- 不要求完备覆盖，同一 Segment/Event 可以属于多个 TimeSlice（如“当天”和“本周”）。

---

## 4. 边分层语义（Edge Layering）

v0.2 引入 `layer` 属性以表达边的“语义层级”，推荐约定如下：

- `layer = "fact"`  
  - 直接来自时间/拓扑结构的确定性关系（如 `NEXT_SEGMENT`、`NEXT_EVENT(kind="observed")`）。  
- `layer = "semantic"`  
  - 来自 VLM/规则等对事实的语义抽象（如 `CO_OCCURS_WITH`、`NEXT_EVENT(kind="derived")`）。  
- `layer = "hypothesis"`  
  - 明确为预测/假设性关系（如 `CAUSES(status="candidate")`）。

**查询建议**：  
- 图查询/回想 API 应允许按 `layer` 过滤：  
  - 审计/严谨分析：只使用 `layer="fact"`；  
  - 语义浏览：可加入 `"semantic"`；  
  - 探索/推荐：可选使用 `"hypothesis"`。

---

## 5. TKG 视图导出约定（与阶段 7 的关系）

在 `TKG-Graph-v0.1` + 本扩展的基础上，可以构造标准 TKG 四元组视图 `(s, r, o, t)`：

1. **事件序列视图**：  
   - 源：`(:Event)-[:NEXT_EVENT]->(:Event)`  
   - `s = event_id_1`, `r = "NEXT_EVENT"`, `o = event_id_2`,  
   - `t = event_1.t_abs_start` 或离散化后的时间步。

2. **因果视图**：  
   - 源：`(:Event)-[:CAUSES]->(:Event)`  
   - `s = event_cause`, `r = "CAUSES"`, `o = event_effect`,  
   - `t` 可取 `event_cause.t_abs_end` 或 TimeSlice 中心。  
   - 只建议对 `status="accepted"` 或置信度过阈值的边导出。

3. **共现视图**：  
   - 源：`(:Entity)-[:CO_OCCURS_WITH]->(:Entity)`  
   - `s = entity_a`, `r = "CO_OCCURS_WITH"`, `o = entity_b`,  
   - `t` 可取 `first_seen_at` 或 `last_seen_at`。

> 注：以上为推荐映射，不影响底层存储，TKG 模型训练/服务以此视图为输入即可，无需改动核心图结构。

---

## 6. 迁移与兼容性

1. **对已有 v0.1 数据**：  
   - 不需要做任何结构性迁移；  
   - 可增量为已有 Event/Entity/Segment 创建 v0.2 边与 TimeSlice 节点。

2. **对 v0.1 查询与服务**：  
   - 现有仅基于 v0.1 节点/边的查询无需修改；  
   - 若新查询使用 `layer` 属性，应确保对不存在该属性的边设置默认行为（如视为 `"fact"`）。

3. **演进策略**：  
   - 建议先在小规模数据/特定租户上启用 v0.2 扩展，评估：  
     - `NEXT_EVENT` 质量对回想 API 的贡献；  
     - `CO_OCCURS_WITH` 在关系发现上的效果；  
     - `CAUSES` 边的 `CausalPrecision`。  
   - 达到预期后，再逐步扩大覆盖面。

本扩展文档与 `TKG-Graph-v0.1-SCHEMA` 一起，构成当前阶段（1–3 阶段）的完整图结构规范：  
- v0.1 负责**时间轴 + 多租户 + 事实层**；  
- v0.2 负责**事件时间线 + 语义共现 + 因果/审计层**。

---

## 7. 实现验收标准（Acceptance Criteria）

v0.2 扩展在工程上的“完成”至少需满足以下可验证条件：

1. **事件时间线（NEXT_EVENT）落地**  
   - 在至少一个示例数据集上：  
     - 对同一人物或同一场景的事件，系统能自动生成 `NEXT_EVENT(kind="observed")` 链表，顺序与 `Event.t_abs_start` 一致；  
     - `/entity_timeline` 或等价 API 能基于 `INVOLVES` + `NEXT_EVENT` 返回有序事件序列，并通过测试用例验证顺序正确。

2. **共现与因果边生成与隔离**  
   - 共现：  
     - 系统能基于 Segment/Event/TextEvidence 生成 `CO_OCCURS_WITH` 边，并在至少一个测试场景中反映出“关系紧密的实体对”；  
     - 对 `CO_OCCURS_WITH` 边，`layer` 字段在落库时统一标记为 `"semantic"`，查询层可按 `layer` 过滤。  
   - 因果：  
     - 至少一个模块（规则/模型/人工标注）能生成 `CAUSES(status="candidate")` 边，并通过 API/脚本导出；  
     - 高风险场景默认不使用 `CAUSES`，需通过配置显式开启，相关测试用例覆盖这一行为。

3. **审计追溯与跨模态证据绑定（SUPPORTED_BY）**  
   - 对选定的 Event/Entity：  
     - 至少有一条 `SUPPORTED_BY` 指向视觉 Evidence（关键帧/轨迹等）或文本 Evidence（关键 utterance/事实描述）；  
     - 前端或调试接口可通过 `SUPPORTED_BY` 链路回放/展示原始证据，验证链路正确。  
   - STF/CI 的离线评测脚本可基于 `SUPPORTED_BY` 边获取必要的证据信息。

4. **TimeSlice 聚合与 TKG 视图导出**  
   - 系统能在至少一个 tenant 上：  
     - 创建一批粗粒度 `TimeSlice`（如按天/小时或对话 session），并通过 `COVERS_SEGMENT`/`COVERS_EVENT` 连接对应 Segment/Event；  
     - 提供一个导出接口或脚本，将图中的 `Event`/`Entity`/关系边投影为标准 TKG 四元组 `(s,r,o,t)`，并在小规模数据集上完成一次训练/推理 PoC。  
   - 所有新增节点/边类型在多租户约束下正确运行（`tenant_id` 一致，有测试覆盖）。
