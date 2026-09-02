/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseAppClockOptions {
  animationsDisabled: boolean;
  useWebWorkers?: boolean;
  playMode: string;
  isDriveValidated: boolean;
  localPathsUnavailable: boolean;
  locationMode: string;
  isStartupReady: boolean;
  onCountdownExpired?: () => void;
  token?: string | null;
}

export function useAppClock({
  animationsDisabled,
  useWebWorkers = true,
  playMode,
  isDriveValidated,
  localPathsUnavailable,
  locationMode,
  isStartupReady,
  onCountdownExpired,
  token,
}: UseAppClockOptions) {
  const [now, setNow] = useState<Date>(() => new Date());
  const [isAsleep, setIsAsleep] = useState(false);
  const [countdown, setCountdown] = useState(300);
  const lastActiveTimeRef = useRef<number>(Date.now());
  const onCountdownExpiredRef = useRef(onCountdownExpired);

  useEffect(() => {
    onCountdownExpiredRef.current = onCountdownExpired;
  }, [onCountdownExpired]);

  const wakeUp = useCallback(() => {
    lastActiveTimeRef.current = Date.now();
    setIsAsleep(false);
  }, []);

  // Track User Activity to prevent Sleep State (Throttled to minimize CPU overhead on frequent mouse moves)
  useEffect(() => {
    let lastActivityLogged = Date.now();
    const handleActivity = () => {
      if (isAsleep) return;
      const nowMs = Date.now();
      if (nowMs - lastActivityLogged >= 10000) {
        lastActivityLogged = nowMs;
        lastActiveTimeRef.current = nowMs;
      }
    };

    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("mousedown", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity, { passive: true });
    window.addEventListener("scroll", handleActivity, { passive: true });
    window.addEventListener("touchstart", handleActivity, { passive: true });

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [isAsleep]);

  // Unified Tick Management: Prefer Web Worker, gracefully fallback to setInterval
  useEffect(() => {
    const shouldRunWorker = !animationsDisabled || (animationsDisabled && useWebWorkers);
    let worker: Worker | null = null;
    let fallbackTimer: NodeJS.Timeout | null = null;

    const handleTick = () => {
      const current = new Date();
      setNow(current);

      // Check sleep timeout (30 mins = 1,800,000 ms)
      if (!isAsleep && Date.now() - lastActiveTimeRef.current >= 30 * 60 * 1000) {
        setIsAsleep(true);
      }

      if (
        playMode === "Live" &&
        !isAsleep &&
        isDriveValidated &&
        !localPathsUnavailable &&
        (locationMode !== "Local" || isStartupReady)
      ) {
        setCountdown((prev) => {
          const step = isAsleep ? 10 : 1;
          if (prev <= step) {
            onCountdownExpiredRef.current?.();
            return 300;
          }
          return prev - step;
        });
      }
    };

    const intervalDelay = isAsleep ? 10000 : 1000;

    if (shouldRunWorker && typeof Worker !== 'undefined') {
      try {
        const workerCode = `
          let intervalId = null;
          self.onmessage = function(e) {
            if (e.data.action === 'start') {
              if (intervalId) clearInterval(intervalId);
              const delay = e.data.delay || 1000;
              intervalId = setInterval(() => {
                self.postMessage({ type: 'tick' });
              }, delay);
            } else if (e.data.action === 'stop') {
              if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
              }
            }
          };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        worker = new Worker(workerUrl);

        worker.onmessage = (e) => {
          if (e.data.type === 'tick') {
            handleTick();
          }
        };

        worker.postMessage({ action: 'start', delay: intervalDelay });
      } catch (err) {
        console.error("Web Worker timer initialization failed, falling back to interval:", err);
        fallbackTimer = setInterval(handleTick, intervalDelay);
      }
    } else {
      fallbackTimer = setInterval(handleTick, intervalDelay);
    }

    return () => {
      if (worker) {
        worker.postMessage({ action: 'stop' });
        worker.terminate();
      }
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
      }
    };
  }, [
    token,
    playMode,
    isAsleep,
    animationsDisabled,
    useWebWorkers,
    isDriveValidated,
    localPathsUnavailable,
    locationMode,
    isStartupReady,
  ]);

  const formatCountdown = useCallback((sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, []);

  return {
    now,
    setNow,
    isAsleep,
    setIsAsleep,
    wakeUp,
    countdown,
    setCountdown,
    formatCountdown,
  };
}
