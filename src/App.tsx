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
  validateGoogleDriveAccess,
  setDriveFoldersConfig
} from './lib/driveService';

export default function App() {
  const [activeTab, setActiveTab] = useState<'player' | 'scheduler' | 'log'>('player');
  const [isAdmin, setIsAdmin] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [syncTime, setSyncTime] = useState(new Date());
  const [countdown, setCountdown] = useState(300);
  const [scrollTrigger, setScrollTrigger] = useState(0);

  // Prerecord States
  const [playMode, setPlayMode] = useState<'Live' | 'Prerecord'>('Live');
  const [prerecordDate, setPrerecordDate] = useState<Date | null>(null);
  const [showPrerecordModal, setShowPrerecordModal] = useState(false);
  const [prerecordDateInput, setPrerecordDateInput] = useState('');
  const [prerecordTimeInput, setPrerecordTimeInput] = useState('');
  const [prerecordError, setPrerecordError] = useState<string | null>(null);

  const isPre = playMode === 'Prerecord';

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

  // Storage Preferences
  const [preferences, setPreferences] = useState<{
    storageMode: 'local' | 'drive' | 'demo';
    localPaths: { schedules: string; mp3s: string; logs: string };
    driveFolders: { schedules: string; mp3s: string; logs: string };
  } | null>(null);

  const [isLocalValid, setIsLocalValid] = useState<boolean | null>(null);
  const [isLocalValidating, setIsLocalValidating] = useState(false);
  const [setupTab, setSetupTab] = useState<'local' | 'drive' | 'demo'>('local');

  // Fallback Directory Browser States
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [folderBrowserTarget, setFolderBrowserTarget] = useState<'schedules' | 'mp3s' | 'logs' | null>(null);
  const [browserCurrentPath, setBrowserCurrentPath] = useState('');
  const [browserParentPath, setBrowserParentPath] = useState('');
  const [browserDirectories, setBrowserDirectories] = useState<{ name: string; path: string }[]>([]);

  // Initialize preferences and authenticate
  useEffect(() => {
    const loadPrefsAndBoot = async () => {
      try {
        const response = await fetch('/api/preferences');
        if (!response.ok) throw new Error('Failed to load preferences');
        const prefs = await response.json();
        setPreferences(prefs);
        setSetupTab(prefs.storageMode);

        // Apply folder configurations dynamically to drive getter config
        if (prefs.storageMode === 'demo') {
          setDriveFoldersConfig({
            schedules: '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED',
            mp3s: '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch',
            logs: '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx'
          });
        } else if (prefs.storageMode === 'drive') {
          setDriveFoldersConfig({
            schedules: prefs.driveFolders.schedules || '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED',
            mp3s: prefs.driveFolders.mp3s || '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch',
            logs: prefs.driveFolders.logs || '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx'
          });
        }

        // Run validation instantly for local storage on launch
        if (prefs.storageMode === 'local') {
          const hasDefined = prefs.localPaths.schedules && prefs.localPaths.mp3s && prefs.localPaths.logs;
          if (hasDefined) {
            setIsLocalValidating(true);
            const valRes = await fetch('/api/local/validate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(prefs.localPaths)
            });
            const valData = await valRes.json();
            setIsLocalValid(valData.valid);
          } else {
            setIsLocalValid(false);
          }
        }
      } catch (err) {
        console.error('System loader preferences failed:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPrefsAndBoot();
  }, []);

  // Google Auth initialization with Validation
  useEffect(() => {
    const unsubscribe = initAuth(
      async (currentUser, tokenStr) => {
        setUser(currentUser);
        setToken(tokenStr);
        setIsDriveActive(true);
        setIsValidatingDrive(true);
        setDriveValidationError(null);
        try {
          const success = await validateGoogleDriveAccess();
          if (success) {
            setIsDriveValidated(true);
            setDriveValidationError(null);
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
      },
      () => {
        setUser(null);
        setToken(null);
        setIsDriveActive(false);
        setIsDriveValidated(false);
        setDriveMP3s([]);
      }
    );
    return () => unsubscribe();
  }, []);

  // Local Path Validations
  const validateLocalPaths = async (paths: { schedules: string; mp3s: string; logs: string }) => {
    setIsLocalValidating(true);
    try {
      const res = await fetch('/api/local/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paths)
      });
      const data = await res.json();
      setIsLocalValid(data.valid);
      return data.valid;
    } catch (e) {
      console.error('Local directories validation client failure:', e);
      setIsLocalValid(false);
      return false;
    } finally {
      setIsLocalValidating(false);
    }
  };

  // Directory traversal helpers
  const openFolderBrowser = async (target: 'schedules' | 'mp3s' | 'logs', initial?: string) => {
    setFolderBrowserTarget(target);
    const startPath = initial || '';
    try {
      const res = await fetch(`/api/local/list-directories?path=${encodeURIComponent(startPath)}`);
      if (res.ok) {
        const data = await res.json();
        setBrowserCurrentPath(data.currentPath);
        setBrowserParentPath(data.parentPath);
        setBrowserDirectories(data.directories);
        setShowFolderBrowser(true);
      }
    } catch (e) {
      console.error('Listing directories failed:', e);
    }
  };

  const navigateBrowser = async (pathStr: string) => {
    try {
      const res = await fetch(`/api/local/list-directories?path=${encodeURIComponent(pathStr)}`);
      if (res.ok) {
        const data = await res.json();
        setBrowserCurrentPath(data.currentPath);
        setBrowserParentPath(data.parentPath);
        setBrowserDirectories(data.directories);
      }
    } catch (e) {
      console.error('Failed navigating browser:', e);
    }
  };

  const selectBrowserFolder = (pathStr: string) => {
    if (!preferences || !folderBrowserTarget) return;
    const updated = {
      ...preferences,
      localPaths: {
        ...preferences.localPaths,
        [folderBrowserTarget]: pathStr
      }
    };
    setPreferences(updated);
    validateLocalPaths(updated.localPaths);
    setShowFolderBrowser(false);
    setFolderBrowserTarget(null);
  };

  const handleSelectLocalFolder = async (target: 'schedules' | 'mp3s' | 'logs') => {
    try {
      const res = await fetch('/api/local/select-directory', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.selectedPath) {
          const updated = {
            ...preferences!,
            localPaths: {
              ...preferences!.localPaths,
              [target]: data.selectedPath
            }
          };
          setPreferences(updated);
          validateLocalPaths(updated.localPaths);
        } else if (data.useFallback) {
          openFolderBrowser(target, preferences?.localPaths[target] || '');
        }
      }
    } catch (err) {
      console.error('Local folder pick initialization failed:', err);
    }
  };

  const bootstrapSandboxPaths = async () => {
    if (!preferences) return;
    const paths = {
      schedules: './data',
      mp3s: './mp3s',
      logs: './Scheduler Logs'
    };
    const valid = await validateLocalPaths(paths);
    const updated = {
      ...preferences,
      storageMode: 'local' as const,
      localPaths: paths
    };
    setPreferences(updated);
    if (valid) {
      savePreferences(updated);
    }
  };

  const savePreferences = async (updatedPrefs: typeof preferences) => {
    if (!updatedPrefs) return;
    try {
      const response = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPrefs)
      });
      if (response.ok) {
        const saved = await response.json();
        setPreferences(saved);

        if (saved.storageMode === 'demo') {
          setDriveFoldersConfig({
            schedules: '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED',
            mp3s: '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch',
            logs: '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx'
          });
        } else if (saved.storageMode === 'drive') {
          setDriveFoldersConfig({
            schedules: saved.driveFolders.schedules || '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED',
            mp3s: saved.driveFolders.mp3s || '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch',
            logs: saved.driveFolders.logs || '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx'
          });
        }

        if (saved.storageMode === 'local') {
          const valid = await validateLocalPaths(saved.localPaths);
          if (valid) {
            setIsLocalValid(true);
          } else {
            setIsLocalValid(false);
          }
        } else {
          setIsLocalValid(null);
        }

        fetchData();
      }
    } catch (e) {
      console.error('Failed to preserve system configurations:', e);
    }
  };

  const fetchData = async () => {
    if (!preferences) {
      console.warn('Skipping fetch: Preferences not retrieved yet.');
      return;
    }

    setIsSyncing(true);
    try {
      if (preferences.storageMode === 'local') {
        const [schRes, logRes, mp3sRes] = await Promise.all([
          fetch('/api/schedules'),
          fetch('/api/logs'),
          fetch('/api/local/mp3s')
        ]);
        const localSchedules = await schRes.json();
        const localLogs = await logRes.json();
        const localMp3s = await mp3sRes.json();

        setSchedules(localSchedules);
        setLogs(localLogs);
        setDriveMP3s(localMp3s);
        setSyncTime(new Date());
        setScrollTrigger(prev => prev + 1);
      } else {
        const currentToken = getAccessToken() || token;
        if (!currentToken || !isDriveActive) {
          console.warn('Skipping fetch: Not authenticated or active on cloud sync.');
          return;
        }

        console.log('Fetching configurations from Google Drive shared folders...');
        const [driveSchedules, driveLogsStr, mp3Files] = await Promise.all([
          loadSchedulesFromDrive(),
          loadLogsFromDrive(),
          listMP3sFromDrive()
        ]);

        setSchedules(driveSchedules);
        setLogs(driveLogsStr);
        setDriveMP3s(mp3Files);
        setSyncTime(new Date());
        setScrollTrigger(prev => prev + 1);
      }
    } catch (error) {
      console.error('Failed to fetch schedules/logs:', error);
    } finally {
      setIsSyncing(false);
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchData();
    setCountdown(300);
  };

  useEffect(() => {
    if (isDriveValidated || (preferences?.storageMode === 'local' && isLocalValid)) {
      fetchData();
    }
  }, [token, isDriveValidated, preferences?.storageMode, isLocalValid]);

  // Sync Timer Logic
  useEffect(() => {
    const timer = setInterval(() => {
      const current = new Date();
      setNow(current);
      if (playMode === 'Live') {
        setCountdown(prev => {
          if (prev <= 1) {
            if (isDriveValidated || (preferences?.storageMode === 'local' && isLocalValid)) {
              fetchData();
            }
            return 300;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [token, isDriveValidated, playMode, preferences?.storageMode, isLocalValid]);

  // Background Cache Synchronization Logic (Pre-loading Audio into memory)
  useEffect(() => {
    const syncCache = async () => {
      if (preferences?.storageMode === 'local') {
        return;
      }
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
  }, [schedules, token, preferences?.storageMode]);

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const saveSchedules = async (newSchedules: Schedule[]) => {
    try {
      if (preferences?.storageMode === 'local') {
        const res = await fetch('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSchedules)
        });
        if (!res.ok) throw new Error('Local schedules save failed');
        setSchedules(newSchedules);
      } else {
        const currentToken = getAccessToken() || token;
        if (!currentToken) {
          throw new Error('Not connected to Google Drive. Saving is disabled.');
        }
        await saveSchedulesToDrive(newSchedules);
        setSchedules(newSchedules);
      }
    } catch (error) {
      console.error('Failed to save schedules:', error);
    }
  };

  const addLog = async (entry: LogEntry) => {
    const enrichedEntry: LogEntry = {
      ...entry,
      playMode: playMode,
      logTimeStamp: new Date().toISOString(),
      timestamp: playMode === 'Prerecord' 
        ? (entry.scheduledTime || entry.timestamp) 
        : new Date().toISOString()
    };

    try {
      if (preferences?.storageMode === 'local') {
        const res = await fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enrichedEntry)
        });
        if (!res.ok) throw new Error('Local logging failed');
        const updatedLogsRes = await fetch('/api/logs');
        const updatedLogs = await updatedLogsRes.json();
        setLogs(updatedLogs);
      } else {
        const currentToken = getAccessToken() || token;
        if (!currentToken) {
          throw new Error('Not connected to Google Drive. Saving logs is disabled.');
        }
        const updatedLogs = await appendLogToDrive(enrichedEntry);
        setLogs(updatedLogs);
      }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <RefreshCw className={cn("w-8 h-8 animate-spin", isPre ? "text-purple-600" : "text-blue-500")} />
      </div>
    );
  }

  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-between text-slate-100 p-6 selection:bg-blue-500/30 selection:text-blue-200">
        <div className="flex-1 flex flex-col items-center justify-center max-w-lg w-full mx-auto py-8">
          {/* Logo and Icon Header */}
          <div className="flex flex-col items-center text-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-4 ring-blue-500/10">
              <Clock className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-widest text-white">Interstitial-er</h1>
            </div>
          </div>

          <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 text-left">
            <div className="space-y-1">
              <h2 className="text-xs font-black uppercase text-slate-200 tracking-wider flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-blue-400" />
                Select Storage Location Environment
              </h2>
              <p className="text-[10px] leading-relaxed text-slate-400">
                Configure whether this client player reads schedules and chimes from offline local computer folders, your personalized cloud Google Drive, or read-only demo folders.
              </p>
            </div>

            {/* TAB SELECTORS */}
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/80">
              <button
                type="button"
                onClick={() => setSetupTab('local')}
                className={cn(
                  "py-2 text-[10px] uppercase font-black tracking-wider rounded-lg transition-all cursor-pointer",
                  setupTab === 'local' 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/15" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                Local Folders
              </button>
              <button
                type="button"
                onClick={() => setSetupTab('drive')}
                className={cn(
                  "py-2 text-[10px] uppercase font-black tracking-wider rounded-lg transition-all cursor-pointer",
                  setupTab === 'drive' 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/15" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                Custom Drive
              </button>
              <button
                type="button"
                onClick={() => setSetupTab('demo')}
                className={cn(
                  "py-2 text-[10px] uppercase font-black tracking-wider rounded-lg transition-all cursor-pointer",
                  setupTab === 'demo' 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/15" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                Demo Cloud
              </button>
            </div>

            {/* TAB CONTENT */}
            {setupTab === 'local' && (
              <div className="space-y-4">
                <p className="text-[11px] leading-relaxed text-slate-450">
                  Select paths on your physical machine. Paths can be relative to the workspace or absolute directory locations on disk.
                </p>

                <div className="space-y-3 bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                  <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Local Folder Alignments</p>
                  
                  {/* Schedules */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide flex justify-between">
                      <span>Schedules Folder (schedules.json)</span>
                      {preferences?.localPaths.schedules && isLocalValid && <span className="text-emerald-400">● Valid</span>}
                    </label>
                    <div className="flex gap-1.5">
                      <input 
                        type="text" 
                        value={preferences?.localPaths.schedules || ''} 
                        onChange={(e) => {
                          if (!preferences) return;
                          const next = { ...preferences, localPaths: { ...preferences.localPaths, schedules: e.target.value } };
                          setPreferences(next);
                          validateLocalPaths(next.localPaths);
                        }}
                        placeholder="e.g. ./data" 
                        className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleSelectLocalFolder('schedules')}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase text-slate-300 rounded border border-slate-750 cursor-pointer"
                      >
                        Browse
                      </button>
                    </div>
                  </div>

                  {/* MP3s */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide flex justify-between">
                      <span>MP3 Chimes Directory</span>
                      {preferences?.localPaths.mp3s && isLocalValid && <span className="text-emerald-400">● Valid</span>}
                    </label>
                    <div className="flex gap-1.5">
                      <input 
                        type="text" 
                        value={preferences?.localPaths.mp3s || ''} 
                        onChange={(e) => {
                          if (!preferences) return;
                          const next = { ...preferences, localPaths: { ...preferences.localPaths, mp3s: e.target.value } };
                          setPreferences(next);
                          validateLocalPaths(next.localPaths);
                        }}
                        placeholder="e.g. ./mp3s" 
                        className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleSelectLocalFolder('mp3s')}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase text-slate-300 rounded border border-slate-750 cursor-pointer"
                      >
                        Browse
                      </button>
                    </div>
                  </div>

                  {/* Logs */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide flex justify-between">
                      <span>Scheduler Activity Logs Folder</span>
                      {preferences?.localPaths.logs && isLocalValid && <span className="text-emerald-400">● Valid</span>}
                    </label>
                    <div className="flex gap-1.5">
                      <input 
                        type="text" 
                        value={preferences?.localPaths.logs || ''} 
                        onChange={(e) => {
                          if (!preferences) return;
                          const next = { ...preferences, localPaths: { ...preferences.localPaths, logs: e.target.value } };
                          setPreferences(next);
                          validateLocalPaths(next.localPaths);
                        }}
                        placeholder="e.g. ./Scheduler Logs" 
                        className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleSelectLocalFolder('logs')}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase text-slate-300 rounded border border-slate-750 cursor-pointer"
                      >
                        Browse
                      </button>
                    </div>
                  </div>
                </div>

                {isLocalValid === false && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs space-y-1">
                    <p className="font-bold flex items-center gap-1 text-[11px]">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                      Local files are not available.
                    </p>
                    <p className="text-[10px]">
                      Paths must exist and be writable. Verify directories, click Bootstrap Defaults or pick an alternative mode.
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={bootstrapSandboxPaths}
                    className="flex-1 py-2 px-3 bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer"
                  >
                    Bootstrap Defaults
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!preferences) return;
                      savePreferences({ ...preferences, storageMode: 'local' });
                    }}
                    disabled={isLocalValid !== true}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-lg font-black text-[10px] uppercase tracking-wider text-white select-none",
                      isLocalValid === true 
                        ? "bg-blue-600 hover:bg-blue-700 cursor-pointer shadow-md" 
                        : "bg-slate-800 text-slate-500 cursor-not-allowed opacity-60"
                    )}
                  >
                    Launch Local Player
                  </button>
                </div>
              </div>
            )}

            {setupTab === 'drive' && (
              <div className="space-y-4">
                <p className="text-[11px] leading-relaxed text-slate-450">
                  Sync automatically with shared Google Drive resource. Ensure folder IDs permit read/write properties.
                </p>

                <div className="space-y-3 bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                  <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest">Custom Google Drive Key Mapping</p>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide">Schedules Folder ID</label>
                    <input 
                      type="text" 
                      value={preferences?.driveFolders.schedules || ''} 
                      onChange={(e) => {
                        if (!preferences) return;
                        setPreferences({ ...preferences, driveFolders: { ...preferences.driveFolders, schedules: e.target.value } });
                      }}
                      placeholder="Folder ID string" 
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide">MP3 Library Folder ID</label>
                    <input 
                      type="text" 
                      value={preferences?.driveFolders.mp3s || ''} 
                      onChange={(e) => {
                        if (!preferences) return;
                        setPreferences({ ...preferences, driveFolders: { ...preferences.driveFolders, mp3s: e.target.value } });
                      }}
                      placeholder="Folder ID string" 
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide">Logs Folder ID</label>
                    <input 
                      type="text" 
                      value={preferences?.driveFolders.logs || ''} 
                      onChange={(e) => {
                        if (!preferences) return;
                        setPreferences({ ...preferences, driveFolders: { ...preferences.driveFolders, logs: e.target.value } });
                      }}
                      placeholder="Folder ID string" 
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {driveValidationError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-[10px] space-y-1">
                    <p className="font-bold uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Invalid Drive Resources
                    </p>
                    <p>{driveValidationError}</p>
                  </div>
                )}

                {isValidatingDrive && (
                  <div className="bg-blue-500/5 border border-blue-500/25 rounded-lg p-3 text-[10px] flex items-center justify-center gap-2 text-blue-300">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    Checking drive folders write/read access...
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  {!user ? (
                    <button 
                      onClick={handleAuthSignIn}
                      className="w-full h-10 bg-white text-slate-800 hover:bg-slate-100 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-3 cursor-pointer border border-slate-200 shadow"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      </svg>
                      Connect Google Drive
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[10px] bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                        <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate font-mono font-semibold text-slate-300">{user?.email}</span>
                        <span className="ml-auto text-[8px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-black uppercase shrink-0 border border-emerald-500/10">Connected</span>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!preferences) return;
                            savePreferences({ ...preferences, storageMode: 'drive' });
                          }}
                          className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer font-bold"
                        >
                          Launch Player
                        </button>
                        <button
                          type="button"
                          onClick={handleAuthSignOut}
                          className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer font-bold"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {setupTab === 'demo' && (
              <div className="space-y-4">
                <p className="text-[11px] leading-relaxed text-slate-450">
                  Load pre-configured default folders representing physical cloud demo directories. Great for immediate testing.
                </p>

                <div className="space-y-2 bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                  <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest leading-none mb-1">Demo Mode folder references</p>
                  
                  <div className="flex items-center gap-2 text-[10px] bg-slate-900/40 px-3 py-1.5 rounded border border-slate-800">
                    <Folder className="w-3 h-3 text-slate-500 shrink-0" />
                    <div>
                      <p className="font-bold text-slate-300 leading-none">Schedules Folder</p>
                      <p className="text-[8px] font-mono text-slate-500 mt-1 uppercase">Demo mode schedules</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] bg-slate-900/40 px-3 py-1.5 rounded border border-slate-800">
                    <Folder className="w-3 h-3 text-slate-500 shrink-0" />
                    <div>
                      <p className="font-bold text-slate-300 leading-none">MP3 Chimes Folder</p>
                      <p className="text-[8px] font-mono text-slate-500 mt-1 uppercase">Demo mode mp3s</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] bg-slate-900/40 px-3 py-1.5 rounded border border-slate-800">
                    <Folder className="w-3 h-3 text-slate-500 shrink-0" />
                    <div>
                      <p className="font-bold text-slate-300 leading-none">Activity Logger Folder</p>
                      <p className="text-[8px] font-mono text-slate-500 mt-1 uppercase">Demo mode logs</p>
                    </div>
                  </div>
                </div>

                {!user ? (
                  <button 
                    onClick={handleAuthSignIn}
                    className="w-full h-10 bg-white text-slate-800 hover:bg-slate-100 rounded-lg font-black text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-3 cursor-pointer border border-slate-200 shadow"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                    Connect Google Account
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                      <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="truncate font-mono font-semibold text-slate-300">{user?.email}</span>
                      <span className="ml-auto text-[8px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-black uppercase shrink-0 border border-emerald-500/10">Ready</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (!preferences) return;
                        savePreferences({ ...preferences, storageMode: 'demo' });
                      }}
                      className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-md cursor-pointer font-bold"
                    >
                      Launch Demo Player
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-md w-full mx-auto text-center border-t border-slate-900 pt-3.5 text-[8.5px] text-slate-600 font-bold uppercase tracking-widest">
          * Interstitial-er
        </div>
        {renderFolderBrowserModal()}
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
            <span className="font-bold text-xs tracking-tight">Interstitial-er</span>
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
              <span className="text-[10px] font-bold uppercase tracking-tighter">Player</span>
            </button>
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
              <span className="text-[10px] font-bold uppercase tracking-tighter">Scheduler</span>
            </button>
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
              <span className="text-[10px] font-bold uppercase tracking-tighter">Log</span>
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
              <p className="text-[9px] uppercase text-slate-400 font-black tracking-tighter">Current Time</p>
              <p className="text-sm font-mono font-black text-slate-900 tabular-nums leading-none">{format(now, 'HH:mm:ss')}</p>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            {isPre ? (
              <span className="text-[8px] bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-black uppercase leading-none tracking-wider whitespace-nowrap">
                AUTO-REFRESH PAUSED
              </span>
            ) : (
              <p className="text-[8px] uppercase text-blue-600 font-black tracking-tight leading-none whitespace-nowrap">{formatCountdown(countdown)} UNTIL AUTO-REFRESH</p>
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
              <span className="text-[9px] font-black uppercase tracking-tighter">Refresh now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-[#F8FAFC] pb-2">
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
      <footer className="bg-slate-900 px-4 py-2 shrink-0 border-t border-slate-800">
        <div className="max-w-[400px] mx-auto flex justify-center items-center gap-3">
          <button
            onClick={() => setShowLocationsModal(true)}
            className="flex items-center gap-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-all cursor-pointer shadow-sm text-[9px] font-black uppercase tracking-widest"
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Default Locations</span>
          </button>

          <button
            onClick={handleToggleMode}
            className={cn(
              "flex items-center gap-2 px-3 py-1 text-white rounded transition-all cursor-pointer shadow-sm text-[9px] font-black uppercase tracking-widest border",
              isPre 
                ? "bg-purple-600 hover:bg-purple-700 border-purple-500 shadow-purple-500/20" 
                : "bg-blue-600 hover:bg-blue-700 border-blue-500 shadow-blue-500/20"
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{isPre ? "Reactivate Live mode" : "Activate Prerecord mode"}</span>
          </button>
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
                    Configure the start time and date for the prerecord sequence. In Prerecord mode, auto-refresh and actual clocks are paused, allowing you to sequence and preview scheduled plays starting from your designated target timestamp.
                  </p>

                  <div className="space-y-3">
                    {/* Date picker */}
                    <div>
                      <label className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1">Prerecord Date</label>
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
                  <Settings className="w-5 h-5 animate-[spin_8s_linear_infinite]" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-white">Storage Location Configuration</h3>
                </div>
                <button 
                  onClick={() => setShowLocationsModal(false)}
                  className="text-slate-500 hover:text-slate-300 font-bold text-xs uppercase cursor-pointer"
                >
                  Close
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar text-left font-sans">
                
                {/* TAB SELECTORS */}
                <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setSetupTab('local')}
                    className={cn(
                      "py-2 text-[9px] uppercase font-black tracking-wider rounded-lg transition-all cursor-pointer",
                      setupTab === 'local' 
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" 
                        : "text-slate-455 text-slate-400 hover:text-slate-205 hover:text-slate-205 hover:text-slate-200"
                    )}
                  >
                    Local Folders
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetupTab('drive')}
                    className={cn(
                      "py-2 text-[9px] uppercase font-black tracking-wider rounded-lg transition-all cursor-pointer",
                      setupTab === 'drive' 
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" 
                        : "text-slate-455 text-slate-400 hover:text-slate-205 hover:text-slate-205 hover:text-slate-200"
                    )}
                  >
                    Custom Drive
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetupTab('demo')}
                    className={cn(
                      "py-2 text-[9px] uppercase font-black tracking-wider rounded-lg transition-all cursor-pointer",
                      setupTab === 'demo' 
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" 
                        : "text-slate-455 text-slate-400 hover:text-slate-205 hover:text-slate-205 hover:text-slate-200"
                    )}
                  >
                    Demo Cloud
                  </button>
                </div>

                {/* TAB CONTENT */}
                {setupTab === 'local' && (
                  <div className="space-y-4">
                    <p className="text-[10px] leading-relaxed text-slate-400">
                      Configure local folders relative to workspace or absolute on disk.
                    </p>

                    <div className="space-y-3 bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide flex justify-between">
                          <span>Schedules Folder</span>
                          {preferences?.localPaths.schedules && isLocalValid && <span className="text-emerald-400">● Valid</span>}
                        </label>
                        <div className="flex gap-1.5">
                          <input 
                            type="text" 
                            value={preferences?.localPaths.schedules || ''} 
                            onChange={(e) => {
                              if (!preferences) return;
                              const next = { ...preferences, localPaths: { ...preferences.localPaths, schedules: e.target.value } };
                              setPreferences(next);
                              validateLocalPaths(next.localPaths);
                            }}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleSelectLocalFolder('schedules')}
                            className="px-2 py-1 bg-slate-850 hover:bg-slate-800 text-[9px] font-black uppercase text-slate-350 rounded cursor-pointer"
                          >
                            Browse
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide flex justify-between">
                          <span>MP3 Chime Folder</span>
                          {preferences?.localPaths.mp3s && isLocalValid && <span className="text-emerald-400">● Valid</span>}
                        </label>
                        <div className="flex gap-1.5">
                          <input 
                            type="text" 
                            value={preferences?.localPaths.mp3s || ''} 
                            onChange={(e) => {
                              if (!preferences) return;
                              const next = { ...preferences, localPaths: { ...preferences.localPaths, mp3s: e.target.value } };
                              setPreferences(next);
                              validateLocalPaths(next.localPaths);
                            }}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleSelectLocalFolder('mp3s')}
                            className="px-2 py-1 bg-slate-850 hover:bg-slate-800 text-[9px] font-black uppercase text-slate-350 rounded cursor-pointer"
                          >
                            Browse
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide flex justify-between">
                          <span>Scheduler logs Folder</span>
                          {preferences?.localPaths.logs && isLocalValid && <span className="text-emerald-400">● Valid</span>}
                        </label>
                        <div className="flex gap-1.5">
                          <input 
                            type="text" 
                            value={preferences?.localPaths.logs || ''} 
                            onChange={(e) => {
                              if (!preferences) return;
                              const next = { ...preferences, localPaths: { ...preferences.localPaths, logs: e.target.value } };
                              setPreferences(next);
                              validateLocalPaths(next.localPaths);
                            }}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleSelectLocalFolder('logs')}
                            className="px-2 py-1 bg-slate-850 hover:bg-slate-800 text-[9px] font-black uppercase text-slate-355 text-slate-300 rounded cursor-pointer"
                          >
                            Browse
                          </button>
                        </div>
                      </div>
                    </div>

                    {isLocalValid === false && (
                      <p className="text-[10px] text-red-500 font-black">
                        ⚠️ Local path validation failed. Check folders or click Bootstrap to reset.
                      </p>
                    )}

                    <div className="flex gap-2 text-center pt-1.5">
                      <button
                        type="button"
                        onClick={bootstrapSandboxPaths}
                        className="flex-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded text-[9px] font-black uppercase cursor-pointer"
                      >
                        Bootstrap Defaults
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!preferences) return;
                          await savePreferences({ ...preferences, storageMode: 'local' });
                          setShowLocationsModal(false);
                        }}
                        disabled={isLocalValid !== true}
                        className={cn(
                          "flex-1 py-1.5 px-3 rounded text-[9px] font-black uppercase text-white select-none",
                          isLocalValid === true ? "bg-blue-600 hover:bg-blue-700 cursor-pointer" : "bg-slate-850 text-slate-600 cursor-not-allowed"
                        )}
                      >
                        Activate Local
                      </button>
                    </div>
                  </div>
                )}

                {setupTab === 'drive' && (
                  <div className="space-y-4">
                    <p className="text-[10px] leading-relaxed text-slate-400">
                      Define target cloud storage folders. Ensure full write/read access properties are enabled.
                    </p>

                    <div className="space-y-3 bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide">Schedules Folder ID</label>
                        <input 
                          type="text" 
                          value={preferences?.driveFolders.schedules || ''} 
                          onChange={(e) => {
                            if (!preferences) return;
                            setPreferences({ ...preferences, driveFolders: { ...preferences.driveFolders, schedules: e.target.value } });
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide">MP3 Library Folder ID</label>
                        <input 
                          type="text" 
                          value={preferences?.driveFolders.mp3s || ''} 
                          onChange={(e) => {
                            if (!preferences) return;
                            setPreferences({ ...preferences, driveFolders: { ...preferences.driveFolders, mp3s: e.target.value } });
                          }}
                          className="w-full bg-slate-950 border border-slate-805 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wide">Logs Folder ID</label>
                        <input 
                          type="text" 
                          value={preferences?.driveFolders.logs || ''} 
                          onChange={(e) => {
                            if (!preferences) return;
                            setPreferences({ ...preferences, driveFolders: { ...preferences.driveFolders, logs: e.target.value } });
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {!user ? (
                      <button 
                        onClick={handleAuthSignIn}
                        className="w-full py-2 px-3 bg-white text-slate-800 rounded font-black text-[10px] uppercase tracking-wider cursor-pointer"
                      >
                        Connect Google Drive
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[9px] bg-slate-950 p-2 rounded">
                          <Mail className="w-3 h-3 text-blue-400" />
                          <span className="truncate font-mono font-semibold text-slate-300">{user?.email}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!preferences) return;
                              await savePreferences({ ...preferences, storageMode: 'drive' });
                              setShowLocationsModal(false);
                            }}
                            className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-black uppercase tracking-wider cursor-pointer font-bold"
                          >
                            Activate Drive
                          </button>
                          <button
                            type="button"
                            onClick={handleAuthSignOut}
                            className="py-1.5 px-3 bg-slate-800 hover:bg-slate-705 text-slate-300 rounded text-[9px] font-black uppercase cursor-pointer"
                          >
                            Sign Out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {setupTab === 'demo' && (
                  <div className="space-y-4">
                    <p className="text-[10px] leading-relaxed text-slate-400">
                      Pre-loaded default drives that drive sandboxed operations.
                    </p>

                    <div className="space-y-2 bg-slate-950/45 p-4 rounded-xl border border-slate-850">
                      <div className="flex items-center gap-2 text-[9px] bg-slate-900/40 px-3 py-1.5 rounded border border-slate-800">
                        <Folder className="w-3 h-3 text-slate-500" />
                        <div>
                          <p className="font-bold text-slate-200 leading-none">Schedules Folder</p>
                          <p className="text-[8px] font-medium text-slate-500 mt-1 uppercase">Demo mode schedules</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[9px] bg-slate-900/40 px-3 py-1.5 rounded border border-slate-800">
                        <Folder className="w-3 h-3 text-slate-500" />
                        <div>
                          <p className="font-bold text-slate-200 leading-none">MP3 Chimes Folder</p>
                          <p className="text-[8px] font-medium text-slate-500 mt-1 uppercase">Demo mode mp3s</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[9px] bg-slate-900/40 px-3 py-1.5 rounded border border-slate-800">
                        <Folder className="w-3 h-3 text-slate-500" />
                        <div>
                          <p className="font-bold text-slate-200 leading-none">Activity Logger Folder</p>
                          <p className="text-[8px] font-medium text-slate-500 mt-1 uppercase">Demo mode logs</p>
                        </div>
                      </div>
                    </div>

                    {!user ? (
                      <button 
                        onClick={handleAuthSignIn}
                        className="w-full py-2 px-3 bg-white text-slate-805 rounded font-black text-[10px] uppercase cursor-pointer"
                      >
                        Connect Google Account
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[9px] bg-slate-950 p-2 rounded">
                          <Mail className="w-3 h-3 text-blue-400" />
                          <span className="truncate font-mono text-slate-300">{user?.email}</span>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!preferences) return;
                            await savePreferences({ ...preferences, storageMode: 'demo' });
                            setShowLocationsModal(false);
                          }}
                          className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-black uppercase cursor-pointer"
                        >
                          Activate Demo Mode
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

