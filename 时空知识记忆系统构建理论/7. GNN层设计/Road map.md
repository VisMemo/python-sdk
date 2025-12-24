# Graph‑Native AI Memory（执行版 Roadmap）

> 位置：`docs/时空知识记忆系统构建理论/7. GNN层设计/`  
> 前置依赖：
> - `docs/时空知识记忆系统构建理论/3. Schema 层（What exactly in code）/TKG-Graph-v1.0-Ultimate.md`
> - `docs/时空知识记忆系统构建理论/7. GNN层设计/GNN层-概念架构与落地设计.md`
> - `docs/时空知识记忆系统构建理论/7. GNN层设计/GNN规划路径及纲要.md`

---

## 0. 目标与非目标（先把边界钉死）

### 0.1 我们要解决的真实问题
- **召回更准**：让“逻辑相关（时效/矛盾/因果）”在向量空间中可被快速召回，而不是每次在线多跳推理。
- **遗忘更像人**：不靠硬删，而是靠“影响力衰减（soft TTL）+ 冷热分层 + 可回溯”。
- **引导更一致**：让模型在生成前带着“用户当前状态/偏好重心”的潜意识基调，而不是每轮都临时拼 Prompt。
- **可解释、可回退**：图是 Truth Source，GNN/向量是 Cache/Index；任何新能力都必须能回退到 raw 向量 + 证据链。

### 0.2 明确非目标
- **不追求** “一个稠密向量无损承载整个记忆库事实细节”。这在信息论上就是错觉。
- **不允许** 让模型预测产物直接污染事实层（例如把 CAUSES/INVOLVES 当作“模型猜测”写死成真相）。
- **不在 Phase 0/1** 做端到端“GNN→Projector→LLM 注入训练闭环”。那是最后一步，而且需要严格评估数据与训练信号。

---

## 1. 现状（As‑Is）一句话复述：Graph RAG + ID 锚定

当前系统是 Neo4j + Qdrant 双数据库：
- **Neo4j（左脑）**：显式拓扑、确定性多跳、证据链与审计（STH/TKG 结构）。
- **Qdrant（右脑）**：ANN 粗召回，解决模糊语义匹配。
- **锚定机制**：Global ID 对齐，保证“向量命中能回查图证据”。

这套架构本身没错；问题在于：当你想引入 GNN 时，必须把“图结构 A”和“特征 X（embedding）”以工程可行的方式放在一起，并且保证版本化与回退。

---

## 2. To‑Be：双轮驱动（Macro Steering + Micro Refining）

这不是概念包装，而是两个不同的数据结构目标：

### 2.1 Macro Memory Steering（宏观引导，模型的“潜意识”）
- 产物：`Global User State Vector`（更准确：**多尺度/多分面的一组 state vectors**，见第 6 章）
- 作用阶段：Pre‑Generation（在生成前定基调：语气、立场、风险偏好、当前状态）
- 本质：画像/状态压缩，**不承诺事实细节可还原**

### 2.2 Micro Memory Refinement（微观重塑，检索的“海马体”）
- 产物：`Contextualized Memory Vectors`（Event/Entity/Knowledge 的图增强向量）+ `importance_score`
- 作用阶段：Retrieval（召回/重排/过滤）+ Explain（回查图证据链）
- 本质：把“图逻辑约束”编译进向量几何距离与分数，从 O(N) 推理变成 O(1) 距离近似

关键铁律：**Macro 负责“你懂不懂我”，Micro 负责“记不记得那件事”。**

---

## 3. 关键约束（决定Roadmap顺序的现实）

### 3.1 tenant≈user：Self Entity 高度中心化
- 现象：绝大多数对话/事实都与 `Entity(Self)` 相关，Self 节点度数极高。
- 含义：
  - 宏观向量 readout 以 Self 为中心是自然选择（ego‑subgraph）。
  - 微观向量要避免被 Self 吞噬：需要类型化/分面化/时间窗控制，否则向量会变成“万物都像我”。

### 3.2 文本入口 Entity 与视觉 Person Entity 是两套治理问题
- 文本入口实体（名字/代词/描述）：
  - 数量大、身份弱、短寿命、歧义高；允许更高漏合并。
  - 图上下文能显著帮助它“归档到正确主题/事件簇”。
- 视觉人脸 Person：
  - 误合并代价极高且不可逆（伪身份污染全图）。
  - 主信号必须来自 face/voice embedding 与 track 连续性；图上下文只能做 `EQUIV_PENDING` 复核。

### 3.3 向量维度是强约束（你不能想当然）
当前工程配置（`modules/memory/config/memory.config.yaml`）：
- text 1536、face 512、audio 192、image/clip_image 512
结论：
- 如果 GNN 输出维度 != 1536，你要么新增 collection，要么加 projector 对齐回 1536。
- 不要把“维度不匹配”留到上线那天才发现。

---

## 4. 总 Roadmap（按风险与收益排序）

下面的阶段是“能落地、能灰度、能回退”的顺序，而不是“论文上最酷”的顺序。

### Phase 0（现在）：GNN‑Ready 数据与可回溯护栏
**目标**：先把“训练能吃的数据”存对，别急着训练模型。

交付物：
- 写入路径保证 `embedding_raw` 双写（Neo4j 节点属性 + Qdrant point vector）。
- 图结构主干稳定：`UtteranceEvidence/TextEvidence →(SUPPORTED_BY)→ Event →(INVOLVES)→ Entity(Self/Other)`。
- Graph WAL / 变更日志：可重放、可做自监督数据集。
- 版本与回退策略落地：
  - `vector_raw` 永不覆盖
  - `vector_gnn_v1` 作为新增版本并存（named vector 或平行 collection）
  - 在线检索默认 gnn，缺失回退 raw（或反过来灰度）

验收口径：
- 任一 Qdrant 命中 point id，都能 O(1) 回查 Neo4j 同 id 节点（不允许断链）。
- 禁用 GNN 向量后，系统仍可用（Never break userspace）。

### Phase 1（最先见效）：Micro‑Refine v1（Event 向量图增强 + 重排）
**目标**：用最小子图，让检索质量先提升。

子图范围（强约束）：
- 以 `Event` 为中心 2‑hop：
  - `Event—SUPPORTED_BY→(UtteranceEvidence/TextEvidence)`
  - `Event—INVOLVES→Entity(Self/Other)`
  - （可选）`Event—NEXT_EVENT→Event`
- 边限流：同类边 top‑K（按置信度/新颖性/时间衰减）。

模型形态：
- 异构 GNN（R‑GCN/HGT/R‑GAT 皆可），先做推理/表示学习，不强求端到端注入。

产物：
- `vec_event_gnn_v1`（维度策略二选一）：
  - 直接输出 1536（最省事，复用 text collection）
  - 输出 512/1024 + projector 映射到 1536（多一道层，但更灵活）
- `importance_score_event_v1`（可先用简单模型从日志学，再升级到 Temporal GNN）

上线形态（可回退）：
- 检索：优先用 `vec_event_gnn_v1` ANN；缺失回退 `vector_raw`。
- 重排：用 `importance_score_event_v1` 做 rerank/过滤。
- 解释：用 `SUPPORTED_BY` 回查证据链，避免黑盒。

验收指标（必须量化）：
- nDCG@K / Recall@K 相对 raw 提升（用“被用于回答/点击/展开证据”的日志做弱监督）。
- Freshness@K 提升（验证软 TTL 的方向正确）。
- 回查比例可控（不应因 gnn 引入导致 Neo4j 回查爆炸）。

### Phase 2：Soft TTL v1（重要性、冷热分层、归档策略）
**目标**：让“遗忘”先变成工程可控的策略，再考虑更复杂模型。

策略优先级：
1) 先用日志做 importance（是否被检索/被引用/被展开证据）。
2) 再引入 temporal 模型捕捉漂移与周期性（TGN/TGAT）。

产物：
- `importance_score_node_v1`（按节点类型分别建模：Evidence/Event/Knowledge）
- `ttl_bucket`（hot/warm/cold/archive）
- 离线归档作业（默认软删除：过滤即可；硬删严格受控）

验收指标：
- 误杀率：被归档后又高频使用的比例应低。
- 成本：存储/索引规模增长被控制（Evidence 噪声下降）。

### Phase 3：Macro‑Steer v1（Self‑centered 多尺度状态向量）
**目标**：先做“可解释的画像向量”，再谈注入。

核心观点：
- 不做“全库 pooling 一个向量”。做 `Entity(Self)` 的 ego‑subgraph readout。
- 并且不是一个向量，而是多尺度：
  - `state_now`（分钟级窗口）
  - `state_week`（周级窗口）
  - `state_long`（长期稳定偏好）

产物：
- `vec_self_state_now_v1 / week_v1 / long_v1`
- 每个 state 都能回指“贡献最大的证据/事件”（用 attention 权重或解释性近似）

上线形态：
- 先不注入大模型：只用于路由/重排/回答风格策略（例如更谨慎、更简洁、更关怀）。

验收指标：
- 一致性：跨多轮对话风格稳定（减少“上一句关怀下一句冷漠”）。
- 可解释：能说清“为什么我认为你在生病期”（基于证据链/高权重节点）。

### Phase 4：Projector + Soft Prompt（高风险，最后做）
**目标**：把 Macro state vectors 映射到 LLM embedding 空间，做可控注入。

必须满足的前置条件（不满足就别做）：
- 你有足够的对齐信号（偏好一致性、风格一致性、风险提示命中等）。
- 你有严谨的评估集与在线灰度机制。
- 你能保证注入失败/退化时，系统可回退到“无注入 + RAG”且质量不崩。

交付物：
- `projector_v1`（MLP/Linear）
- 注入协议（虚拟 token 数、位置、与 system prompt 的关系）
- 评估与回滚开关（配置化）

验收指标：
- 一致性提升，同时事实准确率不下降（否则就是“更会说但更会错”）。

### Phase 5：视觉 Person Registry + 图辅助对齐（长期工程）
**目标**：Person 的全局身份治理体系稳定后，再用图做辅助。

交付物：
- Face/Voice Registry（阈值、合并/拆分流程、审计）
- `EQUIV_PENDING` 生产线（GNN 输出候选 + 人工/规则/二级模型复核）

验收指标：
- 误合并率极低（宁可漏合并）。

---

## 5. 决策矩阵：全图单向量 vs Self 子图画像

把争论变成工程选择，而不是哲学争吵。

### 5.1 “全图单向量”什么时候可用
可用前提：
- 你只要宏观“味道”（persona/状态），不追求事实可回溯。
- 你能接受平均化损失（冲突会被抹平）。
适用场景：
- 语气/立场/风险偏好引导（Steering）

### 5.2 为什么默认选 Self‑centered ego‑subgraph
原因：
- tenant≈user → 数据天然围绕 Self，Self 就是 readout 节点，结构更稳。
- 可控：窗口、分面、top‑K 边限流，避免噪声污染。
- 可解释：贡献最大的证据/事件可回查。

结论：
- **宏观：Self 子图画像（多尺度、多分面）**
- **微观：Event/Knowledge 向量增强 + importance**
- 全图单向量作为研究项，而不是主路径。

---

## 6. Life Context：比“一个 state vector”更强的构建方法（建议写进下一版白皮书）

你要的“像活在他的生活里”，不是靠一个向量，而是靠一组可组合的上下文对象。

### 6.1 Context Stack（多尺度）
- `Now`：当前对话相关（分钟级）
- `Today/Week`：短期计划、健康、情绪波动
- `Long`：长期偏好、禁忌、稳定关系网

每一层都包含：
- 一个 state vector（可注入/可路由）
- 一组高置信 Fact（可审计、可引用）
- 一组高贡献证据（可回查）

### 6.2 Facets（多分面画像）
把用户画像拆成稳定分面，每个分面单独向量与事实桶：
- Health / Work / Family / Finance / Hobby / Social / Routine / Location

GNN 的作用：
- 把证据与事件按分面聚合（attention 作为“贡献分配器”）。

### 6.3 Routines & Patterns（生活节律）
利用 `TimeSlice`：
- 预测周期事件（账单/健身/复诊）
- 生成 `PredictedEvent`（time_origin='predicted'）用于提醒与对话策略

### 6.4 Constraint Layer（硬约束层）
禁忌与高风险项（过敏、药物冲突、法律合规）必须是结构化约束：
- 不依赖 embedding“差不多”
- 在检索/生成前强制过滤或强提示

---

## 7. 风险与护栏（不写这些，Roadmap 会变成灾难路线图）

### 7.1 三条护栏
- **版本化**：`vector_raw` 不覆盖；`vector_gnn_v1/v2` 并存；随时切回。
- **事实隔离**：预测只进 `PredictedEvent/Hypothesis` 或独立存储；不得写死事实边。
- **身份隔离**：视觉 Person 合并必须以 face/voice 为主信号；图只做辅助。

### 7.2 灰度策略（必须有）
- 先 tenant 小流量（1%）启用 gnn 向量检索
- 指标通过再扩大（nDCG@K、Freshness@K、误杀率、回查比例、P95 延迟）
- 任何异常一键回退 raw

---

## 8. 本 Roadmap 的第一阶段“胜利定义”（避免团队空转）

如果你只能选一个最先做的成果，那就是：

> **Event 的图增强向量（vec_event_gnn_v1） + importance 重排 + 可回退**  
> 让你在不改变用户使用方式的前提下，显著提升召回相关性，并为 Macro state 与注入打下数据与评估基础。

