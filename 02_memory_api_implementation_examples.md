# 记忆召回API实现示例

## 概述

本文档提供了记忆召回API的具体实现代码示例，包括核心类、算法实现和客户端使用方法。

## 核心实现

### 1. 主要类定义

```python
from typing import List, Dict, Optional, Union
from dataclasses import dataclass, field
from enum import Enum
import asyncio
import time
from abc import ABC, abstractmethod

class QueryType(Enum):
    COUNTING = "counting_question"
    FACTUAL = "factual_question"
    ANALYTICAL = "analytical_question"
    DEFINITIONAL = "definitional_question"
    COMPARATIVE = "comparative_question"

class LayerType(Enum):
    PRIMARY = "primary_context"
    SECONDARY = "secondary_context"
    WEAK_SIGNALS = "weak_signals"

class RetrievalStrategy(Enum):
    KEYWORD_MATCH = "keyword_match"
    SEMANTIC_SIMILARITY = "semantic_similarity"
    GRAPH_TRAVERSAL = "graph_traversal"
    HYBRID_WEIGHTED = "hybrid_weighted"

@dataclass
class RetrievalConfig:
    """召回配置"""
    max_primary_nodes: int = 2
    max_secondary_nodes: int = 5
    max_weak_signals: int = 10
    expansion_depth: Dict[str, int] = field(default_factory=lambda: {
        "primary": 3, "secondary": 1, "weak": 0
    })
    quality_threshold: float = 0.3
    enable_cross_validation: bool = True
    strategy: RetrievalStrategy = RetrievalStrategy.HYBRID_WEIGHTED

@dataclass
class QueryMetadata:
    """查询元数据"""
    query: str
    detected_query_type: str
    total_nodes_found: int
    strategy_used: str
    processing_time_ms: float

@dataclass
class ExpandedNode:
    """扩展节点"""
    node_id: str
    relationship: str
    content: str
    relevance_score: float
    confidence: float = 0.8

@dataclass
class MemoryNode:
    """记忆节点"""
    node_id: str
    relevance_score: float
    content: str
    source: str
    metadata: Dict[str, Union[str, float]]
    expansion_depth: int
    expanded_nodes: List[ExpandedNode] = field(default_factory=list)

@dataclass
class MemoryLayer:
    """记忆层"""
    description: str
    total_weight: float
    nodes: List[MemoryNode] = field(default_factory=list)

@dataclass
class QualityMetrics:
    """质量指标"""
    information_sufficiency: int
    cross_validation_score: float
    conflict_detection: List[str] = field(default_factory=list)
    recommended_action: str = "sufficient_for_answer"
    confidence_score: float = 0.8

@dataclass
class MemoryResponse:
    """记忆召回响应"""
    status: str
    request_id: str
    timestamp: str
    processing_time_ms: float
    query_metadata: QueryMetadata
    memory_layers: Dict[str, MemoryLayer]
    quality_metrics: QualityMetrics
    api_metadata: Dict[str, Union[str, int, float, Dict]]
```

### 2. 核心服务实现

```python
class IntelligentRetrievalService:
    """智能召回服务"""

    def __init__(self,
                 data_source_manager: 'DataSourceManager',
                 query_parser: 'QueryParser',
                 strategy_selector: 'StrategySelector',
                 quality_assessor: 'QualityAssessor'):
        self.data_source_manager = data_source_manager
        self.query_parser = query_parser
        self.strategy_selector = strategy_selector
        self.quality_assessor = quality_assessor
        self.cache = {}  # 简单缓存实现

    async def retrieve(self, query: str, config: RetrievalConfig) -> MemoryResponse:
        """主召回方法"""
        start_time = time.time()
        request_id = f"req_{int(time.time() * 1000)}"

        try:
            # 步骤1: 查询解析
            parsed_query = await self.query_parser.parse(query)

            # 步骤2: 策略选择
            strategy = self.strategy_selector.select(parsed_query, config)

            # 步骤3: 多路召回
            raw_results = await self._multi_retrieve(parsed_query, strategy)

            # 步骤4: 智能排序
            ranked_results = self._intelligent_ranking(raw_results, parsed_query)

            # 步骤5: 差异化扩展
            expanded_results = await self._differential_expansion(
                ranked_results, config
            )

            # 步骤6: 质量评估
            quality_metrics = self.quality_assessor.assess(
                expanded_results, query
            )

            # 步骤7: 构建响应
            response = self._build_response(
                request_id, query, parsed_query, expanded_results,
                quality_metrics, start_time, strategy
            )

            # 步骤8: 缓存结果
            self._cache_result(query, response)

            return response

        except Exception as e:
            return self._build_error_response(request_id, query, str(e), start_time)

    async def _multi_retrieve(self, parsed_query, strategy) -> List[Dict]:
        """多路召回"""
        tasks = []

        if strategy in [RetrievalStrategy.KEYWORD_MATCH, RetrievalStrategy.HYBRID_WEIGHTED]:
            tasks.append(self.data_source_manager.keyword_search(parsed_query))

        if strategy in [RetrievalStrategy.SEMANTIC_SIMILARITY, RetrievalStrategy.HYBRID_WEIGHTED]:
            tasks.append(self.data_source_manager.semantic_search(parsed_query))

        if strategy in [RetrievalStrategy.GRAPH_TRAVERSAL, RetrievalStrategy.HYBRID_WEIGHTED]:
            tasks.append(self.data_source_manager.graph_search(parsed_query))

        # 并行执行所有召回策略
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 合并结果
        merged_results = []
        for result in results:
            if isinstance(result, Exception):
                continue
            merged_results.extend(result)

        return merged_results

    def _intelligent_ranking(self, raw_results: List[Dict], parsed_query) -> List[Dict]:
        """智能排序算法"""
        scored_results = []

        for result in raw_results:
            # 综合评分计算
            keyword_score = result.get('keyword_score', 0)
            semantic_score = result.get('semantic_score', 0)
            graph_score = result.get('graph_score', 0)
            freshness_score = result.get('freshness_score', 0)
            reliability_score = result.get('reliability_score', 0.8)

            # 加权总分
            total_score = (
                keyword_score * 0.3 +
                semantic_score * 0.3 +
                graph_score * 0.2 +
                freshness_score * 0.1 +
                reliability_score * 0.1
            )

            result['relevance_score'] = total_score
            scored_results.append(result)

        # 按分数排序
        return sorted(scored_results, key=lambda x: x['relevance_score'], reverse=True)

    async def _differential_expansion(self, ranked_results: List[Dict],
                                    config: RetrievalConfig) -> Dict[str, MemoryLayer]:
        """差异化扩展"""
        # 计算层级权重
        weights = self._calculate_layer_weights(ranked_results)

        # 分层处理
        primary_nodes = ranked_results[:config.max_primary_nodes]
        secondary_nodes = ranked_results[config.max_primary_nodes:config.max_primary_nodes + config.max_secondary_nodes]
        weak_signal_nodes = ranked_results[config.max_primary_nodes + config.max_secondary_nodes:]

        # 构建记忆层
        memory_layers = {
            LayerType.PRIMARY.value: await self._build_memory_layer(
                primary_nodes, config.expansion_depth["primary"], weights["primary"]
            ),
            LayerType.SECONDARY.value: await self._build_memory_layer(
                secondary_nodes, config.expansion_depth["secondary"], weights["secondary"]
            ),
            LayerType.WEAK_SIGNALS.value: await self._build_memory_layer(
                weak_signal_nodes, config.expansion_depth["weak"], weights["weak"]
            )
        }

        return memory_layers

    async def _build_memory_layer(self, nodes: List[Dict], expansion_depth: int,
                                weight: float) -> MemoryLayer:
        """构建记忆层"""
        memory_nodes = []

        for node in nodes:
            if node['relevance_score'] < 0.3:  # 过滤低分节点
                continue

            memory_node = MemoryNode(
                node_id=node['id'],
                relevance_score=node['relevance_score'],
                content=node['content'],
                source=node['source'],
                metadata=node.get('metadata', {}),
                expansion_depth=expansion_depth
            )

            # 执行扩展
            if expansion_depth > 0:
                expanded_nodes = await self._expand_node(node, expansion_depth)
                memory_node.expanded_nodes = expanded_nodes

            memory_nodes.append(memory_node)

        return MemoryLayer(
            description=f"权重{weight}的记忆层",
            total_weight=weight,
            nodes=memory_nodes
        )

    async def _expand_node(self, node: Dict, max_depth: int) -> List[ExpandedNode]:
        """节点扩展"""
        if max_depth <= 0:
            return []

        expanded_nodes = []

        # 根据节点类型选择扩展策略
        if node['source'] == 'video_segment':
            expanded_nodes.extend(await self._expand_video_node(node, max_depth))
        elif node['source'] == 'scene_description':
            expanded_nodes.extend(await self._expand_scene_node(node, max_depth))
        else:
            expanded_nodes.extend(await self._expand_general_node(node, max_depth))

        return expanded_nodes

    async def _expand_video_node(self, node: Dict, depth: int) -> List[ExpandedNode]:
        """视频节点扩展"""
        expanded = []

        # 时间上下文扩展
        if 'timestamp' in node:
            expanded.append(ExpandedNode(
                node_id=f"{node['id']}_temporal",
                relationship="temporal_context",
                content=f"时间戳: {node['timestamp']}",
                relevance_score=node['relevance_score'] * 0.9,
                confidence=0.95
            ))

        # 空间上下文扩展
        if 'location' in node:
            expanded.append(ExpandedNode(
                node_id=f"{node['id']}_spatial",
                relationship="spatial_context",
                content=f"位置: {node['location']}",
                relevance_score=node['relevance_score'] * 0.8,
                confidence=0.9
            ))

        return expanded

    def _calculate_layer_weights(self, ranked_results: List[Dict]) -> Dict[str, float]:
        """计算层级权重"""
        if not ranked_results:
            return {"primary": 0.7, "secondary": 0.25, "weak": 0.05}

        top_score = ranked_results[0]['relevance_score']

        if top_score > 0.8:
            return {"primary": 0.7, "secondary": 0.25, "weak": 0.05}
        elif top_score > 0.6:
            return {"primary": 0.5, "secondary": 0.4, "weak": 0.1}
        else:
            return {"primary": 0.3, "secondary": 0.5, "weak": 0.2}

    def _build_response(self, request_id: str, query: str, parsed_query: Dict,
                       memory_layers: Dict[str, MemoryLayer], quality_metrics: QualityMetrics,
                       start_time: float, strategy: RetrievalStrategy) -> MemoryResponse:
        """构建响应"""
        processing_time = (time.time() - start_time) * 1000

        return MemoryResponse(
            status="success",
            request_id=request_id,
            timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            processing_time_ms=processing_time,
            query_metadata=QueryMetadata(
                query=query,
                detected_query_type=parsed_query.get('type', 'unknown'),
                total_nodes_found=sum(len(layer.nodes) for layer in memory_layers.values()),
                strategy_used=strategy.value,
                processing_time_ms=processing_time
            ),
            memory_layers=memory_layers,
            quality_metrics=quality_metrics,
            api_metadata={
                "version": "1.0.0",
                "processing_stages": {
                    "query_parsing": "15ms",
                    "retrieval": f"{processing_time*0.6:.1f}ms",
                    "expansion": f"{processing_time*0.3:.1f}ms",
                    "quality_assessment": f"{processing_time*0.1:.1f}ms"
                },
                "cache_hit": False,
                "expansion_budget_used": {
                    "primary": "70%",
                    "secondary": "25%",
                    "weak": "5%"
                }
            }
        )
```

### 3. 查询解析器实现

```python
class QueryParser:
    """查询解析器"""

    def __init__(self):
        self.intent_patterns = {
            QueryType.COUNTING: [
                r"几次|多少次|计数|统计",
                r"数量|个数|频次"
            ],
            QueryType.FACTUAL: [
                r"是什么|什么是|解释",
                r"定义|含义|概念"
            ],
            QueryType.ANALYTICAL: [
                r"分析|比较|对比",
                r"原因|为什么|如何"
            ],
            QueryType.COMPARATIVE: [
                r"vs|对比|比较",
                r"哪个|更好|差异"
            ]
        }

    async def parse(self, query: str) -> Dict:
        """解析查询"""
        # 识别查询类型
        query_type = self._identify_query_type(query)

        # 提取实体
        entities = self._extract_entities(query)

        # 识别意图
        intent = self._identify_intent(query, query_type)

        return {
            "original_query": query,
            "type": query_type.value,
            "entities": entities,
            "intent": intent,
            "keywords": self._extract_keywords(query),
            "complexity_score": self._calculate_complexity(query)
        }

    def _identify_query_type(self, query: str) -> QueryType:
        """识别查询类型"""
        import re

        for query_type, patterns in self.intent_patterns.items():
            for pattern in patterns:
                if re.search(pattern, query):
                    return query_type

        return QueryType.FACTUAL  # 默认类型

    def _extract_entities(self, query: str) -> List[Dict]:
        """提取实体"""
        # 简单的实体提取实现
        entities = []

        # 使用关键词匹配提取人物、地点、时间等实体
        person_patterns = ["拍摄者", "用户", "人物"]
        location_patterns = ["厨房", "客厅", "卧室"]
        action_patterns = ["去", "来", "进入", "走到"]

        for pattern in person_patterns:
            if pattern in query:
                entities.append({
                    "type": "person",
                    "value": pattern,
                    "confidence": 0.9
                })

        for pattern in location_patterns:
            if pattern in query:
                entities.append({
                    "type": "location",
                    "value": pattern,
                    "confidence": 0.95
                })

        for pattern in action_patterns:
            if pattern in query:
                entities.append({
                    "type": "action",
                    "value": pattern,
                    "confidence": 0.8
                })

        return entities

    def _identify_intent(self, query: str, query_type: QueryType) -> str:
        """识别意图"""
        if query_type == QueryType.COUNTING:
            return "count_events"
        elif query_type == QueryType.FACTUAL:
            return "get_information"
        elif query_type == QueryType.ANALYTICAL:
            return "analyze_pattern"
        else:
            return "general_query"

    def _extract_keywords(self, query: str) -> List[str]:
        """提取关键词"""
        # 简单关键词提取
        import re
        # 移除停用词和标点
        query = re.sub(r'[^\w\s]', '', query)
        words = query.split()

        # 过滤停用词
        stop_words = {"的", "了", "是", "在", "有", "和", "与", "或", "但", "而"}
        keywords = [word for word in words if word not in stop_words and len(word) > 1]

        return keywords

    def _calculate_complexity(self, query: str) -> float:
        """计算查询复杂度"""
        complexity = 0.0

        # 基于查询长度
        complexity += min(len(query) / 100, 0.3)

        # 基于实体数量
        entities = self._extract_entities(query)
        complexity += min(len(entities) * 0.1, 0.3)

        # 基于查询类型
        query_type = self._identify_query_type(query)
        if query_type == QueryType.ANALYTICAL:
            complexity += 0.3
        elif query_type == QueryType.COMPARATIVE:
            complexity += 0.2
        elif query_type == QueryType.COUNTING:
            complexity += 0.1

        return min(complexity, 1.0)
```

### 4. 质量评估器实现

```python
class QualityAssessor:
    """质量评估器"""

    def assess(self, memory_layers: Dict[str, MemoryLayer], query: str) -> QualityMetrics:
        """评估召回质量"""

        # 计算信息充足度
        sufficiency = self._calculate_sufficiency(memory_layers, query)

        # 交叉验证
        cross_validation_score = self._cross_validate(memory_layers)

        # 冲突检测
        conflicts = self._detect_conflicts(memory_layers)

        # 计算置信度
        confidence = self._calculate_confidence(memory_layers, sufficiency, cross_validation_score)

        # 推荐行动
        recommended_action = self._recommend_action(sufficiency, conflicts, confidence)

        return QualityMetrics(
            information_sufficiency=sufficiency,
            cross_validation_score=cross_validation_score,
            conflict_detection=conflicts,
            recommended_action=recommended_action,
            confidence_score=confidence
        )

    def _calculate_sufficiency(self, memory_layers: Dict[str, MemoryLayer], query: str) -> int:
        """计算信息充足度"""
        total_nodes = sum(len(layer.nodes) for layer in memory_layers.values())

        # 基础分数基于节点数量
        base_score = min(total_nodes * 10, 50)

        # 高质量节点加分
        high_quality_nodes = 0
        for layer in memory_layers.values():
            for node in layer.nodes:
                if node.relevance_score > 0.7:
                    high_quality_nodes += 1

        quality_bonus = min(high_quality_nodes * 5, 30)

        # 扩展节点加分
        total_expanded = sum(len(node.expanded_nodes) for layer in memory_layers.values()
                           for node in layer.nodes)
        expansion_bonus = min(total_expanded * 2, 20)

        return base_score + quality_bonus + expansion_bonus

    def _cross_validate(self, memory_layers: Dict[str, MemoryLayer]) -> float:
        """交叉验证评分"""
        if not memory_layers[LayerType.PRIMARY.value].nodes:
            return 0.3  # 低置信度

        # 检查主要节点间的一致性
        primary_nodes = memory_layers[LayerType.PRIMARY.value].nodes
        if len(primary_nodes) < 2:
            return 0.7  # 单节点，中等置信度

        consistency_score = 0.0
        comparisons = 0

        for i, node1 in enumerate(primary_nodes):
            for node2 in primary_nodes[i+1:]:
                # 简单的一致性检查：内容相似度
                similarity = self._calculate_content_similarity(node1.content, node2.content)
                consistency_score += similarity
                comparisons += 1

        if comparisons == 0:
            return 0.7

        avg_consistency = consistency_score / comparisons

        # 结合层级间的一致性
        secondary_nodes = memory_layers.get(LayerType.SECONDARY.value, MemoryLayer()).nodes
        if secondary_nodes:
            cross_layer_consistency = self._check_cross_layer_consistency(primary_nodes, secondary_nodes)
            avg_consistency = (avg_consistency + cross_layer_consistency) / 2

        return max(0.3, min(1.0, avg_consistency))

    def _calculate_content_similarity(self, content1: str, content2: str) -> float:
        """计算内容相似度"""
        # 简单的词汇重叠度计算
        words1 = set(content1.lower().split())
        words2 = set(content2.lower().split())

        intersection = words1.intersection(words2)
        union = words1.union(words2)

        if not union:
            return 0.0

        return len(intersection) / len(union)

    def _check_cross_layer_consistency(self, primary_nodes: List[MemoryNode],
                                     secondary_nodes: List[MemoryNode]) -> float:
        """检查跨层级一致性"""
        if not primary_nodes or not secondary_nodes:
            return 0.7

        consistency_scores = []

        for primary_node in primary_nodes:
            for secondary_node in secondary_nodes:
                similarity = self._calculate_content_similarity(
                    primary_node.content, secondary_node.content
                )
                consistency_scores.append(similarity)

        return sum(consistency_scores) / len(consistency_scores)

    def _detect_conflicts(self, memory_layers: Dict[str, MemoryLayer]) -> List[str]:
        """检测冲突"""
        conflicts = []
        all_nodes = []

        # 收集所有节点
        for layer in memory_layers.values():
            all_nodes.extend(layer.nodes)

        # 检测数值冲突
        numerical_conflicts = self._detect_numerical_conflicts(all_nodes)
        conflicts.extend(numerical_conflicts)

        # 检测语义冲突
        semantic_conflicts = self._detect_semantic_conflicts(all_nodes)
        conflicts.extend(semantic_conflicts)

        return conflicts

    def _detect_numerical_conflicts(self, nodes: List[MemoryNode]) -> List[str]:
        """检测数值冲突"""
        conflicts = []

        # 提取所有数值信息
        numerical_info = {}
        for node in nodes:
            numbers = self._extract_numbers(node.content)
            for num in numbers:
                key = f"count_{num}" if isinstance(num, int) else f"value_{num}"
                if key not in numerical_info:
                    numerical_info[key] = []
                numerical_info[key].append({
                    "value": num,
                    "node_id": node.node_id,
                    "content": node.content
                })

        # 检查冲突
        for key, values in numerical_info.items():
            if len(values) > 1:
                unique_values = set(v["value"] for v in values)
                if len(unique_values) > 1:
                    conflicts.append(f"数值冲突在{key}: {[v['value'] for v in values]}")

        return conflicts

    def _extract_numbers(self, text: str) -> List[Union[int, float]]:
        """提取文本中的数字"""
        import re
        numbers = []

        # 提取整数
        integers = re.findall(r'\b\d+\b', text)
        numbers.extend([int(num) for num in integers])

        # 提取小数
        decimals = re.findall(r'\b\d+\.\d+\b', text)
        numbers.extend([float(num) for num in decimals])

        return numbers

    def _detect_semantic_conflicts(self, nodes: List[MemoryNode]) -> List[str]:
        """检测语义冲突"""
        conflicts = []

        # 简单的语义冲突检测
        conflict_patterns = [
            ("存在", "不存在"),
            ("是", "不是"),
            ("有", "没有"),
            ("在", "不在")
        ]

        for i, node1 in enumerate(nodes):
            for node2 in nodes[i+1:]:
                for pos_word, neg_word in conflict_patterns:
                    if pos_word in node1.content and neg_word in node2.content:
                        conflicts.append(
                            f"语义冲突: {node1.node_id}({pos_word}) vs {node2.node_id}({neg_word})"
                        )

        return conflicts

    def _calculate_confidence(self, memory_layers: Dict[str, MemoryLayer],
                            sufficiency: int, cross_validation: float) -> float:
        """计算总体置信度"""
        # 基于充足度
        sufficiency_confidence = min(sufficiency / 100, 1.0)

        # 基于交叉验证
        validation_confidence = cross_validation

        # 基于层级质量
        layer_weights = []
        layer_qualities = []
        for layer_name, layer in memory_layers.items():
            if layer.nodes:
                avg_relevance = sum(node.relevance_score for node in layer.nodes) / len(layer.nodes)
                layer_weights.append(layer.total_weight)
                layer_qualities.append(avg_relevance)

        layer_confidence = sum(w * q for w, q in zip(layer_weights, layer_qualities))

        # 加权平均
        overall_confidence = (
            sufficiency_confidence * 0.4 +
            validation_confidence * 0.3 +
            layer_confidence * 0.3
        )

        return max(0.1, min(1.0, overall_confidence))

    def _recommend_action(self, sufficiency: int, conflicts: List[str],
                         confidence: float) -> str:
        """推荐行动"""
        if conflicts:
            return "resolve_conflicts"
        elif sufficiency < 30:
            return "need_more_information"
        elif confidence < 0.5:
            return "verify_sources"
        else:
            return "sufficient_for_answer"
```

## FastAPI服务实现

```python
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uvicorn
import time
import uuid

app = FastAPI(
    title="记忆召回API",
    description="MOYAN智能顾问系统的记忆召回服务",
    version="1.0.0"
)

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 请求模型
class RetrievalRequest(BaseModel):
    query: str
    query_type_hint: Optional[str] = None
    retrieval_config: Optional[Dict[str, Any]] = {}
    context: Optional[Dict[str, Any]] = {}

# 响应模型
class RetrievalResponse(BaseModel):
    status: str
    request_id: str
    timestamp: str
    processing_time_ms: float
    query_metadata: Dict[str, Any]
    memory_layers: Dict[str, Any]
    quality_metrics: Dict[str, Any]
    api_metadata: Dict[str, Any]

# 全局服务实例
retrieval_service = None

@app.on_event("startup")
async def startup_event():
    global retrieval_service
    # 初始化服务
    retrieval_service = IntelligentRetrievalService(
        data_source_manager=DataSourceManager(),
        query_parser=QueryParser(),
        strategy_selector=StrategySelector(),
        quality_assessor=QualityAssessor()
    )

@app.post("/api/v1/memory/retrieve", response_model=RetrievalResponse)
async def retrieve_memory(request: RetrievalRequest):
    """记忆召回接口"""
    try:
        # 构建配置
        config = RetrievalConfig(**request.retrieval_config)

        # 执行召回
        result = await retrieval_service.retrieve(request.query, config)

        return RetrievalResponse(
            status=result.status,
            request_id=result.request_id,
            timestamp=result.timestamp,
            processing_time_ms=result.processing_time_ms,
            query_metadata=result.query_metadata.__dict__,
            memory_layers={k: v.__dict__ for k, v in result.memory_layers.items()},
            quality_metrics=result.quality_metrics.__dict__,
            api_metadata=result.api_metadata
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/memory/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "timestamp": time.time()}

@app.post("/api/v1/memory/feedback")
async def collect_feedback(feedback: Dict[str, Any]):
    """收集反馈"""
    # 实现反馈收集逻辑
    return {"status": "feedback_received"}

@app.get("/api/v1/memory/metrics")
async def get_metrics():
    """获取性能指标"""
    # 返回性能指标
    return {
        "total_requests": 1000,
        "avg_response_time": 150.5,
        "success_rate": 0.98,
        "cache_hit_rate": 0.65
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
```

## 客户端使用示例

### Python客户端

```python
import requests
import json
from typing import Optional, Dict, Any

class MemoryAPIClient:
    """记忆API客户端"""

    def __init__(self, base_url: str = "http://localhost:8080"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()

    def retrieve(self,
                query: str,
                query_type_hint: Optional[str] = None,
                retrieval_config: Optional[Dict[str, Any]] = None,
                context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """执行记忆召回"""

        url = f"{self.base_url}/api/v1/memory/retrieve"

        payload = {
            "query": query,
            "query_type_hint": query_type_hint,
            "retrieval_config": retrieval_config or {},
            "context": context or {}
        }

        try:
            response = self.session.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )

            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            print(f"API请求失败: {e}")
            return {"error": str(e)}

    def health_check(self) -> bool:
        """健康检查"""
        try:
            response = self.session.get(f"{self.base_url}/api/v1/memory/health")
            return response.json().get("status") == "healthy"
        except:
            return False

    def submit_feedback(self, feedback: Dict[str, Any]) -> bool:
        """提交反馈"""
        try:
            response = self.session.post(
                f"{self.base_url}/api/v1/memory/feedback",
                json=feedback
            )
            return response.status_code == 200
        except:
            return False

# 使用示例
def example_usage():
    """使用示例"""
    client = MemoryAPIClient()

    # 检查服务健康状态
    if not client.health_check():
        print("服务不可用")
        return

    # 基础查询
    result = client.retrieve(
        query="拍摄者去了几次厨房？",
        query_type_hint="counting_question"
    )

    if "error" not in result:
        print(f"查询成功，耗时: {result['processing_time_ms']:.2f}ms")
        print(f"信息充足度: {result['quality_metrics']['information_sufficiency']}")

        # 提取主要信息
        primary_nodes = result['memory_layers']['primary_context']['nodes']
        for node in primary_nodes:
            print(f"核心信息: {node['content']}")

        # 提交反馈
        feedback = {
            "request_id": result['request_id'],
            "user_satisfaction": 5,
            "comment": "回答准确且详细"
        }
        client.submit_feedback(feedback)
    else:
        print(f"查询失败: {result['error']}")

if __name__ == "__main__":
    example_usage()
```

### JavaScript客户端

```javascript
class MemoryAPIClient {
    constructor(baseUrl = 'http://localhost:8080') {
        this.baseUrl = baseUrl;
    }

    async retrieve(query, options = {}) {
        const {
            queryTypeHint,
            retrievalConfig = {},
            context = {}
        } = options;

        const payload = {
            query,
            query_type_hint: queryTypeHint,
            retrieval_config: retrievalConfig,
            context
        };

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/memory/retrieve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API请求失败:', error);
            return { error: error.message };
        }
    }

    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/memory/health`);
            const data = await response.json();
            return data.status === 'healthy';
        } catch {
            return false;
        }
    }

    async submitFeedback(feedback) {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/memory/feedback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(feedback)
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

// 使用示例
async function exampleUsage() {
    const client = new MemoryAPIClient();

    // 健康检查
    const isHealthy = await client.healthCheck();
    if (!isHealthy) {
        console.log('服务不可用');
        return;
    }

    // 执行查询
    const result = await client.retrieve(
        '拍摄者去了几次厨房？',
        {
            queryTypeHint: 'counting_question',
            retrievalConfig: {
                max_primary_nodes: 3,
                quality_threshold: 0.3
            }
        }
    );

    if (!result.error) {
        console.log(`查询成功，耗时: ${result.processing_time_ms}ms`);
        console.log(`信息充足度: ${result.quality_metrics.information_sufficiency}`);

        // 提取主要信息
        const primaryNodes = result.memory_layers.primary_context.nodes;
        primaryNodes.forEach(node => {
            console.log(`核心信息: ${node.content}`);
        });

        // 提交反馈
        const feedback = {
            request_id: result.request_id,
            user_satisfaction: 5,
            comment: '回答准确且详细'
        };
        await client.submitFeedback(feedback);
    } else {
        console.log(`查询失败: ${result.error}`);
    }
}

// 运行示例
exampleUsage();
```

---

*本文档版本: v1.0*
*最后更新: 2025-01-28*
*维护者: MOYAN架构团队*