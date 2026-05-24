/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, List, Settings, Plus, Play, CheckCircle, AlertCircle, RefreshCw, LogOut, ChevronLeft, ChevronRight, Save, Trash2, History, Folder, HardDrive, Wifi, WifiOff, ShieldCheck, Mail, Globe, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addHours, subHours, isSameMinute, startOfHour, addMinutes, isAfter, isBefore, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Schedule, ScheduleType, LogEntry } from './types';
import PlayerTab from './components/PlayerTab';
import SchedulerTab from './components/SchedulerTab';
import LogTab from './components/LogTab';
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
  availableFilesCache
} from './lib/driveService';

export default function App() {
  const isPlayerMode = (import.meta as any).env?.VITE_APP_MODE === 'Player';
  const [activeTab, setActiveTab] = useState<'player' | 'scheduler' | 'log'>('player');
  const [durationUpdates, setDurationUpdates] = useState(0);

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
  const [manualToken, setManualToken] = useState('');
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [driveMP3s, setDriveMP3s] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showLocationsModal, setShowLocationsModal] = useState(false);
  
  // Prerecord Confirmation states
  const [showPrerecordConfirmStep, setShowPrerecordConfirmStep] = useState(false);
  const [prerecordConfirmDetails, setPrerecordConfirmDetails] = useState<{ startDate: Date; totalMinutes: number } | null>(null);

  // Fancy Browser folder modal states
  const [showFancyBrowser, setShowFancyBrowser] = useState(false);
  const [fancyBrowserPath, setFancyBrowserPath] = useState('');
  const [fancyBrowserFolders, setFancyBrowserFolders] = useState<string[]>([]);
  const [fancyBrowserParent, setFancyBrowserParent] = useState<string | null>(null);
  const [fancyBrowserError, setFancyBrowserError] = useState<string | null>(null);
  const [fancyBrowserTargetField, setFancyBrowserTargetField] = useState<'schedules' | 'mp3s' | 'logs' | null>(null);

  // Saving state for Folders Modal to prevent button flickering
  const [isSavingAndVerifying, setIsSavingAndVerifying] = useState(false);

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
      fetch('/api/check-local-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localPathMP3s: settings.localPathMP3s,
          localPathLogs: settings.localPathLogs,
          localPathSchedules: settings.localPathSchedules
        })
      })
      .then(r => r.json())
      .then(res => {
        setIsDriveActive(true);
        if (res.exists) {
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
    } catch (error) {
      console.error('Failed to fetch data for mode ' + settings.mode, error);
    } finally {
      setIsSyncing(false);
      setLoading(false);
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

  const loadFancyBrowserDirectories = async (currentPath: string) => {
    try {
      const url = `/api/list-directories?path=${encodeURIComponent(currentPath)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setFancyBrowserPath(data.currentPath);
        setFancyBrowserFolders(data.folders || []);
        setFancyBrowserParent(data.parentPath);
        setFancyBrowserError(null);
      } else {
        setFancyBrowserError(data.error || 'Failed to list folder directory.');
      }
    } catch (err: any) {
      setFancyBrowserError(err.message || 'Network error listing directories.');
    }
  };

  const handleOpenFancyBrowser = async (targetField: 'schedules' | 'mp3s' | 'logs') => {
    setFancyBrowserTargetField(targetField);
    let initialPath = '';
    if (targetField === 'schedules') initialPath = draftLocalPathSchedules;
    else if (targetField === 'mp3s') initialPath = draftLocalPathMP3s;
    else if (targetField === 'logs') initialPath = draftLocalPathLogs;

    setFancyBrowserError(null);
    setShowFancyBrowser(true);
    await loadFancyBrowserDirectories(initialPath);
  };

  const handleFancyBrowserSelectDir = (subDirName: string) => {
    const separator = fancyBrowserPath.includes('\\') ? '\\' : '/';
    const cleanPath = fancyBrowserPath.endsWith(separator) 
      ? fancyBrowserPath + subDirName 
      : fancyBrowserPath + separator + subDirName;
    loadFancyBrowserDirectories(cleanPath);
  };

  const handleFancyBrowserNavigateParent = () => {
    if (fancyBrowserParent) {
      loadFancyBrowserDirectories(fancyBrowserParent);
    }
  };

  const handleFancyBrowserConfirmSelect = () => {
    if (fancyBrowserTargetField === 'schedules') {
      setDraftLocalPathSchedules(fancyBrowserPath);
    } else if (fancyBrowserTargetField === 'mp3s') {
      setDraftLocalPathMP3s(fancyBrowserPath);
    } else if (fancyBrowserTargetField === 'logs') {
      setDraftLocalPathLogs(fancyBrowserPath);
    }
    setShowFancyBrowser(false);
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
        const resCheck = await fetch('/api/check-local-paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            localPathMP3s: draftLocalPathMP3s,
            localPathLogs: draftLocalPathLogs,
            localPathSchedules: draftLocalPathSchedules
          })
        }).then(r => r.json()).catch(() => ({ exists: false }));
        
        setLocalPathsUnavailable(!resCheck.exists);
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
        const resCheck = await fetch('/api/check-local-paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            localPathMP3s: updatedSettings.localPathMP3s,
            localPathLogs: updatedSettings.localPathLogs,
            localPathSchedules: updatedSettings.localPathSchedules
          })
        }).then(r => r.json()).catch(() => ({ exists: false }));

        setIsDriveActive(true);
        setIsDriveValidated(true);
        setLocalPathsUnavailable(!resCheck.exists);
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
        <p className="text-xs font-bold text-slate-500 tracking-wider animate-pulse select-none">
          Connect to google drive using the pop-up window
        </p>
      </div>
    );
  }



  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] font-sans overflow-hidden">
      {/* Top Header - Branding & Nav */}
      <header className="bg-[#0F172A] px-3 py-2 shrink-0 z-20">
        <div className="flex items-center justify-between gap-3 max-w-[400px] mx-auto">
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
              <span className="text-[10px] font-bold uppercase tracking-tighter hide-player-name">Player</span>
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
                <span className="text-[10px] font-bold uppercase tracking-tighter hide-scheduler-name">Scheduler</span>
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
              <span className="text-[10px] font-bold uppercase tracking-tighter hide-log-name">Log</span>
            </button>
          </div>
        </div>
      </header>

      {/* Control Strip - Time & Refresh (Collapsed) */}
      <div className="bg-white border-b border-slate-200 py-1.5 px-2 shrink-0 shadow-sm z-10">
        <div className="max-w-[400px] mx-auto flex items-center justify-between gap-4">
          {isPre ? (
            <div className="flex flex-col py-0.5">
              <p className="text-[8px] uppercase text-purple-600 font-black tracking-widest leading-none">Prerecord time and date</p>
              <p className="text-xs font-mono font-black text-slate-900 tabular-nums mt-1 leading-none">
                {prerecordDate ? format(prerecordDate, 'yyyy-MM-dd HH:mm') : ''}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-[9px] uppercase text-slate-400 font-black tracking-tighter">Time</p>
              <p className="text-[9px] font-mono font-black text-slate-900 tabular-nums leading-none">{format(now, 'HH:mm:ss')}</p>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            {isPre ? (
              <span className="text-[8px] bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-black uppercase leading-none tracking-wider whitespace-nowrap">
                PAUSED
              </span>
            ) : (
              <p className="text-[8px] uppercase text-blue-600 font-black tracking-tight leading-none whitespace-nowrap">Refresh: {formatCountdown(countdown)}</p>
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
              <span className="text-[9px] font-black uppercase tracking-tighter">Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-[#F8FAFC] pb-2">
        {/* Missing Files Warning Banner */}
        {(() => {
          const isMissingSchedules = schedules.length === 0;
          const isMissingMP3s = driveMP3s.length === 0;

          if (isMissingSchedules || isMissingMP3s) {
            return (
              <div className="max-w-[400px] mx-auto px-4 mt-3">
                <div className="bg-amber-950/20 border border-amber-500/20 text-amber-500 rounded-xl p-3 flex flex-col gap-1.5 shadow-sm">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Resource Warning
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-400">
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
                      className="flex items-center gap-1.5 py-1 px-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[9px] uppercase tracking-wider rounded border border-amber-400 transition cursor-pointer"
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
          "w-full mx-auto px-1 pt-3 h-full",
          activeTab === 'player' ? "max-w-[200px]" : "max-w-[1000px]"
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
        <div className="max-w-[400px] mx-auto flex justify-between items-center gap-2">
          <button
            onClick={() => setShowLocationsModal(true)}
            className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-all cursor-pointer shadow-sm text-[9px] font-black uppercase tracking-widest leading-none"
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Folders</span>
          </button>

          {/* DEMO Indicator displayed only in Demo storage Mode */}
          {locationMode === 'Demo' && (
            <span className="text-[9px] font-black tracking-widest text-[#F59E0B] animate-pulse bg-amber-950/40 px-2 py-1 rounded border border-amber-500/20 leading-none">
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
                }
              }}
              className={cn(
                "px-2 px-2.5 py-1 text-[8px] font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5",
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
                "px-2 px-2.5 py-1 text-[8px] font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5",
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
                          <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Air Date</span>
                          <span className="text-xs font-bold text-purple-400">
                            {format(prerecordConfirmDetails.startDate, 'EEEE, MMMM do, yyyy')}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Start Time (24h)</span>
                            <span className="text-xs font-black font-mono text-purple-400">
                              {format(prerecordConfirmDetails.startDate, 'HH:mm')}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Start Time (12h)</span>
                            <span className="text-xs font-black font-mono text-purple-400">
                              {format(prerecordConfirmDetails.startDate, 'h:mm a')}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col">
                          <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Show Length / Duration</span>
                          <span className="text-xs font-bold text-purple-400">
                            {parseInt(prerecordHoursInput, 10) > 0 ? `${prerecordHoursInput} ${parseInt(prerecordHoursInput, 10) === 1 ? 'hour' : 'hours'}` : ''}
                            {parseInt(prerecordHoursInput, 10) > 0 && parseInt(prerecordMinutesInput, 10) > 0 ? ' and ' : ''}
                            {parseInt(prerecordMinutesInput, 10) > 0 || parseInt(prerecordHoursInput, 10) === 0 ? `${prerecordMinutesInput} minutes` : ''}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-900/60">
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Calculated End (24h)</span>
                            <span className="text-xs font-black font-mono text-emerald-400">
                              {format(addMinutes(prerecordConfirmDetails.startDate, prerecordConfirmDetails.totalMinutes), 'HH:mm')}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Calculated End (12h)</span>
                            <span className="text-xs font-black font-mono text-emerald-400">
                              {format(addMinutes(prerecordConfirmDetails.startDate, prerecordConfirmDetails.totalMinutes), 'h:mm a')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-[9px] text-slate-400 leading-normal bg-slate-950/25 p-2 rounded border border-slate-850/50">
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
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded border border-slate-700 transition cursor-pointer active:translate-y-px"
                    >
                      Adjust
                    </button>
                    <button
                      type="button"
                      onClick={handleFinalConfirmPrerecord}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded shadow-md shadow-emerald-950/20 transition cursor-pointer active:translate-y-px"
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
                    <p className="text-[10px] leading-relaxed text-slate-300">
                      Set the Date and Time of when the prerecord will air.
                    </p>

                    <div className="space-y-3">
                      {/* Date picker */}
                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1">Air Date of Prerecord</label>
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
                        <label className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1">Show Start Time (24h - HH:mm)</label>
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
                        <label className="block text-[8px] font-black uppercase tracking-wider text-slate-450 mb-1">Show Length</label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <input 
                              type="number" 
                              required
                              min={0}
                              max={999}
                              value={prerecordHoursInput}
                              onChange={e => setPrerecordHoursInput(e.target.value)}
                              className="w-full pl-3 pr-8 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono font-bold text-slate-200 outline-none focus:ring-1 focus:ring-purple-500 transition-all"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-500 pointer-events-none uppercase">Hrs</span>
                          </div>
                          <div className="relative">
                            <input 
                              type="number" 
                              required
                              min={0}
                              max={59}
                              value={prerecordMinutesInput}
                              onChange={e => setPrerecordMinutesInput(e.target.value)}
                              className="w-full pl-3 pr-8 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono font-bold text-slate-200 outline-none focus:ring-1 focus:ring-purple-500 transition-all"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-500 pointer-events-none uppercase">Min</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {prerecordError && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded p-2.5 flex items-start gap-2 text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="text-[10px] leading-tight font-medium">{prerecordError}</span>
                      </div>
                    )}
                  </div>

                  {/* Modal Actions */}
                  <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/20 flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowPrerecordModal(false)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded border border-slate-700 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-black uppercase tracking-wider rounded shadow-md shadow-purple-950/20 transition"
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
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                <div className="flex items-center gap-2 text-blue-400">
                  <Folder className="w-5 h-5" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-white">Default Storage Folders</h3>
                </div>
              </div>

              {/* Modal Core Form */}
              <form onSubmit={handleSaveLocations} className="flex flex-col flex-1 overflow-hidden">
                {/* Modal Content */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                  
                  {/* Mode Selector Row */}
                  <div className="space-y-1.5">
                    <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest leading-none">Select Workspace Mode</p>
                    <div className="p-1.5 bg-slate-950 border border-slate-900 rounded-lg flex gap-1.5 items-center shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)]">
                      <button
                        type="button"
                        onClick={() => setLocationMode('Demo')}
                        className={cn(
                          "flex-1 py-1 text-[9px] font-black uppercase tracking-wider rounded border transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5",
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
                        Demo Mode
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationMode('Drive')}
                        className={cn(
                          "flex-1 py-1 text-[9px] font-black uppercase tracking-wider rounded border transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5",
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
                          "flex-1 py-1 text-[9px] font-black uppercase tracking-wider rounded border transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5",
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
                          <label className="text-[9px] font-black uppercase text-blue-400 tracking-wider">Local Schedules Path</label>
                          {!draftLocalPathSchedules ? (
                            <span className="text-[8px] bg-amber-950 text-amber-500 border border-amber-800/40 px-1.5 py-0.5 rounded font-bold uppercase">To be set</span>
                          ) : (
                            <span className="text-[8px] bg-emerald-950 text-emerald-500 border border-emerald-900/40 px-1.5 py-0.5 rounded font-bold uppercase">Configured</span>
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
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 hover:border-slate-650 rounded text-[9px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Browse
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenFancyBrowser('schedules')}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 rounded text-[9px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Browse Fancy
                          </button>
                        </div>
                        <p className="text-[8px] text-slate-500 mt-0.5">Directory where Interstitial-er saves the schedules configuration.</p>
                      </div>
 
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[9px] font-black uppercase text-blue-400 tracking-wider">Local MP3s Directory Path</label>
                          {!draftLocalPathMP3s ? (
                            <span className="text-[8px] bg-amber-950 text-amber-500 border border-amber-800/40 px-1.5 py-0.5 rounded font-bold uppercase">To be set</span>
                          ) : (
                            <span className="text-[8px] bg-emerald-950 text-emerald-500 border border-emerald-900/40 px-1.5 py-0.5 rounded font-bold uppercase">Configured</span>
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
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 hover:border-slate-655 rounded text-[9px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Browse
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenFancyBrowser('mp3s')}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 rounded text-[9px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Browse Fancy
                          </button>
                        </div>
                        <p className="text-[8px] text-slate-500 mt-0.5">Absolute path containing your secondary .mp3 playback audio files.</p>
                      </div>
 
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[9px] font-black uppercase text-blue-400 tracking-wider">Local Play Log Records Path</label>
                          {!draftLocalPathLogs ? (
                            <span className="text-[8px] bg-amber-950 text-amber-500 border border-amber-800/40 px-1.5 py-0.5 rounded font-bold uppercase">To be set</span>
                          ) : (
                            <span className="text-[8px] bg-emerald-950 text-emerald-500 border border-emerald-900/40 px-1.5 py-0.5 rounded font-bold uppercase">Configured</span>
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
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-100 border border-slate-700 hover:border-slate-655 rounded text-[9px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Browse
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenFancyBrowser('logs')}
                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 rounded text-[9px] font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Browse Fancy
                          </button>
                        </div>
                        <p className="text-[8px] text-slate-500 mt-0.5">Directory location where logs are stored sequentially.</p>
                      </div>
 
                      {localPathsUnavailable && (
                        <div className="p-3 bg-amber-950/20 border border-amber-900/40 text-amber-400 rounded text-[9px] leading-relaxed">
                          ⚠️ One or more specified local directories are missing or inaccessible. Please verify paths are correct and physically exist on host desktop folders.
                        </div>
                      )}
                    </div>
                  )}

                  {locationMode === 'Drive' && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[9px] font-black uppercase text-blue-400 tracking-wider">Google Drive Preferences Folder ID</label>
                          {!draftDriveFolderPreferences ? (
                            <span className="text-[8px] bg-amber-950 text-amber-500 border border-amber-800/40 px-1.5 py-0.5 rounded font-bold uppercase">To be set</span>
                          ) : (
                            <span className="text-[8px] bg-emerald-950 text-emerald-500 border border-emerald-900/40 px-1.5 py-0.5 rounded font-bold uppercase">Configured</span>
                          )}
                        </div>
                        <input 
                          type="text"
                          placeholder="Google Drive Directory ID string..."
                          value={draftDriveFolderPreferences}
                          onChange={e => setDraftDriveFolderPreferences(extractFolderId(e.target.value))}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <p className="text-[8px] text-slate-500 mt-0.5">Folder storing schedules.json schedules inside Drive.</p>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[9px] font-black uppercase text-blue-400 tracking-wider">Google Drive MP3 Folder ID</label>
                          {!draftDriveFolderMP3s ? (
                            <span className="text-[8px] bg-amber-950 text-amber-500 border border-amber-800/40 px-1.5 py-0.5 rounded font-bold uppercase">To be set</span>
                          ) : (
                            <span className="text-[8px] bg-emerald-950 text-emerald-500 border border-emerald-900/40 px-1.5 py-0.5 rounded font-bold uppercase">Configured</span>
                          )}
                        </div>
                        <input 
                          type="text"
                          placeholder="Google Drive Directory ID string..."
                          value={draftDriveFolderMP3s}
                          onChange={e => setDraftDriveFolderMP3s(extractFolderId(e.target.value))}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <p className="text-[8px] text-slate-500 mt-0.5">Folder containing .mp3 playback MP3s inside Google Drive.</p>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[9px] font-black uppercase text-blue-400 tracking-wider">Google Drive Logs Folder ID</label>
                          {!draftDriveFolderLogs ? (
                            <span className="text-[8px] bg-amber-950 text-amber-500 border border-amber-800/40 px-1.5 py-0.5 rounded font-bold uppercase">To be set</span>
                          ) : (
                            <span className="text-[8px] bg-emerald-950 text-emerald-500 border border-emerald-900/40 px-1.5 py-0.5 rounded font-bold uppercase">Configured</span>
                          )}
                        </div>
                        <input 
                          type="text"
                          placeholder="Google Drive Directory ID string..."
                          value={draftDriveFolderLogs}
                          onChange={e => setDraftDriveFolderLogs(extractFolderId(e.target.value))}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <p className="text-[8px] text-slate-500 mt-0.5">Folder containing log tracking entries inside Google Drive.</p>
                      </div>

                      {/* Google Account Connection Status inside modal */}
                      <div className="pt-2 border-t border-slate-800 mt-3">
                        <div className={cn(
                          "p-3 rounded-lg flex flex-col gap-2 transition-colors duration-200",
                          user 
                            ? "bg-slate-950/40 border border-slate-850" 
                            : "bg-red-950/25 border border-red-500/30 text-red-400"
                        )}>
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Authorization Status</span>
                            {user ? (
                              <span className="text-[8px] text-emerald-400 font-bold uppercase">Linked</span>
                            ) : (
                              <span className="text-[8px] text-red-500 font-bold uppercase mt-0.5 animate-pulse">Not Signed In</span>
                            )}
                          </div>
                          {user ? (
                            <div className="space-y-2">
                              <p className="text-[9px] font-mono text-slate-300 truncate">{user.email}</p>
                              <button
                                type="button"
                                onClick={handleAuthSignOut}
                                className="w-full py-1 px-2 text-[8px] font-black bg-red-950/30 text-red-400 border border-red-900/40 hover:bg-red-900 hover:text-white rounded transition"
                              >
                                Disconnect Google Account
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={handleAuthSignIn}
                                className="w-full py-1 text-[8px] font-black bg-blue-600 hover:bg-blue-700 text-white rounded transition uppercase"
                              >
                                Sign In with Google
                              </button>

                              <div className="pt-1.5 border-t border-slate-900/40">
                                <button
                                  type="button"
                                  onClick={() => setShowManualOverride(!showManualOverride)}
                                  className="text-[7.5px] text-slate-400 hover:text-slate-200 underline uppercase tracking-tight block ml-auto transition"
                                >
                                  {showManualOverride ? "Hide Manual Bypass" : "Manual OAuth Token Bypass"}
                                </button>
                                
                                {showManualOverride && (
                                  <div className="mt-2 space-y-1.5 p-2 bg-slate-950/60 border border-slate-800 rounded">
                                    <span className="text-[7.5px] font-black uppercase text-slate-400 block">Inject OAuth Access Token</span>
                                    <div className="flex gap-1.5">
                                      <input
                                        type="password"
                                        placeholder="Paste access token (Bearer)..."
                                        value={manualToken}
                                        onChange={(e) => setManualToken(e.target.value)}
                                        className="flex-1 px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[9px] font-mono text-slate-350 outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleManualTokenOverride(manualToken)}
                                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-750 text-[8px] font-bold uppercase rounded transition"
                                      >
                                        Apply
                                      </button>
                                    </div>
                                    <p className="text-[7px] text-slate-500 leading-normal">
                                      If running in desktop or an iframe sandbox, obtain a Google access token from the web console and inject it here directly to bypass popup restrictions.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Diagnostic Panel for Google Drive mode */}
                      {driveValidationError && (
                        <div className="mt-2.5 p-3.5 bg-red-950/15 border border-red-900/40 rounded-lg text-[9px] text-red-300 space-y-2 max-w-full">
                          <div className="flex items-center gap-1.5 font-bold uppercase text-red-400 text-[8px]">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>Authorization Diagnostic Stream</span>
                          </div>
                          <p className="font-sans leading-relaxed text-slate-300">
                            The authorization sequence returned an issue. Inside desktop or sandbox environments, explicit Google validation redirect limits apply:
                          </p>
                          <div className="p-1 px-2 bg-slate-950 rounded border border-slate-800 font-mono text-[8px] text-slate-400 select-all overflow-x-auto whitespace-pre block max-w-full">
                            {driveValidationError}
                          </div>
                          <ul className="list-disc pl-3.5 space-y-1 text-slate-400 text-[8px] leading-relaxed">
                            <li>
                              <strong className="text-slate-300">Electron Redirection Restriction:</strong> Google OAuth tightens domains from unknown ports or non-certified custom schemes.
                            </li>
                            <li>
                              <strong className="text-slate-300">Authorized Domains Check:</strong> Navigate to Firebase Console &gt; Authentication &gt; Settings &gt; Authorized Domains, and confirm that <code className="bg-slate-900 px-1 py-0.5 rounded select-all">{window.location.origin}</code> is whitelisted.
                            </li>
                            <li>
                              <strong className="text-slate-300">Callback verification:</strong> Ensure your GCP Credentials specify the correct URI callbacks.
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
 
                  {locationMode === 'Demo' && (
                    <div className="space-y-4 text-slate-300 text-[10px]">
                      <div className="p-3.5 bg-amber-950/10 border border-amber-900/30 rounded-lg whitespace-pre-line text-[9px] leading-relaxed text-amber-500">
                        Demo workspace mode retrieves configurations automatically from general demonstration Google Drive directories. 
                        Custom file configurations are disabled in Demo workspace mode.
                      </div>

                      <div className="p-3 rounded-lg bg-slate-950/45 border border-slate-850 space-y-2.5">
                        <div>
                          <p className="text-[8px] font-black uppercase text-blue-400">demo schedules folder id</p>
                          <p className="text-[9px] font-mono text-slate-400 select-all truncate">1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black uppercase text-blue-400">demo mp3s folder id</p>
                          <p className="text-[9px] font-mono text-slate-400 select-all truncate">11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black uppercase text-blue-400">demo history logs folder id</p>
                          <p className="text-[9px] font-mono text-slate-400 select-all truncate">1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx</p>
                        </div>
                      </div>

 
                      {/* Google Account Connection Status inside modal for Demo mode as well */}
                      <div className="pt-2 border-t border-slate-800">
                        <div className={cn(
                          "p-3 rounded-lg flex flex-col gap-2 transition-colors duration-200",
                          user 
                            ? "bg-slate-950/40 border border-slate-850" 
                            : "bg-red-950/25 border border-red-500/30 text-red-400"
                        )}>
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Authorization Status</span>
                            {user ? (
                              <span className="text-[8px] text-emerald-400 font-bold uppercase">Linked</span>
                            ) : (
                              <span className="text-[8px] text-red-500 font-bold uppercase mt-0.5 animate-pulse">Not Signed In</span>
                            )}
                          </div>
                          {user ? (
                            <div className="space-y-2">
                              <p className="text-[9px] font-mono text-slate-300 truncate">{user.email}</p>
                              <button
                                type="button"
                                onClick={handleAuthSignOut}
                                className="w-full py-1 px-2 text-[8px] font-black bg-red-950/30 text-red-400 border border-red-900/40 hover:bg-red-900 hover:text-white rounded transition cursor-pointer"
                              >
                                Disconnect Google Account
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={handleAuthSignIn}
                              className="w-full py-1 text-[8px] font-black bg-blue-600 hover:bg-blue-700 text-white rounded transition uppercase cursor-pointer"
                            >
                              Sign In with Google
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Diagnostic Panel for Google Demo mode */}
                      {driveValidationError && (
                        <div className="mt-2.5 p-3.5 bg-red-950/15 border border-red-900/40 rounded-lg text-[9px] text-red-300 space-y-2 max-w-full">
                          <div className="flex items-center gap-1.5 font-bold uppercase text-red-400 text-[8px]">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>Authorization Diagnostic Stream</span>
                          </div>
                          <p className="font-sans leading-relaxed text-slate-300">
                            The authorization sequence returned an issue. Inside desktop or sandbox environments, explicit Google validation redirect limits apply:
                          </p>
                          <div className="p-1 px-2 bg-slate-950 rounded border border-slate-800 font-mono text-[8px] text-slate-400 select-all overflow-x-auto whitespace-pre block max-w-full">
                            {driveValidationError}
                          </div>
                          <ul className="list-disc pl-3.5 space-y-1 text-slate-400 text-[8px] leading-relaxed">
                            <li>
                              <strong className="text-slate-300">Electron Redirection Restriction:</strong> Google OAuth tightens domains from unknown ports or non-certified custom schemes.
                            </li>
                            <li>
                              <strong className="text-slate-300">Authorized Domains Check:</strong> Navigate to Firebase Console &gt; Authentication &gt; Settings &gt; Authorized Domains, and confirm that <code className="bg-slate-900 px-1 py-0.5 rounded select-all">{window.location.origin}</code> is whitelisted.
                            </li>
                            <li>
                              <strong className="text-slate-300">Callback verification:</strong> Ensure your GCP Credentials specify the correct URI callbacks.
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Feedback Status */}
                  {locationsError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded p-2.5 flex items-start gap-2 text-red-400">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="text-[9px] leading-normal font-bold">{locationsError}</span>
                    </div>
                  )}

                  {locationsSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2.5 flex items-start gap-2 text-emerald-400">
                      <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="text-[9px] leading-normal font-bold">{locationsSuccess}</span>
                    </div>
                  )}

                </div>

                {/* Submit Actions */}
                <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/20 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowLocationsModal(false)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] font-bold uppercase rounded border border-slate-700 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSyncing || isValidatingDrive}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded shadow transition disabled:opacity-50 cursor-pointer"
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
        {showFancyBrowser && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-slate-100 flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                <div className="flex items-center gap-2 text-blue-400">
                  <Folder className="w-5 h-5" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-white">
                    Custom Directory Selector
                  </h3>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowFancyBrowser(false)}
                  className="text-slate-500 hover:text-slate-300 font-bold text-xs uppercase cursor-pointer"
                >
                  Close
                </button>
              </div>

              {/* Modal Search/Path Bar */}
              <div className="p-4 border-b border-slate-800/60 bg-slate-950/20 space-y-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-black uppercase tracking-wider text-slate-500">Current Folder Path</span>
                  <div className="flex gap-1.5">
                    <input 
                      type="text"
                      value={fancyBrowserPath}
                      onChange={e => {
                        setFancyBrowserPath(e.target.value);
                      }}
                      onBlur={() => loadFancyBrowserDirectories(fancyBrowserPath)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          loadFancyBrowserDirectories(fancyBrowserPath);
                        }
                      }}
                      className="w-full px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-xs font-mono font-bold text-slate-200 outline-none"
                    />
                    {fancyBrowserParent && (
                      <button
                        type="button"
                        onClick={handleFancyBrowserNavigateParent}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-705 border-slate-700 font-black uppercase text-[9px] rounded transition-all cursor-pointer"
                        title="Go up one folder level"
                      >
                        Up
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Error messages if any */}
              {fancyBrowserError && (
                <div className="mx-4 mt-3 p-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-[10px] leading-relaxed">
                  ⚠️ {fancyBrowserError}
                </div>
              )}

              {/* Folders list */}
              <div className="flex-1 overflow-y-auto p-4 min-h-[220px] max-h-[350px]">
                <div className="text-[8px] font-black uppercase tracking-wider text-slate-500 mb-2">Sub-directories (double click to enter)</div>
                {fancyBrowserFolders.length === 0 ? (
                  <div className="text-center py-8 text-[10px] text-slate-500 italic">No subdirectory folders found inside this folder location. Use standard manual path edits above.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-1">
                    {fancyBrowserFolders.map((folderName) => (
                      <div
                        key={folderName}
                        onDoubleClick={() => handleFancyBrowserSelectDir(folderName)}
                        onClick={() => {
                          const separator = fancyBrowserPath.includes('\\') ? '\\' : '/';
                          const cleanPath = fancyBrowserPath.endsWith(separator) 
                            ? fancyBrowserPath + folderName 
                            : fancyBrowserPath + separator + folderName;
                          setFancyBrowserPath(cleanPath);
                        }}
                        className="flex items-center gap-2.5 px-3 py-2 bg-slate-950/40 hover:bg-blue-950/30 border border-slate-800/60 hover:border-blue-800/40 rounded-lg text-xs text-slate-300 hover:text-white cursor-pointer select-none transition group"
                      >
                        <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0 group-hover:scale-105 transition" />
                        <span className="font-mono truncate">{folderName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selection prompt */}
              <div className="p-4 bg-slate-950/40 border-t border-slate-800 flex flex-col gap-3">
                <p className="text-[9px] leading-relaxed text-slate-400">
                  Select index folder as destination path for <strong className="text-blue-400 uppercase">{fancyBrowserTargetField}</strong> configurations and resources.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowFancyBrowser(false)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 text-[10px] font-bold uppercase rounded border border-slate-700 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleFancyBrowserConfirmSelect}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded shadow cursor-pointer active:translate-y-px"
                  >
                    Select Folder
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

