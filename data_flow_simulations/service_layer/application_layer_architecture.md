# 应用服务层架构设计

## 总体架构

```mermaid
graph TB
    subgraph "To C端 - 用户应用层"
        subgraph "统一终端入口"
            C_MOBILE[移动APP<br/>iOS/Android]
            C_WEB[Web控制台<br/>PWA]
            C_VOICE[语音助手<br/>本地/云端]
            C_WIDGET[桌面小组件<br/>快捷控制]
        end
        
        subgraph "用户服务层"
            C_AUTH[身份认证服务<br/>JWT/OAuth2]
            C_PROFILE[用户画像服务<br/>偏好学习]
            C_SCENE[场景管理服务<br/>自定义场景]
            C_NOTIFICATION[通知推送服务<br/>多渠道通知]
        end
    end
    
    subgraph "API Gateway & Load Balancer"
        GATEWAY[API网关<br/>统一入口/限流/监控]
        LB[负载均衡器<br/>高可用/容错]
    end
    
    subgraph "To B端 - 硬件厂商SDK"
        subgraph "设备接入SDK"
            B_SDK[标准SDK<br/>多语言支持]
            B_CERT[设备认证服务<br/>安全准入]
            B_REGISTRY[设备注册中心<br/>能力发现]
            B_MONITOR[设备监控SDK<br/>状态上报]
        end
        
        subgraph "厂商服务层"
            B_ONBOARD[快速接入服务<br/>自助开通]
            B_ANALYTICS[设备分析服务<br/>使用统计]
            B_BILLING[计费结算服务<br/>API调用计费]
            B_SUPPORT[技术支持服务<br/>文档/工单]
        end
    end
    
    subgraph "业务编排层 (基于现有基础设施)"
        subgraph "统一服务接口"
            BIZ_DEVICE[设备控制服务<br/>标准化控制接口]
            BIZ_SCENE[场景编排服务<br/>复合动作执行]
            BIZ_AUTO[自动化服务<br/>规则引擎/ML推荐]
            BIZ_MEMORY[记忆服务<br/>用户行为学习]
        end
        
        subgraph "数据服务层"
            DATA_USER[用户数据服务<br/>偏好/历史]
            DATA_DEVICE[设备数据服务<br/>状态/日志]
            DATA_ANALYTICS[分析服务<br/>使用模式挖掘]
            DATA_SYNC[数据同步服务<br/>多端一致性]
        end
    end
    
    subgraph "基础设施层 (现有M3-Agent架构)"
        INFRA[M3-Agent基础设施<br/>Control/Observer/Memory Agents<br/>CAL Gateway<br/>设备适配器]
        style INFRA fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    end
    
    %% C端数据流
    C_MOBILE --> GATEWAY
    C_WEB --> GATEWAY
    C_VOICE --> GATEWAY
    C_WIDGET --> GATEWAY
    
    GATEWAY --> C_AUTH
    C_AUTH --> C_PROFILE
    C_PROFILE --> BIZ_DEVICE
    C_SCENE --> BIZ_SCENE
    C_NOTIFICATION --> DATA_USER
    
    %% B端数据流
    B_SDK --> LB
    B_CERT --> LB
    B_REGISTRY --> LB
    B_MONITOR --> LB
    
    LB --> B_ONBOARD
    B_ONBOARD --> BIZ_DEVICE
    B_ANALYTICS --> DATA_DEVICE
    B_BILLING --> DATA_ANALYTICS
    
    %% 业务层到基础设施
    BIZ_DEVICE --> INFRA
    BIZ_SCENE --> INFRA
    BIZ_AUTO --> INFRA
    BIZ_MEMORY --> INFRA
    
    DATA_USER --> INFRA
    DATA_DEVICE --> INFRA
    DATA_ANALYTICS --> INFRA
    DATA_SYNC --> INFRA
    
    style C_MOBILE fill:#c8e6c9
    style C_WEB fill:#c8e6c9
    style B_SDK fill:#ffecb3
    style B_CERT fill:#ffecb3
    style GATEWAY fill:#f3e5f5
    style LB fill:#f3e5f5
```

## To B端 - 硬件厂商接入流程

### 1. 设备接入SDK设计

**核心接口抽象**：
```python
# 设备SDK核心接口
class DeviceSDK:
    def register_device(self, device_info: DeviceInfo) -> str:
        """注册设备到平台，返回设备ID"""
        
    def report_state(self, device_id: str, state: DeviceState) -> bool:
        """上报设备状态变化"""
        
    def handle_command(self, callback: Callable[[Command], CommandResult]):
        """注册命令处理回调"""
        
    def subscribe_events(self, event_types: List[str]) -> EventStream:
        """订阅平台事件"""

# 使用示例 - 厂商只需几行代码
sdk = DeviceSDK(api_key="vendor_key", secret="vendor_secret")
device_id = sdk.register_device({
    "name": "智能灯泡",
    "type": "light",
    "capabilities": ["on_off", "brightness", "color"],
    "model": "LightBulb-Pro-2024"
})

@sdk.handle_command
def on_command(cmd: Command) -> CommandResult:
    if cmd.action == "turn_on":
        hardware_light.turn_on()
        return CommandResult(success=True, new_state={"on": True})
```

### 2. 厂商服务数据流

```mermaid
sequenceDiagram
    participant Vendor as 硬件厂商
    participant SDK as 接入SDK
    participant Gateway as API网关
    participant Registry as 设备注册中心
    participant CAL as CAL Gateway
    participant Agent as M3-Agent

    %% 设备注册流程
    Vendor->>SDK: 初始化SDK(api_key)
    SDK->>Gateway: 认证请求
    Gateway->>Registry: 验证厂商资质
    Registry-->>Gateway: 返回access_token
    Gateway-->>SDK: 认证成功
    
    %% 设备接入流程
    Vendor->>SDK: register_device(device_info)
    SDK->>Gateway: POST /devices/register
    Gateway->>Registry: 注册设备元数据
    Registry->>CAL: 生成设备控制接口
    CAL-->>Registry: 返回控制schema
    Registry-->>Gateway: 设备注册完成
    Gateway-->>SDK: 返回device_id
    
    %% 运行时数据流
    Vendor->>SDK: report_state(device_id, state)
    SDK->>Gateway: POST /devices/{id}/state
    Gateway->>Agent: 状态变化事件
    Agent->>Agent: 更新记忆/触发规则
    
    Agent->>CAL: 发送控制命令
    CAL->>Gateway: 转发命令
    Gateway->>SDK: 推送命令
    SDK->>Vendor: 回调处理函数
    Vendor-->>SDK: 返回执行结果
    SDK-->>Gateway: 上报结果
```

## To C端 - 用户应用层设计

### 1. 统一终端体验

**多端一致性**：
- **移动APP**：主要控制终端，支持离线操作
- **Web控制台**：高级配置和管理界面
- **语音助手**：自然语言交互，支持本地处理
- **桌面小组件**：快捷控制，一键执行常用场景

### 2. 用户服务数据流

```mermaid
sequenceDiagram
    participant User as 用户
    participant App as 移动APP
    participant Gateway as API网关
    participant Auth as 认证服务
    participant Profile as 用户画像
    participant Scene as 场景服务
    participant Agent as M3-Agent
    participant Device as 智能设备

    %% 用户登录
    User->>App: 登录/生物识别
    App->>Gateway: 认证请求
    Gateway->>Auth: 验证身份
    Auth-->>Gateway: 返回JWT token
    Gateway-->>App: 登录成功
    
    %% 个性化服务
    App->>Gateway: 获取用户首页
    Gateway->>Profile: 查询用户偏好
    Profile->>Agent: 检索用户记忆
    Agent-->>Profile: 返回个性化数据
    Profile-->>Gateway: 推荐场景/设备
    Gateway-->>App: 个性化首页
    
    %% 场景控制
    User->>App: 执行"回家模式"
    App->>Gateway: POST /scenes/execute
    Gateway->>Scene: 解析场景配置
    Scene->>Agent: 执行复合动作
    Agent->>Device: 并发控制多设备
    Device-->>Agent: 返回执行状态
    Agent-->>Scene: 聚合结果
    Scene-->>Gateway: 场景执行完成
    Gateway-->>App: 推送执行结果
    App-->>User: 显示执行状态
    
    %% 主动服务
    Agent->>Profile: 检测用户行为模式
    Profile->>Gateway: 生成主动建议
    Gateway->>App: 推送智能建议
    App->>User: 显示建议通知
```

### 3. 账号层级隔离设计

```mermaid
graph TD
    subgraph "家庭账号体系"
        FAMILY[家庭主账号<br/>Admin权限]
        MEMBER1[家庭成员1<br/>Member权限]
        MEMBER2[家庭成员2<br/>Member权限]
        GUEST[访客账号<br/>Guest权限]
    end
    
    subgraph "权限控制层"
        PERM_ADMIN[管理员权限<br/>所有设备+系统配置]
        PERM_MEMBER[成员权限<br/>个人设备+公共区域]
        PERM_GUEST[访客权限<br/>仅指定设备+时间限制]
    end
    
    subgraph "设备访问层"
        DEVICE_PERSONAL[个人设备<br/>卧室灯光/空调]
        DEVICE_SHARED[共享设备<br/>客厅/厨房设备]
        DEVICE_CRITICAL[关键设备<br/>门锁/安防系统]
    end
    
    subgraph "记忆隔离层"
        MEMORY_FAMILY[家庭共享记忆<br/>公共偏好/例程]
        MEMORY_PERSONAL[个人记忆<br/>个人习惯/隐私数据]
        MEMORY_TEMP[临时记忆<br/>访客使用记录]
    end
    
    FAMILY --> PERM_ADMIN
    MEMBER1 --> PERM_MEMBER
    MEMBER2 --> PERM_MEMBER
    GUEST --> PERM_GUEST
    
    PERM_ADMIN --> DEVICE_PERSONAL
    PERM_ADMIN --> DEVICE_SHARED
    PERM_ADMIN --> DEVICE_CRITICAL
    
    PERM_MEMBER --> DEVICE_PERSONAL
    PERM_MEMBER --> DEVICE_SHARED
    
    PERM_GUEST --> DEVICE_SHARED
    
    PERM_ADMIN --> MEMORY_FAMILY
    PERM_ADMIN --> MEMORY_PERSONAL
    
    PERM_MEMBER --> MEMORY_FAMILY
    PERM_MEMBER --> MEMORY_PERSONAL
    
    PERM_GUEST --> MEMORY_TEMP
```

## 业务价值与问题解决

### To B端解决的问题

1. **技术门槛高**：
   - 问题：硬件厂商需要适配多种智能家居协议
   - 解决：提供统一SDK，一次接入支持所有协议

2. **开发成本高**：
   - 问题：每个平台都需要单独开发适配
   - 解决：标准化接口，减少90%重复开发工作

3. **运维复杂**：
   - 问题：设备状态监控、故障诊断困难
   - 解决：内置监控SDK，自动化运维支持

4. **生态封闭**：
   - 问题：各厂商设备无法互联互通
   - 解决：统一协议抽象，打破生态壁垒

### To C端解决的问题

1. **APP碎片化**：
   - 问题：每个品牌一个APP，用户体验割裂
   - 解决：统一控制入口，一个APP控制所有设备

2. **缺乏智能**：
   - 问题：设备只能被动控制，缺乏主动服务
   - 解决：AI记忆学习，主动提供个性化服务

3. **隐私担忧**：
   - 问题：数据上云，用户担心隐私泄露
   - 解决：本地处理，用户完全掌控数据

4. **配置复杂**：
   - 问题：智能家居配置门槛高，普通用户难以上手
   - 解决：AI自动学习，越用越智能，无需复杂配置

## 技术架构特点

### 1. 微服务架构
- 每个服务独立部署，支持水平扩展
- 服务间通过标准API通信，松耦合设计
- 支持灰度发布，降低升级风险

### 2. 多租户设计
- 物理隔离：不同家庭数据完全隔离
- 逻辑隔离：家庭内部成员权限分级
- 资源隔离：防止单租户影响整体性能

### 3. 事件驱动
- 设备状态变化实时推送
- 用户行为触发智能建议
- 异常情况自动告警处理

### 4. 渐进式增强
- 基础功能本地运行，保证可用性
- 高级功能云端增强，提升体验
- 网络异常时平滑降级

这种设计将现有的M3-Agent基础设施包装成面向不同用户群体的服务，既保持了技术先进性，又提供了商业化的可能性。