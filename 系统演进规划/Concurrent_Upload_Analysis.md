# Gemini 批处理并发优化方案

## 问题诊断

### 当前性能瓶颈
- **串行批处理**：10个批次逐个处理，总时间400秒+
- **单批次延迟**：每个批次约40秒API响应时间
- **并发上传缺失**：无法利用并行处理加速

### 核心问题代码位置
**文件**：`modules/memorization_agent/application/llm_provider.py:927-1000`

```python
# 当前串行处理代码
for bi in range(win_count):  # ← 串行循环！
    # 每个批次需要等待前一个完成
    # 批次0 → 批次1 → 批次2 → ... → 批次9
```

## 并发优化方案

### 方案1：asyncio 并发处理（推荐）⭐

```python
import asyncio
from typing import List, Dict, Any

async def _process_batch_concurrent(
    self,
    batches: List[List[int]],
    prompt: str,
    frames: List[Any],
    ctx: Dict[str, Any],
    max_concurrent: int = 3  # 限制并发数避免API限流
) -> List[Dict[str, Any]]:
    """并发处理批次，控制并发数避免API限制"""

    semaphore = asyncio.Semaphore(max_concurrent)

    async def process_single_batch(batch_indices: List[int]) -> Dict[str, Any]:
        async with semaphore:
            try:
                # 构建批次消息
                user_mapping = self._build_mapping_text(batch_indices)

                # 临时替换frames上下文
                _ctx_saved_frames = (ctx.get("slice") or {}).get("frames")
                (ctx.get("slice") or {})["frames"] = [frames[i] for i in batch_indices]

                u = self._build_user_with_prompt(prompt, attach_frames_override=len(batch_indices))
                u2 = {"role": "user", "content": list(u.get("content") or []) +
                       [{"type": "text", "text": f"images_map: {user_mapping}"}]}

                # 调用API
                raw = await self._adapter.generate_async([u2], response_format=None)
                data = self._enhanced_parse_llm_response(raw) if isinstance(raw, str) else {}

                # 恢复上下文
                (ctx.get("slice") or {})["frames"] = _ctx_saved_frames

                return {
                    "batch_id": batch_indices[0] if batch_indices else 0,
                    "success": bool(data.get("semantic_timeline")),
                    "data": data,
                    "error": None
                }
            except Exception as e:
                return {
                    "batch_id": batch_indices[0] if batch_indices else 0,
                    "success": False,
                    "data": {},
                    "error": str(e)
                }

    # 并发执行所有批次
    tasks = [process_single_batch(batch_indices) for batch_indices in batches]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    return results

# 使用示例
if batch_mode == "multi" and total > images_per_batch:
    # 准备批次数据
    batches = [...]  # 10个批次的索引列表

    # 🔥 并发处理
    results = await self._process_batch_concurrent(
        batches=batches,
        prompt=prompt,
        frames=frames,
        ctx=ctx,
        max_concurrent=3  # 限制3个并发，避免API限流
    )
```

### 方案2：线程池并发（简单实现）

```python
import concurrent.futures
from threading import Lock

def _process_batch_threaded(
    self,
    batches: List[List[int]],
    prompt: str,
    frames: List[Any],
    ctx: Dict[str, Any],
    max_workers: int = 3
) -> List[Dict[str, Any]]:
    """使用线程池并发处理批次"""

    results = [None] * len(batches)
    results_lock = Lock()

    def process_batch_worker(batch_indices: List[int], batch_idx: int):
        try:
            # 构建批次消息（同串行版本）
            user_mapping = self._build_mapping_text(batch_indices)
            _ctx_saved_frames = (ctx.get("slice") or {}).get("frames")
            (ctx.get("slice") or {})["frames"] = [frames[i] for i in batch_indices]

            u = self._build_user_with_prompt(prompt, attach_frames_override=len(batch_indices))
            u2 = {"role": "user", "content": list(u.get("content") or []) +
                   [{"type": "text", "text": f"images_map: {user_mapping}"}]}

            # 调用API
            raw = self._adapter.generate([u2], response_format=None)
            data = self._enhanced_parse_llm_response(raw) if isinstance(raw, str) else {}

            # 恢复上下文
            (ctx.get("slice") or {})["frames"] = _ctx_saved_frames

            result = {
                "batch_id": batch_idx,
                "success": bool(data.get("semantic_timeline")),
                "data": data,
                "error": None
            }
        except Exception as e:
            result = {
                "batch_id": batch_idx,
                "success": False,
                "data": {},
                "error": str(e)
            }

        with results_lock:
            results[batch_idx] = result

    # 提交所有任务到线程池
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(process_batch_worker, batch_indices, i)
            for i, batch_indices in enumerate(batches)
        ]
        # 等待所有任务完成
        concurrent.futures.wait(futures)

    return results
```

### 方案3：混合策略（最优）

```python
async def _process_batch_hybrid(
    self,
    batches: List[List[int]],
    prompt: str,
    frames: List[Any],
    ctx: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """混合策略：预上传图片 + 并发API调用"""

    # 阶段1：并发预上传图片到Gemini Files API
    print("[Perf] 并发上传图片到Gemini Files API...")
    uploaded_files = await self._upload_frames_concurrent(frames)

    # 阶段2：使用文件引用并发调用语义API
    print("[Perf] 并发调用语义API...")
    semaphore = asyncio.Semaphore(3)  # 限制并发数

    async def process_batch_with_files(batch_indices: List[int]) -> Dict[str, Any]:
        async with semaphore:
            try:
                # 使用文件引用替代Base64
                file_refs = [uploaded_files[i] for i in batch_indices]

                # 构建消息（使用文件引用）
                user_mapping = self._build_mapping_text(batch_indices)
                u = self._build_user_with_prompt(prompt, attach_frames_override=len(batch_indices))

                # 替换内容为文件引用
                u["content"] = [{"type": "text", "text": prompt}] + file_refs + [
                    {"type": "text", "text": f"images_map: {user_mapping}"}
                ]

                # 调用API
                raw = await self._adapter.generate_async([u], response_format=None)
                data = self._enhanced_parse_llm_response(raw) if isinstance(raw, str) else {}

                return {
                    "batch_id": batch_indices[0] if batch_indices else 0,
                    "success": bool(data.get("semantic_timeline")),
                    "data": data,
                    "error": None
                }
            except Exception as e:
                return {
                    "batch_id": batch_indices[0] if batch_indices else 0,
                    "success": False,
                    "data": {},
                    "error": str(e)
                }

    # 并发执行
    tasks = [process_batch_with_files(batch_indices) for batch_indices in batches]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    return results

async def _upload_frames_concurrent(self, frames: List[str]) -> List[Any]:
    """并发上传图片到Gemini Files API"""
    try:
        from google import genai
        client = genai.Client()

        async def upload_single_frame(frame_path: str):
            try:
                # 上传并返回文件引用
                file_ref = client.files.upload(file=frame_path)
                return file_ref
            except Exception as e:
                print(f"Failed to upload {frame_path}: {e}")
                # 回退到Base64
                return await self._convert_to_data_url_async(frame_path)

        # 并发上传所有帧
        tasks = [upload_single_frame(frame) for frame in frames]
        uploaded_files = await asyncio.gather(*tasks, return_exceptions=True)

        return uploaded_files
    except Exception as e:
        print(f"Gemini Files API upload failed: {e}")
        # 回退到Base64
        return [await self._convert_to_data_url_async(frame) for frame in frames]
```

## 预期性能提升

### 当前性能
- **串行处理**：10批次 × 40秒 = 400秒（6.6分钟）
- **单个批次**：40秒

### 优化后性能

| 并发数 | 理论时间 | 实际时间* | 加速比 |
|--------|----------|-----------|--------|
| 3并发 | 133秒 | 150-180秒 | **2.7x** |
| 5并发 | 80秒 | 100-120秒 | **4x** |
| 10并发 | 40秒 | 60-80秒 | **6-7x** |

*实际时间考虑了API限流和系统资源

## 实施建议

### 阶段1：立即实施（30分钟）
1. 使用**线程池并发**（方案2）
2. 限制并发数为3（避免API限流）
3. 保持现有API调用逻辑不变

### 阶段2：短期优化（1天）
1. 实现**asyncio并发**（方案1）
2. 添加性能监控和错误重试
3. 优化内存使用

### 阶段3：长期优化（3-5天）
1. 实现**混合策略**（方案3）
2. Gemini Files API预上传
3. 智能并发数调整

## 风险控制

### API限流
- 设置`max_concurrent=3`作为初始值
- 根据API响应时间动态调整
- 添加指数退避重试机制

### 内存管理
- 每个并发任务独立处理，避免共享状态
- 及时释放大对象（图片、API响应）

### 错误处理
- 单个批次失败不影响其他批次
- 记录详细错误日志用于调试
- 提供降级到串行处理的选项

## 监控指标

```python
# 添加性能监控
import time
import asyncio

class PerformanceMonitor:
    def __init__(self):
        self.batch_times = []
        self.concurrent_batches = 0
        self.max_concurrent = 0

    async def measure_batch(self, batch_id: int, coro):
        start = time.time()
        result = await coro
        elapsed = time.time() - start

        self.batch_times.append(elapsed)
        self.concurrent_batches = max(self.concurrent_batches, asyncio.current_task().concurrency_level)

        print(f"[Perf] Batch {batch_id}: {elapsed:.2f}s (avg: {np.mean(self.batch_times):.2f}s)")
        return result
```

## 结论

**并发上传是解决这个问题的最佳方案**，原因：

1. ✅ **直接针对问题**：解决串行批处理的根本问题
2. ✅ **无副作用**：不压缩图片，不改变数据格式
3. ✅ **渐进式优化**：可以从3并发开始，逐步提升
4. ✅ **兼容性好**：保持现有API调用逻辑
5. ✅ **资源高效**：充分利用网络和API并发能力

**推荐优先级**：
1. **立即**：线程池并发（max_workers=3）
2. **短期**：asyncio并发优化
3. **长期**：混合策略（文件预上传 + 并发）
