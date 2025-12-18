# Web Demo 方案（3D 时序知识图谱）

## 目标
- 端到端展示“视频上传 → 图谱构建 → 时序/语义可视化 → 基于图谱的问答检索”。
- 前端：Vite + React + TypeScript + Tailwind + NextUI + React Three Fiber/three.js，提供 3D 可拖拽图谱与时间轴。
- 后端/接口：优先复用现有 Memorization Agent SaaS API（上传、作业、图谱查询），未接通时使用内置 mock。

## 现有管线与可用 API（对接要点）
- 管线（`modules/memorization_agent/api/saas_server.py` → `pipeline_steps.py`）：
  - 上传：`POST /v1/uploads/video` 接收二进制，返回 `upload_id`。
  - 作业：`POST /v1/jobs/ingest`（upload_id 或 video_path），返回 `job_id`；`GET /v1/jobs/{job_id}` 轮询状态，成功时附 `result`（含 graph/artifacts）。
  - 图谱读接口（均需要 `X-API-Key` → tenant）：`/v1/graph/segments | events | events/{id} | places | places/{id} | timeslices | entities/{id}/timeline`，底层转发到 Memory Graph v0。
- 图谱数据特征（`VideoGraphMapper` → GraphUpsertRequest）：
  - 节点：MediaSegment（clip + start/end/timestamp）、Evidence（face/object/voice/ocr）、Entity（人物/物体/场景）、Place、Utterance、TimeSlice 等。
  - 边：CONTAINS_EVIDENCE、BELONGS_TO_ENTITY、NEXT_SEGMENT（时间顺序）、CONTAINS_UTTERANCE/CONTAINS、BELONGS_TO_PLACE 等。
  - 时间维：segment `start/end/timestamp`、timeslice、utterance timestamp；可用于 timeline 轴布局。

## Demo 体验与页面分区
- Header：项目简介 + API 连接状态（mock/真实）。
- 左侧：上传与作业进度
  - 上传按钮（拖拽/点击）、预览文件名/大小、允许选择 mock 示例。
  - 作业状态卡片（排队/处理中/成功/失败）+ 轮询进度；完成后触发数据拉取。
- 中部：3D 时序图谱
  - R3F Canvas：时间轴沿 X 轴；节点按时间与类型（颜色/形状）分布；边线支持 hover；轨道/自由拖拽。
  - 辅助迷你时间线（2D bar）用于缩放/跳转。
  - 详情浮窗：hover/点击展示节点/边元数据（段落摘要、时间、关联实体/地点）。
- 右侧：问答与检索（LLM mock）
  - 提问输入框 + 历史对话；答案使用 mock 推理（基于前端已加载的 graph 数据检索并模板化回应）。
  - 快捷查询：按实体/地点/时间片筛选的按钮或下拉。
- 底部：数据标签 & 过滤器
  - 节点/边类型过滤，时间范围滑条，搜索实体/事件。

## 前后端交互设计
- 配置：`src/config.ts` 暴露 `apiBase`, `useMock`, `tenantKey`；默认 `useMock=true` 便于纯前端展示。
- API 层（封装函数，RORO 形参）：`uploadVideo`, `createJob`, `pollJob`, `fetchGraphSlices`（segments/events/places/timeslices 合并）、`askQuestionMock`.
- 数据聚合：在前端构造统一的 `GraphNode`/`GraphEdge`/`TimeAnchor` 模型，映射自后端响应；缺失时间的节点放入“未对齐”轨道。
- 错误策略：上传/作业/查询均返回结构化错误，界面显示 toast + 重试。

## Mock 策略
- 静态 JSON（前端内置）：示例 segments/events/entities/timeslices + 预制 QA 答案。
- Upload/Job mock：立即返回 job_id，轮询两步后成功，并返回与静态 graph 相同的数据。
- QA mock：基于当前 graph 数据的简单规则（按关键字匹配节点内容 + 时间范围摘要）。

## 里程碑与落地顺序
1) 骨架：Vite+TS+Tailwind+NextUI+R3F 初始化，布局/路由（单页）。  
2) Mock 数据层：实现 upload/job/graph 查询 mock + 状态机。  
3) 3D 图谱：时间轴布局、节点/边渲染、hover/选中详情、过滤。  
4) QA 面板：mock 回答 + 选中节点上下文展示。  
5) 接入真实 API 开关：从 config 切换，添加 `X-API-Key`/`X-Tenant-ID`/`Idempotency-Key` header。  
6) 打磨：加载状态、错误态、移动端自适应、轻量动画。

## 风险与待定
- three.js 与 R3F 性能：节点数量大时需抽稀/分层，后续可加 LOD/instancing。
- 时间轴缺失：部分节点无 start/end，需要在 UI 标注“未对齐”轨道，防止误解。
- CORS/鉴权：若直接请求 SaaS API，需要代理或自定义 header；本次先以 mock 为主。

