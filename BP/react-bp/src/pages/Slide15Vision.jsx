import React from 'react';
import { Typography, Row, Col, Card, Space } from 'antd';
import { RocketOutlined, GlobalOutlined, TrophyOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide15Vision = () => {
  return (
    <div className="slide slide-cover">
      <div className="slide-content center-content">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', width: '100%' }}
        >
          <div className="logo-large" style={{ marginBottom: 40 }}>MOYAN AI</div>
          
          <Title level={1} className="display-title" style={{ marginBottom: 48 }}>
            让每一个物理设备<br />
            都拥有感知、记忆与主动智能
          </Title>

          <div style={{ height: 2, width: 200, background: 'var(--color-warm-200)', margin: '48px auto' }} />

          <Row gutter={[48, 32]} style={{ marginTop: 64, maxWidth: 1200, margin: '64px auto 0' }}>
            <Col span={8}>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <Card 
                  bordered={false}
                  style={{ 
                    height: '100%', 
                    textAlign: 'center',
                    background: 'var(--color-warm-50)'
                  }}
                >
                  <RocketOutlined style={{ fontSize: 48, color: 'var(--color-terracotta)', marginBottom: 16 }} />
                  <Title level={4}>短期(1-2年)</Title>
                  <Paragraph className="quiet-text">
                    成为AI硬件厂商的首选基础设施<br />
                    覆盖养老、安防、工业三大场景
                  </Paragraph>
                </Card>
              </motion.div>
            </Col>

            <Col span={8}>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <Card 
                  bordered={false}
                  style={{ 
                    height: '100%', 
                    textAlign: 'center',
                    background: 'var(--color-warm-50)'
                  }}
                >
                  <GlobalOutlined style={{ fontSize: 48, color: 'var(--color-moss)', marginBottom: 16 }} />
                  <Title level={4}>中期(3-5年)</Title>
                  <Paragraph className="quiet-text">
                    建立物理世界AI数据标准<br />
                    开发者生态繁荣，长尾场景爆发
                  </Paragraph>
                </Card>
              </motion.div>
            </Col>

            <Col span={8}>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                <Card 
                  bordered={false}
                  style={{ 
                    height: '100%', 
                    textAlign: 'center',
                    background: 'var(--color-warm-50)'
                  }}
                >
                  <TrophyOutlined style={{ fontSize: 48, color: 'var(--color-gold)', marginBottom: 16 }} />
                  <Title level={4}>长期(5年+)</Title>
                  <Paragraph className="quiet-text">
                    成为物理世界与AI的连接层<br />
                    就像TCP/IP连接了互联网
                  </Paragraph>
                </Card>
              </motion.div>
            </Col>
          </Row>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            style={{ marginTop: 80 }}
          >
            <Card
              style={{
                background: 'linear-gradient(135deg, var(--color-terracotta) 0%, var(--color-moss) 100%)',
                border: 'none',
                padding: '32px'
              }}
            >
              <Paragraph style={{ 
                fontSize: 22, 
                color: 'white', 
                lineHeight: 1.8, 
                marginBottom: 0,
                textAlign: 'center'
              }}>
                我们相信：<br />
                <Text strong style={{ color: 'white', fontSize: 24 }}>
                  下一代AI的战场不在云端，而在物理世界的每一个角落
                </Text><br />
                谁能让AI"看懂"、"记住"、"主动响应"物理世界，<br />
                谁就能定义AI的下一个十年
              </Paragraph>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.6 }}
            style={{ marginTop: 60 }}
          >
            <Space direction="vertical" size={8}>
              <Text strong style={{ fontSize: 18, color: 'var(--color-graphite-900)' }}>
                [创始人姓名], CEO
              </Text>
              <Text className="quiet-text" style={{ fontSize: 16 }}>
                [联系电话] | [邮箱]
              </Text>
              <Text className="quiet-text" style={{ fontSize: 14 }}>
                [公司网站] | [办公地址]
              </Text>
            </Space>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide15Vision;