import React from 'react';
import { Typography, Row, Col, Card } from 'antd';
import { CloseCircleOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide04ProblemDefinition = () => {
  const problems = [
    {
      title: '无记忆',
      desc1: '不记得钥匙在哪',
      desc2: '不察觉设备震动频率的缓慢增加',
      delay: 0.1
    },
    {
      title: '无情境',
      desc1: '看到画面',
      desc2: '不理解"老人手抖"背后的健康风险',
      delay: 0.2
    },
    {
      title: '无主动',
      desc1: '完全被动响应',
      desc2: '99.7%的服务机会因"被动响应"而错失',
      delay: 0.3
    }
  ];

  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>核心痛点：AI的"物理世界失忆症"</Title>

        <Row gutter={[24, 24]} style={{ marginTop: 32 }}>
          {problems.map((problem, index) => (
            <Col span={8} key={index}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: problem.delay }}
              >
                <Card 
                  bordered={false}
                  style={{ height: '100%', minHeight: 320 }}
                  className="problem-card"
                >
                  <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
                    {problem.title}
                  </Title>

                  <Paragraph className="quiet-text">
                    <CloseCircleOutlined style={{ color: 'var(--color-error)', marginRight: 8 }} />
                    {problem.desc1}
                  </Paragraph>
                  <Paragraph className="quiet-text">
                    <CloseCircleOutlined style={{ color: 'var(--color-error)', marginRight: 8 }} />
                    {problem.desc2}
                  </Paragraph>
                </Card>
              </motion.div>
            </Col>
          ))}
        </Row>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <Card
            style={{
              marginTop: 32,
              background: 'var(--color-warm-50)',
              border: '2px solid var(--color-warm-200)',
              textAlign: 'center'
            }}
          >
            <Text strong style={{ fontSize: 18, color: 'var(--color-graphite-900)' }}>
              根本原因：缺乏面向物理世界的"记忆-决策"系统
            </Text>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide04ProblemDefinition;