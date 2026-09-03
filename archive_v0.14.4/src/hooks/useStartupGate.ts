/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

export type StartupStatus = 'IDLE' | 'CHECKING' | 'READY' | 'NOT_DEFINED' | 'INACCESSIBLE' | 'ERROR';

export interface StartupGateResult {
  ready: boolean;
  status: StartupStatus;
  message?: string;
  mode?: string;
  missingDefinitions?: {
    mp3s?: boolean;
    calendar?: boolean;
    logs?: boolean;
  };
  missingFolders?: {
    mp3s?: boolean;
    calendar?: boolean;
    logs?: boolean;
  };
}

export function useStartupGate() {
  const [startupStatus, setStartupStatus] = useState<StartupStatus>('IDLE');
  const [startupMessage, setStartupMessage] = useState<string>('');
  const [missingDefinitions, setMissingDefinitions] = useState<{ mp3s?: boolean; calendar?: boolean; logs?: boolean }>({});
  const [missingFolders, setMissingFolders] = useState<{ mp3s?: boolean; calendar?: boolean; logs?: boolean }>({});

  const verifyStartup = useCallback(async (settingsOverride?: any): Promise<StartupGateResult> => {
    setStartupStatus('CHECKING');
    try {
      const res = await fetch('/api/startup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsOverride || {})
      });

      if (!res.ok) {
        setStartupStatus('ERROR');
        setStartupMessage(`Server responded with error status ${res.status}`);
        return { ready: false, status: 'ERROR', message: `Server error: ${res.status}` };
      }

      const data: StartupGateResult = await res.json();

      if (data.ready) {
        setStartupStatus('READY');
        setStartupMessage(data.message || 'Startup verified');
        setMissingDefinitions({});
        setMissingFolders({});
      } else {
        const nextStatus = (data.status as StartupStatus) || 'INACCESSIBLE';
        setStartupStatus(nextStatus);
        setStartupMessage(data.message || 'Startup verification failed');
        setMissingDefinitions(data.missingDefinitions || {});
        setMissingFolders(data.missingFolders || {});
      }

      return data;
    } catch (err: any) {
      setStartupStatus('ERROR');
      setStartupMessage(err.message || 'Network error during startup check');
      return {
        ready: false,
        status: 'ERROR',
        message: err.message || 'Verification failed'
      };
    }
  }, []);

  const resetStartupGate = useCallback(() => {
    setStartupStatus('IDLE');
    setStartupMessage('');
    setMissingDefinitions({});
    setMissingFolders({});
  }, []);

  return {
    startupStatus,
    isStartupReady: startupStatus === 'READY',
    startupMessage,
    missingDefinitions,
    missingFolders,
    verifyStartup,
    resetStartupGate
  };
}
