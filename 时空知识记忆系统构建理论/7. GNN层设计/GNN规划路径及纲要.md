# 时空知识图谱 GNN 演进规划与纲要 (GNN-Driven TKG Roadmap)

> **Author**: Linus Torvalds (Virtual Persona)
> **Date**: 2025-12-21 (Updated)
> **Status**: Draft / Phase 0
> **Context**: 解决“脑体分离”瓶颈，引入自监督学习（Self-Supervised Learning）实现动态 TTL 与事件预测。

---

## 1. 核心战略：从“静态查询”到“动态推理”

### 1.1 现状诊断 (The Diagnosis)
我们当前的架构是经典的 **RAG (Retrieval-Augmented Generation)** 模式：
*   **各司其职**：Qdrant 负责“搜”（Top-K 相似度召回），Neo4j 负责“查”（多跳关系遍历）。
*   **致命缺陷**：对于 **GNN (图神经网络)** 训练与推理，这种架构是灾难性的。
    *   GNN 需要同时访问 **$A$ (邻接矩阵/结构)** 和 **$X$ (特征矩阵/向量)**。
    *   现状下，GNN 遍历图结构（Neo4j）后，必须跨网络请求去 Qdrant 查向量。
    *   **Result**: IO 瓶颈将导致训练速度下降 10-100 倍，且无法进行实时推理。

### 1.2 决策：冗余存储 (Redundancy Strategy)
我们**不**废弃 Qdrant，因为 Neo4j 的向量索引在高并发 KNN 场景下仍不如 Qdrant 纯粹和高效。
我们采用 **“双模存储”** 策略：

1.  **Qdrant (The Gatekeeper)**: 继续作为 **检索入口**。负责用户 Query 的快速召回。
2.  **Neo4j (The Brain)**: 作为 **计算基座**。
    *   **变更点**：将 Embedding Vector 作为 `LIST<FLOAT>` 属性 **冗余** 写入 Neo4j 节点。
    *   **目的**：实现 **Data Locality (数据局部性)**。GNN 算子在访问节点时，能直接读取内存中的向量属性，无需网络跳转。

---

## 2. 演进路径 (Execution Roadmap)

### Phase 1: 数据基础设施升级 (Data Infra)
**目标**：打通“向量入图”的管道，确保新数据具备 GNN 就绪 (GNN-Ready) 的格式。

*   **1.1 Schema 变更**
    *   在 Neo4j 节点（`Entity`, `Event`, `Evidence`）增加属性 `embedding: float[]`。
*   **1.2 写入层改造 (`neo4j_store.py`)** & **Graph WAL (Write-Ahead Log)**
    *   **Logic**: 当传入 `GraphUpsertRequest` 包含 `vectors` 字段时，保留为浮点数组写入 Cypher `SET n.embedding = $vec`。
    *   **Artifact**: 同时将 `GraphUpsertRequest` 对象转存为 JSON 文件（`data/graph_logs/session_X.json`）。这些文件将成为未来 GNN 训练的**离线数据集**（Zero-IO cost for Data Loading）。

### Phase 2: 算子与管道构建 (Operators & Pipeline)
**目标**：建立 PyTorch Geometric (PyG) 与 TKG 的连接桥梁。
*   **2.1 Data Loader**: 实现 `TKGGraphLoader`，支持从 Neo4j 子图采样（Neighbor Sampling）。
*   **2.2 Model Serving**: 集成 GNN 推理环境。

### Phase 3: 核心模型落地 (Core Models) —— **已细化**
请见下文第 3、4 章节详细说明。

---

## 3. 核心任务与自监督训练策略 (Core Tasks & Self-Supervision)

我们面临的 TTL 和预测问题，不需要昂贵的人工标注。**Your Log is Your Label.**

### 3.1 动态 TTL (Dynamic TTL / The Reaper)
**目标**：预测节点未来的“访问价值”，自动清理垃圾（如 ASR 噪声），保留长期记忆。
*   **数据构造 (Self-Supervised Labeling)**:
    *   **Input ($X$)**: $T$ 时刻的节点状态（Embedding, Degree, Type, Age）。
    *   **Label ($Y$)**: **未来 $N$ 天内是否出现在搜索日志中？** ($1=$Yes, $0=$No)。
    *   **来源**: 系统的 `search/retrieval` 访问日志。
*   **训练方式**:
    *   离线从日志中回溯构建 Dataset。
    *   每周通过 Airflow/Job 重新训练一次轻量级模型。
*   **应用**: 每天扫描全图，对 $P(active) < Threshold$ 的节点执行软删除（Archiving）。

### 3.2 下一步预测 (Next Event Prediction / The Oracle)
**目标**：给定当前事件序列，预测下一个可能发生的事件（或调用的 Tool/Action）。
*   **数据构造 (Self-Supervised)**:
    *   **Input ($X$)**: 时间 $0 \dots T$ 的事件子图。
    *   **Label ($Y$)**: 时间 $T+1$ 真实发生的事件（类型、属性、连边）。
    *   **来源**: **Graph WAL 日志** (我们存下的那堆 JSON)。未来就是最好的标签。
*   **训练方式**: **Time-based Split**。用前 80% 的时间训练，预测后 20% 的边。

### 3.3 实体对齐 (Entity Resolution / The Merger)
*   **目标**: 合并 "Linus" 和 "Linus Torvalds"。
*   **数据**: 这是一个**硬骨头**。很难完全自监督。
    *   **银标准**: 使用强规则（编辑距离 < 2 & 共享邻居 > 3）生成伪标签。
    *   **模型**: 学习 Embedding 空间中的相似度度量 (Metric Learning)。

---

## 4. 可用模型选型与 TKG 匹配 (Model Selection for TKG)

如果 TTL 没有现成模型，以下是学术界与工业界验证过的 **SOTA 架构**，完全适配我们的 TimeSlice 与 Event 图结构。

| 任务场景 | 推荐模型架构 | 匹配理由 (Why Fit TKG?) |
| :--- | :--- | :--- |
| **动态 TTL**<br>(Node Classification) | **GraphSAGE** (Inductive) | **归纳式学习**。它不需要重新训练就能处理新出现的节点（Inductive），这是动态图的刚需。它能高效聚合 $K$-hop 邻居信息来判断当前节点的重要性。 |
|  | **TGN** (Temporal Graph Networks) | **时序原生**。它内置了内存模块 (Memory Module) 记录节点状态随时间的演变，对于预测“长期不活跃但突然活跃”的节点（如周期性事件）非常有效。 |
| **下一步预测**<br>(Link Prediction) | **RE-NET** (Recurrent Event Network) | **TKG 专用**。专门为 Temporal Knowledge Graph 设计。它结合了 RNN（处理时间序列）和 GCN（处理图结构）。它可以直接预测 "Subject -> Predicate -> ?" 三元组。 |
|  | **DyRep** / **JODIE** | **事件驱动**。适合由微观交互（interactions）组成的图。如果我们的 Event 粒度很细（如每一句对话），这两个模型非常合适。 |
| **静态对齐**<br>(Entity Resolution) | **RotatE** / **TransE** | **经典 KGE**。将关系建模为向量空间中的旋转/平移。虽然是静态的，但计算 Entity 之间的语义距离（Semantic Distance）非常有效，是做 Entity Merging 的首选基线。 |

### 4.1 与 Neo4j/Qdrant 的匹配架构
*   **GraphSAGE / TGN**:
    *   **Loader**: 从 Neo4j 读取 `(Adjacency, Embedding)`。
    *   **Training**: PyTorch Geometric (PyG)。
*   **Inference (Online)**:
    *   直接在 Python 服务 (`modules/memory`) 中加载训练好的 PyG 模型（ONNX 或 TorchScript）。
    *   从 Neo4j 实时拉取子图特征 -> 模型 Forward -> 得到 Probability。

---

## 5. 接口预留与协议 (Interface Definitions)

### 3.1 写入侧 (`write`)
**Requirement**: `neo4j_store.upsert_graph_v0` 必须显式处理 `vectors` 字段。

```python
# modules/memory/infra/neo4j_store.py

async def upsert_graph_v0(self, ..., vectors_map: Dict[str, List[float]] = None) -> None:
    """
    vectors_map: {node_id: [0.1, 0.2, ...]}
    在 MERGE 节点时，执行 SET n.embedding = vectors_map[id] (LIST<FLOAT>)
    """
```

### 3.2 训练侧 (`read`)
新增 `GraphLearningPort`：

```python
# modules/memory/ports/graph_learning_port.py

class GraphLearningPort(Protocol):
    async def export_subgraph_for_training(
        self, 
        time_range: Tuple[datetime, datetime], 
        node_types: List[str]
    ) -> PyGData:
        """
        导出用于 GNN 训练的子图。
        - x: 节点特征矩阵 (包含了从 Qdrant 搬运过来的 embedding)
        - edge_index: 边列表
        - edge_attr: 边属性 (时间戳, 权重)
        """
```

---

## 6. 总结 (Conclusion)

1.  **GNN 并不遥远**: 你不需要去重新发明轮子。GraphSAGE 和 TGN 都是成熟的积木。
2.  **数据先行**:
    *   **今天**: 必须开始把 **Embedding 写进 Neo4j** (解决脑体分离)。
    *   **今天**: 必须开始把 **Graph Upsert Request 存成 JSON** (积累自监督数据)。
3.  **模型后置**: 等数据积累两周后，我们再用 GraphSAGE 跑第一个 TTL 模型。

> *"Talk is cheap. Show me the data."* —— 只要我们现在开始正确存储数据，未来的“智能图”就是水到渠成。
