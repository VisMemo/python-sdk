# LangGraph Agent 上下文与提示词数据流模拟

> 目的：补充 Control 层 LangGraph Agent 的提示词构造、上下文拼装、工具调用与中断策略，确保设计与实现一致。

---

## 1. 参与模块概览

| 模块 | 位置 | 说明 |
| --- | --- | --- |
| `Exp_chat_agent` | `Auto_genstudio/Agent_example.py` | LangGraph Agent 主体，含 Reasoner/Actor 双节点。 |
| `MCPClient` | `Auto_genstudio/exp_agent_structure/langgraph_custom.py` | 连接 FastMCP Server，加载 MCP 工具。 |
| `MemorySaver` | LangGraph Checkpointer | 存储对话消息历史，支持多轮上下文。 |
| `State` | `Auto_genstudio/exp_agent_structure/State.py` | LangGraph 状态字典，含 `messages`, `is_end` 等。 |

---

## 2. 工具加载与系统提示

### 2.1 工具加载流程
```text
Exp_chat_agent.__init__ → tool_activation()
  → MCPClient.get_tools(self.hug_chat_llm)
      - 启动 FastMCP Server (python MCP_server.py)
      - 建立 stdio 会话，拉取工具 schema
  → load_mcp_tools(session) → LangChain Tool 对象
  → self.hug_chat_llm = self.hug_chat_llm.bind_tools(self.tools)
  → self.tool_name_list = [tool.name ...]
```

### 2.2 系统提示词（简化版）
```text
Reasoner Prompt
- 你是家庭助手的推理引擎。
- 阅读用户输入与 Actor 反馈，分析下一步任务。
- 只能输出自然语言指令，指示 Actor 调用工具或回复用户。
- 指令中需明确工具名与参数（如调用 turn_on_lamp1 亮度=50%）。
- 任务完成后输出“结束”，并给出最终回复提示。

Actor Prompt
- 你是家庭助手的执行终端。
- 可用工具列表：{tool_name_list}。
- 如果指令包含工具名，则调用工具；否则生成面向用户的自然语言回复。
- 回复要礼貌、体现管家身份，不应直接回显指令。
```
- `tool_name_list` 动态写入，确保提示词同步工具集合。
- 如需补充规则（如禁止危险操作），可扩展到系统提示中。

---

## 3. 上下文拼装逻辑

### 3.1 `State` 中的消息结构
LangGraph `State`（TypedDict）定义：
```python
State = {
    "messages": Annotated[list, add_messages],
    "is_end": bool,
    "instruction": str
}
```
- `messages`：按时间顺序包含 System/Human/AI/ToolMessage
- `MemorySaver` 在每轮执行后自动持久化 `messages`

### 3.2 Reasoner/Actor 调用
```python
system_msg = self.reasoner_system_prompt
combined = [system_msg] + state["messages"]
result = await self.hug_reasoner_llm.ainvoke(combined)
```
Actor 节点同理：
```python
system_msg = self.chat_system_prompt
combined = [system_msg] + state["messages"]
result = await self.hug_chat_llm.ainvoke(combined)
```
- `combined` 中最后一条通常为用户输入或工具结果。
- 返回 `AIMessage`，可能包含 `tool_calls` 或 `content`。

### 3.3 用户信息注入
- 用户身份、偏好通过外部 `session`/上下文管理注入到 `state["messages"]` 中（例如前置 `HumanMessage` 或在系统提示中补充）。
- Conversation ID 由上层维护，用于日志与记忆关联。

### 3.4 多轮上下文
- MemorySaver 通过 `self.memory` 持久化 `messages`，同一 conversation 一直复用。
- 如需限制上下文长度，可在每轮前裁剪历史。

---

## 4. 工具调用与回执合并

1. Reasoner 输出 `tool_calls` → LangGraph 会转交给 Actor。
2. Actor 解析指令：
   - 若包含工具名 → 构造 MCP 调用。
   - 否则直接生成回复。
3. 工具返回 (`ToolMessage`) 会被加入 `messages`，供下一轮 Reasoner 判断任务是否完成。

注意：工具返回字符串，需要在后续处理时提取关键数据，以用于记忆或响应。

---

## 5. 用户打断与事件插入

### 5.1 用户打断
- 上层 `chat_main` 在主循环中优先处理用户输入：
  - 如果用户输入新指令，`state["messages"]` 追加新的 `HumanMessage`，`is_end` 重置为 False。
  - 正在执行的任务不会继续（除非主动保持状态）。
- LangGraph 会基于新的输入重新推理，无需手动清空上下文。

### 5.2 事件插入（Observer / memory_ready）
- 当 Observer 事件或记忆更新打断当前对话时，系统可：
  1. 写入 `SystemMessage`（例如 “检测到客厅温度过高…”）。
  2. 设置 `state["instruction"]` 指示 Reasoner 下一步处理该事件。
- 后续 LLM 会将该系统消息视为最新上下文，决定是否继续执行、询问用户或生成提示。

### 5.3 Prompt 重组策略
- 由于 MemorySaver 已维护完整历史，无需重建整 prompt；只需附加新的消息即可。
- 如需硬重置（例如新会话），可新建 `Exp_chat_agent`实例或清空 `self.memory`。

---

## 6. 规则补充参考

在系统提示中可加入以下基础规则（可选）：

**Reasoner 规则参考**
- 遇到缺少参数时优先尝试从记忆/状态中推断，仍缺失再向用户确认。
- 一次只指示 Actor 执行一个工具或回应。
- 处理失败后要决定重试、改用其他工具或通知用户。
- 当外部事件（如 `memory_ready`）提供新信息时，优先整合再规划。

**Actor 规则参考**
- 工具返回失败信息时不要直接回显，应转述对用户友好的说明。
- 回复需包含简明结果与下一步建议。
- 遇到危险或未知指令，返回告警而非执行。

---

## 7. 与主架构一致性
- 文档中 Control Agent 流程的“检索→规划→执行→记忆→响应”同样依赖此上下文拼装与提示词。
- 视频记忆、事件打断均通过追加消息方式融入，无需修改主 Mermeid 图。

---

该模拟为 LangGraph Agent 的上下文管理提供清晰骨架，便于后续扩展提示词、用户属性注入或打断处理逻辑。
