# MOYAN 产品需求池（按当前分类）

> 说明：在每条 Story 后标注 KANO（B 基本 / P 期望 / E 魅力）+ 状态（✅ 已有 / ⚠️ 部分 / ⏳ 未有）+ 目标版本（MVP / V1.0 / V1.1 / V2.0+）。  
> 用作 Product 管理页的长期功能资产库，可在版本/迭代视图按 TargetVersion 切片。

---

## 记忆存储中心
- Feature: Qdrant & Neo4j 混合存储
  - Story: 向量库(Text/多模态) 建库与 Payload 过滤 — KANO:B, 状态:✅, 版本:MVP
  - Story: 图谱存储落地 v0.1 Schema（Entity/Event/Segment/Evidence/Place+基础边） — KANO:B, 状态:✅, 版本:V1.0
- Feature: 记忆读写改删 API 设计
  - Story: /memory/write（记忆写入，多模态标记） — KANO:B, 状态:✅, 版本:MVP
  - Story: /memory/search（自然语言+结构化过滤，时间/user/domain） — KANO:B, 状态:✅, 版本:MVP
  - Story: 统一返回格式（记忆对象+置信度+来源+metadata） — KANO:B, 状态:⚠️, 版本:V1.0
- Feature: 结构化回想 API（用户故事）
  - Story: /timeline_summary（按时间段事件流水账） — KANO:P, 状态:⏳, 版本:V1.1
  - Story: /entity_trajectory（人物出现时间点/片段+证据） — KANO:B, 状态:⏳, 版本:V1.1

---

## 企业级控制
- Feature: 租户 & 账号体系
  - Story: 多租户逻辑隔离（tenant_id 强制过滤） — KANO:B, 状态:✅, 版本:MVP
  - Story: Workspace/租户管理（创建/禁用/用量查看） — KANO:P, 状态:⏳, 版本:V1.1
- Feature: 鉴权 & 安全
  - Story: API Key 发放/吊销/映射 tenant_id — KANO:B, 状态:✅, 版本:MVP
  - Story: Key 权限粒度（按集成/环境） — KANO:P, 状态:⏳, 版本:V1.0
  - Story: 调用审计日志（读写调用方/参数摘要/结果） — KANO:P, 状态:⏳, 版本:V1.1
- Feature: 监控、运维与配额
  - Story: /health + /metrics_prom 覆盖 Qdrant/Neo4j/MemoryService — KANO:B, 状态:✅, 版本:MVP
  - Story: 租户用量统计（存储/向量/调用） — KANO:P, 状态:⏳, 版本:V1.1
  - Story: 配额与限流（软/硬限、告警） — KANO:P, 状态:⏳, 版本:V1.1

---

## 开发生态
- Feature: Python SDK 封装
  - Story: 封装核心 API（write/search/dialog/graph），示例 → SDK — KANO:B, 状态:⚠️, 版本:V1.0
- Feature: MCP Tool 封装
  - Story: Memory Tool 接入主流 Agent/MCP 框架 — KANO:P, 状态:⏳, 版本:V1.1

---

## 产品需求（按体验域）

### 对话事实抽取与文本记忆
- Story: 对话 Session 读取（/dialog/commit，会话摘要+facts） — KANO:B, 状态:✅, 版本:V1.0
- Story: 对话文本事实智能抽取（偏好/日程/个人信息 buckets） — KANO:P, 状态:⚠️, 版本:V1.1
- Story: 文本检索接口（/dialog/search，按会话/事实） — KANO:P, 状态:⏳, 版本:V1.1

### 多模态结构化感知 & 视觉记忆
- Story: 视频读取与预处理（固定窗口切片+去重，t_media_*） — KANO:B, 状态:✅, 版本:V1.0
- Story: 流式视频接入与预处理（RTMP/WebRTC ingest） — KANO:P, 状态:⏳, 版本:V1.1
- Story: 多模态数据结构化  
  - 人脸检测+轨迹 — KANO:B, 状态:✅, 版本:V1.0  
  - 人脸聚类→全局人物 ID — KANO:B, 状态:⚠️, 版本:V1.1  
  - 物体/场景检测 — KANO:P, 状态:⚠️, 版本:V1.1  
  - 音频 ASR + 说话人对齐 — KANO:B, 状态:⚠️, 版本:V1.0  
  - 文本 Evidence 入图 — KANO:P, 状态:⏳, 版本:V1.1

### 时空知识图谱建模
- Story: 时空图谱内核设计（STKG v0.1） — KANO:B, 状态:✅, 版本:V1.0
- Story: 文本事实记忆空间设计（facts schema） — KANO:P, 状态:⚠️, 版本:V1.1
- Story: 语义增强 & 智能图构建（LLM/VLM 结构化输出，分层落地） — KANO:P, 状态:⚠️, 版本:V1.1
- Story: 时间知识图谱前向推理（TKG 导出/预测写回） — KANO:E, 状态:⏳, 版本:V2.0+
- Story: “睡眠”（异步记忆增强与遗忘：事件合并、边衰减、热/冷层） — KANO:P, 状态:⏳, 版本:V2.1

