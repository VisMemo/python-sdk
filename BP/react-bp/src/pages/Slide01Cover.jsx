import React from 'react';
import { Typography, Space } from 'antd';
import { motion } from 'framer-motion';
import './Slides.css';

const { Title, Text } = Typography;

const Slide01Cover = () => {
  return (
    <div className="slide slide-cover">
      <div className="slide-content center-content">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="logo-large">MOYAN AI</div>
          
          <Title level={1} className="display-title">
            为物理世界装上主动智能大脑
          </Title>
          
          <Text className="subtitle-large">
            AI Agent Physical-World Infrastructure
          </Text>
        </motion.div>

        <motion.div
          className="contact-info"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <Space direction="vertical" size={4}>
            <Text className="quiet-text">[创始人姓名], CEO</Text>
            <Text className="quiet-text">[联系电话] | [邮箱]</Text>
            <Text className="quiet-text">2025年 [月份]</Text>
          </Space>
        </motion.div>
      </div>
    </div>
  );
};

export default Slide01Cover;