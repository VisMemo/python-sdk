import React from 'react';
import { Typography, Row, Col, Card, Divider } from 'antd';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide03MarketInsight = () => {
  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>万亿赛道：AI的下一站是物理世界</Title>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="insight-card" style={{ marginTop: 24, background: 'var(--color-warm-50)' }}>
            <Title level={3}>LLM的瓶颈</Title>
            <div style={{ fontFamily: 'monospace', color: 'var(--color-warm-400)', lineHeight: 2 }}>
              GPT-3 (175B) → GPT-4 (~1.8T)：质的飞跃<br />
              GPT-4 → GPT-5 (&gt;10T)：提升主要在边缘case
            </div>
            <Paragraph strong style={{ marginTop: 16 }}>
              结论：继续堆参数，已接近天花板
            </Paragraph>
          </Card>
        </motion.div>

        <Title level={2} style={{ marginTop: 32 }}>语言的根本局限</Title>

        <Row gutter={[32, 32]} style={{ marginTop: 24 }}>
          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card className="example-card" bordered={false}>
                <Title level={4}>案例："把杯子放在桌子上"</Title>
                <Paragraph>
                  <Text strong>语言：</Text> 5个字，极简
                </Paragraph>
                <Paragraph>
                  <Text strong>物理：</Text> 需理解重力、摩擦、碰撞、手眼协调、材质硬度...
                </Paragraph>
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
                className="judgment-card" 
                bordered={false}
                style={{ 
                  background: 'var(--color-moss)', 
                  color: 'white',
                  height: '100%'
                }}
              >
                <Title level={4} style={{ color: 'white' }}>我们的判断</Title>
                <Paragraph style={{ color: 'rgba(255,255,255,0.9)' }}>
                  谁掌握"AI连接物理世界"的基础设施，谁就掌握下一个十年。
                </Paragraph>
              </Card>
            </motion.div>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default Slide03MarketInsight;
