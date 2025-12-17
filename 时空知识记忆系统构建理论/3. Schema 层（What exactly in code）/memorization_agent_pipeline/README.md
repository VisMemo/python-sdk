# Memorization Agent Pipeline（Graph Building）

面向视频→证据→实体→TKG 的落地路径，梳理当前管线架构、已完成内容与后续切口。

## 架构概览（P0-P0.1）
- 入口：`Orchestrator.process_video` / DAG 模式。关键步骤：`probe → slice → vision → audio → fusion → build_graph → semantic_enhance → write_memory → report`。
- 上下文路由：`routing_ctx` 注入三键（tenant_id/user_id/memory_domain/run_id）+ 开关（enable_diarization/object/scene/llm_semantic/identity）。
- 视听抽取：
  - Vision：`VisionExtractor` 生成 face/object/scene 证据；面向 graph 的稳定 ID（hash of source/segment/frame/bbox/label），object 仅白名单晋升为 Entity(OBJECT)。
  - Audio：`AudioExtractor` 生成 voice evidence（embedding+voice_tag）与 ASR utterance（time span），为后续 SPOKEN_BY 建边。
- Identity 解析（P0-1）：
  - `sqlite_identity_registry.match_or_create` 基于 face/voice embedding 与租户隔离的阈值匹配，冲突不自动合并。
  - `identity_resolution.resolve_person_id_map` 先用 voice↔face 共现 (`character_mappings`)，再用 embedding 匹配，输出稳定 `person::<tenant>::<uuid>`.
- Graph Build（TKG v1）：
  - `step_build_graph` 生成 typed Graph v1：MediaSegment、Evidence(voice/face/object/scene)、Entity(PERSON/OBJECT/SCENE)、UtteranceEvidence、Place。
  - 关系：SEGMENT→EVIDENCE(contains)，EVIDENCE→ENTITY(belongs_to/supported_by)，UTTERANCE→ENTITY(spoken_by)，voice/face/utterance 均落到稳定 person。
- 写入：
  - `VideoGraphMapper` 注入 tenant 三键，写 MemoryEntry + Edge；MemoryAdapter 支持 local/http。
  - LLM 语义可选（默认开启，可在 routing_ctx.disable）。

### Mermaid（DAG & 数据流）
```mermaid
flowchart TD
  A[probe\n(ffprobe/meta)] --> B[slice\n(segmentation)]
  B --> C[vision\n(face/object/scene)]
  B --> D[audio\n(voice+ASR)]
  C --> E[fusion\n(track/cluster)]
  D --> E
  E --> F[identity_resolution\n(stable person id)]
  F --> G[build_graph\n(TKG v1 nodes/edges)]
  G --> H[semantic_enhance\n(optional LLM)]
  H --> I[write_memory\n(VideoGraphMapper -> Memory API)]
  I --> J[report]

  subgraph data products
    Cx1[Evidence: face/object/scene\nstable_id+embedding+bbox]
    Dx1[Evidence: voice\nembedding+voice_tag]
    Dx2[UtteranceEvidence\ntext+time+speaker_track]
    Ex1[character_mappings\nvoice<->face cooccurrence]
    Fx1[Entity: PERSON\nperson::<tenant>::uuid]
    Fx2[Entity: OBJECT\nwhitelist only]
  end

  C --> Cx1
  D --> Dx1 --> Ex1
  D --> Dx2
  E --> Ex1
  F --> Fx1
  C --> Fx2
```

## 已完成
- 稳定 ID：face/object/voice/utterance 均使用哈希型稳定 ID，避免帧序号漂移。
- 租户内 person 稳定：SQLite registry + embedding 匹配，voice/face/utterance 全部落到 `person::<tenant>::<uuid>`。
- 语音链路：voice evidence `BELONGS_TO_ENTITY` + `SUPPORTED_BY`，utterance `SPOKEN_BY` 指向 person（缺省 UnknownSpeaker）。
- Object 白名单晋升：仅 `pipeline.objects.entity_whitelist` 中的标签生成 Entity(OBJECT)；其余停留为 Evidence(object)。
- 写入三键/tenant 强制：VideoGraphMapper 注入 tenant_id/user_id/memory_domain/run_id；MemoryEntry 侧与 Graph v1 检索过滤一致。
- Demo 与工具：`demo/run_pipeline_demo.py`（mema ingest→memory search/timeline/places）；Qdrant 状态排查脚本。

## 待补充（后续切口）
- **验收定义**：为全栈回归明确指标：PERSON 稳定 ID 覆盖率、SPOKEN_BY 覆盖率、OBJECT 白名单晋升率、LLM 事实条数/长度上限、写入成功率、端到端耗时。
- **VLM/LLM 实测全开**：在 `demo/data/Jian.mp4` + 至少一个多人/双语视频上启用 clip/diarization/LLM，形成稳定回归用例（含 mock/真实两个 profile），对比验收指标。
- **Memory HTTP 路径实测**：提供 Qdrant/Neo4j 本地启动指引与健康探针（超时/熔断配置），在 `memory.mode=http` 下验证写入/检索/租户隔离（含 auth 头/租户头必填）。
- **LLM 缓存与幂等**：设计键（tenant_id+run_id+segment_window+hash(prompt+frames)）、TTL、命中率度量，明确与重试/幂等写的关系，避免重复批处理。
- **Equivalence/merge 审核流**：默认保守不自动合并；定义人工确认入口、冻结/回滚流程、审计记录；暴露 pending 列表与 SLA。
- **低置信度策略**：对人脸/语音/ASR 标记质量等级，低置信度降级到 tag-based 只写 Evidence（不晋升 Entity），避免污染全局 person；明确写/不写规则。
- **观测与报警**：固化指标名与阈值（示例：`mema_step_latency_ms`、`llm_semantic_error_rate`、`pending_equivalence_count`、`memory_write_fail_total`），定义日志/trace 采样策略与报警基线。
- **回归用例集**：除 Jian.mp4 外，加入室内多人对话、无物体/无场景、双语/跨语种、嘈杂/重叠语音等样本，覆盖白名单对象、diarization、ASR 降级分支。
- **安全与租户边界**：在回归中校验跨租户隔离（auth/租户头），防止人物等价跨租户误合并；Memory HTTP 需强制 tenant_id 过滤。
- **运维/持久化**：给出 identity-registry SQLite 备份/迁移方案、LLM 缓存清理、Qdrant/Neo4j 版本兼容与升级步骤，避免后续踩坑。

## 参考代码入口
- Pipeline steps：`modules/memorization_agent/application/pipeline_steps.py`
- Identity：`application/services/identity_resolution.py`，`adapters/sqlite_identity_registry.py`
- Extractors：`adapters/vision_extractor.py`，`adapters/audio_extractor.py`
- Stable ID：`domain/stable_ids.py`
- Mapper：`application/videograph_to_memory.py`
