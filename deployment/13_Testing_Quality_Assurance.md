# SaaS级测试体系与质量保证

## 🧪 测试金字塔

```
                    /\
                   /  \
                  / E2E \
                 /______\
                /        \
               /Integration\
              /____________\
             /              \
            /    Unit       \
           /________________\
```

### 测试层级分布
```yaml
单元测试 (70%):
  覆盖率要求: >90%
  执行时间: <1分钟
  测试内容:
    - 业务逻辑
    - 工具函数
    - 数据模型

集成测试 (20%):
  覆盖率要求: >80%
  执行时间: <5分钟
  测试内容:
    - API端点
    - 数据库操作
    - 外部服务集成

E2E测试 (10%):
  覆盖率要求: 核心流程
  执行时间: <30分钟
  测试内容:
    - 完整用户流程
    - 多租户场景
    - 性能测试
```

## 🔧 单元测试

### 内存模块测试
```python
# tests/unit/test_memory_service.py
import pytest
from unittest.mock import Mock, AsyncMock
from modules.memory.services.memory_service import MemoryService
from modules.memory.contracts.memory_models import MemoryCreateRequest

class TestMemoryService:
    @pytest.fixture
    def memory_service(self):
        return MemoryService(
            neo4j_store=Mock(),
            qdrant_store=Mock(),
            audit_store=Mock()
        )

    @pytest.mark.asyncio
    async def test_store_memory_success(self, memory_service):
        # Arrange
        request = MemoryCreateRequest(
            content="测试记忆",
            domain="test_domain",
            metadata={"type": "test"}
        )

        # Act
        result = await memory_service.store(request, tenant_id="tenant_123")

        # Assert
        assert result.id is not None
        assert result.content == "测试记忆"
        assert result.tenant_id == "tenant_123"

        # 验证调用
        memory_service.neo4j_store.store.assert_called_once()
        memory_service.qdrant_store.upsert.assert_called_once()
        memory_service.audit_store.log_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_search_memory_with_filter(self, memory_service):
        # Arrange
        query = "AI相关"
        filters = {"domain": "tech"}
        memory_service.qdrant_store.search = AsyncMock(return_value=[
            Memory(id="1", content="AI发展", score=0.9),
            Memory(id="2", content="机器学习", score=0.85)
        ])

        # Act
        results = await memory_service.search(
            query=query,
            filters=filters,
            tenant_id="tenant_123"
        )

        # Assert
        assert len(results) == 2
        assert results[0].score > results[1].score
        memory_service.qdrant_store.search.assert_called_once()

    def test_tenant_isolation(self, memory_service):
        # 验证不同租户数据不会混淆
        memory1 = Memory(content="租户A数据", tenant_id="tenant_a")
        memory2 = Memory(content="租户B数据", tenant_id="tenant_b")

        assert memory1.tenant_id != memory2.tenant_id
```

### 业务逻辑测试
```python
# tests/unit/test_business_logic.py
import pytest
from modules.memory.services.memory_service import MemoryService

class TestMemoryBusinessLogic:
    @pytest.mark.parametrize("content,expected", [
        ("", False),  # 空内容
        ("a" * 10000, True),  # 超长内容
        ("正常内容", True),  # 正常内容
    ])
    async def test_memory_validation(self, content, expected):
        service = MemoryService(...)
        try:
            result = await service.store(
                content=content,
                tenant_id="tenant_123"
            )
            assert expected
        except ValidationError:
            assert not expected

    async def test_memory_deduplication(self):
        """测试记忆去重"""
        service = MemoryService(...)
        content = "相同的记忆内容"

        # 第一次存储
        memory1 = await service.store(content, "tenant_123")

        # 相同内容再次存储
        memory2 = await service.store(content, "tenant_123")

        # 验证是否去重
        assert memory1.id == memory2.id  # 应该返回相同记忆
```

## 🔗 集成测试

### API集成测试
```python
# tests/integration/test_api.py
import pytest
from fastapi.testclient import TestClient
from demo.backend.app import app

class TestAPIIntegration:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.fixture
    def auth_headers(self):
        # 获取测试租户的JWT Token
        return {"Authorization": "Bearer test_token_123"}

    def test_health_check(self, client):
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_create_memory(self, client, auth_headers):
        response = client.post(
            "/api/fast-chat",
            json={
                "message": "测试记忆",
                "memory_domain": "test_domain"
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        assert "result" in response.json()

    def test_memory_search(self, client, auth_headers):
        # 先创建记忆
        client.post(
            "/api/fast-chat",
            json={"message": "关于AI的记忆"},
            headers=auth_headers
        )

        # 搜索记忆
        response = client.post(
            "/api/memory/search",
            json={"query": "AI"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "results" in data

    def test_tenant_isolation(self, client):
        """测试租户隔离"""
        # 租户A创建记忆
        headers_a = {"Authorization": "Bearer token_a"}
        client.post("/api/fast-chat", json={"message": "私有数据A"}, headers=headers_a)

        # 租户B访问
        headers_b = {"Authorization": "Bearer token_b"}
        response = client.get("/api/memory", headers=headers_b)

        # 租户B不应该看到租户A的数据
        assert response.status_code == 200
        data = response.json()
        assert len([r for r in data if "私有数据A" in r["content"]]) == 0
```

### 数据库集成测试
```python
# tests/integration/test_database.py
import pytest
from neo4j import GraphDatabase
from testcontainers.neo4j import Neo4jContainer

class TestDatabaseIntegration:
    @pytest.fixture(scope="session")
    def neo4j_container(self):
        with Neo4jContainer("neo4j:5.0") as container:
            yield container

    @pytest.fixture
    def neo4j_driver(self, neo4j_container):
        driver = GraphDatabase.driver(
            neo4j_container.get_connection_url(),
            auth=("neo4j", "password")
        )
        yield driver
        driver.close()

    @pytest.mark.asyncio
    async def test_memory_storage_integration(self, neo4j_driver):
        # 清理测试数据
        async with neo4j_driver.session() as session:
            await session.run("MATCH (n) DELETE n")

            # 存储记忆
            await session.run(
                "CREATE (m:Memory {id: $id, content: $content, tenant_id: $tenant_id})",
                id="mem_001",
                content="测试数据",
                tenant_id="tenant_123"
            )

            # 验证存储
            result = await session.run(
                "MATCH (m:Memory {tenant_id: $tenant_id}) RETURN m",
                tenant_id="tenant_123"
            )
            record = await result.single()

            assert record is not None
            assert record["m"]["content"] == "测试数据"
```

## 🌍 E2E测试

### Playwright E2E测试
```typescript
// e2e/tenant-workflow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('租户工作流', () => {
  test('用户可以注册并使用服务', async ({ page }) => {
    // 1. 注册租户
    await page.goto('/register');
    await page.fill('[data-testid=email]', 'test@example.com');
    await page.fill('[data-testid=password]', 'SecurePass123!');
    await page.click('[data-testid=register-btn]');

    // 2. 验证注册成功
    await expect(page.locator('[data-testid=success-message]'))
      .toBeVisible();

    // 3. 登录
    await page.click('[data-testid=login-link]');
    await page.fill('[data-testid=email]', 'test@example.com');
    await page.fill('[data-testid=password]', 'SecurePass123!');
    await page.click('[data-testid=login-btn]');

    // 4. 创建记忆域
    await page.click('[data-testid=create-domain]');
    await page.fill('[data-testid=domain-name]', '我的工作域');
    await page.click('[data-testid=save-domain]');

    // 5. 验证域创建成功
    await expect(page.locator('text=我的工作域'))
      .toBeVisible();

    // 6. 存储记忆
    await page.fill('[data-testid=memory-content]', '今天学到了新知识');
    await page.selectOption('[data-testid=domain-select]', '我的工作域');
    await page.click('[data-testid=save-memory]');

    // 7. 搜索记忆
    await page.fill('[data-testid=search-query]', '新知识');
    await page.click('[data-testid=search-btn]');

    // 8. 验证搜索结果
    await expect(page.locator('[data-testid=memory-item]'))
      .toContainText('今天学到了新知识');
  });

  test('多租户数据隔离', async ({ page }) => {
    // 创建两个租户
    const tenantA = await createTestTenant('tenant_a@test.com');
    const tenantB = await createTestTenant('tenant_b@test.com');

    // 租户A存储数据
    await page.goto('/dashboard', { headers: tenantA.headers });
    await page.fill('[data-testid=memory-content]', '租户A的私有数据');
    await page.click('[data-testid=save-memory]');

    // 租户B登录，验证看不到A的数据
    await page.goto('/dashboard', { headers: tenantB.headers });
    const memories = await page.locator('[data-testid=memory-item]').all();
    const hasPrivateData = await Promise.all(
      memories.map(m => m.textContent())
    );

    expect(hasPrivateData).not.toContain('租户A的私有数据');
  });
});
```

## ⚡ 性能测试

### Locust负载测试
```python
# tests/performance/test_api_load.py
from locust import HttpUser, task, between

class MoyanAPIUser(HttpUser):
    wait_time = between(1, 3)
    weight = 3
    host = "https://api.moyan.ai"

    def on_start(self):
        """用户开始时执行 - 获取token"""
        response = self.client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "test123"
        })
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def search_memory(self):
        """搜索记忆 - 3倍权重"""
        self.client.post("/api/v1/memory/search", json={
            "query": "测试查询",
            "limit": 10
        }, headers=self.headers)

    @task(1)
    def process_video(self):
        """处理视频 - 1倍权重"""
        self.client.post("/api/v1/video/process", json={
            "video_url": "https://example.com/video.mp4"
        }, headers=self.headers)

    @task(2)
    def fast_chat(self):
        """快速聊天 - 2倍权重"""
        self.client.post("/api/fast-chat", json={
            "message": "你好，MOYAN"
        }, headers=self.headers)

class MoyanAPISmokeTest(HttpUser):
    """冒烟测试 - 检查关键路径"""
    wait_time = between(0.1, 0.5)
    weight = 1

    def on_start(self):
        response = self.client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "test123"
        })
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task
    def health_check(self):
        """健康检查"""
        self.client.get("/api/health")

# 运行命令:
# locust -f tests/performance/test_api_load.py --headless -u 100 -r 10 -t 300s
```

### 性能测试场景
```yaml
测试场景:
  正常负载:
    用户数: 100
    持续时间: 10分钟
    目标: P95延迟 < 500ms

  峰值负载:
    用户数: 1000
    持续时间: 5分钟
    目标: P99延迟 < 1000ms

  压力测试:
    用户数: 5000
    持续时间: 2分钟
    目标: 找到系统极限

  容量测试:
    用户数: 500
    持续时间: 1小时
    目标: 验证稳定性

  故障恢复:
    模拟: 关闭50%服务器
    目标: 服务不中断
    验证: 自动故障转移
```

## 🧪 测试工具链

### pytest配置
```ini
# pytest.ini
[tool:pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts =
    -v
    --tb=short
    --strict-markers
    --cov=modules
    --cov-report=term-missing
    --cov-report=html:htmlcov
    --cov-fail-under=85
markers =
    unit: Unit tests
    integration: Integration tests
    e2e: End-to-end tests
    performance: Performance tests
    slow: Slow running tests
    gpu: Tests requiring GPU
asyncio_mode = auto
filterwarnings =
    ignore::UserWarning
    ignore::DeprecationWarning
```

### 测试数据管理
```python
# tests/conftest.py
import pytest
from faker import Faker
from factories import UserFactory, MemoryFactory, TenantFactory

fake = Faker()

@pytest.fixture
def test_tenant():
    """创建测试租户"""
    return TenantFactory(
        id="test_tenant_123",
        name="测试租户",
        plan="pro"
    )

@pytest.fixture
def test_user(test_tenant):
    """创建测试用户"""
    return UserFactory(
        email="test@example.com",
        tenant_id=test_tenant.id,
        role="developer"
    )

@pytest.fixture
def test_memories(test_tenant):
    """创建测试记忆数据"""
    return [
        MemoryFactory(
            content=fake.sentence(),
            domain="test_domain",
            tenant_id=test_tenant.id
        )
        for _ in range(10)
    ]
```

## 📊 测试报告

### 覆盖率报告
```bash
# 生成覆盖率报告
pytest --cov=modules --cov-report=html --cov-report=term

# 查看覆盖率
open htmlcov/index.html

# 最低覆盖率要求
--cov-fail-under=85
```

### 测试指标
```yaml
质量门槛:
  代码覆盖率: >85%
  测试通过率: 100%
  性能回归: <5%
  安全扫描: 0个高危漏洞

持续集成检查:
  所有单元测试通过
  所有集成测试通过
  E2E测试通过
  性能测试达标
  安全扫描通过
```

## ✅ 实施清单
- [ ] 配置pytest
- [ ] 编写单元测试 (>90%覆盖)
- [ ] 编写集成测试
- [ ] 配置E2E测试 (Playwright)
- [ ] 配置性能测试 (Locust)
- [ ] 自动化测试流水线
- [ ] 测试数据工厂
- [ ] Mock外部依赖
- [ ] 测试报告生成
- [ ] 覆盖率跟踪
- [ ] 性能基准
- [ ] 定期回归测试
