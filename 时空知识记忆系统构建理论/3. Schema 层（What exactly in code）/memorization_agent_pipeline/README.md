# Memorization Agent Pipeline（Graph Building）

面向视频→证据→实体→TKG 的落地路径，梳理当前管线架构、已完成内容与后续切口。

## 架构概览（P0-P0.1）
- 入口：`Orchestrator.process_video` / DAG 模式。关键步骤：`probe → slice → vision → audio → fusion → build_graph → semantic_enhance → write_memory → report`。
- 上下文路由：`routing_ctx` 注入三键（tenant_id/user_id/memory_domain/run_id）+ 开关（enable_diarization/object/scene/llm_semantic/identity）。
- 图谱分区键：`source_id` 对齐 `routing_ctx.run_id`（默认 `run_id=os.path.basename(video_path)`），确保“一次 run 对应一张图”。
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
  - LLM 语义可选（由 `routing_ctx.enable_llm_semantic` / `pipeline.llm_semantic.enable` 控制）。

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
- 人脸证据图片落盘：不在图里存 `face_base64`，保存到 `.artifacts/memorization/evidence_media/faces/<evidence_id>.jpg`，Evidence.extras 仅保留 `image_ref`。
- Neo4j 写入兼容：Graph v0 upsert 会将 `extras/provenance/...` 等嵌套对象编码为 `*_json` 字段，避免 Neo4j “map 不能做属性值”导致 upsert 失败。
- Identity registry 不阻塞事件循环：SQLite I/O 默认通过专用线程池执行（`MEMA_IDENTITY_REGISTRY_ASYNC/WORKERS` 可调）。
- 运行级缓存隔离：`<cache_dir>/<tenant>/<run_id>/faces_min*.json`、`audios.json`；避免不同视频/不同 run 互相污染。
- Face cache 防“假空”：当 InsightFace/onnxruntime 不可用时不写入 `faces_min*.json`，避免先失败后永远 0 face；旧格式的空缓存会在模型可用时自动重算一次。
- YOLO 支持帧文件路径：object detection 现在优先读 `slice.frames_clip`（路径）并兼容 base64 输入，避免 FFmpeg 路径下 “把路径当 base64 解码” 导致 0 objects。

## 当前状态（只跑 Jian.mp4 的“最小闭环”）
- Memory HTTP + Qdrant/Neo4j：可启动并接受 `POST /graph/v0/upsert`（已修复 Neo4j map 属性写入崩溃）。
- Memorization pipeline：可在 `demo/data/Jian.mp4` 上跑通 probe/slice/vision/audio/fusion/build_graph/write_graph（不依赖你本地 VLM）。
- Ops 状态查询：
  - `POST http://127.0.0.1:8081/ingest`：提交任务（run_id 不填会自动生成）。
  - `GET  http://127.0.0.1:8081/ingest/{task_id}`：返回**全量**任务数据（可能非常大，包含中间结果/向量）。
  - `GET  http://127.0.0.1:8081/ingest/{task_id}/status`：返回**精简状态/摘要**（适合 UI 轮询/排障）。
  - 启动全链路 Runbook：见 `docs/时空知识记忆系统构建理论/3. Schema 层（What exactly in code）/memorization_agent_pipeline/RUNBOOK.md`。
- 仍需注意：
  - 如果你要启用 VLM（OpenRouter 的 Qwen VL），确保 `memorization_agent` 进程能拿到 `OPENROUTER_API_KEY`：
    - 推荐：写入 `modules/memory/config/.env`（ops server 会 best-effort 自动加载该文件）
    - 或者：在启动 ops server 前手动 `export OPENROUTER_API_KEY=...`
  - “不跑 LLM”不等于“无外网”：当前 MemoryEntry 的 text embedding 可能走远程 provider（需在 Memory embedding 配置里切换为本地模型或禁用对应写入）。
  - 若 `UtteranceEvidence` 数量为 0，通常意味着 ASR 未产出或未回填到 ctx；需要把“ASR 产物→UtteranceEvidence”链路跑实（见 TODO）。
  - 若你之前因为缺依赖（例如 `onnxruntime`）跑出了 0 face：现在不会再把“失败态空结果”缓存死；装好依赖后直接重跑即可（run_id 不变也能自愈）。
  - `run_real_pipeline.py` 现在会真正使用 `routing_ctx.memory_mode/memory_base_url` 写入 Memory（而不是意外走 local 模式）；用环境变量即可控制：
    - `MEMA_MEMORY_MODE=http`
    - `MEMA_MEMORY_BASE_URL=http://127.0.0.1:8000`
    - `MEMA_PIPELINE_LLM_SEMANTIC_ENABLE=false`（完全跳过 semantic 步骤，不再探测/依赖 SGLang）
    - `MEMA_USER_ID=subject_1`（必须：MemoryEntry 写入需要 user_id 三键）
    - `MEMA_MEMORY_DOMAIN=general`、`MEMA_RUN_ID=Jian.mp4`（建议：保证检索过滤稳定）
  - 若你的环境存在“CUDA 可见但缺 cudnn”这类半残 GPU（常见于容器/驱动不完整）：
    - 强制 ASR 用 CPU：`MEMA_PIPELINE_ASR_DEVICE=cpu`
    - 强制 voice embedding 用 CPU：`MEMA_VOICE_DEVICE=cpu`
  - 若你不想让 pipeline 做 OpenCLIP 的 segment thumbnail/clip_image 聚合（会触发权重下载/缓存）：
    - `MEMA_PIPELINE_ENABLE_CLIP_IMAGE=false`
  - 若你只想跑“写图/写向量”但不想让 Memory embedding 走远程 provider：
    - `MEMA_FORCE_HASH_EMBEDDINGS=1`（VG → MemoryEntry 的 text/image/audio 额外向量全部用可重复的 hash fallback）

## 存到哪里了？（Neo4j / Qdrant / 本地文件）
- Neo4j：Graph v0 节点/边（segments/evidences/entities/events/places/timeslices/utterances…）由 Memory service 写入。
- Qdrant：MemoryEntry 的向量（text/image/audio）由 Memory service 写入；本阶段可能是 hash fallback（`MEMA_FORCE_HASH_EMBEDDINGS=1`）或按 Memory 配置走 provider。
- 本地文件（mema artifacts）：face 证据图像落盘在 `.artifacts/memorization/evidence_media/...`，图里只存 `image_ref`。

### 最小验证（你像 12 岁那样照抄就行）
```bash
# 1) 看 ingest 状态（小 JSON）
curl -s http://127.0.0.1:8081/ingest/Jian.mp4/status | python -c "import json,sys; d=json.load(sys.stdin); print(d['status'], d.get('progress',{}).get('build_graph',{}))"

# 2) 看 Memory 服务是否连通 Neo4j/Qdrant
curl -s http://127.0.0.1:8000/health

# 3) 从 Memory Graph API 拉 segments（证明 Neo4j 里有东西）
curl -s -H 'X-Tenant-ID: test_tenant' 'http://127.0.0.1:8000/graph/v0/segments?source_id=Jian.mp4&limit=5'
# 如果你 ingest 时传了自定义 `run_id`（例如 `demo-run-1`），这里的 `source_id` 也用同一个值。

# 4) 从 Memory Vector API 做一次检索（证明 Qdrant 有东西）
curl -s -H 'X-Tenant-ID: test_tenant' -X POST http://127.0.0.1:8000/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"speaker","top_k":5,"filters":{"run_id":"Jian.mp4","memory_domain":"general","user_id":"subject_1"}}'
```

## Hypothesis 层（现状与缺口）
- 图模型已支持 hypothesis：`GraphEdge.layer`/`GraphEdge.status` 可用于区分 `fact/semantic/identity/hypothesis` 与 `candidate` 等状态。
- 当前已有的 hypothesis 产出主要在 Memory 侧的“后处理/管理接口”：
  - `POST /graph/v0/admin/build_event_relations`：
    - `NEXT_EVENT(layer="fact")`：按时间排序的相邻事件；
    - `CAUSES(layer="hypothesis", status="candidate")`：规则推断（目前示例：相邻事件且同一 place）。
- 现阶段 **pipeline 本身不会直接产出** “person↔person / person↔object”的 hypothesis 关系：
  - `POST /graph/v0/admin/build_cooccurs` 会基于 timeslice 聚合 `CO_OCCURS_WITH`，但默认 `layer="semantic"`（不是 hypothesis）。
  - `person↔object` 只有在 object 被白名单晋升为 `Entity(OBJECT)` 后，才会进入 timeslice/cooccurs 的聚合范围。
- 后续增强方向：在 `build_graph` 或写入后处理阶段增加“共现/空间邻近/对话轮次”的推断边，显式写为 `layer="hypothesis"`（并保持可回滚/可审阅）。

## 待补充（后续切口）
### 优先级计划（先把 Jian.mp4 跑稳）
- P0（必须）：跑通 Jian.mp4 的“无 LLM”端到端，并让检索可用
  - 关闭 LLM 语义（`enable_llm_semantic=false`），确保 diarization+ASR 产出 `UtteranceEvidence`（至少非 0）且 `SPOKEN_BY → person::<tenant>::<uuid>`。
  - 写入后做最小检索验收：`/graph/v0/segments`、`/graph/v0/events`、`/graph/v1/search` 返回非空且 tenant/user/run 过滤一致。
- P1（必须）：产出可解释的“关系”以支持 demo
  - 跑 `POST /graph/v0/admin/build_timeslices`（从 segments 生成 timeslice）→ `POST /graph/v0/admin/build_cooccurs`（聚合 CO_OCCURS_WITH）→ `POST /graph/v0/admin/build_event_relations`（NEXT_EVENT/CAUSES）。
  - 明确 demo 展示口径：`CO_OCCURS_WITH(layer="semantic")` 表示共现聚合；`CAUSES(layer="hypothesis")` 表示规则假设。
- P2（可选）：彻底离线
  - 把 Memory embedding 配置切到本地模型（或对 demo 禁用向量写入），避免 text embedding 走远程 provider。
- P3（后续）：面向生产的治理增强
  - LLM 缓存与幂等；Equivalence/merge 审核流；低置信度写入策略；观测与报警；更广样本回归；运维/持久化。

## 时间轴说明（像我 12 岁那样）
- 我们默认只保证“视频里的时间”（media time）：`t_media_start/t_media_end`（秒），因为每个视频都有。
- “真实世界时间”（physical time，比如拍摄日期/地点的 EXIF/系统时间）是可选的：没有元数据也不影响图构建，只是少了一个把视频和现实世界日历对齐的维度。

## 参考代码入口
- Pipeline steps：`modules/memorization_agent/application/pipeline_steps.py`
- Identity：`application/services/identity_resolution.py`，`adapters/sqlite_identity_registry.py`
- Extractors：`adapters/vision_extractor.py`，`adapters/audio_extractor.py`
- Stable ID：`domain/stable_ids.py`
- Mapper：`application/videograph_to_memory.py`
