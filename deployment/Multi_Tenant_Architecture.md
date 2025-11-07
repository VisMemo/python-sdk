# 多租户数据隔离架构

## 🎯 隔离策略选择

### 隔离级别对比

| 隔离级别 | 安全性 | 成本 | 复杂度 | 运维难度 | 适用场景 |
|----------|--------|------|--------|----------|----------|
| **数据库隔离** | ⭐⭐⭐⭐⭐ | 高 | 低 | 低 | 金融/医疗 |
| **Schema隔离** | ⭐⭐⭐⭐ | 中 | 中 | 中 | 企业客户 |
| **行级隔离** | ⭐⭐⭐ | 低 | 高 | 高 | 中小企业 |
| **应用层隔离** | ⭐⭐ | 低 | 高 | 高 | 开发测试 |

**推荐方案：Schema级隔离**
- 平衡安全性与成本
- 运维相对简单
- 数据备份恢复方便

## 🏗️ 数据模型设计

### Neo4j多租户设计
```cypher
// 1. 租户数据库创建
CREATE DATABASE tenant_{tenant_id}_graph;

// 2. 基础节点结构
CREATE CONSTRAINT tenant_id FOR (n:BaseNode) REQUIRE n.tenant_id IS NOT NULL;
CREATE CONSTRAINT id FOR (n:BaseNode) REQUIRE n.id IS UNIQUE;

// 3. 记忆域节点示例
CREATE (m:Memory {
    id: 'mem_001',
    tenant_id: 'tenant_abc',
    domain: 'my_domain',
    content: '...',
    created_at: datetime(),
    metadata: { ... }
});

// 4. 图关系示例
MATCH (m1:Memory {tenant_id: 'tenant_abc', domain: 'd1'})
MATCH (m2:Memory {tenant_id: 'tenant_abc', domain: 'd2'})
CREATE (m1)-[:RELATED {
    tenant_id: 'tenant_abc',
    weight: 0.8,
    type: 'semantic_similarity'
}]->(m2);
```

### Qdrant多租户设计
```python
# Collection命名规则
COLLECTION_TEMPLATE = "{tenant_id}_{resource_type}"

# 实际示例
COLLECTIONS = {
    "tenant_abc_videos": {
        "vector_size": 512,
        "distance": "Cosine",
        "shards": 3,
        "replicas": 2
    },
    "tenant_abc_memories": {
        "vector_size": 768,
        "distance": "Cosine",
        "shards": 2,
        "replicas": 2
    },
    "tenant_xyz_videos": {
        "vector_size": 512,
        "distance": "Cosine",
        "shards": 2,
        "replicas": 1
    }
}

# 租户上下文管理
class TenantContext:
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        self.neo4j_db = f"tenant_{tenant_id}_graph"
        self.qdrant_collections = {
            "videos": f"{tenant_id}_videos",
            "memories": f"{tenant_id}_memories"
        }
```

## 🔐 数据访问控制

### 租户中间件
```python
from fastapi import Request, Depends
from typing import Optional

async def tenant_context(request: Request) -> TenantContext:
    """从JWT中提取租户信息"""
    # 从Authorization header中获取JWT
    token = request.headers.get("Authorization", "").replace("Bearer ", "")

    # 解析JWT获取tenant_id
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    tenant_id = payload.get("tenant_id")

    if not tenant_id:
        raise HTTPException(status_code=401, detail="缺少租户信息")

    return TenantContext(tenant_id)

# 内存服务中的租户过滤
class MemoryService:
    async def search_memory(
        self,
        query: str,
        tenant: TenantContext = Depends(tenant_context),
        limit: int = 10
    ):
        # Neo4j查询自动添加租户过滤
        cypher = """
            MATCH (m:Memory)
            WHERE m.tenant_id = $tenant_id
            AND m.content CONTAINS $query
            RETURN m
            ORDER BY m.created_at DESC
            LIMIT $limit
        """
        result = await self.neo4j.run(
            cypher,
            tenant_id=tenant.tenant_id,
            query=query,
            limit=limit
        )
        return result

    async def store_memory(
        self,
        memory_data: dict,
        tenant: TenantContext = Depends(tenant_context)
    ):
        # 自动注入租户ID
        memory_data["tenant_id"] = tenant.tenant_id
        # 设置租户专用数据库
        await self.neo4j.use_database(tenant.neo4j_db)
        return await self._create_memory(memory_data)
```

### 数据库连接池
```python
class MultiTenantDBPool:
    def __init__(self):
        self.pools: Dict[str, "neo4j.Driver"] = {}

    async def get_connection(self, tenant_id: str):
        """获取租户专用连接"""
        if tenant_id not in self.pools:
            # 为新租户创建连接池
            self.pools[tenant_id] = neo4j.GraphDatabase.driver(
                f"bolt://neo4j-{tenant_id}.cluster.aws.com:7687",
                auth=("neo4j", os.getenv("NEO4J_PASSWORD")),
                max_connection_pool_size=50
            )
        return self.pools[tenant_id]

    async def close_tenant_connection(self, tenant_id: str):
        """关闭租户连接（租户删除时）"""
        if tenant_id in self.pools:
            await self.pools[tenant_id].close()
            del self.pools[tenant_id]
```

## 🗃️ 租户生命周期管理

### 租户创建流程
```python
async def create_tenant(tenant_config: TenantConfig):
    tenant_id = f"tenant_{uuid.uuid4().hex[:8]}"

    # 1. 创建Neo4j数据库
    await create_neo4j_database(tenant_id)

    # 2. 创建Qdrant Collections
    await create_qdrant_collections(tenant_id)

    # 3. 初始化默认数据
    await initialize_tenant_data(tenant_id)

    # 4. 设置配额
    await set_tenant_quota(tenant_id, tenant_config.plan)

    # 5. 发送欢迎邮件
    await send_welcome_email(tenant_config.admin_email)

    return TenantResponse(tenant_id=tenant_id, status="active")

async def create_neo4j_database(tenant_id: str):
    """在Neo4j中创建租户数据库"""
    db_name = f"tenant_{tenant_id}_graph"
    await neo4j_admin.run(f"CREATE DATABASE {db_name}")
    # 初始化数据库schema
    await run_migration(db_name, f"migrations/tenant_{tenant_id}.cypher")
```

### 租户删除流程
```python
async def delete_tenant(tenant_id: str):
    # 1. 软删除（保留30天）
    await soft_delete_tenant(tenant_id)

    # 2. 通知用户
    await send_deletion_warning_email(tenant_id)

    # 3. 30天后硬删除
    await schedule_hard_delete(tenant_id, delay_days=30)

async def hard_delete_tenant(tenant_id: str):
    """永久删除租户数据"""
    # 删除Neo4j数据库
    await neo4j_admin.run(f"DROP DATABASE tenant_{tenant_id}_graph")

    # 删除Qdrant Collections
    await qdrant.delete_collection(f"{tenant_id}_videos")
    await qdrant.delete_collection(f"{tenant_id}_memories")

    # 删除S3数据
    await s3.delete(f"s3://tenant-data/{tenant_id}/")

    # 关闭数据库连接
    await db_pool.close_tenant_connection(tenant_id)

    # 从Redis删除缓存
    await redis.delete(f"quota:{tenant_id}")
    await redis.delete(f"config:{tenant_id}")
```

## 📊 数据备份与恢复

### 备份策略
```python
class TenantBackup:
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        self.backup_prefix = f"backup/tenant_{tenant_id}"

    async def create_full_backup(self):
        """全量备份"""
        backup_id = f"{self.tenant_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        # 1. 备份Neo4j
        await self.backup_neo4j(backup_id)

        # 2. 备份Qdrant
        await self.backup_qdrant(backup_id)

        # 3. 备份对象存储
        await self.backup_s3(backup_id)

        return BackupResponse(backup_id=backup_id, status="completed")

    async def backup_neo4j(self, backup_id: str):
        """Neo4j备份"""
        await neo4j_admin.run(
            f"DUMP DATABASE tenant_{self.tenant_id}_graph "
            f"TO s3://{self.backup_prefix}/neo4j/{backup_id}"
        )

    async def backup_qdrant(self, backup_id: str):
        """Qdrant备份"""
        collections = [f"{self.tenant_id}_videos", f"{self.tenant_id}_memories"]
        for collection in collections:
            await qdrant.create_snapshot(collection)
            snapshot = await qdrant.list_snapshots(collection)
            await self.upload_snapshot_to_s3(snapshot[0], backup_id)

    async def restore_from_backup(self, backup_id: str):
        """从备份恢复"""
        # 1. 停止应用
        await self.stop_application()

        # 2. 恢复数据库
        await self.restore_neo4j(backup_id)
        await self.restore_qdrant(backup_id)

        # 3. 恢复S3数据
        await self.restore_s3(backup_id)

        # 4. 验证数据完整性
        await self.verify_restore(backup_id)

        # 5. 重启应用
        await self.start_application()
```

## 💰 存储成本优化

### 数据生命周期管理
```yaml
数据层级:
  热数据 (0-7天):
    存储: EBS SSD
    备份: 每日3次
    成本: $0.08/GB/月

  温数据 (8-30天):
    存储: S3 Standard-IA
    备份: 每日1次
    成本: $0.0125/GB/月

  冷数据 (31-365天):
    存储: S3 Glacier
    备份: 每周1次
    成本: $0.004/GB/月

  归档数据 (1年+):
    存储: S3 Deep Archive
    备份: 每月1次
    成本: $0.00099/GB/月
```

### 压缩与去重
```python
class DataOptimization:
    @staticmethod
    async def compress_graph_data(tenant_id: str):
        """压缩图数据"""
        # 1. 识别重复节点
        duplicates = await find_duplicate_memories(tenant_id)

        # 2. 合并重复节点
        for dup_group in duplicates:
            await merge_memory_nodes(tenant_id, dup_group)

        # 3. 压缩属性
        await compress_memory_properties(tenant_id)

    @staticmethod
    async def deduplicate_vectors(tenant_id: str):
        """向量去重"""
        threshold = 0.95  # 相似度阈值
        await qdrant.optimize_collection(
            collection_name=f"{tenant_id}_memories",
            optimizers_config={
                "default_segment_number": 2,
                "max_segment_size": null
            }
        )
```

## 🔍 数据隔离验证

### 安全测试用例
```python
async def test_tenant_isolation():
    """测试租户数据隔离"""
    # 创建两个租户
    tenant1 = await create_test_tenant("tenant_001")
    tenant2 = await create_test_tenant("tenant_002")

    # 租户1存储数据
    await memory_service.store_memory(
        tenant_id=tenant1.id,
        data={"content": "private_data_1"}
    )

    # 租户2存储数据
    await memory_service.store_memory(
        tenant_id=tenant2.id,
        data={"content": "private_data_2"}
    )

    # 验证租户1只能访问自己的数据
    tenant1_data = await memory_service.get_all_memories(tenant1.id)
    assert "private_data_1" in tenant1_data
    assert "private_data_2" not in tenant1_data

    # 验证租户2只能访问自己的数据
    tenant2_data = await memory_service.get_all_memories(tenant2.id)
    assert "private_data_2" in tenant2_data
    assert "private_data_1" not in tenant2_data

    print("✅ 租户数据隔离测试通过")
```

## ✅ 实施清单

### Phase 1: 基础隔离
- [ ] 设计租户数据模型
- [ ] 实现租户上下文中间件
- [ ] 改造现有服务支持多租户
- [ ] 单元测试验证

### Phase 2: 隔离验证
- [ ] 安全测试（租户越权）
- [ ] 性能测试（隔离开销）
- [ ] 边界测试（租户删除/恢复）
- [ ] 审计日志验证

### Phase 3: 优化
- [ ] 数据压缩优化
- [ ] 存储成本优化
- [ ] 备份策略实现
- [ ] 监控告警配置

---

**核心理念**：安全、透明、高效。让数据隔离成为默认行为，而非特殊处理。
