# SaaS 缺口清单与施工计划（v1）

> **版本**：v1.0  
> **状态**：Draft（作为当前阶段唯一执行清单）  
> **最后更新**：2025-12-25  
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

**结论**：  
可以实现“写入 → 计量 → 计费”的最小闭环，但仍不足以支撑真实成本控制。

---

## 2. 缺口清单（仅保留必须项）

### 2.1 必须补齐（影响商业化闭环）
1) **LLM token 计量缺失**
   - 当前未记录 `llm` usage 事件，无法做成本与风控。
2) **request 计量缺失**
   - 网关只限流但未落库 `request` 事件，无法审计请求量/延迟。
3) **Usage Sink API 未实现**
   - 控制面需落地 `POST /internal/usage/events` 接收 WAL 批量上报。

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
3) **LLM Adapter 计量埋点**
   - 在 LLM 调用出口记录 `prompt_tokens/completion_tokens/provider/model`。
4) **网关 request 事件落库**
   - 在网关记录 `path/status/latency/bytes` 等请求用量。

**验收标准**：  
控制面可按 tenant 汇总 `request + llm + write` 三类用量。

### Phase 2（可选增强）
5) **usage_daily 聚合表**
   - 支撑账单与可视化。
6) **成本估算（可选）**
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
- 验收脚本：按 tenant 汇总三类用量并可导出
