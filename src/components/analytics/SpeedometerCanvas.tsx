import React, { useEffect, useRef } from 'react';

interface SpeedometerProps {
  currentTps: number;
  nominalMinTps: number;
  nominalMaxTps: number;
  healthScore: number;
  status: string;
}

export const SpeedometerCanvas: React.FC<SpeedometerProps> = ({
  currentTps,
  nominalMinTps,
  nominalMaxTps,
  healthScore,
  status,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayTpsRef = useRef<number>(currentTps || 0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // 保持最新状态引用，支持流畅插值与非重置渲染
  const propsRef = useRef({ currentTps, nominalMinTps, nominalMaxTps, healthScore, status });
  propsRef.current = { currentTps, nominalMinTps, nominalMaxTps, healthScore, status };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High-DPI 视网膜清晰度适配 (支持 1.0, 1.25, 1.5, 2.0+ 高分屏)
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = 240;
    const cssHeight = 140;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    let isVisible = true;

    const resumeAnimation = () => {
      isVisible = true;
      displayTpsRef.current = propsRef.current.currentTps; // 切回前台瞬间同步对齐，彻底消除突变暴震
      lastTimeRef.current = performance.now();
      if (!rafRef.current) {
        startLoop();
      }
    };

    const pauseAnimation = () => {
      isVisible = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        pauseAnimation();
      } else {
        resumeAnimation();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Keep-Alive Tab 切换支持：当 canvas 所在 Tab 被隐藏时（display: none），暂停渲染节约 GPU/CPU
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          if (entry.isIntersecting) {
            resumeAnimation();
          } else {
            pauseAnimation();
          }
        }
      });
      observer.observe(canvas);
    }

    const draw = (val: number) => {
      const { nominalMinTps: minT, nominalMaxTps: maxT, healthScore: score } = propsRef.current;

      ctx.save();
      ctx.resetTransform?.();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const cx = cssWidth / 2;
      const cy = cssHeight * 0.82;
      const radius = cssWidth * 0.36;

      const startAngle = Math.PI * 0.8;
      const endAngle = Math.PI * 2.2;
      const sweep = endAngle - startAngle;

      // 底盘弧线
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#1e293b';
      ctx.stroke();

      // 标称基准区间
      const maxRange = Math.max(maxT * 1.3, 160);
      const minRatio = (minT / maxRange) * sweep;
      const maxRatio = (maxT / maxRange) * sweep;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle + minRatio, startAngle + maxRatio);
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#334155';
      ctx.stroke();

      // 实时速度填充弧
      const progress = Math.min(Math.max(val / maxRange, 0), 1.0);
      const currentAngle = startAngle + progress * sweep;

      const statusColor = score >= 85 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, currentAngle);
      ctx.lineWidth = 8;
      ctx.strokeStyle = statusColor;
      ctx.shadowColor = statusColor;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 指针
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const needleLen = radius - 6;
      ctx.lineTo(cx + Math.cos(currentAngle) * needleLen, cy + Math.sin(currentAngle) * needleLen);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // 轴心
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // 数码显示
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${val.toFixed(1)}`, cx, cy - 20);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText('TOKENS / SEC', cx, cy - 6);

      ctx.restore();
    };

    const startLoop = () => {
      const render = (now: number) => {
        if (!isVisible) return;
        if (!lastTimeRef.current) lastTimeRef.current = now;
        let dt = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;
        dt = Math.min(dt, 0.1); // 钳位防爆炸

        // Lerp 阻尼逼近
        const targetTps = propsRef.current.currentTps;
        const alpha = 1 - Math.exp(-dt / 0.12);
        displayTpsRef.current += (targetTps - displayTpsRef.current) * alpha;

        draw(displayTpsRef.current);
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
    };

    startLoop();

    return () => {
      pauseAnimation();
      document.removeEventListener('visibilitychange', handleVisibility);
      if (observer) observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="block mx-auto" />;
};

export default SpeedometerCanvas;
