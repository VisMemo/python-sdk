import React from 'react';
import { Typography, Row, Col, Card, Steps } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;
const { Step } = Steps;

const Slide07KillerFeature = () => {
  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>杀手级功能：150ms主动守护</Title>

        <Row gutter={[32, 32]} style={{ marginTop: 32 }}>
          <Col span={24}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card 
                bordered={false}
                style={{ background: 'var(--color-warm-50)' }}
              >
                <Title level={3} style={{ marginBottom: 24 }}>
                  老人独居守护场景：从捕捉到响应的完整流程
                </Title>
                <Steps
                  direction="horizontal"
                  current={3}
                  items={[
                    {
                      title: '感知',
                      description: '0-50ms',
                      subTitle: '捕捉手部颤抖',
                      icon: <ClockCircleOutlined />,
                    },
                    {
                      title: '提炼',
                      description: '50-100ms',
                      subTitle: '识别异常模式',
                      icon: <ClockCircleOutlined />,
                    },
                    {
                      title: '决策',
                      description: '100-150ms',
                      subTitle: '判断需要关怀',
                      icon: <ClockCircleOutlined />,
                    },
                    {
                      title: '执行',
                      description: '<150ms',
                      subTitle: '主动询问关怀',
                      icon: <CheckCircleOutlined />,
                    },
                  ]}
                />
              </Card>
            </motion.div>
          </Col>
        </Row>

        <Row gutter={[32, 32]} style={{ marginTop: 32 }}>
          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card bordered={false} style={{ height: '100%' }}>
                <Title level={4}>传统方案的问题</Title>
                <div style={{ marginTop: 16 }}>
                  <Paragraph>
                    <Text type="danger" strong>5-30秒判断</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 8 }}>
                      需要上传云端 → 分析 → 通知
                    </Text>
                  </Paragraph>
                  <Paragraph style={{ marginTop: 16 }}>
                    <Text type="danger" strong>网络波动风险</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 8 }}>
                      可能导致更长延迟，错失关键救援时间
                    </Text>
                  </Paragraph>
                  <Paragraph style={{ marginTop: 16 }}>
                    <Text type="danger" strong>被动响应模式</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 8 }}>
                      需要老人主动呼救，无法预防性关怀
                    </Text>
                  </Paragraph>
                </div>
              </Card>
            </motion.div>
          </Col>

          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card 
                bordered={false} 
                style={{ 
                  height: '100%',
                  background: 'linear-gradient(135deg, #2F4538 0%, #4A5D4F 100%)',
                  color: 'white'
                }}
              >
                <Title level={4} style={{ color: 'white' }}>MOYAN的革命性突破</Title>
                <div style={{ marginTop: 16 }}>
                  <Paragraph>
                    <Text strong style={{ color: 'white', fontSize: 16 }}>边缘-云端混合架构</Text>
                    <Text style={{ display: 'block', marginTop: 8, color: 'rgba(255,255,255,0.9)' }}>
                      高频判断在边缘，长期记忆在云端
                    </Text>
                  </Paragraph>
                  <Paragraph style={{ marginTop: 16 }}>
                    <Text strong style={{ color: 'white', fontSize: 16 }}>状态机优化</Text>
                    <Text style={{ display: 'block', marginTop: 8, color: 'rgba(255,255,255,0.9)' }}>
                      不依赖大模型实时推理，预编译决策树
                    </Text>
                  </Paragraph>
                  <Paragraph style={{ marginTop: 16 }}>
                    <Text strong style={{ color: 'white', fontSize: 16 }}>C++内核</Text>
                    <Text style={{ display: 'block', marginTop: 8, color: 'rgba(255,255,255,0.9)' }}>
                      极致优化推理性能，单核处理多路流
                    </Text>
                  </Paragraph>
                </div>
              </Card>
            </motion.div>
          </Col>
        </Row>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <Card
            style={{
              marginTop: 24,
              background: 'var(--color-terracotta)',
              border: 'none',
              textAlign: 'center',
              padding: '20px'
            }}
          >
            <Text strong style={{ color: 'white', fontSize: 20 }}>
              从"被动呼救"到"主动预警" — 交互范式的跨越
            </Text>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide07KillerFeature;