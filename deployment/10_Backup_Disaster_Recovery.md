# 备份与灾难恢复

## 🛡️ 备份策略

### 3-2-1备份原则
```
3份数据副本
├── 原始数据
├── 本地备份 (可用区A)
└── 异地备份 (可用区B) + 冷备份 (S3 Glacier)

2种不同介质
├── 块存储 (EBS)
└── 对象存储 (S3)

1份异地备份
├── 跨区域 (us-east-1 → us-west-2)
└── 生命周期管理
```

## 💾 自动化备份

### Neo4j备份
```bash
#!/bin/bash
# backup-neo4j.sh

set -e

BACKUP_DIR="/backups/neo4j/$(date +%Y-%m-%d)"
S3_BUCKET="moyan-backups"
REGION="us-east-1"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份所有租户数据库
TENANTS=$(aws dynamodb scan --table-name moyan-tenants --query 'Items[*].tenant_id.S' --output text)

for TENANT_ID in $TENANTS; do
    echo "备份租户: $TENANT_ID"

    # Neo4j数据库备份
    neo4j-admin database backup \
        --database=tenant_${TENANT_ID}_graph \
        --backup-dir=$BACKUP_DIR \
        --check-consistency=true \
        --pagecache=4g

    # 创建快照
    tar -czf ${BACKUP_DIR}/tenant_${TENANT_ID}.tar.gz \
        ${BACKUP_DIR}/tenant_${TENANT_ID}_graph

    # 上传到S3
    aws s3 cp ${BACKUP_DIR}/tenant_${TENANT_ID}.tar.gz \
        s3://${S3_BUCKET}/neo4j/$(date +%Y-%m-%d)/ \
        --storage-class STANDARD_IA

    # 清理本地文件
    rm -f ${BACKUP_DIR}/tenant_${TENANT_ID}.tar.gz
done

# 清理7天前的本地备份
find /backups -type d -mtime +7 -exec rm -rf {} +

echo "备份完成"
```

### Qdrant备份
```python
# backup_qdrant.py
import asyncio
from qdrant_client import QdrantClient
import boto3
from datetime import datetime

class QdrantBackup:
    def __init__(self, qdrant_url: str, s3_bucket: str):
        self.client = QdrantClient(url=qdrant_url)
        self.s3 = boto3.client('s3')
        self.bucket = s3_bucket

    async def backup_all_collections(self):
        """备份所有Collection"""
        collections = self.client.get_collections()
        date_str = datetime.now().strftime('%Y-%m-%d')

        for collection in collections.collections:
            print(f"备份Collection: {collection.name}")

            # 创建快照
            snapshot_info = self.client.create_snapshot(collection.name)
            snapshot_path = snapshot_info[0].location

            # 下载快照
            local_path = f"/tmp/{collection.name}.snapshot"
            await self.download_snapshot(snapshot_path, local_path)

            # 上传到S3
            s3_key = f"qdrant/{date_str}/{collection.name}.snapshot"
            self.s3.upload_file(
                local_path,
                self.bucket,
                s3_key,
                ExtraArgs={'StorageClass': 'STANDARD_IA'}
            )

            # 清理本地文件
            os.remove(local_path)

        print("所有Collection备份完成")

    async def backup_specific_tenant(self, tenant_id: str):
        """备份特定租户的数据"""
        collections = self.client.get_collections()
        tenant_collections = [c for c in collections.collections
                            if c.name.startswith(tenant_id)]

        for collection in tenant_collections:
            # 只备份该租户的Collections
            await self.backup_collection(collection.name)
```

### S3对象存储备份
```python
# backup_s3.py
import boto3
from botocore.exceptions import ClientError

class S3Backup:
    def __init__(self, source_bucket: str, dest_bucket: str):
        self.source = boto3.client('s3')
        self.dest = boto3.client('s3')
        self.source_bucket = source_bucket
        self.dest_bucket = dest_bucket

    def sync_bucket(self, prefix: str = ""):
        """同步S3存储桶"""
        paginator = self.source.get_paginator('list_objects_v2')

        for page in paginator.paginate(Bucket=self.source_bucket, Prefix=prefix):
            if 'Contents' in page:
                for obj in page['Contents']:
                    source_key = obj['Key']
                    dest_key = f"s3://{self.dest_bucket}/{source_key}"

                    # 检查是否存在
                    try:
                        self.dest.head_object(Bucket=self.dest_bucket, Key=source_key)
                        print(f"跳过 (已存在): {source_key}")
                        continue
                    except ClientError:
                        pass

                    # 复制对象
                    print(f"复制: {source_key}")
                    self.dest.copy({
                        'Bucket': self.source_bucket,
                        'Key': source_key
                    }, self.dest_bucket, source_key)

    def apply_lifecycle_policy(self):
        """应用生命周期策略"""
        policy = {
            "Rules": [
                {
                    "ID": "backup-lifecycle",
                    "Status": "Enabled",
                    "Filter": {"Prefix": ""},
                    "Transitions": [
                        {
                            "Days": 30,
                            "StorageClass": "STANDARD_IA"
                        },
                        {
                            "Days": 90,
                            "StorageClass": "GLACIER"
                        },
                        {
                            "Days": 365,
                            "StorageClass": "DEEP_ARCHIVE"
                        }
                    ],
                    "Expiration": {
                        "Days": 2555  # 7年
                    }
                }
            ]
        }

        self.dest.put_bucket_lifecycle_configuration(
            Bucket=self.dest_bucket,
            LifecycleConfiguration=policy
        )
```

## 🔄 灾难恢复 (DR)

### RTO/RPO目标
```yaml
RTO (恢复时间目标):
  Tier 1 (核心API): 15分钟
  Tier 2 (增值服务): 1小时
  Tier 3 (分析服务): 4小时

RPO (数据丢失目标):
  Tier 1: < 5分钟
  Tier 2: < 15分钟
  Tier 3: < 1小时

可用性目标:
  SLA: 99.9%
  年停机时间: 8.76小时
  月停机时间: 43.2分钟
  周停机时间: 10.1分钟
```

### 故障转移流程
```python
# disaster_recovery.py
import asyncio
import boto3
from datetime import datetime

class DisasterRecovery:
    def __init__(self):
        self.route53 = boto3.client('route53')
        self.ecs = boto3.client('ecs')
        self.rds = boto3.client('rds')
        self.primary_region = 'us-east-1'
        self.secondary_region = 'us-west-2'

    async def detect_failure(self):
        """检测主区域故障"""
        checks = [
            self.check_api_health(),
            self.check_database_health(),
            self.check_storage_health()
        ]

        results = await asyncio.gather(*checks, return_exceptions=True)

        if all(results):
            return False  # 健康

        # 至少一个检查失败
        print("检测到故障，开始灾难恢复流程")
        return True

    async def execute_failover(self):
        """执行故障转移"""
        print("开始故障转移到备用区域...")

        # 1. 激活备用数据库
        await self.activate_standby_db()

        # 2. 启动备用区域服务
        await self.start_secondary_services()

        # 3. 切换DNS
        await self.update_dns_records()

        # 4. 验证服务
        await self.verify_failover()

        print("故障转移完成")

    async def activate_standby_db(self):
        """激活备用数据库"""
        print("激活备用数据库...")

        # 创建数据库快照
        response = self.rds.create_db_snapshot(
            DBInstanceIdentifier='moyan-db-primary',
            DBSnapshotIdentifier=f'pre-failover-{datetime.now().isoformat()}'
        )

        # 提升备用实例为主实例
        self.rds.promote_read_replica(
            DBInstanceIdentifier='moyan-db-standby'
        )

        # 等待数据库就绪
        waiter = self.rds.get_waiter('db_instance_available')
        waiter.wait(DBInstanceIdentifier='moyan-db-standby')

    async def update_dns_records(self):
        """更新DNS记录指向备用区域"""
        print("更新DNS记录...")

        zone_id = 'Z123456789'
        new_endpoint = 'api-dr.moyan.ai'

        # 更新Route53记录
        self.route53.change_resource_record_sets(
            HostedZoneId=zone_id,
            ChangeBatch={
                'Changes': [{
                    'Action': 'UPSERT',
                    'ResourceRecordSet': {
                        'Name': 'api.moyan.ai',
                        'Type': 'CNAME',
                        'TTL': 300,
                        'ResourceRecords': [{'Value': new_endpoint}]
                    }
                }]
            }
        )

    async def verify_failover(self):
        """验证故障转移"""
        print("验证故障转移...")

        # 测试API端点
        async with aiohttp.ClientSession() as session:
            async with session.get('https://api.moyan.ai/api/health') as resp:
                if resp.status == 200:
                    print("✅ API服务正常")
                else:
                    raise Exception("API服务异常")

        # 测试数据库连接
        try:
            from neo4j import GraphDatabase
            driver = GraphDatabase.driver(
                "bolt://moyan-db-standby.cluster-xxx.us-west-2.rds.amazonaws.com:7687",
                auth=("neo4j", "password")
            )
            driver.verify_connectivity()
            print("✅ 数据库连接正常")
        except Exception as e:
            raise Exception(f"数据库连接失败: {e}")
```

### 跨区域复制
```hcl
# 主区域配置
resource "aws_dynamodb_global_table" "tenant_table" {
  region     = var.primary_region
  table_name = "moyan-tenants"

  replication_group {
    region_name = var.primary_region
  }

  replication_group {
    region_name = var.secondary_region
  }
}

# S3跨区域复制
resource "aws_s3_bucket" "primary_bucket" {
  bucket = "moyan-primary"
  region = var.primary_region
}

resource "aws_s3_bucket_versioning" "primary_versioning" {
  bucket = aws_s3_bucket.primary_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_replication_configuration" "primary_replication" {
  # 需要开启版本控制
  role   = aws_iam_role.replication.arn
  bucket = aws_s3_bucket.primary_bucket.id

  rule {
    id     = "ReplicationRule"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.secondary_bucket.arn
      storage_class = "STANDARD_IA"
    }
  }
}
```

## 📊 备份监控

### 备份状态检查
```python
# backup_monitor.py
import boto3
from datetime import datetime, timedelta

class BackupMonitor:
    def __init__(self):
        self.s3 = boto3.client('s3')
        self.dynamodb = boto3.client('dynamodb')

    def check_backup_status(self):
        """检查备份状态"""
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        backup_prefix = f"backup/{yesterday}/"

        # 检查S3备份
        response = self.s3.list_objects_v2(
            Bucket='moyan-backups',
            Prefix=backup_prefix
        )

        if 'Contents' not in response:
            return {
                'status': 'failed',
                'message': '未找到备份文件'
            }

        # 验证备份完整性
        total_size = sum(obj['Size'] for obj in response['Contents'])
        file_count = len(response['Contents'])

        return {
            'status': 'success',
            'file_count': file_count,
            'total_size_gb': total_size / 1024 / 1024 / 1024,
            'timestamp': datetime.now().isoformat()
        }

    def check_recovery_point(self):
        """检查恢复点"""
        # 检查最新的RPO
        db_snapshots = self.dynamodb.list_db_snapshots(
            DBInstanceIdentifier='moyan-db',
            MaxRecords=1
        )

        if db_snapshots['DBSnapshots']:
            latest_snapshot = db_snapshots['DBSnapshots'][0]
            snapshot_time = latest_snapshot['SnapshotCreateTime']
            rpo_minutes = (datetime.now() - snapshot_time).total_seconds() / 60

            return {
                'rpo_minutes': rpo_minutes,
                'rpo_compliant': rpo_minutes < 5,
                'last_snapshot': snapshot_time.isoformat()
            }

        return {
            'rpo_compliant': False,
            'message': '没有找到快照'
        }

    def generate_backup_report(self):
        """生成备份报告"""
        status = self.check_backup_status()
        rpo = self.check_recovery_point()

        report = {
            'date': datetime.now().strftime('%Y-%m-%d'),
            'backup_status': status,
            'recovery_point': rpo,
            'recommendations': []
        }

        if not status['status'] == 'success':
            report['recommendations'].append(
                '备份失败，请检查备份脚本和存储空间'
            )

        if not rpo['rpo_compliant']:
            report['recommendations'].append(
                f"RPO超限 ({rpo['rpo_minutes']:.1f}分钟 > 5分钟)，"
                '建议增加备份频率'
            )

        return report
```

## 🚨 演练计划

### DR演练流程
```yaml
DR演练频率:
  小规模演练: 每月
  全流程演练: 每季度
  年度灾难模拟: 每年

演练步骤:
  1. 准备阶段 (1周前):
     - 通知所有相关方
     - 准备演练环境
     - 制定详细计划

  2. 演练执行 (1天):
     - 模拟主区域故障
     - 执行故障转移
     - 验证服务可用性
     - 记录问题和耗时

  3. 复盘总结 (1周内):
     - 分析演练结果
     - 识别改进点
     - 更新DR计划
```

### 演练脚本
```bash
#!/bin/bash
# dr-drill.sh

echo "开始DR演练..."
echo "时间: $(date)"

# 1. 模拟故障
echo "步骤1: 模拟主区域故障"
aws ecs update-service --cluster moyan-prod --service api-service --desired-count 0 --region us-east-1

# 2. 等待检测
echo "步骤2: 等待故障检测 (30秒)"
sleep 30

# 3. 验证故障
echo "步骤3: 验证故障"
curl -f https://api.moyan.ai/api/health || echo "✅ 确认API不可用"

# 4. 执行故障转移
echo "步骤4: 执行故障转移"
python3 /opt/moyan/disaster_recovery.py --action failover

# 5. 验证新服务
echo "步骤5: 验证故障转移结果"
sleep 30
curl -f https://api-dr.moyan.ai/api/health || echo "❌ 故障转移失败"

# 6. 恢复主服务
echo "步骤6: 恢复主服务"
aws ecs update-service --cluster moyan-prod --service api-service --desired-count 4 --region us-east-1

# 7. 切换回主区域
echo "步骤7: 切换回主区域"
python3 /opt/moyan/disaster_recovery.py --action failback

# 8. 最终验证
echo "步骤8: 最终验证"
curl -f https://api.moyan.ai/api/health && echo "✅ 服务已恢复"

echo "DR演练完成"
```

## 📋 合规要求

### 备份保留策略
```yaml
保留期限:
  日常备份: 30天
  周备份: 12周
  月备份: 12个月
  年备份: 7年
  合规备份: 10年 (金融/医疗)

存储位置:
  冷数据: S3 Glacier (低成本)
  热数据: S3 Standard-IA (快速恢复)
  加密: AES-256端到端加密
  地域: 至少跨2个地理区域
```

## ✅ 实施清单
- [ ] 实施Neo4j自动备份
- [ ] 实施Qdrant快照备份
- [ ] 配置S3跨区域复制
- [ ] 建立故障转移流程
- [ ] 配置自动健康检查
- [ ] 实施DNS自动切换
- [ ] 建立监控告警
- [ ] 制定演练计划
- [ ] 进行DR演练
- [ ] 优化恢复流程
- [ ] 文档化流程
- [ ] 培训运维团队
