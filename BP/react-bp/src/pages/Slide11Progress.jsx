import React from 'react';
import { Typography, Row, Col, Card, Tag, Statistic, Badge } from 'antd';
import { CheckCircleOutlined, SyncOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide11Progress = () => {
  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>核心进展：MVP已上线，首单已签约</Title>

        <Row gutter={[32, 24]} style={{ marginTop: 32 }}>
          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card 
                bordered={false}
                title={
                  <span>
                    <CheckCircleOutlined style={{ color: 'var(--color-success)', marginRight: 8 }} />
                    技术里程碑
                  </span>
                }
              >
                <ul className="check-list">
                  <li>
                    <Text strong>MVP完成部署</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                      智能陪伴SDK已在测试设备运行
                    </Text>
                  </li>
                  <li style={{ marginTop: 16 }}>
                    <Text strong>核心指标验证</Text>
                    <div style={{ marginTop: 8, marginLeft: 24 }}>
                      <Tag color="success">响应延迟: 150ms</Tag>
                      <Tag color="success">准确率: 94.2%</Tag>
                    </div>
                  </li>
                  <li style={{ marginTop: 16 }}>
                    <Text strong>数据积累</Text>
                    <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                      视频时长1200+小时 | 标注事件8000+条
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
                title={
                  <span>
                    <CheckCircleOutlined style={{ color: 'var(--color-success)', marginRight: 8 }} />
                    商业进展
                  </span>
                }
              >
                <Badge.Ribbon text="已签约" color="green">
                  <Card 
                    size="small" 
                    style={{ background: 'var(--color-warm-50)', marginBottom: 16 }}
                  >
                    <Paragraph style={{ marginBottom: 8 }}>
                      <Text strong>客户：</Text>
                      <Text>国内头部服务机器人厂商A</Text>
                    </Paragraph>
                    <Paragraph style={{ marginBottom: 8 }}>
                      <Text strong>金额：</Text>
                      <Text className="accent-text" strong style={{ fontSize: 18 }}>¥50万元</Text>
                    </Paragraph>
                    <Paragraph style={{ marginBottom: 8 }}>
                      <Text strong>内容：</Text>
                      <Text>AI陪伴SDK集成与定制服务</Text>
                    </Paragraph>
                    <Paragraph style={{ marginBottom: 0 }}>
                      <Text strong>价值：</Text>
                      <Text type="success">预计产品月活提升30%</Text>
                    </Paragraph>
                  </Card>
                </Badge.Ribbon>

                <div style={{ marginTop: 16 }}>
                  <Text strong>客户漏斗：</Text>
                  <div style={{ marginTop: 12 }}>
                    <Tag icon={<SyncOutlined spin />} color="processing">
                      3家 POC进行中
                    </Tag>
                    <Tag icon={<ClockCircleOutlined />} color="default">
                      5家 技术验证
                    </Tag>
                    <Tag icon={<ClockCircleOutlined />} color="default">
                      12家 已接触
                    </Tag>
                  </div>
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
              background: 'var(--color-warm-50)',
              border: '2px solid var(--color-warm-200)'
            }}
          >
            <Title level={4} style={{ marginBottom: 20 }}>接下来12个月的关键目标</Title>
            <Row gutter={[32, 16]}>
              <Col span={8}>
                <Statistic
                  title="标杆客户签约"
                  value={5}
                  suffix="家"
                  valueStyle={{ color: 'var(--color-terracotta)', fontSize: 32 }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="设备部署量"
                  value={500}
                  suffix="+"
                  prefix="台"
                  valueStyle={{ color: 'var(--color-terracotta)', fontSize: 32 }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="ARR目标"
                  value={300}
                  suffix="万+"
                  prefix="¥"
                  valueStyle={{ color: 'var(--color-success)', fontSize: 32 }}
                />
              </Col>
            </Row>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide11Progress;