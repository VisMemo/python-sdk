# MOYAN 时空知识记忆系统：测评标准与竞对分析方案

## 1. 核心测评哲学：从“检索命中”到“时空推理”

针对 MOYAN 系统独特的 **“时空知识图谱（TKG）+ 向量检索”** 双引擎架构，传统的 RAG 测评标准（如单纯的 Recall@k）已不足以衡量其核心价值。我们需要建立一套**以“时空推理能力”为核心**的分层测评体系。

### 1.1 核心差异化主张
我们的测评方案必须能够回答以下关键问题，以突显相对于竞品（Mem0, Zep, GraphRAG）的优势：
*   **时序性（Temporality）**：系统能否区分“上周的会议”和“今天的会议”？（vs. Mem0 的弱时序）
*   **结构化（Structure）**：系统能否通过 `NEXT_EVENT` 或 `CAUSES` 边推导出未直接提及的关联？（vs. 纯向量 RAG）
*   **精确性（Precision）**：在“完全没出门的日子”这类否定逻辑下，系统能否准确返回空集或特定集合？（vs. 幻觉严重的 LLM）

---

## 2. L1-L5 分层能力测评标准

基于 `TKG-Graph` 的演进路线，我们将能力划分为 5 个等级，每个等级对应特定的测试数据集与评价指标。

在进入 L1-L5 之前，需要特别指出两项 **底层支撑能力**，它们贯穿所有等级：

- **身份统一（Identity Unification）**：在多账号、多设备、多别名的条件下，将同一真实人物/实体在不同源中的记录统一到一致的“自我”视角，避免“把别人的事当成我的事”或相反。
- **物理时间轴锚定（Physical Timeline Anchoring）**：在时区不一致、设备时间偏移、叙事时间（“刚才”“上周”）混杂的情况下，将所有事件准确地对齐到一条全局物理时间轴上。

这两项能力是 MOYAN 的核心结构优势，既影响 L1 基础检索的正确性，也直接决定 L2-L5 时序推理与否定逻辑判断的上限，因此在后续指标体系中会单独定义评测方案。

### L1: 基础事实检索 (Basic Fact Retrieval)
*   **定义**：基于关键词、时间范围、地点或实体的直接查找。
*   **典型问题**：
    *   “上周五我去了哪些地方？”
    *   “昨天下午跟我开会的人是谁？”
*   **竞对参照**：Mem0, LangChain VectorStore。
*   **核心指标**：
    *   **Recall@k**：正确的事实是否在返回列表中。
    *   **Time-Filtering Accuracy**：时间过滤的准确率（是否混入了时间窗外的数据）。

### L2: 时序与状态锚定 (Temporal & State Anchoring)
*   **定义**：涉及相对时间（“之后”、“之前”）和状态变更的检索。
*   **典型问题**：
    *   “回家后做的第一件事是什么？”（需利用 `NEXT_EVENT` 或时间戳排序）
    *   “出门前我锁门了吗？”（需检索特定时间点前的状态）
*   **竞对参照**：Zep (Bi-Temporal Graph)。
*   **核心指标**：
    *   **Order Consistency Score**：返回事件的顺序是否符合真实发生顺序。
    *   **State Accuracy**：状态判定（锁门/未锁门）的准确性。

### L3: 多跳与间接关系 (Multi-hop & Indirect Relations)
*   **定义**：需要跨越 2 个以上节点或利用图谱边（`CO_OCCURS_WITH`, `INVOLVES`）进行的推理。
*   **典型问题**：
    *   “我和 Alice 是怎么认识的？”（需追溯最早的共同 `INVOLVES` 事件）
    *   “经常和 Bob 一起出现的那个戴眼镜的人是谁？”（需利用 `CO_OCCURS_WITH` 权重）
*   **竞对参照**：Microsoft GraphRAG (Local Search)。
*   **核心指标**：
    *   **Graph Traversal Success Rate**：能否成功找到多跳之外的目标节点。
    *   **Explanation Quality**：生成的解释路径（Evidence Chain）是否完整。

### L4: 语义泛化与多模态对齐 (Semantic Generalization)
*   **定义**：基于高层语义描述检索底层多模态证据。
*   **典型问题**：
    *   “我看起来很焦虑的时候通常在做什么？”（需关联 `Emotion` 状态与 `Action` 事件）
    *   “找到所有我摔倒的视频片段。”
*   **竞对参照**：Gemini 1.5 Pro (Long Context Video Understanding)。
*   **核心指标**：
    *   **Semantic Precision**：语义匹配的精确度。
    *   **Evidence Grounding**：返回的片段是否真实包含所述内容。

### L5: 否定逻辑与反事实 (Negative Logic & Counterfactuals)
*   **定义**：处理“没有发生”、“不存在”或排他性条件的复杂逻辑。
*   **典型问题**：
    *   “上周我有哪天完全没有出门？”（需聚合 TimeSlice 并验证 `OUTDOOR` 事件缺失）
    *   “聚会中我有没有和李四说话？”（需验证 `TALK_TO` 边的缺失）
*   **竞对参照**：无（这是大多数现有 RAG 的死穴）。
*   **核心指标**：
    *   **Negative Logic Accuracy**：否定判断的准确率（能否自信地说“没有”）。
    *   **Hallucination Rate**：在无信息时强行编造答案的比率（越低越好）。

---

## 3. 具体的量化测评指标体系

为了实现自动化测评，建议引入 **LLM-as-a-Judge** 机制，并定义以下量化指标：

本节中的指标分为两层：

- **通用指标层（General Metrics）**：对 Mem0 / Zep / GraphRAG / 纯 Vector RAG 等所有系统都公平适用，用于建立“共同底线”的对比。
- **MOYAN 优势指标层（MOYAN Advantage Metrics）**：围绕 L2-L5 的时序、多跳、否定逻辑等能力，专门衡量 MOYAN 的差异化价值。

### 3.1 通用基础性能指标 (General Performance Metrics)

适用范围：所有参与对比的记忆系统（Mem0 / Mem0g / Zep / GraphRAG / 纯向量 RAG / MOYAN）。

*   **P50 / P95 Latency (ms)**:
    *   **Retrieval Latency**: 仅检索（Search/Graph Expand）的耗时。
    *   **E2E Latency**: 包含 LLM 生成最终答案的总耗时。
*   **Token Efficiency**:
    *   **Context Compression Ratio**: $\frac{\text{Raw Context Tokens}}{\text{Retrieved Context Tokens}}$。比率越高，说明系统筛选能力越强，成本越低。

### 3.2 通用质量指标 (General Quality Metrics)

适用范围：主要覆盖 L1-L3 任务（基础事实检索 + 简单时序 + 单/双跳推理），用于保证对竞品的“公平评测”。

*   **Recall@k**：
    *   适用：所有“有显式 Ground Truth 事件集合”的任务（例如“找出昨天所有开会事件”）。
    *   定义：答案所对应的标准事件是否出现在系统返回的 Top-k 检索结果中。
*   **Answer F1 Score**：
    *   适用：答案可以转化为结构化集合的任务（事件 ID 集合 / 日期集合 / 地点集合）。
    *   定义：以 Ground Truth 集合为金标准，计算预测集合的 Precision / Recall / F1。
*   **Time-Filtering Accuracy**：
    *   适用：含有时间窗约束的所有任务（“上周内”、“昨天下午”、“本月”）。
    *   定义：检索结果中，时间戳落在指定时间窗内的结果占比；统计“时间窗外污染率”。

### 3.3 LLM 裁判质量指标 (LLM-as-a-Judge Metrics) - 基于 J-Score

使用 GPT-4o 或 Claude-3.5-Sonnet 作为裁判，对系统输出进行打分（0-10分）：

*   **J-Factuality (事实性)**：答案是否忠实于检索到的 Context，无幻觉。
*   **J-Completeness (完整性)**：是否覆盖了用户问题的所有约束条件（时间、地点、人物）。
*   **J-Temporality (时序性)**：是否正确处理了时间关系（如“之前”、“之后”）。
*   **J-Reasoning (推理深度)**：对于 L3-L5 问题，是否展示了正确的推导过程。

评测方式：

- 对同一套 Query，分别收集各系统的最终自然语言答案；
- 将答案 + 检索到的证据（Context 摘要或事件列表）一并输入裁判模型；
- 按统一模板 Prompt 要求裁判对上述四个维度逐项打 0-10 分，并给出简要理由；
- 对每个维度取平均分，构成系统在该任务集上的 J-Score。

### 3.4 通用业务价值指标 (General Business Metrics)

适用范围：所有具备多租户和线上服务属性的系统。

*   **Tenant Isolation Score**: 在多租户混布数据中，检索结果混入其他租户数据的比例（应严格为 0%）。
*   **Graph Density Utilization**: 实际回答中用到的图谱边数量 / 检索到的总边数量。衡量图谱构建的有效性。

### 3.5 MOYAN 优势指标层（L2-L5 专项）

在上述“通用指标层”之上，针对 MOYAN 的差异化能力，增加以下专项指标：

#### 3.5.1 时序与状态锚定指标（对应 L2）

*   **Order Consistency Score**：
    *   适用：涉及 “之前/之后/第一件/最后一件” 的问题。
    *   定义：对返回的事件序列与真实时间顺序进行比较，可采用 Kendall τ 等秩相关系数度量。
*   **State Accuracy**：
    *   适用：涉及状态判断的问题（锁门/未锁门、开灯/关灯、在线/离线等）。
    *   定义：将状态判断视作分类任务，统计正确率。

#### 3.5.2 多跳与解释路径指标（对应 L3）

*   **Graph Traversal Success Rate**：
    *   适用：多跳关系问题（“我和 Alice 怎么认识的？”、“和 Bob 常一起出现的戴眼镜的人是谁？”）。
    *   定义：系统是否找到与 Ground Truth 相同的目标实体/事件链（True/False 统计）。
*   **Explanation Quality（证据链质量）**：
    *   通过 LLM 裁判打分，考察系统给出的解释路径是否：
        *   涵盖关键中间节点；
        *   没有引入与事实冲突的边。

#### 3.5.3 语义泛化与多模态对齐指标（对应 L4）

*   **Semantic Precision（语义精确度）**：
    *   适用：基于高层语义描述召回底层多模态片段的任务（“我很焦虑时在做什么？”、“所有摔倒的视频”）。
    *   定义：检索结果中，真正符合目标语义的事件/片段比例。
*   **Evidence Grounding（证据落地性）**：
    *   通过 LLM 裁判判定：系统在回答中引用的证据，是否真的包含所述语义内容。

#### 3.5.4 否定逻辑与反事实指标（对应 L5）

*   **Negative Logic Accuracy（否定逻辑准确率）**：
    *   适用：问题形式为“有没有……”、“哪天完全没有……”等任务。
    *   定义：系统在应当回答“没有/不存在/空集”或排除某类事件时，是否做出正确判断。
*   **Hallucination Rate（否定场景幻觉率）**：
    *   定义：在 Ground Truth 明确为“无对应事件”的情况下，系统仍编造事件或事实的比例。
    *   目标：MOYAN 在该指标上显著低于纯向量 RAG / 一般 GraphRAG。

#### 3.5.5 身份统一与实体对齐指标（Identity Unification）

身份统一是支撑“以我为中心”视角的基础能力，用于衡量系统在多源、多账号、多别名下是否能够正确绑定同一真实实体。

1. **离线实体对齐评测**

*   **数据构造**：
    *   构造包含多设备、多账号、多别名的事件流，例如：
        *   `{"participants": ["老王"]}`, `{"participants": ["王强"]}`, `{"participants": ["wang.qiang"]}` 实际指向同一人；
        *   混入若干真正不同的人名，增加干扰。
    *   手工标注真实实体 ID（Gold Entity ID），形成标准实体簇。
*   **指标定义**：
    *   `Identity-Link Precision/Recall/F1`：
        *   将系统内部的实体簇与 Gold 对齐，计算合并/拆分是否正确；
        *   Precision 反映“误合并别人的概率”，Recall 反映“漏合并同一人的概率”。
    *   `Cross-User Leakage Rate`：
        *   统计系统是否把不同用户/tenant 的事件错误地合并到同一身份下；
        *   对于多用户场景，该指标应接近 0。

2. **端到端身份聚合场景**

*   **典型问题**：
    *   “我昨天在所有设备上一共开了几次会？”
    *   “把这周所有和我一起吃饭的人按出现次数排序。”
*   **指标定义**：
    *   仍采用 Answer F1 / J-Factuality / J-Completeness 组合：
        *   通过结构化 Gold（真实聚合结果），计算结果集合的 F1；
        *   裁判模型评估是否存在“把别人当成我”或“漏数自己事件”的情况。

#### 3.5.6 物理时间轴锚定指标（Physical Timeline Anchoring）

物理时间轴锚定关注的是：在存在时区、设备时钟误差和延迟写入等问题时，系统是否仍能在统一时间轴上保持事件顺序与时间窗判断的正确性。

1. **时间归一离线测试**

*   **数据构造**：
    *   人为制造不一致的时间记录：
        *   不同设备采用不同的时区；
        *   某些设备存在固定偏差（快/慢若干分钟）；
        *   部分事件延迟写入（记录时间晚于真实发生时间）。
    *   Gold 记录每个事件的真实物理时间戳。
*   **指标定义**：
    *   `Time Normalization Error`：
        *   对比系统内部归一后的时间戳与 Gold 的差异（以秒/分钟为单位，统计 P50 / P95）。
    *   `Order Violation Rate`：
        *   在应当满足 `event_a < event_b` 的 Gold 约束下，统计系统内部仍出现 `event_a >= event_b` 的比例。

2. **端到端时间窗与时序场景**

*   **典型问题**：
    *   “昨天下午 3 点到 4 点之间我在做什么？”（多设备事件混合）；
    *   “从我真正搬到北京之后的一周内，我每天几点睡觉？”（依赖物理搬家时间点，而非单个对话中叙事时间）。
*   **指标定义**：
    *   复用 Time-Filtering Accuracy / Order Consistency / J-Temporality：
        *   检查事件是否正确落入指定物理时间窗；
        *   检查回答中事件顺序是否与 Gold 时序一致；
        *   通过裁判模型评估回答在时间表达上的严谨性（是否混淆“过去/现在/未来”）。

---

## 4. 竞对分析执行方案 (Action Plan)

### 4.1 搭建统一测评数据集 (Benchmark Dataset)
我们需要构建一个标准化的 **"LifeLog-Bench"** 数据集。为了兼顾行业标准与 LifeLog 特性，该数据集将由两部分组成：

1.  **Adapted-Standard (基于行业基准改编)**：
    *   **来源**：选取 **LoCoMo** (Temporal/Multi-hop) 和 **LongMemEval** (Abstention/Update) 的核心测试集。
    *   **改造**：将原始 Chat 记录转化为 LifeLog 事件流（Event Stream），保留原有的 Ground Truth 逻辑。
    *   **用途**：用于 L2, L3, L5 的标准化评分，直接与 Mem0/Zep 对比。

2.  **Native-LifeLog (原生 LifeLog 模拟)**：
    *   **来源**：基于脚本生成的模拟人生日志（包含地点移动、会议、对话、情绪变化、多设备数据）。
    *   **特点**：包含预埋的“因果链”、“共现模式”和“否定陷阱”。
    *   **用途**：测试 L1 检索、L4 语义泛化以及物理时间轴锚定能力。

### 4.1.1 数据 Schema 约定（LifeLog-Bench v1）

为确保不同系统在同一数据基础上公平比较，统一采用如下抽象事件结构：

```json
{
  "event_id": "string",
  "timestamp": "ISO8601",
  "location": "string | null",
  "participants": ["string"],
  "event_type": "string",
  "states": {
    "locked": "bool | null",
    "mood": "string | null",
    "indoor": "bool | null"
  },
  "text": "原始文本/描述",
  "media_refs": ["string"], 
  "relations": [
    {
      "type": "NEXT_EVENT | CAUSES | CO_OCCURS_WITH | TALK_TO | ...",
      "target_event_id": "string"
    }
  ],
  "tenant_id": "string",
  "user_id": "string"
}
```

说明：

- 上述结构是对 lifelog 的抽象层，所有系统都从这一层 ingest 数据；
- MOYAN 会在内部将其映射为 `TKG 节点 + 向量存储` 的双结构；
- Mem0 / 纯向量系统只需使用 `text + 元数据 (timestamp, user_id, tenant_id)` 构建向量索引；
- Zep / GraphRAG 可利用 `relations` 部分构建知识图谱。

### 4.2 竞品对比测试 (Head-to-Head Battle)

| 维度           | 对比对象     | 测试方法                                                      | MOYAN 预期优势                                                   | MOYAN 潜在风险                                                      |
| :------------- | :----------- | :------------------------------------------------------------ | :--------------------------------------------------------------- | :------------------------------------------------------------------ |
| **个性化记忆** | **Mem0**     | 同样输入 100 条用户偏好与经历，测试 L1 检索准确率与更新速度。 | **结构化更强**：能区分“以前喜欢”和“现在喜欢”（通过 TimeSlice）。 | **延迟**：图谱构建与检索可能比纯向量慢。                            |
| **时序推理**   | **Zep**      | 输入乱序的事件流，测试 L2 问题（“A 发生后 B 发生了吗？”）。   | **事件链 (NEXT_EVENT)**：显式建模了事件顺序，不仅依赖时间戳。    | **构建成本**：需要额外步骤生成 NEXT_EVENT 边。                      |
| **全局理解**   | **GraphRAG** | 输入长篇日志，测试“总结这一周的主要活动模式”。                | **以我为主**：更关注 Ego-centric 的视角，而非宏观摘要。          | **全局摘要**：GraphRAG 的 Map-Reduce 社区摘要算法在宏观理解上极强。 |

### 4.3 实施路线图
1.  **v0.8/v0.9 阶段**：完成 **"LifeLog-Bench" (Synthetic)** 的构建与 L1-L5 的单元测试覆盖（已在进行中）。
2.  **v1.0 阶段**：
    *   部署 **Mem0** 和 **Zep** 的开源版作为 Baseline。
    *   运行 `scripts/benchmark_v1_queries.py` 对比 MOYAN 与 Baseline 在 L1-L3 任务上的表现。
    *   生成对比报告，重点展示 **Token Efficiency**（MOYAN 检索更精准，Token 更少）和 **J-Temporality**（时序推理更强）。

### 4.4 统一评测流程与系统适配

为避免评测逻辑随实现分散，推荐设立一套统一的 benchmark harness，约定如下接口与流程：

1. **系统适配层（Adapters）**

所有被评测系统实现统一接口：

- `ingest_events(events: List[Event]) -> None`  
  将标准化事件列表导入系统内部存储（向量库 / 图数据库 / 组合结构）。
- `answer(query: Query) -> Answer`  
  完整执行“检索 + LLM 生成”，返回最终答案文本与使用到的证据引用。
- `retrieve_raw(query: Query) -> RetrievalResult`  
  仅执行检索/图遍历，返回候选事件/片段列表及相关元数据（用于计算 Recall@k 等检索指标）。

2. **评测执行层（Runner）**

统一的评测脚本负责：

- 读取 `LifeLog-Bench` 中的事件与 Query 套餐（按 L1-L5 分类）；
- 调用各系统的 `ingest_events` 完成数据导入；
- 对每条 Query：
    * 记录检索开始/结束时间、E2E 开始/结束时间；
    * 收集检索结果（事件 ID 列表）与最终答案；
    * 统计 token 使用量（提示 + 输出）；
    * 按 3.1~3.5 中定义的规则计算各项指标；
    * 将答案 + 证据送入 LLM 裁判模型，获取 J-Score。

3. **报告生成层（Reporting）**

按照以下结构输出对比报告：

- 第一部分：**通用指标对比**（所有系统）  
  - L1-L3 上的 Recall@k / Answer F1 / Time-Filtering / P50/P95 Latency / Token Efficiency / Tenant Isolation。
- 第二部分：**MOYAN 优势指标对比**  
  - L2-L5 上的 Order Consistency / State Accuracy / Graph Traversal Success Rate / Explanation Quality / Semantic Precision / Negative Logic Accuracy / Hallucination Rate。
- 第三部分：**工程与成本侧观测**  
  - Storage per event / 索引构建时间 / 后台维护任务负载（如图谱更新、摘要生成）。

### 4.5 外部公开基准与 LifeLog-Bench 的融合策略 (Adopt & Adapt)

为了确保 MOYAN 的评测结果与行业现有工作（如 Mem0, Zep）具备直接可比性，同时又能体现 LifeLog 场景的特殊性，我们采取 **"Adopt & Adapt" (采纳并适配)** 策略，将行业基准映射到 LifeLog-Bench 中。

#### 1. 行业基准的直接映射（The "Adopt" Part）

我们将直接复用以下顶级基准的核心任务逻辑与评价指标：

| MOYAN 能力层级    | 对标行业基准    | 具体复用任务                                                     | 竞品参考数据                                    |
| :---------------- | :-------------- | :--------------------------------------------------------------- | :---------------------------------------------- |
| **L2 (时序推理)** | **LoCoMo**      | **Temporal Reasoning**：复用其“事件先后”、“相对时间”类问题逻辑。 | Mem0 在 LoCoMo 上声称优于 OpenAI Memory。       |
| **L3 (多跳推理)** | **LoCoMo**      | **Multi-hop QA**：复用其跨 Session 实体关联问题。                | -                                               |
| **L5 (否定逻辑)** | **LongMemEval** | **Abstention**：复用其“信息不足时拒绝回答”的测试集。             | Zep 在 LongMemEval 上声称 Accuracy 提升 18.5%。 |
| **动态更新**      | **LongMemEval** | **Knowledge Updates**：复用其“用户属性变更”测试逻辑。            | -                                               |

#### 2. LifeLog 领域的适配改造（The "Adapt" Part）

由于 LoCoMo 和 LongMemEval 原生数据均为 **Chat（对话）** 形式，而 MOYAN 处理的是 **LifeLog（事件流）**，我们需要进行如下适配（Data Transformation）：

*   **Chat-to-Event 转换**：
    *   将 LoCoMo 中的多轮对话 `User: "I'm going to Paris next week."` 转换为 LifeLog 事件 `Event(text="Plan to go to Paris", time=T, type="plan")`。
    *   保留原数据集的 Ground Truth（答案），但输入 Context 替换为 MOYAN 检索出的事件列表。
*   **增加时空噪声**：
    *   在原基准的纯净时间轴上，注入 LifeLog 特有的噪声（如 GPS 漂移、时间戳乱序），测试 MOYAN 的 **物理时间轴锚定** 能力。

#### 3. 差异化补充（The "Gap Filling" Part）

针对行业基准未覆盖的 MOYAN 核心优势，我们在 LifeLog-Bench 中补充：

*   **Ego-centric Graph Traversal**：GraphRAG 侧重全局摘要，我们补充“以我为中心”的路径查找（L3-L4）。
*   **Multimodal Grounding**：LoCoMo 的多模态仅限于图片对话，我们补充“视频片段检索”与“行为语义对齐”（L4）。

通过这种策略，MOYAN 的评测报告将包含两部分：
1.  **"Standard Alignment"**：在 LoCoMo/LongMemEval 变体任务上的得分，直接证明 "MOYAN vs Mem0/Zep" 的优劣。
2.  **"LifeLog Specialization"**：在 LifeLog 专有任务上的得分，证明 "Why General RAG fails here"。

## 5. 总结

MOYAN 的测评不应卷“通用问答”，而应卷 **“时空情境下的精准回溯”**。通过 L1-L5 的分层测评，我们可以清晰地界定系统的能力边界，并向用户证明：**在复杂的时空伴随场景下，MOYAN 是比纯向量 RAG 更可靠的记忆中枢。**
