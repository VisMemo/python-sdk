import React from 'react';
import { Typography, Row, Col, Card, Tag } from 'antd';
import { RobotOutlined, DollarOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide08Product = () => {
  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>产品形态：聚焦AI陪伴机器人SDK</Title>

        <Row gutter={[32, 32]} style={{ marginTop: 32 }}>
          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card 
                bordered={false}
                style={{ height: '100%' }}
              >
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <RobotOutlined style={{ fontSize: 72, color: 'var(--color-terracotta)' }} />
                </div>
                <Title level={3}>为什么聚焦陪伴机器人？</Title>
                <ul className="bullet-list">
                  <li>
                    <Text strong>市场空间大</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                      中国养老机器人市场2025年预计破100亿元
                    </Text>
                  </li>
                  <li style={{ marginTop: 16 }}>
                    <Text strong>付费意愿强</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                      家庭愿为"主动关怀"支付溢价
                    </Text>
                  </li>
                  <li style={{ marginTop: 16 }}>
                    <Text strong>数据价值高</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                      长期陪伴产生的数据最有价值
                    </Text>
                  </li>
                </ul>
              </Card>
            </motion.div>
          </Col>

          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card 
                bordered={false}
                style={{ height: '100%', background: 'var(--color-warm-50)' }}
              >
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <DollarOutlined style={{ fontSize: 72, color: 'var(--color-moss)' }} />
                </div>
                <Title level={3}>产品包与收费模式</Title>
                
                <div style={{ marginTop: 24 }}>
                  <Title level={4} style={{ fontSize: 16 }}>
                    <Tag color="blue">核心产品包</Tag>
                  </Title>
                  <ul className="check-list">
                    <li>定制化SDK集成服务</li>
                    <li>云端记忆存储与查询</li>
                    <li>技术支持与迭代更新</li>
                  </ul>
                </div>

                <div style={{ marginTop: 24 }}>
                  <Title level={4} style={{ fontSize: 16 }}>
                    <Tag color="green">收费模式</Tag>
                  </Title>
                  <Paragraph>
                    <Text strong>项目制：</Text>
                    <Text style={{ display: 'block', marginTop: 4 }}>
                      ¥30-100万/项目 (一次性集成与定制)
                    </Text>
                  </Paragraph>
                  <Paragraph style={{ marginTop: 12 }}>
                    <Text strong>分成模式：</Text>
                    <Text style={{ display: 'block', marginTop: 4 }}>
                      低项目费 + 产品销售额0.5%-2%分成
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
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card
            style={{
              marginTop: 32,
              background: 'linear-gradient(135deg, var(--color-terracotta) 0%, var(--color-moss) 100%)',
              border: 'none',
              padding: '24px'
            }}
          >
            <Row>
              <Col span={12}>
                <Text strong style={{ color: 'white', fontSize: 18 }}>
                  策略：单点突破
                </Text>
                <Text style={{ display: 'block', marginTop: 8, color: 'rgba(255,255,255,0.9)' }}>
                  用机器人场景验证PMF，建立标杆案例
                </Text>
              </Col>
              <Col span={12}>
                <Text strong style={{ color: 'white', fontSize: 18 }}>
                  路径：横向拓展
                </Text>
                <Text style={{ display: 'block', marginTop: 8, color: 'rgba(255,255,255,0.9)' }}>
                  复用底层能力，快速切入工业/家居等场景
                </Text>
              </Col>
            </Row>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide08Product;