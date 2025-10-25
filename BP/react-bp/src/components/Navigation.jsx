import React from 'react';
import { Button, Progress } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import './Navigation.css';

const Navigation = ({ currentSlide, totalSlides, onPrev, onNext, onGoTo }) => {
  const progress = ((currentSlide + 1) / totalSlides) * 100;

  return (
    <>
      {/* 底部导航按钮 */}
      <div className="nav-buttons">
        <Button
          className="nav-btn"
          shape="circle"
          size="large"
          icon={<LeftOutlined />}
          onClick={onPrev}
          disabled={currentSlide === 0}
        />
        <span className="slide-number">
          {currentSlide + 1} / {totalSlides}
        </span>
        <Button
          className="nav-btn"
          shape="circle"
          size="large"
          icon={<RightOutlined />}
          onClick={onNext}
          disabled={currentSlide === totalSlides - 1}
        />
      </div>

      {/* 右侧点状导航 */}
      <div className="nav-dots">
        {Array.from({ length: totalSlides }).map((_, index) => (
          <button
            key={index}
            className={`nav-dot ${index === currentSlide ? 'active' : ''}`}
            onClick={() => onGoTo(index)}
            aria-label={`跳转到第 ${index + 1} 页`}
          />
        ))}
      </div>

      {/* 进度条 */}
      <div className="progress-indicator">
        <Progress
          percent={progress}
          showInfo={false}
          strokeColor="var(--color-terracotta)"
          trailColor="var(--color-warm-100)"
        />
      </div>
    </>
  );
};

export default Navigation;