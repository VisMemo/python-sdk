# 开发者平台与API文档

## 📚 技术文档体系

### 文档结构
```
docs/
├── getting-started/
│   ├── quickstart.md
│   ├── authentication.md
│   ├── first-api-call.md
│   └── sdk-installation.md
├── api/
│   ├── openapi.yaml
│   ├── endpoints/
│   │   ├── memory/
│   │   ├── video/
│   │   └── agent/
│   ├── examples/
│   └── errors.md
├── guides/
│   ├── multi-tenancy.md
│   ├── rate-limits.md
│   ├── webhooks.md
│   └── best-practices.md
├── sdks/
│   ├── python/
│   ├── nodejs/
│   └── go/
├── tutorials/
│   ├── video-processing.md
│   └── memory-search.md
└── changelog/
    ├── v1.0.md
    └── v1.1.md
```

## 🔗 API文档平台

### Swagger UI集成
```python
# FastAPI文档配置
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title="MOYAN Agent API",
        version="1.0.0",
        description="AI Agent基础设施SaaS API",
        routes=app.routes,
    )

    # 添加认证信息
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
    }

    # 标记需要认证的端点
    for path in openapi_schema["paths"]:
        for method in openapi_schema["paths"][path]:
            openapi_schema["paths"][path][method]["security"] = [{"BearerAuth": []}]

    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi
```

### Redoc替代方案
```typescript
// 使用Redoc渲染API文档
import 'https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto+Mono';

const specUrl = 'https://api.moyan.ai/openapi.json';

<Redoc
  spec={specUrl}
  options={{
    nativeScrollbars: true,
    theme: {
      colors: {
        primary: {
          main: '#1890ff'
        }
      },
      sidebar: {
        backgroundColor: '#001529'
      }
    },
    hideDownloadButton: false,
    expandResponses: "200,201",
    requiredPropsFirst: true
  }}
/>
```

## 💻 SDK开发

### Python SDK
```python
# moyan_agent/__init__.py
from .client import MoyanClient
from .memory import MemoryAPI
from .video import VideoAPI

__version__ = "1.0.0"
__all__ = ["MoyanClient"]

# moyan_agent/client.py
class MoyanClient:
    def __init__(self, api_key: str, base_url: str = "https://api.moyan.ai"):
        self.api_key = api_key
        self.session = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=30.0
        )
        self.memory = MemoryAPI(self.session)
        self.video = VideoAPI(self.session)

    def close(self):
        self.session.close()

# 使用示例
from moyan_agent import MoyanClient

client = MoyanClient(api_key="your_api_key")

# 搜索记忆
results = client.memory.search(
    query="关于AI的讨论",
    tenant_id="tenant_123",
    limit=10
)

# 处理视频
job = client.video.process(
    video_url="https://example.com/video.mp4",
    tenant_id="tenant_123"
)
```

### Node.js SDK
```typescript
// src/index.ts
import axios, { AxiosInstance } from 'axios';

export class MoyanClient {
  private http: AxiosInstance;

  constructor(
    private apiKey: string,
    private baseUrl: string = 'https://api.moyan.ai'
  ) {
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  async searchMemory(params: SearchParams): Promise<SearchResult> {
    const response = await this.http.post('/api/v1/memory/search', params);
    return response.data;
  }

  async processVideo(params: VideoParams): Promise<JobResult> {
    const response = await this.http.post('/api/v1/video/process', params);
    return response.data;
  }
}

// 使用示例
const client = new MoyanClient('your_api_key');

const results = await client.searchMemory({
  query: 'AI discussion',
  tenantId: 'tenant_123',
  limit: 10
});
```

## 📖 交互式教程

### CodeSandbox集成
```markdown
## 快速开始

#### 1. 搜索记忆
<iframe
  src="https://codesandbox.io/embed/moyan-memory-search?fontsize=14&hidenavigation=1&theme=dark"
  style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;"
  title="MOYAN Memory Search"
  allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
  sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
/>

#### 2. 处理视频
<iframe
  src="https://codesandbox.io/embed/moyan-video-process?fontsize=14&hidenavigation=1&theme=dark"
  style="width:100%; height:500px; border:0; border-radius: 4px; overflow:hidden;"
  title="MOYAN Video Processing"
  allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking"
  sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
/>
```

### 逐步引导
```markdown
## 教程：构建你的第一个AI Agent

### 步骤1：认证
```python
from moyan_agent import MoyanClient

# 初始化客户端
client = MoyanClient(api_key="your_api_key")
```

### 步骤2：创建记忆域
```python
# 为你的应用创建专属记忆域
domain = "my_app_user_sessions"
```

### 步骤3：存储记忆
```python
# 存储用户对话记忆
memory = client.memory.store(
    content="用户询问了关于产品价格的问题",
    domain=domain,
    metadata={"type": "user_query", "product": "premium_plan"}
)
```

### 步骤4：搜索记忆
```python
# 搜索相关记忆
results = client.memory.search(
    query="价格相关问题",
    domain=domain,
    limit=5
)
```
```

## 🧪 API测试套件

### Postman Collection
```json
{
  "info": {
    "name": "MOYAN Agent API",
    "description": "Complete API test suite",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "https://api.moyan.ai"
    },
    {
      "key": "apiKey",
      "value": "{{$apiKey}}"
    },
    {
      "key": "tenantId",
      "value": "test_tenant"
    }
  ],
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{apiKey}}"
      }
    ]
  },
  "item": [
    {
      "name": "Memory API",
      "item": [
        {
          "name": "Store Memory",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "X-Tenant-ID",
                "value": "{{tenantId}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"content\": \"Test memory\",\n  \"domain\": \"test_domain\"\n}"
            },
            "url": "{{baseUrl}}/api/v1/memory/store"
          }
        }
      ]
    }
  ]
}
```

### 自动化测试
```bash
# 使用newman运行Postman测试
newman run moyan-api.postman_collection.json \
  --environment env.json \
  --reporters cli,html \
  --reporter-html-export report.html
```

## 🔔 Webhook集成

### Webhook配置
```typescript
class WebhookService {
  async configureWebhook(tenantId: string, config: WebhookConfig) {
    // 验证回调URL
    await this.validateCallbackUrl(config.callbackUrl);

    // 创建webhook
    const webhook = await this.createWebhook({
      tenantId,
      url: config.callbackUrl,
      events: config.events,
      secret: this.generateSecret()
    });

    // 发送测试事件
    await this.sendTestEvent(webhook.id);

    return webhook;
  }
}

// Webhook事件示例
{
  "id": "evt_123",
  "type": "job.completed",
  "created": 1234567890,
  "data": {
    "jobId": "job_456",
    "status": "completed",
    "result": {
      "videoUrl": "https://...",
      "thumbnailUrl": "https://..."
    }
  },
  "tenantId": "tenant_abc"
}
```

## 📊 使用分析

### 开发者仪表板
```typescript
// API使用统计
interface APIUsage {
  endpoint: string;
  requests: number;
  successRate: number;
  avgLatency: number;
  errors: {
    code: string;
    count: number;
  }[];
}

const DeveloperDashboard = () => {
  const [usage, setUsage] = useState<APIUsage[]>([]);

  return (
    <div>
      <Card title="API使用概览">
        <Row gutter={16}>
          <Col span={6}>
            <Statistic title="总请求数" value={usage.totalRequests} />
          </Col>
          <Col span={6}>
            <Statistic title="成功率" value={usage.successRate} suffix="%" />
          </Col>
          <Col span={6}>
            <Statistic title="平均延迟" value={usage.avgLatency} suffix="ms" />
          </Col>
        </Row>
      </Card>

      <Card title="端点使用详情" style={{ marginTop: 16 }}>
        <Table dataSource={usage} columns={endpointColumns} />
      </Card>
    </div>
  );
};
```

## 📝 API变更管理

### 版本控制策略
```yaml
版本策略:
  主版本 (v1, v2):
    - 破坏性变更
    - 提前6个月通知
    - 12个月兼容期

  次版本 (v1.1, v1.2):
    - 向后兼容
    - 新功能添加
    - 2周通知

  修订版本 (v1.1.1):
    - Bug修复
    - 无通知
```

### 弃用通知
```typescript
// API响应头
HTTP/1.1 200 OK
Content-Type: application/json
Deprecation: true
Sunset: Fri, 31 Dec 2024 23:59:59 GMT
Link: <https://docs.moyan.ai/migration/v2>; rel="deprecation"

{
  "data": {...},
  "warnings": [
    {
      "type": "deprecation",
      "message": "此端点将在2024-12-31弃用，请迁移至v2",
      "migration_guide": "https://docs.moyan.ai/migration/v2"
    }
  ]
}
```

## ✅ 实施清单
- [ ] 搭建文档站点 (Docusaurus/GitBook)
- [ ] 编写OpenAPI规范
- [ ] 生成Swagger UI
- [ ] 开发Python SDK
- [ ] 开发Node.js SDK
- [ ] 创建Postman集合
- [ ] 编写教程示例
- [ ] 配置Webhook
- [ ] 开发者仪表板
- [ ] 版本管理策略
- [ ] 自动化测试
- [ ] SEO优化
