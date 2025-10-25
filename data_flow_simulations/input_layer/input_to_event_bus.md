# 输入层→事件总线 数据流转模拟


## 1. 总览：四步法 + 四类输入

全链路遵循 **“原始帧 InputFrame → 草稿 Draft → 激活 ActivationEnvelope → 标准事件 Event”** 四步流程，覆盖语音、文本、传感器、摄像头以及长视频入库任务等输入。

```mermaid
flowchart LR
    InputFrame --> Draft --> ActivationEnvelope --> Event --> EventBus
```

核心目标：统一契约、前置激活判断、保证幂等可重放、简化后续 Agent 处理。

---

## 2. 统一契约（v1）

### 2.1 InputFrame
采集适配器统一输出。

```json
{
  "version": "v1",
  "frame_id": "frame-uuid",
  "modality": "audio|text|sensor|video",
  "source": "interfaces.voice|interfaces.web|interfaces.sensor_gateway|interfaces.camera_gateway",
  "source_ts": "2025-02-12T08:46:01.210Z",
  "ingest_ts": "2025-02-12T08:46:01.230Z",
  "trace_id": "trace-uuid",
  "payload": { "...raw..." },
  "meta": {
    "device_id": "...",
    "user_id": "...",
    "lang": "zh",
    "auth": { "token": "..." }
  }
}
```

- `source_ts`: 原始设备时间；`ingest_ts`: 系统入站 UTC。
- `trace_id`: 全链路追踪号（默认与 frame_id 同源）。

### 2.2 Draft 层
#### UserIntentDraft（语音/文本）
```json
{
  "version": "v1",
  "draft_id": "input-20250212-0001",
  "source": "voice|text",
  "raw_text": "把客厅吊灯亮度调到百分之五十",
  "lang": "zh",
  "confidence": 0.86,
  "meta": {
    "session_id": "mic-session-...",
    "channel": "voice|web",
    "auth": { "user_id": "user1", "roles": ["owner"] }
  },
  "trace_id": "trace-uuid"
}
```

#### SystemEventDraft（传感器/摄像头）
```json
{
  "version": "v1",
  "draft_id": "sensor-evt-20250212-0001",
  "source": "sensor_gateway|camera_gateway",
  "category": "sensor|camera",
  "payload": { "sensor_id|camera_id": "...", "value|event": "..." },
  "confidence": 0.72,
  "meta": {
    "provider": "home_assistant|onvif",
    "blob_id": "blob://...",
    "raw": { "...原始payload..." }
  },
  "trace_id": "trace-uuid"
}
```

### 2.3 ActivationEnvelope
ActivationController 使用的统一封套。

```json
{
  "version": "v1",
  "activation_id": "act-uuid",
  "activated": true,
  "strategy": "publish|suppress",
  "reason": "ok|low_confidence|throttled|invalid_auth|rate_limited",
  "priority": 5,
  "ttl_ms": 60000,
  "idempotency_key": "stable-key",
  "tags": ["user_request","safety_high"],
  "trace_id": "trace-uuid",
  "draft": { "...Draft..." }
}
```

- `activated=false` 时：
  - `strategy=publish`：仍发布事件但带 `meta.suppressed=true`，供后续观察。
  - `strategy=discard`：不发布事件，仅记录日志/指标。
  - `strategy=alert`：发布 `system_alert` 通知 UI。

### 2.4 Event（标准事件）

```json
{
  "version": "v1",
  "id": "evt-uuid",
  "type": "user_request|sensor_data|camera_event|system_alert|ingestion_error|validation_error",
  "source": "interfaces.voice|interfaces.web|interfaces.sensor_gateway|interfaces.camera_gateway",
  "priority": 5,
  "trace_id": "trace-uuid",
  "source_ts": "2025-02-12T08:46:01.210Z",
  "ingest_ts": "2025-02-12T08:46:01.230Z",
  "clock_skew_ms": 20,
  "idempotency_key": "stable-key",
  "payload": { "...domain fields..." },
  "meta": {
    "activated": true,
    "suppressed": false,
    "confidence": 0.86,
    "blob_id": "blob://..."
  }
}
```

事件必须可重放：`payload` 不允许放大文件，使用 `blob_id` 引用。

---

## 3. 四类输入的完整链路

### 3.1 语音
1. `VoiceInputService` 静默监听，写入 `InputFrame(modality=audio)`。
2. `ASRProcessor` 消费 RawAudioBuffer → ASR 结果。
3. `InputNormalizer` 生成 `UserIntentDraft`。
4. `ActivationController` 计算 `ActivationEnvelope`：若置信度 < 阈值，`activated=false`、`reason=low_confidence`、`strategy=alert`。
5. `EventBuilder` 产出 `Event(type=user_request)`。
6. `EventBusPort.publish` 入总线。

优先级：默认 5；若语音失败次数 ≥ 阈值，可降至 7 并发送退出提示。

### 3.2 文本
1. `TextInputAdapter` 接收 CLI/Web/移动端输入 → `InputFrame(modality=text)`。
2. 校验长度/敏感词/鉴权 → `UserIntentDraft`。
3. Activation 与语音路径同理，但置信度默认为 1。
4. 文本为空 → `activated=false`、`reason=empty_input`、`strategy=discard`。

### 3.3 传感器
1. `SensorIngestor` 监听 MQTT/WebSocket → `InputFrame(modality=sensor)`。
2. 归一化单位/校验范围 → `SystemEventDraft(category=sensor)`。
3. Activation：
   - 连续值变化 < 阈值 → `activated=false`、`reason=throttled`，记录抑制次数。
   - 告警类（烟雾/门磁异常）→ `priority=2`，`tags` 标记 `safety_high`。
4. 事件类型为 `sensor_data`，`payload` 存储标准化值与单位。

去重策略：`idempotency_key = hash(sensor_id + quantized_value + time_bucket_5s)`。

### 3.4 摄像头 / 视频任务
1. `VideoIngestor` 接收 motion/face 事件 → `InputFrame(modality=video)`。
2. 如果是实时摄像头事件，抓取快照并上传 Blob → 返回 `blob_id`，生成 `SystemEventDraft(category=camera)` 并走实时处理（VLM 降级策略同前）。
3. 如果事件包含长视频引用（例如夜间巡检、回放任务），在 `Draft.meta` 中写入 `video_source`、`clip_plan` 等信息，生成 `SystemEventDraft(category=video)`。
4. Activation：
   - 实时事件：同摄像头流程，`priority=3`；低置信度时 `strategy=suppress` 或 `alert`。
   - 视频任务：统一转化为 `video_ingest` 事件，`priority=6`（较低），`payload` 仅包含引用（视频源路径、待生成的 `clip_path`、输出目录等），`meta` 中附 `blob_id`/凭证。
5. 记忆服务订阅 `video_ingest`，完成切片、人脸/语音提取、调用记忆模型后，通过 `MemoryPort` 写入记忆，再发布 `memory_ready`（`priority=4`）。

去重：
- 实时摄像头事件：`hash(camera_id + event + snapshot_hash[:N])`。
- 视频任务：`hash(video_source + clip_plan + day_bucket)`，确保同一素材不会重复排队。

---

## 4. 优先级与背压策略

### 4.1 优先级数值（越小越高）
| 数值 | 描述 | 示例 |
| --- | --- | --- |
| 1 | 最高，生命/安防 | 烟雾报警、入侵警报 |
| 3 | 高，摄像头关键事件 | 人脸识别、异常动作 |
| 5 | 默认 | 普通语音/文本请求、舒适度传感器 |
| 7 | 低 | 高频心跳、调试信息 |
| 9 | 最低 | 冗余日志、健康检查 |

### 4.2 背压机制
- **多队列 + 加权公平出队 (WFQ)**：按优先级分队列，按权重轮询，避免饥饿。
- **每来源配额**：例如 `voice`、`sensor` 各自每秒上限，防止噪声淹没全局。
- **高水位告警**：队列深度超过阈值时，启动限流策略（丢尾/合并/降频），并发布 `system_alert`。

### 4.3 幂等去重
- 语音：`hash(session_id + normalized_text)`。
- 文本：`hash(user_id + raw_text + minute_bucket)`。
- 传感器：`hash(sensor_id + quantized_value + time_bucket_5s)`。
- 摄像头：`hash(camera_id + event + snapshot_hash[:N])`。

Activation 阶段需查询最近窗口内是否已有相同 key，合并或丢弃。

---

## 5. 状态管理与资源策略

| 阶段 | 状态类型 | 存储 | 生命周期 | 备注 |
| --- | --- | --- | --- | --- |
| Raw 音频 | 环形缓冲 | 内存 | 识别后释放 | 统计溢出次数 |
| ASR 结果 | 内存队列 | 内存 | 推送后释放 | 可写调试日志 |
| Draft | 结构体 | 内存 | 事件发布前 | 包含 trace_id |
| ActivationEnvelope | 结构体 | 内存 | EventBuilder 消费后释放 | 保存策略/优先级 |
| 视频快照 | 二进制 | Blob (MinIO/FS) | 可配置 TTL | 事件 `meta.blob_id` 引用 |
| Event | 队列元素 | EventBus | 按队列策略 | 遵循可重放原则 |

---

## 6. 异常与安全模型

### 6.1 错误事件类型
- `ingestion_error`: I/O/格式解析失败。
- `validation_error`: 契约/鉴权失败。
- `timeout`: 外部依赖（ASR/VLM）超时。

错误事件也需生成标准 `Event`，方便 Monitor Agent 或日志审计。

### 6.2 激活策略矩阵

| 输入类型 | 情况 | activated | strategy | reason |
| --- | --- | --- | --- | --- |
| 语音 | 置信度 < 阈值 | false | alert | low_confidence |
| 语音 | 连续失败 ≥5 | false | alert | rate_limited |
| 文本 | 敏感词/未授权 | false | discard | invalid_auth |
| 传感器 | 变化 < 阈值 | false | discard | throttled |
| 传感器 | 告警类 | true | publish | ok |
| 摄像头 | VLM 超时 | true | publish | timeout |
| 摄像头 | 排查抑制样本 | false | suppress | throttled |

- `strategy=alert`：产生 `system_alert` 事件（优先级 7）。
- `strategy=suppress`：仍发布事件，但 `meta.suppressed=true`，供学习。

### 6.3 鉴权与配额
- 所有 Draft 必须携带 `meta.auth`，Activation 根据角色/配额拒绝非法请求。
- 摄像头/传感器事件需校验来源签名或 token。

---

## 7. 可观测性指标与日志

### 7.1 指标（Prometheus 例）
- `inputs_total{modality}`：各通道入站数量。
- `activated_ratio{modality,reason}`：激活成功比率。
- `queue_depth{priority}`：队列深度。
- `event_latency_ms{priority}`：从 `ingest_ts` 到消费的延迟（P50/P95/P99）。
- `ingestion_errors_total{type}`：错误计数。
- `blob_bytes_written_total`：视频快照写入量。

### 7.2 日志字段约定
每条日志至少包含：`trace_id`、`frame_id/draft_id/activation_id/event_id`、`priority`、`activated`、`reason`、`source`、`modality`。

### 7.3 Tracing
- 对外部调用（ASR/VLM/MQTT）使用分布式追踪，记录耗时与失败。
- 事件处理链路统一 span name：`input_frame` → `draft_normalize` → `activation_decision` → `event_publish`。

---

## 8. 性能预算（P95）

| 链路 | 目标 |
| --- | --- |
| 语音（ASR 完成→事件发布） | ≤ 150–250 ms（本地） / ≤ 400 ms（云端） |
| 文本（输入→事件） | ≤ 30 ms |
| 传感器 | ≤ 50 ms |
| 摄像头（motion→VLM） | 300–1500 ms（视模型） |

降级路径：VLM 超时立即发 `camera_event`，晚到描述输出 `camera_captioned` 补充事件。

---

## 9. 模块 I/O 摘要

| 模块 | 输入 | 输出 | 异常 |
| --- | --- | --- | --- |
| RawInputReceiver | 设备原始 I/O | `InputFrame` | ingestion_error |
| VoiceInputService | `InputFrame(audio)` | RawAudioBuffer → ASR 任务 | timeout/buffer_overflow |
| ASRProcessor | RawAudioBuffer | ASR 结果 | ingestion_error/timeout |
| TextInputAdapter | 字符串+auth | `UserIntentDraft` | validation_error |
| SensorIngestor | MQTT/WS payload | `SystemEventDraft(sensor)` | validation_error |
| VideoIngestor | 摄像头事件+快照/长视频引用 | `SystemEventDraft(camera|video)` | timeout/ingestion_error |
| MediaIngestionWorker | `Event(video_ingest)` | 切片+中间特征+记忆写入 | ingestion_error/timeout |
| MemoryIngestionNotifier | 记忆写入结果 | `Event(memory_ready)` | ingestion_error |
| InputNormalizer | 各类中间对象 | Draft | validation_error |
| ActivationController | Draft | `ActivationEnvelope` | —（reason 记录） |
| EventBuilder | `ActivationEnvelope` | `Event` | validation_error |
| EventBusPort.publish | `Event` | ack/nack | ingestion_error |

---

## 10. 实施校验清单（必须过 CI/测试）

1. **Schema 校验**：对 InputFrame/Draft/Activation/Event 生成 JSON Schema，入站/出站都校验。
2. **幂等测试**：相同 `idempotency_key` 多次发布仅入队一次。
3. **优先级回归**：压力测试下验证 WFQ 出队顺序与饥饿保护。
4. **时钟漂移**：模拟 `source_ts` 偏移，检查 `clock_skew_ms` 记录准确，排序仍以 `ingest_ts` 为准。
5. **降级路径**：断开 ASR/VLM，系统仍能产出降级事件（带 `meta.timeout` 标记）。
6. **安全用例**：未授权文本/视频触发 `invalid_auth`，发布 `validation_error` 或 `system_alert`。
7. **视频记忆链路**：`video_ingest` 事件应在 MediaIngestionWorker 内完成幂等校验与失败重试；成功后发布 `memory_ready`（携带记忆版本、clip range），失败则生成 `ingestion_error(type="media")`。

---

## 11. 结论

- **合理性**：统一契约 + Activation 前置 + 幂等策略，确保输入层输出质量可靠，后续 Agent 处理逻辑清晰。
- **效率**：中间状态内存化、Blob 引用、优先级调度，兼顾低延迟与资源消耗。
- **兼容性**：通过 version/trace_id/idempotency_key/双时间戳定义，实现可重放、可扩展、可降级的入口层。
- **可观测性**：指标、日志、Tracing 一体化，减少运维盲区。

按本文档实施，可直接形成代码骨架与 CI 检查项，为编排层、执行层、记忆层提供稳定数据源。
