import React, { useState, useEffect, useCallback } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AnimatePresence, motion } from 'framer-motion';
import Navigation from './components/Navigation';
import * as Slides from './pages/AllSlides';
import './styles/global.css';

// 所有幻灯片组件数组
const slideComponents = [
  Slides.Slide01Cover,
  Slides.Slide02ExecutiveSummary,
  Slides.Slide03MarketInsight,
  Slides.Slide04ProblemDefinition,
  Slides.Slide05Solution,
  Slides.Slide06TechBarrier,
  Slides.Slide07KillerFeature,
  Slides.Slide08Product,
  Slides.Slide09UnitEconomics,
  Slides.Slide10MarketSize,
  Slides.Slide11Progress,
  Slides.Slide12Competition,
  Slides.Slide13Team,
  Slides.Slide14Funding,
  Slides.Slide15Vision,
];

function App() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = slideComponents.length;

  // 键盘导航
  const handleKeyDown = useCallback(
    (e) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          if (currentSlide < totalSlides - 1) {
            setCurrentSlide(currentSlide + 1);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (currentSlide > 0) {
            setCurrentSlide(currentSlide - 1);
          }
          break;
        case 'Home':
          e.preventDefault();
          setCurrentSlide(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentSlide(totalSlides - 1);
          break;
        default:
          break;
      }
    },
    [currentSlide, totalSlides]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // 导航处理函数
  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleNext = () => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handleGoTo = (index) => {
    setCurrentSlide(index);
  };

  // 当前幻灯片组件
  const CurrentSlideComponent = slideComponents[currentSlide];

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#C96850',
          colorSuccess: '#4A5D4F',
          colorWarning: '#C8975C',
          colorError: '#B5533D',
          colorInfo: '#5C6B78',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
      }}
    >
      <div className="presentation-container">
        <div className="presentation-wrapper">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              style={{ width: '100%', height: '100%' }}
            >
              <CurrentSlideComponent />
            </motion.div>
          </AnimatePresence>
        </div>

        <Navigation
          currentSlide={currentSlide}
          totalSlides={totalSlides}
          onPrev={handlePrev}
          onNext={handleNext}
          onGoTo={handleGoTo}
        />
      </div>
    </ConfigProvider>
  );
}

export default App;