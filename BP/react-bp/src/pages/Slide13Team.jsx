import React from 'react';
import { Typography, Row, Col, Card, Avatar, Statistic } from 'antd';
import { UserOutlined, TeamOutlined, TrophyOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide13Team = () => {
  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>核心团队：技术与商业的黄金组合</Title>

        <Row gutter={[32, 32]} style={{ marginTop: 32 }}>
          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card bordered={false} style={{ height: '100%' }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <Avatar size={80} icon={<UserOutlined />} style={{ background: 'var(--color-terracotta)' }} />
                </div>
                <Title level={3} style={{ textAlign: 'center' }}>[创始人姓名], CEO</Title>
                
                <div style={{ marginTop: 24 }}>
                  <Paragraph>
                    <Text strong>教育背景：</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                      [占位符：学校+专业]
                    </Text>
                  </Paragraph>
                  
                  <Paragraph style={{ marginTop: 16 }}>
                    <Text strong>工作经历：</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                      [占位符：前公司+职位]
                    </Text>
                  </Paragraph>
                  
                  <Paragraph style={{ marginTop: 16 }}>
                    <Text strong>创业经验：</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                      [占位符：之前项目+成绩]
                    </Text>
                  </Paragraph>

                  <div style={{ marginTop: 20, padding: '16px', background: 'var(--color-warm-50)', borderRadius: '8px' }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>核心能力：</Text>
                    <ul className="bullet-list" style={{ marginBottom: 0 }}>
                      <li>产品设计与用户洞察</li>
                      <li>商业拓展与融资能力</li>
                      <li>团队管理与战略规划</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </motion.div>
          </Col>

          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card bordered={false} style={{ height: '100%' }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <Avatar size={80} icon={<UserOutlined />} style={{ background: 'var(--color-moss)' }} />
                </div>
                <Title level={3} style={{ textAlign: 'center' }}>[技术负责人姓名], CTO</Title>
                
                <div style={{ marginTop: 24 }}>
                  <Paragraph>
                    <Text strong>教育背景：</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                      [占位符：学校+专业]
                    </Text>
                  </Paragraph>
                  
                  <Paragraph style={{ marginTop: 16 }}>
                    <Text strong>技术背景：</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                      [占位符：前公司+技术栈]
                    </Text>
                  </Paragraph>
                  
                  <Paragraph style={{ marginTop: 16 }}>
                    <Text strong>技术成就：</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                      [占位符：如"主导XX系统架构，支撑XX万QPS"]
                    </Text>
                  </Paragraph>

                  <div style={{ marginTop: 20, padding: '16px', background: 'var(--color-warm-50)', borderRadius: '8px' }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>核心能力：</Text>
                    <ul className="bullet-list" style={{ marginBottom: 0 }}>
                      <li>分布式系统架构设计</li>
                      <li>AI模型优化与部署</li>
                      <li>边缘计算与性能优化</li>
                    </ul>
                  </div>
                </div>
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
              <Card bordered={false} style={{ textAlign: 'center', background: 'var(--color-warm-50)' }}>
                <TeamOutlined style={{ fontSize: 40, color: 'var(--color-terracotta)', marginBottom: 12 }} />
                <Statistic
                  title="全职团队规模"
                  value="[X]"
                  suffix="人"
                  valueStyle={{ color: 'var(--color-terracotta)', fontSize: 28 }}
                />
              </Card>
            </motion.div>
          </Col>

          <Col span={8}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <Card bordered={false} style={{ textAlign: 'center', background: 'var(--color-warm-50)' }}>
                <UserOutlined style={{ fontSize: 40, color: 'var(--color-moss)', marginBottom: 12 }} />
                <Statistic
                  title="核心研发人员"
                  value="[X]"
                  suffix="人"
                  valueStyle={{ color: 'var(--color-moss)', fontSize: 28 }}
                />
              </Card>
            </motion.div>
          </Col>

          <Col span={8}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <Card bordered={false} style={{ textAlign: 'center', background: 'var(--color-warm-50)' }}>
                <TrophyOutlined style={{ fontSize: 40, color: 'var(--color-gold)', marginBottom: 12 }} />
                <Statistic
                  title="行业顾问"
                  value="[X]"
                  suffix="位"
                  valueStyle={{ color: 'var(--color-gold)', fontSize: 28 }}
                />
              </Card>
            </motion.div>
          </Col>
        </Row>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
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
              为什么是我们？技术复合背景 + 行业资源 + 快速执行力 = 唯一能将愿景变为现实的团队
            </Text>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide13Team;