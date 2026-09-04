/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export type SleepStatus = 'active' | 'status1' | 'status2';

// Inactivity Thresholds
const STATUS_1_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
const STATUS_2_INACTIVITY_MS = 3 * 60 * 60 * 1000; // 3 total hours (2.5 hours after Status 1)

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
  const [sleepStatus, setSleepStatus] = useState<SleepStatus>('active');
  const [countdown, setCountdown] = useState(300);
  const lastActiveTimeRef = useRef<number>(Date.now());
  const onCountdownExpiredRef = useRef(onCountdownExpired);

  const isAsleep = sleepStatus === 'status2';
  const isStatus1 = sleepStatus === 'status1';

  useEffect(() => {
    onCountdownExpiredRef.current = onCountdownExpired;
  }, [onCountdownExpired]);

  const wakeUp = useCallback(() => {
    lastActiveTimeRef.current = Date.now();
    setSleepStatus('active');
    setNow(new Date());
  }, []);

  const setIsAsleep = useCallback((val: boolean) => {
    if (val) {
      setSleepStatus('status2');
    } else {
      wakeUp();
    }
  }, [wakeUp]);

  // Track User Activity to prevent Sleep State (Throttled to minimize CPU overhead on frequent mouse moves)
  useEffect(() => {
    let lastActivityLogged = Date.now();
    const handleActivity = () => {
      const nowMs = Date.now();
      if (sleepStatus === 'status2') {
        // In full sleep mode (Status 2), wakeUp is triggered explicitly via overlay interaction
        return;
      }
      if (sleepStatus === 'status1') {
        // Status 1: User resumes activity, immediately return to active 1-second clock with real-time sync
        lastActiveTimeRef.current = nowMs;
        setSleepStatus('active');
        setNow(new Date());
        return;
      }
      // Active state: throttle updating lastActiveTimeRef to once every 10 seconds
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
  }, [sleepStatus]);

  // Unified Tick Management: Prefer Web Worker, gracefully fallback to setInterval
  useEffect(() => {
    const shouldRunWorker = !animationsDisabled || (animationsDisabled && useWebWorkers);
    let worker: Worker | null = null;
    let fallbackTimer: NodeJS.Timeout | null = null;

    const handleTick = () => {
      const current = new Date();
      setNow(current);

      const elapsedInactivity = Date.now() - lastActiveTimeRef.current;

      // Status transitions based on total elapsed inactivity
      if (elapsedInactivity >= STATUS_2_INACTIVITY_MS) {
        if (sleepStatus !== 'status2') {
          setSleepStatus('status2');
        }
      } else if (elapsedInactivity >= STATUS_1_INACTIVITY_MS) {
        if (sleepStatus !== 'status1') {
          setSleepStatus('status1');
        }
      } else {
        if (sleepStatus !== 'active') {
          setSleepStatus('active');
        }
      }

      // Automated 5-minute refresh for Live mode (and any eligible automated refresh modes)
      // Maintained across Active, Status 1, and Status 2
      const isEligibleForAutoRefresh =
        playMode === "Live" &&
        isDriveValidated &&
        !localPathsUnavailable &&
        (locationMode !== "Local" || isStartupReady);

      if (isEligibleForAutoRefresh) {
        setCountdown((prev) => {
          const step = sleepStatus === 'active' ? 1 : 60;
          if (prev <= step) {
            onCountdownExpiredRef.current?.();
            return 300;
          }
          return prev - step;
        });
      }
    };

    // Active ticks every 1 second (1000ms); Status 1 and Status 2 tick once every 1 minute (60000ms)
    const intervalDelay = sleepStatus === 'active' ? 1000 : 60000;

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
    sleepStatus,
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
    sleepStatus,
    setSleepStatus,
    isStatus1,
    isAsleep,
    setIsAsleep,
    wakeUp,
    countdown,
    setCountdown,
    formatCountdown,
  };
}
