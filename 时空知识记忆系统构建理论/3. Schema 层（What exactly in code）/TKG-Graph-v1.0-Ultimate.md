# 时空知识记忆体终极图谱（单一版）

## 1. 核心模型
- 形式：STH = (V, H, τ, σ, λ)，时间为实体（TimeSlice），空间为区域（SpatioTemporalRegion），支持超边/多元关系。
- 公共视图：对外统一公开 Event / Entity / TimeSlice / Evidence 视图；TKG 前向推理用 (s, r, o, t) 流或快照投影；所有访问走模块入口，禁止深层导入。

## 2. 节点分层
- Physical / 索引
  - MediaSegment{modality, recorded_at?, duration, has_physical_time, t_media_start/end}
  - TimeSlice{time_range, granularity, parent?}（可嵌套，多粒度）
  - SpatioTemporalRegion{polygon/room/path, parent?}
- Perception / 证据
  - Evidence{vision/audio/text/sensor, bbox/track_id/speaker_id, timestamp}
  - UtteranceEvidence{raw_text, t_media_start/end, speaker_track_id?, asr_model_version}  
    - 职责：承载**原始 ASR 结果**与时间对齐信息，是“谁在什么时候说了什么”的一等公民节点。  
  - TextEvidence{raw_text, source, lang}（OCR/字幕/LLM 摘要等）  
  - Keyframe（可选，作为视觉证据锚点）
- Cognition / 实体事件
  - Entity{type: Person/Object/Agent/Org…, global_id, tenant_id, aliases, prototypes}  
    - **默认只为 Person 做全局身份聚类**（人脸/声纹/账号等融合）；  
    - 物体 Object 如需长期跟踪（钥匙/车/电脑等少数关键物品），可在实现层将其“晋升”为带 global_id 的 Entity(Object)；  
    - 绝大多数普通物体仅停留在 Evidence 层（检测结果 + 局部 track），**不做全局 ID**，避免在不稳定识别能力下制造伪身份。
  - Event{Atomic/Process/Composite, t_media_*, t_abs_*?, scene, summary, desc}
  - State{subject, property, value, valid_time}
  - Knowledge/Fact{schema_version, buckets_meta, data}（会话 summary/事实桶）
- 扩展 / 推理
  - HypothesisEvent/PredictedEvent{time_origin='predicted'}
  - Pattern/Rule（可选，用于周期/逻辑规则）

## 3. 关系/边
- 时空：OCCURS_AT(Event→TimeSlice/Region), TEMPORALLY_CONTAINS(TimeSlice→Event/Evidence), SPATIALLY_CONTAINS(Region→Entity/Event)
- 参与/状态：INVOLVES(Event→Entity/Object/Agent), HAS_STATE(Entity→State), TRANSITIONS_TO(State→State), DESCRIBES(Knowledge→Event/Entity)
- 时序/因果：NEXT_EVENT(Event→Event), CAUSES/CAUSED_BY(Event↔Event，预测需标记), CO_OCCURS_WITH(Entity↔Entity)
- 观测/证据：SUPPORTED_BY(Event/Relation→Evidence/Segment/Utterance/TextEvidence), OBSERVED_BY(Agent→Event/State), COVERS_SEGMENT/COVERS_EVENT(TimeSlice→Segment/Event)
- 语音/说话人：SPOKEN_BY(UtteranceEvidence→Entity(Person))（ASR 说话人与身份绑定；Utterance 仍可在置信度不足时不挂接或挂接多个候选）
- 等价/对齐：EQUIV/EQUIV_PENDING(Face/Voice/Name→Entity), DERIVED_FROM(Hypothesis→Event/Evidence)

### 3.1 ASR / Utterance 的挂载位置

- **时间绑定**：  
  - UtteranceEvidence 必须带 `t_media_start/end`，并通过  
    - `MediaSegment -[:CONTAINS]-> UtteranceEvidence` 或  
    - `TimeSlice    -[:TEMPORALLY_CONTAINS]-> UtteranceEvidence`  
    实现与物理时间轴对齐。  
  - 这样可以直接支持“某个时间段内谁说过什么”的查询。
- **身份绑定**：  
  - 通过 `UtteranceEvidence -[:SPOKEN_BY]-> Entity(Person)` 把 ASR 文本与人物身份打通；  
  - 说话人识别失败时可不连边或挂 `SPOKEN_BY` 到一个“UnknownSpeaker” 占位实体，并保留 `confidence`。
- **事件/语义绑定**：  
  - `Event -[:SUPPORTED_BY]-> UtteranceEvidence`：事件的语义、意图、承诺等可以回溯到具体说话内容；  
  - ASR 文本可直接参与搜索（“谁说过 X”）和上层抽取（写入 Knowledge/Fact 作为长期语义记忆）。  
  - MediaSegment 的 VLM 语义（画面发生了什么）与 Utterance 的文本语义在 **Event / Knowledge** 层汇合：  
    - VLM 负责描述“看见的动作/场景”；  
    - ASR 负责描述“说的话/内在状态”；  
    - 二者共同支撑同一个 Event/Knowledge 节点，保证查询既能按“故事”问，也能按“原话”问。

## 4. 统一字段（节点/边）
- tenant_id
- time_origin ∈ {physical, media, logical, predicted}
- provenance{source, model_version, prompt_version?, confidence}
- 审计：created_at, updated_at
- TTL / importance（用于裁剪与冷热分层）

## 5. 防止过度工程化与爆炸的约束
- 颗粒度控制：帧→片段→事件分层；存储只物化事件 + 必要 TimeSlice/Region；帧/track 仅存 Evidence 引用，不做“每帧一节点”。
- 分层保留：硬事实必存；高阶推理边(CAUSES/CO_OCCURS/Hypothesis)限额+置信度阈值+layer 标记，可 TTL 清理。
- 身份稳态后扩张：Entity Registry 高阈值合并，EQUIV_PENDING 排队复核，避免错误合并扩边。
- 时间/空间网格化：TimeSlice/Region 多粒度；历史归档为粗粒度，仅保留活跃细粒度切片。
- 关系限流：同类关系对同一节点保留 top-K（按置信度/新颖性/时间衰减）；CO_OCCURS 仅写高频对，低频查询时现算或缓存。
- 价值驱动物化：先全量向量索引粗召回，不建图；触发条件（热度/置信度/业务优先级/预算）才物化 Event/Entity/边，避免“见啥都入图”。
- 审计轻量化：SUPPORTED_BY 只存引用 ID（keyframe/ASR span/storage URI），不内联大附件，延迟加载。
- 查询约束：API 默认 2–3 hop，强制分页与返回量上限，超限需显式 opt-in。
- TTL/压缩：低价值事件/边短 TTL 或转冷存；保摘要节点(Knowledge/Fact)+证据引用，删冗余细节节点。
- 视图分离：存储层保持稀疏规整；推理/统计用投影视图 (s, r, o, t)/快照，不在主图物化所有推理产物。

## 6. 落地建议（执行顺序）
1) 写机器可读 Schema（节点/边/属性/约束），附 top-K/TTL/置信度阈值与 layer 定义。  
2) 定义物化门控：哪些事件/关系触发入图，哪些停留在向量/缓存层；触发信号=查询热度/新颖性/置信度/预算。  
3) 查询 API 上限：默认 hop、分页、返回量、审计字段白名单；CO_OCCURS/NEXT_EVENT/CAUSES 的最小置信度与层级过滤。  
4) 落 Entity Registry：合并/拆分流程、阈值、EQUIV_PENDING 审核；定期抽样 CharacterPurity。  
5) TimeSlice/Region 管理：细粒度活跃、历史归档粗粒度；记录 time_origin/time_source/time_confidence。


可以按这个文档（docs/时空知识记忆系统构建理论/时空知识记忆体终极图设计说明.md）作为终极蓝图来做演示，前提是你补齐少量“数值型约束/参数”再落地：

必补参数：关系 top-K、置信度阈值、TTL/importance 策略、TimeSlice/Region 粒度层级、物化门控触发条件（热度/新颖性/预算）、查询 API 默认 hop/分页上限。这些在文档里是策略，但演示要给定具体数值。
实体注册：先落 Entity Registry（合并/拆分阈值、EQUIV_PENDING 审核流程），否则 ID 漂移会破坏演示连通性。
审计字段：所有入库节点/边都要带 tenant_id、time_origin、provenance{source, model_version, prompt_version?, confidence}，确保可回溯。
视图与投影：存储保持稀疏；对外查询用 Event/Entity/TimeSlice/Evidence 视图，TKG 推理用 (s,r,o,t) 或快照投影，不要在主图物化推理产物。
只要以上参数落到具体值，就可以直接依照该文档构建演示版图谱。
