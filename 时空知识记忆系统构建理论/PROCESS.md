# PROCESS.md — 时空知识记忆系统构建理论

**本周期**：TKG 图谱 Schema v0.1 定义 & v0.2 扩展设计 & 文本模态预留  
**日期**：2025-11-20  

---

## 1. 本周期工作内容（v0.1）

1. 在 `docs/时空知识记忆系统构建理论` 目录下新增 `TKG-Graph-v0.1-SCHEMA.md`：  
   - 明确定义 v0.1 核心图谱 Schema：  
     - 节点：`MediaSegment`, `Evidence`, `Entity`, `Event`, `Place`；  
     - 边：`NEXT_SEGMENT`, `CONTAINS_EVIDENCE`, `BELONGS_TO_ENTITY`, `SUMMARIZES`, `INVOLVES`, `OCCURS_AT`。  
   - 写死多租户约束（`tenant_id` 必须一致，禁止跨租户建边）。  
   - 对时间语义对齐 Time Axis v1：`recorded_at`, `has_physical_time`, `time_origin`, `t_media_*`, `t_abs_*`。  
   - 明确“证据不可变、实体可演化”的约束，以及聚类演化仅通过边更新实现。

2. 将 Neo4j/Qdrant 存储层与 Schema 对齐：  
   - 给出建议约束和索引（MediaSegment.id 唯一、(tenant_id, recorded_at) 索引等）。  
   - 约定 Qdrant payload 至少包含 `tenant_id`, `segment_id`, `source_id`, `t_media_*`。

3. 设计 v0.1 MVP 的最小闭环：  
   - 先只实现 `MediaSegment + Evidence + Entity` 三类节点及其三种边，保证时间轴 + 证据 + 聚类闭环可跑。  
   - `Event`/`Place` 以及更高阶 TKG/预测推理留待后续迭代。

---

## 2. 测试与验证（v0.1）

本周期主要为 Schema 设计与文档工作，未引入具体代码实现，但进行如下验证：

1. **一致性自检**：  
   - 对照现有文档：  
     - 《系统讨论_需求与方案总结.md》中的 Time Axis v1、多租户与 API 设计；  
     - 《视觉记忆基础设施_发展路径规划.md》的阶段 1–3；  
     - 《时空知识图谱的本体论与信息论基础.md》中关于事件/实体/时间建模的核心思想。  
   - 确认本 Schema 中的节点/边与上述文档存在一一对应的映射，且未引入额外高阶原语。

2. **可实施性推演**：  
   - 推演从“视频 ingest → 切片 → 写 MediaSegment/向量 → 检测 Evidence → 聚类 Entity”的完整链路，确认：  
     - 所有必需字段在 Schema 中均有落点；  
     - 聚类策略升级/回滚仅需变更 `BELONGS_TO_ENTITY` 边，不影响 Evidence 与 Segment。  
   - 推演基础查询：  
     - 按时间范围检索片段；  
     - 查看某 Entity 的出现时间轴；  
     - 基于向量召回 Segment 再映射到 Evidence/Entity。

---

## 3. 与总体目标的对齐评估（v0.1）

- **与理论目标对齐**：  
  - 时间作为一等公民：通过 `MediaSegment` 的 `t_media_*`、`recorded_at`、`has_physical_time`、`time_origin` 与 `Event.t_abs_*` 建立统一时间轴。  
  - 证据与 ID 分离：严格区分 `Evidence` 与 `Entity`，满足“可审计的事实层 + 可演化的身份层”的设计哲学。

- **与工程规划对齐**：  
  - 对应《视觉记忆基础设施_发展路径规划.md》中的阶段 1–3，为 Time Axis、多租户与智能图构建提供统一图结构锚点。  
  - 为后续容器化、CI/CD 与 TKG 扩展保留足够空间，同时保证 v0.1 内核精简且稳定。

- **结论**：  
  - 当前 Schema 设计满足作为 v0.1 工程锚点的要求，可指导后续图数据库建模与相关服务实现。  
  - 后续若需扩展高阶时态逻辑/模式挖掘，建议以本文件为基础，新增扩展文档而非修改现有定义。

---

## 4. 本周期新增工作内容（v0.2 & 文档关系）

1. 新增 `TKG-Graph-v0.2-EXTENSIONS.md`：  
   - 在 v0.1 核心 Schema 之上定义扩展层：  
     - 新增节点：`TimeSlice`（用于时间聚合与 TKG 视图构造，明确限制其为粗粒度逻辑时间片）；  
     - 新增边：`NEXT_EVENT`, `CO_OCCURS_WITH`, `CAUSES`, `SUPPORTED_BY`, `COVERS_SEGMENT`, `COVERS_EVENT`；  
     - 引入 `layer` 属性区分事实层/语义层/假设层，支持按层过滤查询。  
   - 明确这些扩展与发展路径规划中阶段 3/阶段 7 的对应关系，以及与 v0.1 的兼容性与迁移策略。

2. 新增目录级 `README.md`：  
   - 统一说明本目录下各文档的角色：理论层、本体层、规划层、Schema 层与过程记录层；  
   - 给出按角色（架构/工程/算法）的推荐阅读顺序；  
   - 指明 v0.1 / v0.2 与理论文档及发展路径规划的映射关系。

---

## 5. 测试与验证（v0.2 & 文档关系）

1. **一致性自检**：  
   - 对照《视觉记忆基础设施_发展路径规划.md》中的阶段 3 与阶段 7：  
     - 确认 `NEXT_EVENT`、`CAUSES`、`CO_OCCURS_WITH`、`SUPPORTED_BY`、`TimeSlice` 等扩展正好覆盖“事件时间线”“因果假设”“共现关系”“审计追踪”“TKG 视图”的核心需求；  
     - 确认未在 Schema 层强行引入尚未成熟的高阶模式/本体，保持扩展适度。  
   - 对照《时空知识图谱的本体论与信息论基础.md》：  
     - 确认 TimeSlice 定义与理论中的时空切片概念兼容，但在 v0.2 中刻意限制为“聚合/索引节点”，避免 TimeSlice 爆炸。

2. **可实施性推演**：  
   - 推演在已有 v0.1 数据上增量构建 v0.2 边与 TimeSlice 的过程：  
     - 验证对旧查询无破坏；  
     - 验证可以从 `NEXT_EVENT`/`CAUSES`/`CO_OCCURS_WITH` 等边构造标准 TKG 四元组视图。  
   - 推演典型查询：  
     - 某人物的事件时间线（利用 `INVOLVES` + `NEXT_EVENT`）；  
     - 两人关系强度（利用 `CO_OCCURS_WITH`）；  
     - 某因果链条的证据回溯（利用 `CAUSES` + `SUPPORTED_BY`）。

---

## 6. 与总体目标的对齐评估（v0.2）

- **与理论目标对齐**：  
  - TimeSlice 节点与因果/共现边，为 STKG 理论中的 TimeSlice、本体级事件关系、STF/CI 度量与 TKG 模型提供最小结构支撑。  

- **与工程规划对齐**：  
  - 直接对应发展路径规划中的阶段 3（智能图构建与结构化回想）与阶段 7（时间知识图谱与前向推理）所需的图结构能力。  

- **结论**：  
  - v0.2 扩展在不破坏 v0.1 稳定内核的前提下，为事件时间线、共现、因果和审计能力提供清晰的 Schema 约束，可作为阶段 3 实现与阶段 7 TKG 训练/推理的图结构基础。  

---

## 7. 本周期新增工作内容（文本模态预留 & 版本路线图）

1. 在 `TKG-Graph-v0.1-SCHEMA.md` 中为文本模态预留字段与子类型：  
   - 在 `MediaSegment` 增加可选字段 `modality: enum("video","audio","text","mixed")`，使文本对话/日志可以与视频/音频共享同一时间轴与租户骨架；  
   - 在 `Evidence` 中明确 `TextEvidence` 子类型，补充 `text`、`utterance_id`、`span_start`、`span_end` 等可选字段，作为文本证据挂载到 Segment 的标准方式。  
   - 保持所有新增字段为可选，兼容既有 v0.1 设计与未来文本记忆管线。

2. 在 `README.md` 中补全 v0.1–v1.0 版本路线图：  
   - 描述从 v0.1（时间轴 + 多租户 + 图内核）到 v1.0（稳定对外版本）的阶段性目标；  
   - 明确 v0.5 版本将“文本记忆接入 & 跨模态统一骨架”视为图设计与工程路线中的关键里程碑，而非后贴附属能力。

---

## 8. 测试与验证（文本模态预留 & 版本路线图）

1. **一致性自检**：  
   - 确认 `MediaSegment.modality` 与 TextEvidence 字段的加入不会与现有视觉/音频管线冲突；  
   - 对照文本记忆规划（发展路径规划中的阶段 5），确认这些字段足以承接未来文本 Session Summary / Utterance 级证据的挂载需求。

2. **可实施性推演**：  
   - 推演一次“对话 Session → TextEvidence → Entity/Place → Event” 的未来写入路径，验证：  
     - 文本模态可以无缝共享统一时间轴与多租户控制；  
     - 不需要再引入新的核心节点类型即可完成跨模态统一（依托现有 `Entity/Place/Event`）。

