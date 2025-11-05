# Memory API 调研报告

## 执行摘要

经过深入分析，您的Memory API确实**同时支持向量库和图库操作**，并非只能操作向量库。系统采用了双存储架构：
- **向量库**：使用Qdrant进行语义相似性搜索
- **图库**：使用Neo4j进行关系图谱存储和查询

## 1. Memory API整体架构

### 1.1 核心组件架构

```
Memory API (FastAPI)
    ↓
MemoryService (业务逻辑层)
    ↓
┌─────────────────┬─────────────────┐
│   QdrantStore    │   Neo4jStore    │
│   (向量存储)      │   (图存储)       │
└─────────────────┴─────────────────┘
```

### 1.2 入口点分析

**主要入口**：
- [`modules/memory/api/server.py`](modules/memory/api/server.py:191) - FastAPI服务器
- [`modules/memory/__init__.py`](modules/memory/__init__.py:16) - 公共API导出

**核心服务**：
- [`modules/memory/application/service.py`](modules/memory/application/service.py:88) - MemoryService类，统一业务逻辑

## 2. 同步写入机制分析

### 2.1 写入流程

在[`modules/memorization_agent/application/pipeline_steps.py`](modules/memorization_agent/application/pipeline_steps.py:1630)的`step_write_memory`函数中：

```python
# 同步写入向量库和图库
entries, edges = mapper.map(vg, defaults=defaults)
# ...
result = await adapter.write(entries, edges)
```

**关键发现**：
1. **向量库和图库确实同步写入** - 通过同一个`write`调用
2. **边关系有完整的写入空间** - `edges`参数专门处理关系数据

### 2.2 VideoGraph到Memory的映射

在[`modules/memorization_agent/application/videograph_to_memory.py`](modules/memorization_agent/application/videograph_to_memory.py:60)中：

```python
def map(self, videograph: Any, *, defaults: Dict[str, Any] | None = None) -> Tuple[List[MemoryEntry], List[Edge]]:
    # 1) 节点映射 → MemoryEntry
    # 2) 边映射 → Edge
    # 3) 时序关系处理
    # 4) 位置关系处理
    # 5) 设备关系处理
    # 6) 共现关系处理
```

## 3. 向量库操作接口

### 3.1 QdrantStore核心功能

**位置**：[`modules/memory/infra/qdrant_store.py`](modules/memory/infra/qdrant_store.py:17)

**主要操作**：
- `upsert_vectors()` - 向量写入/更新
- `search_vectors()` - 向量相似性搜索
- `get()` - 单条记录获取
- `delete_ids()` - 批量删除

**支持的多模态向量**：
```python
buckets: Dict[str, List[Dict[str, Any]]] = {
    "text": [],      # 文本向量
    "image": [],     # 图像向量
    "audio": [],     # 音频向量
    "clip_image": [], # CLIP图像向量
    "face": []       # 人脸识别向量
}
```

### 3.2 向量搜索能力

```python
async def search_vectors(self, query: str, filters: Dict[str, Any], topk: int, threshold: float | None = None):
    # 支持多模态搜索
    # 支持复杂过滤条件
    # 支持阈值过滤
    # 支持权重调整
```

## 4. 图库操作接口

### 4.1 Neo4jStore核心功能

**位置**：[`modules/memory/infra/neo4j_store.py`](modules/memory/infra/neo4j_store.py:8)

**主要操作**：
- `merge_nodes_edges()` - 节点和关系批量写入
- `merge_rel()` - 单个关系写入
- `expand_neighbors()` - 图邻域扩展
- `add_pending_equivalence()` - 等价关系管理

### 4.2 支持的关系类型

在[`modules/memory/application/service.py`](modules/memory/application/service.py:194)中定义：

```python
self._allowed_rel_types: set[str] = {
    "appears_in",      # 出现于
    "said_by",         # 被说
    "located_in",       # 位于
    "equivalence",     # 等价
    "prefer",          # 偏好
    "executed",        # 执行
    "describes",       # 描述
    "temporal_next",   # 时序下一个
    "co_occurs",      # 共现
}
```

## 5. 边关系写入空间确认

### 5.1 边关系数据结构

在[`modules/memory/contracts/memory_models.py`](modules/memory/contracts/memory_models.py:66)中定义：

```python
class Edge(BaseModel):
    src_id: str           # 源节点ID
    dst_id: str           # 目标节点ID
    rel_type: str          # 关系类型
    weight: Optional[float] = None  # 关系权重
```

### 5.2 边关系写入机制

**写入流程**：
1. VideoGraph映射生成Edge对象
2. 通过MemoryAdapter的`write()`方法同步写入
3. 在MemoryService中分别调用向量库和图库存储

**关键代码路径**：
```python
# MemoryService.write() 方法中
await self.vectors.upsert_vectors(part)  # 向量库
await self.graph.merge_nodes_edges(part, None)  # 图库
# ...
if links2:
    await self.graph.merge_nodes_edges_batch([], links2)  # 边关系写入图库
```

## 6. 数据模型分析

### 6.1 MemoryEntry统一模型

```python
class MemoryEntry(BaseModel):
    id: Optional[str] = None
    kind: Literal["episodic", "semantic"]     # 记忆类型
    modality: Literal["text", "image", "audio", "structured"]  # 模态
    contents: List[str]                        # 内容
    vectors: Optional[Dict[str, List[float]]]   # 向量数据
    metadata: Dict[str, Any]                   # 元数据
```

### 6.2 支持的元数据字段

- `user_id[]` - 用户ID列表
- `memory_domain` - 记忆域
- `run_id` - 运行ID
- `timestamp` - 时间戳
- `clip_id` - 片段ID
- `character_id` - 角色ID
- `source` - 数据源
- `importance` - 重要性
- `stability` - 稳定性

## 7. 关键发现与结论

### 7.1 您的疑问解答

**疑问**："memory API是否只能去操作向量库而不能操作图库？"

**答案**：**否**。Memory API完全支持图库操作，具有完整的边关系写入空间。

### 7.2 系统优势

1. **双存储架构**：向量库负责语义搜索，图库负责关系推理
2. **同步写入**：确保数据一致性
3. **多模态支持**：文本、图像、音频、结构化数据
4. **丰富关系类型**：10+种预定义关系类型
5. **灵活查询**：支持向量搜索+图扩展的混合查询

### 7.3 潜在改进建议

1. **图查询性能优化**：考虑添加图索引策略
2. **关系权重动态调整**：基于使用频率自动调整
3. **批量操作优化**：进一步优化大批量写入性能
4. **监控增强**：添加更细粒度的性能指标

## 8. API使用示例

### 8.1 写入记忆条目和关系

```python
# 创建记忆条目
entries = [
    MemoryEntry(
        kind="episodic",
        modality="text",
        contents=["用户说了一句话"],
        metadata={"user_id": ["user123"], "timestamp": "2024-01-01T10:00:00Z"}
    )
]

# 创建关系
edges = [
    Edge(src_id="entry1", dst_id="entry2", rel_type="temporal_next", weight=0.8)
]

# 同步写入
await memory_service.write(entries, edges)
```

### 8.2 混合搜索

```python
# 向量搜索+图扩展
result = await memory_service.search(
    query="用户说的话",
    topk=10,
    expand_graph=True,  # 启用图扩展
    filters={"user_id": ["user123"]}
)
```

## 总结

您的Memory API是一个功能完整的双存储系统，**完全支持向量库和图库的协同操作**。边关系不仅有写入空间，而且支持丰富的关系类型和权重管理。系统设计合理，能够满足复杂的记忆存储和检索需求。

**核心优势**：
- ✅ 向量库+图库同步写入
- ✅ 完整的边关系支持
- ✅ 多模态数据处理
- ✅ 灵活的查询和过滤机制
- ✅ 良好的扩展性设计