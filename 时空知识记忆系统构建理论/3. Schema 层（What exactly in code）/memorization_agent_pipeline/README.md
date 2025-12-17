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
- LLM 语义路径的缓存与幂等：避免重复批处理同一 run_id。
- 更强的 equivalence/merge 审核流：人物等价的人工确认与回滚工具。
- 多模态质量评估：对人脸/语音/ASR 低置信度的降级与补救（回退到 tag-based）。
- 全链路观测：每步 latency/失败率、写入量、pending equivalence 监控。

## 参考代码入口
- Pipeline steps：`modules/memorization_agent/application/pipeline_steps.py`
- Identity：`application/services/identity_resolution.py`，`adapters/sqlite_identity_registry.py`
- Extractors：`adapters/vision_extractor.py`，`adapters/audio_extractor.py`
- Stable ID：`domain/stable_ids.py`
- Mapper：`application/videograph_to_memory.py`
