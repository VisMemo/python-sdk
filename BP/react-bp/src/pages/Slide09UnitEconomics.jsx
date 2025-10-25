import React from 'react';
import { Typography, Row, Col, Card, Statistic } from 'antd';
import { Column } from '@ant-design/charts';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide09UnitEconomics = () => {
  // LTV vs CAC 对比数据
  const comparisonData = [
    { type: 'CAC\n客户获取成本', value: 20, color: '#C96850' },
    { type: 'LTV (3年)\n客户生命周期价值', value: 195, color: '#2F4538' }
  ];

  const columnConfig = {
    data: comparisonData,
    xField: 'type',
    yField: 'value',
    seriesField: 'type',
    color: ({ type }) => {
      return type.includes('CAC') ? '#C96850' : '#2F4538';
    },
    label: {
      position: 'top',
      style: {
        fill: '#3A3A3C',
        fontSize: 20,
        fontWeight: 'bold',
      },
      formatter: (datum) => `¥${datum.value}万`,
    },
    xAxis: {
      label: {
        style: {
          fontSize: 13,
        },
      },
    },
    yAxis: {
      label: {
        formatter: (v) => `¥${v}万`,
      },
    },
    legend: false,
    columnStyle: {
      radius: [8, 8, 0, 0],
    },
  };

  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>单位经济：可规模化复制的盈利模型</Title>

        <Row gutter={[24, 24]} style={{ marginTop: 32 }}>
          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Card bordered={false} style={{ height: 420 }}>
                <Title level={4} style={{ marginBottom: 16 }}>LTV vs CAC 对比</Title>
                <Column {...columnConfig} height={320} />
              </Card>
            </motion.div>
          </Col>

          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Card bordered={false} style={{ height: 420 }}>
                <Title level={4} style={{ marginBottom: 20 }}>关键指标</Title>
                <Row gutter={[16, 24]}>
                  <Col span={12}>
                    <Statistic
                      title="平均合同价值 (ACV)"
                      value={65}
                      suffix="万元"
                      valueStyle={{ color: 'var(--color-terracotta)', fontSize: 28 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="客户获取成本 (CAC)"
                      value={20}
                      suffix="万元"
                      valueStyle={{ color: 'var(--color-terracotta)', fontSize: 28 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="毛利率"
                      value={75}
                      suffix="%"
                      valueStyle={{ color: 'var(--color-success)', fontSize: 28 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="3年LTV (含分成)"
                      value={195}
                      suffix="万元"
                      valueStyle={{ color: 'var(--color-success)', fontSize: 28 }}
                    />
                  </Col>
                </Row>
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
              marginTop: 24, 
              background: 'linear-gradient(135deg, var(--color-terracotta) 0%, var(--color-moss) 100%)',
              border: 'none'
            }}
          >
            <Text 
              strong 
              style={{ 
                color: 'white', 
                fontSize: 20, 
                display: 'block', 
                textAlign: 'center' 
              }}
            >
              核心指标：LTV/CAC = 9.75 &gt; 3，模型极为健康，具备高增长潜力
            </Text>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide09UnitEconomics;
