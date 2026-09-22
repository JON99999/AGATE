import React, { useEffect, useState, useRef, useMemo } from 'react';
import { mp3WaveformCache, extractWaveformForUrl, mp3DurationCache } from '../lib/driveService';

interface WaveformVisualizerProps {
  url: string;
  currentTime?: number;
  duration?: number;
  isPlaying?: boolean;
  isPlayed?: boolean;
  barsCount?: number;
  className?: string;
}

// Generate deterministic fallback peaks from URL string so fallback is static and uniform
const generatePseudoPeaks = (str: string, count: number): number[] => {
  const peaks: number[] = [];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  for (let i = 0; i < count; i++) {
    const val = Math.abs(Math.sin(hash + i * 0.7) * 0.75 + Math.cos(hash * 0.3 + i * 1.3) * 0.25);
    peaks.push(Math.max(0.18, Math.min(1.0, val)));
  }
  return peaks;
};

// Design configuration variables for waveform spikes
const BAR_WIDTH_PX = 2; // Width of each bar spike in pixels
const BAR_GAP_PX = 1;   // Gap between spikes in pixels

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  url,
  currentTime = 0,
  duration = 0,
  isPlaying = false,
  isPlayed = false,
  barsCount: customBarsCount,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(200);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect && entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const pitch = BAR_WIDTH_PX + BAR_GAP_PX;
  const availableInnerWidth = Math.max(0, containerWidth - 4);
  const autoBarsCount = Math.max(1, Math.floor((availableInnerWidth + BAR_GAP_PX) / pitch));
  const effectiveBarsCount = customBarsCount ? Math.min(customBarsCount, autoBarsCount) : autoBarsCount;

  const [cachedPeaks, setCachedPeaks] = useState<number[] | null>(() => {
    return mp3WaveformCache.get(url) || null;
  });

  useEffect(() => {
    let isMounted = true;
    const existing = mp3WaveformCache.get(url);
    if (existing) {
      setCachedPeaks(existing);
    } else if (url) {
      extractWaveformForUrl(url).then((peaks) => {
        if (isMounted && peaks && peaks.length > 0) {
          setCachedPeaks(peaks);
        }
      });
    }

    const handleCached = (e: Event) => {
      const customEv = e as CustomEvent<{ url: string; peaks: number[] }>;
      if (customEv.detail && customEv.detail.url === url && isMounted) {
        setCachedPeaks(customEv.detail.peaks);
      }
    };

    window.addEventListener('mp3-waveform-cached', handleCached);
    return () => {
      isMounted = false;
      window.removeEventListener('mp3-waveform-cached', handleCached);
    };
  }, [url]);

  const peaks = useMemo(() => {
    if (cachedPeaks && cachedPeaks.length > 0) {
      if (cachedPeaks.length === effectiveBarsCount) return cachedPeaks;
      const res: number[] = [];
      const step = cachedPeaks.length / effectiveBarsCount;
      for (let i = 0; i < effectiveBarsCount; i++) {
        const idx = Math.floor(i * step);
        res.push(cachedPeaks[idx] || 0.2);
      }
      return res;
    }
    return generatePseudoPeaks(url || 'default', effectiveBarsCount);
  }, [cachedPeaks, url, effectiveBarsCount]);

  // Option A: Quantize/throttle currentTime to 1-second ticks during playback to limit updates
  const throttledTime = useMemo(() => {
    if (!isPlaying) return currentTime;
    return Math.floor(currentTime);
  }, [isPlaying, Math.floor(currentTime)]);

  let effectiveDuration = duration;
  if ((!effectiveDuration || effectiveDuration <= 0) && url) {
    const cached = mp3DurationCache.get(url);
    if (cached) {
      const parts = cached.split(':');
      if (parts.length === 2) {
        effectiveDuration = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      }
    }
  }

  const progressRatio = effectiveDuration > 0
    ? Math.min(1, Math.max(0, throttledTime / effectiveDuration))
    : (isPlaying ? 0.05 : (isPlayed ? 1 : 0));
    
  const activeIndex = Math.floor(progressRatio * effectiveBarsCount);

  // Option B & D: Render waveform onto an HTML5 Canvas layer (Hardware GPU compositing, 0 DOM elements, no CSS transitions)
  // Option C: Selective active monitoring
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const canvasHeight = 12;
    const totalCanvasWidth = effectiveBarsCount * BAR_WIDTH_PX + (effectiveBarsCount - 1) * BAR_GAP_PX;

    canvas.width = totalCanvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalCanvasWidth, canvasHeight);

    const isDarkMode = document.documentElement.classList.contains('dark');

    peaks.forEach((peak, i) => {
      let fillColor = isDarkMode ? '#475569' : '#cbd5e1';

      if (isPlaying) {
        if (i === activeIndex) {
          fillColor = isDarkMode ? '#e9d5ff' : '#7e22ce';
        } else if (i < activeIndex) {
          fillColor = isDarkMode ? '#c084fc' : '#9333ea';
        } else {
          fillColor = isDarkMode ? '#1e293b' : '#cbd5e1';
        }
      } else if (isPlayed) {
        fillColor = isDarkMode ? '#10b981' : '#059669';
      }

      const barHeight = Math.max(2, Math.round(peak * canvasHeight));
      const x = i * (BAR_WIDTH_PX + BAR_GAP_PX);
      const y = canvasHeight - barHeight;

      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, BAR_WIDTH_PX, barHeight);
    });
  }, [peaks, activeIndex, isPlaying, isPlayed, effectiveBarsCount]);

  return (
    <div 
      ref={containerRef}
      className={`w-full flex items-center justify-start h-[12px] px-0.5 py-0 rounded border border-slate-200/50 dark:border-slate-800/50 bg-[#f8fafc] dark:bg-slate-900/60 overflow-hidden select-none ${className}`}
      title={effectiveDuration > 0 ? `${Math.round(progressRatio * 100)}% played` : undefined}
    >
      <canvas 
        ref={canvasRef} 
        style={{
          width: `${effectiveBarsCount * BAR_WIDTH_PX + (effectiveBarsCount - 1) * BAR_GAP_PX}px`,
          height: '12px'
        }}
        className="block shrink-0"
      />
    </div>
  );
};
