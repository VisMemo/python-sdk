# MCP 集成（memory.* 工具）

本文描述如何在“编排层”的 MCP 服务器中集成记忆层的 `memory.*` 工具，以便 LLM/插件生态统一调用。记忆层只提供 ToolSpec 与适配示例，实际注册/路由应在编排层完成。

## 1. 工具规范（ToolSpec）
- 文件：`MOYAN_Agent_Infra/modules/memory/api/memory_toolspec.json`
- 工具：`memory.search` / `memory.write` / `memory.update` / `memory.delete` / `memory.link`
- 参数签名与 HTTP/MemoryPort 一致（见 `modules/memory/module.md:接口参考`）

## 2. 适配样例（无需外部依赖）
- 文件：`MOYAN_Agent_Infra/modules/memory/api/mcp_server.py`
- 用法：
  - `adapter = MemoryMCPAdapter.from_defaults()`（InMem 演示）或传入真实 `MemoryService`
  - `await adapter.invoke('memory.search', {...})` 执行对应工具

> 该样例不是完整 MCP Server，仅演示工具→MemoryService 的路由；在编排层的 MCP Server 中，应：
> - 读取本 ToolSpec，注册工具元数据；
> - 在工具调用 handler 中，解析参数，并调用 HTTP 或注入的 `MemoryService`；
> - 建议在 MCP 层做权限/审计控制（如只允许 `search`，限制 `delete`）。

## 3. 集成步骤（编排层）
1. 在 MCP 服务器初始化时：
   - 读取 `memory_toolspec.json` 并注册工具元数据
   - 构造 `MemoryService` 或配置 memory HTTP base（由编排层注入）
2. 在工具 handler 中：
   - 将参数体按 ToolSpec 反序列化
   - 选择调用路径：
     - 同进程：直调 `MemoryService`
     - 跨进程：POST 到记忆层 HTTP API
   - 将结果转为 MCP 的响应格式
3. 事件与回调（可选）：
   - 若需要订阅 `memory_ready`，在编排层注入全局 `event_bus` 并订阅；
   - 记忆层 `MemoryService` 可注入 `event_publisher` 回调（默认不绑定）。

## 4. 环境变量与配置
- 记忆层 HTTP：参考 `modules/memory/config/.env.example`（Qdrant/Neo4j/LLM/Embedding）
- MCP Server 本身的配置与 Key 管理由编排层维护

## 5. 示例片段（伪代码）
```python
# 编排层 MCP 服务器内
from modules.memory.application.service import MemoryService
from modules.memory.infra.qdrant_store import QdrantStore
from modules.memory.infra.neo4j_store import Neo4jStore
from modules.memory.infra.audit_store import AuditStore
from modules.event_bus import bus

svc = MemoryService(QdrantStore({...}), Neo4jStore({...}), AuditStore())
svc.set_event_publisher(bus.publish)

# MCP handler（接到 memory.search）
async def on_memory_search(params):
    # 反序列化 params（见 ToolSpec）
    res = await svc.search(params['query'], topk=params.get('topk',10), filters=params.get('filters'), expand_graph=params.get('expand_graph', True), threshold=params.get('threshold'))
    return res.model_dump()
```

## 6. 测试建议
- 单测：工具→MemoryService 的参数映射与响应结构
- 集成：通过 MCP 层发起 memory.search/write，确认记忆层写入与检索成功

```text
注意：记忆层不负责 MCP 服务器的实现与注册，只提供 ToolSpec 与适配样例。
```

