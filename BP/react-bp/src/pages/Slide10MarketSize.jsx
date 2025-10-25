import React from 'react';
import { Typography, Card } from 'antd';
import { Liquid } from '@ant-design/charts';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Paragraph, Text } = Typography;

const Slide10MarketSize = () => {
  const createLiquidConfig = (percent, color) => ({
    percent: percent / 100,
    shape: 'rect',
    outline: {
      border: 2,
      distance: 4,
    },
    wave: {
      length: 128,
    },
    theme: {
      styleSheet: {
        brandColor: color,
      },
    },
    pattern: {
      type: 'line',
    },
    statistic: {
      content: {
        style: {
          fontSize: '32px',
          fill: color,
          fontWeight: 'bold',
        },
        formatter: () => `${percent}%`,
      },
    },
  });

  return (
    <div className="slide">
      <div className="slide-content">
        <Title level={1}>市场规模：从百亿市场切入</Title>

        <div style={{ marginTop: 32, display: 'flex', gap: 24, alignItems: 'stretch' }}>
          <motion.div
            style={{ flex: 1 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Card bordered={false} style={{ height: '100%' }}>
              <Title level={4}>TAM (总潜在市场)</Title>
              <div style={{ height: 180, marginBottom: 16 }}>
                <Liquid {...createLiquidConfig(100, '#C96850')} />
              </div>
              <Title level={3} style={{ color: 'var(--color-terracotta)', marginBottom: 8 }}>
                2万亿美元
              </Title>
              <Paragraph className="quiet-text">
                全球IoT设备市场<br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  来源：GSMA Intelligence, 2030
                </Text>
              </Paragraph>
            </Card>
          </motion.div>

          <motion.div
            style={{ flex: 1 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <Card bordered={false} style={{ height: '100%' }}>
              <Title level={4}>SAM (服务可及市场)</Title>
              <div style={{ height: 180, marginBottom: 16 }}>
                <Liquid {...createLiquidConfig(25, '#2F4538')} />
              </div>
              <Title level={3} style={{ color: 'var(--color-moss)', marginBottom: 8 }}>
                503.8亿美元
              </Title>
              <Paragraph className="quiet-text">
                全球服务机器人市场<br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  来源：IDC & Statista, 2025
                </Text>
              </Paragraph>
            </Card>
          </motion.div>

          <motion.div
            style={{ flex: 1 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card bordered={false} style={{ height: '100%' }}>
              <Title level={4}>SOM (初期可获得市场)</Title>
              <div style={{ height: 180, marginBottom: 16 }}>
                <Liquid {...createLiquidConfig(5, '#B8860B')} />
              </div>
              <Title level={3} style={{ color: 'var(--color-gold)', marginBottom: 8 }}>
                5亿元
              </Title>
              <Paragraph className="quiet-text">
                3年内，中国养老机器人市场5%份额<br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  来源：前瞻产业研究院, 2025
                </Text>
              </Paragraph>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <Card 
            style={{ 
              marginTop: 32,
              background: 'var(--color-warm-50)',
              border: '2px solid var(--color-warm-200)'
            }}
          >
            <Text strong style={{ fontSize: 18, color: 'var(--color-graphite-900)' }}>
              我们的目标：3年内获取 <Text className="accent-text" strong>5%</Text> 市场份额，
              实现 <Text className="accent-text" strong>2.5亿</Text> ARR
            </Text>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide10MarketSize;