# AI 原生记忆图谱设计与 Agent 检索策略

> **定位**：本文档是 `AI_Memory_Infrastructure_Blueprint.md` 的**演进补充**，聚焦于"最 AI-Native 的记忆知识图谱应该是什么形态"，以及 LLM Agent 的最优检索策略设计。
>
> **核心问题**：
> 1. 当视频转换为 TKG 时空知识图谱后，LLM Agent 应采用什么检索策略？
> 2. 什么是真正"AI 原生"的记忆知识图谱？
>
> **关联文档**：
> - 当前蓝图：`AI_Memory_Infrastructure_Blueprint.md`
> - Schema 定义：`../3. Schema 层（What exactly in code）/TKG-Graph-v1.0-Ultimate.md`
> - 检索 API：`modules/memory/docs/RETRIEVAL_API_AND_WORKFLOW.md`

---

## 一、核心论断：什么是"AI 原生"记忆图谱

### 1.1 传统 KG vs AI-Native KG

| 维度 | 传统知识图谱 | AI-Native 记忆图谱 |
|------|-------------|-------------------|
| **设计目标** | 人类专家查询 | LLM Agent 推理消费 |
| **时间建模** | 属性（timestamp 字段） | **可遍历维度**（TimeSlice 节点） |
| **证据溯源** | 可选附件 | **一等公民，强制要求** |
| **分辨率** | 单一粒度 | **多层次自动选择** |
| **Schema** | 隐式/文档描述 | **可查询、自描述** |
| **推理能力** | 事后分析 | **假设/预测原生支持** |
| **接口风格** | REST CRUD | **Function-Calling 工具** |
| **优化目标** | 存储效率 | **上下文处理效率** |

### 1.2 AI-Native 的核心设计原则

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AI-NATIVE MEMORY GRAPH PRINCIPLES                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. TEMPORAL-FIRST（时间原生）                                          │
│     时间不是属性，是可遍历的维度。Agent 可以"沿着时间轴走"               │
│                                                                         │
│  2. EVIDENCE-BACKED（证据溯源）                                         │
│     每个语义断言都必须有 Evidence 链。置信度向上传播，LLM 可验证         │
│                                                                         │
│  3. MULTI-RESOLUTION（多分辨率）                                        │
│     L0 原始证据 → L1 原子事件 → L2 复合事件 → L3 持久知识               │
│     查询自动选择合适粒度，细节按需展开                                   │
│                                                                         │
│  4. SELF-DESCRIBING（自描述 Schema）                                    │
│     Agent 可先查询"图里有什么、能问什么"，再构造查询                    │
│                                                                         │
│  5. HYPOTHESIS-NATIVE（假设推理原生）                                   │
│     支持预测、假设、反事实推理，与真实事件通过边关联                     │
│                                                                         │
│  6. TOOL-INTERFACE（工具化接口）                                        │
│     为 Function-Calling Agent 设计的原子工具，而非 REST CRUD            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 二、时间建模：从属性到可遍历维度

### 2.1 当前痛点

```python
# 当前：时间是节点属性
Event(id="evt_1", t_abs_start=datetime(...), t_abs_end=datetime(...))

# 问题：
# - "下午 2 点到 3 点发生了什么" 需要全量扫描 Event.t_abs_*
# - 无法直接表达 Allen 时序关系（BEFORE/DURING/OVERLAPS）
# - 时间粒度切换需要应用层计算
```

### 2.2 AI-Native 时间模型

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TEMPORAL-FIRST DATA MODEL                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  TimeSlice 层级（可嵌套）：                                              │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ L0: Minute-level    [14:30-14:31] [14:31-14:32] [14:32-14:33]    │  │
│  │         ↓ CONTAINS                                                │  │
│  │ L1: Hour-level      [14:00-15:00]                                 │  │
│  │         ↓ CONTAINS                                                │  │
│  │ L2: Day-level       [2024-12-26]                                  │  │
│  │         ↓ CONTAINS                                                │  │
│  │ L3: Week-level      [2024-W52]                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  TimeSlice 作为一等公民节点：                                            │
│                                                                         │
│  TimeSlice(hour=14) -[:CONTAINS]-> Event("Richard locks door")         │
│                     -[:CONTAINS]-> Event("Richard leaves home")        │
│                     -[:DURING]-> Entity.State(location="away")         │
│                                                                         │
│  Allen 时序关系原生支持：                                               │
│                                                                         │
│  Event_A -[:BEFORE]-> Event_B      (A 结束后 B 开始)                   │
│  Event_A -[:MEETS]-> Event_B       (A 结束时 B 立即开始)               │
│  Event_A -[:OVERLAPS]-> Event_B    (A 和 B 有时间重叠)                 │
│  Event_A -[:DURING]-> Event_B      (A 完全包含在 B 时间内)             │
│  Event_A -[:CONTAINS]-> Event_B    (A 完全包含 B)                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 时间查询示例

```cypher
-- 传统方式：属性过滤（需要索引优化）
MATCH (e:Event)
WHERE e.t_abs_start >= datetime("2024-12-26T14:00:00")
  AND e.t_abs_end <= datetime("2024-12-26T15:00:00")
RETURN e

-- AI-Native 方式：图遍历（O(1) 定位 + 边展开）
MATCH (ts:TimeSlice{kind: "hour", t_abs_start: datetime("2024-12-26T14:00:00")})
      -[:CONTAINS]->(e:Event)
RETURN e

-- 同时发生查询：
MATCH (e1:Event)-[:OVERLAPS]->(e2:Event)
WHERE e1.id = $anchor_event_id
RETURN e2
```

### 2.4 落地建议

| 阶段 | 动作 | 代码锚点 |
|------|------|----------|
| Phase 1 | TimeSlice 节点已存在，需增加 CONTAINS 边生成 | `Neo4jStore.build_time_slices_from_segments` |
| Phase 2 | 添加 Allen 时序边自动构建（BEFORE/MEETS/OVERLAPS） | 新增 `build_allen_relations` |
| Phase 3 | 暴露 TimeSlice 作为查询入口 | `/graph/v0/timeslices?granularity=hour` |

---

## 三、证据溯源：一等公民设计

### 3.1 Evidence-First 架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│  LLM Response Layer                                                       │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ "Richard locked the door at 2:30 PM before leaving."               │  │
│  │                                                                    │  │
│  │ [CITATION: evt_1234 @ 14:30:12, conf=0.92]                        │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                              ↓ cites                                      │
├──────────────────────────────────────────────────────────────────────────┤
│  Event Layer (L1/L2)                                                      │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Event(id="evt_1234",                                               │  │
│  │       summary="Richard locks front door",                          │  │
│  │       confidence=0.92,                   ← 从 Evidence 传播        │  │
│  │       provenance={model: "vlm_v2", prompt_version: "1.3"})        │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                              ↓ supported_by                               │
├──────────────────────────────────────────────────────────────────────────┤
│  Evidence Layer (L0)                                                      │
│  ┌───────────────────┬───────────────────┬───────────────────────────┐  │
│  │ VLM Evidence      │ ASR Utterance     │ Face Detection            │  │
│  │ ─────────────────│ ─────────────────│ ─────────────────────────│  │
│  │ text: "person     │ raw_text: "I'm   │ entity_id: person::richard│  │
│  │  locks door       │  heading out"    │ confidence: 0.95          │  │
│  │  handle"          │ speaker: Richard │ bbox: [120,80,200,180]    │  │
│  │ confidence: 0.88  │ t: 14:30:12      │ t: 14:30:10               │  │
│  │ algorithm: qwen2  │ algorithm: asr_v1│ algorithm: insightface    │  │
│  └───────────────────┴───────────────────┴───────────────────────────┘  │
│                              ↓ derived_from                               │
├──────────────────────────────────────────────────────────────────────────┤
│  Media Layer                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ MediaSegment(source="camera_1", t=14:29:00-14:31:00)               │  │
│  │ → frame_urls: ["s3://..."], audio_url: "s3://...", thumbnail      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 置信度传播规则

```python
def compute_event_confidence(event: Event, evidences: List[Evidence]) -> float:
    """
    Event 置信度 = 多证据加权融合
    
    规则：
    1. 单一证据：直接使用 evidence.confidence
    2. 多证据互相印证：confidence = 1 - ∏(1 - e_i.confidence)
    3. 冲突证据：取最高置信度，并标记 conflict_flag
    """
    if not evidences:
        return 0.0
    
    # 互相印证模型：多个独立证据指向同一事件
    combined = 1.0
    for e in evidences:
        combined *= (1.0 - e.confidence)
    
    return 1.0 - combined

# 示例：
# - VLM 检测到锁门动作 (0.88)
# - ASR 听到 "I'm heading out" (0.75)  
# - 人脸识别确认是 Richard (0.95)
# → Event.confidence = 1 - (1-0.88)*(1-0.75)*(1-0.95) = 0.9985
```

### 3.3 LLM 可验证的证据链接口

```python
@dataclass
class EvidenceChainResponse:
    """检索结果必须包含的证据链结构"""
    
    event: Event
    confidence: float                      # 融合置信度
    
    # 多模态证据
    visual_evidences: List[VLMEvidence]    # 视觉描述
    utterances: List[UtteranceEvidence]    # 原话/ASR
    face_evidences: List[FaceEvidence]     # 人脸识别
    object_evidences: List[ObjectEvidence] # 物体检测
    
    # 溯源到原始媒体
    media_segments: List[MediaSegment]     # 可播放的视频片段
    thumbnails: List[str]                  # 关键帧缩略图
    
    # 时空锚点
    timeslice: TimeSlice                   # 时间定位
    place: Optional[Place]                 # 空间定位
    
    def to_llm_citation(self) -> str:
        """生成 LLM 友好的引用格式"""
        return f"[{self.event.summary}] @ {self.timeslice.t_abs_start}, conf={self.confidence:.2f}"
```

---

## 四、多分辨率记忆层（L0-L3）

### 4.1 分层架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MULTI-RESOLUTION MEMORY HIERARCHY                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ L3: Knowledge / Facts (持久层)                        TTL: ∞      │ │
│  │ ─────────────────────────────────────────────────────────────────│ │
│  │ "Richard usually has coffee for breakfast"                        │ │
│  │ "Richard and Alice work together at TechCorp"                     │ │
│  │ "The car key is usually kept on the hook by the door"            │ │
│  │                                                                   │ │
│  │ → 从 L2 归纳，跨时间窗聚合，代表长期稳定的事实                      │ │
│  │ → 存储：Neo4j Knowledge 节点                                      │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                           ↑ SUMMARIZES                                  │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ L2: Composite Events / Episodes (复合层)              TTL: 30d    │ │
│  │ ─────────────────────────────────────────────────────────────────│ │
│  │ Episode: "Richard prepares breakfast (8:00-8:45)"                 │ │
│  │   ├── Event: "Richard enters kitchen"                             │ │
│  │   ├── Event: "Richard makes coffee"                               │ │
│  │   ├── Event: "Richard toasts bread"                               │ │
│  │   └── Event: "Richard eats breakfast"                             │ │
│  │                                                                   │ │
│  │ → 将相关 L1 事件聚合成有意义的 Episode                             │ │
│  │ → 存储：Neo4j Event(type="composite") + CONTAINS 边               │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                           ↑ PART_OF / CONTAINS                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ L1: Atomic Events (原子层)                            TTL: 7d     │ │
│  │ ─────────────────────────────────────────────────────────────────│ │
│  │ Event: "Richard enters kitchen" @ 08:00:12                        │ │
│  │ Event: "Richard opens refrigerator" @ 08:01:30                    │ │
│  │ Event: "Richard pours coffee" @ 08:03:45                          │ │
│  │                                                                   │ │
│  │ → 从 L0 Evidence 抽取的语义事件                                    │ │
│  │ → 存储：Neo4j Event 节点 + SUPPORTED_BY 边 → L0                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                           ↑ SUPPORTED_BY                                │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ L0: Raw Evidence (原始层)                             TTL: 24h    │ │
│  │ ─────────────────────────────────────────────────────────────────│ │
│  │ FaceDetection: bbox=[120,80,200,180], person_id=?, conf=0.92      │ │
│  │ ObjectDetection: class="refrigerator", bbox=[...], conf=0.88     │ │
│  │ ASR: "Good morning" @ 08:00:15, speaker_id=track_001             │ │
│  │ VLM: "A person walks into a kitchen" @ 08:00:12                   │ │
│  │                                                                   │ │
│  │ → 高频写入的原始感知数据                                           │ │
│  │ → 存储：Qdrant 向量 + 引用 ID，不入图（除非被 L1 引用）            │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 查询自动选择分辨率

```python
class MultiResolutionRetriever:
    """
    根据查询意图自动选择合适的记忆层级
    """
    
    def select_resolution(self, query: str, intent: QueryIntent) -> str:
        """
        规则：
        - "今天早上发生了什么" → L2 (Episode level)
        - "他具体做了什么菜" → L1 (Atomic Event level)
        - "他一般早上做什么" → L3 (Knowledge level)
        - "有没有看到红色杯子" → L0 (Evidence level)
        """
        resolution_rules = {
            QueryIntent.SUMMARY: "L2",           # 需要概览
            QueryIntent.DETAIL: "L1",            # 需要细节
            QueryIntent.PATTERN: "L3",           # 需要规律
            QueryIntent.PERCEPTION: "L0",        # 需要原始感知
            QueryIntent.UNKNOWN: "L1",           # 默认原子事件
        }
        return resolution_rules.get(intent, "L1")
    
    async def retrieve(
        self, 
        query: str, 
        resolution: str = "auto",
        allow_drill_down: bool = True,
    ) -> RetrievalResult:
        """
        1. 自动选择分辨率
        2. 在该层检索
        3. 如果 allow_drill_down=True，支持按需展开到更细粒度
        """
        if resolution == "auto":
            intent = await self.classify_intent(query)
            resolution = self.select_resolution(query, intent)
        
        # 在选定层级检索
        results = await self.search_at_level(query, resolution)
        
        # 附带下钻能力
        if allow_drill_down:
            for r in results:
                r.drill_down_available = self.can_expand(r, resolution)
        
        return results
```

### 4.3 分层 TTL 与遗忘策略

```yaml
# memory.config.yaml

multi_resolution:
  L0_evidence:
    ttl_hours: 24
    storage: qdrant_only       # 只存向量，不入图
    on_expire: delete          # 过期直接删除
    
  L1_atomic_event:
    ttl_days: 7
    storage: neo4j + qdrant
    on_expire: summarize       # 过期前尝试归纳到 L2
    min_importance: 0.3        # 低于阈值的直接删除
    
  L2_composite_event:
    ttl_days: 30
    storage: neo4j + qdrant
    on_expire: compress        # 过期前压缩细节，保留摘要
    
  L3_knowledge:
    ttl_days: null             # 永久保留
    storage: neo4j
    on_expire: null
    refresh_on_access: true    # 访问时刷新 last_accessed
```

---

## 五、自描述 Schema（Agent 可查询）

### 5.1 Schema 元信息结构

```python
class TKGSchemaMeta:
    """
    图谱自带的可查询 Schema 元信息
    Agent 可先查询"图里有什么、能问什么"，再构造查询
    """
    
    node_types = {
        "Event": {
            "description": "Something that happened at a specific time. The primary anchor for memory queries.",
            "attributes": {
                "summary": "str - Brief description of what happened",
                "t_abs_start": "datetime - When it started",
                "t_abs_end": "datetime - When it ended",
                "event_type": "str - Category: meeting, call, walk, eat, etc.",
                "action": "str - Specific action: lock, unlock, use_phone, talk",
                "confidence": "float - Derived from supporting evidence",
            },
            "queryable_patterns": [
                "What happened at [TIME]?",
                "Find events involving [ENTITY]",
                "What did [PERSON] do after [EVENT]?",
            ],
            "outgoing_edges": ["INVOLVES(Entity)", "OCCURS_AT(TimeSlice)", "SUPPORTED_BY(Evidence)"],
            "incoming_edges": ["NEXT_EVENT(Event)", "CAUSES(Event)"],
        },
        
        "Entity": {
            "description": "A person, object, or place that persists over time",
            "subtypes": ["PERSON", "OBJECT", "PLACE", "ORGANIZATION"],
            "identity_resolution": {
                "PERSON": "Resolved via face/voice clustering + manual approval",
                "OBJECT": "Only key objects (keys, phone, car) get global identity",
            },
            "attributes": {
                "name": "str - Display name",
                "type": "str - PERSON/OBJECT/PLACE",
                "aliases": "List[str] - Alternative names",
            },
            "queryable_patterns": [
                "Where is [OBJECT] now?",
                "When did I first meet [PERSON]?",
                "Who was with [PERSON] on [DATE]?",
            ],
        },
        
        "TimeSlice": {
            "description": "A discrete time period at various granularities",
            "attributes": {
                "kind": "str - minute/hour/day/week/month",
                "t_abs_start": "datetime",
                "t_abs_end": "datetime",
                "granularity_level": "int - 0=minute, 1=hour, 2=day, etc.",
            },
            "queryable_patterns": [
                "What happened on [DATE]?",
                "Events between [TIME_START] and [TIME_END]",
                "Show me the afternoon of [DATE]",
            ],
        },
        
        "Evidence": {
            "description": "Raw perceptual data supporting semantic claims",
            "subtypes": ["VLMEvidence", "FaceEvidence", "ObjectEvidence", "ASRUtterance"],
            "attributes": {
                "algorithm": "str - Model that produced this evidence",
                "algorithm_version": "str - Model version",
                "confidence": "float - Detection confidence",
                "bbox": "str - Bounding box if applicable",
            },
        },
    }
    
    edge_semantics = {
        "INVOLVES": {
            "from": "Event",
            "to": "Entity",
            "description": "Entity participated in this event",
            "attributes": ["role: str - actor/object/location"],
        },
        "OCCURS_AT": {
            "from": "Event",
            "to": ["TimeSlice", "Place"],
            "description": "Event happened at this time/place",
        },
        "NEXT_EVENT": {
            "from": "Event",
            "to": "Event",
            "description": "Temporal sequence: this event followed by another",
            "temporal_constraint": "from.t_abs_end <= to.t_abs_start",
        },
        "CAUSES": {
            "from": "Event",
            "to": "Event",
            "description": "Causal relationship (inferred, requires validation)",
            "confidence_required": True,
            "layer": "inference",
        },
        "SUPPORTED_BY": {
            "from": "Event",
            "to": ["Evidence", "UtteranceEvidence"],
            "description": "Evidence backing this semantic claim",
        },
        "CO_OCCURS_WITH": {
            "between": ["Entity", "Entity"],
            "description": "Two entities frequently appear together in events",
            "computed": True,
            "computed_from": "Shared TimeSlice participation count",
        },
    }
```

### 5.2 Schema 查询 API

```python
# 新增 API 端点

@app.get("/graph/schema")
async def get_schema() -> TKGSchemaMeta:
    """
    返回图谱的可查询 Schema 元信息
    
    用途：
    1. Agent 启动时获取图谱能力边界
    2. 构造动态查询时了解可用节点/边类型
    3. 生成面向用户的"我能问什么"提示
    """
    return TKGSchemaMeta()


@app.get("/graph/schema/examples")
async def get_query_examples(
    node_type: Optional[str] = None,
    edge_type: Optional[str] = None,
) -> List[QueryExample]:
    """
    返回特定节点/边类型的查询示例
    
    Agent 可用这些示例作为 few-shot 模板
    """
    examples = {
        "Event": [
            QueryExample(
                natural="What happened yesterday afternoon?",
                cypher="MATCH (ts:TimeSlice{kind:'hour'})-[:CONTAINS]->(e:Event) WHERE ts.t_abs_start >= ... RETURN e",
            ),
        ],
        "NEXT_EVENT": [
            QueryExample(
                natural="What did I do after coming home?",
                cypher="MATCH (e1:Event)-[:NEXT_EVENT]->(e2:Event) WHERE e1.summary CONTAINS '回家' RETURN e2",
            ),
        ],
    }
    # ...
```

---

## 六、假设推理原生支持

### 6.1 扩展节点类型

```python
class HypothesisEvent(Event):
    """
    假设/预测事件节点
    与真实事件共享大部分结构，但有特殊标记
    """
    
    time_origin: Literal["predicted", "hypothesized", "counterfactual"]
    
    # 溯源
    base_event_id: Optional[str]      # 基于哪个真实事件推导
    derived_by: str                    # "llm_inference" / "pattern_rule" / "user_hypothesis"
    
    # 置信度
    probability: float                 # 预测概率
    
    # 验证状态
    verified: Optional[bool] = None    # 事后验证结果
    verified_by_event_id: Optional[str] = None  # 验证它的真实事件


class PredictedEvent(HypothesisEvent):
    """基于历史模式预测的未来事件"""
    time_origin: Literal["predicted"] = "predicted"
    pattern_id: Optional[str]         # 使用的预测模式
    prediction_horizon: str           # "next_hour" / "tomorrow" / "next_week"


class CounterfactualEvent(HypothesisEvent):
    """反事实推理：如果 X 不发生，会怎样"""
    time_origin: Literal["counterfactual"] = "counterfactual"
    negated_event_id: str             # 被否定的事件
    reasoning_chain: List[str]        # 推理步骤
```

### 6.2 假设推理 API

```python
@tool
async def predict_next_events(
    entity_id: str,
    time_horizon: str = "next_hour",
    top_k: int = 3,
) -> List[PredictedEvent]:
    """
    基于历史模式预测实体的下一步行为
    
    示例：
    - "他接下来可能会做什么" → 查看历史相似情境后的行为
    - "明天这个时候他通常在哪" → 基于周期性模式
    """
    # 1. 获取实体当前状态/位置
    current_state = await get_entity_current_state(entity_id)
    
    # 2. 查找历史相似情境
    similar_contexts = await find_similar_historical_contexts(entity_id, current_state)
    
    # 3. 统计后续事件分布
    next_event_distribution = compute_next_event_distribution(similar_contexts)
    
    # 4. 生成预测事件
    predictions = []
    for event_type, probability in next_event_distribution[:top_k]:
        pred = PredictedEvent(
            summary=f"Predicted: {entity_id} will {event_type}",
            probability=probability,
            derived_by="pattern_rule",
            time_origin="predicted",
            base_event_id=current_state.last_event_id,
        )
        predictions.append(pred)
    
    return predictions


@tool
async def counterfactual_reasoning(
    event_id: str,
    question: str,
) -> CounterfactualEvent:
    """
    反事实推理：如果某事件不发生，会怎样
    
    示例：
    - "如果他没有锁门会怎样" → 分析后续事件链的变化
    """
    # 1. 获取原事件及其后续链
    original_chain = await get_event_causal_chain(event_id)
    
    # 2. LLM 推理反事实场景
    counterfactual = await llm_counterfactual_reasoning(
        negated_event=original_chain[0],
        subsequent_events=original_chain[1:],
        question=question,
    )
    
    return counterfactual
```

---

## 七、Function-Calling 原生工具接口

### 7.1 核心工具集

```python
# 为 Function-Calling Agent 设计的原子工具

@tool(
    name="search_events",
    description="Search for events matching the query. Returns events with evidence chains.",
)
async def search_events(
    query: str,
    entity_filter: Optional[str] = None,
    time_range_start: Optional[str] = None,
    time_range_end: Optional[str] = None,
    event_type: Optional[str] = None,
    include_evidence: bool = True,
    top_k: int = 10,
) -> List[EventWithEvidence]:
    """
    语义事件搜索
    
    参数：
    - query: 自然语言查询，如 "他做饭的时候"
    - entity_filter: 限定涉及的实体，如 "Richard"
    - time_range_*: ISO 格式时间范围
    - event_type: 事件类型过滤，如 "cooking", "meeting"
    - include_evidence: 是否返回证据链
    """
    pass


@tool(
    name="get_entity_timeline",
    description="Get all events involving an entity, organized by time.",
)
async def get_entity_timeline(
    entity_id: str,
    granularity: Literal["minute", "hour", "day", "week"] = "hour",
    time_range_start: Optional[str] = None,
    time_range_end: Optional[str] = None,
) -> List[TimelineEntry]:
    """
    获取实体时间线
    
    返回该实体参与的所有事件，按时间组织
    """
    pass


@tool(
    name="find_first_meeting",
    description="Find when two entities first appeared together.",
)
async def find_first_meeting(
    entity_a: str,
    entity_b: str,
) -> Optional[EventWithEvidence]:
    """
    查找两个实体首次共现的事件
    
    典型用例："我和 Alice 是怎么认识的"
    """
    pass


@tool(
    name="trace_object_location",
    description="Find the last known location of an object.",
)
async def trace_object_location(
    object_name: str,
) -> ObjectLocationTrace:
    """
    追踪物体最后已知位置
    
    典型用例："我的钥匙在哪"
    """
    pass


@tool(
    name="compare_patterns",
    description="Compare behavior patterns between two time windows.",
)
async def compare_patterns(
    entity_id: str,
    window_a_start: str,
    window_a_end: str,
    window_b_start: str,
    window_b_end: str,
) -> PatternComparison:
    """
    对比两个时间段的行为模式
    
    典型用例："这周和上周有什么不同"
    """
    pass


@tool(
    name="explain_causal_chain",
    description="Trace causal relationships around an event.",
)
async def explain_causal_chain(
    event_id: str,
    direction: Literal["causes", "caused_by", "both"] = "both",
    max_depth: int = 3,
) -> CausalChain:
    """
    解释事件因果链
    
    典型用例："为什么会发生这件事"
    """
    pass


@tool(
    name="get_time_summary",
    description="Get a summary of events in a time period.",
)
async def get_time_summary(
    time_range_start: str,
    time_range_end: str,
    granularity: Literal["hour", "day", "week"] = "day",
) -> TimeSummary:
    """
    获取时间段摘要
    
    典型用例："今天发生了什么"
    """
    pass


@tool(
    name="negative_query",
    description="Find time periods where something did NOT happen.",
)
async def negative_query(
    condition: str,
    time_range_start: str,
    time_range_end: str,
) -> List[TimeSlice]:
    """
    否定查询：找出某件事没发生的时间段
    
    典型用例："上个月哪几天我没出门"
    """
    pass
```

### 7.2 工具编排示例

```python
# Agent 使用工具回答复杂问题的示例

async def answer_complex_question(question: str) -> str:
    """
    问题："我回家后做的第一件事是什么？"
    """
    
    # Step 1: 搜索"回家"相关事件
    home_events = await search_events(
        query="回家 到家",
        event_type="arrive",
        include_evidence=True,
    )
    
    if not home_events:
        return "没有找到你回家的记录"
    
    # Step 2: 获取回家事件之后的时间线
    anchor_event = home_events[0]
    timeline = await get_entity_timeline(
        entity_id="user::me",
        time_range_start=anchor_event.t_abs_end.isoformat(),
        granularity="minute",
    )
    
    if len(timeline) < 2:
        return "回家后没有记录到其他活动"
    
    # Step 3: 返回第一个后续事件
    next_event = timeline[1]
    
    return f"你回家后做的第一件事是：{next_event.summary}（{next_event.t_abs_start}）"
```

---

## 八、从当前架构到 AI-Native 的演进路线

### 8.1 演进路线图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EVOLUTION ROADMAP                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Phase 1: Enhanced Retrieval (v0.7)                    [不破坏现有 API] │
│  ─────────────────────────────────────────────────────────────────────  │
│  □ 增强 /graph/v1/search 返回 confidence_chain                          │
│  □ 暴露 TimeSlice 作为查询维度                                          │
│  □ 添加 GET /graph/schema 端点                                         │
│  □ Evidence 置信度向上传播到 Event                                      │
│                                                                         │
│  Phase 2: Multi-Resolution (v0.8)                                       │
│  ─────────────────────────────────────────────────────────────────────  │
│  □ 实现 L0-L3 分层存储                                                  │
│  □ 添加 SUMMARIZES 边（L1→L2, L2→L3）                                  │
│  □ 查询自动选择分辨率                                                    │
│  □ 分层 TTL 与遗忘策略                                                  │
│                                                                         │
│  Phase 3: Tool Interface (v0.9)                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│  □ 封装 Function-Calling 友好的工具集                                   │
│  □ MCP 协议适配                                                         │
│  □ 工具组合模式文档                                                      │
│                                                                         │
│  Phase 4: Temporal-First (v1.0)                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│  □ TimeSlice CONTAINS 边自动生成                                        │
│  □ Allen 时序边（BEFORE/MEETS/OVERLAPS）                                │
│  □ 时间维度可遍历查询                                                    │
│                                                                         │
│  Phase 5: Hypothesis Reasoning (v1.1+)                                  │
│  ─────────────────────────────────────────────────────────────────────  │
│  □ HypothesisEvent / PredictedEvent 节点类型                            │
│  □ 预测工具 predict_next_events                                         │
│  □ 反事实推理 counterfactual_reasoning                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 短期可执行动作（不破坏现有 API）

| 优先级 | 动作 | 代码锚点 | 预估工作量 |
|--------|------|----------|-----------|
| P0 | 在 `/graph/v1/search` 返回中添加 `confidence_chain` 字段 | `graph_service.search_events_v1` | 2h |
| P0 | 添加 `GET /graph/schema` 端点 | `modules/memory/api/server.py` | 4h |
| P1 | TimeSlice 查询端点 `GET /graph/v0/timeslices?granularity=hour&start=...&end=...` | `graph_service.list_time_slices_by_range` (已有) | 1h (暴露即可) |
| P1 | Evidence → Event 置信度传播逻辑 | `graph_service._upsert_tkg_vectors` | 4h |
| P2 | 封装 `search_events` 工具函数 | 新模块 `modules/memory/tools/` | 8h |

### 8.3 设计约束（必须遵守）

```python
# 所有演进必须遵守的约束

class EvolutionConstraints:
    """
    "Never break userspace" - 演进过程中的铁律
    """
    
    # 1. 向后兼容
    existing_api_endpoints_unchanged = True  # 现有 API 保持不变
    new_fields_optional = True               # 新增字段都是可选的
    
    # 2. 渐进增强
    new_features_opt_in = True               # 新功能需要显式开启
    default_behavior_unchanged = True         # 默认行为不变
    
    # 3. 资源限制
    max_hops_default = 2                     # 默认最大跳数
    neighbor_cap_per_seed = 15               # 每个种子最多扩展 15 个邻居
    query_timeout_seconds = 30               # 查询超时
    
    # 4. 隔离策略
    restrict_to_tenant = True                # 始终隔离租户
    restrict_to_user_default = True          # 默认隔离用户
```

---

## 九、总结：AI-Native 记忆图谱的六大支柱

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    THE 6 PILLARS OF AI-NATIVE MEMORY                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                       │
│  │  TEMPORAL   │ │  EVIDENCE   │ │   MULTI-    │                       │
│  │   FIRST     │ │   BACKED    │ │ RESOLUTION  │                       │
│  │             │ │             │ │             │                       │
│  │ 时间是可遍历│ │ 每个断言有  │ │ L0-L3 分层  │                       │
│  │ 维度，不是  │ │ 证据链支撑  │ │ 查询自动    │                       │
│  │ 属性        │ │ 置信度传播  │ │ 选择粒度    │                       │
│  └─────────────┘ └─────────────┘ └─────────────┘                       │
│                                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                       │
│  │    SELF-    │ │ HYPOTHESIS  │ │    TOOL     │                       │
│  │ DESCRIBING  │ │   NATIVE    │ │  INTERFACE  │                       │
│  │             │ │             │ │             │                       │
│  │ Schema 可   │ │ 支持预测、  │ │ Function-   │                       │
│  │ 查询、自描述│ │ 假设、反事实│ │ Calling 友好│                       │
│  │             │ │ 推理        │ │ 的原子工具  │                       │
│  └─────────────┘ └─────────────┘ └─────────────┘                       │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════   │
│                                                                         │
│  核心目标：让 LLM Agent 能够：                                          │
│                                                                         │
│  1. 快速理解"图里有什么"（Schema 自描述）                               │
│  2. 高效定位"发生了什么"（时间原生 + 多分辨率）                         │
│  3. 可靠验证"为什么这么说"（证据溯源）                                  │
│  4. 灵活推理"如果/将来会"（假设推理）                                   │
│  5. 组合解决复杂问题（工具编排）                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2024-12-30 | 初版：AI-Native 记忆图谱设计与 Agent 检索策略 |

---

## 附录 A：与 Blueprint 的关系

| 文档 | 关注点 | 适用场景 |
|------|--------|----------|
| `AI_Memory_Infrastructure_Blueprint.md` | 当前系统**如何工作** | 开发/调试/理解现有实现 |
| `AI原生记忆图谱设计与检索策略.md`（本文档） | 系统**应该演进成什么** | 架构决策/长期规划/技术选型 |

两份文档互补：Blueprint 是"地图"，本文档是"导航目的地"。

