# 02. Literature JSON → TKG 图导入算法与 Neo4j 写入

> 目标：给定第 1 步产生的标准 JSON 事件文件，将其稳定转换为图结构（节点 + 边），写入 Neo4j，同时保证“去重、幂等、可审计”。

## 1. ID 设计与去重策略

- `Character`  
  - 主键：`name`（实验阶段可简化），后续可拓展 `name + era`；  
  - 属性：`aliases` 用于归并别名。  
- `Faction`  
  - 主键：`name`。  
- `Place`  
  - 主键：`name`。  
- `TimeSlice`  
  - 主键：`{year, era}`。  
- `Event`  
  - 主键：`event_id`（由文本阶段的规则生成）。  
- `State`  
  - 主键：`state_id`（可由 `subject + property + time` hash 得到）。

所有写入采用 `MERGE`，保证重复导入同一 JSON 时不会出现重复节点。

## 2. 导入算法（概念层）

对每个 JSON 文件：

1. 解析 `timeslice`，`MERGE` 对应 `TimeSlice` 节点；  
2. 遍历 `events[]`：  
   - `MERGE` Event 节点；  
   - `MERGE` Place 节点并连 `OCCURS_AT`；  
   - 按参与者 `participants[]` 创建/关联 Character、Faction 节点及 `INVOLVES`、`BELONGS_TO` 边；  
   - 根据 `states[]` 创建 State 节点并通过 `HAS_STATE` / `TRANSITIONS_TO` 连接；  
   - 根据 `caused_by`、`causes`、`sequence_after` 建立 `CAUSES` / `NEXT_EVENT` 边。

导入顺序建议：
- 第一趟：只处理 TimeSlice / Event / Place / Character / Faction / INVOLVES / OCCURS_AT / BELONGS_TO / NEXT_EVENT。  
- 第二趟：在全局 Event 集合已存在的前提下，再补充 `CAUSES`、`State` 相关边，避免引用不存在的 `event_id`。

## 3. Cypher 写入模板（示例）

### 3.1 基本事件写入

```cypher
// 参数：$ts, $ev, $place_name, $participants
MERGE (t:TimeSlice {year: $ts.year, era: $ts.era})
  ON CREATE SET t.label = $ts.label

MERGE (p:Place {name: $place_name})
  ON CREATE SET p.kind = $place_kind

MERGE (e:Event {event_id: $ev.event_id})
  ON CREATE SET
    e.title   = $ev.title,
    e.type    = $ev.event_type,
    e.summary = $ev.summary
  ON MATCH SET
    e.summary = coalesce(e.summary, $ev.summary)

MERGE (e)-[:OCCURS_AT]->(t)
MERGE (e)-[:OCCURS_AT]->(p)

UNWIND $participants AS part
  MERGE (f:Faction {name: part.faction})
    ON CREATE SET f.type = 'kingdom'
  MERGE (c:Character {name: part.name})
    ON CREATE SET c.aliases = part.aliases
  MERGE (c)-[:BELONGS_TO]->(f)
  MERGE (e)-[:INVOLVES {role: part.role}]->(c)
```

### 3.2 因果与时序补全

```cypher
// 参数：$event_id, $caused_by_ids, $causes_ids, $sequence_after
MATCH (e:Event {event_id: $event_id})

UNWIND $caused_by_ids AS cid
  MATCH (prev:Event {event_id: cid})
  MERGE (prev)-[:CAUSES]->(e)

UNWIND $causes_ids AS tid
  MATCH (next:Event {event_id: tid})
  MERGE (e)-[:CAUSES]->(next)

UNWIND $sequence_after AS sid
  MATCH (prev:Event {event_id: sid})
  MERGE (prev)-[:NEXT_EVENT]->(e)
```

### 3.3 状态节点（可选）

```cypher
// 参数：$ts, $ev_id, $states[]
MATCH (e:Event {event_id: $ev_id})
MATCH (t:TimeSlice {year: $ts.year, era: $ts.era})

UNWIND $states AS st
  MATCH (c:Character {name: st.subject})
  MERGE (s:State {state_id: st.state_id})
    ON CREATE SET
      s.property = st.property,
      s.value    = st.value
  MERGE (c)-[:HAS_STATE]->(s)
  MERGE (s)-[:RECORDED_AT]->(t)
```

## 4. Python 导入器结构（伪代码）

```python
from neo4j import GraphDatabase
import json, pathlib

driver = GraphDatabase.driver(NEO4J_URI, auth=(USER, PASSWORD))

def import_json_file(path: pathlib.Path):
    data = json.loads(path.read_text())
    ts = data["timeslice"]
    events = data["events"]

    with driver.session() as session:
        for ev in events:
            session.execute_write(upsert_event, ts, ev)

def upsert_event(tx, ts, ev):
    # 1) 基本事件写入（TimeSlice, Place, Event, Character, Faction, INVOLVES, OCCURS_AT）
    tx.run(CYPHER_MERGE_EVENT, ts=ts,
           ev={
               "event_id": ev["event_id"],
               "title": ev["title"],
               "event_type": ev["event_type"],
               "summary": ev["summary"]
           },
           place_name=ev["place"]["name"],
           place_kind=ev["place"]["kind"],
           participants=ev["participants"])

def patch_relations(tx, ev):
    # 2) 因果 / NEXT_EVENT / 状态补全
    tx.run(CYPHER_PATCH_REL, event_id=ev["event_id"],
           caused_by_ids=ev.get("caused_by", []),
           causes_ids=ev.get("causes", []),
           sequence_after=[ev["sequence_after"]] if ev.get("sequence_after") else [])
    # 状态类似处理
```

导入过程分成两阶段执行（可以两遍跑整个目录，或在一次 session 中先缓存所有 `event_id` 再补充关系）。

## 5. 幂等与审计

- 所有 `MERGE` 对应的主键字段必须稳定（不要依赖 LLM 自由发挥）。  
- 建议在 Event/Character/Faction 上增加：  
  - `source_file`, `source_idx`, `import_run_id`, `created_at`, `updated_at`。  
- 如需支持“重建整图”，可以在导入前打一个 `run_id`，写在所有节点/边上，然后通过 `MATCH ... WHERE run_id = $X DETACH DELETE` 实现一次性清理。

## 6. 小结

这份文档给出了从 Literature JSON 到 Neo4j 图的完整路径：  
- 明确 ID / 去重规则；  
- 以 Cypher 模板+Python 导入器的方式落地；  
- 保证多次导入的幂等与可审计。

下一步：在 `03_查询器设计与用例集.md` 中定义一组标准查询，对建好的图进行系统性“压力测试”。

