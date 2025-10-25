import React from 'react';
import { Typography, Row, Col, Card, Table } from 'antd';
import { CheckOutlined, CloseOutlined, WarningOutlined } from '@ant-design/icons';
import { Scatter } from '@ant-design/charts';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide12Competition = () => {
  // 竞争矩阵数据
  const competitionData = [
    { x: 30, y: 85, name: 'OpenAI/Anthropic', size: 20, category: '通用大模型' },
    { x: 85, y: 75, name: 'MOYAN', size: 30, category: '我们' },
    { x: 25, y: 30, name: '传统IoT平台', size: 18, category: '传统玩家' },
    { x: 70, y: 35, name: '硬件厂商自研', size: 15, category: '传统玩家' },
  ];

  const scatterConfig = {
    data: competitionData,
    xField: 'x',
    yField: 'y',
    sizeField: 'size',
    colorField: 'category',
    color: ({ category }) => {
      if (category === '我们') return '#C96850';
      if (category === '通用大模型') return '#5C6B78';
      return '#D4D1CC';
    },
    size: [10, 40],
    shape: 'circle',
    yAxis: {
      title: { text: '主动性 ↑', style: { fontSize: 14, fill: '#8B847C' } },
      line: { style: { stroke: '#D4D1CC' } },
      grid: { line: { style: { stroke: '#E8E6E3', lineDash: [4, 4] } } },
    },
    xAxis: {
      title: { text: '垂直场景深度 →', style: { fontSize: 14, fill: '#8B847C' } },
      line: { style: { stroke: '#D4D1CC' } },
      grid: { line: { style: { stroke: '#E8E6E3', lineDash: [4, 4] } } },
    },
    label: {
      formatter: (datum) => datum.name,
      style: { fontSize: 12, fontWeight: 'bold' },
    },
    legend: false,
    tooltip: {
      showTitle: false,
      formatter: (datum) => {
        return { name: datum.name, value: datum.category };
      },
    },
  };

  // 对比表格数据
  const comparisonColumns = [
    {
      title: '维度',
      dataIndex: 'dimension',
      key: 'dimension',
      width: '20%',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'OpenAI/Anthropic',
      dataIndex: 'openai',
      key: 'openai',
      width: '20%',
    },
    {
      title: '传统IoT平台',
      dataIndex: 'iot',
      key: 'iot',
      width: '20%',
    },
    {
      title: '硬件厂商自研',
      dataIndex: 'hw',
      key: 'hw',
      width: '20%',
    },
    {
      title: <Text className="accent-text">MOYAN(我们)</Text>,
      dataIndex: 'moyan',
      key: 'moyan',
      width: '20%',
      render: (text) => <Text className="accent-text" strong>{text}</Text>,
    },
  ];

  const comparisonData = [
    {
      key: '1',
      dimension: '物理世界数据',
      openai: <><CloseOutlined style={{ color: 'red' }} /> 无</>,
      iot: <><WarningOutlined style={{ color: 'orange' }} /> 有但未训练AI</>,
      hw: <><WarningOutlined style={{ color: 'orange' }} /> 单一场景</>,
      moyan: <><CheckOutlined style={{ color: 'green' }} /> 跨场景积累</>,
    },
    {
      key: '2',
      dimension: '边缘推理优化',
      openai: <><WarningOutlined style={{ color: 'orange' }} /> 主要云端</>,
      iot: <><CloseOutlined style={{ color: 'red' }} /> 无AI</>,
      hw: <><WarningOutlined style={{ color: 'orange' }} /> 需自研</>,
      moyan: <><CheckOutlined style={{ color: 'green' }} /> 核心能力</>,
    },
    {
      key: '3',
      dimension: '长期记忆',
      openai: <><WarningOutlined style={{ color: 'orange' }} /> 对话级</>,
      iot: <><WarningOutlined style={{ color: 'orange' }} /> 时序数据库</>,
      hw: <><CloseOutlined style={{ color: 'red' }} /> 未实现</>,
      moyan: <><CheckOutlined style={{ color: 'green' }} /> 仿生架构</>,
    },
    {
      key: '4',
      dimension: '主动决策',
      openai: <><CloseOutlined style={{ color: 'red' }} /> 被动响应</>,
      iot: <><WarningOutlined style={{ color: 'orange' }} /> 简单规则</>,
      hw: <><CloseOutlined style={{ color: 'red' }} /> 未实现</>,
      moyan: <><CheckOutlined style={{ color: 'green' }} /> 亚秒级</>,
    },
    {
      key: '5',
      dimension: '集成难度',
      openai: <><WarningOutlined style={{ color: 'orange' }} /> 需适配</>,
      iot: <><WarningOutlined style={{ color: 'orange' }} /> 需定制</>,
      hw: <><CloseOutlined style={{ color: 'red' }} /> 6个月+</>,
      moyan: <><CheckOutlined style={{ color: 'green' }} /> 2周即可</>,
    },
  ];

  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>竞争格局与退出路径</Title>

        <Row gutter={[32, 24]} style={{ marginTop: 24 }}>
          <Col span={12}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Card bordered={false} title="我们的定位">
                <div style={{ height: 320 }}>
                  <Scatter {...scatterConfig} />
                </div>
                <Text className="quiet-text" style={{ display: 'block', textAlign: 'center', marginTop: 12 }}>
                  垂直领域 + 主动智能（右上象限，蓝海区域）
                </Text>
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
                title="潜在退出路径"
                style={{ height: '100%' }}
              >
                <div style={{ marginTop: 16 }}>
                  <Title level={4} style={{ fontSize: 16, marginBottom: 12 }}>战略收购</Title>
                  <ul className="bullet-list">
                    <li>
                      <Text strong>小米 / 科沃斯</Text>
                      <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                        补强生态体系，完善AI能力矩阵
                      </Text>
                    </li>
                    <li style={{ marginTop: 12 }}>
                      <Text strong>Google / Amazon</Text>
                      <Text className="quiet-text" style={{ display: 'block', marginTop: 4 }}>
                        技术并购，获取物理世界数据资产
                      </Text>
                    </li>
                  </ul>
                </div>

                <div style={{ marginTop: 24 }}>
                  <Title level={4} style={{ fontSize: 16, marginBottom: 12 }}>IPO路径</Title>
                  <Paragraph className="quiet-text">
                    长期成为AI Agent基础设施领域的平台型公司，构建物理世界数据标准
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
          style={{ marginTop: 24 }}
        >
          <Card bordered={false} title="与主要玩家的差异">
            <Table
              dataSource={comparisonData}
              columns={comparisonColumns}
              pagination={false}
              size="small"
            />
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide12Competition;