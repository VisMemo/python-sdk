# 时空K G的工程落地范式——当前实现与差异

更新日期：2025-11-01 版本：A0

## 背景与目标

视频记忆系统的本质不是“把长文交给用户”，而是“把可检索、可回放、可解释的时空事实”落在图中：以事件为中心、以时间为第一公民、以证据为约束、以身份为锚点。本文件对比当前实现与“时空知识图谱（Temporal KG）”的工程落地范式，明确差距、路线与验收标准，作为后续施工的指向。

---

## 已对齐的关键点（现状亮点）

- 时间优先（Temporal-first）
  - 已具备：抽帧→`frame_id / sample_fps → timestamp`；分段 `segments(clip_id, start, end)`；LLM timeline → 时间化事件（`semantic_objects`）。
- 事件为一等公民（Events-first）
  - 已具备：`semantic` 事件节点作为主载体，落到 `episodic` 段（`describes`），并与 ASR/face/voice 具备关联入口。
- 分批而非一锅端（Batching）
  - 已具备：multi 模式（deciles）+ 每批多图的时间线输出（`semantic_timeline`），并解析为带时间的事件节点。
- 可观测（Observability）
  - 已具备：`adapter_kind`（google_genai / openrouter_http / glm_http / litellm）、`raw_batches`、`images_map` 等调试字段。

---

## 与“最优解”的差异（需要补齐的工程强度）

1) 事件拼接与去重（Stitching & De-noise）
- 差异：跨批/跨段的相邻事件缺乏拼接；短噪声事件缺少清理规则。
- 影响：事件碎片化、重复、边界断裂，时间线不连续。
- 方向：引入拼接模块（文本相似 > 阈值 ∧ 时间间隙 < 阈值 → 合并），并对 < `min_duration_s` 的短事件合并/剔除。

2) 证据绑定强度（Evidence-linked）
- 差异：事件与图片/ASR/face/voice 的绑定以临时映射为主，未形成持久 `evidence_refs`。
- 影响：调试/复现/回溯困难，评测与阈值调参无锚点。
- 方向：在事件节点 `metadata` 中写入 `evidence_refs: {images:[{frame_id,file_ref,thumb_url}], asr_ids:[], face_ids:[], voice_ids:[]}`。

3) 身份与等价全局化（Identity & Equivalence）
- 差异：已有 voice↔face 共现与 equivalence 候选，但缺“canonical character”解析与确认流（API/CLI/UX）。
- 影响：跨段/跨视频的身份不稳定，难以形成长期记忆。
- 方向：引入 identity resolver（规则+分数+冷启动策略），pending 队列与批量确认/回滚接口。

4) 图谱 Schema 归一与 typed edges（Explainable）
- 差异：scene/actors/objects/actions 多为文本标签，缺少标准化节点与 typed edges（`has_scene/has_actor/has_object/has_action`）。
- 影响：检索解释性弱，难以做结构化分析/可视化。
- 方向：为常见实体建标准节点类型与关系，保留原句 text 作为注释。

5) 可复现（Reproducible）
- 差异：缺少面向复现实验的 provenance 字段（prompt_hash, model, adapter, batch_index, retry, params_version）。
- 影响：结果漂移难定位，评测基线不可持续。
- 方向：在事件与写入批次的 `metadata` 中记录 provenance；PROCESS.md 约定复现流程。

6) 性能/配额与容错（Resilience）
- 差异：缺上传复用缓存、批间时间重叠（overlap）、自动降级（429/超时→减图/分裂）。
- 影响：遇到限流/异常时鲁棒性不足；信息密度与成功率平衡不好。
- 方向：files.upload 结果缓存、批间 10–20% 时间重叠、指数退避与降级策略、统计指标输出。

7) 搜索融合与评测（Retrieval & Eval）
- 差异：text/clip_image/face/audio 多空间融合策略与评测集不完善。
- 影响：复杂场景下 Top-K 召回与多模态体验不稳定。
- 方向：提供小型评测集与 `modality_weights` 调参工具，按任务进行 A/B。

---

## 设计范式（最优解要点）

- 节点：
  - `episodic`：`{clip_id, start, end}`；按时间形成有向链 `temporal_next`。
  - `semantic`（事件）：`{text, start/end|timestamp, clip_id, scene, actors, objects, actions, source, confidence, evidence_refs, provenance}`。
  - `face/voice/character`：身份锚点与等价。
- 边：
  - `semantic → episodic`: `describes`
  - `episodic[i] → episodic[i+1]`: `temporal_next`
  - `semantic → face/voice`: `appears_with / said_by`
  - `face/voice → character`: `equivalence (pending/confirmed)`
- 流程：采样与去重 → 多图 timeline 输出（严格 JSON）→ 时间锚点恢复 → 跨批拼接/去噪 → 图谱映射 → 向量+图混合检索 → 证据回放。

---

## 施工路线（分阶段）

### Phase A（结构化闭环）
- 拼接与去噪：`text_sim`（向量或 BM25）+ `gap_s`；`min_duration_s` 清理短噪声。
- 证据绑定：落 `evidence_refs`（images/asr/face/voice）。
- Schema 归一：为 scene/object/action 引入 typed 节点与边。
- provenance：`prompt_hash/model/adapter/batch_index/retry/params_version` 落至 metadata。

### Phase B（身份与确认流）
- identity resolver：face/voice→character 候选评分与缓存。
- pending 等价 API/CLI：列出→确认→回滚；审计日志。

### Phase C（性能与配额）
- 上传复用缓存、批间 10–20% 重叠、指数退避与降级（12→8 图，窗分裂）。
- 指标：`batch_semantic_stats`（图数、事件数、重试/降级、覆盖率）。

### Phase D（评测与可视化）
- 时间轴可视化（已提供脚本，完善为 CLI）。
- 小型评测集与 `modality_weights` 调参工具；Top-K/Recall/Latency 面板。

---

## 配置建议（草案）

```yaml
pipeline:
  llm_semantic:
    prompt_profile: rich_context
    batch:
      mode: multi            # single|multi
      batches: 10
      images_per_batch: 12
      overlap_ratio: 0.1     # 可选：批间时间重叠覆盖
      max_concurrency: 1
      backoff: { base_ms: 1000, max_ms: 15000, retries: 2 }
      reuse_uploads: true
    stitching:
      text_sim: 0.85         # 事件文本相似阈值
      gap_s: 1.0             # 时间间隙阈值
      min_duration_s: 0.3
```

---

## 验收标准（KPIs）

- 时间覆盖率：≥ 90% 的事件节点具备 `timestamp` 或 `start/end`。
- 拼接平滑：批间接缝处事件合并成功率 ≥ 80%，断裂率下降。
- 证据可回放：事件节点均可回溯图片/ASR/face/voice 引用；回放正确率 ≥ 95%。
- 检索质量：小评测集上 Top-K 命中率较基线提升（记录 A/B）。
- 稳定性：429 或超时场景下自动降级成功率 ≥ 95%。

---

## 风险与回退

- 上游限流/超时：降级（减图/分裂子窗）+ 指数退避；失败批记录。
- 模型“元信息复述”：二次极简重试；必要时切 provider（OpenAI 系列更稳定支持 data URL）。
- 身份歧义：进入 pending 等价确认流；允许回滚与审计。
- 体量爆炸：抽样与去重策略强制执行；事件上限可设软阈以防“作文化”。

---

## 术语表

- episodic：按时间划分的段节点（clip）。
- semantic：事件节点（含文本、时间锚点与证据）。
- evidence_refs：指向图片/ASR/face/voice 的证据引用。
- stitching：跨批/跨段的事件合并与去噪。
- provenance：复现与审计所需的来源信息（模型/提示词/批次/重试/参数版本）。

---

## 结语

我们当前的实现已经具备“正确的骨架”。把上述差异补齐（拼接、证据、身份、schema、复现、韧性），即可达到生产级的时空知识图谱：
- 事件为中心，时间为真；
- 有证据可回放，有身份可追踪；
- 可检索、可解释、可演进。

