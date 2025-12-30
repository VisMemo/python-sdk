# L1-L2 全覆盖测试计划

> **目标**：验证 TKG 图谱能够完整支持 L1（基础事实检索）和 L2（时序与状态流转）的 8 个对标问题。
>
> **验收标准**：每个测试用例在受控测试数据上能给出正确、可解释的回答。
>
> **关联文档**：
> - 对标问题：`记忆检索与推理对标清单.md`
> - 检索蓝图：`AI_Memory_Infrastructure_Blueprint.md`
> - Schema：`../3. Schema 层（What exactly in code）/TKG-Graph-v1.0-Ultimate.md`

---

## 一、测试概览

### 1.1 L1-L2 问题清单

| ID | 层级 | 问题 | 测试点 | 优先级 |
|----|------|------|--------|--------|
| Q1 | L1 | "上周五我去了哪些地方？" | 时间范围 + 地点归属 | P0 |
| Q2 | L1 | "我在视频里提到'人工智能'是在什么时候？" | 文本检索 + 时间对齐 | P0 |
| Q3 | L1 | "画面里出现过红色的杯子吗？" | 视觉对象属性检索 | P1 |
| Q4 | L1 | "昨天下午跟我开会的人是谁？" | 事件类型 + 参与者 | P0 |
| Q5 | L2 | "我回家后做的第一件事是什么？" | 时序链 NEXT_EVENT | P0 |
| Q6 | L2 | "我昨天玩手机玩了多久？" | 时长聚合 | P1 |
| Q7 | L2 | "我的车钥匙现在在哪？" | 状态追踪/最后赋值 | P1 |
| Q8 | L2 | "出门前我锁门了吗？" | 条件存在性 + 时序约束 | P0 |

### 1.2 测试阶段

| 阶段 | 范围 | 目标 | 完成标准 |
|------|------|------|----------|
| **Stage 1** | Schema 验证 | 确认图结构能表达所需信息 | Cypher 可执行 |
| **Stage 2** | 单元测试 | 各检索路径独立正确 | pytest 通过 |
| **Stage 3** | 集成测试 | 端到端检索 + 结果验证 | API 返回正确 |
| **Stage 4** | 回归测试 | 纳入 CI，防止退化 | CI 门禁通过 |

---

## 二、测试数据设计

### 2.1 核心测试场景：一天的生活

为覆盖 L1-L2 所有问题，设计一个**受控的"一天生活"场景**：

```
时间线（2024-12-20 周五）:

08:00 - 起床，在卧室
08:30 - 吃早餐，在厨房
09:00 - 出门，锁门（关键动作）
09:30 - 到达咖啡厅（地点1）
10:00 - 与 Alice 开会，讨论人工智能项目（关键对话）
11:30 - 离开咖啡厅
12:00 - 到达图书馆（地点2）
12:30 - 看手机（开始）
13:00 - 看手机（结束，共30分钟）
14:00 - 回家，到达门口
14:05 - 进门，把车钥匙放在玄关（关键状态）
14:10 - 换衣服（回家后第一件事）
14:30 - 把车钥匙拿到客厅（状态变更）
15:00 - 继续看手机（开始）
15:30 - 看手机（结束，共30分钟）
```

### 2.2 测试数据结构

#### 2.2.1 实体 (Entity)

```python
TEST_ENTITIES = [
    # 人物
    {"id": "entity_me", "type": "Person", "name": "Me", "global_id": "user_test_001"},
    {"id": "entity_alice", "type": "Person", "name": "Alice", "global_id": "user_alice"},
    
    # 物体
    {"id": "entity_car_key", "type": "Object", "name": "car_key", "aliases": ["车钥匙", "钥匙"]},
    {"id": "entity_phone", "type": "Object", "name": "phone", "aliases": ["手机"]},
    {"id": "entity_red_cup", "type": "Object", "name": "cup", "color": "red"},
    {"id": "entity_door", "type": "Object", "name": "door", "aliases": ["门", "大门"]},
]
```

#### 2.2.2 地点 (Place)

```python
TEST_PLACES = [
    {"id": "place_bedroom", "name": "卧室", "area_type": "indoor"},
    {"id": "place_kitchen", "name": "厨房", "area_type": "indoor"},
    {"id": "place_hallway", "name": "玄关", "area_type": "indoor"},
    {"id": "place_living_room", "name": "客厅", "area_type": "indoor"},
    {"id": "place_cafe", "name": "咖啡厅", "area_type": "outdoor"},
    {"id": "place_library", "name": "图书馆", "area_type": "outdoor"},
    {"id": "place_home", "name": "家", "area_type": "indoor"},
]
```

#### 2.2.3 时间片 (TimeSlice)

```python
TEST_TIMESLICES = [
    # 日粒度
    {"id": "ts_day_1220", "granularity": "day", "date": "2024-12-20", "time_range": ["2024-12-20T00:00:00", "2024-12-20T23:59:59"]},
    
    # 小时粒度
    {"id": "ts_hour_0800", "granularity": "hour", "time_range": ["2024-12-20T08:00:00", "2024-12-20T08:59:59"]},
    {"id": "ts_hour_0900", "granularity": "hour", "time_range": ["2024-12-20T09:00:00", "2024-12-20T09:59:59"]},
    {"id": "ts_hour_1000", "granularity": "hour", "time_range": ["2024-12-20T10:00:00", "2024-12-20T10:59:59"]},
    {"id": "ts_hour_1400", "granularity": "hour", "time_range": ["2024-12-20T14:00:00", "2024-12-20T14:59:59"]},
    # ... 更多小时粒度
]
```

#### 2.2.4 事件 (Event)

```python
TEST_EVENTS = [
    # 08:00 起床
    {
        "id": "event_001_wake_up",
        "type": "Atomic",
        "action": "wake_up",
        "summary": "起床",
        "t_abs_start": "2024-12-20T08:00:00",
        "t_abs_end": "2024-12-20T08:00:00",
        "scene": "bedroom",
    },
    
    # 09:00 锁门出门
    {
        "id": "event_003_lock_door",
        "type": "Atomic",
        "action": "lock",
        "summary": "锁门出门",
        "t_abs_start": "2024-12-20T09:00:00",
        "t_abs_end": "2024-12-20T09:00:00",
        "scene": "hallway",
    },
    
    # 10:00 与 Alice 开会
    {
        "id": "event_005_meeting",
        "type": "Process",
        "action": "meeting",
        "summary": "与 Alice 在咖啡厅开会，讨论人工智能项目",
        "t_abs_start": "2024-12-20T10:00:00",
        "t_abs_end": "2024-12-20T11:30:00",
        "scene": "cafe",
    },
    
    # 12:30 看手机（第一段）
    {
        "id": "event_007_phone_1",
        "type": "Process",
        "action": "use_phone",
        "summary": "在图书馆看手机",
        "t_abs_start": "2024-12-20T12:30:00",
        "t_abs_end": "2024-12-20T13:00:00",
        "duration_minutes": 30,
        "scene": "library",
    },
    
    # 14:00 回家到达
    {
        "id": "event_008_arrive_home",
        "type": "Atomic",
        "action": "arrive",
        "summary": "回到家",
        "t_abs_start": "2024-12-20T14:00:00",
        "t_abs_end": "2024-12-20T14:00:00",
        "scene": "home",
    },
    
    # 14:05 放钥匙
    {
        "id": "event_009_put_key",
        "type": "Atomic",
        "action": "put",
        "summary": "把车钥匙放在玄关",
        "t_abs_start": "2024-12-20T14:05:00",
        "t_abs_end": "2024-12-20T14:05:00",
        "scene": "hallway",
    },
    
    # 14:10 换衣服（回家后第一件事）
    {
        "id": "event_010_change_clothes",
        "type": "Atomic",
        "action": "change_clothes",
        "summary": "换衣服",
        "t_abs_start": "2024-12-20T14:10:00",
        "t_abs_end": "2024-12-20T14:15:00",
        "scene": "bedroom",
    },
    
    # 14:30 拿钥匙到客厅
    {
        "id": "event_011_move_key",
        "type": "Atomic",
        "action": "move",
        "summary": "把车钥匙拿到客厅",
        "t_abs_start": "2024-12-20T14:30:00",
        "t_abs_end": "2024-12-20T14:30:00",
        "scene": "living_room",
    },
    
    # 15:00 看手机（第二段）
    {
        "id": "event_012_phone_2",
        "type": "Process",
        "action": "use_phone",
        "summary": "在家看手机",
        "t_abs_start": "2024-12-20T15:00:00",
        "t_abs_end": "2024-12-20T15:30:00",
        "duration_minutes": 30,
        "scene": "living_room",
    },
]
```

#### 2.2.5 语音证据 (UtteranceEvidence)

```python
TEST_UTTERANCES = [
    {
        "id": "utt_001",
        "raw_text": "我们今天讨论一下人工智能项目的进展",
        "t_media_start": "2024-12-20T10:05:00",
        "t_media_end": "2024-12-20T10:05:10",
        "speaker_track_id": "entity_me",
    },
    {
        "id": "utt_002",
        "raw_text": "人工智能在这个领域的应用前景很广阔",
        "t_media_start": "2024-12-20T10:15:00",
        "t_media_end": "2024-12-20T10:15:15",
        "speaker_track_id": "entity_alice",
    },
    {
        "id": "utt_003",
        "raw_text": "我把车钥匙放在玄关了",
        "t_media_start": "2024-12-20T14:05:00",
        "t_media_end": "2024-12-20T14:05:05",
        "speaker_track_id": "entity_me",
    },
]
```

#### 2.2.6 视觉证据 (Evidence)

```python
TEST_EVIDENCES = [
    {
        "id": "ev_red_cup",
        "type": "object",
        "name": "cup",
        "color": "red",
        "bbox": [100, 200, 150, 250],
        "timestamp": "2024-12-20T10:30:00",
        "segment_id": "seg_cafe_1030",
    },
]
```

#### 2.2.7 边/关系

```python
TEST_EDGES = [
    # INVOLVES: 事件参与者
    {"src": "event_005_meeting", "dst": "entity_me", "rel_type": "INVOLVES"},
    {"src": "event_005_meeting", "dst": "entity_alice", "rel_type": "INVOLVES"},
    {"src": "event_003_lock_door", "dst": "entity_door", "rel_type": "INVOLVES"},
    {"src": "event_009_put_key", "dst": "entity_car_key", "rel_type": "INVOLVES"},
    {"src": "event_011_move_key", "dst": "entity_car_key", "rel_type": "INVOLVES"},
    
    # OCCURS_AT: 事件发生地点
    {"src": "event_005_meeting", "dst": "place_cafe", "rel_type": "OCCURS_AT"},
    {"src": "event_007_phone_1", "dst": "place_library", "rel_type": "OCCURS_AT"},
    {"src": "event_008_arrive_home", "dst": "place_home", "rel_type": "OCCURS_AT"},
    {"src": "event_009_put_key", "dst": "place_hallway", "rel_type": "OCCURS_AT"},
    {"src": "event_011_move_key", "dst": "place_living_room", "rel_type": "OCCURS_AT"},
    
    # NEXT_EVENT: 时序链
    {"src": "event_008_arrive_home", "dst": "event_009_put_key", "rel_type": "NEXT_EVENT"},
    {"src": "event_009_put_key", "dst": "event_010_change_clothes", "rel_type": "NEXT_EVENT"},
    {"src": "event_010_change_clothes", "dst": "event_011_move_key", "rel_type": "NEXT_EVENT"},
    
    # SUPPORTED_BY: 事件证据
    {"src": "event_005_meeting", "dst": "utt_001", "rel_type": "SUPPORTED_BY"},
    {"src": "event_005_meeting", "dst": "utt_002", "rel_type": "SUPPORTED_BY"},
    {"src": "event_009_put_key", "dst": "utt_003", "rel_type": "SUPPORTED_BY"},
    
    # SPOKEN_BY: 说话人
    {"src": "utt_001", "dst": "entity_me", "rel_type": "SPOKEN_BY"},
    {"src": "utt_002", "dst": "entity_alice", "rel_type": "SPOKEN_BY"},
    {"src": "utt_003", "dst": "entity_me", "rel_type": "SPOKEN_BY"},
]
```

---

## 三、测试用例详细设计

### 3.1 Q1：时间范围 + 地点归属

**问题**："上周五我去了哪些地方？"

#### 测试用例 T1.1：基本地点查询

```python
@pytest.mark.asyncio
async def test_q1_places_on_friday():
    """Q1: 上周五我去了哪些地方？"""
    
    # Arrange: 设置测试时间为 2024-12-23（周一），上周五是 12-20
    query = "上周五我去了哪些地方？"
    expected_places = {"咖啡厅", "图书馆", "家"}  # 不包含室内细分
    
    # Act
    result = await retrieval(
        store=test_store,
        tenant_id="test_tenant",
        user_tokens=["user_test_001"],
        query=query,
        strategy="dialog_v2",
        enable_time_route=True,
    )
    
    # Assert
    actual_places = extract_places_from_result(result)
    assert actual_places == expected_places
    
    # 验证时间路由被正确触发
    assert result["trace"]["time_route_used"] == True
    assert result["trace"]["time_range"] == ["2024-12-20", "2024-12-20"]
```

#### 测试用例 T1.2：Cypher 查询验证

```cypher
-- 直接 Cypher 验证：应返回 3 个地点
MATCH (e:Event)-[:OCCURS_AT]->(p:Place)
WHERE e.tenant_id = $tenant_id
  AND date(e.t_abs_start) = date("2024-12-20")
  AND p.area_type = "outdoor"
RETURN DISTINCT p.name
ORDER BY p.name

-- 预期结果：["咖啡厅", "图书馆"]（outdoor 地点）
```

---

### 3.2 Q2：文本检索 + 时间对齐

**问题**："我在视频里提到'人工智能'是在什么时候？"

#### 测试用例 T2.1：关键词时间定位

```python
@pytest.mark.asyncio
async def test_q2_keyword_time():
    """Q2: 提到'人工智能'是什么时候？"""
    
    query = "我在视频里提到'人工智能'是在什么时候？"
    expected_time = "2024-12-20T10:05:00"  # 第一次提到的时间
    
    result = await retrieval(
        store=test_store,
        tenant_id="test_tenant",
        user_tokens=["user_test_001"],
        query=query,
        strategy="dialog_v2",
    )
    
    # 验证返回的 UtteranceEvidence 包含关键词
    utterances = extract_utterances_from_result(result)
    assert any("人工智能" in u["raw_text"] for u in utterances)
    
    # 验证时间正确
    first_mention = min(utterances, key=lambda u: u["t_media_start"])
    assert first_mention["t_media_start"].startswith("2024-12-20T10")
```

#### 测试用例 T2.2：全文索引验证

```cypher
-- Fulltext 查询验证
CALL db.index.fulltext.queryNodes("tkg_utterance_text_v1", "人工智能")
YIELD node, score
WHERE node.tenant_id = $tenant_id
RETURN node.raw_text, node.t_media_start, score
ORDER BY node.t_media_start

-- 预期结果：2 条记录，时间分别是 10:05 和 10:15
```

---

### 3.3 Q3：视觉对象属性检索

**问题**："画面里出现过红色的杯子吗？"

#### 测试用例 T3.1：属性过滤查询

```python
@pytest.mark.asyncio
async def test_q3_visual_object():
    """Q3: 画面里出现过红色的杯子吗？"""
    
    query = "画面里出现过红色的杯子吗？"
    
    result = await retrieval(
        store=test_store,
        tenant_id="test_tenant",
        user_tokens=["user_test_001"],
        query=query,
        strategy="dialog_v2",
    )
    
    # 验证找到红色杯子
    evidences = extract_evidences_from_result(result)
    red_cups = [e for e in evidences if e.get("name") == "cup" and e.get("color") == "red"]
    assert len(red_cups) >= 1
    
    # 验证关联的时间/地点
    assert red_cups[0]["timestamp"].startswith("2024-12-20T10:30")
```

#### 测试用例 T3.2：向量 + 属性混合查询

```python
@pytest.mark.asyncio
async def test_q3_hybrid_search():
    """Q3: 向量召回 + 属性过滤"""
    
    # Step 1: 向量召回 "红色杯子"
    vec_results = await store.search_vectors(
        query="红色的杯子",
        collection="memory_image",
        topk=10,
    )
    
    # Step 2: 属性过滤
    filtered = [r for r in vec_results if r.payload.get("color") == "red"]
    assert len(filtered) >= 1
```

---

### 3.4 Q4：事件类型 + 参与者

**问题**："昨天下午跟我开会的人是谁？"

#### 测试用例 T4.1：会议参与者查询

```python
@pytest.mark.asyncio
async def test_q4_meeting_participants():
    """Q4: 昨天下午跟我开会的人是谁？"""
    
    query = "昨天下午跟我开会的人是谁？"
    expected_participants = ["Alice"]  # 不包含 Me
    
    result = await retrieval(
        store=test_store,
        tenant_id="test_tenant",
        user_tokens=["user_test_001"],
        query=query,
        strategy="dialog_v2",
        enable_entity_route=True,
        enable_time_route=True,
    )
    
    # 提取事件和参与者
    events = extract_events_from_result(result)
    meeting_events = [e for e in events if e.get("action") == "meeting"]
    
    assert len(meeting_events) >= 1
    
    # 验证参与者（排除自己）
    participants = meeting_events[0].get("participants", [])
    other_participants = [p for p in participants if p["name"] != "Me"]
    assert [p["name"] for p in other_participants] == expected_participants
```

#### 测试用例 T4.2：Cypher 查询验证

```cypher
-- 查询会议事件的参与者
MATCH (e:Event{action: "meeting"})-[:INVOLVES]->(p:Entity{type: "Person"})
WHERE e.tenant_id = $tenant_id
  AND date(e.t_abs_start) = date("2024-12-20")
  AND e.t_abs_start >= datetime("2024-12-20T12:00:00")
  AND p.global_id <> $user_id
RETURN p.name

-- 预期结果：["Alice"]
```

---

### 3.5 Q5：时序链 NEXT_EVENT

**问题**："我回家后做的第一件事是什么？"

#### 测试用例 T5.1：时序链查询

```python
@pytest.mark.asyncio
async def test_q5_first_thing_after_home():
    """Q5: 回家后做的第一件事是什么？"""
    
    query = "我回家后做的第一件事是什么？"
    expected_action = "put"  # 放钥匙
    expected_summary = "把车钥匙放在玄关"
    
    result = await retrieval(
        store=test_store,
        tenant_id="test_tenant",
        user_tokens=["user_test_001"],
        query=query,
        strategy="dialog_v2",
    )
    
    # 验证找到正确的下一个事件
    events = extract_events_from_result(result)
    
    # 方案1：直接检查结果
    assert any(e.get("action") == expected_action for e in events)
    
    # 方案2：验证解释路径
    explain = result.get("explain", {})
    assert "arrive_home" in explain.get("anchor_event", "")
    assert "NEXT_EVENT" in explain.get("path", "")
```

#### 测试用例 T5.2：NEXT_EVENT 链验证

```cypher
-- 从"回家"事件出发，找下一个事件
MATCH (e:Event)-[:NEXT_EVENT]->(next:Event)
WHERE e.tenant_id = $tenant_id
  AND (e.summary CONTAINS "回" AND e.summary CONTAINS "家")
RETURN next.summary, next.action, next.t_abs_start
ORDER BY next.t_abs_start LIMIT 1

-- 预期结果：{"summary": "把车钥匙放在玄关", "action": "put"}
```

---

### 3.6 Q6：时长聚合

**问题**："我昨天玩手机玩了多久？"

#### 测试用例 T6.1：时长聚合查询

```python
@pytest.mark.asyncio
async def test_q6_phone_duration():
    """Q6: 昨天玩手机玩了多久？"""
    
    query = "我昨天玩手机玩了多久？"
    expected_total_minutes = 60  # 30 + 30 分钟
    
    result = await retrieval(
        store=test_store,
        tenant_id="test_tenant",
        user_tokens=["user_test_001"],
        query=query,
        strategy="dialog_v2",
    )
    
    # 验证聚合结果
    # 注意：当前实现可能需要后处理聚合
    events = extract_events_from_result(result)
    phone_events = [e for e in events if e.get("action") == "use_phone"]
    
    total_minutes = sum(e.get("duration_minutes", 0) for e in phone_events)
    assert total_minutes == expected_total_minutes
```

#### 测试用例 T6.2：Cypher 聚合验证

```cypher
-- 聚合手机使用时长
MATCH (e:Event{action: "use_phone"})
WHERE e.tenant_id = $tenant_id
  AND date(e.t_abs_start) = date("2024-12-20")
RETURN SUM(e.duration_minutes) as total_minutes

-- 预期结果：60
```

---

### 3.7 Q7：状态追踪

**问题**："我的车钥匙现在在哪？"

#### 测试用例 T7.1：最后状态查询

```python
@pytest.mark.asyncio
async def test_q7_key_location():
    """Q7: 我的车钥匙现在在哪？"""
    
    query = "我的车钥匙现在在哪？"
    expected_location = "客厅"  # 最后一次移动到客厅
    
    result = await retrieval(
        store=test_store,
        tenant_id="test_tenant",
        user_tokens=["user_test_001"],
        query=query,
        strategy="dialog_v2",
        enable_entity_route=True,
    )
    
    # 验证找到钥匙相关事件
    events = extract_events_from_result(result)
    key_events = [e for e in events if "钥匙" in e.get("summary", "")]
    
    # 按时间排序，取最后一个
    latest = max(key_events, key=lambda e: e.get("t_abs_end", ""))
    assert expected_location in latest.get("summary", "") or \
           latest.get("scene") == "living_room"
```

#### 测试用例 T7.2：事件序列回放

```cypher
-- 查询钥匙相关事件，按时间倒序
MATCH (e:Event)-[:INVOLVES]->(key:Entity{name: "car_key"})
MATCH (e)-[:OCCURS_AT]->(p:Place)
WHERE e.tenant_id = $tenant_id
RETURN e.summary, p.name, e.t_abs_end
ORDER BY e.t_abs_end DESC
LIMIT 1

-- 预期结果：{"summary": "把车钥匙拿到客厅", "place": "客厅"}
```

---

### 3.8 Q8：条件存在性 + 时序约束

**问题**："出门前我锁门了吗？"

#### 测试用例 T8.1：锁门验证

```python
@pytest.mark.asyncio
async def test_q8_lock_before_leave():
    """Q8: 出门前我锁门了吗？"""
    
    query = "出门前我锁门了吗？"
    expected_answer = True  # 测试数据中有锁门事件
    
    result = await retrieval(
        store=test_store,
        tenant_id="test_tenant",
        user_tokens=["user_test_001"],
        query=query,
        strategy="dialog_v2",
    )
    
    # 验证找到锁门事件
    events = extract_events_from_result(result)
    lock_events = [e for e in events if e.get("action") == "lock"]
    
    # 验证锁门在出门之前（同一事件或之前）
    assert len(lock_events) >= 1
    lock_time = lock_events[0].get("t_abs_start")
    
    # 检查之后是否有开锁（unlock）事件
    unlock_events = [e for e in events 
                     if e.get("action") == "unlock" 
                     and e.get("t_abs_start", "") > lock_time]
    assert len(unlock_events) == 0  # 没有解锁
```

#### 测试用例 T8.2：时序约束验证

```cypher
-- 查询：在最后一次出门前，是否有锁门且之后没有开锁
MATCH (leave:Event)
WHERE leave.tenant_id = $tenant_id
  AND (leave.action = "leave" OR leave.summary CONTAINS "出门")

-- 在出门前的时间窗口内查找锁门事件
MATCH (lock:Event{action: "lock"})
WHERE lock.tenant_id = $tenant_id
  AND lock.t_abs_end <= leave.t_abs_start

-- 检查是否有中间的开锁事件
OPTIONAL MATCH (unlock:Event{action: "unlock"})
WHERE unlock.tenant_id = $tenant_id
  AND unlock.t_abs_start > lock.t_abs_end
  AND unlock.t_abs_end < leave.t_abs_start

RETURN 
  lock.t_abs_start as lock_time,
  leave.t_abs_start as leave_time,
  unlock IS NULL as door_was_locked

-- 预期结果：door_was_locked = true
```

---

## 四、测试实现计划

### 4.1 目录结构

```
modules/memory/tests/
├── integration/
│   ├── __init__.py
│   ├── conftest.py                    # 测试 fixtures
│   ├── test_data/
│   │   └── l1_l2_scenario.py          # 测试数据定义
│   ├── test_l1_direct_lookup.py       # L1 测试
│   └── test_l2_temporal_state.py      # L2 测试
├── unit/
│   └── test_retrieval_dialog_v2.py    # 现有单元测试
└── fixtures/
    └── graph_fixtures.py              # 图数据 fixtures
```

### 4.2 测试 Fixtures

```python
# conftest.py
import pytest
from modules.memory.tests.integration.test_data.l1_l2_scenario import (
    TEST_ENTITIES, TEST_PLACES, TEST_EVENTS, TEST_EDGES, TEST_UTTERANCES
)

@pytest.fixture(scope="module")
async def populated_store():
    """创建并填充测试数据的存储实例"""
    store = await create_test_store()
    
    # 写入测试数据
    await store.write_entities(TEST_ENTITIES)
    await store.write_places(TEST_PLACES)
    await store.write_events(TEST_EVENTS)
    await store.write_utterances(TEST_UTTERANCES)
    await store.write_edges(TEST_EDGES)
    
    yield store
    
    # 清理
    await store.cleanup()

@pytest.fixture
def test_tenant():
    return "test_tenant_l1_l2"

@pytest.fixture
def test_user():
    return ["user_test_001"]
```

### 4.3 执行命令

```bash
# 运行 L1-L2 全部测试
pytest modules/memory/tests/integration/test_l1_*.py modules/memory/tests/integration/test_l2_*.py -v

# 运行特定问题测试
pytest modules/memory/tests/integration/test_l1_direct_lookup.py::test_q1_places_on_friday -v

# 运行并生成覆盖率报告
pytest modules/memory/tests/integration/ --cov=modules/memory --cov-report=html

# Cypher 验证脚本
python scripts/validate_l1_l2_cypher.py
```

---

## 五、验收标准

### 5.1 测试通过标准

| 指标 | 要求 | 当前状态 |
|------|------|----------|
| L1 用例通过率 | 100% (4/4) | 🔲 待实现 |
| L2 用例通过率 | 100% (4/4) | 🔲 待实现 |
| Cypher 查询正确率 | 100% | 🔲 待验证 |
| 检索延迟 P95 | < 500ms | 🔲 待测量 |
| 解释路径完整性 | 100% 有证据链 | 🔲 待实现 |

### 5.2 回归测试集成

```yaml
# .github/workflows/l1_l2_test.yml
name: L1-L2 Coverage Test

on:
  push:
    paths:
      - 'modules/memory/**'
  pull_request:
    paths:
      - 'modules/memory/**'

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      neo4j:
        image: neo4j:5.15
        env:
          NEO4J_AUTH: neo4j/password
        ports:
          - 7687:7687
      qdrant:
        image: qdrant/qdrant:v1.7.0
        ports:
          - 6333:6333
    
    steps:
      - uses: actions/checkout@v4
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: uv sync
      - name: Run L1-L2 Tests
        run: |
          pytest modules/memory/tests/integration/test_l1_*.py \
                 modules/memory/tests/integration/test_l2_*.py \
                 -v --tb=short
```

---

## 六、风险与依赖

### 6.1 前置依赖

| 依赖项 | 状态 | 阻塞测试 |
|--------|------|----------|
| TimeSlice 写入与查询 | ✅ 已实现 | Q1, Q2, Q4, Q6 |
| NEXT_EVENT 链构建 | ⚠️ 需验证 | Q5 |
| Entity Route 解析 | ✅ 已实现 | Q4, Q7 |
| 时长聚合查询 | ⚠️ 需后处理 | Q6 |
| 状态追踪查询 | ⚠️ 可用事件替代 | Q7 |
| 时序约束查询 | ⚠️ 需验证 | Q8 |

### 6.2 潜在风险

1. **时间解析不准确**：自然语言"上周五"→ 日期转换依赖 Time Route 实现
2. **NEXT_EVENT 链不完整**：需要验证图构建阶段是否正确创建时序边
3. **聚合查询性能**：Q6 时长聚合可能需要优化或缓存

---

## 版本记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2024-12-26 | 初版：8 个 L1-L2 测试用例设计 |








