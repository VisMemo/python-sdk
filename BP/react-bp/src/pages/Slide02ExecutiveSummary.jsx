import React from 'react';
import { Typography, Row, Col, Card, Tag } from 'antd';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide02ExecutiveSummary = () => {
  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>执行摘要</Title>

        <Row gutter={[32, 32]} style={{ marginTop: 32 }}>
          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="summary-card" bordered={false}>
                <Title level={3}>机会</Title>
                <Paragraph>
                  AI的下一个万亿级机会在物理世界，但当前AI失忆、被动、无物理感知。
                </Paragraph>
              </Card>
            </motion.div>
          </Col>

          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="summary-card" bordered={false}>
                <Title level={3}>方案</Title>
                <Paragraph>
                  MOYAN提供"感知-记忆-决策"一体化的AI基础设施，让硬件拥有主动智能。
                </Paragraph>
              </Card>
            </motion.div>
          </Col>
        </Row>

        <Row gutter={[24, 24]} style={{ marginTop: 32 }}>
          <Col span={8}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Card className="highlight-card" bordered={false}>
                <Title level={4}>壁垒</Title>
                <Text className="quiet-text">
                  独创"皮层-海马体仿生架构"，150ms主动响应，构建专有数据飞轮。
                </Text>
              </Card>
            </motion.div>
          </Col>

          <Col span={8}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <Card className="highlight-card" bordered={false}>
                <Title level={4}>进展</Title>
                <Text className="quiet-text">
                  MVP上线，已签首笔<Tag color="success">¥50万</Tag>订单，正与多家头部机器人厂商POC。
                </Text>
              </Card>
            </motion.div>
          </Col>

          <Col span={8}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <Card className="highlight-card" bordered={false}>
                <Title level={4}>融资</Title>
                <Text className="quiet-text">
                  寻求天使轮<Text className="accent-text" strong>¥200万</Text>，出让<Text className="accent-text" strong>10%</Text>，用于团队拓展与市场验证。
                </Text>
              </Card>
            </motion.div>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default Slide02ExecutiveSummary;