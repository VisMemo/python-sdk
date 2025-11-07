# 数据库云化改造

## 🎯 云化策略

### 评估结果
**当前数据库**：
- Neo4j (图数据库) - 记忆系统
- Qdrant (向量数据库) - 相似度搜索
- In-Memory (临时数据) - 缓存

**云化目标**：
- 高可用 (99.9%+ SLA)
- 自动备份与恢复
- 弹性伸缩
- 降低运维成本

## 🗃️ Neo4j云化

### AWS Neptune vs 托管Neo4j vs 自建
| 特性 | AWS Neptune | 托管Neo4j | 自建Aurora/自管 |
|------|-------------|-----------|------------------|
| **成本** | 中 | 高 | 中-高 |
| **性能** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **易用性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **多租户** | 需自建 | 原生支持 | 需自建 |
| **迁移难度** | 中 | 低 | 高 |

**推荐方案：自建Neo4j集群**
- 成本可控
- 完全控制
- 支持多租户

### Neo4j集群架构
```
┌─────────────────────────────────────────┐
│              负载均衡器 (NLB)            │
│           (TCP 7687)                    │
└─────────────┬───────────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───▼────┐        ┌────▼────┐
│ Core 1 │        │ Core 2 │
└────┬───┘        └────┬────┘
     │                 │
┌────▼────┐        ┌───▼─────┐
│ Read 1  │        │ Read 2  │
└─────────┘        └────────┘

架构说明:
- 3个Core节点 (仲裁)
- 2个只读副本 (读扩展)
- 跨可用区部署
- 自动故障转移
```

### Terraform配置
```hcl
# neo4j-cluster.tf

# Neo4j Core节点 (us-east-1a)
resource "aws_instance" "neo4j_core_1" {
  ami           = data.aws_ami.neo4j.id
  instance_type = "r5.2xlarge"
  key_name      = aws_key_pair.deploy.key_name
  subnet_id     = aws_subnet.private_1a.id

  root_block_device {
    volume_type = "gp3"
    volume_size = 500
    encrypted   = true
  }

  user_data = <<-EOF
    #!/bin/bash
    sudo tee /etc/neo4j/neo4j.conf > /dev/null <<EOL
    dbms.mode=CORE
    dbms.cluster.discovery.proposed_initial_discovery_members=10.0.1.10:5000,10.0.2.10:5000,10.0.3.10:5000
    dbms.cluster.minimum_core_cluster_size_at_formation=3
    dbms.cluster.minimum_core_cluster_size_at_runtime=3
    dbms.connector.bolt.listen_address=0.0.0.0:7687
    dbms.connector.http.listen_address=0.0.0.0:7474
    dbms.connector.https.listen_address=0.0.0.0:7493
    dbms.memory.heap.initial_size=8g
    dbms.memory.heap.max_size=8g
    dbms.memory.pagecache.size=12g
    EOL
    sudo systemctl restart neo4j
  EOF

  tags = {
    Name = "neo4j-core-1"
    Role = "neo4j-core"
  }
}

# Neo4j只读副本
resource "aws_instance" "neo4j_read_1" {
  count         = 2
  ami           = data.aws_ami.neo4j.id
  instance_type = "r5.xlarge"
  key_name      = aws_key_pair.deploy.key_name
  subnet_id     = aws_subnet.private_1b.id

  user_data = <<-EOF
    #!/bin/bash
    sudo tee /etc/neo4j/neo4j.conf > /dev/null <<EOL
    dbms.mode=READ_REPLICA
    dbms.cluster.discovery.proposed_initial_discovery_members=10.0.1.10:5000,10.0.2.10:5000,10.0.3.10:5000
    dbms.connector.bolt.listen_address=0.0.0.0:7687
    dbms.connector.http.listen_address=0.0.0.0:7474
    dbms.memory.heap.initial_size=4g
    dbms.memory.heap.max_size=4g
    dbms.memory.pagecache.size=6g
    EOL
    sudo systemctl restart neo4j
  EOF

  tags = {
    Name = "neo4j-read-${count.index + 1}"
    Role = "neo4j-replica"
  }
}
```

### 多租户实现
```python
# 数据库连接管理
class Neo4jTenantManager:
    def __init__(self, cluster_endpoints: List[str]):
        self.endpoints = cluster_endpoints
        self.driver_pool: Dict[str, "GraphDatabase.driver"] = {}

    async def get_tenant_driver(self, tenant_id: str):
        """获取租户专用连接"""
        if tenant_id not in self.driver_pool:
            driver = GraphDatabase.driver(
                self.endpoints[0],  # 使用主节点
                auth=("neo4j", os.getenv("NEO4J_PASSWORD")),
                max_connection_pool_size=50
            )
            self.driver_pool[tenant_id] = driver

        return self.driver_pool[tenant_id]

    async def execute_query(self, tenant_id: str, query: str, params: dict):
        """执行租户查询（自动添加过滤）"""
        driver = await self.get_tenant_driver(tenant_id)

        # 确保查询包含租户过滤
        if "tenant_id" not in query and "MATCH" in query.upper():
            # 简单检查，更好的方法是使用查询解析器
            query = query.replace(
                "MATCH (",
                f"MATCH (n {{tenant_id: '{tenant_id}'"
            )

        async with driver.session() as session:
            result = await session.run(query, **params)
            return await result.data()

# 使用示例
class MemoryService:
    def __init__(self, db_manager: Neo4jTenantManager):
        self.db = db_manager

    async def search_memory(self, query: str, tenant_id: str):
        cypher = """
            MATCH (m:Memory)
            WHERE m.content CONTAINS $query
            RETURN m
            ORDER BY m.created_at DESC
            LIMIT 10
        """
        return await self.db.execute_query(tenant_id, cypher, {"query": query})
```

## 🔍 Qdrant云化

### 云托管服务
**选择Qdrant Cloud**
- ✅ 官方托管服务
- ✅ 自动伸缩
- ✅ 内置监控
- ❌ 成本较高

### 自建Qdrant集群
```yaml
# docker-compose.qdrant.yml
version: '3.8'

services:
  qdrant-1:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data_1:/qdrant/storage
    environment:
      - QDRANT__SERVICE__HTTP_PORT=6333
      - QDRANT__SERVICE__GRPC_PORT=6334
      - QDRANT__CLUSTER__ENABLED=true
      - QDRANT__CLUSTER__NODE_ID=0
      - QDRANT__CLUSTER__INITIAL_NODES=qdrant-1:6335,qdrant-2:6335,qdrant-3:6335
    networks:
      - qdrant_net

  qdrant-2:
    image: qdrant/qdrant:latest
    ports:
      - "6335:6333"
      - "6336:6334"
    volumes:
      - qdrant_data_2:/qdrant/storage
    environment:
      - QDRANT__SERVICE__HTTP_PORT=6333
      - QDRANT__SERVICE__GRPC_PORT=6334
      - QDRANT__CLUSTER__ENABLED=true
      - QDRANT__CLUSTER__NODE_ID=1
      - QDRANT__CLUSTER__INITIAL_NODES=qdrant-1:6335,qdrant-2:6335,qdrant-3:6335
    networks:
      - qdrant_net

  qdrant-3:
    image: qdrant/qdrant:latest
    ports:
      - "6337:6333"
      - "6338:6334"
    volumes:
      - qdrant_data_3:/qdrant/storage
    environment:
      - QDRANT__SERVICE__HTTP_PORT=6333
      - QDRANT__SERVICE__GRPC_PORT=6334
      - QDRANT__CLUSTER__ENABLED=true
      - QDRANT__CLUSTER__NODE_ID=2
      - QDRANT__CLUSTER__INITIAL_NODES=qdrant-1:6335,qdrant-2:6335,qdrant-3:6335
    networks:
      - qdrant_net

volumes:
  qdrant_data_1:
  qdrant_data_2:
  qdrant_data_3:

networks:
  qdrant_net:
    driver: bridge
```

### 多租户Collection设计
```python
class QdrantMultiTenant:
    def __init__(self, host: str, port: int = 6333):
        self.client = QdrantClient(host=host, port=port)

    def create_tenant_collection(self, tenant_id: str, collection_name: str):
        """为租户创建专属Collection"""
        full_name = f"{tenant_id}_{collection_name}"

        self.client.create_collection(
            collection_name=full_name,
            vectors_config=VectorParams(
                size=768,  # 向量维度
                distance=Distance.COSINE
            ),
            optimizers_config=OptimizersConfig(
                default_segment_number=2,
                max_segment_size=100000,  # 10万向量
            ),
            replication_factor=2,  # 2份副本
            consistency=1  # 写一致性
        )

        return full_name

    def store_vector(self, tenant_id: str, collection_name: str,
                    vector_id: str, vector: List[float],
                    payload: dict):
        """存储向量（自动添加租户ID）"""
        full_name = f"{tenant_id}_{collection_name}"

        payload_with_tenant = {
            **payload,
            "tenant_id": tenant_id
        }

        self.client.upsert(
            collection_name=full_name,
            points=[PointStruct(
                id=vector_id,
                vector=vector,
                payload=payload_with_tenant
            )]
        )

    def search_vector(self, tenant_id: str, collection_name: str,
                     query_vector: List[float], limit: int = 10):
        """搜索向量（仅限当前租户）"""
        full_name = f"{tenant_id}_{collection_name}"

        return self.client.search(
            collection_name=full_name,
            query_vector=query_vector,
            limit=limit,
            query_filter=Filter(
                must=[FieldCondition(
                    key="tenant_id",
                    match=MatchValue(value=tenant_id)
                )]
            )
        )
```

## 💾 数据迁移

### 迁移策略
```python
# 数据迁移工具
class DatabaseMigration:
    def __init__(self, source_neo4j, target_neo4j, source_qdrant, target_qdrant):
        self.source_neo4j = source_neo4j
        self.target_neo4j = target_neo4j
        self.source_qdrant = source_qdrant
        self.target_qdrant = target_qdrant

    async def migrate_tenant(self, tenant_id: str):
        """迁移单个租户数据"""
        print(f"开始迁移租户: {tenant_id}")

        # 1. 迁移Neo4j数据
        print("迁移Neo4j数据...")
        await self.migrate_neo4j_tenant(tenant_id)

        # 2. 迁移Qdrant数据
        print("迁移Qdrant数据...")
        await self.migrate_qdrant_tenant(tenant_id)

        # 3. 验证迁移
        print("验证迁移...")
        await self.verify_migration(tenant_id)

        print(f"租户 {tenant_id} 迁移完成")

    async def migrate_neo4j_tenant(self, tenant_id: str):
        """从源Neo4j读取并写入目标"""
        async with self.source_neo4j.session() as session:
            # 读取所有记忆
            result = await session.run(
                "MATCH (m:Memory {tenant_id: $tenant_id}) RETURN m",
                tenant_id=tenant_id
            )
            memories = await result.data()

        # 写入目标
        async with self.target_neo4j.session() as session:
            for memory in memories:
                await session.run(
                    "CREATE (m:Memory $props)",
                    props=memory["m"]
                )

    async def migrate_qdrant_tenant(self, tenant_id: str):
        """迁移Qdrant Collection"""
        # 列出租户的所有Collection
        source_collections = await self.source_qdrant.get_collections()
        tenant_collections = [c.name for c in source_collections.collections
                            if c.name.startswith(tenant_id)]

        for collection_name in tenant_collections:
            # 创建新Collection
            self.target_qdrant.create_tenant_collection(tenant_id, collection_name)

            # 迁移向量数据
            points = self.source_qdrant.scroll(collection_name)[0]
            if points:
                self.target_qdrant.client.upsert(
                    collection_name=f"{tenant_id}_{collection_name}",
                    points=points
                )
```

### 零停机迁移
```python
class ZeroDowntimeMigration:
    def __init__(self):
        self.migration_status = {}

    async def start_migration(self):
        """启动迁移"""
        # 1. 同步复制（新旧同时写）
        await self.enable_replication()

        # 2. 数据迁移
        tenants = await self.get_all_tenants()
        for tenant_id in tenants:
            await self.migrate_tenant_async(tenant_id)

        # 3. 等待同步完成
        await self.wait_for_sync()

        # 4. 切换读写
        await self.switch_to_cloud()

    async def enable_replication(self):
        """启用双写模式"""
        # 写入中间件，同时写入新旧数据库
        self.write_proxy = DualWriteProxy(
            source_db=self.local_db,
            target_db=self.cloud_db
        )

    async def wait_for_sync(self):
        """等待数据同步"""
        while True:
            lag = await self.check_data_lag()
            if lag < 100:  # 差距小于100条记录
                break
            await asyncio.sleep(10)
```

## 🔄 备份与恢复

### 自动备份
```bash
#!/bin/bash
# backup-neo4j.sh

# Neo4j备份
neo4j-admin database backup \
    --database=neo4j \
    --backup-dir=/backups/$(date +%Y-%m-%d) \
    --check-consistency=true

# 上传到S3
aws s3 sync /backups/ s3://moyan-backups/neo4j/ \
    --storage-class STANDARD_IA

# 清理本地备份（保留7天）
find /backups -type d -mtime +7 -exec rm -rf {} \;
```

### 恢复流程
```python
class DisasterRecovery:
    def __init__(self):
        self.s3_client = boto3.client('s3')

    async def restore_tenant(self, tenant_id: str, timestamp: str):
        """恢复租户数据"""
        backup_date = timestamp.split('T')[0]

        # 1. 从S3下载备份
        backup_path = await self.download_backup(tenant_id, backup_date)

        # 2. 停止应用
        await self.stop_application()

        # 3. 恢复数据库
        await self.restore_neo4j(backup_path, tenant_id)
        await self.restore_qdrant(backup_path, tenant_id)

        # 4. 启动应用
        await self.start_application()

        # 5. 验证恢复
        await self.verify_restore(tenant_id)

    async def verify_restore(self, tenant_id: str):
        """验证恢复结果"""
        # 验证数据一致性
        memory_count = await self.count_memories(tenant_id)
        if memory_count == 0:
            raise Exception("恢复失败：没有数据")

        # 验证连接
        test_result = await self.test_api_call(tenant_id)
        if not test_result:
            raise Exception("恢复失败：API不可用")
```

## 📊 性能优化

### 读写分离
```python
class DatabaseRouter:
    def __init__(self):
        self.read_replicas = [
            "neo4j-read-1:7687",
            "neo4j-read-2:7687"
        ]
        self.write_master = "neo4j-core-1:7687"
        self.read_index = 0

    def get_read_endpoint(self):
        """轮询获取读副本"""
        endpoint = self.read_replicas[self.read_index]
        self.read_index = (self.read_index + 1) % len(self.read_replicas)
        return endpoint

    async def execute_query(self, query_type: str, tenant_id: str, **kwargs):
        """根据查询类型路由"""
        if query_type == "write":
            # 写入操作走主库
            return await self.execute_on_endpoint(
                self.write_master, query, **kwargs
            )
        else:
            # 读取操作走副本
            endpoint = self.get_read_endpoint()
            return await self.execute_on_endpoint(
                endpoint, query, **kwargs
            )
```

### 缓存策略
```python
# Redis缓存配置
class CacheManager:
    def __init__(self, redis_client):
        self.redis = redis_client
        self.default_ttl = 3600  # 1小时

    async def cache_memory_search(self, tenant_id: str, query: str, result):
        """缓存搜索结果"""
        cache_key = f"search:{tenant_id}:{hash(query)}"
        await self.redis.setex(
            cache_key,
            self.default_ttl,
            json.dumps(result)
        )

    async def get_cached_result(self, tenant_id: str, query: str):
        """获取缓存结果"""
        cache_key = f"search:{tenant_id}:{hash(query)}"
        cached = await self.redis.get(cache_key)
        if cached:
            return json.loads(cached)
        return None

    async def invalidate_cache(self, tenant_id: str):
        """失效租户缓存"""
        pattern = f"search:{tenant_id}:*"
        await self.redis.delete(*await self.redis.keys(pattern))
```

## ✅ 实施清单
- [ ] 部署Neo4j集群
- [ ] 部署Qdrant集群
- [ ] 配置多租户隔离
- [ ] 实施数据迁移工具
- [ ] 测试零停机迁移
- [ ] 配置自动备份
- [ ] 实施灾难恢复流程
- [ ] 性能测试与调优
- [ ] 监控告警配置
- [ ] 运维文档编写
- [ ] 成本优化
- [ ] 应急预案演练
