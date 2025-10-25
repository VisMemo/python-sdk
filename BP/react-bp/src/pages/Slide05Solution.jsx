import React from 'react';
import { Typography, Row, Col, Card } from 'antd';
import { ApiOutlined, DatabaseOutlined, ControlOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide05Solution = () => {
  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>解决方案：MOYAN主动智能基础设施</Title>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ marginTop: 32 }}
        >
          <div className="architecture-layer">
            <Title level={4} style={{ marginBottom: 8 }}>应用层SDK (机器人/摄像头)</Title>
            <Text className="quiet-text">垂直场景SDK</Text>
          </div>

          <div className="architecture-arrow">↕</div>

          <div className="architecture-layer highlight">
            <Title level={4} style={{ marginBottom: 8 }}>MOYAN Core (感知/记忆/控制)</Title>
            <Text className="quiet-text">基础设施层</Text>
          </div>

          <div className="architecture-arrow">↕</div>

          <div className="architecture-layer">
            <Title level={4} style={{ marginBottom: 8 }}>硬件层 (传感器/执行器)</Title>
            <Text className="quiet-text">物理世界</Text>
          </div>
        </motion.div>

        <Row gutter={[24, 24]} style={{ marginTop: 32 }}>
          <Col span={8}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card bordered={false} className="feature-card" style={{ height: '100%', textAlign: 'center' }}>
                <ApiOutlined style={{ fontSize: 48, color: 'var(--color-terracotta)', marginBottom: 16 }} />
                <Title level={4}>感知SDK</Title>
                <Paragraph className="quiet-text">
                  多模态融合，看懂物理世界
                </Paragraph>
              </Card>
            </motion.div>
          </Col>

          <Col span={8}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card bordered={false} className="feature-card" style={{ height: '100%', textAlign: 'center' }}>
                <DatabaseOutlined style={{ fontSize: 48, color: 'var(--color-moss)', marginBottom: 16 }} />
                <Title level={4}>记忆API</Title>
                <Paragraph className="quiet-text">
                  跨时间、跨场景的永久记忆
                </Paragraph>
              </Card>
            </motion.div>
          </Col>

          <Col span={8}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Card bordered={false} className="feature-card" style={{ height: '100%', textAlign: 'center' }}>
                <ControlOutlined style={{ fontSize: 48, color: 'var(--color-gold)', marginBottom: 16 }} />
                <Title level={4}>控制网关</Title>
                <Paragraph className="quiet-text">
                  AI决策到物理动作的实时转换
                </Paragraph>
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
              marginTop: 32,
              background: 'var(--color-terracotta)',
              border: 'none',
              textAlign: 'center',
              padding: '24px'
            }}
          >
            <Text strong style={{ color: 'white', fontSize: 20, display: 'block' }}>
              核心价值：让硬件从"工具"进化为"主动守护的伙伴"
            </Text>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide05Solution;