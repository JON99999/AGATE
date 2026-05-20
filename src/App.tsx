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
import { cn } from './lib/utils';
import { 
  initAuth, 
  googleSignIn, 
  handleLogout, 
  getAccessToken, 
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
  DEFAULT_SETTINGS
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
  const [driveMP3s, setDriveMP3s] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showLocationsModal, setShowLocationsModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);

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
        setIsDriveValidated(true);
        if (res.exists) {
          setLocalPathsUnavailable(false);
        } else {
          setLocalPathsUnavailable(true);
        }
        fetchDataForMode(settings);
      })
      .catch(() => {
        setIsDriveActive(true);
        setIsDriveValidated(true);
        setLocalPathsUnavailable(true);
        fetchDataForMode(settings);
      });
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
            }
          } catch (err: any) {
            setIsDriveValidated(false);
            setDriveValidationError(err.message || 'Error occurred while validating folders.');
            setLoading(false);
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
        }
        setLoading(false);
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
        
        const mappedMP3s = (localMP3s || []).map((file: any) => ({
          name: file.name,
          size: file.size,
          duration: file.duration || '0:15',
          path: file.path
        }));
        setDriveMP3s(mappedMP3s);
        setSyncTime(new Date());
        setScrollTrigger(prev => prev + 1);
        setIsDriveActive(true);
        setIsDriveValidated(true);
      } else {
        // 'Drive' or 'Demo' mode: both pull from Google Drive
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
    if (settings.mode === 'Drive' && isDriveValidated) {
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
    if (settings.mode === 'Local' || settings.mode === 'Demo') {
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

    if (settings.mode === 'Local' || settings.mode === 'Demo') {
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
      setPrerecordLengthMinutes(totalMinutes);
      setPrerecordDate(parsedDate);
      setPlayMode('Prerecord');
      setShowPrerecordModal(false);
    } catch (err: any) {
      setPrerecordError(err.message || 'Error occurred while validating date and time.');
    }
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
    try {
      const current = getSavedSettings();
      let updatedSettings = { ...current };

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
        // Run verification with the updated folder IDs
        setIsValidatingDrive(true);
        const success = await validateGoogleDriveAccess();
        if (success) {
          setIsDriveValidated(true);
          setDriveValidationError(null);
          await fetchDataForMode(updatedSettings);
          setLocationsSuccess('Google Drive directory IDs updated and validated.');
        } else {
          setIsDriveValidated(false);
          setDriveValidationError('Associated account does not have authorization/access on newly specified directory folder IDs.');
          setLocationsError('Verification of IDs failed. Please confirm correct and accessible folder resource permissions.');
        }
        setIsValidatingDrive(false);
      }

      setTimeout(() => {
        setLocationsSuccess(null);
        setShowLocationsModal(false);
      }, 1500);

    } catch (err: any) {
      setLocationsError(err.message || 'Failed to save configure locations.');
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
      } else {
        // Drive or Demo details: requires Google token and validation
        const hasToken = !!(getAccessToken() || token);
        if (hasToken) {
          setIsDriveActive(true);
          setIsValidatingDrive(true);
          setDriveValidationError(null);
          try {
            const success = await validateGoogleDriveAccess();
            if (success) {
              setIsDriveValidated(true);
              setDriveValidationError(null);
              await fetchDataForMode(updatedSettings);
            } else {
              setIsDriveValidated(false);
              setDriveValidationError('Connected Google account lacks read/write access to one or more configured shared directories.');
            }
          } catch (err: any) {
            setIsDriveValidated(false);
            setDriveValidationError(err.message || 'Error occurred while validating folders.');
          } finally {
            setIsValidatingDrive(false);
          }

          if (mode === 'Drive') {
            setShowLocationsModal(true);
          }
        } else {
          // Sequence Google Sign-in to occur only after mode select
          try {
            setLoading(true);
            setIsValidatingDrive(true);
            setDriveValidationError(null);
            const res = await googleSignIn();
            if (res) {
              setUser(res.user);
              setToken(res.accessToken);
              setIsDriveActive(true);
              const success = await validateGoogleDriveAccess();
              if (success) {
                setIsDriveValidated(true);
                setDriveValidationError(null);
                await fetchDataForMode(updatedSettings);
              } else {
                setIsDriveValidated(false);
                setDriveValidationError('Connected Google account lacks read/write access to one or more configured shared directories.');
              }
            } else {
              setIsDriveActive(false);
              setIsDriveValidated(false);
            }
          } catch (e: any) {
            console.error('Sign-in failed during mode selection:', e);
            setDriveValidationError(e.message || 'Verification of Google login failed.');
            setIsDriveActive(false);
            setIsDriveValidated(false);
          } finally {
            setIsValidatingDrive(false);
            setLoading(false);
          }

          if (mode === 'Drive') {
            setShowLocationsModal(true);
          }
        }
      }

      setShowWelcomeModal(false);
    } catch (err) {
      console.error('Failed to select mode:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <RefreshCw className={cn("w-8 h-8 animate-spin", isPre ? "text-purple-600" : "text-blue-500")} />
      </div>
    );
  }

  if (!isDriveValidated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-between text-slate-100 p-6 selection:bg-blue-500/30 selection:text-blue-200">
        <div className="flex-1 flex flex-col items-center justify-center max-w-md w-full mx-auto py-12">
          {/* Logo and Icon Header */}
          <div className="flex flex-col items-center text-center gap-3 mb-8">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-4 ring-blue-500/10 animate-[pulse_3s_infinite]">
              <Clock className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-widest text-white">Interstitial-er</h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mt-1">Remote Broadcast Synchronizer</p>
            </div>
          </div>

          {/* Core Info Panel */}
          <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="space-y-2">
              <h2 className="text-sm font-black uppercase text-slate-200 tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                Google Drive Workgroup Secure Login
              </h2>
              <p className="text-[11px] leading-relaxed text-slate-400">
                This app operates as a standalone local player synchronized with a shared Google Drive cloud repository. Offline mode has been disabled; you must authorize access to the shared workgroup files below to proceed.
              </p>
            </div>

            {/* folder Links Section */}
            <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800/50">
              <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest leading-none">Shared Directory Resources</p>
              
              <div className="space-y-2.5">
                {/* Prefs Box */}
                <div className="flex items-center justify-between text-[10px] bg-slate-900/40 p-2 rounded border border-slate-800/40 hover:border-slate-800 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <div className="truncate">
                      <p className="font-bold text-slate-200 leading-none">Preferences & Schedules</p>
                      <p className="text-[8px] font-mono text-slate-500 mt-0.5 truncate select-all">{DRIVE_FOLDERS.preferences}</p>
                    </div>
                  </div>
                  <a 
                    href={`https://drive.google.com/drive/folders/${DRIVE_FOLDERS.preferences}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-1 text-[8px] font-black text-blue-400 hover:text-blue-300 uppercase shrink-0"
                  >
                    Open <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>

                {/* MP3s Box */}
                <div className="flex items-center justify-between text-[10px] bg-slate-900/40 p-2 rounded border border-slate-800/40 hover:border-slate-800 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <div className="truncate">
                      <p className="font-bold text-slate-200 leading-none">MP3 Library Directory</p>
                      <p className="text-[8px] font-mono text-slate-500 mt-0.5 truncate select-all">{DRIVE_FOLDERS.mp3s}</p>
                    </div>
                  </div>
                  <a 
                    href={`https://drive.google.com/drive/folders/${DRIVE_FOLDERS.mp3s}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-1 text-[8px] font-black text-blue-400 hover:text-blue-300 uppercase shrink-0"
                  >
                    Open <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>

                {/* Logs Box */}
                <div className="flex items-center justify-between text-[10px] bg-slate-900/40 p-2 rounded border border-slate-800/40 hover:border-slate-800 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <div className="truncate">
                      <p className="font-bold text-slate-200 leading-none">Activity Log Directory</p>
                      <p className="text-[8px] font-mono text-slate-500 mt-0.5 truncate select-all">{DRIVE_FOLDERS.logs}</p>
                    </div>
                  </div>
                  <a 
                    href={`https://drive.google.com/drive/folders/${DRIVE_FOLDERS.logs}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-1 text-[8px] font-black text-blue-400 hover:text-blue-300 uppercase shrink-0"
                  >
                    Open <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            </div>

            {/* Error States or Loader */}
            {isValidatingDrive && (
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex flex-col items-center justify-center gap-2.5 text-center">
                <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300 animate-pulse">
                  Validating Shared Folder Connections...
                </p>
              </div>
            )}

            {driveValidationError && !isValidatingDrive && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-red-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Access Validation Failed
                </div>
                <p className="text-[10px] leading-relaxed">
                  {driveValidationError}
                </p>
                <p className="text-[9px] text-slate-400 leading-normal">
                  Note: Make sure your logged-in Google account has appropriate share access properties or try signing out to reconnect with a master user account.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            {!isValidatingDrive && (
              <div className="space-y-3 pt-2">
                {!user ? (
                  <button 
                    onClick={handleAuthSignIn}
                    className="w-full h-11 px-4 bg-white text-slate-800 hover:bg-slate-100 rounded-xl font-bold text-xs tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-3 cursor-pointer select-none border border-slate-200"
                  >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                    <span>Connect Google Drive</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-300 text-[10px] bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                      <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate font-mono font-semibold text-slate-200">{user?.email}</span>
                      <span className="ml-auto text-[8px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-black uppercase shrink-0">Signed In</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleAuthSignIn}
                        className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-black text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        Re-Authorize Folders
                      </button>
                      <button
                        onClick={handleAuthSignOut}
                        className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg hover:text-white border border-slate-700 transition-colors text-[10px] font-black uppercase tracking-wider cursor-pointer"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-md w-full mx-auto text-center border-t border-slate-900 pt-4 text-[9px] text-slate-600 font-bold uppercase tracking-wider">
          * Interstitial-er • v1.2.0
        </div>
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
                      "Schedules config (schedules.json) and .mp3 chimes could not be found."
                    ) : isMissingSchedules ? (
                      "The schedules configuration file (schedules.json) was not detected in this directory."
                    ) : (
                      "No play chimes (.mp3) files were found/listed inside your audio folder."
                    )}
                    {" Recommended to verify folder locations using the configuration tool."}
                  </p>
                  <div className="mt-1">
                    <button
                      onClick={() => setShowLocationsModal(true)}
                      className="py-1 px-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[9px] uppercase tracking-wider rounded border border-amber-400 transition"
                    >
                      Configure Directories
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
                  ? "bg-blue-300 shadow-[0_0_6px_#60A5FA]" 
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
                  ? "bg-purple-300 shadow-[0_0_6px_#C084FC]" 
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
                      <label className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1">Show Length</label>
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
                <button 
                  onClick={() => setShowLocationsModal(false)}
                  className="text-slate-500 hover:text-slate-300 font-bold text-xs uppercase"
                >
                  Close
                </button>
              </div>

              {/* Modal Core Form */}
              <form onSubmit={handleSaveLocations} className="flex flex-col flex-1 overflow-hidden">
                {/* Modal Content */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                  
                  {/* Active Storage Mode Banner */}
                  <div className="p-3 bg-slate-950/45 rounded-lg border border-slate-800 flex justify-between items-center">
                    <div>
                      <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Active Workspace Mode</p>
                      <p className="text-xs font-black uppercase text-blue-400 tracking-wider mt-0.5">{locationMode} MODE</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowLocationsModal(false);
                        setShowWelcomeModal(true);
                      }}
                      className="py-1 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-black uppercase tracking-wider transition-colors"
                    >
                      Switch Mode
                    </button>
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
                          placeholder="e.g. /Users/name/Music/Chimes"
                          value={draftLocalPathMP3s}
                          onChange={e => setDraftLocalPathMP3s(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <p className="text-[8px] text-slate-500 mt-0.5">Absolute path containing your secondary .mp3 playback audio chimes.</p>
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
                          onChange={e => setDraftDriveFolderPreferences(e.target.value)}
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
                          onChange={e => setDraftDriveFolderMP3s(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <p className="text-[8px] text-slate-500 mt-0.5">Folder containing .mp3 playback chimes inside Google Drive.</p>
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
                          onChange={e => setDraftDriveFolderLogs(e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <p className="text-[8px] text-slate-500 mt-0.5">Folder containing log tracking entries inside Google Drive.</p>
                      </div>

                      {/* Google Account Connection Status inside modal */}
                      <div className="pt-2 border-t border-slate-800 mt-3">
                        <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-850 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Authorization Status</span>
                            {user ? (
                              <span className="text-[8px] text-emerald-400 font-bold uppercase">Linked</span>
                            ) : (
                              <span className="text-[8px] text-amber-500 font-bold uppercase mt-0.5">Not Signed In</span>
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
                            <button
                              type="button"
                              onClick={handleAuthSignIn}
                              className="w-full py-1 text-[8px] font-black bg-blue-600 hover:bg-blue-700 text-white rounded transition uppercase"
                            >
                              Sign In with Google
                            </button>
                          )}
                        </div>
                      </div>
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
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] font-bold uppercase rounded border border-slate-700 transition"
                  >
                    Cancel
                  </button>
                  {locationMode !== 'Demo' && (
                    <button
                      type="submit"
                      disabled={isSyncing || isValidatingDrive}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded shadow transition disabled:opacity-50"
                    >
                      {isSyncing || isValidatingDrive ? 'Verifying...' : 'Save Folder Configurations'}
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showWelcomeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                <div className="flex items-center gap-2 text-blue-400">
                  <ShieldCheck className="w-5 h-5 animate-pulse" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-white">Select Workspace Mode</h3>
                </div>
                <button 
                  onClick={() => setShowWelcomeModal(false)}
                  className="text-slate-500 hover:text-slate-300 font-bold text-xs uppercase"
                >
                  Close
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 overflow-y-auto">
                <p className="text-[10px] leading-relaxed text-slate-400 uppercase font-black tracking-widest text-center">
                  Welcome to Interstitial-er. Choose how you want to load play records & configuration.
                </p>

                <div className="space-y-3.5">
                  {/* OPTION 1: DEMO MODE */}
                  <button
                    onClick={() => handleSelectMode('Demo')}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-start gap-4 hover:scale-[1.01] cursor-pointer",
                      locationMode === 'Demo'
                        ? "bg-amber-950/30 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                        : "bg-slate-950/40 border-slate-800 hover:border-amber-500/30 hover:bg-slate-950/70"
                    )}
                  >
                    <div className={cn(
                      "p-2.5 rounded-lg border shrink-0 mt-0.5",
                      locationMode === 'Demo'
                        ? "bg-amber-950/80 border-amber-500/30 text-amber-500"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    )}>
                      <Globe className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-white">Demo Mode</h4>
                      </div>
                      <p className="text-[10px] text-slate-300 mt-1.5 leading-relaxed">
                        Query file structures and metadata dynamically from Google Drive demonstration directories. Standard review flow.
                      </p>
                    </div>
                  </button>

                  {/* OPTION 2: GOOGLE DRIVE MODE */}
                  <button
                    onClick={() => handleSelectMode('Drive')}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-start gap-4 hover:scale-[1.01] cursor-pointer",
                      locationMode === 'Drive'
                        ? "bg-blue-950/20 border-blue-500/50 shadow-[0_0_12px_rgba(59,130,246,0.15)]"
                        : "bg-slate-950/40 border-slate-800 hover:border-blue-500/30 hover:bg-slate-950/70"
                    )}
                  >
                    <div className={cn(
                      "p-2.5 rounded-lg border shrink-0 mt-0.5",
                      locationMode === 'Drive'
                        ? "bg-blue-950/60 border-blue-500/30 text-blue-400"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    )}>
                      <Folder className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-white">Google Drive Mode</h4>
                      <p className="text-[10px] text-slate-300 mt-1.5 leading-relaxed">
                        Connect your personal Google Account to sync schedules, history metrics, and custom chimes from your custom folders across all devices.
                      </p>
                    </div>
                  </button>

                  {/* OPTION 3: LOCAL MODE */}
                  <button
                    onClick={() => handleSelectMode('Local')}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-start gap-4 hover:scale-[1.01] cursor-pointer",
                      locationMode === 'Local'
                        ? "bg-purple-950/20 border-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.15)]"
                        : "bg-slate-950/40 border-slate-800 hover:border-purple-500/30 hover:bg-slate-950/70"
                    )}
                  >
                    <div className={cn(
                      "p-2.5 rounded-lg border shrink-0 mt-0.5",
                      locationMode === 'Local'
                        ? "bg-purple-950/60 border-purple-500/30 text-purple-400"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    )}>
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-white">Local Desktop Mode</h4>
                      <p className="text-[10px] text-slate-300 mt-1.5 leading-relaxed">
                        Read and update files entirely inside absolute file system paths on your host computer. Recommended for standalone installations.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Footer selection actions */}
              <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/40 flex justify-between items-center text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                <span>Active: <b className="text-slate-300">{locationMode} Mode</b></span>
                <button
                  onClick={() => setShowWelcomeModal(false)}
                  className="px-4 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded border border-slate-750 transition cursor-pointer"
                >
                  Enter Workspace
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

