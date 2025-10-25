import React from 'react';
import { Typography, Row, Col, Card, Statistic } from 'antd';
import { Pie } from '@ant-design/charts';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide14Funding = () => {
  // 资金用途饼图数据
  const fundingData = [
    { type: '团队建设', value: 50, amount: 100 },
    { type: '产品研发', value: 25, amount: 50 },
    { type: '市场验证', value: 20, amount: 40 },
    { type: '运营成本', value: 5, amount: 10 },
  ];

  const pieConfig = {
    data: fundingData,
    angleField: 'value',
    colorField: 'type',
    radius: 0.8,
    innerRadius: 0.6,
    label: {
      type: 'inner',
      offset: '-50%',
      content: '{value}%',
      style: {
        textAlign: 'center',
        fontSize: 16,
        fontWeight: 'bold',
      },
    },
    legend: {
      position: 'bottom',
    },
    color: ['#C96850', '#2F4538', '#B8860B', '#5C6B78'],
    statistic: {
      title: false,
      content: {
        style: {
          fontSize: '24px',
          fontWeight: 'bold',
        },
        content: '¥200万',
      },
    },
    tooltip: {
      formatter: (datum) => {
        return { name: datum.type, value: `¥${datum.amount}万 (${datum.value}%)` };
      },
    },
  };

  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>融资计划：200万，12个月达成5个标杆</Title>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          style={{ marginTop: 24 }}
        >
          <Card
            style={{
              background: 'linear-gradient(135deg, var(--color-terracotta) 0%, var(--color-moss) 100%)',
              border: 'none',
              padding: '32px',
              textAlign: 'center'
            }}
          >
            <Title level={2} style={{ color: 'white', marginBottom: 16 }}>
              本轮融资：<span style={{ fontSize: 56, fontWeight: 700 }}>¥200万</span>
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 18 }}>
              天使轮 | 出让股权：10% | 投前估值：¥1800万
            </Text>
          </Card>
        </motion.div>

        <Row gutter={[32, 24]} style={{ marginTop: 32 }}>
          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card bordered={false} title="资金用途分配">
                <div style={{ height: 320 }}>
                  <Pie {...pieConfig} />
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
              <Card bordered={false} title="详细用途说明" style={{ height: '100%' }}>
                <div style={{ marginTop: 8 }}>
                  <div style={{ marginBottom: 20 }}>
                    <Text strong style={{ fontSize: 16 }}>团队建设 (50%, ¥100万)</Text>
                    <ul className="bullet-list" style={{ marginTop: 8, fontSize: 13 }}>
                      <li>招聘5名核心工程师</li>
                      <li>组建销售与市场团队</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <Text strong style={{ fontSize: 16 }}>产品研发 (25%, ¥50万)</Text>
                    <ul className="bullet-list" style={{ marginTop: 8, fontSize: 13 }}>
                      <li>算力资源与云服务</li>
                      <li>硬件模组与测试设备</li>
                      <li>API开发与优化</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <Text strong style={{ fontSize: 16 }}>市场验证 (20%, ¥40万)</Text>
                    <ul className="bullet-list" style={{ marginTop: 8, fontSize: 13 }}>
                      <li>POC补贴与技术验证</li>
                      <li>行业展会与品牌建设</li>
                    </ul>
                  </div>

                  <div>
                    <Text strong style={{ fontSize: 16 }}>运营成本 (5%, ¥10万)</Text>
                    <ul className="bullet-list" style={{ marginTop: 8, fontSize: 13 }}>
                      <li>办公场地、法务与财务</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </motion.div>
          </Col>
        </Row>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          style={{ marginTop: 24 }}
        >
          <Card
            bordered={false}
            title="12个月里程碑目标"
            style={{ background: 'var(--color-warm-50)' }}
          >
            <Row gutter={[32, 16]}>
              <Col span={8}>
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <Title level={4} style={{ marginBottom: 8 }}>产品指标</Title>
                  <ul className="check-list" style={{ textAlign: 'left', marginTop: 12 }}>
                    <li>3个垂直SDK上线</li>
                    <li>MOYAN Core API开放</li>
                    <li>100+注册开发者</li>
                  </ul>
                </div>
              </Col>

              <Col span={8}>
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <Title level={4} style={{ marginBottom: 8 }}>商业指标</Title>
                  <ul className="check-list" style={{ textAlign: 'left', marginTop: 12 }}>
                    <li>5家标杆客户</li>
                    <li>500+台设备部署</li>
                    <li>ARR: ¥300-500万</li>
                  </ul>
                </div>
              </Col>

              <Col span={8}>
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <Title level={4} style={{ marginBottom: 8 }}>数据指标</Title>
                  <ul className="check-list" style={{ textAlign: 'left', marginTop: 12 }}>
                    <li>5000+小时视频数据</li>
                    <li>10万+条标注事件</li>
                    <li>3个垂直场景模型</li>
                  </ul>
                </div>
              </Col>
            </Row>

            <div style={{ textAlign: 'center', marginTop: 24, padding: '16px', background: 'white', borderRadius: '8px' }}>
              <Text strong style={{ fontSize: 18, color: 'var(--color-graphite-900)' }}>
                达成后估值：预计可支撑 <Text className="accent-text">¥8000-12000万</Text> 估值进入A轮
              </Text>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide14Funding;