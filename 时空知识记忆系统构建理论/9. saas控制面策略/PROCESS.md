# PROCESS（9. saas控制面策略）

## 2025-12-24：SaaS 控制面顶层架构与计费/用量策略（v0）

### 完成内容

- 新增顶层设计文档：`SaaS控制面_顶层架构与计费用量策略_v0.md`
  - 明确控制面（Tenant/Key/Plan/Usage/Billing）与数据面（Memory Server + Qdrant + Neo4j）的职责边界；
  - 写死推荐形态：网关负责鉴权/限流/粗配额，数据面负责 LLM/存储等成本型配额；
  - 统一套餐为 `Entitlement`（权益）配置集合，并给出 Free/Personal/Enterprise 的分期落地路线；
  - 给出三类用量计量事件（Request/LLM/IngestWrite）的建议字段与结算思路；
  - 明确 public surface（推荐仅开放 ingest/retrieval/job/session/health）与版本治理口径。

### 测试/验证

- 本次为顶层架构与策略设计文档，不涉及代码变更与自动化测试。
- 验证方式：
  - 对照现有实现：`modules/memory/api/server.py` 已具备多租户解析（header/JWT）、异步 ingest job、检索端口与部分限流/熔断骨架；
  - 对照现有 SDK：`omem` 仅依赖 `/ingest/dialog/v1`、`/ingest/jobs/*`、`/retrieval/dialog/v2`，与文档建议的“最小 public surface”一致。

### 风险与待确认

- 现状 `sqlite + in-proc asyncio task` 的 ingest 执行模式不适合多实例水平扩展，后续需演进为队列 + worker + 可靠 job store；
- 计量落库（Usage DB）与网关（API Gateway）的技术选型需要产品/运维共同定稿；
- 高成本端点（retrieval/search/graph_search）的配额与降级策略需在产品层明确（429/402/503 的语义与用户体验）。

## 2025-12-24：SaaS 控制面施工蓝图（v1：可施工规格）

### 完成内容

- 新增施工蓝图：`SaaS控制面_顶层架构与计费用量策略_v1.md`
  - 将 v0 的“规划口径”补齐为“可落地契约”：新增核心 Schema（Tenant/APIKey/Plan/Entitlement/UsageEvent 等）；
  - 明确网关→数据面内部 JWT 结构与校验规则（推荐 `Authorization: Bearer` + JWKS），并**修正**：默认不把完整 entitlement 快照塞进 JWT，仅保留 `plan_id + entitlement_version`；
  - 补齐 Scope→端点映射表（Public Surface 白名单 + 数据面兜底策略）；
  - 补齐配额执行点位矩阵（在哪一层、何时拦、返回什么、施工锚点）；
  - 给出用量事件三分类（request/llm/write）的字段口径与幂等规则，并**修正**：成本以 tokens/units 原始计量为准，美元估算放控制面离线计算；
  - 补齐 `usage_events/usage_daily` 的 Postgres 表结构与聚合 SQL；
  - 给出 Free/Personal/Enterprise 的“默认值（fallback）”数字；
  - 补齐错误响应 envelope（429/402/403/413）的稳定字段；
  - 补齐 SLO 的测量口径与需要新增的指标名；
  - 补齐 Phase 1–3 的交付物与端到端验收场景（可直接作为测试用例雏形）。

### 测试/验证

- 本次为策略/契约文档升级，不涉及代码变更与自动化测试。
- 一致性校验：
  - Public surface 与现有 `omem` SDK 对齐：SDK 只依赖 ingest/retrieval/job/session/health；
  - JWT/JWKS 的落点与数据面现有 `auth.jwt.jwks_url` 机制可对齐（实现层无需推翻重来）。

### 风险与待确认

- 网关技术选型（Cloudflare/Kong/Nginx/自研）与内部 JWT 签发/轮换策略需落地定稿；
- `with_answer=true` 的 QA 场景在 SaaS 里是否对外开放需产品明确（它直接决定 LLM 成本控制面接口形态）；
- Job store 从 SQLite → Postgres + worker 的迁移顺序与数据迁移脚本需在工程实现阶段补齐。

## 2025-12-24：与 Makerkit 的适配（VR：可施工对接手册）

### 完成内容

- 新增对接手册：`与Makerkit的适配.md`
  - 以 Makerkit 作为控制面（Tenant/Key/Plan/Usage/Billing/Console）为前提，给出“小白手把手”对接路径；
  - 写死对接边界：外网只暴露 Makerkit（网关），Memory Server 仅内网可达；
  - 给出网关代理的硬流程（校验 key → scope → rpm/size → 生成内部 JWT → 代理到数据面 → 记录 request 用量）；
  - 给出数据面回传 `llm/write` 用量事件的最小闭环（`POST /internal/usage/events`）；
  - 用 Mermaid 图补齐：组件拓扑、ER 模型、网关处理流、写入/计量时序、订阅状态机、部署网络图；
  - 明确当前工程缺口（scopes 二次校验、usage 落库、ingest job 多实例化）作为后续施工点。
  - 补充“与本仓库对接”的手把手落地方式：独立仓库（推荐）与 monorepo（submodule/subtree）两种集成路径与目录布局建议。

### 测试/验证

- 本次为对接施工文档编写，不涉及代码变更与自动化测试。

## 2025-12-25：对齐“施工蓝图 v1”与“定价策略 v1”（配额口径 + 传输细节）

### 完成内容

- 更新 `SaaS控制面_顶层架构与计费用量策略_v1.md`（仅改动与商业化/对接强相关部分）：
  - 将套餐默认值表从 `Free/Personal/Enterprise` 对齐为 `Free/Pro/Enterprise`，并把 Free/Pro 的关键配额与 `SaaS定价策略与商业化实施规范_v1.md` 一致：
    - Free：Ingest 10 RPM、平台处理 tokens 1M/月、存储上限 100K points + 100K graph nodes；
    - Pro：Ingest 60 RPM、平台处理 tokens 20M/月、存储上限 1M points + 1M graph nodes；
  - 明确 tokens 的语义为“平台后台处理上限（Stage2/Stage3，BYOK 默认不计费）”，避免被误读为默认计费主轴；
  - 对齐网关→数据面内部 JWT 的传输方式：推荐使用 `X-API-Token: <internal_jwt>`（与现有数据面默认实现一致），并备注若改为 `Authorization: Bearer` 需要数据面剥离 `Bearer ` 前缀。
  - 对齐“记忆与账号共存亡”的产品口径：默认不做按条目 TTL，账号进入清理流程时记忆一并删除（生命周期策略以定价策略文档为准）。

### 测试/验证

- 本次为文档一致性修订，不涉及代码变更与自动化测试。

## 2025-12-25：SaaS 接线规范（SDK ↔ 网关/控制面 ↔ 数据面）施工文档

### 完成内容

- 新增唯一施工依据：`SaaS接线规范_omem_SDK_网关_控制面_数据面_v1.md`
  - 写死三段接线：SDK→网关（公网）、网关→数据面（内网）、数据面→控制面（用量回传）；
  - 明确 SaaS 对外 Public Surface（只开放 ingest/retrieval/job/session/health）；
  - 明确外网鉴权使用 `Authorization: Bearer <public_api_key>`，内网鉴权使用 `X-API-Token: <internal_jwt>`（对齐当前数据面实现）；
  - 写死内部 JWT claims（tenant_id/api_key_id/scopes/plan/version + 5 分钟 TTL）与 scope 双重校验要求（网关 + 数据面兜底）；
  - 定义 entitlement 下发机制（plan_id + version → 数据面缓存 → 控制面 internal API 拉取）；
  - 将“用量丢失”定义为不可接受的 Bug，并写死短期实现：数据面 `WAL + 异步 flush` 到控制面 `POST /internal/usage/events`（at-least-once + 控制面幂等去重）；
  - 明确 Partner 端的 end-user 数据不得按平台默认 Inactive 策略自动清理（必须由 Partner 策略配置）。

### 测试/验证

- 本次为接线规范文档编写，不涉及代码变更与自动化测试。

## 2025-12-25：Phase 0 规范补齐（接线规范细节完善）

### 完成内容

- 更新 `SaaS接线规范_omem_SDK_网关_控制面_数据面_v1.md`：
  - 补齐 SDK 必须处理的 ingest job 状态机（`RECEIVED/STAGE2_RUNNING/STAGE2_FAILED/STAGE3_RUNNING/STAGE3_FAILED/PAUSED/COMPLETED`）与终态语义；
  - 补齐网关限流（429）的标准响应头（`Retry-After` 必须返回；可选 `X-RateLimit-*`）；
  - 补齐 SDK 重试默认值与重试范围（只重试 `429/503/504`，其余不重试）。
- 更新 `与Makerkit的适配.md`：
  - 将数据面 `llm/write` 用量回传从 best-effort 明确升级为 **at-least-once**（WAL + 异步 flush + 控制面幂等去重）。

### 测试/验证

- 本次为文档规范补齐，不涉及代码变更与自动化测试。

## 2025-12-25：SaaS 缺口清单与施工计划（v1）

### 完成内容

- 新增执行清单：`SaaS缺口清单与施工计划_v1.md`
  - 梳理当前已对齐能力与必须补齐缺口（LLM tokens / request 计量 / usage sink）；
  - 写死最小商业化闭环的 Phase 1/Phase 2 施工顺序与验收标准；
  - 明确本阶段不扩展设备/组织隔离；
  - 增补 Provider/BYOK 边界与默认策略（BYOK 记录不计费）。

### 测试/验证

- 本次为策略/执行清单文档，不涉及代码变更与自动化测试。
