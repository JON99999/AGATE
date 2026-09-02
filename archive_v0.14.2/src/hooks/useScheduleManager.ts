import React, { useState, useRef, useCallback, Dispatch, SetStateAction } from 'react';
import { Interstitial, Show, LogEntry } from '../types';
import { normalizeInterstitials, isTimeInShow, getActualShowStart } from '../lib/utils';
import {
  getSavedSettings,
  getAccessToken,
  loadShowsFromDrive,
  saveShowsToDrive,
  saveCalendarToDrive,
  appendLogToDrive,
} from '../lib/driveService';
import { SaveRecoveryInfo } from '../components/SaveRecoveryModal';

export interface UseScheduleManagerProps {
  token?: string | null;
  now: Date;
  playMode: 'Live' | 'Prerecord' | 'Export' | 'Playlist';
  selectedPrerecordShowId?: string;
  selectedPlaylistShow?: Show | null;
  onShowLocationsModal?: () => void;
}

export interface UseScheduleManagerResult {
  interstitials: Interstitial[];
  setInterstitials: Dispatch<SetStateAction<Interstitial[]>>;
  shows: Show[];
  setShows: Dispatch<SetStateAction<Show[]>>;
  logs: LogEntry[];
  setLogs: Dispatch<SetStateAction<LogEntry[]>>;
  isSaving: boolean;
  savingLabel: string | null;
  saveRecoveryModal: SaveRecoveryInfo | null;
  setSaveRecoveryModal: Dispatch<SetStateAction<SaveRecoveryInfo | null>>;
  loadShows: () => Promise<void>;
  saveShows: (newShows: Show[]) => Promise<boolean>;
  saveInterstitials: (newInterstitials: Interstitial[]) => Promise<boolean>;
  addLog: (entry: LogEntry) => Promise<void>;
}

export function useScheduleManager({
  token,
  now,
  playMode,
  selectedPrerecordShowId,
  selectedPlaylistShow,
  onShowLocationsModal,
}: UseScheduleManagerProps): UseScheduleManagerResult {
  const [interstitials, setInterstitials] = useState<Interstitial[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savingLabel, setSavingLabel] = useState<string | null>(null);
  const [saveRecoveryModal, setSaveRecoveryModal] = useState<SaveRecoveryInfo | null>(null);

  const showsRef = useRef(shows);
  showsRef.current = shows;

  const playModeRef = useRef(playMode);
  playModeRef.current = playMode;

  const selectedPrerecordShowIdRef = useRef(selectedPrerecordShowId);
  selectedPrerecordShowIdRef.current = selectedPrerecordShowId;

  const selectedPlaylistShowRef = useRef(selectedPlaylistShow);
  selectedPlaylistShowRef.current = selectedPlaylistShow;

  const loadShows = useCallback(async () => {
    const settings = getSavedSettings();
    if (settings.mode === 'Drive') {
      try {
        const currentToken = getAccessToken() || token;
        if (!currentToken) {
          throw new Error('Not connected to Google Drive.');
        }
        const driveShows = await loadShowsFromDrive();
        setShows(driveShows || []);
      } catch (e) {
        console.error('Failed to load shows from Drive:', e);
      }
      return;
    }

    try {
      const res = await fetch('/api/shows');
      if (res.ok) {
        const data = await res.json();
        setShows(data || []);
      }
    } catch (e) {
      console.error('Failed to load shows:', e);
    }
  }, [token]);

  const saveShows = useCallback(async (newShows: Show[]): Promise<boolean> => {
    const settings = getSavedSettings();
    setIsSaving(true);
    setSavingLabel('Saving shows profile...');

    if (settings.mode === 'Drive') {
      try {
        const currentToken = getAccessToken() || token;
        if (!currentToken) {
          throw new Error('Not connected to Google Drive. Saving is disabled.');
        }
        await saveShowsToDrive(newShows);
        setShows(newShows);
        setIsSaving(false);
        setSavingLabel(null);
        return true;
      } catch (error: any) {
        setIsSaving(false);
        setSavingLabel(null);
        console.error('Failed to save shows to Drive:', error);
        setSaveRecoveryModal({
          title: 'Failed to Save Shows to Google Drive',
          targetName: 'shows.json',
          filePath: settings.driveFolderPreferences || 'Google Drive Preferences Folder',
          error: error.message || 'Drive upload error',
          retryAction: async () => {
            await saveShows(newShows);
          },
          onFixFolder: () => {
            if (onShowLocationsModal) onShowLocationsModal();
          }
        });
        return false;
      }
    }

    try {
      const res = await fetch('/api/shows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newShows),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `Failed to write shows (Status ${res.status})`);
      }
      setShows(newShows);
      setIsSaving(false);
      setSavingLabel(null);
      return true;
    } catch (error: any) {
      setIsSaving(false);
      setSavingLabel(null);
      console.error('Failed to save shows:', error);
      setSaveRecoveryModal({
        title: 'Failed to Save Shows File',
        targetName: 'shows.json',
        filePath: settings.localPathCalendar || 'Local Shows Storage',
        error: error.message || 'Filesystem write error',
        retryAction: async () => {
          await saveShows(newShows);
        },
        onFixFolder: () => {
          if (onShowLocationsModal) onShowLocationsModal();
        }
      });
      return false;
    }
  }, [token, onShowLocationsModal]);

  const saveInterstitials = useCallback(async (newInterstitials: Interstitial[]): Promise<boolean> => {
    const normalized = normalizeInterstitials(newInterstitials);
    const settings = getSavedSettings();
    setIsSaving(true);
    setSavingLabel('Saving interstitials schedule...');

    if (settings.mode === 'Local') {
      try {
        const res = await fetch('/api/interstitials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || `Failed to write interstitials (Status ${res.status})`);
        }
        setInterstitials(normalized);
        setIsSaving(false);
        setSavingLabel(null);
        return true;
      } catch (error: any) {
        setIsSaving(false);
        setSavingLabel(null);
        console.error('Failed to save interstitials locally:', error);
        setSaveRecoveryModal({
          title: 'Failed to Save Interstitials Schedule',
          targetName: 'interstitials.json',
          filePath: settings.localPathCalendar || 'Local Interstitials Storage',
          error: error.message || 'Filesystem write error',
          retryAction: async () => {
            await saveInterstitials(newInterstitials);
          },
          onFixFolder: () => {
            if (onShowLocationsModal) onShowLocationsModal();
          }
        });
        return false;
      }
    }

    try {
      const currentToken = getAccessToken() || token;
      if (!currentToken) {
        throw new Error('Not connected to Google Drive. Saving is disabled.');
      }
      await saveCalendarToDrive(normalized);
      setInterstitials(normalized);
      setIsSaving(false);
      setSavingLabel(null);
      return true;
    } catch (error: any) {
      setIsSaving(false);
      setSavingLabel(null);
      console.error('Failed to save interstitials:', error);
      setSaveRecoveryModal({
        title: 'Failed to Save Interstitials to Google Drive',
        targetName: 'interstitials.json',
        filePath: settings.driveFolderPreferences || 'Google Drive Preferences Folder',
        error: error.message || 'Drive upload error',
        retryAction: async () => {
          await saveInterstitials(newInterstitials);
        },
        onFixFolder: () => {
          if (onShowLocationsModal) onShowLocationsModal();
        }
      });
      return false;
    }
  }, [token, onShowLocationsModal]);

  const addLog = useCallback(async (entry: LogEntry) => {
    const settings = getSavedSettings();

    let showId = entry.showId;
    let showName = entry.showName;
    let hostName = entry.hostName;
    let showDateTime = entry.showDateTime;

    const targetTime = entry.interstitialTime ? new Date(entry.interstitialTime) : new Date(entry.timestamp || now);

    const currentShows = showsRef.current || [];
    const currentPlayMode = playModeRef.current;
    const currentPrerecordShowId = selectedPrerecordShowIdRef.current;
    const currentPlaylistShow = selectedPlaylistShowRef.current;

    if (!showName) {
      if (currentPlayMode === 'Prerecord' && currentPrerecordShowId && currentShows.length > 0) {
        const pShow = currentShows.find((s) => s.id === currentPrerecordShowId);
        if (pShow) {
          showId = pShow.id;
          showName = pShow.name;
          hostName = pShow.host;
          showDateTime = getActualShowStart(pShow, targetTime).toISOString();
        }
      } else if (currentPlayMode === 'Playlist' && currentPlaylistShow) {
        showId = currentPlaylistShow.id;
        showName = currentPlaylistShow.name;
        hostName = currentPlaylistShow.host;
        showDateTime = getActualShowStart(currentPlaylistShow, targetTime).toISOString();
      }
    }

    if (!showName && currentShows.length > 0) {
      const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      const dayName = daysOrder[targetTime.getDay()];
      const hour = targetTime.getHours();
      const minute = targetTime.getMinutes();

      const activeShow = currentShows.find((s) => isTimeInShow(s, dayName, hour, minute));
      if (activeShow) {
        showId = activeShow.id;
        showName = activeShow.name;
        hostName = activeShow.host;
        showDateTime = getActualShowStart(activeShow, targetTime).toISOString();
      }
    }

    if (showName && !hostName && currentShows.length > 0) {
      const matchedShow = currentShows.find(s => s.id === showId || s.name.toLowerCase() === showName.toLowerCase());
      if (matchedShow && matchedShow.host) {
        hostName = matchedShow.host;
      }
    }

    const resolvedAssetType = entry.assetType || (entry.status === 'backup play' ? 'audio' : (
      (entry.mp3Name && (entry.mp3Name.endsWith('.txt') || entry.mp3Name.endsWith('.pdf') || entry.mp3Name.endsWith('.png') || entry.mp3Name.endsWith('.jpg') || entry.mp3Name.endsWith('.jpeg'))) ? 'script' : 'audio'
    ));

    const enrichedEntry: LogEntry = {
      ...entry,
      showId,
      showName,
      hostName,
      showDateTime,
      playMode: entry.playMode === "Export" ? "Export" : (entry.playMode || currentPlayMode),
      logTimeStamp: entry.logTimeStamp || new Date().toISOString(),
      timestamp: entry.interstitialTime || entry.timestamp || new Date().toISOString(),
      assetType: resolvedAssetType,
    };

    if (settings.mode === "Local") {
      try {
        await fetch("/api/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(enrichedEntry),
        });
        const updatedLogs = await fetch("/api/logs").then((r) => r.json());
        setLogs(updatedLogs);
      } catch (error) {
        console.error("Failed to save log locally:", error);
      }
      return;
    }

    try {
      const currentToken = getAccessToken() || token;
      if (!currentToken) {
        throw new Error(
          "Not connected to Google Drive. Saving logs is disabled.",
        );
      }

      const updatedLogs = await appendLogToDrive(enrichedEntry);
      setLogs(updatedLogs);
    } catch (error) {
      console.error("Failed to add log:", error);
    }
  }, [now, token]);

  return {
    interstitials,
    setInterstitials,
    shows,
    setShows,
    logs,
    setLogs,
    isSaving,
    savingLabel,
    saveRecoveryModal,
    setSaveRecoveryModal,
    loadShows,
    saveShows,
    saveInterstitials,
    addLog,
  };
}
