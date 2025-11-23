# 时空知识记忆系统 - 任务分层拆解文档 (Epic-based)

**版本**: v1.2
**更新日期**: 2025-11-23
**管理原则**: 
- 本文档严格遵循 **7 阶段演进规划 (7 Stages)**。
- 每个 Epic 对应一个 Stage，内部包含 Feature 和 Task。
- **核心变更**: 融入了关于多租户分级、VLM Visual Prompting、Fact 向量库、时间清洗的技术决策。

---

## Epic 1: 物理时间轴与时空标注落地 (Stage 1)
**目标**: 建立统一的物理时间与媒体时间映射，确保所有记忆条目可被时间定位，并防御设备时间漂移。

### Feature 1.1: 媒体级时间模型 (Media Time)
- **Story 1.1.1**: 视频 Ingest 流程支持物理时间元数据
  - [ ] **Task**: 修改 Ingest 接口，接收 `recorded_at` (UTC) 和 `duration_seconds`。
  - [ ] **Task**: 在存储层 (Qdrant/Neo4j) 为 MediaSegment 添加 `recorded_at`, `duration`, `has_physical_time` 字段。
  - [ ] **Task**: **[New]** 实现“时间戳清洗器 (Timestamp Sanitizer)”，检测并修正时钟漂移 (>1h 异常回退到 Server Time)。

### Feature 1.2: 事件级时间模型 (Event Time)
- **Story 1.2.1**: MemoryEntry 支持相对与绝对时间计算
  - [ ] **Task**: 在 `MemoryEntry` Schema 中添加 `t_media_start/end`, `t_abs_start/end`, `time_origin`。
  - [ ] **Task**: 实现工具函数：当 `has_physical_time=true` 时，自动计算 `t_abs = recorded_at + t_media`。
  - [ ] **Task**: **[New]** 编写 Migration Script：对旧数据填充默认值 (has_physical_time=false)。

### Feature 1.3: 搜索与 API 对齐
- **Story 1.3.1**: 搜索接口支持绝对时间范围过滤
  - [ ] **Task**: 更新 `SearchFilters` 定义，增加 `time_range` (绝对时间) 字段。
  - [ ] **Task**: 修改 `MemoryService.search()`，将 `time_range` 转换为底层数据库查询条件 (Qdrant range filter / Neo4j where)。
  - [ ] **Task**: 更新 `/timeline_summary` 接口，输出结果中包含标准化的时间信息。

---

## Epic 2: 多租户隔离与安全托管 (Stage 2)
**目标**: 实现基于 `tenant_id` 的严格数据隔离与 API 认证，采用分级隔离策略。

### Feature 2.1: 身份模型与认证
- **Story 2.1.1**: API Key 管理与认证中间件
  - [ ] **Task**: 设计 API Key 表结构 (hash, tenant_id, scopes)。
  - [ ] **Task**: 实现 FastAPI 依赖注入 `get_current_tenant`，解析 Header 中的 Bearer Token。
  - [ ] **Task**: 实现“生成/吊销 API Key”的管理接口 (Admin API)。

### Feature 2.2: 数据层隔离 (分级策略)
- **Story 2.2.1**: Qdrant 向量存储隔离
  - [ ] **Task**: 封装 Qdrant Client，所有写操作强制注入 `tenant_id` 到 payload。
  - [ ] **Task**: **[New]** 利用 Payload Partitioning 优化索引配置。
  - [ ] **Task**: 所有读操作 (Search/Scroll) 强制注入 `Filter(must=[FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id))])`。
- **Story 2.2.2**: Neo4j 图存储隔离
  - [ ] **Task**: 封装 Neo4j 查询执行器，所有 Cypher 查询强制追加 `WHERE n.tenant_id = $tenant_id`。
  - [ ] **Task**: **[New]** 为所有节点类型添加 `tenant_id` 属性并建立 `(tenant_id, label)` 复合索引。

---

## Epic 3: 智能图构建与结构化回想 (Stage 3)
**目标**: 构建事件-角色异构图，引入 VLM Visual Prompting 实现高精度语义抽取。

### Feature 3.0: 核心管线重构 (前置任务)
- **Story 3.0.1**: 模块化 Pipeline
  - [ ] **Task**: **[Critical]** 拆解 `pipeline_steps.py` (2000+行)，建立 `Step` 接口标准。
  - [ ] **Task**: 将 Vision (Face/Object/Scene) 拆分为独立 Plugin 模块。

### Feature 3.1: 异构图 Schema 实现
- **Story 3.1.1**: 核心节点与边定义
  - [ ] **Task**: 实现 `MediaSegment`, `Evidence`, `Entity`, `Event`, `Place` 的 Pydantic 模型。
  - [ ] **Task**: 实现 `NEXT_SEGMENT`, `CONTAINS_EVIDENCE`, `BELONGS_TO_ENTITY` 等基础边的写入逻辑。

### Feature 3.2: 智能图构建管线 (VLM Visual Prompting)
- **Story 3.2.1**: 基于 VLM 的事件抽取
  - [ ] **Task**: **[New]** 实现“结构化事实表”生成器 (从 YOLO/InsightFace 结果转 JSON)。
  - [ ] **Task**: **[New]** 实现 Visual Prompting 工具：在关键帧原图上绘制 BBox 并标注 ID (H1, O1)。
  - [ ] **Task**: 接入 VLM (GPT-4o/Gemini)，注入 System Prompt 约束其仅做语义组织。
  - [ ] **Task**: 解析 VLM 返回的 JSON，映射为图谱中的 `Event` 节点。

### Feature 3.3: 回想 API 增强
- **Story 3.3.1**: 实现结构化时间线查询
  - [ ] **Task**: 重构 `/timeline_summary`，使其基于 `Event` 节点链表返回结果。
  - [ ] **Task**: 实现 `/entity_event_anchor`，查询特定角色的事件轨迹。

---

## Epic 4: CI/CD、容器化与可运维化 (Stage 4)
**目标**: 工程化落地，支持一键部署与自动化测试。

### Feature 4.1: 容器化
- **Story 4.1.1**: Docker 镜像构建
  - [ ] **Task**: 编写 `Dockerfile` for `memory-service`。
  - [ ] **Task**: 编写 `docker-compose.yml`，编排 Service, Qdrant, Neo4j, Prometheus。

### Feature 4.2: CI/CD 流水线
- **Story 4.2.1**: 自动化测试与 Lint
  - [ ] **Task**: 配置 GitHub Actions / GitLab CI。
  - [ ] **Task**: 集成 `pytest`, `mypy`, `ruff` 到流水线。

### Feature 4.3: 可观测性
- **Story 4.3.1**: 业务指标监控
  - [ ] **Task**: 集成 Prometheus Client，暴露 `/metrics` 端点。
  - [ ] **Task**: **[New]** 添加关键指标埋点：`qps_per_tenant`, `search_latency`, `token_usage`。

---

## Epic 5: 通用文本记忆与知识抽取 (Stage 5)
**目标**: 接入文本模态，实现跨模态记忆 (Fact 向量库)。

### Feature 5.1: 文本记忆管线 (Fact Vector Store)
- **Story 5.1.1**: 会话摘要与事实抽取
  - [ ] **Task**: 实现 `/dialog/commit` 接口，接收对话历史。
  - [ ] **Task**: 集成 LLM Chain，生成 `dialog_summary` 和结构化 `facts` JSON。
  - [ ] **Task**: **[New]** 定义 `FactEntry` Schema (JSON + Vector)，而非图节点。

### Feature 5.2: 向量检索与对齐
- **Story 5.2.1**: 文本向量化与混合检索
  - [ ] **Task**: 对 `dialog_summary` 和 `facts` 进行 Embedding 并存入 Qdrant。
  - [ ] **Task**: 更新 `/search` 逻辑，支持文本与视觉内容的混合召回。

---

## Epic 6: SaaS 化与生态闭环 (Stage 6)
**目标**: 对外提供标准化的云服务。

### Feature 6.1: 控制平面
- **Story 6.1.1**: 租户配额与计费
  - [ ] **Task**: 实现 API 速率限制 (Rate Limiting)。
  - [ ] **Task**: 实现用量统计 (Usage Tracking) 接口。

### Feature 6.2: 开发者工具
- **Story 6.2.1**: 官方 SDK 发布
  - [ ] **Task**: 封装 Python SDK，提供 `MemoryClient` 类。
  - [ ] **Task**: 编写 Quickstart 文档与示例代码。

---

## Epic 7: 时间知识图谱与前向预测推理 (Stage 7)
**目标**: 具备预测未来的能力 (Optional)。

### Feature 7.1: TKG 视图构建
- **Story 7.1.1**: 导出标准 TKG 数据
  - [ ] **Task**: 实现 `/admin/export_tkg_view`，导出 `(s, r, o, t)` 四元组序列。

### Feature 7.2: 推理服务集成
- **Story 7.2.1**: 预测模型挂载
  - [ ] **Task**: 部署独立的 `tkg_predict_service`。
