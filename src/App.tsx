/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, List, Settings, Plus, Play, CheckCircle, AlertCircle, RefreshCw, LogOut, ChevronLeft, ChevronRight, Save, Trash2, History, Folder, HardDrive, Wifi, WifiOff, ShieldCheck, Mail, Globe, ExternalLink, Download, FolderOpen, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addHours, subHours, isSameMinute, startOfHour, addMinutes, isAfter, isBefore, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Schedule, ScheduleType, LogEntry } from './types';
import PlayerTab from './components/PlayerTab';
import SchedulerTab from './components/SchedulerTab';
import LogTab from './components/LogTab';
import GoogleAuthSection from './components/GoogleAuthSection';
import LocalHelpModal from './components/LocalHelpModal';
import { cn, extractFolderId } from './lib/utils';
import { 
  initAuth, 
  googleSignIn, 
  handleLogout, 
  getAccessToken, 
  setOverrideAccessToken,
  loadSchedulesFromDrive, 
  saveSchedulesToDrive, 
  loadLogsFromDrive, 
  appendLogToDrive, 
  listMP3sFromDrive, 
  updateAudioCache, 
  DRIVE_FOLDERS,
  mp3BlobCache,
  mp3DurationCache,
  validateGoogleDriveAccess,
  getSavedSettings,
  saveSettings,
  LocationSettings,
  DEFAULT_SETTINGS,
  driveFileNameCache,
  availableFilesCache,
  triggerDriveBackup
} from './lib/driveService';

export default function App() {
  const isPlayerMode = (import.meta as any).env?.VITE_APP_MODE === 'Player';

  // Custom fetch override to support local environment ports transparently
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/')) {
      const isCustomProtocol = typeof window !== 'undefined' && !window.location.protocol.startsWith('http');
      const baseUrl = isCustomProtocol ? 'http://127.0.0.1:3000' : '';
      url = `${baseUrl}${url}`;
    }
    return window.fetch(url, init);
  };

  const [activeTab, setActiveTab] = useState<'player' | 'scheduler' | 'log'>('player');
  const [durationUpdates, setDurationUpdates] = useState(0);

  // Fetch folder name/descriptor helper
  const fetchDriveFolderDescriptor = async (folderId: string, currentToken: string | null): Promise<string> => {
    if (!folderId) return 'Not Configured';
    let defaultName = '';
    if (folderId === '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED') defaultName = 'scheduledata';
    else if (folderId === '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch') defaultName = 'mp3library';
    else if (folderId === '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx') defaultName = 'logs';

    if (!currentToken) return defaultName || `Google Drive Folder [${folderId.substring(0, 6)}...]`;
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name,owners(displayName,emailAddress)`, {
        headers: {
          'Authorization': `Bearer ${currentToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        const folderName = data.name || defaultName || 'Unnamed Folder';
        const ownerName = data.owners?.[0]?.displayName || '';
        const ownerEmail = data.owners?.[0]?.emailAddress || '';
        const ownerStr = ownerName && ownerEmail 
          ? ` (${ownerName}, ${ownerEmail})` 
          : ownerName 
            ? ` (${ownerName})` 
            : ownerEmail 
              ? ` (${ownerEmail})` 
              : '';
        return `${folderName}${ownerStr}`;
      }
    } catch (e) {
      console.warn('Failed to fetch name for drive folder ID:', folderId, e);
    }
    return defaultName || `Google Drive Folder [${folderId.substring(0, 6)}...]`;
  };

  // Archiving/backup implementation
  const runArchiving = async (mode: 'Local' | 'Drive' | 'Demo') => {
    if (hasBackedUpThisSessionRef.current) {
      console.log('Archiving already completed for this session of the folder. Skipping.');
      return;
    }
    try {
      if (mode === 'Local') {
        const res = await fetch('/api/trigger-backup', { method: 'POST' });
        if (!res.ok) {
          throw new Error('Local archiving failed');
        }
      } else if (mode === 'Drive' || mode === 'Demo') {
        await triggerDriveBackup();
      }
      console.log('Archiving of schedules and logs completed successfully');
      hasBackedUpThisSessionRef.current = true;
    } catch (err: any) {
      console.error('Archiving sequence failed: ', err);
      setIsDriveValidated(false);
      if (mode === 'Local') {
        setLocalPathsUnavailable(true);
      } else {
        setDriveValidationError(err.message || 'Archiving failed: Google Drive connection is inaccessible or blocked.');
      }
      setShowLocationsModal(true);
    }
  };

  useEffect(() => {
    const handler = () => setDurationUpdates(prev => prev + 1);
    window.addEventListener('mp3-duration-cached', handler);
    return () => window.removeEventListener('mp3-duration-cached', handler);
  }, []);

  useEffect(() => {
    document.title = isPlayerMode ? 'Interstitial-er Player' : 'Interstitial-er Admin';
  }, [isPlayerMode]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [syncTime, setSyncTime] = useState(new Date());
  const [countdown, setCountdown] = useState(300);
  const [scrollTrigger, setScrollTrigger] = useState(0);

  // Prerecord States (defaults to 2 hours)
  const [playMode, setPlayMode] = useState<'Live' | 'Prerecord'>('Live');
  const [prerecordDate, setPrerecordDate] = useState<Date | null>(null);
  const [showPrerecordModal, setShowPrerecordModal] = useState(false);
  const [prerecordDateInput, setPrerecordDateInput] = useState('');
  const [prerecordTimeInput, setPrerecordTimeInput] = useState('');
  const [prerecordHoursInput, setPrerecordHoursInput] = useState('2');
  const [prerecordMinutesInput, setPrerecordMinutesInput] = useState('0');
  const [prerecordLengthMinutes, setPrerecordLengthMinutes] = useState(120);
  const [prerecordError, setPrerecordError] = useState<string | null>(null);

  const isPre = playMode === 'Prerecord';

  // Export Prerecord states
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'configuring' | 'exporting' | 'success' | 'error'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<{
    exportFolder: string;
    copiedCount: number;
    missingCount: number;
    totalCount: number;
    baseFilename?: string;
    txtFilename?: string;
    m3uFilename?: string;
  } | null>(null);

  // Export configuration draft states
  const [exportDestinationInput, setExportDestinationInput] = useState('');
  const [exportFolderPrefixInput, setExportFolderPrefixInput] = useState('Prerecord-Export');
  const [exportTextPrefixInput, setExportTextPrefixInput] = useState('Prerecord schedule');
  const [exportPlaylistPrefixInput, setExportPlaylistPrefixInput] = useState('Interstitial playlist');

  // Custom Folder Location settings matching multi modes: Local, Drive, Demo
  const [locationMode, setLocationMode] = useState<'Local' | 'Drive' | 'Demo'>('Demo');
  const [localPathMP3s, setLocalPathMP3s] = useState('');
  const [localPathLogs, setLocalPathLogs] = useState('');
  const [localPathSchedules, setLocalPathSchedules] = useState('');
  
  const [driveFolderLogs, setDriveFolderLogs] = useState('');
  const [driveFolderMP3s, setDriveFolderMP3s] = useState('');
  const [driveFolderPreferences, setDriveFolderPreferences] = useState('');

  // Draft States for Folder Configuration Form inputs
  const [draftLocalPathMP3s, setDraftLocalPathMP3s] = useState('');
  const [draftLocalPathLogs, setDraftLocalPathLogs] = useState('');
  const [draftLocalPathSchedules, setDraftLocalPathSchedules] = useState('');

  const [draftDriveFolderLogs, setDraftDriveFolderLogs] = useState('');
  const [draftDriveFolderMP3s, setDraftDriveFolderMP3s] = useState('');
  const [draftDriveFolderPreferences, setDraftDriveFolderPreferences] = useState('');
  
  const [localPathsUnavailable, setLocalPathsUnavailable] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [locationsSuccess, setLocationsSuccess] = useState<string | null>(null);

  // Google Drive & Auth States
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isDriveActive, setIsDriveActive] = useState(false);
  const [isDriveValidated, setIsDriveValidated] = useState(false);
  const [isValidatingDrive, setIsValidatingDrive] = useState(false);
  const [driveValidationError, setDriveValidationError] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem('interstitialer_google_client_id') || '776109899422-4ui9sqip5tvjarmcmrmnb4p3pdni0b2n.apps.googleusercontent.com');
  const [isPollingExternal, setIsPollingExternal] = useState(false);
  const [showMethodB, setShowMethodB] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [driveMP3s, setDriveMP3s] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const fetchInProgressRef = useRef(false);
  const hasBackedUpThisSessionRef = useRef(false);
  const [showLocationsModal, setShowLocationsModal] = useState(false);
  const [showLocalHelp, setShowLocalHelp] = useState(false);
  
  // Prerecord Confirmation states
  const [showPrerecordConfirmStep, setShowPrerecordConfirmStep] = useState(false);
  const [prerecordConfirmDetails, setPrerecordConfirmDetails] = useState<{ startDate: Date; totalMinutes: number } | null>(null);

  // Google Drive folder descriptors and edit fields
  const [driveFolderDescMap, setDriveFolderDescMap] = useState<Record<string, string>>({
    '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED': 'scheduledata',
    '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch': 'mp3library',
    '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx': 'logs'
  });
  const [editingDriveField, setEditingDriveField] = useState<'preferences' | 'mp3s' | 'logs' | null>(null);
  const [tempPasteLink, setTempPasteLink] = useState('');

  // Sync map descriptors for drive folders when authenticated
  useEffect(() => {
    const fetchNames = async () => {
      const currentToken = getAccessToken() || token;
      if (!currentToken) return;

      const idsToFetch = [
        driveFolderPreferences, driveFolderMP3s, driveFolderLogs,
        '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED', '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch', '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx'
      ].filter(id => id && (!driveFolderDescMap[id] || !driveFolderDescMap[id].includes('(')));

      if (idsToFetch.length === 0) return;

      const newMap = { ...driveFolderDescMap };
      let changed = false;
      for (const id of idsToFetch) {
        try {
          const desc = await fetchDriveFolderDescriptor(id, currentToken);
          newMap[id] = desc;
          changed = true;
        } catch (e) {}
      }
      if (changed) {
        setDriveFolderDescMap(newMap);
      }
    };
    fetchNames();
  }, [token, driveFolderPreferences, driveFolderMP3s, driveFolderLogs]);

  // Sync map descriptors for draft states as well
  useEffect(() => {
    const fetchDraftNames = async () => {
      const currentToken = getAccessToken() || token;
      if (!currentToken) return;

      const idsToFetch = [
        draftDriveFolderPreferences, draftDriveFolderMP3s, draftDriveFolderLogs,
        '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED', '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch', '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx'
      ].filter(id => id && (!driveFolderDescMap[id] || !driveFolderDescMap[id].includes('(')));

      if (idsToFetch.length === 0) return;

      const newMap = { ...driveFolderDescMap };
      let changed = false;
      for (const id of idsToFetch) {
        try {
          const desc = await fetchDriveFolderDescriptor(id, currentToken);
          newMap[id] = desc;
          changed = true;
        } catch (e) {}
      }
      if (changed) {
        setDriveFolderDescMap(newMap);
      }
    };
    fetchDraftNames();
  }, [token, draftDriveFolderPreferences, draftDriveFolderMP3s, draftDriveFolderLogs]);

  // Fancy Browser folder modal states
  const [showFancyBrowser, setShowFancyBrowser] = useState(false);
  const [fancyBrowserPath, setFancyBrowserPath] = useState('');
  const [fancyBrowserFolders, setFancyBrowserFolders] = useState<string[]>([]);
  const [fancyBrowserParent, setFancyBrowserParent] = useState<string | null>(null);
  const [fancyBrowserError, setFancyBrowserError] = useState<string | null>(null);
  const [fancyBrowserTargetField, setFancyBrowserTargetField] = useState<'schedules' | 'mp3s' | 'logs' | null>(null);

  // Saving state for Folders Modal to prevent button flickering
  const [isSavingAndVerifying, setIsSavingAndVerifying] = useState(false);

  const checkLocalPathsSafely = async (mp3s: string, logs: string, schedules: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/check-local-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localPathMP3s: mp3s,
          localPathLogs: logs,
          localPathSchedules: schedules
        })
      });
      const data = await res.json();
      return !!data.exists;
    } catch {
      return false;
    }
  };

  // Synchronization hook to update editable drafts when location settings modal opens
  useEffect(() => {
    if (showLocationsModal) {
      setDraftLocalPathMP3s(localPathMP3s || '');
      setDraftLocalPathLogs(localPathLogs || '');
      setDraftLocalPathSchedules(localPathSchedules || '');
      setDraftDriveFolderLogs(driveFolderLogs || '');
      setDraftDriveFolderMP3s(driveFolderMP3s || '');
      setDraftDriveFolderPreferences(driveFolderPreferences || '');
    }
  }, [showLocationsModal, localPathMP3s, localPathLogs, localPathSchedules, driveFolderLogs, driveFolderMP3s, driveFolderPreferences]);

  // Google Auth initialization with Validation
  useEffect(() => {
    const settings = getSavedSettings();
    let hasPrepopulated = false;
    if (!settings.driveFolderLogs) {
      settings.driveFolderLogs = '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx';
      hasPrepopulated = true;
    }
    if (!settings.driveFolderMP3s) {
      settings.driveFolderMP3s = '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch';
      hasPrepopulated = true;
    }
    if (!settings.driveFolderPreferences) {
      settings.driveFolderPreferences = '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED';
      hasPrepopulated = true;
    }

    if (hasPrepopulated) {
      localStorage.setItem('interstitialer_location_settings', JSON.stringify(settings));
    }

    setLocationMode(settings.mode);
    setLocalPathMP3s(settings.localPathMP3s || '');
    setLocalPathLogs(settings.localPathLogs || '');
    setLocalPathSchedules(settings.localPathSchedules || '');
    setDriveFolderLogs(settings.driveFolderLogs || '');
    setDriveFolderMP3s(settings.driveFolderMP3s || '');
    setDriveFolderPreferences(settings.driveFolderPreferences || '');

    // Notify backend
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    }).catch(() => {});

    if (settings.mode === 'Local') {
      checkLocalPathsSafely(
        settings.localPathMP3s || '',
        settings.localPathLogs || '',
        settings.localPathSchedules || ''
      )
      .then(exists => {
        setIsDriveActive(true);
        if (exists) {
          setIsDriveValidated(true);
          setLocalPathsUnavailable(false);
          fetchDataForMode(settings);
        } else {
          setIsDriveValidated(false);
          setLocalPathsUnavailable(true);
          setLoading(false);
          setShowLocationsModal(true);
        }
      })
      .catch(() => {
        setIsDriveActive(true);
        setIsDriveValidated(false);
        setLocalPathsUnavailable(true);
        setLoading(false);
        setShowLocationsModal(true);
      });
    } else if (settings.mode === 'Demo') {
      setIsDriveActive(true);
      setIsDriveValidated(false);
      setLocalPathsUnavailable(false);
    }

    const unsubscribe = initAuth(
      async (currentUser, tokenStr) => {
        const uSettings = getSavedSettings();
        setUser(currentUser);
        setToken(tokenStr);

        if (uSettings.mode === 'Drive' || uSettings.mode === 'Demo') {
          setIsDriveActive(true);
          setIsValidatingDrive(true);
          setDriveValidationError(null);
          try {
            const success = await validateGoogleDriveAccess();
            if (success) {
              setIsDriveValidated(true);
              setDriveValidationError(null);
              fetchDataForMode(uSettings);
            } else {
              setIsDriveValidated(false);
              setDriveValidationError('Connected Google account lacks read/write access to one or more configured shared directories.');
              setLoading(false);
              setShowLocationsModal(true);
            }
          } catch (err: any) {
            setIsDriveValidated(false);
            setDriveValidationError(err.message || 'Error occurred while validating folders.');
            setLoading(false);
            setShowLocationsModal(true);
          } finally {
            setIsValidatingDrive(false);
          }
        } else {
          setIsDriveActive(true);
          setIsDriveValidated(true);
          fetchDataForMode(uSettings);
        }
      },
      () => {
        const uSettings = getSavedSettings();
        setUser(null);
        setToken(null);
        if (uSettings.mode === 'Drive' || uSettings.mode === 'Demo') {
          setIsDriveActive(false);
          setIsDriveValidated(false);
          setDriveMP3s([]);
          setLoading(false);
          setShowLocationsModal(true);
        } else {
          setLoading(false);
        }
      }
    );
    return () => unsubscribe();
  }, []);

  const fetchDataForMode = async (settings = getSavedSettings()) => {
    if (fetchInProgressRef.current) {
      console.log('fetchDataForMode already inside concurrent cycle. De-duplicating sequence.');
      return;
    }
    fetchInProgressRef.current = true;
    setIsSyncing(true);
    try {
      if (settings.mode === 'Local') {
        const [localSchedules, localLogs, localMP3s] = await Promise.all([
          fetch('/api/schedules').then(r => r.json()).catch(() => []),
          fetch('/api/logs').then(r => r.json()).catch(() => []),
          fetch('/api/local-mp3s').then(r => r.json()).catch(() => [])
        ]);
        setSchedules(localSchedules || []);
        setLogs(localLogs || []);
        
        availableFilesCache.clear();
        const mappedMP3s = (localMP3s || []).map((file: any) => {
          if (file.path && file.name) {
            driveFileNameCache.set(file.path, file.name);
            availableFilesCache.set(file.name, {
              path: file.path,
              size: file.size,
              duration: file.duration || '0:15'
            });
          }
          return {
            name: file.name,
            size: file.size,
            duration: file.duration || '0:15',
            path: file.path
          };
        });
        setDriveMP3s(mappedMP3s);
        setSyncTime(new Date());
        setScrollTrigger(prev => prev + 1);
        setIsDriveActive(true);
        setIsDriveValidated(true);
      } else {
        // 'Drive' or 'Demo' mode: both pull from Google Drive
        const hasToken = !!(getAccessToken() || token);
        if (!hasToken) {
          setIsDriveValidated(false);
          setIsSyncing(false);
          setLoading(false);
          return;
        }

        // Validate Google Drive (or Demo mode virtual folders) prior to any file read
        const isValid = await validateGoogleDriveAccess();
        if (!isValid) {
          setIsDriveValidated(false);
          setIsSyncing(false);
          setLoading(false);
          return;
        }

        setIsDriveValidated(true);

        const hasPreferencesFolder = !!DRIVE_FOLDERS.preferences;
        const hasLogsFolder = !!DRIVE_FOLDERS.logs;
        const hasMP3Folder = !!DRIVE_FOLDERS.mp3s;

        let driveSchedules: Schedule[] = [];
        let driveLogsStr: LogEntry[] = [];
        let mp3Files: any[] = [];

        if (hasPreferencesFolder) {
          try {
            driveSchedules = await loadSchedulesFromDrive();
          } catch (e) {
            console.warn('Schedules Folder not set or inaccessible, using empty.', e);
          }
        }
        if (hasLogsFolder) {
          try {
            driveLogsStr = await loadLogsFromDrive();
          } catch (e) {
            console.warn('Logs Folder not set or inaccessible, using empty.', e);
          }
        }
        if (hasMP3Folder) {
          try {
            mp3Files = await listMP3sFromDrive();
          } catch (e) {
            console.warn('MP3s Folder not set or inaccessible, using empty.', e);
          }
        }

        setSchedules(driveSchedules || []);
        setLogs(driveLogsStr || []);
        
        availableFilesCache.clear();
        (mp3Files || []).forEach((file: any) => {
          if (file.path && file.name) {
            availableFilesCache.set(file.name, {
              path: file.path,
              size: file.size,
              duration: file.duration || '0:15'
            });
          }
        });

        setDriveMP3s(mp3Files || []);
        setSyncTime(new Date());
        setScrollTrigger(prev => prev + 1);
        setIsDriveActive(true);
        setIsDriveValidated(true);
      }
      // Trigger background archiving invisibly on successful fetch
      await runArchiving(settings.mode).catch(() => {});
    } catch (error) {
      console.error('Failed to fetch data for mode ' + settings.mode, error);
    } finally {
      setIsSyncing(false);
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  };

  const fetchData = async () => {
    const settings = getSavedSettings();
    await fetchDataForMode(settings);
  };

  const handleRefresh = () => {
    fetchData();
    setCountdown(300);
  };

  useEffect(() => {
    const settings = getSavedSettings();
    if ((settings.mode === 'Drive' || settings.mode === 'Demo') && isDriveValidated) {
      fetchData();
    }
  }, [token, isDriveValidated]);

  // Sync Timer Logic
  useEffect(() => {
    const timer = setInterval(() => {
      const current = new Date();
      setNow(current);
      if (playMode === 'Live') {
        setCountdown(prev => {
          if (prev <= 1) {
            if (isDriveValidated) {
              fetchData();
            }
            return 300;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [token, isDriveValidated, playMode]);

  // Background Cache Synchronization Logic (Pre-loading Audio into memory)
  useEffect(() => {
    const syncCache = async () => {
      // Find all MP3 files used in active schedules
      const activeUrls = schedules
        .filter(s => s.enabled && s.mp3Url)
        .map(s => s.mp3Url);

      try {
        await updateAudioCache(activeUrls, getAccessToken() || token);
        // Force-refresh status representation to trigger card border transitions
        setScrollTrigger(prev => prev + 1);
      } catch (err) {
        console.error('Failed to sync audio cache:', err);
      }
    };

    if (schedules.length > 0) {
      syncCache();
    }
  }, [schedules, token]);

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const saveSchedules = async (newSchedules: Schedule[]) => {
    const settings = getSavedSettings();
    if (settings.mode === 'Local') {
      try {
        await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSchedules)
        });
        setSchedules(newSchedules);
      } catch (error) {
        console.error('Failed to save schedules locally:', error);
      }
      return;
    }

    try {
      const currentToken = getAccessToken() || token;
      if (!currentToken) {
        throw new Error('Not connected to Google Drive. Saving is disabled.');
      }
      await saveSchedulesToDrive(newSchedules);
      setSchedules(newSchedules);
    } catch (error) {
      console.error('Failed to save schedules:', error);
    }
  };

  const addLog = async (entry: LogEntry) => {
    const settings = getSavedSettings();
    const enrichedEntry: LogEntry = {
      ...entry,
      playMode: playMode,
      logTimeStamp: new Date().toISOString(),
      timestamp: playMode === 'Prerecord' 
        ? (entry.scheduledTime || entry.timestamp) 
        : new Date().toISOString()
    };

    if (settings.mode === 'Local') {
      try {
        await fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enrichedEntry)
        });
        // Reload logs from backend dynamic storage
        const updatedLogs = await fetch('/api/logs').then(r => r.json());
        setLogs(updatedLogs);
      } catch (error) {
        console.error('Failed to save log locally:', error);
      }
      return;
    }

    try {
      const currentToken = getAccessToken() || token;
      if (!currentToken) {
        throw new Error('Not connected to Google Drive. Saving logs is disabled.');
      }

      const updatedLogs = await appendLogToDrive(enrichedEntry);
      setLogs(updatedLogs);
    } catch (error) {
      console.error('Failed to add log:', error);
    }
  };

  const handleToggleMode = () => {
    if (playMode === 'Live') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setPrerecordDateInput(format(tomorrow, 'yyyy-MM-dd'));
      setPrerecordTimeInput('12:00');
      setPrerecordHoursInput('2');
      setPrerecordMinutesInput('0');
      setPrerecordError(null);
      setShowPrerecordConfirmStep(false);
      setPrerecordConfirmDetails(null);
      setShowPrerecordModal(true);
    } else {
      setPlayMode('Live');
      setPrerecordDate(null);
      setCountdown(300);
      setNow(new Date());
    }
  };

  const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    let val = rawVal.replace(/[^0-9]/g, '');
    
    if (val.length > 4) {
      val = val.substring(0, 4);
    }
    
    if (val.length > 2) {
      val = `${val.substring(0, 2)}:${val.substring(2)}`;
    }
    
    setPrerecordTimeInput(val);
  };

  const handleActivatePrerecord = (e: React.FormEvent) => {
    e.preventDefault();
    setPrerecordError(null);

    if (!prerecordDateInput || !prerecordTimeInput) {
      setPrerecordError('Both date and time inputs are required.');
      return;
    }

    // Validate 24-hour format
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(prerecordTimeInput)) {
      setPrerecordError('Please enter a valid 24-hour time format: HH:mm (from 00:00 to 23:59).');
      return;
    }

    const hours = parseInt(prerecordHoursInput, 10);
    const mins = parseInt(prerecordMinutesInput, 10);

    if (isNaN(hours) || isNaN(mins) || hours < 0 || mins < 0 || (hours === 0 && mins === 0)) {
      setPrerecordError('Please enter a valid show length greater than 0 minutes.');
      return;
    }

    try {
      const dateStr = `${prerecordDateInput}T${prerecordTimeInput}:00`;
      const parsedDate = parseISO(dateStr);

      if (isNaN(parsedDate.getTime())) {
        setPrerecordError('Please enter a valid format for date and time.');
        return;
      }

      if (isBefore(parsedDate, new Date())) {
        setPrerecordError('The prerecord start time must be in the future.');
        return;
      }

      const totalMinutes = (hours * 60) + mins;
      setPrerecordConfirmDetails({
        startDate: parsedDate,
        totalMinutes
      });
      setShowPrerecordConfirmStep(true);
    } catch (err: any) {
      setPrerecordError(err.message || 'Error occurred while validating date and time.');
    }
  };

  const handleFinalConfirmPrerecord = () => {
    if (prerecordConfirmDetails) {
      setPrerecordLengthMinutes(prerecordConfirmDetails.totalMinutes);
      setPrerecordDate(prerecordConfirmDetails.startDate);
      setPlayMode('Prerecord');
      setShowPrerecordConfirmStep(false);
      setShowPrerecordModal(false);
      setPrerecordConfirmDetails(null);
      handleRefresh();
    }
  };

  const handleExportPrerecord = () => {
    if (!prerecordDate) return;
    setExportDestinationInput(localPathMP3s || '');
    setExportFolderPrefixInput('Prerecord-Export');
    setExportTextPrefixInput('Prerecord schedule');
    setExportPlaylistPrefixInput('Interstitial playlist');
    setExportState('configuring');
    setExportError(null);
    setExportResult(null);
    setShowExportModal(true);
  };

  const handleBrowseExportDestination = async () => {
    try {
      const res = await fetch('/api/browse-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.path) {
        setExportDestinationInput(data.path);
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to open folder selection window.');
    }
  };

  const runExportPrerecord = async () => {
    if (!prerecordDate) return;
    
    setExportState('exporting');
    setExportError(null);
    setExportResult(null);

    try {
      // 1. Recreate timeline slots exactly like in PlayerTab
      const slots = [];
      let current = new Date(prerecordDate);
      current.setSeconds(0, 0);
      
      const end = new Date(current.getTime() + prerecordLengthMinutes * 60 * 1000);
      
      while (current.getTime() < end.getTime()) {
        slots.push(new Date(current));
        current = new Date(current.getTime() + 60 * 1000);
      }

      // 2. Filter & map slot matching schedules
      const itemsToExport: any[] = [];
      slots.forEach(slot => {
        const day = slot.getDay();
        const hour = slot.getHours();
        const minute = slot.getMinutes();
        const dateStr = format(slot, 'yyyy-MM-dd');

        const activeSchedules = schedules.filter(s => {
          if (!s.enabled) return false;
          if (s.type === ScheduleType.ONE_TIME) {
            const hourStr = format(slot, 'HH');
            return s.date === dateStr && s.minute === minute && s.time === hourStr;
          }
          if (s.type === ScheduleType.BASIC_HOURLY) {
            const afterStart = s.startDate ? !isBefore(slot, parseISO(s.startDate)) : true;
            const beforeEnd = s.endDate ? !isAfter(slot, parseISO(s.endDate)) : true;
            return s.minute === minute && afterStart && beforeEnd;
          }
          if (s.type === ScheduleType.ADVANCED) {
            const afterStart = s.startDate ? !isBefore(slot, parseISO(s.startDate)) : true;
            const beforeEnd = s.endDate ? !isAfter(slot, parseISO(s.endDate)) : true;
            
            let ruleMatch = false;
            if (s.gridRules && s.gridRules.length > 0) {
              ruleMatch = s.gridRules.includes(`${day}-${hour}`);
            } else {
              const dayMatch = s.days?.includes(day);
              const hourMatch = s.hours?.includes(hour);
              ruleMatch = !!(dayMatch && hourMatch);
            }
            
            return s.minute === minute && ruleMatch && afterStart && beforeEnd;
          }
          return false;
        });

        activeSchedules.forEach(s => {
          itemsToExport.push({
            slotTime: format(slot, 'HH:mm'),
            fileName: s.mp3Url,
            scheduleName: s.name,
            scheduleId: s.id,
            minute: s.minute
          });
        });
      });

      if (itemsToExport.length === 0) {
        setExportState('error');
        setExportError('No active scheduled breaks found in this prerecord timeframe.');
        return;
      }

      // 3. Make post request to endpoint
      const response = await fetch('/api/export-prerecord', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prerecordDate: prerecordDate.toISOString(),
          lengthMinutes: prerecordLengthMinutes,
          items: itemsToExport,
          exportDestination: exportDestinationInput,
          folderPrefix: exportFolderPrefixInput,
          textPrefix: exportTextPrefixInput,
          playlistPrefix: exportPlaylistPrefixInput
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Server reported failure');
      }

      const data = await response.json();
      if (data.success) {
        setExportState('success');
        setExportResult({
          exportFolder: data.exportFolderPath,
          copiedCount: data.copiedCount,
          missingCount: data.missingCount,
          totalCount: data.totalCount,
          txtFilename: data.txtFilename,
          m3uFilename: data.m3uFilename,
          baseFilename: data.exportFolderName
        });
      } else {
        throw new Error(data.error || 'Export files operation failed');
      }
    } catch (err: any) {
      console.error('Export error:', err);
      setExportState('error');
      setExportError(err.message || 'An unexpected error occurred during export.');
    }
  };

  const handleOpenExportFolder = async (folderPath: string) => {
    try {
      await fetch('/api/open-local-folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: folderPath })
      });
    } catch (e) {
      console.error('Error opening folder:', e);
    }
  };

  const handleBrowseNative = async (targetField: 'schedules' | 'mp3s' | 'logs') => {
    try {
      const res = await fetch('/api/browse-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.path) {
        if (targetField === 'schedules') setDraftLocalPathSchedules(data.path);
        else if (targetField === 'mp3s') setDraftLocalPathMP3s(data.path);
        else if (targetField === 'logs') setDraftLocalPathLogs(data.path);
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to open folder selection window.');
    }
  };

  const handleOpenLocalPath = async (dirPath: string) => {
    if (!dirPath) return;

    try {
      const res = await fetch('/api/open-local-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('Could not open folder natively:', err.error || 'Server error');
      }
    } catch (e) {
      console.warn('Network error opening local folder:', e);
    }
  };

  const handleOpenDriveFolder = async (folderId: string) => {
    if (!folderId) return;
    const url = `https://drive.google.com/drive/folders/${folderId}`;
    window.open(url, '_blank');
  };

  const handleAuthSignIn = async () => {
    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setIsDriveActive(true);
        
        // Immediate Validation after login
        const success = await validateGoogleDriveAccess();
        if (success) {
          setIsDriveValidated(true);
          setDriveValidationError(null);
          const currentSettings = getSavedSettings();
          await fetchDataForMode(currentSettings);
        } else {
          setIsDriveValidated(false);
          setDriveValidationError('Connected Google account lacks read/write access to one or more configured shared directories.');
        }
      }
    } catch (e: any) {
      console.error('Sign-in failed:', e);
      setDriveValidationError(e.message || 'Verification of Google login failed.');
    } finally {
      setIsValidatingDrive(false);
      setLoading(false);
    }
  };

  const handleManualTokenOverride = async (inputToken: string) => {
    if (!inputToken.trim()) return;
    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);
      
      // Inject token
      setOverrideAccessToken(inputToken.trim());
      setToken(inputToken.trim());
      setUser({ email: 'manual-developer@interstitialer.local', displayName: 'Developer Override Session' } as any);
      setIsDriveActive(true);
      
      // Verify Google Drive directories using the token
      const success = await validateGoogleDriveAccess();
      if (success) {
        setIsDriveValidated(true);
        setDriveValidationError(null);
        const currentSettings = getSavedSettings();
        await fetchDataForMode(currentSettings);
      } else {
        setIsDriveValidated(false);
        setDriveValidationError('The manually provided token succeeded validation in Firebase, but Google API rejected access. Check if the token is active, expired, or has correct drive permissions.');
      }
    } catch (e: any) {
      console.error('Manual drive token injection failed:', e);
      setDriveValidationError(e.message || 'Verification of manual token override failed.');
    } finally {
      setIsValidatingDrive(false);
      setLoading(false);
    }
  };

  const handleExternalBrowserSignIn = async () => {
    if (!googleClientId.trim()) {
      setDriveValidationError('Google OAuth Client ID is required for Method B External Browser login.');
      return;
    }
    
    // Save Client ID for convenience
    localStorage.setItem('interstitialer_google_client_id', googleClientId.trim());
    
    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);
      setIsPollingExternal(true);

      const redirectUri = `http://127.0.0.1:${window.location.port || '3000'}/api/oauth-callback`;
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId.trim())}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=https://www.googleapis.com/auth/drive`;
      
      console.log('Launching external browser for Google OAuth Method B:', authUrl);
      window.open(authUrl, '_blank');

      // Start Polling for Registered Token
      let pollCount = 0;
      const intervalId = setInterval(async () => {
        pollCount++;
        // Timeout after 5 minutes
        if (pollCount > 300) {
          clearInterval(intervalId);
          setIsPollingExternal(false);
          setIsValidatingDrive(false);
          setLoading(false);
          setDriveValidationError('Method B browser authentication timed out. Please try again.');
          return;
        }

        try {
          const isCustomProtocol = typeof window !== 'undefined' && !window.location.protocol.startsWith('http');
          const baseUrl = isCustomProtocol ? 'http://127.0.0.1:3000' : '';
          const res = await fetch(`${baseUrl}/api/check-registered-token`);
          if (!res.ok) throw new Error('Failed to query local loopback status');
          const data = await res.json();
          if (data.token) {
            clearInterval(intervalId);
            setIsPollingExternal(false);
            
            // Set token and authenticate session
            setOverrideAccessToken(data.token);
            setToken(data.token);
            setUser({ email: 'authorized-device@interstitialer.local', displayName: 'Loopback Verified Session' } as any);
            setIsDriveActive(true);
            
            // Validate Google Drive access
            const success = await validateGoogleDriveAccess();
            if (success) {
              setIsDriveValidated(true);
              setDriveValidationError(null);
              const currentSettings = getSavedSettings();
              await fetchDataForMode(currentSettings);
            } else {
              setIsDriveValidated(false);
              setDriveValidationError('OAuth Token verified by loopback, but Google API rejected access to the specified folders. Ensure folders are shared/accessible.');
            }
            setIsValidatingDrive(false);
            setLoading(false);
          }
        } catch (err: any) {
          console.warn('Error polling loopback token:', err);
        }
      }, 1000);

    } catch (e: any) {
      console.error('Method B OAuth launch failed:', e);
      setDriveValidationError(e.message || 'Failed to initialize external browser flow.');
      setIsValidatingDrive(false);
      setIsPollingExternal(false);
      setLoading(false);
    }
  };

  const handleAuthSignOut = async () => {
    try {
      setLoading(true);
      await handleLogout();
      setUser(null);
      setToken(null);
      setIsDriveActive(false);
      setIsDriveValidated(false);
      setDriveValidationError(null);
      setSchedules([]);
      setLogs([]);
      setDriveMP3s([]);
    } catch (e) {
      console.error('Sign-out failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLocations = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocationsError(null);
    setLocationsSuccess(null);
    setIsSavingAndVerifying(true);
    try {
      const current = getSavedSettings();
      let updatedSettings = { ...current, mode: locationMode };

      if (locationMode === 'Local') {
        updatedSettings = {
          ...updatedSettings,
          localPathMP3s: draftLocalPathMP3s,
          localPathLogs: draftLocalPathLogs,
          localPathSchedules: draftLocalPathSchedules
        };
      } else if (locationMode === 'Drive') {
        updatedSettings = {
          ...updatedSettings,
          driveFolderLogs: draftDriveFolderLogs,
          driveFolderMP3s: draftDriveFolderMP3s,
          driveFolderPreferences: draftDriveFolderPreferences
        };
      }

      // Detect mode or log/schedule folder mapping changes to reset backup flag
      const modeChanged = current.mode !== updatedSettings.mode;
      const schedulesChanged = updatedSettings.mode === 'Local'
        ? current.localPathSchedules !== updatedSettings.localPathSchedules
        : (updatedSettings.mode === 'Drive' ? current.driveFolderPreferences !== updatedSettings.driveFolderPreferences : false);
      const logsChanged = updatedSettings.mode === 'Local'
        ? current.localPathLogs !== updatedSettings.localPathLogs
        : (updatedSettings.mode === 'Drive' ? current.driveFolderLogs !== updatedSettings.driveFolderLogs : false);

      if (modeChanged || schedulesChanged || logsChanged) {
        console.log('Resetting backup flag due to updated folder mode or mapping');
        hasBackedUpThisSessionRef.current = false;
      }

      // Save locally (localStorage)
      saveSettings(updatedSettings);

      // Save variables to main state
      if (locationMode === 'Local') {
        setLocalPathMP3s(draftLocalPathMP3s);
        setLocalPathLogs(draftLocalPathLogs);
        setLocalPathSchedules(draftLocalPathSchedules);
      } else if (locationMode === 'Drive') {
        setDriveFolderLogs(draftDriveFolderLogs);
        setDriveFolderMP3s(draftDriveFolderMP3s);
        setDriveFolderPreferences(draftDriveFolderPreferences);
      }

      // Notify server
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings)
      }).catch(() => {});

      // For Local mode, run the verify API on back-end
      if (locationMode === 'Local') {
        const exists = await checkLocalPathsSafely(
          draftLocalPathMP3s,
          draftLocalPathLogs,
          draftLocalPathSchedules
        );
        
        setLocalPathsUnavailable(!exists);
        await fetchDataForMode(updatedSettings);
        setLocationsSuccess('Local storage configurations updated.');
      } else if (locationMode === 'Drive') {
        setIsValidatingDrive(true);
        // Is there any folder setting change?
        const hasFolderChanges = (
          draftDriveFolderLogs !== driveFolderLogs ||
          draftDriveFolderMP3s !== driveFolderMP3s ||
          draftDriveFolderPreferences !== driveFolderPreferences
        );

        let success = true;
        if (hasFolderChanges) {
          // Always request a new authentication after change to a folder type setting
          try {
            const res = await googleSignIn();
            if (res) {
              setUser(res.user);
              setToken(res.accessToken);
            } else {
              success = false;
            }
          } catch (authErr: any) {
            success = false;
            setLocationsError('Authentication is required when changing folder settings.');
          }
        }

        if (success) {
          const authSuccess = await validateGoogleDriveAccess();
          if (authSuccess) {
            setIsDriveValidated(true);
            setDriveValidationError(null);
            await fetchDataForMode(updatedSettings);
            setLocationsSuccess('Google Drive directory IDs updated and validated.');
          } else {
            setIsDriveValidated(false);
            setDriveValidationError('Associated account does not have authorization/access on newly specified directory folder IDs.');
            setLocationsError('Verification of IDs failed. Please confirm correct and accessible folder resource permissions.');
          }
        }
        setIsValidatingDrive(false);
      } else if (locationMode === 'Demo') {
        setIsDriveValidated(true);
        setDriveValidationError(null);
        await fetchDataForMode(updatedSettings);
        setLocationsSuccess('Workspace mode switched to Demo.');
      }

      setTimeout(() => {
        setLocationsSuccess(null);
        setShowLocationsModal(false);
        setIsSavingAndVerifying(false);
      }, 1500);

    } catch (err: any) {
      setLocationsError(err.message || 'Failed to save configure locations.');
      setIsSavingAndVerifying(false);
    }
  };

  const handleSelectMode = async (mode: 'Local' | 'Drive' | 'Demo') => {
    try {
      const current = getSavedSettings();
      if (current.mode !== mode) {
        console.log(`Resetting backup flag: Mode changed to ${mode}`);
        hasBackedUpThisSessionRef.current = false;
      }
      const updatedSettings = {
        ...current,
        mode
      };
      saveSettings(updatedSettings);
      setLocationMode(mode);
      
      // Notify backend
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings)
      }).catch(() => {});

      if (mode === 'Local') {
        const exists = await checkLocalPathsSafely(
          updatedSettings.localPathMP3s || '',
          updatedSettings.localPathLogs || '',
          updatedSettings.localPathSchedules || ''
        );

        setIsDriveActive(true);
        setIsDriveValidated(true);
        setLocalPathsUnavailable(!exists);
        await fetchDataForMode(updatedSettings);
        
        // Open location selector for Local Mode
        setShowLocationsModal(true);
      } else if (mode === 'Drive') {
        setIsDriveActive(true);
        setIsDriveValidated(true);
        setDriveValidationError(null);
        await fetchDataForMode(updatedSettings);

        // Open location selector for Drive Mode
        setShowLocationsModal(true);
      } else if (mode === 'Demo') {
        setIsDriveActive(true);
        setIsDriveValidated(true);
        setDriveValidationError(null);
        await fetchDataForMode(updatedSettings);
      }
    } catch (err) {
      console.error('Failed to select mode:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
        <RefreshCw className={cn("w-8 h-8 animate-spin", isPre ? "text-purple-600" : "text-blue-500")} />
        <p className="text-[14px] font-bold text-slate-500 tracking-wider animate-pulse select-none">
          Connecting to Google Drive (Check for pop-up window)
        </p>
      </div>
    );
  }



  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] font-sans overflow-hidden">
      {/* Top Header - Branding & Nav */}
      <header className="bg-[#0F172A] px-3 py-2 shrink-0 z-20">
        <div className={cn(
          "flex items-center justify-between gap-3 mx-auto transition-all",
          activeTab === 'player' ? "max-w-[400px]" : "max-w-full px-4 md:px-6 lg:px-8"
        )}>
          <div className="flex items-center gap-2 text-white">
            <div className={cn("w-6 h-6 rounded flex items-center justify-center", isPre ? "bg-purple-600" : "bg-blue-500")}>
              <Clock className="w-4 h-4" />
            </div>
            <span className="font-bold text-xs tracking-tight hide-app-name">Interstitial-er</span>
          </div>
          <div className="flex gap-1">
            <button
               onClick={() => setActiveTab('player')}
               className={cn(
                 "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
                 activeTab === 'player' 
                   ? (isPre ? "bg-purple-600 text-white" : "bg-blue-600 text-white") 
                   : "text-slate-400 hover:text-white"
               )}
            >
              <Play className="w-3.5 h-3.5" />
              <span className="text-[12px] font-bold uppercase tracking-tighter hide-player-name">Player</span>
            </button>
            {!isPlayerMode && (
              <button
                 onClick={() => setActiveTab('scheduler')}
                 className={cn(
                   "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
                   activeTab === 'scheduler' 
                     ? (isPre ? "bg-purple-600 text-white" : "bg-blue-600 text-white") 
                     : "text-slate-400 hover:text-white"
                 )}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span className="text-[12px] font-bold uppercase tracking-tighter hide-scheduler-name">Scheduler</span>
              </button>
            )}
            <button
               onClick={() => setActiveTab('log')}
               className={cn(
                 "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
                 activeTab === 'log' 
                   ? (isPre ? "bg-purple-600 text-white" : "bg-blue-600 text-white") 
                   : "text-slate-400 hover:text-white"
               )}
            >
              <History className="w-3.5 h-3.5" />
              <span className="text-[12px] font-bold uppercase tracking-tighter hide-log-name">Log</span>
            </button>
          </div>
        </div>
      </header>

      {/* Control Strip - Time & Refresh (Collapsed) */}
      {activeTab === 'player' && (
        <div className="bg-white border-b border-slate-200 py-1.5 px-2 shrink-0 shadow-sm z-10">
          <div className="max-w-[400px] mx-auto flex items-center justify-between gap-4">
            {isPre ? (
              <div className="flex flex-col py-0.5">
                <p className="text-[12px] uppercase text-purple-600 font-black tracking-widest leading-none">Prerecord time and date</p>
                <p className="text-xs font-mono font-black text-slate-900 tabular-nums mt-1 leading-none">
                  {prerecordDate ? format(prerecordDate, 'yyyy-MM-dd HH:mm') : ''}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-[12px] uppercase text-slate-400 font-black tracking-tighter">Time</p>
                <p className="text-[12px] font-mono font-black text-slate-900 tabular-nums leading-none">{format(now, 'HH:mm:ss')}</p>
              </div>
            )}
            
            <div className="flex items-center gap-2 font-sans">
              {isPre ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleExportPrerecord}
                    className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded shadow-sm border border-purple-500 hover:border-purple-600 transition-all font-black uppercase tracking-tighter text-[14px] cursor-pointer"
                    title="Export prerecord playlist and files"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export</span>
                  </button>
                </div>
              ) : (
                <p className="text-[12px] uppercase text-blue-600 font-black tracking-tight leading-none whitespace-nowrap">Refresh: {formatCountdown(countdown)}</p>
              )}
              <button 
                onClick={handleRefresh}
                disabled={isPre}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded border border-slate-200 transition-colors group",
                  isPre ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-200"
                )}
                title={isPre ? "Refresh disabled in prerecord mode" : "Reload Status"}
              >
                <RefreshCw className={cn("w-3 h-3 font-bold transition-transform duration-500", !isPre && "group-hover:rotate-180")} />
                <span className="text-[12px] font-black uppercase tracking-tighter">Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-[#F8FAFC] pb-2">
        {/* Missing Files Warning Banner */}
        {(() => {
          const isMissingSchedules = schedules.length === 0;
          const isMissingMP3s = driveMP3s.length === 0;

          if (isMissingSchedules || isMissingMP3s) {
            return (
              <div className={cn(
                "mx-auto px-4 mt-3 transition-all",
                activeTab === 'player' ? "max-w-[400px]" : "max-w-full md:px-6 lg:px-8"
              )}>
                <div className="bg-amber-950/20 border border-amber-500/20 text-amber-500 rounded-xl p-3 flex flex-col gap-1.5 shadow-sm">
                  <div className="flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wider">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Resource Warning
                  </div>
                  <p className="text-[12px] leading-relaxed text-slate-400">
                    {isMissingSchedules && isMissingMP3s ? (
                      "Schedules config (schedules.json) and .mp3s could not be found."
                    ) : isMissingSchedules ? (
                      "The schedules configuration file (schedules.json) was not detected in this directory."
                    ) : (
                      "No play .mp3 files were found/listed inside your audio folder."
                    )}
                    {" Recommended to verify folder locations using the configuration tool."}
                  </p>
                  <div className="mt-1">
                    <button
                      onClick={() => setShowLocationsModal(true)}
                      className="flex items-center gap-1.5 py-1 px-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[12px] uppercase tracking-wider rounded border border-amber-400 transition cursor-pointer"
                    >
                      <Folder className="w-3 h-3 shrink-0" />
                      <span>Configure folders</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

        <div className={cn(
          "w-full mx-auto pt-3 h-full transition-all",
          activeTab === 'player' ? "max-w-[200px] px-1" : "max-w-full px-4 md:px-6 lg:px-8"
        )}>
          <AnimatePresence mode="wait">
            {activeTab === 'player' ? (
              <motion.div
                key="player"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full"
              >
                <PlayerTab 
                  schedules={schedules} 
                  logs={logs} 
                  onLog={addLog}
                  now={now}
                  syncTime={syncTime}
                  scrollTrigger={scrollTrigger}
                  playMode={playMode}
                  prerecordDate={prerecordDate}
                  prerecordLengthMinutes={prerecordLengthMinutes}
                />
              </motion.div>
            ) : activeTab === 'scheduler' ? (
              <motion.div
                key="scheduler"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full"
              >
                <SchedulerTab 
                  schedules={schedules} 
                  onSave={saveSchedules}
                  isAdmin={isAdmin}
                  onAdminToggle={setIsAdmin}
                  now={now}
                  driveMP3s={driveMP3s}
                  isDriveActive={isDriveActive}
                />
              </motion.div>
            ) : (
              <motion.div
                key="log"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full"
              >
                <LogTab logs={logs} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Bottom Footer - Default Locations Menu */}
      <footer className={cn(
        "px-4 py-2 shrink-0 border-t transition-all",
        locationMode === 'Demo'
          ? "bg-amber-950/20 border-amber-900/40 text-amber-100" 
          : "bg-slate-900 border-slate-800 text-slate-100"
      )}>
        <div className={cn(
          "mx-auto flex justify-between items-center gap-2 transition-all",
          activeTab === 'player' ? "max-w-[400px]" : "max-w-full md:px-6 lg:px-8"
        )}>
          <button
            onClick={() => setShowLocationsModal(true)}
            className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-all cursor-pointer shadow-sm text-[12px] font-black uppercase tracking-widest leading-none"
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Folders</span>
          </button>

          {/* DEMO Indicator displayed only in Demo storage Mode */}
          {locationMode === 'Demo' && (
            <span className="text-[12px] font-black tracking-widest text-[#F59E0B] animate-pulse bg-amber-950/40 px-2 py-1 rounded border border-amber-500/20 leading-none">
              DEMO
            </span>
          )}

          {/* Mode Pill Group with 3D depressed highlight styles and lit indicators */}
          <div className="flex bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] items-center gap-0.5">
            <button
              onClick={() => {
                if (isPre) {
                  setPlayMode('Live');
                  setPrerecordDate(null);
                  handleRefresh();
                }
              }}
              className={cn(
                "px-2 px-2.5 py-1 text-[12px] font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5",
                !isPre 
                  ? "bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)]" 
                  : "bg-blue-950/30 border-blue-900/30 text-blue-500/60 hover:text-blue-400/80 hover:bg-blue-950/45"
              )}
            >
              <span className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                !isPre 
                  ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]" 
                  : "bg-slate-800"
              )} />
              Live
            </button>
            <button
              onClick={() => {
                if (!isPre) {
                  handleToggleMode();
                }
              }}
              className={cn(
                "px-2 px-2.5 py-1 text-[12px] font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5",
                isPre 
                  ? "bg-gradient-to-b from-purple-500 to-purple-600 border-t-purple-400 border-b-purple-800 text-white shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.4)]" 
                  : "bg-purple-950/30 border-purple-900/30 text-purple-500/60 hover:text-purple-400/80 hover:bg-purple-950/45"
              )}
            >
              <span className={cn(
                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                isPre 
                  ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]" 
                  : "bg-slate-800"
              )} />
              Prerecord
            </button>
          </div>
        </div>
      </footer>

      {/* Prerecord Activation Modal */}
      <AnimatePresence>
        {showPrerecordModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden text-slate-100 flex flex-col"
            >
              {showPrerecordConfirmStep && prerecordConfirmDetails ? (
                <div className="flex flex-col">
                  {/* Confirmation Header */}
                  <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                    <div className="flex items-center gap-2 text-purple-400">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-white">Verify Show Details</h3>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        setShowPrerecordConfirmStep(false);
                        setPrerecordConfirmDetails(null);
                      }}
                      className="text-slate-500 hover:text-slate-300 font-bold text-xs uppercase"
                    >
                      Adjust
                    </button>
                  </div>

                  {/* Confirmation Content */}
                  <div className="p-5 space-y-4">
                    <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg space-y-3">
                      <p className="text-xs leading-relaxed text-slate-300">
                        Please confirm you want to activate <span className="font-extrabold text-white">Prerecord Mode</span> with the following parameters:
                      </p>

                      <div className="space-y-2 pt-1">
                        <div className="flex flex-col">
                          <span className="text-[12px] font-black uppercase text-slate-500 tracking-wider">Air Date</span>
                          <span className="text-xs font-bold text-purple-400">
                            {format(prerecordConfirmDetails.startDate, 'EEEE, MMMM do, yyyy')}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col">
                            <span className="text-[12px] font-black uppercase text-slate-500 tracking-wider">Start Time (24h)</span>
                            <span className="text-xs font-black font-mono text-purple-400">
                              {format(prerecordConfirmDetails.startDate, 'HH:mm')}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[12px] font-black uppercase text-slate-500 tracking-wider">Start Time (12h)</span>
                            <span className="text-xs font-black font-mono text-purple-400">
                              {format(prerecordConfirmDetails.startDate, 'h:mm a')}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col">
                          <span className="text-[12px] font-black uppercase text-slate-500 tracking-wider">Show Length / Duration</span>
                          <span className="text-xs font-bold text-purple-400">
                            {parseInt(prerecordHoursInput, 10) > 0 ? `${prerecordHoursInput} ${parseInt(prerecordHoursInput, 10) === 1 ? 'hour' : 'hours'}` : ''}
                            {parseInt(prerecordHoursInput, 10) > 0 && parseInt(prerecordMinutesInput, 10) > 0 ? ' and ' : ''}
                            {parseInt(prerecordMinutesInput, 10) > 0 || parseInt(prerecordHoursInput, 10) === 0 ? `${prerecordMinutesInput} minutes` : ''}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-900/60">
                          <div className="flex flex-col">
                            <span className="text-[12px] font-black uppercase text-slate-500 tracking-wider">Calculated End (24h)</span>
                            <span className="text-xs font-black font-mono text-emerald-400">
                              {format(addMinutes(prerecordConfirmDetails.startDate, prerecordConfirmDetails.totalMinutes), 'HH:mm')}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[12px] font-black uppercase text-slate-500 tracking-wider">Calculated End (12h)</span>
                            <span className="text-xs font-black font-mono text-emerald-400">
                              {format(addMinutes(prerecordConfirmDetails.startDate, prerecordConfirmDetails.totalMinutes), 'h:mm a')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-[12px] text-slate-400 leading-normal bg-slate-950/25 p-2 rounded border border-slate-850/50">
                      Pro-tip: Double-check that your desktop clock matches your scheduled timezone settings.
                    </p>
                  </div>

                  {/* Confirmation Actions */}
                  <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/20 flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPrerecordConfirmStep(false);
                        setPrerecordConfirmDetails(null);
                      }}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[12px] font-bold uppercase tracking-wider rounded border border-slate-700 transition cursor-pointer active:translate-y-px"
                    >
                      Adjust
                    </button>
                    <button
                      type="button"
                      onClick={handleFinalConfirmPrerecord}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black uppercase tracking-wider rounded shadow-md shadow-emerald-950/20 transition cursor-pointer active:translate-y-px"
                    >
                      OK - Activate
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleActivatePrerecord} className="flex flex-col">
                  {/* Modal Header */}
                  <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                    <div className="flex items-center gap-2 text-purple-400">
                      <Clock className="w-5 h-5" />
                      <h3 className="text-xs font-black uppercase tracking-widest text-white">Activate Prerecord Mode</h3>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setShowPrerecordModal(false)}
                      className="text-slate-500 hover:text-slate-300 font-bold text-xs uppercase"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Modal Content */}
                  <div className="p-5 space-y-4">
                    <p className="text-[12px] leading-relaxed text-slate-300">
                      Set the Date and Time of when the prerecord will air.
                    </p>

                    <div className="space-y-3">
                      {/* Date picker */}
                      <div>
                        <label className="block text-[12px] font-black uppercase tracking-wider text-slate-400 mb-1">Air Date of Prerecord</label>
                        <input 
                          type="date" 
                          required
                          value={prerecordDateInput}
                          onChange={e => setPrerecordDateInput(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono font-bold text-slate-200 outline-none focus:ring-1 focus:ring-purple-500 transition-all cursor-pointer"
                        />
                      </div>

                      {/* Time picker (24h input mask) */}
                      <div>
                        <label className="block text-[12px] font-black uppercase tracking-wider text-slate-400 mb-1">Show Start Time (24h - HH:mm)</label>
                        <input 
                          type="text" 
                          required
                          placeholder="HH:mm (e.g. 14:30)"
                          maxLength={5}
                          value={prerecordTimeInput}
                          onChange={handleTimeInputChange}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono font-bold text-slate-200 outline-none focus:ring-1 focus:ring-purple-500 transition-all cursor-pointer"
                        />
                      </div>

                      {/* Show Length pickers */}
                      <div>
                        <label className="block text-[12px] font-black uppercase tracking-wider text-slate-450 mb-1">Show Length</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <input 
                              type="number" 
                              required
                              min={0}
                              max={999}
                              value={prerecordHoursInput}
                              onChange={e => setPrerecordHoursInput(e.target.value)}
                              className="w-full pl-3 pr-10 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono font-bold text-slate-200 outline-none focus:ring-1 focus:ring-purple-500 transition-all [&::-webkit-inner-spin-button]:mr-6 [&::-webkit-inner-spin-button]:cursor-pointer"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-slate-500 pointer-events-none uppercase">Hrs</span>
                          </div>
                          <div className="relative">
                            <input 
                              type="number" 
                              required
                              min={0}
                              max={59}
                              value={prerecordMinutesInput}
                              onChange={e => setPrerecordMinutesInput(e.target.value)}
                              className="w-full pl-3 pr-10 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono font-bold text-slate-200 outline-none focus:ring-1 focus:ring-purple-500 transition-all [&::-webkit-inner-spin-button]:mr-6 [&::-webkit-inner-spin-button]:cursor-pointer"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-slate-500 pointer-events-none uppercase">Min</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {prerecordError && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded p-2.5 flex items-start gap-2 text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="text-[12px] leading-tight font-medium">{prerecordError}</span>
                      </div>
                    )}
                  </div>

                  {/* Modal Actions */}
                  <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/20 flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowPrerecordModal(false)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[12px] font-bold uppercase tracking-wider rounded border border-slate-700 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[12px] font-black uppercase tracking-wider rounded shadow-md shadow-purple-950/20 transition"
                    >
                      Activate
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showLocationsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-slate-100 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                <div className="flex items-center gap-2 text-blue-400">
                  <Folder className="w-5 h-5" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-white">Storage Folders</h3>
                </div>
              </div>

              {/* Modal Core Form */}
              <form onSubmit={handleSaveLocations} className="flex flex-col flex-1 overflow-hidden">
                {/* Modal Content */}
                <div className="p-3.5 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
                  
                  {/* Mode Selector Row */}
                  <div className="space-y-1.5">
                    <p className="text-[12px] font-black uppercase text-slate-400 tracking-widest leading-none">Select Mode</p>
                    <div className="p-1 bg-slate-950 border border-slate-900 rounded-lg flex gap-1 items-center shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)]">
                      <button
                        type="button"
                        onClick={() => setLocationMode('Demo')}
                        className={cn(
                          "flex-1 py-1 text-[12px] font-black uppercase tracking-wider rounded border transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5",
                          locationMode === 'Demo'
                            ? "bg-gradient-to-b from-amber-500 to-amber-600 border-[#F59E0B] border-t-amber-400 border-b-amber-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] font-black"
                            : "bg-amber-950/10 border-amber-900/15 text-amber-500/50 hover:text-amber-400 hover:bg-amber-950/20"
                        )}
                      >
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all duration-300",
                          locationMode === 'Demo' 
                            ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]" 
                            : "bg-slate-800"
                        )} />
                        Demo
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationMode('Drive')}
                        className={cn(
                          "flex-1 py-1 text-[12px] font-black uppercase tracking-wider rounded border transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5",
                          locationMode === 'Drive'
                            ? "bg-gradient-to-b from-blue-500 to-blue-600 border-[#3B82F6] border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] font-black"
                            : "bg-blue-950/10 border-blue-900/15 text-blue-500/50 hover:text-blue-400 hover:bg-blue-950/20"
                        )}
                      >
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all duration-300",
                          locationMode === 'Drive' 
                            ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]" 
                            : "bg-slate-800"
                        )} />
                        Google Drive
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationMode('Local')}
                        className={cn(
                          "flex-1 py-1 text-[12px] font-black uppercase tracking-wider rounded border transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5",
                          locationMode === 'Local'
                            ? "bg-gradient-to-b from-purple-500 to-purple-600 border-[#8B5CF6] border-t-purple-400 border-b-purple-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] font-black"
                            : "bg-purple-950/10 border-purple-900/15 text-purple-500/50 hover:text-purple-400 hover:bg-purple-950/20"
                        )}
                      >
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all duration-300",
                          locationMode === 'Local' 
                            ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]" 
                            : "bg-slate-800"
                        )} />
                        Local Folder
                      </button>
                    </div>
                  </div>

                  {/* Directories List Depending on Mode */}
                  {locationMode === 'Local' && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[12px] font-black uppercase text-blue-400 tracking-wider">Local Schedules Path</label>
                          {!draftLocalPathSchedules ? (
                            <span className="text-[12px] bg-amber-950 text-amber-500 border border-amber-800/40 px-1.5 py-0.5 rounded font-bold uppercase">To be set</span>
                          ) : (
                            <span className="text-[12px] bg-emerald-950 text-emerald-500 border border-emerald-900/40 px-1.5 py-0.5 rounded font-bold uppercase">Configured</span>
                          )}
                        </div>
                        <input 
                          type="text"
                          placeholder="e.g. /Users/name/data/schedules"
                          value={draftLocalPathSchedules}
                          onChange={e => setDraftLocalPathSchedules(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => handleBrowseNative('schedules')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 hover:border-slate-650 rounded text-[12px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Edit
                          </button>
                          {draftLocalPathSchedules && (
                            <button
                              type="button"
                              onClick={() => handleOpenLocalPath(draftLocalPathSchedules)}
                              className="px-2.5 py-1 bg-purple-600/15 hover:bg-purple-600/30 text-purple-400 border border-purple-500/25 rounded text-[12px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                            >
                              Open
                            </button>
                          )}
                        </div>
                        <p className="text-[12px] text-slate-500 mt-0.5">Directory where Interstitial-er saves the schedules configuration.</p>
                      </div>
 
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[12px] font-black uppercase text-blue-400 tracking-wider">Local MP3s Directory Path</label>
                          {!draftLocalPathMP3s ? (
                            <span className="text-[12px] bg-amber-950 text-amber-500 border border-amber-800/40 px-1.5 py-0.5 rounded font-bold uppercase">To be set</span>
                          ) : (
                            <span className="text-[12px] bg-emerald-950 text-emerald-500 border border-emerald-900/40 px-1.5 py-0.5 rounded font-bold uppercase">Configured</span>
                          )}
                        </div>
                        <input 
                          type="text"
                          placeholder="e.g. /Users/name/Music/MP3s"
                          value={draftLocalPathMP3s}
                          onChange={e => setDraftLocalPathMP3s(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => handleBrowseNative('mp3s')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 hover:border-slate-650 rounded text-[12px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Edit
                          </button>
                          {draftLocalPathMP3s && (
                            <button
                              type="button"
                              onClick={() => handleOpenLocalPath(draftLocalPathMP3s)}
                              className="px-2.5 py-1 bg-purple-600/15 hover:bg-purple-600/30 text-purple-400 border border-purple-500/25 rounded text-[12px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                            >
                              Open
                            </button>
                          )}
                        </div>
                        <p className="text-[12px] text-slate-500 mt-0.5">Absolute path containing your secondary .mp3 playback audio files.</p>
                      </div>
 
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[12px] font-black uppercase text-blue-400 tracking-wider">Local Play Log Records Path</label>
                          {!draftLocalPathLogs ? (
                            <span className="text-[12px] bg-amber-950 text-amber-500 border border-amber-800/40 px-1.5 py-0.5 rounded font-bold uppercase">To be set</span>
                          ) : (
                            <span className="text-[12px] bg-emerald-950 text-emerald-500 border border-emerald-900/40 px-1.5 py-0.5 rounded font-bold uppercase">Configured</span>
                          )}
                        </div>
                        <input 
                          type="text"
                          placeholder="e.g. /Users/name/logs"
                          value={draftLocalPathLogs}
                          onChange={e => setDraftLocalPathLogs(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => handleBrowseNative('logs')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 hover:border-slate-650 rounded text-[12px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Edit
                          </button>
                          {draftLocalPathLogs && (
                            <button
                              type="button"
                              onClick={() => handleOpenLocalPath(draftLocalPathLogs)}
                              className="px-2.5 py-1 bg-purple-600/15 hover:bg-purple-600/30 text-purple-400 border border-purple-500/25 rounded text-[12px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                            >
                              Open
                            </button>
                          )}
                        </div>
                        <p className="text-[12px] text-slate-500 mt-0.5">Directory location where logs are stored sequentially.</p>
                      </div>
 
                      {localPathsUnavailable && (
                        <div className="p-3 bg-amber-950/20 border border-amber-900/40 text-amber-400 rounded text-[12px] leading-relaxed">
                          ⚠️ One or more specified local directories are missing or inaccessible. Please verify paths are correct and physically exist on host desktop folders.
                        </div>
                      )}
                    </div>
                  )}

                  {locationMode === 'Drive' && (
                    <div className="space-y-3">
                      {/* Preferences/Schedules Container */}
                      <div className="p-2.5 rounded-lg bg-slate-950/45 border border-slate-850 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-black uppercase text-blue-400 tracking-wider">Schedule</span>
                          {draftDriveFolderPreferences ? (
                            <span className="text-[12px] bg-emerald-950 text-emerald-400 border border-emerald-950/40 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Configured</span>
                          ) : (
                            <span className="text-[12px] bg-amber-950 text-amber-500 border border-amber-950/45 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">To be set</span>
                          )}
                        </div>
                        <p className="text-[12px] font-sans text-slate-200 select-all truncate leading-relaxed">
                          {driveFolderDescMap[draftDriveFolderPreferences] || "No directory folder configured yet"}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDriveField('preferences');
                              setTempPasteLink(draftDriveFolderPreferences);
                            }}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-705 hover:border-slate-650 rounded text-[12px] font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          {draftDriveFolderPreferences && (
                            <button
                              type="button"
                              onClick={() => handleOpenDriveFolder(draftDriveFolderPreferences)}
                              className="px-2 py-1 bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 border border-blue-500/25 rounded text-[12px] font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Open
                            </button>
                          )}
                        </div>
                      </div>

                      {/* MP3s Folder Container */}
                      <div className="p-2.5 rounded-lg bg-slate-950/45 border border-slate-850 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-black uppercase text-blue-400 tracking-wider">mp3's</span>
                          {draftDriveFolderMP3s ? (
                            <span className="text-[12px] bg-emerald-950 text-emerald-400 border border-emerald-950/40 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Configured</span>
                          ) : (
                            <span className="text-[12px] bg-amber-950 text-amber-500 border border-amber-950/45 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">To be set</span>
                          )}
                        </div>
                        <p className="text-[12px] font-sans text-slate-200 select-all truncate leading-relaxed">
                          {driveFolderDescMap[draftDriveFolderMP3s] || "No directory folder configured yet"}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDriveField('mp3s');
                              setTempPasteLink(draftDriveFolderMP3s);
                            }}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-705 hover:border-slate-650 rounded text-[12px] font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          {draftDriveFolderMP3s && (
                            <button
                              type="button"
                              onClick={() => handleOpenDriveFolder(draftDriveFolderMP3s)}
                              className="px-2 py-1 bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 border border-blue-500/25 rounded text-[12px] font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Open
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Logs Folder Container */}
                      <div className="p-2.5 rounded-lg bg-slate-950/45 border border-slate-850 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-black uppercase text-blue-400 tracking-wider">Play Logs</span>
                          {draftDriveFolderLogs ? (
                            <span className="text-[12px] bg-emerald-950 text-emerald-400 border border-emerald-950/40 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Configured</span>
                          ) : (
                            <span className="text-[12px] bg-amber-950 text-amber-500 border border-amber-955 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">To be set</span>
                          )}
                        </div>
                        <p className="text-[12px] font-sans text-slate-200 select-all truncate leading-relaxed">
                          {driveFolderDescMap[draftDriveFolderLogs] || "No directory folder configured yet"}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDriveField('logs');
                              setTempPasteLink(draftDriveFolderLogs);
                            }}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-705 hover:border-slate-650 rounded text-[12px] font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          {draftDriveFolderLogs && (
                            <button
                              type="button"
                              onClick={() => handleOpenDriveFolder(draftDriveFolderLogs)}
                              className="px-2 py-1 bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 border border-blue-500/25 rounded text-[12px] font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Open
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Google Account Connection Status inside modal */}
                      <GoogleAuthSection
                        user={user}
                        token={token}
                        setToken={setToken}
                        setUser={setUser}
                        googleClientId={googleClientId}
                        setGoogleClientId={setGoogleClientId}
                        isPollingExternal={isPollingExternal}
                        setIsPollingExternal={setIsPollingExternal}
                        setIsValidatingDrive={setIsValidatingDrive}
                        setLoading={setLoading}
                        setDriveValidationError={setDriveValidationError}
                        driveValidationError={driveValidationError}
                        validateGoogleDriveAccess={validateGoogleDriveAccess}
                        fetchDataForMode={fetchDataForMode}
                        handleAuthSignOut={handleAuthSignOut}
                        setOverrideAccessToken={setOverrideAccessToken}
                      />
                    </div>
                  )}
 
                  {locationMode === 'Demo' && (
                    <div className="space-y-3">
                      <div className="p-3 bg-amber-950/15 border border-amber-900/35 rounded-lg whitespace-pre-line text-[12px] leading-relaxed text-amber-500">
                        Demo for crstl.fm testing/learning.  The data is shared, but not for production.  Change, modify, etc everything.
                      </div>

                      {/* Demo Schedules Container */}
                      <div className="p-2.5 rounded-lg bg-slate-950/45 border border-slate-850 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-black uppercase text-blue-400 tracking-wider">Demo Schedule</span>
                          <span className="text-[12px] bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Demo</span>
                        </div>
                        <p className="text-[12px] font-sans text-slate-200 select-all truncate leading-relaxed">
                          {driveFolderDescMap['1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED'] || 'scheduledata'}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDriveFolder('1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED')}
                            className="px-2 py-1 bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 border border-blue-500/25 rounded text-[12px] font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Open
                          </button>
                        </div>
                      </div>
 
                      {/* Demo MP3s Folder Container */}
                      <div className="p-2.5 rounded-lg bg-slate-950/45 border border-slate-850 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-black uppercase text-blue-400 tracking-wider">Demo mp3's</span>
                          <span className="text-[12px] bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Demo</span>
                        </div>
                        <p className="text-[12px] font-sans text-slate-200 select-all truncate leading-relaxed">
                          {driveFolderDescMap['11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch'] || 'mp3library'}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDriveFolder('11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch')}
                            className="px-2 py-1 bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 border border-blue-500/25 rounded text-[12px] font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Open
                          </button>
                        </div>
                      </div>
 
                      {/* Demo Logs Folder Container */}
                      <div className="p-2.5 rounded-lg bg-slate-950/45 border border-slate-850 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[12px] font-black uppercase text-blue-400 tracking-wider">Demo Play Logs</span>
                          <span className="text-[12px] bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Demo</span>
                        </div>
                        <p className="text-[12px] font-sans text-slate-200 select-all truncate leading-relaxed">
                          {driveFolderDescMap['1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx'] || 'logs'}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleOpenDriveFolder('1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx')}
                            className="px-2 py-1 bg-blue-600/15 hover:bg-blue-600/30 text-blue-400 border border-blue-500/25 rounded text-[12px] font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Open
                          </button>
                        </div>
                      </div>

 
                      {/* Google Account Connection Status inside modal for Demo mode as well */}
                      <GoogleAuthSection
                        user={user}
                        token={token}
                        setToken={setToken}
                        setUser={setUser}
                        googleClientId={googleClientId}
                        setGoogleClientId={setGoogleClientId}
                        isPollingExternal={isPollingExternal}
                        setIsPollingExternal={setIsPollingExternal}
                        setIsValidatingDrive={setIsValidatingDrive}
                        setLoading={setLoading}
                        setDriveValidationError={setDriveValidationError}
                        driveValidationError={driveValidationError}
                        validateGoogleDriveAccess={validateGoogleDriveAccess}
                        fetchDataForMode={fetchDataForMode}
                        handleAuthSignOut={handleAuthSignOut}
                        setOverrideAccessToken={setOverrideAccessToken}
                      />
                    </div>
                  )}

                  {/* Feedback Status */}
                  {locationsError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded p-2.5 flex items-start gap-2 text-red-400">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="text-[12px] leading-normal font-bold">{locationsError}</span>
                    </div>
                  )}

                  {locationsSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2.5 flex items-start gap-2 text-emerald-400">
                      <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="text-[12px] leading-normal font-bold">{locationsSuccess}</span>
                    </div>
                  )}

                </div>

                {/* Submit Actions */}
                <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/20 flex gap-2 justify-end items-center font-sans">
                  <button
                    type="button"
                    onClick={() => setShowLocalHelp(true)}
                    className="mr-auto flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[12px] font-bold uppercase rounded border border-slate-700 transition cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                    <span>Help</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLocationsModal(false)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 text-[12px] font-bold uppercase rounded border border-slate-700 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSyncing || isValidatingDrive}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-black uppercase rounded shadow transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSyncing || isValidatingDrive ? 'Verifying...' : 'Save and Close'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editingDriveField && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full overflow-hidden text-slate-100 flex flex-col shadow-2xl p-5 space-y-4"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                <h3 className="text-xs font-black uppercase text-blue-400 tracking-wider">
                  {editingDriveField === 'preferences' 
                    ? 'Schedules & Preferences folder' 
                    : editingDriveField === 'mp3s' 
                      ? 'MP3s Audio folder' 
                      : 'Logs folder'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDriveField(null);
                    setTempPasteLink('');
                  }}
                  className="text-slate-500 hover:text-slate-350 font-bold text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2">
                <span className="text-[12px] font-black uppercase tracking-wider text-slate-400 block">
                  Paste Google Drive Share Link or ID
                </span>
                <textarea
                  rows={3}
                  value={tempPasteLink}
                  onChange={(e) => setTempPasteLink(e.target.value)}
                  placeholder="Paste folders/ browser URL (e.g. https://drive.google.com/drive/folders/...) or raw folder ID here..."
                  className="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-300 outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-700 resize-none"
                />
                <p className="text-[12px] leading-normal text-slate-500">
                  Simply paste the raw share URL or standard folder ID. It will extract the ID key automatically.
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-1 border-t border-slate-800/40">
                <button
                  type="button"
                  onClick={() => {
                    setEditingDriveField(null);
                    setTempPasteLink('');
                  }}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 text-[12px] font-bold uppercase rounded border border-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const rawId = extractFolderId(tempPasteLink);
                    if (editingDriveField === 'preferences') {
                      setDraftDriveFolderPreferences(rawId);
                    } else if (editingDriveField === 'mp3s') {
                      setDraftDriveFolderMP3s(rawId);
                    } else if (editingDriveField === 'logs') {
                      setDraftDriveFolderLogs(rawId);
                    }
                    setEditingDriveField(null);
                    setTempPasteLink('');
                    // Fetch descriptor block immediately
                    if (rawId && user && token) {
                      try {
                        const descriptor = await fetchDriveFolderDescriptor(rawId, token);
                        setDriveFolderDescMap(prev => ({
                          ...prev,
                          [rawId]: descriptor
                        }));
                      } catch (err) {}
                    }
                  }}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-black uppercase rounded shadow cursor-pointer active:translate-y-px"
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <LocalHelpModal isOpen={showLocalHelp} onClose={() => setShowLocalHelp(false)} />
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm pt-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 flex flex-col p-5 space-y-3 font-sans"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/60 shrink-0">
                <div className="flex items-center gap-2 text-purple-400">
                  <Download className="w-5 h-5 animate-bounce" />
                  <h3 className="text-[16px] font-black uppercase tracking-widest text-white leading-none">
                    Export Prerecord Broadcast
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="text-slate-550 hover:text-slate-350 font-bold text-[16px]"
                >
                  ✕
                </button>
              </div>

              {/* Modal Content depending on state */}
              {exportState === 'configuring' && (
                <div className="space-y-4 flex flex-col pt-1">
                  <div className="space-y-1.5">
                    <label className="block text-[14px] font-black uppercase tracking-wider text-slate-400">
                      Destination Location
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={exportDestinationInput}
                        onChange={(e) => setExportDestinationInput(e.target.value)}
                        placeholder="Select export folder pathway..."
                        className="flex-1 bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-[14px] text-slate-200 focus:outline-none focus:border-purple-600 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleBrowseExportDestination}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[14px] font-black uppercase rounded cursor-pointer whitespace-nowrap active:translate-y-px"
                      >
                        Browse
                      </button>
                    </div>
                    <p className="text-[12px] text-slate-500 font-medium leading-normal">
                      Where the compiled broadcast folder package will be created.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[14px] font-black uppercase tracking-wider text-slate-400">
                      Folder Name Prefix
                    </label>
                    <input
                      type="text"
                      value={exportFolderPrefixInput}
                      onChange={(e) => setExportFolderPrefixInput(e.target.value)}
                      placeholder="Prerecord-Export"
                      className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-[14px] text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                    />
                    <p className="text-[12px] text-slate-500 font-medium leading-normal">
                      Standard part: <span className="text-slate-400 font-mono font-bold">{exportFolderPrefixInput || 'Prerecord-Export'}</span> - [Date]_[Time] - [Duration]m
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[14px] font-black uppercase tracking-wider text-slate-400">
                      Text File Name Prefix
                    </label>
                    <input
                      type="text"
                      value={exportTextPrefixInput}
                      onChange={(e) => setExportTextPrefixInput(e.target.value)}
                      placeholder="Prerecord schedule"
                      className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-[14px] text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                    />
                    <p className="text-[12px] text-slate-500 font-medium leading-normal">
                      Standard part: <span className="text-slate-400 font-mono font-bold">{exportTextPrefixInput || 'Prerecord schedule'}</span> - [Date]_[Time]_[Duration]min.txt
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[14px] font-black uppercase tracking-wider text-slate-400">
                      Playlist File Name Prefix
                    </label>
                    <input
                      type="text"
                      value={exportPlaylistPrefixInput}
                      onChange={(e) => setExportPlaylistPrefixInput(e.target.value)}
                      placeholder="Interstitial playlist"
                      className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-[14px] text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                    />
                    <p className="text-[12px] text-slate-500 font-medium leading-normal">
                      Standard part: <span className="text-slate-400 font-mono font-bold">{exportPlaylistPrefixInput || 'Interstitial playlist'}</span> - [Date]_[Time]_[Duration]min.m3u
                    </p>
                  </div>

                  <div className="flex gap-2 justify-end pt-3 border-t border-slate-800/40">
                    <button
                      type="button"
                      onClick={() => setShowExportModal(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-350 text-[14px] font-black uppercase rounded border border-slate-700 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={runExportPrerecord}
                      className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-[14px] font-black uppercase rounded shadow transition cursor-pointer shadow-purple-950/20"
                    >
                      Export Broadcast Package
                    </button>
                  </div>
                </div>
              )}

              {exportState === 'exporting' && (
                <div className="py-8 flex flex-col items-center justify-center space-y-4">
                  <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
                  <p className="text-[16px] font-bold text-slate-300">Assembling playlist and copying MP3s...</p>
                  <p className="text-[14px] text-slate-500">Please do not close this window</p>
                </div>
              )}

              {exportState === 'error' && (
                <div className="space-y-4 pt-1">
                  <div className="bg-red-500/10 border border-red-500/20 rounded p-3.5 flex items-start gap-2.5 text-red-500">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-[16px] font-bold">Export Failed</p>
                      <p className="text-[14px] leading-relaxed mt-1 text-red-400">{exportError}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setShowExportModal(false)}
                      className="px-4 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 text-[14px] font-bold uppercase rounded border border-slate-700 transition cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={runExportPrerecord}
                      className="px-4.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[14px] font-black uppercase rounded shadow cursor-pointer shadow-purple-950/20"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {exportState === 'success' && exportResult && (
                <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-3.5 flex items-start gap-2.5 text-emerald-500">
                    <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[16px] font-bold text-emerald-400">Export Completed Successfully</p>
                      <p className="text-[14px] leading-relaxed mt-1 text-emerald-300">
                        Broadcasting package compiled into local folder:
                      </p>
                      <p className="text-[14px] font-mono select-all bg-slate-950 p-2 rounded text-emerald-200 break-all mt-1.5 border border-emerald-900/30">
                        {exportResult.exportFolder}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 bg-slate-950/40 rounded border border-slate-800 text-center">
                      <span className="block text-[20px] font-black font-mono text-purple-400">{exportResult.totalCount}</span>
                      <span className="text-[12px] font-black uppercase text-slate-500 tracking-wider">Scheduled</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/40 rounded border border-slate-800 text-center">
                      <span className="block text-[20px] font-black font-mono text-emerald-400">{exportResult.copiedCount}</span>
                      <span className="text-[12px] font-black uppercase text-slate-500 tracking-wider">Copied</span>
                    </div>
                    <div className="p-2.5 bg-slate-950/40 rounded border border-slate-800 text-center">
                      <span className="block text-[20px] font-black font-mono text-amber-500">{exportResult.missingCount}</span>
                      <span className="text-[12px] font-black uppercase text-slate-500 tracking-wider">Missing</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 bg-slate-950/30 p-2.5 rounded border border-slate-850 text-slate-300 font-sans">
                    <p className="text-[14px] font-bold text-slate-200">Created Package Files:</p>
                    <ul className="text-[14px] font-mono space-y-1.5 pl-3 list-disc text-slate-400">
                      <li>{exportResult.txtFilename || `${exportResult.baseFilename}.txt`} <span className="text-[12px] text-slate-550 font-sans font-medium">(Summary Schedule)</span></li>
                      <li>{exportResult.m3uFilename || `${exportResult.baseFilename}.m3u`} <span className="text-[12px] text-slate-550 font-sans font-medium">(M3U Playlist File)</span></li>
                      <li>MP3 Files <span className="text-[12px] text-slate-550 font-sans font-medium">(Break 1, Break 2...)</span></li>
                    </ul>
                  </div>

                  <div className="flex gap-2 justify-end pt-2 border-t border-slate-800/40">
                    <button
                      type="button"
                      onClick={() => setShowExportModal(false)}
                      className="px-4 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 text-[14px] font-bold uppercase rounded border border-slate-700 transition cursor-pointer"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenExportFolder(exportResult.exportFolder)}
                      className="flex items-center gap-1.5 px-4.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[14px] font-black uppercase rounded shadow-md transition cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Open Folder</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

