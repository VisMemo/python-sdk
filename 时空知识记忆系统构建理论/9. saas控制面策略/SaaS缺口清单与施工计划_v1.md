# SaaS 缺口清单与施工计划（v1）

> **版本**：v1.0  
> **状态**：Draft（作为当前阶段唯一执行清单）  
> **最后更新**：2025-12-27  
> **适用范围**：基于第三方 SaaS 控制面/网关（如 Makerkit）的接入场景

本文件用于回答两件事：
1) 现在已经对齐了什么、还缺什么；  
2) 以“最小商业化闭环”为目标的施工顺序是什么。  

**注意**：当前阶段不扩展“设备隔离/企业子组织隔离”等高级隔离能力。

---

## 1. 当前已对齐的能力（可上线的最小闭环）

### 1.1 SDK ↔ SaaS 网关
- SDK 已支持 `Authorization: Bearer` 与 `X-Request-ID`，兼容 `X-API-Token`。
- SDK 具备 `429/503/504` 重试策略（指数退避 + Retry-After）。

### 1.2 网关 ↔ Memory Server
- 数据面支持 JWT/Token 鉴权与 scope 校验（含 legacy 兼容）。
- `X-Request-ID` 透传已落地，链路可追踪。

### 1.3 写入计量（最小闭环）
- Stage3 成功后写入 `write` 用量事件（Usage WAL）。
- WAL 使用本地 SQLite + 异步 flush，满足 at-least-once 语义。

### 1.4 LLM 计量（已落地）
- Stage2/Stage3 以及 `with_answer=true` 的 `retrieval_qa` 写入 `llm` 事件。
- tokens 缺失时保留 `tokens_missing=true`，不丢账。

### 1.5 Usage Sink API（已落地）
- 控制面 `POST /internal/usage/events` 支持批量写入与幂等去重。

### 1.6 SDK BYOK 用量上报（已落地）
- SDK 提供 `LLMUsageReporter`，可在 BYOK 场景上报 `llm` 用量事件。

### 1.7 usage_daily 聚合（已落地）
- 控制面落库 `usage_daily` 并提供内部聚合接口（可选后台聚合任务 `MEMA_USAGE_AGGREGATE_ENABLED`）。

**结论**：  
可以实现“写入 → 计量 → 计费”的最小闭环，但仍不足以支撑真实成本控制（request 计量仍缺）。

---

## 2. 缺口清单（仅保留必须项）

### 2.1 必须补齐（影响商业化闭环）
1) **request 计量缺失**
   - 网关只限流但未落库 `request` 事件，无法审计请求量/延迟。
   - **进度**：已提供网关侧采集组件（`modules/saas_gateway/usage.py`），仍需接入真实网关。
2) **网关→数据面 Internal JWT / JWKS 对接验收未固化到施工清单**
   - `SaaS接线规范_omem_SDK_网关_控制面_数据面_v1.md` 已写死：网关签发 `internal_jwt`，数据面用 JWKS 验签并提取 `tenant_id/sub(api_key_id)/scopes/plan_id/entitlement_version`；
   - 但缺口清单里尚未把“JWKS 配置 + Claims 校验 + Scope 映射验收”作为独立施工项列出，容易出现“接口对了但 claims 不全/权限不严”的灰度事故。
3) **写入端点签名注入（X-Signature）契约未进入施工清单**
   - 数据面写端点已支持 `require_signature`（避免重放/误写），但 SaaS 模式下签名应由网关注入（SDK 不做）；
   - 目前缺口清单没有明确列出“网关签名注入 + 数据面开启 signing.required 的联调验收”，风险是上线后写入全部 401。
4) **SaaS 模式 `with_answer`（服务端调用 LLM）能力边界未纳入清单**
   - `SaaS接线规范` 写死对外 `/retrieval/dialog/v2` 默认 `with_answer=false`；
   - 若不在网关/数据面做 plan/scope 级别的限制，平台托管 LLM 可能被误用，造成成本与合规风险（BYOK 策略被绕过）。

### 2.2 暂不做（本阶段明确延后）
- 设备隔离（device_id）
- 企业组织隔离（org_id/project_id）
- 多级 partner 细粒度 retention policy

---

## 3. 施工计划（最小商业化闭环）

### Phase 1（必须做）
1) **Usage 事件 Schema 固化**
   - 明确 `request/llm/write` 三类事件字段与幂等规则。
2) **控制面 Usage Sink API**
   - 实现 `POST /internal/usage/events`，支持批量落库与幂等去重。
   - **进度**：已在 `modules/memorization_agent/api/saas_server.py` 落地（SQLite/InMemory）。
3) **usage_daily 聚合表（必须）**
   - 控制面聚合 `usage_events` → `usage_daily`，作为控制台/账单的主数据源。
   - **进度**：已在控制面 SQLite 落地，并提供 `POST /internal/usage/aggregate/daily`。
4) **SDK/Agent 统一 LLMAdapter（BYOK）并补齐计量埋点**
   - 统一入口：复用 `modules/memory/application/llm_adapter.py::LLMAdapter`（LiteLLM）作为 SDK/Agent 侧的“标准 provider 接口”；
   - 在 LLM 调用出口记录并上报 `prompt_tokens/completion_tokens/provider/model`（形成 `llm` usage 事件）；
   - 明确 BYOK 的“绝不进后端”边界：Memory Server 只做检索/写入，不接受用户模型 key。
   - **进度**：数据面已完成 `llm` 事件写入（Stage2/Stage3/retrieval_qa），SDK/Agent 侧已提供 `LLMUsageReporter` 与使用说明。
5) **网关 request 事件落库**
   - 在网关记录 `path/status/latency/bytes` 等请求用量。
6) **Internal JWT / JWKS 联调验收（网关↔数据面）**
   - 网关：签发内部 JWT（RS256）并提供 JWKS；
   - 数据面：配置 `jwt.jwks_url`，校验 issuer/audience/tenant_claim，并严格执行 scopes。
   - **进度**：网关侧已提供 `Authorization → X-API-Token` 映射 helper（`modules/saas_gateway/auth.py`），JWKS 联调仍待完成。
7) **写入签名注入联调验收（网关签，数据面验）**
   - 网关：对写入端点注入 `X-Signature`/`X-Signature-Ts`；
   - 数据面：开启 `signing.required=true` 后，`/ingest/dialog/v1` 能稳定通过。
   - **进度**：网关侧已提供签名注入 helper（`modules/saas_gateway/signing.py`），联调验收仍待完成。
8) **SaaS Public Surface 能力边界验收（with_answer / 管理端点）**
   - 对外默认禁用或按 scope/plan 控制 `with_answer`；
   - 其余端点（`/search`、`/graph/*`、`/admin/*`、`/config/*`）必须不对公网开放或有严格 scope 白名单。
   - **进度**：数据面已支持 `MEMORY_API_WITH_ANSWER_ENABLED`/`with_answer_scope` 的强制开关，网关侧策略仍需联调验收。

**验收标准**：  
控制面可按 tenant 汇总 `request + llm + write` 三类用量。

### Phase 2（可选增强）
5) **成本估算（可选）**
   - 平台代付场景下进行 token 成本估算。

---

## 4. Provider/BYOK 策略（必须写清的边界）

### 4.1 是否提供可选 provider
必须提供（企业合规/成本控制要求），否则无法进入企业采购流程。

### 4.2 责任边界（写死）
| 模式 | 谁选 provider | 谁提供 API key | 谁承担成本 | 你负责什么 |
| --- | --- | --- | --- | --- |
| BYOK（默认） | 用户 | 用户 | 用户 | 记录 tokens，不计费 |
| 平台托管 | 平台 | 平台 | 平台 | 计费 + 成本控制 |
| 混合 | 用户 | 用户 + 平台 | 按策略 | 由 tenant policy 决定 |

### 4.3 本阶段建议
- **默认 BYOK**：记录 tokens 但不计费；
- 平台托管作为企业功能，放入后续版本。

### 4.4 SDK 侧 BYOK 机制（现状 + 约束 + 推荐落地）

先把边界写死（否则必出事故）：

1) **BYOK 的模型 key 不进 Memory Server**
   - 任何 `POST /write`、`POST /search`、`POST /retrieval/*`、`POST /ingest/*` 都不应携带 `llm_api_key`；
   - key 一旦进网关/后端日志/审计库，就等于泄露风险与合规风险。

2) **Memory Server 只负责“证据检索/结构化解释”，不负责“BYOK 模型调用”**
   - 如果你把 `with_answer=true` 当作 BYOK，那是错的：这会使用服务端环境/平台托管模型（而非用户自带模型）。
   - BYOK 的正确姿势是：服务端返回证据（evidence），SDK/Agent 进程内用用户自带模型生成最终答案。

3) **推荐的标准 provider 接口（Python）**
   - 本仓库已提供：`modules/memory/application/llm_adapter.py`
     - `LLMAdapter.generate(messages, response_format)`：统一调用面；
     - `build_llm_from_env()` / `build_llm_from_config()`：用环境变量或 `memory.config.yaml` 选择 provider/model；
     - 底层采用 LiteLLM，支持 OpenAI/OpenRouter/DeepSeek/Qwen/GLM/Gemini 以及自建 OpenAI-compatible endpoint（`LLM_BASE_URL + LLM_API_KEY + LLM_MODEL`）。

4) **推荐的标准 provider 接口（跨语言/前端）**
   - 以“OpenAI-compatible HTTP”作为最小公共接口：只要能发 `POST /v1/chat/completions`，就能实现 BYOK；
   - 这样可以把 provider 差异收敛到“base_url + api_key + model”三个参数，避免每个语言都造轮子。

5) **与用量计量的关系（本阶段缺口的根因）**
   - 由于 BYOK 发生在 SDK/Agent 进程内，`llm` usage 事件必须也在 SDK/Agent 侧产生并上报（否则控制面永远拿不到 token 账单）。
   - 这就是为何 Phase 1 必须把 “LLMAdapter 计量埋点 + Usage Sink API” 一起落地。
   - **现状**：SDK 已提供 `LLMUsageReporter`（与 LLMAdapter 用法配套），可直接对接 `POST /internal/usage/events`。

---

## 5. 风险与注意事项

- **用量丢失=严重 Bug**：Usage WAL 与控制面幂等去重必须优先落地。
- **成本不可控**：若 LLM token 计量缺失，将导致大额成本风险与账单争议。
- **Scope 漏洞风险**：任何新端点必须加入 scope 映射表并通过覆盖测试。

---

## 6. 交付清单（可验收）

- Usage 事件 Schema 文档（request/llm/write 三类）
- 控制面 `/internal/usage/events` 接口实现
- LLM Adapter 统一计量埋点
- 网关 request 计量落库
- Internal JWT/JWKS 联调验收记录（claims + scopes）
- 写入签名注入联调验收记录（signing.required=true）
- 验收脚本：按 tenant 汇总三类用量并可导出
