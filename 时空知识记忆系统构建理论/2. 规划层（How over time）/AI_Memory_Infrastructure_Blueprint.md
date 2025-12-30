# AI Memory Infrastructure Blueprint

> **目标**：本文档定义 AI Agent 如何有效使用时空知识记忆体（TKG）来回答问题，是系统设计的顶层蓝图。
>
> **关联文档**：
> - Schema 定义：`../3. Schema 层（What exactly in code）/TKG-Graph-v1.0-Ultimate.md`
> - 对标问题清单：`记忆检索与推理对标清单.md`
> - 检索 API：`modules/memory/docs/RETRIEVAL_API_AND_WORKFLOW.md`

---

## 一、核心架构：Agent 如何"想起来"

系统本质是一个 **时空知识记忆体 (Temporal Knowledge Graph)**，连接多模态感知数据（faces/audio/objects/events），提供多路径检索能力让 Agent 高效"回想"。

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AGENT QUERY LAYER                               │
│   "上周五我去了哪些地方？" / "我和 Alice 是怎么认识的？"                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
            │  Intent Route │ │  Entity Route │ │  Time Route   │
            │  (语义召回)    │ │  (实体锚点)    │ │  (时间片锚点)  │
            └───────────────┘ └───────────────┘ └───────────────┘
                    │               │               │
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    HYBRID RETRIEVAL ORCHESTRATION                       │
│        Qdrant(Vector ANN) ←→ RRF Fusion ←→ Neo4j(Graph Expand)         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     TEMPORAL KNOWLEDGE GRAPH (TKG)                      │
│                                                                         │
│  ┌──────────┐    SUPPORTED_BY     ┌─────────────────┐                  │
│  │  Event   │◄────────────────────│ UtteranceEvidence│                 │
│  │ (what)   │                     │   (raw speech)   │                 │
│  └────┬─────┘                     └────────┬────────┘                  │
│       │ INVOLVES                           │ SPOKEN_BY                 │
│       ▼                                    ▼                           │
│  ┌──────────┐    EQUIV/EQUIV_PENDING  ┌──────────┐                     │
│  │  Entity  │◄────────────────────────│Face/Voice│                     │
│  │ (who)    │                         │ Evidence │                     │
│  └────┬─────┘                         └──────────┘                     │
│       │ OCCURS_AT / LOCATED_IN                                         │
│       ▼                                                                │
│  ┌──────────────────┐   ┌───────────┐                                  │
│  │ TimeSlice/Region │   │   Place   │                                  │
│  │  (when/where)    │   │  (where)  │                                  │
│  └──────────────────┘   └───────────┘                                  │
│                                                                         │
│  Additional Edges: NEXT_EVENT, CAUSES, CO_OCCURS_WITH, TRANSITIONS_TO  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.1 两套图的职责分离

| 图类型 | 存储位置 | 职责 | 检索入口 |
|--------|----------|------|----------|
| **Typed TKG Graph** | Neo4j | 真相图：Event/Entity/Evidence/TimeSlice... 带结构化查询与证据链 | `/graph/v1/search` |
| **MemoryNode Projection** | Neo4j | 投影图：`:MemoryNode` 用于 `/search` 邻域扩展 | `/search` + `expand_graph=true` |
| **Vector Index** | Qdrant | 向量粗召回（ANN）：text/image/audio/face collections | `/search` (seeds) |

### 1.2 核心数据流

```
多模态输入 (Video/Audio/Text)
         │
         ▼
┌─────────────────────────┐
│   Memorization Agent    │  ← 特征提取、切片、建图
│   (VideoGraph 生成)      │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   Memory Service        │  ← 统一写入 Qdrant + Neo4j
│   (MemoryPort.write)    │
└──────────┬──────────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
 [Qdrant]    [Neo4j]
  向量库       图库
     │           │
     └─────┬─────┘
           │
           ▼
┌─────────────────────────┐
│   Retrieval Layer       │  ← 三路并行召回 + RRF 融合
│   (dialog_v2 策略)       │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│   Control Agent         │  ← 检索结果 → LLM 上下文
│   (ContextBuilder)      │
└─────────────────────────┘
```

---

## 二、五层问题的检索策略矩阵

基于 22 个对标问题（见 `记忆检索与推理对标清单.md`），Agent 按问题复杂度采用不同检索策略：

| 层级 | 问题类型 | 典型问题 | 主召回路径 | 图扩展策略 | 跳数 |
|------|----------|----------|-----------|-----------|------|
| **L1** | 基础事实 | "上周五我去了哪些地方？" | Vector ANN (语义) | 单向 1-hop | 1 |
| **L2** | 时序状态 | "我回家后做的第一件事？" | Time Route + Entity Route | 链式 2-hop | 2-3 |
| **L3** | 多跳推理 | "我和 Alice 怎么认识的？" | Entity Route + Graph BFS | 双向 2-3 hop | 2-3 |
| **L4** | 语义泛化 | "我焦虑时在做什么？" | Vector ANN + 知识层 | 属性过滤 | 1-2 |
| **L5** | 否定推理 | "哪天我没出门？" | 全量扫描 + Set 差集 | 反向查询 | N/A |

### 2.1 检索路径组合规则

```python
def select_retrieval_routes(question_level: str) -> List[Route]:
    """基于问题层级选择检索路径组合"""
    routes = {
        "L1": [VectorANN()],
        "L2": [TimeRoute(), EntityRoute(), GraphChain()],
        "L3": [EntityRoute(), MultiHopBFS()],
        "L4": [VectorANN(), KnowledgeLayer(), CrossModal()],
        "L5": [FullScan(), SetDifference()],
    }
    return routes.get(question_level, [VectorANN()])
```

---

## 三、具体问题的检索路径设计

### 3.1 L1 基础事实检索 (Direct Lookup)

#### 问题 1："上周五我去了哪些地方？"

```cypher
-- Step 1: Time Route 识别时间片
MATCH (ts:TimeSlice{granularity: "day", date: "2024-12-20"})

-- Step 2: 查询该时间片内的事件和地点
MATCH (e:Event)-[:OCCURS_AT]->(ts)
MATCH (e)-[:OCCURS_AT|LOCATED_IN]->(p:Place)
RETURN DISTINCT p.name, e.summary
```

**检索路径**：`Time Route → Graph Query → Place List`

#### 问题 3："画面里出现过红色的杯子吗？"

```cypher
-- Step 1: 向量召回 + 属性过滤
-- Vector ANN: query="红色杯子" → Evidence candidates

-- Step 2: 精确属性查询
MATCH (ev:Evidence{type: "object"})
WHERE ev.name CONTAINS "cup" AND ev.color = "red"

-- Step 3: 关联媒体片段
MATCH (ev)<-[:CONTAINS_EVIDENCE]-(seg:MediaSegment)
RETURN seg.recorded_at, ev.bbox
```

**检索路径**：`Vector ANN → Attribute Filter → MediaSegment`

---

### 3.2 L2 时序与状态流转 (Temporal & State)

#### 问题 5："我回家后做的第一件事是什么？"

```cypher
-- Step 1: 向量召回锚点事件
-- Vector ANN: query="回家" → Event_home_arrive

-- Step 2: NEXT_EVENT 链式查询
MATCH (e:Event)-[:NEXT_EVENT]->(next:Event)
WHERE e.summary CONTAINS "到家" OR e.summary CONTAINS "回家"
RETURN next ORDER BY next.t_media_start LIMIT 1

-- Step 3: 获取证据
MATCH (next)-[:SUPPORTED_BY]->(u:UtteranceEvidence)
RETURN u.raw_text
```

**检索路径**：`Vector ANN → NEXT_EVENT chain → Evidence`

#### 问题 7："我的车钥匙现在在哪？"

```cypher
-- 方案 A：State 节点查询（如果有状态追踪）
MATCH (key:Entity{name: "car_key"})-[:HAS_STATE]->(s:State)
WHERE s.property = "location"
RETURN s.value ORDER BY s.valid_time DESC LIMIT 1

-- 方案 B：事件序列回放
MATCH (e:Event)-[:INVOLVES]->(key:Entity{name: "car_key"})
WHERE e.action IN ["put", "place", "leave", "drop"]
RETURN e.summary, e.t_abs_end ORDER BY e.t_abs_end DESC LIMIT 1
```

**检索路径**：`Entity Route → State Replay / Event Sequence`

---

### 3.3 L3 多跳推理 (Multi-hop)

#### 问题 9："我和 Alice 是怎么认识的？"

```cypher
-- Step 1: Entity Route 解析人物实体
-- Me: Entity{global_id: $current_user}
-- Alice: Entity{name: "Alice", type: "Person"}

-- Step 2: 最早共同事件查询
MATCH (me:Entity{global_id: $user})-[:INVOLVES]-(e:Event)-[:INVOLVES]-(alice:Entity{name: "Alice"})
RETURN e ORDER BY e.t_abs_start ASC LIMIT 1

-- Step 3: Explain 证据链
MATCH (e)-[:SUPPORTED_BY]->(u:UtteranceEvidence)
MATCH (e)-[:OCCURS_AT]->(p:Place)
RETURN e.summary, u.raw_text, p.name
```

**检索路径**：`Entity Route × 2 → Shared Event (earliest) → Explain`

#### 问题 11："找到那个经常和 Bob 一起出现的戴眼镜的男人"

```cypher
-- Step 1: Entity Route
MATCH (bob:Entity{name: "Bob"})

-- Step 2: CO_OCCURS 共现统计
MATCH (bob)-[r:CO_OCCURS_WITH]->(other:Entity{type: "Person"})
RETURN other, r.count ORDER BY r.count DESC LIMIT 10

-- Step 3: 视觉属性过滤
MATCH (other)<-[:BELONGS_TO_ENTITY]-(ev:Evidence)
WHERE ev.has_glasses = true AND ev.gender = "male"
RETURN other.name, ev.face_image
```

**检索路径**：`Entity Route → CO_OCCURS top-K → Attribute Filter`

---

### 3.4 L4 语义泛化与跨模态 (Semantic & Cross-modal)

#### 问题 13："我看起来很焦虑的时候都在做什么？"

```cypher
-- Step 1: 情绪标签查询
MATCH (ev:Evidence{emotion: "anxious"})
MATCH (ev)<-[:CONTAINS_EVIDENCE]-(seg:MediaSegment)

-- Step 2: 关联事件
MATCH (seg)<-[:SUMMARIZES]-(e:Event)

-- Step 3: 行为模式统计
RETURN e.action, e.scene, COUNT(*) as freq ORDER BY freq DESC
```

**检索路径**：`Emotion Evidence → MediaSegment → Event → Action Pattern`

#### 问题 15："帮我找一下那张写着 Wifi 密码的便利贴"

```cypher
-- Step 1: OCR/Text 证据查询
MATCH (te:TextEvidence)
WHERE te.raw_text CONTAINS "password" OR te.raw_text CONTAINS "wifi" OR te.raw_text CONTAINS "SSID"

-- Step 2: 关联物体
MATCH (te)<-[:SUPPORTED_BY]-(obj:Entity{type: "Object"})
WHERE obj.name CONTAINS "note" OR obj.name CONTAINS "paper"

-- Step 3: 位置追踪
MATCH (e:Event)-[:INVOLVES]->(obj)
MATCH (e)-[:OCCURS_AT]->(p:Place)
RETURN obj, p.name ORDER BY e.t_abs_end DESC LIMIT 1
```

**检索路径**：`Text Evidence → Object Entity → Last Known Location`

---

### 3.5 L5 否定与边缘情况 (Negative & Edge Cases)

#### 问题 17："上个月我有哪天完全没有出门？"

```python
# Step 1: 生成日期全集
date_range = generate_date_range("2024-11-01", "2024-11-30")

# Step 2: 查询有出门记录的日期
query = """
MATCH (e:Event)-[:OCCURS_AT]->(p:Place{area_type: "outdoor"})
WHERE e.t_abs_start >= $month_start AND e.t_abs_end <= $month_end
RETURN DISTINCT date(e.t_abs_start) as outdoor_date
"""
outdoor_dates = execute(query)

# Step 3: 差集计算
no_outdoor_days = set(date_range) - set(outdoor_dates)
return sorted(no_outdoor_days)
```

**检索路径**：`Date Range Generation → Event Query → Set Difference`

#### 问题 20："只有我和女朋友两个人的场景"

```cypher
-- 排他性约束查询
MATCH (e:Event)-[:INVOLVES]->(p:Entity{type: "Person"})
WITH e, COLLECT(p.global_id) as participants
WHERE participants = [$me_id, $gf_id] AND SIZE(participants) = 2
RETURN e
```

**检索路径**：`Entity Route → Participant Enumeration → Exclusive Filter`

---

## 四、统一检索入口：dialog_v2 策略

### 4.1 三路并行召回架构

```
                    ┌─────────────────────────────────────────┐
                    │           User Query                    │
                    │   "我回家后做的第一件事是什么？"          │
                    └───────────────┬─────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
    │   E_graph       │   │   E_vec         │   │   Route_E/T     │
    │ /graph/v1/search│   │ Qdrant ANN      │   │ Entity/Time     │
    │ (Fulltext)      │   │ (Semantic)      │   │ (Anchor)        │
    └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
             │                     │                     │
             └─────────────────────┼─────────────────────┘
                                   ▼
                        ┌─────────────────────┐
                        │    RRF Fusion       │
                        │  (K=50 candidates)  │
                        └──────────┬──────────┘
                                   ▼
                        ┌─────────────────────┐
                        │   Dedup + TopN      │
                        │   (Seeds for        │
                        │    Explain)         │
                        └──────────┬──────────┘
                                   ▼
                        ┌─────────────────────┐
                        │  Evidence Explain   │
                        │  (Optional)         │
                        └─────────────────────┘
```

### 4.2 代码入口

```python
# modules/memory/retrieval.py
async def retrieval(
    store: MemoryPort,
    *,
    tenant_id: str,
    user_tokens: Sequence[str],
    query: str,
    strategy: str = "dialog_v2",      # Event-first 多路并行
    backend: str = "tkg",              # 使用 TKG 图结构
    topk: int = 30,
    enable_entity_route: bool = True,  # 实体锚点路由
    enable_time_route: bool = True,    # 时间片路由
    tkg_explain: bool = True,          # 证据链解释
    tkg_explain_topn: int = 5,
    candidate_k: int = 50,             # 候选池大小
    seed_topn: int = 15,               # Explain 的种子数
) -> Dict[str, Any]:
    """
    dialog_v2 策略：
    1. E_graph: /graph/v1/search (Fulltext on Event.summary)
    2. E_vec: Qdrant ANN on utterance index
    3. Route_E: Entity 实体锚点
    4. Route_T: TimeSlice 时间片锚点
    
    → RRF Fusion → Top-K Seeds → Explain (证据链)
    """
```

### 4.3 检索结果结构

```python
@dataclass
class RetrievalResult:
    hits: List[Hit]           # 排序后的检索结果
    neighbors: Dict           # 图扩展邻居
    hints: str                # LLM 友好的文本摘要
    trace: Dict               # 调试信息（延迟、路径、权重等）
    
@dataclass
class Hit:
    id: str                   # Event ID
    score: float              # 融合分数
    event: Event              # 事件详情
    entities: List[Entity]    # 涉及实体
    evidences: List[Evidence] # 支撑证据
    utterances: List[str]     # 原话/ASR
```

---

## 五、Agent 上下文构建

### 5.1 ContextBuilder 工作流

```python
# modules/control_agent/application/context/builder.py
class ContextBuilder:
    async def build(
        self,
        intent_text: str,
        memory_port: MemoryPort,
        user_id: List[str],
        memory_domain: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """将检索结果转换为 LLM 可理解的上下文"""
        
        # 1. 执行检索
        sr = await memory_port.search(
            intent_text,
            topk=self.default_topk,
            filters=SearchFilters(user_id=user_id, memory_domain=memory_domain),
            expand_graph=True,
        )
        
        # 2. 构建结构化记忆卡片
        card = {
            "context_card": {
                "sources": ["memory.search"],
                "time_range": "auto",
                "confidence": 1.0 if sr.hints else 0.0,
                "highlights": [sr.hints] if sr.hints else [],
            }
        }
        
        # 3. 注入 LLM messages
        messages = [
            {"role": "system", "content": json.dumps(card, ensure_ascii=False)}
        ]
        
        return messages
```

### 5.2 记忆卡片结构

```json
{
  "context_card": {
    "sources": ["memory.search", "graph.explain"],
    "time_range": "2024-12-20 to 2024-12-26",
    "confidence": 0.85,
    "highlights": [
      "上周五去了咖啡厅和图书馆",
      "与 Alice 在会议室讨论了项目进度"
    ],
    "entities": ["Alice", "Bob", "咖啡厅"],
    "evidence": [
      "你说：'我下午去图书馆看看有没有那本书'",
      "画面：咖啡厅内，桌上有笔记本电脑"
    ]
  }
}
```

---

## 六、关键设计约束

### 6.1 资源限制（防止图爆炸）

```python
# 默认查询约束
DEFAULT_MAX_HOPS = 2-3
DEFAULT_NEIGHBOR_CAP = 15
DEFAULT_TOPK = 30
DEFAULT_CANDIDATE_K = 50

# 关系白名单（默认只扩展这些）
DEFAULT_REL_WHITELIST = [
    "SUPPORTED_BY",   # 证据
    "INVOLVES",       # 参与者
    "OCCURS_AT",      # 时间/空间
    "NEXT_EVENT",     # 时序
    "SPOKEN_BY",      # 说话人
]

# 高成本关系（需显式 opt-in）
HIGH_COST_RELATIONS = ["CAUSES", "CO_OCCURS_WITH"]
```

### 6.2 多模态身份对齐

```
Face Evidence ──┐
                │ EQUIV / EQUIV_PENDING
Voice Evidence ─┼─────────────────────────► Entity (Person)
                │                                  │
Account/Name ───┘                                  │ INVOLVES
                                                   ▼
                                                 Event
                                                   │ SUPPORTED_BY
                                                   ▼
                                          UtteranceEvidence
                                           (原话 / 语义)

关键点：
- Person 是多模态身份的"汇聚点"
- Event 是多模态证据的"语义锚点"
- 查询可从任意模态入手，通过图结构找到完整上下文
```

### 6.3 隔离与安全

```python
# 默认收紧的隔离策略
restrict_to_user = True      # 只扩展同用户数据
restrict_to_domain = True    # 只扩展同域数据
restrict_to_scope = True     # 只扩展同 scope 数据

# 显式放开需要 opt-in
allow_cross_user = False
allow_cross_domain = False
allow_cross_scope = False
```

---

## 七、Agent 使用记忆的三条铁律

### 铁律 1：Event 是第一公民

```
所有检索应以 Event 为锚点，向外扩展找证据/实体/时间。
避免孤立召回碎片信息，保持故事的完整性。

Query → Event → { Entities, Evidence, TimeSlice, Place }
```

### 铁律 2：结构化检索 + 向量语义互补

```
图查询负责精确锚点（时间/实体/关系）
向量负责语义模糊匹配
两者 RRF 融合才是最优

Graph (Precision) + Vector (Recall) → RRF → Best of Both
```

### 铁律 3：可解释优于纯召回

```
每个检索结果都应追溯到原始证据（UtteranceEvidence/Evidence）
让 Agent 的回答"有据可查"

Answer → Event → Evidence → "你当时说的原话是..."
```

---

## 八、实现路线图

| 阶段 | 版本 | 目标 | 对标覆盖 |
|------|------|------|----------|
| **Phase 1** | v0.6 | dialog_v2 三路并行 + Evidence Chain | L1-L2 全覆盖 |
| **Phase 2** | v0.7 | CO_OCCURS 物化 + State 追踪 | L3 代表性 2-3 |
| **Phase 3** | v0.8-0.9 | 跨模态属性 + Knowledge/Fact | L4 语义泛化 |
| **Phase 4** | v1.0 | 否定查询 + 22 场景验收 | L5 + 全覆盖 |

---

## 九、代码锚点速查

| 模块 | 路径 | 职责 |
|------|------|------|
| 检索编排 | `modules/memory/retrieval.py` | dialog_v1/v2 策略实现 |
| 服务层 | `modules/memory/application/service.py` | MemoryService.search |
| 图存储 | `modules/memory/infra/neo4j_store.py` | Neo4jStore |
| 向量存储 | `modules/memory/infra/qdrant_store.py` | QdrantStore |
| HTTP API | `modules/memory/api/server.py` | /search, /graph/v1/search |
| 数据模型 | `modules/memory/contracts/` | MemoryEntry, GraphModels |
| Agent 上下文 | `modules/control_agent/application/context/builder.py` | ContextBuilder |
| 状态机 | `modules/control_agent/application/state_machine.py` | run() |

---

## 版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2024-12-26 | 初版：完整蓝图与五层检索策略 |









