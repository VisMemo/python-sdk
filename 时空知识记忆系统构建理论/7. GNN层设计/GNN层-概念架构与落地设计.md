# GNN 层：概念架构与落地设计（面向 STH/TKG Graph v1.0）

> 目标读者：需要在现有 `TKG-Graph-v1.0-Ultimate.md` 图设计上，**接入 GNN/GAT/Temporal GNN**，并把“图逻辑”稳定地转化为“可检索/可预测/可裁剪”的工程产物的人。  
> 约束：一个 `tenant_id` 基本等价一个用户；大量对话都与 “用户自己的 Entity(Person/Agent)” 相关；视觉人脸 Entity 需要独立策略；向量库（Qdrant）与图数据库（Neo4j）必须长期共存。

---

## 0. Linus 三问（先把坑挖出来）

1) **这是真问题还是臆想？**  
真问题：你要在百万级记忆里做到“更相关的召回、更稳定的遗忘、更可控的预测”，而不是在线每次都做慢速多跳遍历。

2) **有更简单的方法吗？**  
有：不要一上来做“全图终极向量”或“GNN+LLM 端到端”。第一步只做 **Graph-Enhanced Embedding（图增强向量）** + **软 TTL 排序**，即可显著改善召回与成本。

3) **会破坏什么吗？**  
会：如果你把 GNN 产出的向量当作“真相”，你就会失去可解释性与审计。  
铁律：**图（证据与关系）是 Truth Source；向量（GNN 产物）是 Cache/Index。**

---

## 1. 这层到底干什么：把“图的拓扑与时间”编译进向量与分数

你可以把整个系统分成两条平行但可互相校验的通路：

### 1.1 线上通路（快：给用户体验服务）
- Query → 向量化 → Qdrant Top-K →（可选）回查 Neo4j 取证据链 → 返回

### 1.2 近线/离线通路（慢：把逻辑“烘焙”进可用形态）
- Neo4j 子图采样/导出 → GNN/Temporal GNN → 产出：
  - **节点向量**（Event/Entity/Knowledge…）
  - **边/事件预测分数**（NEXT_EVENT/CAUSES…）
  - **重要性/TTL 分数**（用于裁剪、冷热分层）
  - **对齐建议**（EQUIV_PENDING 候选）

结论：GNN 层不是“替代图”，而是**把图变成更快的索引与更可控的分数**。

---

## 2. 面向你的图：节点/边如何进入 GNN（输入是什么）

你的 Schema（v1.0）是典型的“证据→事件/实体→知识/状态”的分层图。GNN 不是吃 Neo4j 本身，它吃的是**图结构 + 特征矩阵**。

### 2.1 需要被 GNN“看见”的节点类型（第一批建议）

第一步不要贪。建议只选这些作为 GNN 的核心节点（其余先当作属性或边特征）：

- `UtteranceEvidence` / `TextEvidence`：文本证据入口（几乎所有语义都从这里流入）
- `Event`：可检索、可解释的“故事/片段”单位（线上召回的最佳粒度）
- `Entity(Person/Object/Agent/Org...)`：参与者与长期对象
- `Knowledge/Fact`：较粗粒度的长期语义桶（可作为历史压缩后的“锚点”）
- `TimeSlice`（可选）：如果要做 temporal 任务或 TTL，TimeSlice 很有价值；否则先用时间戳当特征即可

其他如 `MediaSegment/Region/State`，可以第二阶段再进来。

### 2.2 需要被 GNN“看见”的边类型（第一批建议）

优先保留能把“证据→解释→影响”串起来的边：

- `SUPPORTED_BY(Event/Relation→Evidence)`：解释性最强，也是“证据聚合”的主干
- `INVOLVES(Event→Entity)`：把事件与参与者打通
- `NEXT_EVENT(Event→Event)`：让模型学到序列与惯性（对预测、TTL 都有帮助）
- `SPOKEN_BY(UtteranceEvidence→Entity(Person))`：把“谁说的”显式建模（对一租户=一用户尤其关键）
- `DESCRIBES(Knowledge→Event/Entity)`：把“压缩的长期知识”与可回溯对象连起来

`CAUSES/CO_OCCURS_WITH/EQUIV_PENDING` 这类边可以作为“第二阶段”或作为预测目标（label），不要一开始就全量物化成训练输入，否则你等于把噪声喂给模型。

### 2.3 节点特征怎么来（最现实、最稳定的做法）

#### 2.3.1 文本证据节点（UtteranceEvidence/TextEvidence）
- `x_text_raw`: 由文本 encoder（BGE/SBERT/LLM embedding）得到的向量
- `t_media_start/end` 或 `timestamp`: 时间特征（可以是连续值，也可以 bucket + embedding）
- `provenance.confidence`, `source`, `model_version`: 置信度与来源（极其关键：这是你后续“软 TTL”的基础）
- 额外：语言、长度、是否 ASR、是否 OCR 等离散特征

#### 2.3.2 Event 节点
Event 的初始 embedding 不要“凭空造”：
- `x_event_init = pool(其 SUPPORTED_BY 的证据向量)`（mean/max/attention pooling 都可）
- 再拼接：时间、scene、置信度、事件类型（Atomic/Process/Composite）

#### 2.3.3 Entity 节点（文本入口实体）
你这里最大的现实是：**几乎所有对话都围绕 tenant 对应的“用户实体”**，因此 Entity 的表征必须区分：
- `Entity(Self)`：租户自身（你可以把它当作“超级节点/读出节点”）
- `Entity(Other)`：对话中出现的其他人/物/组织（绝大多数是短命或弱身份）

对文本入口实体（名字、代词、描述）：
- `x_entity_init` 可以来自：
  - entity name/alias 的 embedding（最廉价）
  - 被提及的上下文 utterance 的聚合向量（更稳）
  - 关联事件的聚合向量（更稳，但滞后）

#### 2.3.4 Entity(Person)（视觉人脸入口实体）
这类实体**不能只靠图上下文**，否则必然合错人：
- `x_face`: face embedding（ArcFace/InsightFace 等）
- `x_voice`（如有）：speaker embedding
- 图上下文只用于“复核/消歧”的第二信号（见第 6 章）

---

## 3. 我们接入 GNN 可能的“形态”（不要只盯着 GAT）

### 3.1 形态 A：Graph-Enhanced Embedding（最先落地、ROI 最高）

**一句话**：用 GNN 把 `SUPPORTED_BY/INVOLVES/NEXT_EVENT` 等结构信息，编译进 `Event/Entity/Knowledge` 的向量里，然后把这些向量作为 Qdrant 的主索引向量。

- 输入：子图（Event-证据-实体-序列） + 初始 embedding
- 模型：Hetero GAT / HGT / R-GCN（首选支持多关系）
- 输出：
  - `vec_event_gnn_v1`
  - `vec_entity_gnn_v1`
  - `vec_knowledge_gnn_v1`

**最关键的工程点**：你要把“图逻辑”变成“向量几何”，所以必须保证：
- 同一事件的证据向量在空间中更聚拢
- 与当前用户状态冲突的事件向量被“推远”（或至少降权）

### 3.2 形态 B：软 TTL / 重要性评分（你说的“遗忘机制”）

硬 TTL 是删除；你真正想要的是：数据还在，但**影响力下降**。

- 输入：节点/边的时间、置信度、访问日志（最重要）
- 模型：
  - 简单 baseline：XGBoost/LogReg（先别急着上 GNN）
  - 图版本：GraphSAGE/GAT + node classification/regression
  - 时序版本：TGN/TGAT（更适合捕捉漂移与周期性）
- 输出：
  - `importance_score ∈ [0,1]`
  - `ttl_policy`（hot/warm/cold/archive）

用法：
- Qdrant 召回 Top-K 后，用 `importance_score` 重排（rerank）
- 或者把 `importance_score` 写回 Neo4j / Qdrant payload，在线过滤低价值节点

### 3.3 形态 C：Temporal GNN 做“前向预测”（Next-Event / Next-Edge）

你的图已经具备 temporal 结构（TimeSlice、NEXT_EVENT、t_media_*），这非常适合做预测：

#### 3.3.1 Next Event Prediction（下一个事件是什么）
- 输入：最近一段时间的 Event 序列子图（含参与实体与证据）
- 输出：
  - 下一个 `Event.type` / `scene` 的分布
  - 可能需要触发的 tool/action 的分布（如果你把 tool call 也建成 Event）

#### 3.3.2 Next Edge / Link Prediction（下一条关系是什么）
- 输入：当前图快照或事件流
- 输出：更可能出现的边：
  - `NEXT_EVENT`（序列补全）
  - `INVOLVES`（事件参与者补全）
  - `CAUSES`（候选因果，必须高门槛）

#### 3.3.3 Drift 预测（偏好/状态漂移）
- 输出：`Entity(Self)` 的状态向量位移速度/方向（用于“用户状态提醒”）

**注意**：预测产物不要直接写入主图当真相。建议写入：
- `HypothesisEvent/PredictedEvent`（你 Schema 已预留）
- 或者写入独立的 `prediction` 存储/表，保留 time_origin='predicted'

### 3.4 形态 D：实体对齐/合并建议（EQUIV_PENDING 的生产线）

你 Schema 已经明确：默认只为 Person 做全局聚类，并且要有 `EQUIV_PENDING`。

GNN 在这里适合做“上下文相似度”的第二阶段：
- 第一阶段（硬信号）：人脸 embedding / 声纹 embedding / 账号绑定
- 第二阶段（软信号）：共同参与事件、共同出现的时间段、共同被同一用户提及的上下文

输出：`(candidate_a, candidate_b, score)` → 写入 `EQUIV_PENDING`（待审核）

---

## 4. “一个租户≈一个用户”对 GNN 设计的影响（别忽视）

这会带来两个常见错觉：

### 4.1 错觉：Entity 全是“用户自己”，所以很简单
不。现实是：
- `Entity(Self)` 极其中心化（高 degree），会吞掉注意力与信息
- 其他实体（人/物/组织）大量是“弱身份、短寿命、歧义高”

所以你必须明确两类任务：
- **以 Self 为中心的读出/状态建模**（图级/ego graph）
- **对 Other 的去噪与分化**（避免全部被 Self 吞并）

### 4.2 结构建议：把 Self 当成“读出节点/超级节点”
如果你的目标是得到一个能代表“当前用户状态”的稠密向量（用于引导/路由）：
- 不要全图 mean pooling
- 直接用 `Entity(Self)` 作为 readout：让 GNN 聚合其 K-hop 邻居后取其向量

产物命名建议：
- `vec_self_state_gnn_v1`：只表达“现在的人设/状态”，不承诺保留细节事实

同时你仍然需要：
- `vec_event_gnn_v1`：表达具体可回溯事件（用于事实召回）

这就是“宏观状态向量 + 微观事件向量”的双产物策略。

---

## 5. 写入与存储：到底先写 Qdrant 还是先过 GNN？（你现在最缺的概念）

### 5.1 正确答案（工程上唯一靠谱的）
**先写原始向量（raw），再写 GNN 向量（enhanced）。永远不要阻塞写入等待 GNN。**

理由很简单：
- GNN 训练/推理是近线/离线任务（分钟级/小时级）
- 用户写入后的“立刻可搜”是线上体验底线
- 你必须允许模型版本迭代（v1/v2），不能重写历史造成不可回溯

### 5.2 具体落地：双向量/双集合（两种都给）

#### 方案 1：Qdrant 同 point 多 named vectors（推荐，若你工程已支持）
- `vector_raw`: 文本/多模态 encoder 原始向量
- `vector_gnn_v1`: GNN 输出向量（图增强）
- （可选）`vector_state_v1`: Self 状态向量（如果你把它也存 Qdrant）

优点：同一个 id 同时具备多版本向量；线上可按策略切换。

#### 方案 2：分 collection（如果你现在只能单向量）
- `memory_raw_*`：原始索引（现有）
- `memory_gnn_v1_*`：GNN 索引（新）

线上检索策略：
- 优先查 `gnn` 集合；缺失则回退 `raw`
- 或者两边各取 Top-K 做融合重排（late fusion）

### 5.2.1 结合当前工程的现实（现有 Qdrant collections 与维度）

当前工程（`modules/memory/config/memory.config.yaml`）已经约定了多模态集合与维度：
- `memory_text`: 1536（text-embedding-3-small）
- `memory_image`: 512
- `memory_clip_image`: 512
- `memory_audio`: 192
- `memory_face`: 512

这直接影响你“GNN 输出向量要多大”：
- **最省事的路径**：让 `vec_event_gnn_v1 / vec_entity_gnn_v1` 输出维度=1536，直接复用 `memory_text`（要么作为 named vector，要么作为平行 collection）。  
- **如果你坚持输出 512/1024**：那就必须新增集合（例如 `memory_text_gnn_v1`），或者在写入 Qdrant 前加一个 projector 把它映射回 1536（等价于“压缩/对齐层”）。

别幻想“不改任何存储结构又能随意换维度”。向量库是强约束系统：**维度就是 schema**。

### 5.3 Neo4j 侧的要求：embedding 必须入图（解决“脑体分离”）

原因：训练/推理时需要数据局部性（A 和 X 一起读）。

写入时：
- 节点属性存 `embedding_raw`（float[]）
- GNN 产物回写 `embedding_gnn_v1`（float[]，版本化）
- 重要性回写 `importance_score` / `ttl_bucket`

**永远不要覆盖 raw。** raw 是可审计基线，也是故障回退的安全绳。

### 5.3.1 ID、一致性、幂等与删除（你不提前想清楚会断链）

你的系统有两种“同一性”：
- **图同一性**：Neo4j 节点的逻辑主键（例如 `id` / `global_id` / `(tenant_id, local_id)`）
- **向量同一性**：Qdrant point id（必须与图侧可稳定对齐）

最稳的工程规则：
- **Qdrant point id = 图节点 id（同一个字符串/UUID）**  
  - 这样 Qdrant 命中后，回查 Neo4j 是 O(1) 的主键查找，不需要额外映射表。
- **upsert 必须幂等**  
  - 同一 `id` 重写 raw/enhanced，不改变语义（版本字段变化要可追溯）。

删除/归档要分两类：
- **软删除（推荐默认）**：写 `ttl_bucket=archive` 或 `is_active=false`，并在 Qdrant filter/Neo4j 查询里过滤。  
  - 优点：可回溯、可恢复；配合 “Never break userspace” 最安全。
- **硬删除（严格受控）**：真正删 Qdrant point + Neo4j 节点/边。  
  - 必须是离线任务，且要先保证“证据引用仍可追溯”（例如只删冗余中间节点，保留 Knowledge/Fact + Evidence 引用）。

### 5.4 推荐的三段式管道（你可以照着画架构图）

1) **Ingest（在线写入，必须快）**
- 生成 Evidence/Utterance/TextEvidence 节点
- 建 `SUPPORTED_BY / SPOKEN_BY / INVOLVES / TEMPORALLY_CONTAINS` 等基础边
- 计算 `embedding_raw`，双写：
  - Neo4j：节点属性 `embedding_raw`
  - Qdrant：`vector_raw`
- 追加 Graph WAL（把 upsert 请求落盘/入队，供训练）

2) **Nearline GNN Inference（分钟级 micro-batch）**
- 从 WAL/队列取最近变更节点
- 抓取其 K-hop 邻居子图（受控：2-3 hop + top-K 边）
- 前向推理得到：
  - `embedding_gnn_v1`
  - `importance_score`（可选）
- 回写：
  - Neo4j：`embedding_gnn_v1`
  - Qdrant：`vector_gnn_v1`（或写入 gnn collection）

3) **Offline Training（小时/天级）**
- 用历史 WAL + 检索日志构建自监督数据集
- 训练/评估新模型版本 v2
- 灰度发布：先少量 tenant，指标通过再扩大

### 5.5 两个“别犯傻”的一致性边界

1) **不要把“enhanced 向量回写”当作写入成功的必要条件**  
写入成功定义：raw 已落 Neo4j + Qdrant，且图结构完整（至少 Evidence↔Event↔Entity 主干）。  
enhanced 只是后处理；失败了也只能影响质量，不能影响可用性。

2) **不要让 GNN 产物污染图的事实层**  
GNN 产物只应落在：
- 节点属性：`embedding_gnn_v1`, `importance_score`
- 预测层：`HypothesisEvent/PredictedEvent` 或独立 prediction store
- 候选队列：`EQUIV_PENDING`（待审核）

事实层边（比如 CAUSES/INVOLVES）不应被“模型猜测”直接覆盖，否则你会失去可审计性，并且模型一旦犯错就会自我强化。

---

## 6. 人脸/视觉 Person Entity：为什么必须“另起炉灶”，GNN 只能当辅助

你的 Schema 已经写得很清楚：Person 的 global_id 合并必须谨慎，`EQUIV_PENDING` 是必需的。

### 6.1 视觉身份的主信号（第一性原理）
- 人脸 embedding（同模态同空间）
- 追踪轨迹（track_id 连续性）
- 声纹 embedding（如有）
- 账号/通讯录等硬绑定（如有）

### 6.2 图上下文能做什么（只做“消歧/复核”，别做“定罪”）
GNN 可以提供这些辅助证据：
- 同一个人是否总在同一时空区域出现（TimeSlice/Region）
- 是否经常与同一组实体共同出现（CO_OCCURS_WITH）
- 是否总被同一个名字/代词指代（TextEvidence/Utterance 上下文）

输出形态建议：
- `EQUIV_PENDING`：候选合并边（带分数、理由、证据引用）
- `provenance`：把“为什么给出这个建议”记下来（可审计）

**禁忌**：仅凭 GNN 上下文相似度就合并人脸实体，这是制造伪身份的捷径。

---

## 7. GAT 在你这张图里“最好”的用法（直球回答）

你说“GAT 用注意力把整个图重新 embedding”，这句话只对一半：GAT 不会替你“重建世界”，它只是在**聚合邻居时学权重**。

在你的图上，GAT 最擅长三件事：

1) **证据聚合（SUPPORTED_BY 的权重学习）**  
让 Event 的向量更多地由“可信且相关的 Evidence”决定，而不是被 ASR 噪声稀释。

2) **时效与冲突的软处理（时间/置信度作为 attention 特征）**  
旧证据/低置信证据的贡献趋近 0，实现“软遗忘”。

3) **Self 节点读出（tenant≈user 的状态向量）**  
用注意力决定“最近哪些事件/话题最能代表用户当前状态”。

---

## 8. 训练目标（你不需要标签，“Your log is your label”）

### 8.1 Graph-Enhanced Embedding 的自监督（对比学习 + 链路预测）

建议组合拳：
- **Link Prediction**：预测是否存在 `SUPPORTED_BY / INVOLVES / NEXT_EVENT`
- **Contrastive**：
  - 同一 Event 的证据做正样本（拉近）
  - 不相关事件的证据做负样本（推远）

### 8.2 TTL/重要性（最实用的监督信号）
Label 直接来自线上：
- 未来 N 天是否被检索/点击/用于回答（1/0）
- 或使用次数/被引用次数（回归）

### 8.3 预测（Temporal）
Label 来自未来：
- `NEXT_EVENT` 的真实后继
- 未来新增的 `INVOLVES/SUPPORTED_BY` 边

---

## 9. 线上怎么用（检索策略必须“可回退、可解释”）

### 9.1 默认策略（最稳）
- Qdrant 用 `vector_gnn_v1` 检索（如果存在）
- 不存在则用 `vector_raw`
- 返回 Top-K 后：
  - 用 `importance_score` 重排/过滤
  - 必要时回 Neo4j 取 `SUPPORTED_BY` 证据链用于解释

### 9.2 融合策略（更强，但更复杂）
- `raw` 与 `gnn` 各取 Top-K
- 做 union 后用 reranker（可以是轻量 cross-encoder 或规则）重排

### 9.3 解释性底线（必须保留）
任何重要决策输出都应能回到：
- 哪些 `Evidence/Utterance` 支撑了这个结论（SUPPORTED_BY）
- 谁说的、什么时候说的（SPOKEN_BY + TimeSlice）

---

## 10. 验收与测试用例（“Test what users actually do”）

> 这些是你上线前必须跑的“用户导向测试”，否则你会在 API 200 的幻觉里自嗨。

### 10.1 召回质量（Graph-Enhanced Embedding 的价值验证）
- 用例 1（时效压制）：三年前“爱吃辣”，昨天“胃痛”  
  - Query：“晚餐吃什么”  
  - 期望：召回里“火锅”排名下降或被标注风险；“清淡/养胃”相关事件靠前
- 用例 2（证据去噪）：同一事件有 10 条 ASR 噪声 + 1 条清晰关键 utterance  
  - 期望：Event 向量主要由关键 utterance 决定，召回能命中

### 10.2 软 TTL（重要性排序）
- 用例 3（软遗忘）：半年未被查询的闲聊 ASR 噪声  
  - 期望：importance 低；线上 rerank 后基本不出现
- 用例 4（周期性）：每月一次的账单/健身提醒  
  - 期望：不是被硬删除；在接近周期时能被模型保留一定活跃度

### 10.3 视觉身份（不合错人）
- 用例 5（相似脸误合并）：两位外观相似的人在不同时间出现  
  - 期望：不会仅因共同邻居/共同场景就合并；必须依赖 face embedding 主信号

### 10.4 回退机制（Never break userspace）
- 用例 6（GNN 故障/版本回滚）：禁用 `vector_gnn_v1`  
  - 期望：系统自动回退 `vector_raw`，用户仍可检索；指标可对比

### 10.5 指标体系（没有指标，你永远不知道 GNN 有没有在胡来）

把指标分成三类：质量、成本、风险。

#### 10.5.1 质量指标（Retrieval）
- **Recall@K（弱监督）**：用“用户点击/被用于回答/被展开为证据链”的记录当作正例，评估 gnn 相对 raw 的召回提升。
- **nDCG@K（重排质量）**：结合 `importance_score` 的重排是否把真正有用的事件顶上去。
- **Freshness@K（时效性）**：Top-K 中 “最近 N 天”的占比（用于验证“软 TTL/时间衰减”是否生效）。
- **Conflict Suppression Rate（冲突压制率）**：在已知冲突场景下（例如“旧偏好 vs 新禁忌”），被压制条目在 Top-K 的下降幅度。

#### 10.5.2 成本指标（Storage/Compute）
- **Qdrant 命中后 Neo4j 回查比例**：你希望“默认不查图也够好”，但仍要保留解释性回查；这个比例用来衡量是否过度回查。
- **GNN 近线回填延迟**：从新节点写入到 `vector_gnn_v1` 可用的 p50/p95（决定“新数据空窗期”）。
- **归档命中率**：被判定低 importance 的节点中，后续又被频繁使用的比例（误杀率的反面）。

#### 10.5.3 风险指标（身份/事实污染）
- **Entity 合并误差**：
  - 视觉 Person：误合并率（必须极低，宁可不合并）
  - 文本入口实体：误合并与漏合并都要监控，但可以容忍更高的漏合并
- **预测污染率**：模型生成的 Hypothesis/Predicted 产物被误当成事实参与线上决策的次数（应该为 0，通过流程控制实现）

---

## 11. TODO（建议的落地顺序）

1) 统一写入：`embedding_raw` 必须双写 Neo4j + Qdrant，并记录 WAL  
2) 定义 “GNN 最小子图”：Event-证据-实体-NEXT_EVENT（2-hop + top-K 限制）  
3) 做第一版 **Event 向量增强**（只输出 `vec_event_gnn_v1`，别贪）  
4) 做线上检索切换：优先 gnn，缺失回退 raw  
5) 引入 importance：先用日志训练简单模型，再升级到 Temporal GNN  
6) 视觉 Person：先把 face/voice registry 机制跑稳，再用图上下文做 `EQUIV_PENDING` 辅助

---

## 12. 关键原则（写在最后，避免你走弯路）

- **GNN 是编译器，不是数据库**：它把图逻辑编译成向量/分数，用于线上快检索与快决策。  
- **版本化一切**：`embedding_gnn_v1/v2`、`ttl_model_v1`，别覆盖历史。  
- **把噪声挡在输入端**：你 Schema 里已经写了 top-K、置信度阈值、layer；这些不是“建议”，是 GNN 能否稳定的前提。  
- **永远留回退通路**：raw 向量 + 图证据链，是你“永不宕机、永不瞎说”的底线。  
