# Memory API 改进方案详细设计

## 1. 统一MemoryService接口设计

### 1.1 当前问题分析
- 现有的MemoryService接口分散在多个模块中，缺乏统一性
- 向量库和图库操作接口不一致，增加使用复杂度
- 缺乏明确的抽象层，导致业务逻辑与存储实现耦合

### 1.2 改进方案

#### 1.2.1 创建统一的MemoryService接口

```python
# modules/memory/ports/memory_port.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple
from modules.memory.contracts.memory_models import MemoryEntry, Edge, SearchResult

class MemoryService(ABC):
    """统一的记忆服务接口，封装向量库和图库操作"""
    
    # === 基础CRUD操作 ===
    @abstractmethod
    async def add_memory(self, entry: MemoryEntry) -> str:
        """添加单个记忆条目，同时写入向量库和图库"""
        pass
    
    @abstractmethod
    async def add_memories(self, entries: List[MemoryEntry]) -> List[str]:
        """批量添加记忆条目"""
        pass
    
    @abstractmethod
    async def get_memory(self, memory_id: str) -> Optional[MemoryEntry]:
        """获取单个记忆条目"""
        pass
    
    @abstractmethod
    async def update_memory(self, memory_id: str, updates: Dict[str, Any]) -> bool:
        """更新记忆条目"""
        pass
    
    @abstractmethod
    async def delete_memory(self, memory_id: str) -> bool:
        """删除记忆条目"""
        pass
    
    # === 向量搜索操作 ===
    @abstractmethod
    async def search_similar(
        self, 
        query_vector: List[float], 
        *,
        modality: Optional[str] = None,
        user_ids: Optional[List[str]] = None,
        memory_domain: Optional[str] = None,
        limit: int = 10,
        threshold: float = 0.0
    ) -> SearchResult:
        """向量相似性搜索"""
        pass
    
    # === 图操作接口 ===
    @abstractmethod
    async def add_edge(self, edge: Edge) -> bool:
        """添加边关系"""
        pass
    
    @abstractmethod
    async def add_edges(self, edges: List[Edge]) -> int:
        """批量添加边关系"""
        pass
    
    @abstractmethod
    async def get_neighbors(
        self,
        node_id: str,
        *,
        rel_types: Optional[List[str]] = None,
        max_hops: int = 1,
        limit: int = 10
    ) -> Dict[str, Any]:
        """获取节点的邻居"""
        pass
    
    @abstractmethod
    async def find_path(
        self,
        src_id: str,
        dst_id: str,
        *,
        max_depth: int = 3,
        rel_types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """查找两节点间的路径"""
        pass
    
    # === 混合搜索接口 ===
    @abstractmethod
    async def hybrid_search(
        self,
        query_vector: List[float],
        *,
        graph_constraints: Optional[Dict[str, Any]] = None,
        limit: int = 10
    ) -> SearchResult:
        """结合向量相似性和图结构的混合搜索"""
        pass
```

#### 1.2.2 实现统一的MemoryServiceImpl

```python
# modules/memory/services/memory_service_impl.py
from typing import List, Dict, Any, Optional
from modules.memory.ports.memory_port import MemoryService
from modules.memory.contracts.memory_models import MemoryEntry, Edge, SearchResult
from modules.memory.infra.vector_store import VectorStore
from modules.memory.infra.neo4j_store import Neo4jStore
import logging

class MemoryServiceImpl(MemoryService):
    """MemoryService的统一实现，协调向量库和图库操作"""
    
    def __init__(self, vector_store: VectorStore, graph_store: Neo4jStore):
        self.vector_store = vector_store
        self.graph_store = graph_store
        self.logger = logging.getLogger(__name__)
    
    async def add_memory(self, entry: MemoryEntry) -> str:
        """添加单个记忆条目，同时写入向量库和图库"""
        try:
            # 1. 写入向量库
            vector_id = await self.vector_store.add(entry)
            
            # 2. 写入图库
            await self.graph_store.merge_nodes_edges([entry])
            
            self.logger.info(f"Successfully added memory {entry.id} to both stores")
            return entry.id
            
        except Exception as e:
            self.logger.error(f"Failed to add memory {entry.id}: {e}")
            raise
    
    async def add_memories(self, entries: List[MemoryEntry]) -> List[str]:
        """批量添加记忆条目"""
        try:
            # 1. 批量写入向量库
            vector_ids = await self.vector_store.add_batch(entries)
            
            # 2. 批量写入图库
            await self.graph_store.merge_nodes_edges_batch(entries)
            
            self.logger.info(f"Successfully batch added {len(entries)} memories")
            return [entry.id for entry in entries]
            
        except Exception as e:
            self.logger.error(f"Failed to batch add memories: {e}")
            raise
    
    async def add_edge(self, edge: Edge) -> bool:
        """添加边关系"""
        try:
            await self.graph_store.merge_rel(
                edge.src_id, 
                edge.dst_id, 
                edge.rel_type, 
                weight=edge.weight
            )
            return True
        except Exception as e:
            self.logger.error(f"Failed to add edge {edge.src_id}->{edge.dst_id}: {e}")
            return False
    
    async def hybrid_search(
        self,
        query_vector: List[float],
        *,
        graph_constraints: Optional[Dict[str, Any]] = None,
        limit: int = 10
    ) -> SearchResult:
        """结合向量相似性和图结构的混合搜索"""
        try:
            # 1. 向量搜索获取候选集
            vector_results = await self.vector_store.search(
                query_vector, 
                limit=limit * 2  # 获取更多候选用于图过滤
            )
            
            if not graph_constraints:
                return vector_results
            
            # 2. 使用图结构进行过滤和重排序
            candidate_ids = [hit.id for hit in vector_results.hits]
            
            # 根据图约束进行过滤
            filtered_results = []
            for hit in vector_results.hits:
                # 这里可以添加图结构相关的过滤逻辑
                # 例如：检查节点是否在特定子图中、是否满足特定关系等
                filtered_results.append(hit)
            
            return SearchResult(hits=filtered_results[:limit])
            
        except Exception as e:
            self.logger.error(f"Hybrid search failed: {e}")
            raise
```

## 2. 图库接口功能增强

### 2.1 当前问题分析
- Neo4jStore缺少高级图查询功能
- 没有图算法支持（如路径发现、社区检测等）
- 缺乏图模式匹配和查询优化

### 2.2 改进方案

#### 2.2.1 增强图查询功能

```python
# modules/memory/ports/graph_port.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple

class GraphService(ABC):
    """图服务接口，提供高级图操作功能"""
    
    @abstractmethod
    async def find_shortest_path(
        self,
        src_id: str,
        dst_id: str,
        *,
        rel_types: Optional[List[str]] = None,
        weight_property: str = "weight"
    ) -> Optional[List[Dict[str, Any]]]:
        """查找最短路径"""
        pass
    
    @abstractmethod
    async def find_all_paths(
        self,
        src_id: str,
        dst_id: str,
        *,
        max_depth: int = 3,
        rel_types: Optional[List[str]] = None
    ) -> List[List[Dict[str, Any]]]:
        """查找所有路径"""
        pass
    
    @abstractmethod
    async def get_node_degree(self, node_id: str, *, direction: str = "both") -> Dict[str, int]:
        """获取节点度数"""
        pass
    
    @abstractmethod
    async def find_cycles(
        self,
        *,
        max_length: int = 5,
        node_ids: Optional[List[str]] = None
    ) -> List[List[str]]:
        """查找图中的环"""
        pass
    
    @abstractmethod
    async def get_subgraph(
        self,
        seed_nodes: List[str],
        *,
        max_hops: int = 2,
        rel_types: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """获取子图"""
        pass
    
    @abstractmethod
    async def pattern_match(
        self,
        pattern: str,
        *,
        parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """图模式匹配"""
        pass
```

#### 2.2.2 实现增强的图服务

```python
# modules/memory/infra/enhanced_neo4j_store.py
from typing import List, Dict, Any, Optional, Tuple
from modules.memory.ports.graph_port import GraphService
from modules.memory.infra.neo4j_store import Neo4jStore
import logging

class EnhancedNeo4jStore(Neo4jStore, GraphService):
    """增强的Neo4j存储实现，提供高级图操作功能"""
    
    def __init__(self, settings: Dict[str, Any] | None = None):
        super().__init__(settings)
        self.logger = logging.getLogger(__name__)
    
    async def find_shortest_path(
        self,
        src_id: str,
        dst_id: str,
        *,
        rel_types: Optional[List[str]] = None,
        weight_property: str = "weight"
    ) -> Optional[List[Dict[str, Any]]]:
        """查找最短路径"""
        if not self._driver:
            return None
            
        try:
            with self._driver.session() as sess:
                # 构建关系类型过滤
                rel_filter = ""
                params = {"src": src_id, "dst": dst_id}
                
                if rel_types:
                    rel_filter = f":{rel_types[0]}"
                    if len(rel_types) > 1:
                        rel_filter = "|" + "|".join(rel_types)
                    params["rels"] = rel_types
                
                query = f"""
                MATCH (start:Entity {{id: $src}}), (end:Entity {{id: $dst}})
                MATCH path = shortestPath((start)-[{rel_filter}*]-(end))
                RETURN path, length(path) as path_length
                ORDER BY path_length
                LIMIT 1
                """
                
                result = sess.run(query, **params)
                record = result.single()
                
                if record:
                    path = record["path"]
                    return self._extract_path_info(path)
                    
                return None
                
        except Exception as e:
            self.logger.error(f"Failed to find shortest path: {e}")
            return None
    
    async def find_all_paths(
        self,
        src_id: str,
        dst_id: str,
        *,
        max_depth: int = 3,
        rel_types: Optional[List[str]] = None
    ) -> List[List[Dict[str, Any]]]:
        """查找所有路径"""
        if not self._driver:
            return []
            
        try:
            with self._driver.session() as sess:
                rel_filter = ""
                params = {"src": src_id, "dst": dst_id, "max_depth": max_depth}
                
                if rel_types:
                    rel_filter = f":{rel_types[0]}"
                    if len(rel_types) > 1:
                        rel_filter = "|" + "|".join(rel_types)
                    params["rels"] = rel_types
                
                query = f"""
                MATCH (start:Entity {{id: $src}}), (end:Entity {{id: $dst}})
                MATCH path = (start)-[{rel_filter}*1..$max_depth]-(end)
                RETURN path, length(path) as path_length
                ORDER BY path_length
                """
                
                result = sess.run(query, **params)
                paths = []
                
                for record in result:
                    path = record["path"]
                    path_info = self._extract_path_info(path)
                    if path_info:
                        paths.append(path_info)
                
                return paths
                
        except Exception as e:
            self.logger.error(f"Failed to find all paths: {e}")
            return []
    
    async def get_node_degree(self, node_id: str, *, direction: str = "both") -> Dict[str, int]:
        """获取节点度数"""
        if not self._driver:
            return {"in": 0, "out": 0, "total": 0}
            
        try:
            with self._driver.session() as sess:
                params = {"node_id": node_id}
                
                if direction == "in":
                    query = """
                    MATCH (n:Entity {id: $node_id})
                    OPTIONAL MATCH (m)-[r]->(n)
                    RETURN count(r) as in_degree, 0 as out_degree, count(r) as total_degree
                    """
                elif direction == "out":
                    query = """
                    MATCH (n:Entity {id: $node_id})
                    OPTIONAL MATCH (n)-[r]->(m)
                    RETURN 0 as in_degree, count(r) as out_degree, count(r) as total_degree
                    """
                else:  # both
                    query = """
                    MATCH (n:Entity {id: $node_id})
                    OPTIONAL MATCH (m)-[r_in]->(n)
                    OPTIONAL MATCH (n)-[r_out]->(m)
                    RETURN count(r_in) as in_degree, count(r_out) as out_degree, 
                           count(r_in) + count(r_out) as total_degree
                    """
                
                result = sess.run(query, **params)
                record = result.single()
                
                if record:
                    return {
                        "in": record["in_degree"],
                        "out": record["out_degree"],
                        "total": record["total_degree"]
                    }
                
                return {"in": 0, "out": 0, "total": 0}
                
        except Exception as e:
            self.logger.error(f"Failed to get node degree: {e}")
            return {"in": 0, "out": 0, "total": 0}
    
    async def find_cycles(
        self,
        *,
        max_length: int = 5,
        node_ids: Optional[List[str]] = None
    ) -> List[List[str]]:
        """查找图中的环"""
        if not self._driver:
            return []
            
        try:
            with self._driver.session() as sess:
                params = {"max_length": max_length}
                
                node_filter = ""
                if node_ids:
                    node_filter = "AND n.id IN $node_ids"
                    params["node_ids"] = node_ids
                
                query = f"""
                MATCH (n:Entity)
                WHERE n.id IN $node_ids {node_filter}
                MATCH path = (n)-[*1..$max_length]->(n)
                WHERE length(path) >= 2  # 排除自环
                WITH DISTINCT path
                RETURN [node in nodes(path) | node.id] as cycle_ids, length(path) as cycle_length
                ORDER BY cycle_length
                """
                
                result = sess.run(query, **params)
                cycles = []
                
                for record in result:
                    cycles.append(record["cycle_ids"])
                
                return cycles
                
        except Exception as e:
            self.logger.error(f"Failed to find cycles: {e}")
            return []
    
    async def get_subgraph(
        self,
        seed_nodes: List[str],
        *,
        max_hops: int = 2,
        rel_types: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """获取子图"""
        if not self._driver:
            return {"nodes": [], "edges": []}
            
        try:
            with self._driver.session() as sess:
                params = {"seed_nodes": seed_nodes, "max_hops": max_hops}
                
                rel_filter = ""
                if rel_types:
                    rel_filter = ":" + "|".join(rel_types)
                    params["rels"] = rel_types
                
                query = f"""
                MATCH (start:Entity)
                WHERE start.id IN $seed_nodes
                MATCH path = (start)-[{rel_filter}*1..$max_hops]-(connected)
                WITH DISTINCT nodes(path) as path_nodes, relationships(path) as path_rels
                UNWIND path_nodes as node
                UNWIND path_rels as rel
                RETURN DISTINCT 
                    collect(DISTINCT node) as nodes,
                    collect(DISTINCT rel) as relationships
                """
                
                result = sess.run(query, **params)
                record = result.single()
                
                if record:
                    nodes = []
                    edges = []
                    
                    # 处理节点
                    for node in record["nodes"]:
                        nodes.append({
                            "id": node["id"],
                            "labels": list(node.labels),
                            "properties": dict(node)
                        })
                    
                    # 处理边
                    for rel in record["relationships"]:
                        edges.append({
                            "id": str(rel.id),
                            "type": rel.type,
                            "source": rel.start_node["id"],
                            "target": rel.end_node["id"],
                            "properties": dict(rel)
                        })
                    
                    return {"nodes": nodes, "edges": edges}
                
                return {"nodes": [], "edges": []}
                
        except Exception as e:
            self.logger.error(f"Failed to get subgraph: {e}")
            return {"nodes": [], "edges": []}
    
    async def pattern_match(
        self,
        pattern: str,
        *,
        parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """图模式匹配"""
        if not self._driver:
            return []
            
        try:
            with self._driver.session() as sess:
                params = parameters or {}
                
                query = f"""
                MATCH {pattern}
                RETURN *
                """
                
                result = sess.run(query, **params)
                matches = []
                
                for record in result:
                    matches.append(dict(record))
                
                return matches
                
        except Exception as e:
            self.logger.error(f"Failed to match pattern: {e}")
            return []
    
    def _extract_path_info(self, path) -> List[Dict[str, Any]]:
        """从Neo4j路径对象中提取路径信息"""
        if not path:
            return []
            
        path_info = []
        nodes = path.nodes
        relationships = path.relationships
        
        for i, node in enumerate(nodes):
            path_info.append({
                "node": {
                    "id": node["id"],
                    "labels": list(node.labels),
                    "properties": dict(node)
                }
            })
            
            if i < len(relationships):
                rel = relationships[i]
                path_info.append({
                    "relationship": {
                        "id": str(rel.id),
                        "type": rel.type,
                        "properties": dict(rel)
                    }
                })
        
        return path_info
```

## 3. 边关系管理优化

### 3.1 当前问题分析
- 边关系类型缺乏标准化
- 边权重管理不够灵活
- 缺乏边关系的生命周期管理

### 3.2 改进方案

#### 3.2.1 标准化边关系类型定义

```python
# modules/memory/domain/edge_types.py
from enum import Enum
from typing import Dict, List

class EdgeType(Enum):
    """标准化的边关系类型枚举"""
    
    # === 基础语义关系 ===
    RELATED_TO = "RELATED_TO"           # 一般关联
    SIMILAR_TO = "SIMILAR_TO"           # 相似性
    EQUIVALENCE = "EQUIVALENCE"         # 等价关系
    
    # === 时序关系 ===
    BEFORE = "BEFORE"                   # 时间顺序
    AFTER = "AFTER"                     # 逆序
    TEMPORAL_NEXT = "TEMPORAL_NEXT"     # 时序链
    CONCURRENT = "CONCURRENT"           # 并发
    
    # === 层次关系 ===
    PART_OF = "PART_OF"                 # 部分关系
    CONTAINS = "CONTAINS"               # 包含关系
    PARENT_OF = "PARENT_OF"             # 父子关系
    CHILD_OF = "CHILD_OF"               # 子关系
    
    # === 语义角色关系 ===
    SAID_BY = "SAID_BY"                 # 说话者
    APPEARS_IN = "APPEARS_IN"           # 出现于
    DESCRIBES = "DESCRIBES"             # 描述
    REFERENCES = "REFERENCES"           # 引用
    
    # === 空间关系 ===
    LOCATED_IN = "LOCATED_IN"           # 位置
    NEARBY = "NEARBY"                   # 邻近
    DIRECTION = "DIRECTION"             # 方向
    
    # === 因果关系 ===
    CAUSES = "CAUSES"                   # 导致
    CAUSED_BY = "CAUSED_BY"             # 由...导致
    ENABLES = "ENABLES"                 # 使能
    PREVENTS = "PREVENTS"               # 阻止
    
    # === 用户行为关系 ===
    PREFER = "PREFER"                   # 偏好
    AVOID = "AVOID"                     # 避免
    EXECUTED = "EXECUTED"               # 执行
    TRIGGERED = "TRIGGERED"             # 触发
    
    # === 共现关系 ===
    CO_OCCURS = "CO_OCCURS"             # 共现
    CO_OCCURS_WITH = "CO_OCCURS_WITH"    # 与...共现
    
    # === 事件关系 ===
    OCCURS_AT = "OCCURS_AT"             # 发生于时间
    OCCURS_DURING = "OCCURS_DURING"     # 发生于期间
    PARTICIPATES_IN = "PARTICIPATES_IN" # 参与

class EdgeTypeRegistry:
    """边关系类型注册表，管理关系类型的元数据"""
    
    _registry: Dict[str, Dict[str, Any]] = {
        edge_type.value: {
            "category": self._get_category(edge_type),
            "description": self._get_description(edge_type),
            "weight_range": self._get_weight_range(edge_type),
            "directional": self._is_directional(edge_type),
            "properties": self._get_required_properties(edge_type)
        }
        for edge_type in EdgeType
    }
    
    @staticmethod
    def _get_category(edge_type: EdgeType) -> str:
        """获取边关系类型分类"""
        categories = {
            EdgeType.RELATED_TO: "semantic",
            EdgeType.SIMILAR_TO: "semantic",
            EdgeType.EQUIVALENCE: "semantic",
            EdgeType.BEFORE: "temporal",
            EdgeType.AFTER: "temporal",
            EdgeType.TEMPORAL_NEXT: "temporal",
            EdgeType.CONCURRENT: "temporal",
            EdgeType.PART_OF: "hierarchical",
            EdgeType.CONTAINS: "hierarchical",
            EdgeType.PARENT_OF: "hierarchical",
            EdgeType.CHILD_OF: "hierarchical",
            EdgeType.SAID_BY: "semantic_role",
            EdgeType.APPEARS_IN: "semantic_role",
            EdgeType.DESCRIBES: "semantic_role",
            EdgeType.REFERENCES: "semantic_role",
            EdgeType.LOCATED_IN: "spatial",
            EdgeType.NEARBY: "spatial",
            EdgeType.DIRECTION: "spatial",
            EdgeType.CAUSES: "causal",
            EdgeType.CAUSED_BY: "causal",
            EdgeType.ENABLES: "causal",
            EdgeType.PREVENTS: "causal",
            EdgeType.PREFER: "behavioral",
            EdgeType.AVOID: "behavioral",
            EdgeType.EXECUTED: "behavioral",
            EdgeType.TRIGGERED: "behavioral",
            EdgeType.CO_OCCURS: "co_occurrence",
            EdgeType.CO_OCCURS_WITH: "co_occurrence",
            EdgeType.OCCURS_AT: "event",
            EdgeType.OCCURS_DURING: "event",
            EdgeType.PARTICIPATES_IN: "event",
        }
        return categories.get(edge_type, "unknown")
    
    @staticmethod
    def _get_description(edge_type: EdgeType) -> str:
        """获取边关系类型描述"""
        descriptions = {
            EdgeType.RELATED_TO: "一般关联关系",
            EdgeType.SIMILAR_TO: "相似性关系",
            EdgeType.EQUIVALENCE: "等价关系",
            EdgeType.BEFORE: "时间顺序关系",
            EdgeType.AFTER: "逆序时间关系",
            EdgeType.TEMPORAL_NEXT: "时序链关系",
            EdgeType.CONCURRENT: "并发关系",
            EdgeType.PART_OF: "部分-整体关系",
            EdgeType.CONTAINS: "包含关系",
            EdgeType.PARENT_OF: "父子关系",
            EdgeType.CHILD_OF: "子关系",
            EdgeType.SAID_BY: "说话者关系",
            EdgeType.APPEARS_IN: "出现于关系",
            EdgeType.DESCRIBES: "描述关系",
            EdgeType.REFERENCES: "引用关系",
            EdgeType.LOCATED_IN: "位置关系",
            EdgeType.NEARBY: "邻近关系",
            EdgeType.DIRECTION: "方向关系",
            EdgeType.CAUSES: "因果关系",
            EdgeType.CAUSED_BY: "由...导致",
            EdgeType.ENABLES: "使能关系",
            EdgeType.PREVENTS: "阻止关系",
            EdgeType.PREFER: "偏好关系",
            EdgeType.AVOID: "避免关系",
            EdgeType.EXECUTED: "执行关系",
            EdgeType.TRIGGERED: "触发关系",
            EdgeType.CO_OCCURS: "共现关系",
            EdgeType.CO_OCCURS_WITH: "与...共现",
            EdgeType.OCCURS_AT: "发生于时间",
            EdgeType.OCCURS_DURING: "发生于期间",
            EdgeType.PARTICIPATES_IN: "参与关系",
        }
        return descriptions.get(edge_type, "未定义关系")
    
    @staticmethod
    def _get_weight_range(edge_type: EdgeType) -> Tuple[float, float]:
        """获取边权重的合理范围"""
        weight_ranges = {
            EdgeType.RELATED_TO: (0.0, 1.0),
            EdgeType.SIMILAR_TO: (0.0, 1.0),
            EdgeType.EQUIVALENCE: (0.0, 1.0),
            EdgeType.BEFORE: (1.0, 1.0),  # 无权重
            EdgeType.AFTER: (1.0, 1.0),
            EdgeType.TEMPORAL_NEXT: (1.0, 1.0),
            EdgeType.CONCURRENT: (1.0, 1.0),
            EdgeType.PART_OF: (0.0, 1.0),
            EdgeType.CONTAINS: (0.0, 1.0),
            EdgeType.PARENT_OF: (1.0, 1.0),
            EdgeType.CHILD_OF: (1.0, 1.0),
            EdgeType.SAID_BY: (0.0, 1.0),
            EdgeType.APPEARS_IN: (0.0, 1.0),
            EdgeType.DESCRIBES: (0.0, 1.0),
            EdgeType.REFERENCES: (0.0, 1.0),
            EdgeType.LOCATED_IN: (0.0, 1.0),
            EdgeType.NEARBY: (0.0, 1.0),
            EdgeType.DIRECTION: (1.0, 1.0),
            EdgeType.CAUSES: (0.0, 1.0),
            EdgeType.CAUSED_BY: (0.0, 1.0),
            EdgeType.ENABLES: (0.0, 1.0),
            EdgeType.PREVENTS: (0.0, 1.0),
            EdgeType.PREFER: (0.0, 1.0),
            EdgeType.AVOID: (0.0, 1.0),
            EdgeType.EXECUTED: (0.0, 1.0),
            EdgeType.TRIGGERED: (0.0, 1.0),
            EdgeType.CO_OCCURS: (0.0, 1.0),
            EdgeType.CO_OCCURS_WITH: (0.0, 1.0),
            EdgeType.OCCURS_AT: (1.0, 1.0),
            EdgeType.OCCURS_DURING: (1.0, 1.0),
            EdgeType.PARTICIPATES_IN: (0.0, 1.0),
        }
        return weight_ranges.get(edge_type, (0.0, 1.0))
    
    @staticmethod
    def _is_directional(edge_type: EdgeType) -> bool:
        """判断边关系是否有方向性"""
        non_directional = {
            EdgeType.RELATED_TO,
            EdgeType.SIMILAR_TO,
            EdgeType.EQUIVALENCE,
            EdgeType.CONCURRENT,
            EdgeType.CO_OCCURS,
            EdgeType.CO_OCCURS_WITH,
            EdgeType.NEARBY,
        }
        return edge_type not in non_directional
    
    @staticmethod
    def _get_required_properties(edge_type: EdgeType) -> List[str]:
        """获取边关系必需的属性"""
        special_properties = {
            EdgeType.BEFORE: ["timestamp_diff"],
            EdgeType.AFTER: ["timestamp_diff"],
            EdgeType.TEMPORAL_NEXT: ["sequence_order"],
            EdgeType.CONCURRENT: ["time_window"],
            EdgeType.LOCATED_IN: ["location"],
            EdgeType.NEARBY: ["distance"],
            EdgeType.DIRECTION: ["direction"],
            EdgeType.OCCURS_AT: ["timestamp"],
            EdgeType.OCCURS_DURING: ["start_time", "end_time"],
        }
        return special_properties.get(edge_type, [])
    
    @classmethod
    def get_edge_type_info(cls, edge_type: str) -> Dict[str, Any]:
        """获取边关系类型的元数据"""
        return cls._registry.get(edge_type, {})
    
    @classmethod
    def get_edge_types_by_category(cls, category: str) -> List[str]:
        """按分类获取边关系类型"""
        return [
            edge_type for edge_type, info in cls._registry.items()
            if info.get("category") == category
        ]
    
    @classmethod
    def is_valid_edge_type(cls, edge_type: str) -> bool:
        """验证边关系类型是否有效"""
        return edge_type in cls._registry
    
    @classmethod
    def validate_edge_weight(cls, edge_type: str, weight: float) -> bool:
        """验证边权重是否在合理范围内"""
        if not cls.is_valid_edge_type(edge_type):
            return False
        
        min_weight, max_weight = cls._registry[edge_type]["weight_range"]
        return min_weight <= weight <= max_weight
```

#### 3.2.2 实现边关系管理服务

```python
# modules/memory/services/edge_management_service.py
from typing import List, Dict, Any, Optional, Tuple
from modules.memory.domain.edge_types import EdgeType, EdgeTypeRegistry
from modules.memory.contracts.memory_models import Edge
from modules.memory.ports.memory_port import MemoryService
import logging
from datetime import datetime

class EdgeManagementService:
    """边关系管理服务，提供边关系的生命周期管理"""
    
    def __init__(self, memory_service: MemoryService):
        self.memory_service = memory_service
        self.logger = logging.getLogger(__name__)
    
    async def create_edge(
        self,
        src_id: str,
        dst_id: str,
        edge_type: str,
        *,
        weight: Optional[float] = None,
        properties: Optional[Dict[str, Any]] = None,
        validate: bool = True
    ) -> bool:
        """创建边关系"""
        try:
            # 验证边关系类型
            if validate and not EdgeTypeRegistry.is_valid_edge_type(edge_type):
                self.logger.error(f"Invalid edge type: {edge_type}")
                return False
            
            # 获取边类型信息
            edge_info = EdgeTypeRegistry.get_edge_type_info(edge_type)
            
            # 设置默认权重
            if weight is None:
                min_weight, max_weight = edge_info["weight_range"]
                weight = (min_weight + max_weight) / 2
            
            # 验证权重
            if validate and not EdgeTypeRegistry.validate_edge_weight(edge_type, weight):
                self.logger.error(f"Invalid weight {weight} for edge type {edge_type}")
                return False
            
            # 添加必需属性
            final_properties = properties or {}
            required_props = edge_info["properties"]
            for prop in required_props:
                if prop not in final_properties:
                    # 为必需属性设置默认值
                    if prop == "timestamp_diff":
                        final_properties[prop] = 0
                    elif prop == "sequence_order":
                        final_properties[prop] = 1
                    elif prop == "time_window":
                        final_properties[prop] = 1.0
                    elif prop == "location":
                        final_properties[prop] = "unknown"
                    elif prop == "distance":
                        final_properties[prop] = 0.0
                    elif prop == "direction":
                        final_properties[prop] = "unknown"
                    elif prop == "timestamp":
                        final_properties[prop] = datetime.now().isoformat()
                    elif prop == "start_time":
                        final_properties[prop] = datetime.now().isoformat()
                    elif prop == "end_time":
                        final_properties[prop] = datetime.now().isoformat()
            
            # 添加元数据
            final_properties.update({
                "created_at": datetime.now().isoformat(),
                "category": edge_info["category"],
                "directional": edge_info["directional"]
            })
            
            # 创建边
            edge = Edge(
                src_id=src_id,
                dst_id=dst_id,
                rel_type=edge_type,
                weight=weight,
                metadata=final_properties
            )
            
            return await self.memory_service.add_edge(edge)
            
        except Exception as e:
            self.logger.error(f"Failed to create edge: {e}")
            return False
    
    async def create_bidirectional_edge(
        self,
        node1_id: str,
        node2_id: str,
        edge_type: str,
        *,
        weight1: Optional[float] = None,
        weight2: Optional[float] = None,
        properties1: Optional[Dict[str, Any]] = None,
        properties2: Optional[Dict[str, Any]] = None
    ) -> bool:
        """创建双向边关系"""
        try:
            # 检查是否为有向边
            edge_info = EdgeTypeRegistry.get_edge_type_info(edge_type)
            if edge_info.get("directional", True):
                # 有向边，创建两个方向
                success1 = await self.create_edge(
                    node1_id, node2_id, edge_type,
                    weight=weight1, properties=properties1
                )
                success2 = await self.create_edge(
                    node2_id, node1_id, edge_type,
                    weight=weight2, properties=properties2
                )
                return success1 and success2
            else:
                # 无向边，只创建一个方向
                return await self.create_edge(
                    node1_id, node2_id, edge_type,
                    weight=weight1, properties=properties1
                )
                
        except Exception as e:
            self.logger.error(f"Failed to create bidirectional edge: {e}")
            return False
    
    async def update_edge_weight(
        self,
        src_id: str,
        dst_id: str,
        edge_type: str,
        new_weight: float,
        *,
        operation: str = "replace"  # "replace", "add", "multiply"
    ) -> bool:
        """更新边权重"""
        try:
            if not EdgeTypeRegistry.validate_edge_weight(edge_type, new_weight):
                self.logger.error(f"Invalid weight {new_weight} for edge type {edge_type}")
                return False
            
            # 这里需要在底层实现中添加更新边权重的功能
            # 目前通过删除后重新创建实现
            # TODO: 实现更高效的边权重更新机制
            
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to update edge weight: {e}")
            return False
    
    async def decay_edge_weights(
        self,
        *,
        edge_types: Optional[List[str]] = None,
        decay_factor: float = 0.9,
        min_weight: float = 0.01,
        node_ids: Optional[List[str]] = None
    ) -> int:
        """边权重衰减"""
        try:
            # 这里需要在底层实现中添加批量权重衰减功能
            # TODO: 实现高效的批量权重衰减机制
            
            return 0
            
        except Exception as e:
            self.logger.error(f"Failed to decay edge weights: {e}")
            return 0
    
    async def get_edge_statistics(
        self,
        *,
        edge_types: Optional[List[str]] = None,
        node_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """获取边关系统计信息"""
        try:
            # 这里需要在底层实现中添加统计查询功能
            # TODO: 实现边关系统计查询
            
            return {
                "total_edges": 0,
                "edges_by_type": {},
                "weight_distribution": {},
                "avg_weight": 0.0
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get edge statistics: {e}")
            return {}
    
    async def find_edges_by_type(
        self,
        edge_type: str,
        *,
        node_ids: Optional[List[str]] = None,
        min_weight: float = 0.0,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """按类型查找边关系"""
        try:
            # 这里需要在底层实现中添加按类型查询功能
            # TODO: 实现按类型查询边关系
            
            return []
            
        except Exception as e:
            self.logger.error(f"Failed to find edges by type: {e}")
            return []
```

## 4. 实施建议

### 4.1 分阶段实施计划

#### 第一阶段：基础接口统一（2-3周）
1. 创建统一的MemoryService接口
2. 实现基础的MemoryServiceImpl
3. 重构现有代码以使用新接口
4. 添加基础测试用例

#### 第二阶段：图库功能增强（3-4周）
1. 实现EnhancedNeo4jStore
2. 添加高级图查询功能
3. 实现图算法支持
4. 性能优化和测试

#### 第三阶段：边关系管理优化（2-3周）
1. 实现EdgeTypeRegistry
2. 创建EdgeManagementService
3. 添加边关系验证和管理功能
4. 完善文档和示例

### 4.2 风险评估与缓解

#### 风险1：向后兼容性
- **风险**：新接口可能破坏现有代码
- **缓解**：保持旧接口，逐步迁移，提供适配器模式

#### 风险2：性能影响
- **风险**：统一接口可能引入性能开销
- **缓解**：性能基准测试，优化关键路径，使用缓存

#### 风险3：复杂性增加
- **风险**：新架构可能增加系统复杂性
- **缓解**：充分文档化，分阶段实施，团队培训

### 4.3 测试策略

#### 单元测试
- 每个新组件的独立功能测试
- 边界条件和异常情况测试
- 模拟依赖进行隔离测试

#### 集成测试
- 向量库和图库协同工作测试
- 端到端功能测试
- 性能基准测试

#### 兼容性测试
- 与现有代码的兼容性验证
- 数据迁移测试
- API版本兼容性测试

## 5. 总结

这些改进方案将显著提升Memory API的功能性、可用性和可维护性：

1. **统一接口设计**：简化使用复杂度，提高开发效率
2. **图库功能增强**：支持复杂图查询和算法，扩展应用场景
3. **边关系管理优化**：标准化边类型，提供灵活的权重管理

通过分阶段实施和充分测试，可以确保改进过程平稳进行，同时保持系统的稳定性和性能。