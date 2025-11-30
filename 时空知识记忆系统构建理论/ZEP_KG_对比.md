# Zep 时态知识图谱架构 vs 我们的记忆体设计

## 调研摘要（Zep）
- **统一时态图**：基于 Graphiti，事实和关系携带 `created_at` / `valid_at` / `invalid_at` / `expired_at`，支持历史追溯与状态变化。
- **两类入口**：
  - 线程记忆（UserAgent/Thread）：对话消息入库，自动汇聚到统一用户图；`get_user_context()` 组装上下文（summary/basic）。
  - 直接图存储（GraphAgent/GraphMemory）：`graph.add()` 显式写实体/关系/事实；`graph.search` 并行查 edges/nodes/episodes，返回时态字段。
- **数据模型**：
  - 节点：`name`、`summary`、`attributes`、`created_at`。
  - 边（事实）：`fact`、`name`、`attributes`、`created_at`、`valid_at`、`invalid_at`、`expired_at`。
  - Episodes：对话/事件片段，带 `content`、`source`、`role`、`created_at`。
- **检索模式**：统一 `search_graph_and_compose_context`，并行查 edge/node/episode，再拼接上下文字符串供上层 LLM/Agent 使用。
- **数据路由**：`metadata.type` 决定写线程还是写图；消息/文本/JSON 都能落图，更新时“智能合并”但未见强治理策略。

## 关键差异对比

| 维度 | Zep | 我们（时空记忆体） |
| --- | --- | --- |
| 时态模型 | 边节点携带 `valid_at/invalid_at/expired_at`，未见时间实体 | v0.1: 事件/片段时间属性；v0.2: TimeSlice 节点、NEXT_EVENT 时间线；终极版支持时空区间实体化 |
| 事实层/语义层 | 事实边直接承载语义，未分层 | fact/semantic/hypothesis 分层；CAUSES/CO_OCCURS 属高阶语义，需 SUPPORTED_BY 证据 |
| 证据链 | 未见强制 SUPPORTED_BY；返回上下文字符串 | Evidence 不可变，Event/Entity/边必须可追溯 SUPPORTED_BY；provenance 统一字段 |
| 多模态 | 以文本/对话为主，图模型未细分模态 | MediaSegment/Evidence/Entity/Event/Place 分层，多模态（视频/音频/文本）统一骨架 |
| 多租户/隔离 | API 层未强调租户强隔离 | tenant_id 全链路约束，禁止跨租户建边 |
| 检索 | 并行查 edge/node/episode → 拼接上下文 | 向量 + BM25 + 图邻域重排；可按层/关系白名单/时间过滤；提供 hints/trace |
| 治理/TTL | `expired_at` 字段存在，但策略未公开 | importance/ttl/pinned/stability + 时间衰减；低价值可裁剪/归档 |
| 评测指标 | 未见 STF/CI 等质量度量 | STF/CI、EventRecall、CharacterPurity 等度量；因果边默认二等公民 |
| 事件时间线 | 未突出事件序列/因果 | NEXT_EVENT/CAUSES/CO_OCCURS（v0.2），事件时间线为核心骨架 |
| 版本/审计 | 暗含 created/expired，但审计策略未明 | 审计/版本回滚强制，高风险编辑需审批 |

## 我们可借鉴的点
- **统一接口模型**：edge/node/episode 并行搜索与上下文拼接，可做“快速上下文组装”工具层。
- **valid/invalid/expired 字段**：在 Event/Edge 层可平滑引入 `expired_at` 辅助 TTL/治理（保持兼容）。
- **消息/图双入口**：`metadata.type` 路由线程 vs 图，适合我们文本会话与结构化写入的双通道。

## 我们的优势与坚持
- **时空实体化与分层**：TimeSlice/MediaSegment/事件时间线让时间成为一等公民，不止附属性。
- **证据链与审计**：SUPPORTED_BY + provenance 必填，高阶边默认“假设”层级，可开关控制。
- **多租户与安全**：tenant_id 强隔离，图/向量层统一过滤；高风险编辑有 Safety 策略。
- **质量度量与可回溯**：STF/CI/CharacterPurity 等指标，因果/共现需要阈值与验证。
- **多模态骨架清晰**：Evidence 不可变、Entity 可演化、Clip 为锚点；文本/视觉共用统一骨架。

## 差异风险
- Zep 将事实直接以边表示，语义与事实未分层，若直接套用会弱化可审计与“事实/推理”边界。
- 未见强多租户/治理策略，若在我们场景使用需加固隔离、TTL、版本回滚。
- 时间仅依赖 `valid_at/invalid_at` 属性，无 TimeSlice/序列语义，难支撑我们的时序推理与结构化回想。

## 结论
Zep 时态图强调简洁 API 与集成，核心是“事实携带有效期”+“edge/node/episode 并行检索”。我们的设计以时空实体化、分层语义、证据链和治理为主，适用于可验证、可审计、多模态、强隔离的长期记忆场景。若要吸收 Zep 思路，可在保持分层与审计的前提下，引入 `valid/invalid/expired` 辅助字段和“快速上下文拼装”工具层，但不牺牲时间实体化和层级约束。
