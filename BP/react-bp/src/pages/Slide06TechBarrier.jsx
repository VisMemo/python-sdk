import React from 'react';
import { Typography, Row, Col, Card, Statistic, Table } from 'antd';
import { RocketOutlined, ThunderboltOutlined, DatabaseOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide06TechBarrier = () => {
  const architectureData = [
    {
      key: '1',
      capability: '统一记忆底座',
      tech: '向量+图谱混合架构',
      result: '检索效率提升100%',
    },
    {
      key: '2',
      capability: '多模态融合',
      tech: '图/文/音联合召回',
      result: '准确率提升47.3%',
    },
    {
      key: '3',
      capability: '图谱增强',
      tech: '知识图谱关联推理',
      result: '复杂查询性能提升82.1%',
    },
    {
      key: '4',
      capability: '边缘推理',
      tech: 'C++内核优化',
      result: '端到端150ms主动响应',
    },
  ];

  const columns = [
    {
      title: '核心能力',
      dataIndex: 'capability',
      key: 'capability',
      width: '25%',
    },
    {
      title: '技术实现',
      dataIndex: 'tech',
      key: 'tech',
      width: '35%',
    },
    {
      title: '性能指标',
      dataIndex: 'result',
      key: 'result',
      width: '40%',
      render: (text) => <Text strong style={{ color: 'var(--color-success)' }}>{text}</Text>,
    },
  ];

  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>技术壁垒："皮层-海马体仿生架构"</Title>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ marginTop: 24 }}
        >
          <Card bordered={false} style={{ background: 'var(--color-warm-50)' }}>
            <Title level={3} style={{ marginBottom: 24 }}>我们向人脑学习</Title>
            <Table
              dataSource={architectureData}
              columns={columns}
              pagination={false}
              size="middle"
            />
          </Card>
        </motion.div>

        <Row gutter={[24, 24]} style={{ marginTop: 32 }}>
          <Col span={8}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card bordered={false} style={{ textAlign: 'center', height: '100%' }}>
                <ThunderboltOutlined style={{ fontSize: 48, color: 'var(--color-terracotta)', marginBottom: 16 }} />
                <Statistic
                  title="主动响应时延"
                  value={150}
                  suffix="ms"
                  valueStyle={{ color: 'var(--color-terracotta)', fontSize: 32 }}
                />
                <Text className="quiet-text" style={{ display: 'block', marginTop: 12 }}>
                  行业领先的亚秒级响应
                </Text>
              </Card>
            </motion.div>
          </Col>

          <Col span={8}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card bordered={false} style={{ textAlign: 'center', height: '100%' }}>
                <DatabaseOutlined style={{ fontSize: 48, color: 'var(--color-moss)', marginBottom: 16 }} />
                <Statistic
                  title="实体规模支持"
                  value={100000}
                  suffix="+"
                  valueStyle={{ color: 'var(--color-moss)', fontSize: 32 }}
                />
                <Text className="quiet-text" style={{ display: 'block', marginTop: 12 }}>
                  十万级实体高效管理
                </Text>
              </Card>
            </motion.div>
          </Col>

          <Col span={8}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Card bordered={false} style={{ textAlign: 'center', height: '100%' }}>
                <RocketOutlined style={{ fontSize: 48, color: 'var(--color-gold)', marginBottom: 16 }} />
                <Statistic
                  title="边缘推理"
                  value="24/7"
                  valueStyle={{ color: 'var(--color-gold)', fontSize: 32 }}
                />
                <Text className="quiet-text" style={{ display: 'block', marginTop: 12 }}>
                  全天候无间断运行
                </Text>
              </Card>
            </motion.div>
          </Col>
        </Row>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          <Card
            style={{
              marginTop: 24,
              background: 'linear-gradient(135deg, var(--color-terracotta) 0%, var(--color-moss) 100%)',
              border: 'none',
              padding: '20px'
            }}
          >
            <Text strong style={{ color: 'white', fontSize: 18, display: 'block', textAlign: 'center' }}>
              核心突破：统一记忆底座 + 多模态融合 + 图谱增强 = 150ms端到端主动守护
            </Text>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide06TechBarrier;