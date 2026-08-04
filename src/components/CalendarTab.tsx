import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, FileText, Calendar, Clock, CheckCircle, AlertCircle, ShieldAlert, Copy, Check, XCircle, X, FolderOpen, Music, Search, Play, Square, ChevronUp, ChevronDown, RefreshCw, Eye, User, BookOpen } from 'lucide-react';
import { Interstitial, InterstitialType, InterstitialMetadata, Show } from '../types';
import { cn, getMP3Status, formatDuration, getFilenameFromUrlOrPath, isTimeInShow, getSortedShows, getShowShade, readMp3ID3Metadata, parseID3Bytes } from '../lib/utils';
import { getPlayableUrl, DRIVE_FOLDERS, getSavedSettings, verifyEvergreensOnDrive, checkEvergreenFolderOnDrive, applyEvergreenChangeOnDrive } from '../lib/driveService';
import LiveReadPopout from './LiveReadPopout';

const cleanNameShort = (val: string): string => {
  let cleaned = val.replace(/[^a-zA-Z0-9_]/g, '_');
  cleaned = cleaned.replace(/_+/g, '_');
  cleaned = cleaned.replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 24);
};

export function addSoftHyphensForFirstLine(text: string, maxCharIndex: number = 15): string {
  if (!text) return '';
  let count = 0;
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    result += char;
    if (char !== ' ') {
      count++;
      if (count < maxCharIndex && i < text.length - 1 && text[i + 1] !== ' ') {
        result += '\u00AD';
      }
    }
  }
  return result;
}

export interface InterstitialConflict {
  interstitial1: Interstitial;
  interstitial2: Interstitial;
  message: string;
}

export interface ShowConflict {
  show1: Show;
  show2: Show;
  message: string;
}

const daysOrderList = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function formatGridRulesSummary(gridRules: string[]): string {
  if (!gridRules || gridRules.length === 0) return '';
  if (gridRules.length === 168) return 'Every hour of every day';
  
  const formatted = gridRules.map(rule => {
    const parts = rule.split('-');
    if (parts.length < 2) return rule;
    const d = parseInt(parts[0], 10);
    const h = parseInt(parts[1], 10);
    const dayName = daysOrderList[d] || `Day ${d}`;
    const hStr = h.toString().padStart(2, '0');
    return `${dayName} ${hStr}:00`;
  });

  if (formatted.length <= 3) {
    return formatted.join(', ');
  }
  return `${formatted.slice(0, 3).join(', ')} (+${formatted.length - 3} more timeslots)`;
}

export function getInterstitialConflicts(interstitialsList: Interstitial[]): InterstitialConflict[] {
  const active = interstitialsList.filter(s => s.enabled !== false);
  const conflicts: InterstitialConflict[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];

      const minA = a.minute || 0;
      const minB = b.minute || 0;
      if (minA !== minB) continue;

      const mStr = minA.toString().padStart(2, '0');

      if (a.type === InterstitialType.BASIC_HOURLY && b.type === InterstitialType.BASIC_HOURLY) {
        conflicts.push({
          interstitial1: a,
          interstitial2: b,
          message: `"${a.name}" and "${b.name}" both start at :${mStr} every hour`
        });
        continue;
      }

      if (
        (a.type === InterstitialType.BASIC_HOURLY && b.type === InterstitialType.ADVANCED) ||
        (b.type === InterstitialType.BASIC_HOURLY && a.type === InterstitialType.ADVANCED)
      ) {
        const adv = a.type === InterstitialType.ADVANCED ? a : b;
        const hly = a.type === InterstitialType.BASIC_HOURLY ? a : b;
        const rules = adv.gridRules || [];
        if (rules.length > 0) {
          conflicts.push({
            interstitial1: a,
            interstitial2: b,
            message: `"${hly.name}" and "${adv.name}" both start at :${mStr} (${formatGridRulesSummary(rules)})`
          });
        }
        continue;
      }

      if (a.type === InterstitialType.ADVANCED && b.type === InterstitialType.ADVANCED) {
        const rulesA = new Set(a.gridRules || []);
        const commonRules = (b.gridRules || []).filter(r => rulesA.has(r));
        if (commonRules.length > 0) {
          conflicts.push({
            interstitial1: a,
            interstitial2: b,
            message: `"${a.name}" and "${b.name}" both start at :${mStr} (${formatGridRulesSummary(commonRules)})`
          });
        }
        continue;
      }

      if (a.type === InterstitialType.ONE_TIME && b.type === InterstitialType.ONE_TIME) {
        if (a.date && b.date && a.date === b.date) {
          const hA = parseInt(a.time || '0', 10);
          const hB = parseInt(b.time || '0', 10);
          if (hA === hB) {
            conflicts.push({
              interstitial1: a,
              interstitial2: b,
              message: `"${a.name}" and "${b.name}" both start on ${a.date} at ${hA.toString().padStart(2, '0')}:${mStr}`
            });
          }
        }
        continue;
      }

      const ot = a.type === InterstitialType.ONE_TIME ? a : b.type === InterstitialType.ONE_TIME ? b : null;
      const rec = ot === a ? b : ot === b ? a : null;

      if (ot && rec && ot.date && ot.time) {
        const otHour = parseInt(ot.time, 10);
        const otDayIdx = new Date(`${ot.date}T00:00:00`).getDay();
        const otRule = `${otDayIdx}-${otHour}`;

        if (rec.type === InterstitialType.BASIC_HOURLY) {
          conflicts.push({
            interstitial1: a,
            interstitial2: b,
            message: `"${ot.name}" and "${rec.name}" both start on ${ot.date} at ${otHour.toString().padStart(2, '0')}:${mStr}`
          });
        } else if (rec.type === InterstitialType.ADVANCED) {
          if ((rec.gridRules || []).includes(otRule)) {
            conflicts.push({
              interstitial1: a,
              interstitial2: b,
              message: `"${ot.name}" and "${rec.name}" both start on ${ot.date} at ${otHour.toString().padStart(2, '0')}:${mStr}`
            });
          }
        }
      }
    }
  }

  return conflicts;
}

export function getShowConflicts(showsList: Show[]): ShowConflict[] {
  const active = showsList.filter(s => s.active !== false);
  const conflicts: ShowConflict[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];

      const dayIdxA = daysOrderList.indexOf(a.day as any);
      const dayIdxB = daysOrderList.indexOf(b.day as any);
      if (dayIdxA === -1 || dayIdxB === -1) continue;

      const startA = dayIdxA * 1440 + a.startHour * 60 + (a.startMinute || 0);
      const durA = (a.durationHours || 0) * 60 + (a.durationMinutes || 0);
      const startB = dayIdxB * 1440 + b.startHour * 60 + (b.startMinute || 0);
      const durB = (b.durationHours || 0) * 60 + (b.durationMinutes || 0);

      if (durA <= 0 || durB <= 0) continue;

      const endA = startA + durA;
      const intervalsA = endA <= 10080 
        ? [{ s: startA, e: endA }] 
        : [{ s: startA, e: 10080 }, { s: 0, e: endA - 10080 }];

      const endB = startB + durB;
      const intervalsB = endB <= 10080 
        ? [{ s: startB, e: endB }] 
        : [{ s: startB, e: 10080 }, { s: 0, e: endB - 10080 }];

      let hasOverlap = false;
      for (const iA of intervalsA) {
        for (const iB of intervalsB) {
          const ovStart = Math.max(iA.s, iB.s);
          const ovEnd = Math.min(iA.e, iB.e);

          if (ovStart < ovEnd) {
            const dIdx = Math.floor(ovStart / 1440);
            const sH = Math.floor((ovStart % 1440) / 60).toString().padStart(2, '0');
            const sM = (ovStart % 60).toString().padStart(2, '0');
            const eH = Math.floor((ovEnd % 1440) / 60).toString().padStart(2, '0');
            const eM = (ovEnd % 60).toString().padStart(2, '0');
            const timeStr = `${daysOrderList[dIdx]} ${sH}:${sM}–${eH}:${eM}`;

            conflicts.push({
              show1: a,
              show2: b,
              message: `"${a.name}" and "${b.name}" overlap on ${timeStr}`
            });
            hasOverlap = true;
            break;
          }
        }
        if (hasOverlap) break;
      }
    }
  }

  return conflicts;
}

export interface ShowGap {
  message: string;
}

export function getShowGaps(showsList: Show[]): ShowGap[] {
  const active = showsList.filter(s => s.active !== false);
  if (active.length === 0) {
    return [{ message: 'No active shows scheduled for the entire week' }];
  }

  const intervals: { s: number; e: number }[] = [];
  for (const show of active) {
    const dayIdx = daysOrderList.indexOf(show.day as any);
    if (dayIdx === -1) continue;

    const start = dayIdx * 1440 + (show.startHour || 0) * 60 + (show.startMinute || 0);
    const dur = (show.durationHours || 0) * 60 + (show.durationMinutes || 0);
    if (dur <= 0) continue;

    const end = start + dur;
    if (end <= 10080) {
      intervals.push({ s: start, e: end });
    } else {
      intervals.push({ s: start, e: 10080 });
      intervals.push({ s: 0, e: end - 10080 });
    }
  }

  if (intervals.length === 0) {
    return [{ message: 'No active shows scheduled for the entire week' }];
  }

  intervals.sort((a, b) => a.s - b.s);

  const merged: { s: number; e: number }[] = [];
  for (const interval of intervals) {
    if (merged.length === 0) {
      merged.push({ ...interval });
    } else {
      const last = merged[merged.length - 1];
      if (interval.s <= last.e) {
        last.e = Math.max(last.e, interval.e);
      } else {
        merged.push({ ...interval });
      }
    }
  }

  const formatWeekMin = (min: number) => {
    const norm = (min % 10080 + 10080) % 10080;
    const dIdx = Math.floor(norm / 1440);
    const h = Math.floor((norm % 1440) / 60).toString().padStart(2, '0');
    const m = (norm % 60).toString().padStart(2, '0');
    return { dayName: daysOrderList[dIdx], timeStr: `${h}:${m}`, dIdx };
  };

  const formatGapMessage = (gapStart: number, gapEnd: number) => {
    const startInfo = formatWeekMin(gapStart);
    const endInfo = formatWeekMin(gapEnd);

    if (startInfo.dIdx === endInfo.dIdx && gapStart < gapEnd && (gapEnd - gapStart) < 1440) {
      return `No show scheduled on ${startInfo.dayName} ${startInfo.timeStr}–${endInfo.timeStr}`;
    }
    return `No show scheduled from ${startInfo.dayName} ${startInfo.timeStr} to ${endInfo.dayName} ${endInfo.timeStr}`;
  };

  const gaps: ShowGap[] = [];

  for (let i = 0; i < merged.length - 1; i++) {
    const gStart = merged[i].e;
    const gEnd = merged[i + 1].s;
    if (gEnd > gStart) {
      gaps.push({ message: formatGapMessage(gStart, gEnd) });
    }
  }

  const lastEnd = merged[merged.length - 1].e;
  const firstStart = merged[0].s;

  if (lastEnd < 10080 || firstStart > 0) {
    const totalUncovered = (10080 - lastEnd) + firstStart;
    if (totalUncovered >= 10080) {
      gaps.push({ message: 'No active shows scheduled for the entire week' });
    } else if (totalUncovered > 0) {
      gaps.push({ message: formatGapMessage(lastEnd, firstStart) });
    }
  }

  return gaps;
}

interface CalendarTabProps {
  interstitials: Interstitial[];
  onSave: (interstitials: Interstitial[]) => void;
  isAdmin: boolean;
  onAdminToggle: (val: boolean) => void;
  now: Date;
  driveMP3s?: any[];
  isDriveActive?: boolean;
  onRefresh?: () => Promise<any> | void;
  shows?: Show[];
  onSaveShows?: (shows: Show[]) => void;
  currentViewMode?: 'list' | 'calendar' | 'shows';
  onViewModeChange?: (mode: 'list' | 'calendar' | 'shows') => void;
}

export default function CalendarTab({ interstitials, onSave, isAdmin, onAdminToggle, now, driveMP3s = [], isDriveActive = false, onRefresh, shows = [], onSaveShows, currentViewMode, onViewModeChange }: CalendarTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Interstitial>>({});
  const isNew = editingId ? !interstitials.some(s => s.id === editingId) : false;
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [interstitialFilterQuery, setInterstitialFilterQuery] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewScriptFile, setPreviewScriptFile] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Audit states for save confirmations
  const [pendingSaveInterstitial, setPendingSaveInterstitial] = useState<{
    updatedList: Interstitial[];
    conflicts: InterstitialConflict[];
  } | null>(null);

  const [pendingSaveShow, setPendingSaveShow] = useState<{
    updatedList: Show[];
    conflicts: ShowConflict[];
  } | null>(null);

  // Computed schedule audit conflicts
  const interstitialConflicts = React.useMemo(() => getInterstitialConflicts(interstitials), [interstitials]);
  const showConflicts = React.useMemo(() => getShowConflicts(shows), [shows]);
  const showGaps = React.useMemo(() => getShowGaps(shows), [shows]);

  const headerContainerRef = useRef<HTMLDivElement>(null);
  const [headerContainerWidth, setHeaderContainerWidth] = useState<number>(1200);

  useEffect(() => {
    if (!headerContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeaderContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(headerContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const hideCalendarIcon = headerContainerWidth < 1050 && headerContainerWidth >= 580;
  const hideInterstitialsIcons = headerContainerWidth < 980 && headerContainerWidth >= 580;
  const hideShowsIcon = headerContainerWidth < 910 && headerContainerWidth >= 580;
  const addTextShort = headerContainerWidth < 830 && headerContainerWidth >= 750;
  const addTextIconOnly = headerContainerWidth < 750;
  const halfFilter = headerContainerWidth < 670;
  const modeIconsOnly = headerContainerWidth < 580;

  // Shows related states
  const [showFilterQuery, setShowFilterQuery] = useState('');
  const [editingShowId, setEditingShowId] = useState<string | null>(null);
  const [showFormData, setShowFormData] = useState<Partial<Show>>({});
  const [isNameShortManuallyEdited, setIsNameShortManuallyEdited] = useState(false);
  const [isVerifyingEvergreens, setIsVerifyingEvergreens] = useState(false);

  const handleVerifyEvergreens = async () => {
    setIsVerifyingEvergreens(true);
    try {
      const settings = getSavedSettings();
      if (settings.mode === 'Demo') {
        alert('Evergreen folder verification/creation cannot execute in Demo mode. Please configure either Local or Google Drive mode in Settings.');
        return;
      }

      if (settings.mode === 'Drive') {
        const data = await verifyEvergreensOnDrive(shows);
        const createdMsg = data.createdFolders.length > 0 
          ? `\n\nCreated folders for shows: ${data.createdFolders.join(', ')}`
          : '';
        alert(`Evergreen & Playlist folder verification completed successfully in Google Drive!\n\nEvergreens Location: ${data.evergreensPath}\nPlaylists Location: ${data.playlistsPath}${createdMsg}`);
        return;
      }

      // Local mode
      const response = await fetch('/api/shows/verify-evergreens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify evergreen/playlist folders');
      }
      
      const createdMsg = data.createdFolders.length > 0 
        ? `\n\nCreated folders for shows: ${data.createdFolders.join(', ')}`
        : '';
      const playlistsLoc = data.playlistsPath ? `\nPlaylists Location: ${data.playlistsPath}` : '';
      alert(`Evergreen & Playlist folder verification completed successfully!\n\nEvergreens Location: ${data.evergreensPath}${playlistsLoc}${createdMsg}`);
    } catch (err: any) {
      alert(`Error verifying evergreen folders:\n${err.message}`);
    } finally {
      setIsVerifyingEvergreens(false);
    }
  };

  const createNewShow = () => {
    setEditingShowId('new');
    setIsNameShortManuallyEdited(false);
    const maxIdNum = shows.reduce((max, s) => {
      const num = parseInt(s.id, 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = (maxIdNum + 1).toString();

    setShowFormData({
      id: newId,
      day: 'Monday',
      startHour: 9,
      startMinute: 0,
      durationHours: 1,
      durationMinutes: 0,
      name: '',
      nameShort: '',
      host: '',
      description: '',
      active: true
    });
  };

  const startEditShow = (show: Show) => {
    setEditingShowId(show.id);
    setIsNameShortManuallyEdited(true);
    setShowFormData({ ...show });
  };

  const handleDeleteShow = (id: string) => {
    if (confirm("Are you sure you want to delete this show?")) {
      const filtered = shows.filter(s => s.id !== id);
      if (onSaveShows) {
        onSaveShows(filtered);
      }
      setEditingShowId(null);
    }
  };

  const handleSaveShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showFormData.name) {
      alert("Show name is required.");
      return;
    }

    const finalNameShort = showFormData.nameShort ? cleanNameShort(showFormData.nameShort) : cleanNameShort(showFormData.name);
    if (!finalNameShort) {
      alert("Short Name is required.");
      return;
    }

    // 6.a. Before adding or editing, ensure nameShort is unique
    const otherShows = shows.filter(s => s.id !== editingShowId);
    const isUnique = !otherShows.some(s => s.nameShort.toLowerCase() === finalNameShort.toLowerCase());
    if (!isUnique) {
      alert(`The short name "${finalNameShort}" is already in use by another show. Please provide a unique short name.`);
      return;
    }

    const isNewShow = editingShowId === 'new';
    let renameFolder = false;
    let oldNameShort = '';

    if (!isNewShow) {
      const originalShow = shows.find(s => s.id === editingShowId);
      if (originalShow) {
        oldNameShort = originalShow.nameShort;
      }
    }

    try {
      const settings = getSavedSettings();
      if (settings.mode === 'Demo') {
        console.warn('Evergreen folder synchronization did not execute because the app is in Demo mode.');
      } else if (settings.mode === 'Drive') {
        // Drive mode check and apply - always attempt to rename if updating
        const applyData = await applyEvergreenChangeOnDrive(
          isNewShow ? 'create' : 'update',
          finalNameShort,
          isNewShow ? undefined : oldNameShort,
          true // Always try to rename the existing folder
        );
        console.log('Google Drive Evergreen folder sync complete:', applyData);
      } else {
        // Local mode check and apply - always attempt to rename if updating
        const applyRes = await fetch('/api/shows/evergreen/apply-change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: isNewShow ? 'create' : 'update',
            nameShort: finalNameShort,
            oldNameShort: isNewShow ? undefined : oldNameShort,
            renameFolder: true // Always try to rename the existing folder
          })
        });

        if (!applyRes.ok) {
          const applyErr = await applyRes.json();
          console.warn('Evergreen folder sync status:', applyErr.error);
        }
      }
    } catch (err: any) {
      console.error('Failed to sync Evergreen folder:', err);
    }

    const updatedShow: Show = {
      id: showFormData.id || (shows.reduce((max, s) => {
        const num = parseInt(s.id, 10);
        return !isNaN(num) && num > max ? num : max;
      }, 0) + 1).toString(),
      day: (showFormData.day as any) || 'Monday',
      startHour: typeof showFormData.startHour === 'number' ? showFormData.startHour : 9,
      startMinute: typeof showFormData.startMinute === 'number' ? showFormData.startMinute : 0,
      durationHours: typeof showFormData.durationHours === 'number' ? showFormData.durationHours : 0,
      durationMinutes: typeof showFormData.durationMinutes === 'number' ? showFormData.durationMinutes : 0,
      name: showFormData.name || '',
      nameShort: finalNameShort || 'show',
      host: showFormData.host || '',
      description: showFormData.description || '',
      active: showFormData.active !== undefined ? showFormData.active : true,
    };

    let newShows: Show[];
    const exists = shows.some(s => s.id === editingShowId);
    if (exists) {
      newShows = shows.map(s => s.id === editingShowId ? updatedShow : s);
    } else {
      newShows = [...shows, updatedShow];
    }

    const showConflictsList = getShowConflicts(newShows);
    if (showConflictsList.length > 0) {
      setPendingSaveShow({
        updatedList: newShows,
        conflicts: showConflictsList
      });
      return;
    }

    if (onSaveShows) {
      onSaveShows(newShows);
    }
    setEditingShowId(null);
  };

  useEffect(() => {
    if (isPickerOpen && onRefresh) {
      onRefresh();
    }
  }, [isPickerOpen, onRefresh]);

  // Type-ahead states for MP3 selector
  const [mp3InputVal, setMp3InputVal] = useState('');
  const [originalMp3OnFocus, setOriginalMp3OnFocus] = useState('');
  const [isMp3Focused, setIsMp3Focused] = useState(false);

  // MP3 Metadata Cache and loader
  const [metadataCache, setMetadataCache] = useState<Record<string, { title?: string; artist?: string; album?: string }>>({});
  const [pickerDurations, setPickerDurations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isPickerOpen) return;
    
    const soundLibrary = driveMP3s;
    soundLibrary.forEach(file => {
      const filename = file.name;
      if (filename.toLowerCase().endsWith('.mp3') && !pickerDurations[filename]) {
        try {
          const playableUrl = getPlayableUrl(filename);
          if (playableUrl) {
            const audio = new Audio(playableUrl);
            const handleLoaded = () => {
              const d = audio.duration;
              if (!isNaN(d) && d > 0) {
                const formatted = formatDuration(d);
                setPickerDurations(prev => ({
                  ...prev,
                  [filename]: formatted
                }));
              }
            };
            audio.addEventListener('loadedmetadata', handleLoaded);
            audio.addEventListener('error', () => {});
          }
        } catch (e) {
          console.error("Failed to load metadata for " + filename, e);
        }
      }
    });
  }, [isPickerOpen, driveMP3s, pickerDurations]);

  useEffect(() => {
    if (!isPickerOpen) return;
    
    const soundLibrary = driveMP3s;
    soundLibrary.slice(0, 40).forEach(file => {
      let alreadyFetched = false;
      setMetadataCache(current => {
        if (current[file.name] !== undefined) {
          alreadyFetched = true;
        }
        return current;
      });
      
      if (alreadyFetched) return;

      setMetadataCache(prev => ({ ...prev, [file.name]: {} }));

      const playableUrl = getPlayableUrl(file.name);
      readMp3ID3Metadata(playableUrl).then(meta => {
        if (meta) {
          setMetadataCache(prev => ({ ...prev, [file.name]: meta }));
        }
      });
    });
  }, [isPickerOpen, driveMP3s, isDriveActive]);

  // States and helper for interactive clock-style dialing
  const [isDraggingClock, setIsDraggingClock] = useState(false);
  const handleClockInteraction = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    // If it is a touch event, prevent default scrolling to make dialing super smooth
    if (e.cancelable) {
      e.preventDefault();
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = clientX - centerX;
    const y = clientY - centerY;
    
    let angleDegrees = Math.atan2(y, x) * (180 / Math.PI);
    let adjustedAngle = angleDegrees + 90;
    if (adjustedAngle < 0) {
      adjustedAngle += 360;
    }
    
    let minute = Math.round(adjustedAngle / 6);
    if (minute >= 60) minute = 0;
    
    setFormData(prev => ({ ...prev, minute }));
  };

  // Synchronize type-ahead input value when formData.mp3Url changes
  useEffect(() => {
    setMp3InputVal(formData.mp3Url || '');
  }, [formData.mp3Url]);

  // Calendar View states
  const [viewMode, setViewModeState] = useState<'list' | 'calendar' | 'shows'>(currentViewMode || 'calendar');

  const setViewMode = (mode: 'list' | 'calendar' | 'shows') => {
    setViewModeState(mode);
    if (onViewModeChange) onViewModeChange(mode);
  };

  useEffect(() => {
    if (currentViewMode && currentViewMode !== viewMode) {
      setViewModeState(currentViewMode);
    }
  }, [currentViewMode]);
  const [calendarLayoutMode, setCalendarLayoutMode] = useState<'full' | 'compact'>(() => (localStorage.getItem('interstitial_calendar_layout_mode') as 'full' | 'compact') || 'full');
  const [calendarTimeframe, setCalendarTimeframe] = useState<'weekly' | 'daily'>(() => (localStorage.getItem('interstitial_calendar_timeframe') as 'weekly' | 'daily') || 'weekly');
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [calendarDate, setCalendarDate] = useState<Date>(() => new Date(now));
  const [selectedCalendarInterstitial, setSelectedCalendarInterstitial] = useState<Interstitial | null>(null);
  const [selectedCalendarShow, setSelectedCalendarShow] = useState<Show | null>(null);
  const [selectedHours, setSelectedHours] = useState<number[]>(() => Array.from({ length: 24 }, (_, i) => i));
  const [isHoursDropdownOpen, setIsHoursDropdownOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, []);

  const formatMetadataDate = (dString: string | Date | undefined) => {
    if (!dString) return "N/A";
    try {
      const d = new Date(dString);
      if (isNaN(d.getTime())) return "N/A";
      const year = d.getFullYear();
      const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const mss = monthShorts[d.getMonth()] || 'JUN';
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${mss}-${day} ${hh}:${mm}`;
    } catch {
      return "N/A";
    }
  };

  // Metadata Fetcher: Automatically get duration when URL is verified
  useEffect(() => {
    const status = getMP3Status(formData.mp3Url);
    const isVerified = status.exists && status.valid;

    if (isVerified && formData.mp3Url) {
      const audio = new Audio(getPlayableUrl(formData.mp3Url));
      const handleLoadedMetadata = () => {
        const d = audio.duration;
        if (!isNaN(d) && d > 0) {
          const formatted = formatDuration(d);
          if (formData.duration !== formatted) {
            setFormData(prev => ({ ...prev, duration: formatted }));
          }
        }
      };
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      return () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [formData.mp3Url, formData.duration]);

  const togglePreview = (url: string | undefined, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!url) return;

    if (previewUrl === url) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      setPreviewUrl(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      
      const audio = new Audio(getPlayableUrl(url));
      audioRef.current = audio;
      audio.play().catch(err => {
        console.error("Preview failed", err);
        setPreviewUrl(null);
      });
      audio.onended = () => {
        setPreviewUrl(null);
      };
      setPreviewUrl(url);
    }
  };

  const soundLibrary = driveMP3s;
  const filteredFiles = soundLibrary.filter(f => {
    const nameLower = f.name.toLowerCase();
    
    // Filter by unified allowed types
    const allowed = ['.mp3', '.txt', '.pdf', '.png', '.jpg', '.jpeg'];
    if (!allowed.some(ext => nameLower.endsWith(ext))) return false;
    
    return nameLower.includes(searchQuery.toLowerCase());
  });

  const startEdit = (s: Interstitial) => {
    setEditingId(s.id);
    setFormData(s);
  };

  const getInterstitialSummary = (s: Interstitial) => {
    if (s.type === InterstitialType.ONE_TIME) {
      const timeStr = s.time ? `${s.time}:${s.minute.toString().padStart(2, '0')}` : `??:${s.minute.toString().padStart(2, '0')}`;
      return `${s.date || 'No Date'} @ ${timeStr}`;
    }
    if (s.type === InterstitialType.BASIC_HOURLY) {
      return "Every Hour";
    }
    
    if (!s.gridRules || s.gridRules.length === 0) {
      return "No windows selected";
    }

    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const activeDays = new Set<number>();
    const activeHours = new Set<number>();
    
    s.gridRules.forEach(rule => {
      const [d, h] = rule.split('-').map(Number);
      activeDays.add(d);
      activeHours.add(h);
    });

    // Check for full days (all 24 hours active)
    const fullDays: string[] = [];
    days.forEach((day, i) => {
      let allHoursActive = true;
      for (let h = 0; h < 24; h++) {
        if (!s.gridRules?.includes(`${i}-${h}`)) {
          allHoursActive = false;
          break;
        }
      }
      if (allHoursActive) fullDays.push(day);
    });

    // Check for full hours (all 7 days active)
    const fullHours: string[] = [];
    for (let h = 0; h < 24; h++) {
      let allDaysActive = true;
      for (let d = 0; d < 7; d++) {
        if (!s.gridRules?.includes(`${d}-${h}`)) {
          allDaysActive = false;
          break;
        }
      }
      if (allDaysActive) fullHours.push(`${h.toString().padStart(2, '0')}:00`);
    }

    if (fullDays.length === 7 && fullHours.length === 24) return "Always Active";
    if (fullDays.length > 0 && fullDays.length === activeDays.size && fullHours.length === 0) {
      return `Days: ${fullDays.join(', ')}`;
    }
    if (fullHours.length > 0 && fullHours.length === activeHours.size && fullDays.length === 0) {
      return `Hours: ${fullHours.join(', ')}`;
    }

    return "Open for details";
  };

  const getNextId = () => {
    const ids = interstitials.map(s => parseInt(s.id)).filter(id => !isNaN(id));
    const max = ids.length > 0 ? Math.max(...ids) : 99999;
    return (max + 1).toString();
  };

  const createNew = () => {
    const id = getNextId();
    const today = new Date().toISOString().split('T')[0];
    const newSchedule: Interstitial = {
      id,
      name: '',
      type: InterstitialType.BASIC_HOURLY,
      mp3Url: '',
      enabled: true,
      minute: 0,
      startDate: today,
      metadata: {
        createdBy: 'Admin',
        createdDate: new Date().toISOString(),
        lastModifiedBy: 'Admin',
        lastModifiedDate: new Date().toISOString()
      }
    };
    setEditingId(id);
    setFormData(newSchedule);
  };

  const duplicate = (s: Interstitial, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = getNextId();
    const today = new Date().toISOString().split('T')[0];
    
    // Check if start date is in the past
    let newStartDate = s.startDate;
    if (s.startDate && s.startDate < today) {
      newStartDate = today;
    }

    const newSchedule: Interstitial = {
      ...s,
      id,
      name: `${s.name} (Copy)`,
      enabled: true, // Reset to active as requested
      startDate: newStartDate,
      metadata: {
        ...s.metadata,
        createdBy: 'Admin',
        createdDate: new Date().toISOString(),
        lastModifiedDate: new Date().toISOString()
      }
    };
    setEditingId(id);
    setFormData(newSchedule);
  };

  const saveEdit = () => {
    if (!editingId) return;
    
    if (!formData.name) {
      return;
    }

    if (formData.type === InterstitialType.ONE_TIME) {
      if (!formData.date || !formData.time) {
        return;
      }
    }

    const sanitizedMp3Url = getFilenameFromUrlOrPath(formData.mp3Url);
    
    // Automatically set assetType based on file extension chosen
    const nameLower = sanitizedMp3Url.toLowerCase();
    const isScriptExt = ['.txt', '.pdf', '.png', '.jpg', '.jpeg'].some(ext => nameLower.endsWith(ext));
    const inferredAssetType = isScriptExt ? 'script' : 'audio';

    const now = new Date().toISOString();
    const updated: Interstitial = {
      ...formData as Interstitial,
      mp3Url: sanitizedMp3Url,
      assetType: inferredAssetType,
      metadata: {
        ...(formData.metadata as InterstitialMetadata),
        lastModifiedDate: now
      }
    };
    
    const exists = interstitials.some(s => s.id === editingId);
    let newInterstitials: Interstitial[];
    if (exists) {
      newInterstitials = interstitials.map(s => s.id === editingId ? updated : s);
    } else {
      newInterstitials = [...interstitials, updated];
    }

    const interstitialConflictsList = getInterstitialConflicts(newInterstitials);
    if (interstitialConflictsList.length > 0) {
      setPendingSaveInterstitial({
        updatedList: newInterstitials,
        conflicts: interstitialConflictsList
      });
      return;
    }
    
    onSave(newInterstitials);
    setEditingId(null);
  };

  const deleteInterstitial = (id: string) => {
    onSave(interstitials.filter(s => s.id !== id));
    setEditingId(null);
  };

  const toggleDay = (day: number) => {
    const currentDays = formData.days || [];
    if (currentDays.includes(day)) {
      setFormData({ ...formData, days: currentDays.filter(d => d !== day) });
    } else {
      setFormData({ ...formData, days: [...currentDays, day] });
    }
  };

  const toggleGridCell = (day: number, hour: number) => {
    const currentRules = formData.gridRules || [];
    const key = `${day}-${hour}`;
    if (currentRules.includes(key)) {
      setFormData({ ...formData, gridRules: currentRules.filter(k => k !== key) });
    } else {
      setFormData({ ...formData, gridRules: [...currentRules, key] });
    }
  };

  const toggleColumn = (day: number) => {
    const currentRules = formData.gridRules || [];
    const columnKeys = Array.from({ length: 24 }, (_, h) => `${day}-${h}`);
    const allPresent = columnKeys.every(k => currentRules.includes(k));
    
    if (allPresent) {
      setFormData({ ...formData, gridRules: currentRules.filter(k => !columnKeys.includes(k)) });
    } else {
      const newRules = [...new Set([...currentRules, ...columnKeys])];
      setFormData({ ...formData, gridRules: newRules });
    }
  };

  const toggleRow = (hour: number) => {
    const currentRules = formData.gridRules || [];
    const rowKeys = Array.from({ length: 7 }, (_, d) => `${d}-${hour}`);
    const allPresent = rowKeys.every(k => currentRules.includes(k));
    
    if (allPresent) {
      setFormData({ ...formData, gridRules: currentRules.filter(k => !rowKeys.includes(k)) });
    } else {
      const newRules = [...new Set([...currentRules, ...rowKeys])];
      setFormData({ ...formData, gridRules: newRules });
    }
  };

  const months = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];
  const years = [2025, 2026, 2027, 2028, 2029, 2030];

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = parseInt(e.target.value);
    const newDate = new Date(calendarDate);
    newDate.setMonth(newMonth);
    setCalendarDate(newDate);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = parseInt(e.target.value);
    const newDate = new Date(calendarDate);
    newDate.setFullYear(newYear);
    setCalendarDate(newDate);
  };

  const navigateWeek = (weeks: number) => {
    const newDate = new Date(calendarDate);
    newDate.setDate(calendarDate.getDate() + (weeks * 7));
    setCalendarDate(newDate);
  };

  const navigateCalendar = (offset: number) => {
    if (calendarTimeframe === 'daily') {
      const newDate = new Date(calendarDate);
      newDate.setDate(calendarDate.getDate() + offset);
      setCalendarDate(newDate);
    } else {
      navigateWeek(offset);
    }
  };

  const jumpToToday = () => {
    setCalendarDate(new Date(now));
  };

  const getWeekDays = (baseDate: Date) => {
    const currentDay = baseDate.getDay(); // 0-6
    const weekStart = new Date(baseDate);
    weekStart.setDate(baseDate.getDate() - currentDay);
    
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const getCalendarDays = (baseDate: Date) => {
    if (calendarTimeframe === 'daily') {
      return [baseDate];
    }
    return getWeekDays(baseDate);
  };

  const formatDayHeader = (date: Date) => {
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return {
      dayName: dayNames[date.getDay()],
      dateStr: `${month}/${day}`
    };
  };

  const getInterstitialsForDateTime = (date: Date, hour: number) => {
    const yyyy = date.getFullYear();
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const localDateStr = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = date.getDay(); // 0-6

    return interstitials.filter(s => {
      // Apply basic text filter search
      if (interstitialFilterQuery) {
        const q = interstitialFilterQuery.toLowerCase();
        const summaryText = getInterstitialSummary(s).toLowerCase();
        const playModeText = (s.type === InterstitialType.ONE_TIME ? "One-Time" : s.type === InterstitialType.BASIC_HOURLY ? "Hourly" : "Advanced").toLowerCase();
        const matchesQuery = s.name.toLowerCase().includes(q) || 
                             (s.mp3Url && s.mp3Url.toLowerCase().includes(q)) ||
                             playModeText.includes(q) ||
                             summaryText.includes(q);
        if (!matchesQuery) return false;
      }

      // If showFilterQuery is set on Calendar view, filter interstitials by active show
      if (showFilterQuery && viewMode === 'calendar') {
        const qShow = showFilterQuery.toLowerCase();
        const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
        const dayName = daysOrder[date.getDay()];
        const activeShowsForS = shows.filter(show => isTimeInShow(show, dayName, hour, s.minute));
        const matchesShow = activeShowsForS.some(show => 
          show.name.toLowerCase().includes(qShow) ||
          (show.description && show.description.toLowerCase().includes(qShow)) ||
          show.day.toLowerCase().includes(qShow)
        );
        if (!matchesShow) return false;
      }

      // Hide all inactive interstitials by default if setting checked
      if (!showInactive && !s.enabled) return false;

      // Check range bounds
      if (s.startDate && localDateStr < s.startDate) return false;
      if (s.endDate && localDateStr > s.endDate) return false;

      if (s.type === InterstitialType.ONE_TIME) {
        if (!s.date || !s.time) return false;
        const sHour = parseInt(s.time, 10);
        return s.date === localDateStr && sHour === hour;
      }

      if (s.type === InterstitialType.BASIC_HOURLY) {
        return true;
      }

      if (s.type === InterstitialType.ADVANCED) {
        if (!s.gridRules) return false;
        return s.gridRules.includes(`${dayOfWeek}-${hour}`);
      }

      return false;
    }).sort((a, b) => a.minute - b.minute);
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="bg-orange-50 p-4 rounded-full mb-4">
          <ShieldAlert className="w-12 h-12 text-orange-500" />
        </div>
        <h2 className="text-xs font-black text-slate-800 uppercase tracking-tighter mb-2">For Programming Administrators ONLY</h2>
        <p className="text-xs text-slate-500 max-w-[280px] mb-6 leading-relaxed font-medium">
          Please don't change or edit unless you know how it all works. Thanks!
        </p>
        <button 
          onClick={() => onAdminToggle(true)}
          className="admin-challenge-btn px-6 py-2.5 bg-slate-900 text-white rounded text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95"
        >
          Enter Admin Mode
        </button>
      </div>
    );
  }

  const renderShowEditForm = () => {
    const isNewShow = editingShowId === 'new';
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const handleResetForm = () => {
      if (isNewShow) {
        setShowFormData({
          id: showFormData.id,
          day: 'Monday',
          startHour: 9,
          startMinute: 0,
          durationHours: 1,
          durationMinutes: 0,
          name: '',
          nameShort: '',
          host: '',
          description: '',
          active: true
        });
        setIsNameShortManuallyEdited(false);
      } else {
        const original = shows.find(s => s.id === editingShowId);
        if (original) {
          setShowFormData({ ...original });
          setIsNameShortManuallyEdited(false);
        }
      }
    };

    return (
      <form onSubmit={handleSaveShow} className="flex-1 flex flex-col min-h-0 bg-slate-100 p-6 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="py-3.5 px-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="bg-blue-600 p-1.5 rounded text-white">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-800 uppercase tracking-tight">
                  {isNewShow ? "Create New Show" : "Edit Show Settings"}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[11px] font-mono bg-slate-100 border border-slate-200 text-slate-500 font-bold px-2 py-0.5 rounded uppercase leading-none">
                ID: {showFormData.id}
              </span>
              <button
                type="button"
                onClick={() => setEditingShowId(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base cursor-pointer leading-none"
              >
                &times;
              </button>
            </div>
          </div>

          <div className="p-6 space-y-5 flex-1 overflow-y-auto">
            {/* Show Name & Short Name */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                  Show Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Saint Boogie Brass Hour"
                  value={showFormData.name || ''}
                  onChange={e => {
                    const newName = e.target.value;
                    const updates: Partial<Show> = { name: newName };
                    if (!isNameShortManuallyEdited) {
                      updates.nameShort = cleanNameShort(newName);
                    }
                    setShowFormData({ ...showFormData, ...updates });
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                  Short Name (for filenames)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Saint_Boogie_Bra"
                  value={showFormData.nameShort || ''}
                  onChange={e => {
                    setIsNameShortManuallyEdited(true);
                    const rawVal = e.target.value;
                    // Only allow alphanumeric characters and underscores
                    const sanitized = rawVal.replace(/[^a-zA-Z0-9_]/g, '');
                    setShowFormData({ ...showFormData, nameShort: sanitized.slice(0, 24) });
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800"
                />
                <p className="text-xs text-slate-400 font-medium">
                  Max 24 characters. Alphanumeric and underscores only.
                </p>
              </div>
            </div>

            {/* Show Host */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                Show Host
              </label>
              <input
                type="text"
                placeholder="e.g. DJ Skeet"
                value={showFormData.host || ''}
                onChange={e => setShowFormData({ ...showFormData, host: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 h-10"
              />
            </div>

            {/* Combined Row: Show Day, Start Time, and Duration */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {/* 1. Show Day */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                  Show Day
                </label>
                <select
                  value={showFormData.day || 'Monday'}
                  onChange={e => setShowFormData({ ...showFormData, day: e.target.value as any })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 h-10"
                >
                  {daysOfWeek.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Start Time of Show */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block truncate">
                  Start Time (Military)
                </label>
                <div className="flex items-center gap-2 h-10">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={showFormData.startHour !== undefined ? showFormData.startHour : 9}
                      onChange={e => setShowFormData({ ...showFormData, startHour: Math.max(0, Math.min(23, parseInt(e.target.value) || 0)) })}
                      className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold text-center outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 h-10"
                    />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight shrink-0">Hours</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={showFormData.startMinute !== undefined ? showFormData.startMinute : 0}
                      onChange={e => setShowFormData({ ...showFormData, startMinute: Math.max(0, Math.min(59, parseInt(e.target.value) || 0)) })}
                      className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold text-center outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 h-10"
                    />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight shrink-0">Mins</span>
                  </div>
                </div>
              </div>

              {/* 3. Duration of Show */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block truncate">
                  Duration of Show
                </label>
                <div className="flex items-center gap-2 h-10">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={showFormData.durationHours !== undefined ? showFormData.durationHours : 1}
                      onChange={e => setShowFormData({ ...showFormData, durationHours: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold text-center outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 h-10"
                    />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight shrink-0">Hours</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={showFormData.durationMinutes !== undefined ? showFormData.durationMinutes : 0}
                      onChange={e => setShowFormData({ ...showFormData, durationMinutes: Math.max(0, Math.min(59, parseInt(e.target.value) || 0)) })}
                      className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-sm font-mono font-bold text-center outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 h-10"
                    />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-tight shrink-0">Mins</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Show Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                Show Description
              </label>
              <textarea
                rows={3}
                placeholder="Enter show details and programming details..."
                value={showFormData.description || ''}
                onChange={e => setShowFormData({ ...showFormData, description: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 leading-normal"
              />
            </div>

            {/* Active Status Flag */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <span className="text-xs font-black text-slate-700 uppercase tracking-wide block">
                  Show Broadcast Status
                </span>
                <p className="text-xs text-slate-400 mt-0.5">
                  Define whether this show's profile is currently active in the weekly schedule listings.
                </p>
              </div>
              <div className="flex items-center -space-x-px">
                <button
                  type="button"
                  onClick={() => setShowFormData({ ...showFormData, active: true })}
                  className={cn(
                    "px-4 py-1.5 text-xs font-black uppercase rounded-l border cursor-pointer",
                    showFormData.active
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-400 border-slate-250 hover:bg-slate-50"
                  )}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setShowFormData({ ...showFormData, active: false })}
                  className={cn(
                    "px-4 py-1.5 text-xs font-black uppercase rounded-r border cursor-pointer",
                    !showFormData.active
                      ? "bg-slate-600 text-white border-slate-600"
                      : "bg-white text-slate-400 border-slate-250 hover:bg-slate-50"
                  )}
                >
                  Inactive
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
            <div className="flex gap-2">
              {!isNewShow && (
                <button
                  type="button"
                  onClick={() => handleDeleteShow(showFormData.id!)}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Show</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2 bg-slate-105 hover:bg-slate-200 text-slate-600 border border-slate-300 rounded text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
              >
                Reset
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingShowId(null)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 rounded text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    );
  };

  const renderShowsList = () => {
    // Filter by search query
    const filteredShows = shows.filter(show => {
      if (!showFilterQuery) return true;
      const q = showFilterQuery.toLowerCase();
      
      const dayLong = show.day.toLowerCase();
      const dayShort = show.day.substring(0, 3).toLowerCase();
      
      const startHour = show.startHour ?? 0;
      const startMinute = show.startMinute ?? 0;
      const time24 = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
      
      const ampm = startHour >= 12 ? 'pm' : 'am';
      const hour12 = startHour % 12 === 0 ? 12 : startHour % 12;
      const time12 = `${hour12}:${startMinute.toString().padStart(2, '0')} ${ampm}`;
      const time12NoSpace = `${hour12}:${startMinute.toString().padStart(2, '0')}${ampm}`;
      const time12HourOnly = `${hour12}${ampm}`;
      
      return (
        show.name.toLowerCase().includes(q) ||
        show.host.toLowerCase().includes(q) ||
        show.description.toLowerCase().includes(q) ||
        dayLong.includes(q) ||
        dayShort.includes(q) ||
        time24.includes(q) ||
        time12.includes(q) ||
        time12NoSpace.includes(q) ||
        time12HourOnly.includes(q)
      );
    });

    // Group or Sort by day of week and start time
    const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const sortedShows = [...filteredShows].sort((a, b) => {
      const dayDiff = daysOrder.indexOf(a.day) - daysOrder.indexOf(b.day);
      if (dayDiff !== 0) return dayDiff;
      const hourDiff = (a.startHour || 0) - (b.startHour || 0);
      if (hourDiff !== 0) return hourDiff;
      return (a.startMinute || 0) - (b.startMinute || 0);
    });

    if (sortedShows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 border-dashed text-center flex-1">
          <BookOpen className="w-12 h-12 text-slate-300 mb-3" />
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">No Shows Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            {showFilterQuery ? "No shows match your filter criteria." : "There are currently no show profiles stored in shows.json. Click '+ ADD NEW SHOW' to create one."}
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col flex-1 min-h-0 pb-1">
        {(showConflicts.length > 0 || showGaps.length > 0) && (
          <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2.5 px-3.5 mb-3 text-amber-800 text-xs italic flex items-start gap-2.5 shadow-2xs shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 not-italic" />
            <div className="space-y-1">
              {showConflicts.length > 0 && (
                <div>
                  <span className="font-semibold not-italic text-amber-900">Show Caution: </span>
                  {showConflicts.map(c => c.message).join('; ')}
                </div>
              )}
              {showGaps.length > 0 && (
                <div>
                  <span className="font-semibold not-italic text-amber-900">Show Gap: </span>
                  {showGaps.map(g => g.message).join('; ')}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col flex-1 min-h-0">
          {/* Header row (Static outside of scrollable viewport, matching log grid layout) */}
          <div className="bg-slate-100 border-b border-slate-250 pl-[17px] pr-3 py-1.5 flex items-center gap-4 text-[11px] font-black text-slate-500 uppercase tracking-wider shrink-0 select-none sticky top-0 z-20 shadow-sm">
            <div className="w-[120px] shrink-0">Day & Time</div>
            <div className="flex-1 min-w-0">Show Details</div>
            <div className="w-[130px] shrink-0" />
          </div>

          <div className="overflow-y-auto flex-1 custom-scrollbar min-h-0 divide-y divide-slate-150">
            {sortedShows.map((show, idx) => {
            const sorted = getSortedShows(shows);
            const shade = getShowShade(show, sorted);
            return (
              <div
                key={show.id}
                className={cn(
                  "transition-all flex items-stretch p-3 gap-4 relative",
                  !show.active && "opacity-70"
                )}
                style={{ 
                  backgroundColor: shade.bg,
                  borderLeft: `5px solid ${shade.border}`
                }}
              >
                  {/* Day & Time Column */}
                  <div className="flex flex-col gap-1.5 justify-center w-[120px] shrink-0">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-150 rounded text-xs font-black uppercase tracking-wide text-center leading-none">
                      {show.day}
                    </span>
                    <span className="flex items-center justify-center gap-1 text-xs font-mono text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 leading-none">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {show.startHour !== undefined && show.startMinute !== undefined ? (
                        <span>
                          {show.startHour.toString().padStart(2, '0')}:{show.startMinute.toString().padStart(2, '0')}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono font-bold uppercase text-center leading-none">
                      {show.durationHours}h {show.durationMinutes}m
                    </span>
                  </div>

                  {/* Info / Description Column */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <h3 className="text-sm font-black text-slate-800 tracking-tight leading-tight">
                        {show.name}
                      </h3>
                      {show.host && (
                        <span className="text-xs text-slate-500 font-bold leading-none">
                          by <strong className="text-slate-700">{show.host}</strong>
                        </span>
                      )}
                    </div>
                    {show.description && (
                      <p className="text-xs text-slate-500 leading-normal font-medium font-sans line-clamp-1">
                        {show.description}
                      </p>
                    )}
                    <div className="text-[10px] text-slate-400 font-mono font-bold uppercase mt-1 leading-none">
                      ID: {show.id} {show.nameShort && `• Code: ${show.nameShort}`}
                    </div>
                  </div>

                  {/* Status & Actions Column */}
                  <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 justify-end w-[130px]">
                    <span className={cn(
                      "text-[10px] font-black uppercase px-1.5 py-0.5 rounded border leading-none shrink-0",
                      show.active 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                        : "bg-slate-100 text-slate-400 border-slate-200"
                    )}>
                      {show.active ? "Active" : "Inactive"}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEditShow(show)}
                      className="flex items-center gap-1 py-1 px-2 hover:bg-blue-600 hover:text-white bg-white border border-blue-300 rounded text-blue-700 transition-all shadow-sm group/btn cursor-pointer shrink-0"
                    >
                      <FileText className="w-3 h-3" />
                      <span className="text-xs font-black uppercase tracking-tight">Edit</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Bar containing Check Evergreen Folders button, near window's Folders button */}
        <div className="flex justify-start pt-3 border-t border-slate-200 mt-2 shrink-0 select-none">
          <button 
            type="button"
            onClick={handleVerifyEvergreens}
            disabled={isVerifyingEvergreens}
            className="p-1.5 px-3 bg-slate-600 text-white rounded border border-slate-700 text-xs font-black tracking-tighter shadow-sm hover:bg-slate-700 transition-all uppercase cursor-pointer h-8 disabled:opacity-55 flex items-center gap-1.5 active:translate-y-px"
            title="Verify or create Evergreen & Playlist folders for all shows"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-200" />
            <span>{isVerifyingEvergreens ? "CHECKING..." : "CHECK EVERGREEN & PLAYLIST FOLDERS"}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 font-sans">
      {editingShowId ? (
        renderShowEditForm()
      ) : !editingId ? (
        <div className="flex flex-col h-full min-h-0 flex-1">
          <div ref={headerContainerRef} className="flex items-center justify-between mb-3 px-1 shrink-0 flex-nowrap gap-2 overflow-hidden w-full">
            <div className="flex bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] items-center gap-0.5">
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={cn(
                  "px-3 py-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border shrink-0",
                  viewMode === 'calendar'
                    ? "bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] border-blue-500"
                    : "bg-transparent border-transparent text-slate-400 hover:text-slate-300"
                )}
              >
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0",
                  viewMode === 'calendar'
                    ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                    : "bg-slate-800"
                )} />
                {(!hideCalendarIcon || modeIconsOnly) && <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                {!modeIconsOnly && <span>Calendar</span>}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  "px-3 py-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border shrink-0",
                  viewMode === 'list'
                    ? "bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] border-blue-500"
                    : "bg-transparent border-transparent text-slate-400 hover:text-slate-300"
                )}
              >
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0",
                  viewMode === 'list'
                    ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                    : "bg-slate-800"
                )} />
                {(!hideInterstitialsIcons || modeIconsOnly) && <Music className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                {!modeIconsOnly && <span>Interstitials</span>}
                {(!hideInterstitialsIcons || modeIconsOnly) && <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('shows')}
                className={cn(
                  "px-3 py-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border shrink-0",
                  viewMode === 'shows'
                    ? "bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] border-blue-500"
                    : "bg-transparent border-transparent text-slate-400 hover:text-slate-300"
                )}
              >
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0",
                  viewMode === 'shows'
                    ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                    : "bg-slate-800"
                )} />
                {(!hideShowsIcon || modeIconsOnly) && <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                {!modeIconsOnly && <span>Shows</span>}
              </button>
            </div>
            
            <div className="flex gap-2 items-center flex-nowrap shrink-0">
              {viewMode === 'calendar' ? (
                <>
                  <div className={cn("relative shrink-0 transition-all", halfFilter ? "w-20 sm:w-22" : "w-36 sm:w-44")}>
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Filter interstitials..." 
                      value={interstitialFilterQuery}
                      onChange={e => setInterstitialFilterQuery(e.target.value)}
                      className="w-full pl-8 pr-6 py-1 bg-white border border-slate-350 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans text-slate-850 placeholder-slate-450 h-8"
                    />
                    {interstitialFilterQuery && (
                      <button 
                        onClick={() => setInterstitialFilterQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                        title="Clear interstitial filter"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className={cn("relative shrink-0 transition-all", halfFilter ? "w-20 sm:w-22" : "w-36 sm:w-44")}>
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Filter shows..." 
                      value={showFilterQuery}
                      onChange={e => setShowFilterQuery(e.target.value)}
                      className="w-full pl-8 pr-6 py-1 bg-white border border-slate-350 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans text-slate-850 placeholder-slate-450 h-8"
                    />
                    {showFilterQuery && (
                      <button 
                        onClick={() => setShowFilterQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                        title="Clear show filter"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className={cn("relative shrink-0 transition-all", halfFilter ? "w-24 sm:w-28" : "w-48 sm:w-56")}>
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input 
                    type="text" 
                    placeholder={viewMode === 'shows' ? "Filter shows..." : "Filter interstitials..."} 
                    value={viewMode === 'shows' ? showFilterQuery : interstitialFilterQuery}
                    onChange={e => viewMode === 'shows' ? setShowFilterQuery(e.target.value) : setInterstitialFilterQuery(e.target.value)}
                    className="w-full pl-8 pr-6 py-1 bg-white border border-slate-350 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans text-slate-850 placeholder-slate-450 h-8"
                  />
                  {((viewMode === 'shows' && showFilterQuery) || (viewMode !== 'shows' && interstitialFilterQuery)) && (
                    <button 
                      onClick={() => viewMode === 'shows' ? setShowFilterQuery('') : setInterstitialFilterQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                      title="Clear filter"
                    >
                      ×
                    </button>
                  )}
                </div>
              )}

              <button 
                onClick={viewMode === 'shows' ? createNewShow : createNew}
                className="p-1.5 px-3 bg-blue-600 text-white rounded text-xs font-black tracking-tighter shadow-sm hover:bg-blue-700 transition-colors uppercase cursor-pointer h-8 border border-blue-700 shrink-0 whitespace-nowrap"
              >
                {addTextIconOnly ? "+" : addTextShort ? "+ ADD" : (viewMode === 'shows' ? "+ ADD SHOW" : "+ ADD NEW")}
              </button>
            </div>
          </div>

          {viewMode === 'calendar' ? (
            <div className="flex flex-col flex-1 min-h-0">
              {(interstitialConflicts.length > 0 || showConflicts.length > 0 || showGaps.length > 0) && (
                <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2.5 px-3.5 mb-3 text-amber-800 text-xs italic flex items-start gap-2.5 shadow-2xs shrink-0">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 not-italic" />
                  <div className="space-y-1">
                    {interstitialConflicts.length > 0 && (
                      <div>
                        <span className="font-semibold not-italic text-amber-900">Interstitial Caution: </span>
                        {interstitialConflicts.map(c => c.message).join('; ')}
                      </div>
                    )}
                    {showConflicts.length > 0 && (
                      <div>
                        <span className="font-semibold not-italic text-amber-900">Show Caution: </span>
                        {showConflicts.map(c => c.message).join('; ')}
                      </div>
                    )}
                    {showGaps.length > 0 && (
                      <div>
                        <span className="font-semibold not-italic text-amber-900">Show Gap: </span>
                        {showGaps.map(g => g.message).join('; ')}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Calendar View Controls */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="inline-flex bg-slate-200/70 p-0.5 rounded border border-slate-300/40 font-black text-xs uppercase select-none shrink-0 gap-0.5 mr-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarTimeframe('weekly');
                        localStorage.setItem('interstitial_calendar_timeframe', 'weekly');
                      }}
                      className={cn(
                        "relative px-2 py-0.5 rounded text-xs font-black tracking-tight uppercase transition-colors z-10 text-center cursor-pointer",
                        calendarTimeframe === 'weekly' ? "bg-white text-slate-800 shadow-sm font-extrabold" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      Week
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarTimeframe('daily');
                        localStorage.setItem('interstitial_calendar_timeframe', 'daily');
                      }}
                      className={cn(
                        "relative px-2 py-0.5 rounded text-xs font-black tracking-tight uppercase transition-colors z-10 text-center cursor-pointer",
                        calendarTimeframe === 'daily' ? "bg-white text-slate-800 shadow-sm font-extrabold" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      Day
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigateCalendar(-1)}
                    className="px-2.5 py-1 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer text-xs font-black uppercase tracking-tighter whitespace-nowrap flex items-center"
                    title={calendarTimeframe === 'daily' ? "Previous Day" : "Previous Week"}
                  >
                    <span>&larr;</span>
                    <span className="hidden min-[480px]:inline ml-1">PREV</span>
                    <span className="hidden md:inline ml-1">{calendarTimeframe === 'daily' ? "DAY" : "WEEK"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={jumpToToday}
                    className="px-3 py-1 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 font-black cursor-pointer text-xs uppercase tracking-tighter whitespace-nowrap"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateCalendar(1)}
                    className="px-2.5 py-1 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer text-xs font-black uppercase tracking-tighter whitespace-nowrap flex items-center"
                    title={calendarTimeframe === 'daily' ? "Next Day" : "Next Week"}
                  >
                    <span className="hidden min-[480px]:inline mr-1">NEXT</span>
                    <span className="hidden md:inline mr-1">{calendarTimeframe === 'daily' ? "DAY" : "WEEK"}</span>
                    <span>&rarr;</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 text-xs font-black uppercase tracking-tighter">
                  <span className="text-slate-450">Filter:</span>
                  <select
                    value={calendarDate.getMonth()}
                    onChange={handleMonthChange}
                    className="bg-white border border-slate-250 rounded px-2 py-1 text-xs font-black text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    {months.map((m, idx) => (
                      <option key={idx} value={idx}>{m}</option>
                    ))}
                  </select>

                  <select
                    value={calendarDate.getFullYear()}
                    onChange={handleYearChange}
                    className="bg-white border border-slate-250 rounded px-2 py-1 text-xs font-black text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    {years.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>

                  <div className="relative inline-block text-left mr-1">
                    <button
                      type="button"
                      onClick={() => setIsHoursDropdownOpen(!isHoursDropdownOpen)}
                      className="bg-white border border-slate-250 rounded px-2 py-1 text-xs font-black text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1 min-w-[110px] justify-between"
                    >
                      <span>
                        {selectedHours.length === 24
                          ? "All (24h)"
                          : selectedHours.length === 0
                          ? "None selected"
                          : `${selectedHours.length} selected`}
                      </span>
                      <span className="text-slate-440 text-[9px]">▼</span>
                    </button>

                    {isHoursDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10 cursor-default"
                          onClick={() => setIsHoursDropdownOpen(false)}
                        />
                        <div className="absolute right-0 mt-1 w-64 bg-white border border-slate-250 rounded-xl shadow-lg z-25 p-2.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                            <span className="text-xs font-black text-slate-700 uppercase tracking-tighter">
                              Select Hours
                            </span>
                            <div className="flex gap-1.5 text-xs font-black uppercase tracking-tighter">
                              <button
                                type="button"
                                onClick={() => setSelectedHours(Array.from({ length: 24 }, (_, i) => i))}
                                className="text-blue-600 hover:text-blue-700 cursor-pointer"
                              >
                                All
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => setSelectedHours([])}
                                className="text-slate-500 hover:text-slate-600 cursor-pointer"
                              >
                                None
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-1 max-h-[180px] overflow-y-auto custom-scrollbar">
                            {Array.from({ length: 24 }).map((_, h) => {
                              const isSelected = selectedHours.includes(h);
                              return (
                                <button
                                  key={h}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedHours(selectedHours.filter(item => item !== h));
                                    } else {
                                      setSelectedHours([...selectedHours, h].sort((a, b) => a - b));
                                    }
                                  }}
                                  className={cn(
                                    "p-1 py-1 rounded text-xs font-black font-mono tracking-tight text-center border cursor-pointer select-none transition-all",
                                    isSelected
                                      ? "bg-blue-600 text-white border-blue-600 font-extrabold"
                                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                  )}
                                >
                                  {h.toString().padStart(2, '0')}:00
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Mode toggle grouped to keep label with selector */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-slate-450 ml-1">Mode:</span>
                    <div className="inline-flex bg-slate-200/70 p-0.5 rounded border border-slate-300/40 font-black text-xs uppercase select-none shrink-0 gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setCalendarLayoutMode('full');
                          localStorage.setItem('interstitial_calendar_layout_mode', 'full');
                        }}
                        className={cn(
                          "relative px-2 py-0.5 rounded text-xs font-black tracking-tight uppercase transition-colors z-10 text-center cursor-pointer",
                          calendarLayoutMode === 'full' ? "bg-white text-slate-800 shadow-sm font-extrabold" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Full
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCalendarLayoutMode('compact');
                          localStorage.setItem('interstitial_calendar_layout_mode', 'compact');
                        }}
                        className={cn(
                          "relative px-2 py-0.5 rounded text-xs font-black tracking-tight uppercase transition-colors z-10 text-center cursor-pointer",
                          calendarLayoutMode === 'compact' ? "bg-white text-slate-800 shadow-sm font-extrabold" : "text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Compact
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-1.5 text-slate-650 cursor-pointer select-none text-xs font-black uppercase tracking-tighter ml-1 shrink-0">
                    <input
                      type="checkbox"
                      checked={showInactive}
                      onChange={(e) => setShowInactive(e.target.checked)}
                      className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Show Inactive</span>
                  </label>
                </div>
              </div>
              {/* The Calendar Grid Container! */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col flex-1 min-h-0">
                {/* Scrollable list of hours */}
                <div className="overflow-y-auto flex-1 custom-scrollbar min-h-0 flex flex-col">
                  {/* Header row (Static outside of the scrollable viewport, matching log grid layout) */}
                  <div className={cn("grid bg-slate-100 border-b border-slate-250 select-none text-xs font-black text-slate-500 uppercase tracking-tighter shrink-0 shadow-sm sticky top-0 z-20", calendarTimeframe === 'daily' ? "grid-cols-[52px_1fr]" : "grid-cols-[52px_repeat(7,minmax(0,1fr))]")}>
                    <div className="p-2 border-r border-slate-205 flex items-center justify-center font-mono text-slate-450">
                      Hour
                    </div>
                    {getCalendarDays(calendarDate).map((day, idx) => {
                      const { dayName, dateStr } = formatDayHeader(day);
                      const isToday = day.toISOString().split('T')[0] === now.toISOString().split('T')[0];
                      return (
                        <div 
                          key={idx} 
                          className={cn(
                            "p-2 text-center border-r border-slate-200 last:border-r-0 flex items-center justify-center min-w-0",
                            isToday ? "bg-blue-500/10 text-blue-700" : "text-slate-650"
                          )}
                        >
                          <span className="font-black text-xs leading-tight truncate">
                            {dayName} <span className="opacity-80 font-normal ml-1">{dateStr}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {Array.from({ length: 24 }).map((_, h) => h)
                    .filter(h => selectedHours.includes(h))
                    .map((hour) => {
                      const calendarDays = getCalendarDays(calendarDate);
                      const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

                      const matchesShowFilter = (show: typeof shows[0]) => {
                        if (!showFilterQuery) return true;
                        const q = showFilterQuery.toLowerCase();
                        return (
                          show.name.toLowerCase().includes(q) ||
                          (show.description && show.description.toLowerCase().includes(q)) ||
                          show.day.toLowerCase().includes(q)
                        );
                      };

                      const hourHasTopShows = calendarDays.some(d => {
                        const dName = daysOrder[d.getDay()];
                        const topStarting = shows.filter(show => 
                          show.day === dName && 
                          show.startHour === hour && 
                          (show.startMinute === 0 || !show.startMinute) && 
                          matchesShowFilter(show)
                        );
                        if (topStarting.length > 0) return true;

                        if (hour === 0) {
                          const currentDayIdx = daysOrder.indexOf(dName);
                          const priorDayIdx = (currentDayIdx - 1 + 7) % 7;
                          const priorDayName = daysOrder[priorDayIdx];
                          const continuing = shows.filter(show => 
                            show.day === priorDayName && 
                            isTimeInShow(show, dName, 0, 0) && 
                            matchesShowFilter(show)
                          );
                          if (continuing.length > 0) return true;
                        }

                        return false;
                      });

                      const hourMidMinutes = Array.from(new Set(
                        calendarDays.flatMap(d => {
                          const dName = daysOrder[d.getDay()];
                          const dayIdx = daysOrder.indexOf(dName);
                          const hourStartTotal = dayIdx * 1440 + hour * 60;
                          const hourEndTotal = hourStartTotal + 60;

                          const midMins: number[] = [];

                          shows.filter(show => matchesShowFilter(show)).forEach(show => {
                            const showDayIdx = daysOrder.indexOf(show.day);
                            if (showDayIdx === -1) return;

                            const showStartTotal = showDayIdx * 1440 + show.startHour * 60 + (show.startMinute || 0);
                            const durationMin = (show.durationHours || 0) * 60 + (show.durationMinutes || 0);
                            const showEndTotal = showStartTotal + durationMin;

                            // Start in this hour
                            if (showStartTotal >= hourStartTotal && showStartTotal < hourEndTotal) {
                              const relStart = showStartTotal - hourStartTotal;
                              if (relStart > 0 && relStart < 60) midMins.push(relStart);
                            } else if (showStartTotal >= 10080) {
                              const modStart = showStartTotal % 10080;
                              if (modStart >= hourStartTotal && modStart < hourEndTotal) {
                                const relStart = modStart - hourStartTotal;
                                if (relStart > 0 && relStart < 60) midMins.push(relStart);
                              }
                            }

                            // End in this hour
                            if (showEndTotal > hourStartTotal && showEndTotal < hourEndTotal) {
                              const relEnd = showEndTotal - hourStartTotal;
                              if (relEnd > 0 && relEnd < 60) midMins.push(relEnd);
                            } else if (showEndTotal >= 10080) {
                              const modEnd = showEndTotal % 10080;
                              if (modEnd > hourStartTotal && modEnd < hourEndTotal) {
                                const relEnd = modEnd - hourStartTotal;
                                if (relEnd > 0 && relEnd < 60) midMins.push(relEnd);
                              }
                            }
                          });

                          return midMins;
                        })
                      )).sort((a, b) => a - b);

                      const allShowStartMins: number[] = [];
                      if (hourHasTopShows) {
                        allShowStartMins.push(0);
                      }
                      hourMidMinutes.forEach(m => {
                        if (!allShowStartMins.includes(m)) {
                          allShowStartMins.push(m);
                        }
                      });
                      allShowStartMins.sort((a, b) => a - b);

                      interface SubRowDef {
                        id: string;
                        type: 'show_slot' | 'interstitials';
                        min?: number;
                        startMin?: number;
                        endMin?: number;
                      }

                      const initialSubRowDefs: SubRowDef[] = [];
                      if (allShowStartMins.length === 0) {
                        initialSubRowDefs.push({
                          id: `inters-0-60`,
                          type: 'interstitials',
                          startMin: 0,
                          endMin: 60
                        });
                      } else {
                        let currMin = 0;
                        allShowStartMins.forEach((showMin) => {
                          if (showMin > currMin) {
                            initialSubRowDefs.push({
                              id: `inters-${currMin}-${showMin}`,
                              type: 'interstitials',
                              startMin: currMin,
                              endMin: showMin
                            });
                          }
                          initialSubRowDefs.push({
                            id: `show-slot-${showMin}`,
                            type: 'show_slot',
                            min: showMin
                          });
                          currMin = showMin;
                        });

                        if (currMin < 60) {
                          initialSubRowDefs.push({
                            id: `inters-${currMin}-60`,
                            type: 'interstitials',
                            startMin: currMin,
                            endMin: 60
                          });
                        }
                      }

                      const activeSubRowDefs = initialSubRowDefs.filter(def => {
                        if (def.type === 'show_slot') return true;
                        if (def.type === 'interstitials') {
                          return calendarDays.some(day => {
                            const cellInters = getInterstitialsForDateTime(day, hour);
                            return cellInters.some(s => s.minute >= def.startMin! && s.minute < def.endMin!);
                          });
                        }
                        return false;
                      });

                      if (activeSubRowDefs.length === 0) {
                        activeSubRowDefs.push({
                          id: 'default-empty',
                          type: 'interstitials',
                          startMin: 0,
                          endMin: 60
                        });
                      }

                      return (
                      <div key={hour} className="border-b border-slate-150 last:border-b-0 hover:bg-slate-50/10 transition-colors">
                        {activeSubRowDefs.map((def, defIdx) => {
                          const subRowIntersByDay = calendarDays.map(d => {
                            const dayInters = getInterstitialsForDateTime(d, hour);
                            return dayInters.filter(s => s.minute >= def.startMin! && s.minute < def.endMin!);
                          });

                          const subRowUniqueMins = Array.from(
                            new Set(subRowIntersByDay.flatMap(list => list.map(s => s.minute)))
                          ).sort((a, b) => a - b);

                          return (
                            <div 
                              key={def.id} 
                              className={cn(
                                "grid",
                                calendarTimeframe === 'daily' ? "grid-cols-[52px_1fr]" : "grid-cols-[52px_repeat(7,minmax(0,1fr))]"
                              )}
                            >
                              {/* Hour column */}
                              {defIdx === 0 ? (
                                <div className={cn(
                                  "border-r border-slate-200 flex items-center justify-center bg-slate-50/50 select-none font-black font-mono text-slate-455 uppercase shrink-0",
                                  calendarLayoutMode === 'compact'
                                    ? "p-1 px-0.5 text-xs min-h-[26px]"
                                    : "p-1.5 px-0.5 text-xs min-h-[28px]"
                                )}>
                                  {hour.toString().padStart(2, '0')}:00
                                </div>
                              ) : (
                                <div className={cn(
                                  "border-r border-slate-200 bg-slate-50/50 shrink-0",
                                  calendarLayoutMode === 'compact' ? "min-h-[26px]" : "min-h-[28px]"
                                )} />
                              )}

                              {/* Day slots */}
                              {calendarDays.map((day, dayIdx) => {
                                const cellInterstitials = getInterstitialsForDateTime(day, hour);
                                const dayName = daysOrder[day.getDay()];

                                const cellStartingShows = shows.filter(show => 
                                  show.day === dayName && 
                                  show.startHour === hour &&
                                  matchesShowFilter(show)
                                );

                                const cellContinuingShows = (() => {
                                  if (hour === 0 && cellStartingShows.length === 0) {
                                    const currentDayIdx = daysOrder.indexOf(dayName);
                                    const priorDayIdx = (currentDayIdx - 1 + 7) % 7;
                                    const priorDayName = daysOrder[priorDayIdx];
                                    return shows.filter(show => 
                                      show.day === priorDayName &&
                                      isTimeInShow(show, dayName, 0, 0) &&
                                      matchesShowFilter(show)
                                    );
                                  }
                                  return [];
                                })();

                                const subRowMin = def.type === 'show_slot' ? (def.min || 0) : (def.startMin || 0);
                                const cellShows = shows.filter(show => isTimeInShow(show, dayName, hour, subRowMin) && matchesShowFilter(show));
                                const cellShow = cellShows[0];

                                const renderShowCard = (show: typeof shows[0], isContinuation = false) => {
                                  const startMin = show.startMinute || 0;
                                  const timePrefix = (!isContinuation && startMin !== 0) ? `:${startMin.toString().padStart(2, '0')} ` : '';
                                  const rawTitle = isContinuation ? `(cont.) ${show.name}` : `${timePrefix}${show.name}`;
                                  const displayTitle = calendarLayoutMode === 'compact' 
                                    ? rawTitle 
                                    : addSoftHyphensForFirstLine(rawTitle, 15);

                                  const startHourStr = show.startHour.toString().padStart(2, '0');
                                  const startMinStr = (show.startMinute || 0).toString().padStart(2, '0');
                                  const durH = show.durationHours || 0;
                                  const durM = show.durationMinutes || 0;
                                  const durationStr = `${durH}h${durM > 0 ? ` ${durM}m` : ''}`;
                                  const showSummaryText = `Show: ${show.name}${show.nameShort ? ` (${show.nameShort})` : ''}\nDay: ${show.day}\nStart: ${startHourStr}:${startMinStr}\nDuration: ${durationStr}${show.host ? `\nHost: ${show.host}` : ''}${show.description ? `\nDescription: ${show.description}` : ''}`;

                                  return (
                                    <button 
                                      type="button"
                                      onClick={() => setSelectedCalendarShow(show)}
                                      key={isContinuation ? `show-cont-${show.id}` : `show-start-${show.id}`}
                                      title={showSummaryText}
                                      className={cn(
                                        "text-slate-800 flex flex-col justify-center text-xs font-black tracking-normal leading-tight w-full uppercase mb-0.5 text-left cursor-pointer transition-all hover:translate-x-0.5 border-0 border-b-2 rounded-none shrink-0 py-0.5 px-1 overflow-hidden",
                                        calendarLayoutMode === 'compact' ? "h-[1.75rem] text-xs" : "h-[2.25rem]"
                                      )}
                                      style={{ backgroundColor: getShowShade(show, getSortedShows(shows)).bg, borderBottomColor: getShowShade(show, getSortedShows(shows)).border }}
                                    >
                                      <div 
                                        className={cn(
                                          "font-sans break-words [overflow-wrap:anywhere] [word-break:break-all] [hyphens:manual] [text-overflow:clip] overflow-hidden leading-tight",
                                          calendarLayoutMode === 'compact' ? "max-h-[1.1rem]" : "max-h-[2.1rem]"
                                        )}
                                      >
                                        {displayTitle}
                                      </div>
                                    </button>
                                  );
                                };

                                const renderShowPlaceholder = (key: string) => (
                                  <div 
                                    key={key}
                                    className={cn(
                                      "w-full shrink-0 mb-0.5 pointer-events-none opacity-0 select-none",
                                      calendarLayoutMode === 'compact' ? "h-[1.75rem]" : "h-[2.25rem]"
                                    )}
                                  />
                                );

                                const renderInterstitialCard = (s: Interstitial) => {
                                  const formattedMin = s.minute.toString().padStart(2, '0');
                                  const summaryText = `ID: ${s.id} — ${s.name}\nTime: :${formattedMin}\nFile: ${s.mp3Url || 'None'}\nMode: ${s.type}`;

                                  if (calendarLayoutMode === 'compact') {
                                    return (
                                      <div key={s.id} className="inline-flex items-stretch gap-[2px]">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedCalendarInterstitial(s)}
                                          className={cn(
                                            "inline-flex items-center justify-center p-0.5 px-0.5 rounded font-mono text-xs font-black leading-none shadow-sm border cursor-pointer select-none shrink-0 transition-all hover:scale-105",
                                            !s.enabled 
                                              ? "bg-slate-100 text-slate-400 border-grid-inactive line-through" 
                                              : s.type === InterstitialType.ONE_TIME 
                                                ? "bg-purple-100 text-purple-700 border-grid-onetime font-extrabold" 
                                                : s.type === InterstitialType.BASIC_HOURLY 
                                                  ? "bg-blue-100 text-blue-700 border-grid-hourly" 
                                                  : "bg-orange-100 text-orange-700 border-grid-advanced",
                                            s.assetType === 'script' ? "border-l-2 border-l-blue-500" : "border-l-2 border-l-purple-500"
                                          )}
                                          title={summaryText}
                                        >
                                          {formattedMin}
                                        </button>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={s.id} className="flex items-stretch gap-1 w-full relative">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedCalendarInterstitial(s)}
                                        className={cn(
                                          "flex-1 text-left p-1 rounded font-sans text-xs leading-tight truncate shadow-sm border block cursor-pointer select-none transition-all hover:translate-x-0.5",
                                          !s.enabled 
                                            ? "bg-slate-105 text-slate-400 border-grid-inactive line-through" 
                                            : s.type === InterstitialType.ONE_TIME 
                                              ? "bg-purple-50 text-purple-700 border-grid-onetime font-bold" 
                                              : s.type === InterstitialType.BASIC_HOURLY 
                                                ? "bg-blue-50 text-blue-700 border-grid-hourly" 
                                                : "bg-orange-50 text-orange-700 border-grid-advanced",
                                          s.assetType === 'script' ? "border-l-[4px] border-l-blue-500 rounded-l-sm" : "border-l-[4px] border-l-purple-500 rounded-l-sm"
                                        )}
                                        title={summaryText}
                                      >
                                        <div className="truncate flex items-center gap-0.5">
                                          <span className="font-mono font-black text-xs text-slate-455 shrink-0">:{formattedMin}</span>
                                          <span className="truncate">{s.name}</span>
                                        </div>
                                      </button>
                                    </div>
                                  );
                                };

                                const renderInterstitialPlaceholder = (key: string) => (
                                  <div 
                                    key={key} 
                                    className="flex items-stretch gap-1 w-full relative pointer-events-none opacity-0 select-none shrink-0"
                                  >
                                    <div className="flex-1 text-left p-1 rounded font-sans text-xs leading-tight border border-transparent block">
                                      <div className="flex items-center gap-0.5">
                                        <span className="font-mono font-black text-xs shrink-0">:00</span>
                                        <span className="truncate">Placeholder</span>
                                      </div>
                                    </div>
                                  </div>
                                );

                                const renderCompactInterstitialPlaceholder = (key: string) => (
                                  <div key={key} className="inline-flex items-stretch gap-[2px] opacity-0 pointer-events-none select-none shrink-0">
                                    <div className="inline-flex items-center justify-center p-0.5 px-0.5 rounded font-mono text-xs font-black leading-none border border-transparent">
                                      00
                                    </div>
                                  </div>
                                );

                                const renderSubRowContent = () => {
                                  if (def.type === 'show_slot') {
                                    if (def.min === 0) {
                                      const topStartingShows = cellStartingShows.filter(s => (s.startMinute || 0) === 0);
                                      const topShows = [...topStartingShows, ...cellContinuingShows];
                                      if (topShows.length > 0) {
                                        return topShows.map(s => renderShowCard(s, cellContinuingShows.includes(s)));
                                      }
                                      return renderShowPlaceholder("top-placeholder");
                                    } else {
                                      const showsAtMid = cellStartingShows.filter(s => (s.startMinute || 0) === def.min);
                                      if (showsAtMid.length > 0) {
                                        return showsAtMid.map(s => renderShowCard(s, false));
                                      }
                                      return renderShowPlaceholder(`mid-placeholder-${def.min}`);
                                    }
                                  } else {
                                    if (calendarLayoutMode === 'compact') {
                                      const day = calendarDays[dayIdx];
                                      const startMin = def.startMin ?? 0;
                                      const endMin = def.endMin ?? 60;

                                      const cellIntersInSubRow = cellInterstitials.filter(
                                        s => s.minute >= startMin && s.minute < endMin
                                      );

                                      if (cellIntersInSubRow.length === 0) {
                                        return null;
                                      }

                                      // Gather all interstitials for this day across all hours within this subrow minute range
                                      const dayAllHoursInters = Array.from({ length: 24 }, (_, h) => {
                                        return getInterstitialsForDateTime(day, h).filter(
                                          s => s.minute >= startMin && s.minute < endMin
                                        );
                                      });

                                      const dayUniqueMins = Array.from(
                                        new Set(dayAllHoursInters.flatMap(list => list.map(s => s.minute)))
                                      ).sort((a, b) => a - b);

                                      if (dayUniqueMins.length === 0) {
                                        return null;
                                      }

                                      return dayUniqueMins.flatMap((m) => {
                                        const maxItemsAtMForDay = Math.max(
                                          ...dayAllHoursInters.map(list => list.filter(s => s.minute === m).length)
                                        );
                                        const cellIntersAtM = cellIntersInSubRow.filter(s => s.minute === m);
                                        const items = cellIntersAtM.map(s => renderInterstitialCard(s));
                                        const placeholdersNeeded = maxItemsAtMForDay - cellIntersAtM.length;
                                        const placeholders = Array.from({ length: placeholdersNeeded }, (_, pIdx) =>
                                          renderCompactInterstitialPlaceholder(`placeholder-compact-${m}-${dayIdx}-${pIdx}`)
                                        );
                                        return [...items, ...placeholders];
                                      });
                                    } else {
                                      if (subRowUniqueMins.length === 0) {
                                        return null;
                                      }
                                      return subRowUniqueMins.flatMap((m) => {
                                        const maxItemsAtM = Math.max(...subRowIntersByDay.map(list => list.filter(s => s.minute === m).length));
                                        const dayIntersAtM = subRowIntersByDay[dayIdx].filter(s => s.minute === m);
                                        const items = dayIntersAtM.map(s => renderInterstitialCard(s));
                                        const placeholdersNeeded = maxItemsAtM - dayIntersAtM.length;
                                        const placeholders = Array.from({ length: placeholdersNeeded }, (_, pIdx) => 
                                          renderInterstitialPlaceholder(`placeholder-${m}-${dayIdx}-${pIdx}`)
                                        );
                                        return [...items, ...placeholders];
                                      });
                                    }
                                  }
                                };

                              return (
                                <div 
                                  key={dayIdx} 
                                  style={cellShow ? { backgroundColor: getShowShade(cellShow, getSortedShows(shows)).bg } : undefined}
                                  className={cn(
                                    "p-1 border-r border-slate-205 last:border-r-0 h-auto overflow-visible justify-start relative",
                                    calendarLayoutMode === 'compact' 
                                      ? "min-h-[26px] flex flex-row flex-wrap gap-[1px] items-start content-start" 
                                      : "min-h-[28px] flex flex-col gap-1"
                                  )}
                                >
                                  {renderSubRowContent()}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                      </div>
                      );
                  })}
                </div>
              </div>
            </div>
          ) : viewMode === 'shows' ? (
            renderShowsList()
          ) : (
            <div className="flex flex-col gap-6 overflow-y-auto flex-1 pb-4 pr-1.5 custom-scrollbar min-h-0">
              {interstitialConflicts.length > 0 && (
                <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-2.5 px-3.5 text-amber-800 text-xs italic flex items-start gap-2.5 shadow-2xs shrink-0">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 not-italic" />
                  <div>
                    <span className="font-semibold not-italic text-amber-900">Interstitial Caution: </span>
                    {interstitialConflicts.map(c => c.message).join('; ')}
                  </div>
                </div>
              )}
              {/* Active Interstitials Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px bg-emerald-300/60 dark:bg-emerald-700/50 flex-1"></div>
                <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-widest leading-none">Active Interstitials</span>
                <div className="h-px bg-emerald-300/60 dark:bg-emerald-700/50 flex-1"></div>
              </div>
              
              {(() => {
                const today = now.toISOString().split('T')[0];
                const activeOnes = interstitials.filter(s => {
                  let isExpired = false;
                  if (s.type === InterstitialType.ONE_TIME) {
                    if (s.date && s.time) {
                      const expiry = new Date(`${s.date}T${s.time}:${(s.minute || 0).toString().padStart(2, '0')}:00`);
                      isExpired = expiry < now;
                    } else if (s.date) {
                      isExpired = s.date < today;
                    }
                  } else {
                    isExpired = !!(s.endDate && s.endDate < today);
                  }
                  
                  // Apply active basic search filter
                  if (interstitialFilterQuery) {
                    const q = interstitialFilterQuery.toLowerCase();
                    const summaryText = getInterstitialSummary(s).toLowerCase();
                    const playModeText = (s.type === InterstitialType.ONE_TIME ? "One-Time" : s.type === InterstitialType.BASIC_HOURLY ? "Hourly" : "Advanced").toLowerCase();
                    const matchesFilter = s.name.toLowerCase().includes(q) || 
                                          (s.mp3Url && s.mp3Url.toLowerCase().includes(q)) || 
                                          playModeText.includes(q) || 
                                          summaryText.includes(q);
                    return s.enabled && !isExpired && matchesFilter;
                  }
                  
                  return s.enabled && !isExpired;
                });

                if (activeOnes.length === 0) {
                  return (
                    <div className="py-8 text-center bg-slate-50/50 rounded-lg border border-dashed border-slate-350">
                      <p className="text-xs font-bold text-slate-450 uppercase tracking-widest leading-none">No active triggers</p>
                    </div>
                  );
                }

                return (
                  <div className="border border-grid-active rounded-lg overflow-hidden divide-y divide-grid-active bg-white shadow-sm">
                    {activeOnes
                      .sort((a, b) => a.minute - b.minute)
                      .map((s, idx) => (
                        <div 
                          key={s.id}
                          onClick={() => startEdit(s)}
                          className={cn(
                            "transition-all cursor-pointer group relative flex items-stretch min-h-[64px]",
                            idx % 2 === 0 ? "bg-white" : "bg-slate-205",
                            s.assetType === 'script' ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-purple-500"
                          )}
                        >
                          {/* Left: clock dial, spanning the entire card height, no pixel gap, high contrast lines */}
                          <div className="shrink-0 flex items-center justify-center p-1 bg-slate-50 border-r border-grid-active w-[64px] select-none">
                            <svg
                              width="56"
                              height="56"
                              viewBox="0 0 80 80"
                              className="w-[52px] h-[52px] select-none"
                            >
                              <circle 
                                cx="40" 
                                cy="40" 
                                r="37" 
                                className="fill-white stroke-slate-350 stroke-[2]" 
                              />
                              <text x="40" y="21" textAnchor="middle" className="text-[17px] font-black fill-slate-500">0</text>
                              <text x="66" y="45" textAnchor="middle" className="text-xs font-bold fill-slate-450">15</text>
                              <text x="40" y="69" textAnchor="middle" className="text-xs font-bold fill-slate-450">30</text>
                              <text x="14" y="45" textAnchor="middle" className="text-xs font-bold fill-slate-450">45</text>
                              {Array.from({ length: 12 }).map((_, ticksIdx) => {
                                const angle = ticksIdx * 30;
                                if (ticksIdx % 3 === 0) return null;
                                return (
                                  <line
                                    key={ticksIdx}
                                    x1="40"
                                    y1="5"
                                    x2="40"
                                    y2="9"
                                    transform={`rotate(${angle}, 40, 40)`}
                                    className="stroke-slate-300 stroke-[2]"
                                  />
                                );
                              })}
                              <line
                                x1="40"
                                y1="40"
                                x2="40"
                                y2="11"
                                transform={`rotate(${(s.minute || 0) * 6}, 40, 40)`}
                                  stroke="#2563eb"
                                strokeWidth="4"
                                strokeLinecap="round"
                              />
                              <circle cx="40" cy="40" r="5" className="fill-slate-800" />
                              <circle cx="40" cy="40" r="1.5" className="fill-white" />
                            </svg>
                          </div>

                          {/* Right: details area with comfortable inner padding */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between py-2 pr-3 pl-3.5">
                            {/* Title of schedule first, category tag on the right attached to details tag */}
                            <div className="flex justify-between items-center mb-1 gap-2">
                              <span className="text-base font-black text-slate-800 truncate leading-none">
                                {s.name}
                              </span>
                              <div className="text-xs font-bold uppercase tracking-tighter shrink-0 text-right flex items-center gap-1.5 leading-none">
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-xs uppercase font-bold tracking-tighter leading-none inline-block border border-slate-300",
                                  s.type === InterstitialType.ONE_TIME ? "bg-purple-100 text-purple-700 font-black border-purple-300" :
                                  s.type === InterstitialType.BASIC_HOURLY ? "bg-blue-100 text-blue-700 border-blue-200" :
                                  "bg-orange-100 text-orange-700 border-orange-200"
                                )}>
                                  {s.type === InterstitialType.ONE_TIME ? "One-Time" : s.type === InterstitialType.BASIC_HOURLY ? "Hourly" : "Advanced"}
                                </span>
                                <span className="text-slate-550 font-bold">
                                  {getInterstitialSummary(s)}
                                </span>
                              </div>
                            </div>

                            {/* Bottom Row of metadata & view actions */}
                            <div className="flex justify-between items-center gap-4">
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold uppercase tracking-tighter">
                                  <span>:{s.minute.toString().padStart(2, '0')}m</span>
                                </div>

                                <div className="flex items-center gap-1.5 underline-offset-4">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(s);
                                    }}
                                    className="flex items-center gap-1 py-0.5 px-2 hover:bg-blue-600 hover:text-white bg-white border border-blue-300 rounded text-blue-700 transition-all shadow-sm group/btn cursor-pointer"
                                    title="View or Edit Interstitial"
                                  >
                                    <FileText className="w-2.5 h-2.5" />
                                    <span className="text-xs font-black uppercase">View/Edit</span>
                                  </button>
                                  <button 
                                    onClick={(e) => duplicate(s, e)}
                                    className="flex items-center gap-1 py-0.5 px-2 hover:bg-blue-50 bg-white border border-slate-350 rounded text-blue-700 transition-all shadow-sm cursor-pointer"
                                    title="Copy Interstitial"
                                  >
                                    <Copy className="w-2.5 h-2.5" />
                                    <span className="text-xs font-black uppercase">Copy</span>
                                  </button>
                                </div>
                              </div>

                              {/* MP3 Status Info */}
                              {(() => {
                                 const status = getMP3Status(s.mp3Url);
                                 const isScript = s.assetType === 'script';
                                 const isVerified = isScript ? status.exists : (status.exists && status.valid);
                                 return (
                                   <div className="flex items-center gap-1.5 min-w-0 overflow-hidden text-right justify-end flex-1">
                                     <button 
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         if (isVerified) {
                                           if (isScript) {
                                             setPreviewScriptFile(s.mp3Url);
                                           } else {
                                             togglePreview(s.mp3Url, e);
                                           }
                                         }
                                       }}
                                       disabled={!isVerified}
                                       className={cn(
                                         "flex items-center gap-2 py-0.5 px-3 rounded border shadow-sm transition-all group/play min-w-0 cursor-pointer w-full justify-start",
                                         !isScript && previewUrl === s.mp3Url 
                                           ? "bg-slate-900 text-white border-slate-900" 
                                           : isVerified
                                             ? "bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                                             : "bg-slate-50 text-slate-400 border-slate-300 cursor-not-allowed"
                                       )}
                                     >
                                       <div className="flex items-center gap-1.5 min-w-0 overflow-hidden flex-1 text-left order-3">
                                         {isScript ? (
                                           <FileText className={cn(
                                             "w-2.5 h-2.5 shrink-0", 
                                             isVerified ? "text-slate-400 group-hover/play:text-blue-500" : "text-slate-300"
                                           )} />
                                         ) : (
                                           <Music className={cn(
                                             "w-2.5 h-2.5 shrink-0", 
                                             previewUrl === s.mp3Url ? "text-slate-400" : 
                                             isVerified ? "text-slate-400 group-hover/play:text-blue-500" : "text-slate-300"
                                           )} />
                                         )}
                                         <span className={cn(
                                           "text-xs font-bold uppercase truncate",
                                           !isScript && previewUrl === s.mp3Url ? "text-white" :
                                           !status.exists ? "text-red-600 font-extrabold" : !status.valid && !isScript ? "text-orange-600 font-extrabold" : "text-slate-600 group-hover/play:text-blue-800"
                                         )}>
                                           {!status.exists ? "File not found." : !status.valid && !isScript ? "File not mp3." : status.filename}
                                         </span>
                                       </div>

                                       <div className={cn(
                                         "h-3 w-px shrink-0 mx-0.5",
                                         !isScript && previewUrl === s.mp3Url ? "bg-slate-700" : isVerified ? "bg-slate-300 group-hover/play:bg-blue-300" : "bg-slate-300"
                                       )} />

                                       <div className="flex items-center gap-1.5 shrink-0 order-[-1]">
                                         {isScript ? (
                                           isVerified ? (
                                             <Eye className="w-2.5 h-2.5 fill-none" />
                                           ) : (
                                             <XCircle className="w-2.5 h-2.5" />
                                           )
                                         ) : (
                                           previewUrl === s.mp3Url ? (
                                             <Square className="w-2.5 h-2.5 fill-current" />
                                           ) : isVerified ? (
                                             <Play className="w-2.5 h-2.5 fill-current" />
                                           ) : (
                                             <XCircle className="w-2.5 h-2.5" />
                                           )
                                         )}
                                         <span className="text-xs font-black uppercase whitespace-nowrap">
                                           {isScript ? (isVerified ? 'Preview' : 'Locked') : (previewUrl === s.mp3Url ? 'Stop' : isVerified ? 'Preview' : 'Locked')}
                                         </span>
                                       </div>
                                     </button>
                                   </div>
                                 );
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                );
              })()}
            </div>

            {/* Inactive Interstitials Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px bg-slate-300 flex-1"></div>
                <span className="text-xs font-black text-slate-600 uppercase tracking-widest leading-none">Inactive Interstitials</span>
                <div className="h-px bg-slate-300 flex-1"></div>
              </div>

              {(() => {
                const today = now.toISOString().split('T')[0];
                const inactiveOnes = interstitials.filter(s => {
                  let isExpired = false;
                  if (s.type === InterstitialType.ONE_TIME) {
                    if (s.date && s.time) {
                      const expiry = new Date(`${s.date}T${s.time}:${(s.minute || 0).toString().padStart(2, '0')}:00`);
                      isExpired = expiry < now;
                    } else if (s.date) {
                      isExpired = s.date < today;
                    }
                  } else {
                    isExpired = !!(s.endDate && s.endDate < today);
                  }

                  // Apply basic text filter search
                  if (interstitialFilterQuery) {
                    const q = interstitialFilterQuery.toLowerCase();
                    const summaryText = getInterstitialSummary(s).toLowerCase();
                    const playModeText = (s.type === InterstitialType.ONE_TIME ? "One-Time" : s.type === InterstitialType.BASIC_HOURLY ? "Hourly" : "Advanced").toLowerCase();
                    const matchesFilter = s.name.toLowerCase().includes(q) || 
                                          (s.mp3Url && s.mp3Url.toLowerCase().includes(q)) || 
                                          playModeText.includes(q) || 
                                          summaryText.includes(q);
                    return (!s.enabled || isExpired) && matchesFilter;
                  }

                  return !s.enabled || isExpired;
                });

                if (inactiveOnes.length === 0) {
                  return (
                    <div className="py-4 text-center">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No inactive items</p>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col gap-2">
                    <div className="border border-grid-inactive rounded-lg overflow-hidden divide-y divide-grid-inactive bg-slate-50/10 shadow-sm">
                      {inactiveOnes
                        .sort((a, b) => parseInt(b.id) - parseInt(a.id))
                        .slice(0, 5)
                        .map((s, idx) => {
                          let isExpired = false;
                          if (s.type === InterstitialType.ONE_TIME) {
                            if (s.date && s.time) {
                              const expiry = new Date(`${s.date}T${s.time}:${(s.minute || 0).toString().padStart(2, '0')}:00`);
                              isExpired = expiry < now;
                            } else if (s.date) {
                              isExpired = s.date < today;
                            }
                          } else {
                            isExpired = !!(s.endDate && s.endDate < today);
                          }
                          return (
                            <div 
                              key={s.id}
                              onClick={() => startEdit(s)}
                              className={cn(
                                "transition-all cursor-pointer group relative flex items-stretch min-h-[64px]",
                                idx % 2 === 0 ? "bg-white" : "bg-slate-205",
                                s.assetType === 'script' ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-purple-500"
                              )}
                            >
                              {/* Left: Clock Dial Pointer, no pixel gap, increased line contrast */}
                              <div className="shrink-0 flex items-center justify-center p-1 bg-slate-100/55 border-r border-grid-inactive w-[64px] select-none">
                                <svg
                                  width="56"
                                  height="56"
                                  viewBox="0 0 80 80"
                                  className="w-[52px] h-[52px] select-none opacity-80"
                                >
                                  <circle 
                                    cx="40" 
                                    cy="40" 
                                    r="37" 
                                    className="fill-white stroke-slate-350 stroke-[2]" 
                                  />
                                  <text x="40" y="21" textAnchor="middle" className="text-[17px] font-black fill-slate-400">0</text>
                                  <text x="66" y="45" textAnchor="middle" className="text-xs font-bold fill-slate-355">15</text>
                                  <text x="40" y="69" textAnchor="middle" className="text-xs font-bold fill-slate-355">30</text>
                                  <text x="14" y="45" textAnchor="middle" className="text-xs font-bold fill-slate-355">45</text>
                                  {Array.from({ length: 12 }).map((_, ticksIdx) => {
                                    const angle = ticksIdx * 30;
                                    if (ticksIdx % 3 === 0) return null;
                                    return (
                                      <line
                                        key={ticksIdx}
                                        x1="40"
                                        y1="5"
                                        x2="40"
                                        y2="9"
                                        transform={`rotate(${angle}, 40, 40)`}
                                        className="stroke-slate-250 stroke-[2]"
                                      />
                                    );
                                  })}
                                  <line
                                    x1="40"
                                    y1="40"
                                    x2="40"
                                    y2="11"
                                    transform={`rotate(${(s.minute || 0) * 6}, 40, 40)`}
                                    stroke="#475569"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                  />
                                  <circle cx="40" cy="40" r="5" className="fill-slate-600" />
                                  <circle cx="40" cy="40" r="1.5" className="fill-white" />
                                </svg>
                              </div>

                              {/* Right: details area with comfortable inner padding */}
                              <div className="flex-1 min-w-0 flex flex-col justify-between py-2 pr-3 pl-3.5 opacity-90">
                                {/* Title of schedule first, category tag on the right attached to details tag */}
                                <div className="flex justify-between items-center mb-1 gap-2">
                                  <span className="text-base font-black text-slate-750 truncate leading-none">
                                    {s.name}
                                  </span>
                                  <div className="text-xs font-bold uppercase tracking-tighter shrink-0 text-right flex items-center gap-1.5 leading-none">
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded text-xs uppercase font-bold tracking-tighter leading-none inline-block opacity-75 border border-slate-300",
                                      s.type === InterstitialType.ONE_TIME ? "bg-purple-100 text-purple-700 font-black border-purple-200" :
                                      s.type === InterstitialType.BASIC_HOURLY ? "bg-blue-100 text-blue-700 border-blue-200" :
                                      "bg-orange-100 text-orange-700 border-orange-200"
                                    )}>
                                      {s.type === InterstitialType.ONE_TIME ? "One-Time" : s.type === InterstitialType.BASIC_HOURLY ? "Hourly" : "Advanced"}
                                    </span>
                                    <span className="text-slate-500 font-bold">
                                      {getInterstitialSummary(s)} • {isExpired ? <span className="text-red-650 font-black">EXPIRED</span> : 'SUSPENDED'}
                                    </span>
                                  </div>
                                </div>

                                {/* Bottom row of metadata & view actions */}
                                <div className="flex justify-between items-center gap-4">
                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold uppercase tracking-tighter">
                                      <span>:{s.minute.toString().padStart(2, '0')}m</span>
                                    </div>

                                    <div className="flex items-center gap-1.5 underline-offset-4">
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          startEdit(s);
                                        }}
                                        className="flex items-center gap-1 py-0.5 px-2 hover:bg-slate-300 bg-white border border-slate-350 rounded text-slate-700 transition-all shadow-sm cursor-pointer"
                                        title="View or Edit Interstitial"
                                      >
                                        <FileText className="w-2.5 h-2.5" />
                                        <span className="text-xs font-black uppercase">View/Edit</span>
                                      </button>
                                      <button 
                                        onClick={(e) => duplicate(s, e)}
                                        className="flex items-center gap-1 py-0.5 px-2 hover:bg-white bg-slate-100/50 border border-slate-350 rounded text-slate-700 transition-all shadow-sm cursor-pointer"
                                        title="Copy Interstitial"
                                      >
                                        <Copy className="w-2.5 h-2.5" />
                                        <span className="text-xs font-black uppercase">Copy</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* MP3 Status Info Inactive */}
                                  {(() => {
                                    const status = getMP3Status(s.mp3Url);
                                    const isScript = s.assetType === 'script';
                                    const isVerified = isScript ? status.exists : (status.exists && status.valid);
                                    return (
                                      <div className="flex items-center gap-1.5 overflow-hidden text-right justify-end flex-1 opacity-90">
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (isVerified) {
                                              if (isScript) {
                                                setPreviewScriptFile(s.mp3Url);
                                              } else {
                                                togglePreview(s.mp3Url, e);
                                              }
                                            }
                                          }}
                                          disabled={!isVerified}
                                          className={cn(
                                            "flex items-center gap-2 py-0.5 px-3 rounded border shadow-sm transition-all group/play min-w-0 cursor-pointer w-full justify-start",
                                            !isScript && previewUrl === s.mp3Url 
                                              ? "bg-slate-900 text-white border-slate-900 opacity-100" 
                                              : isVerified
                                                ? "bg-white text-slate-700 border-slate-350 hover:bg-slate-50"
                                                : "bg-slate-50 text-slate-400 border-slate-300 cursor-not-allowed"
                                          )}
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden font-bold flex-1 text-left order-3">
                                            {isScript ? (
                                              <FileText className={cn(
                                                "w-2.5 h-2.5 shrink-0", 
                                                isVerified ? "text-slate-450 group-hover/play:text-slate-600" : "text-slate-300"
                                              )} />
                                            ) : (
                                              <Music className={cn(
                                                "w-2.5 h-2.5 shrink-0", 
                                                previewUrl === s.mp3Url ? "text-slate-400" : 
                                                isVerified ? "text-slate-450 group-hover/play:text-slate-600" : "text-slate-300"
                                              )} />
                                            )}
                                            <span className={cn(
                                              "text-xs font-bold uppercase truncate",
                                              !isScript && previewUrl === s.mp3Url ? "text-white" :
                                              !status.exists ? "text-red-600 font-extrabold" : !status.valid && !isScript ? "text-orange-600 font-extrabold" : "text-slate-600 group-hover/play:text-slate-800"
                                            )}>
                                              {!status.exists ? "File not found." : !status.valid && !isScript ? "File not mp3." : status.filename}
                                            </span>
                                          </div>

                                          <div className={cn(
                                            "h-3 w-px shrink-0 mx-0.5",
                                            !isScript && previewUrl === s.mp3Url ? "bg-slate-700" : isVerified ? "bg-slate-300 group-hover/play:bg-slate-400" : "bg-slate-355"
                                          )} />

                                          <div className="flex items-center gap-1.5 shrink-0 order-[-1]">
                                            {isScript ? (
                                              isVerified ? (
                                                <Eye className="w-2.5 h-2.5 fill-none" />
                                              ) : (
                                                <XCircle className="w-2.5 h-2.5" />
                                              )
                                            ) : (
                                              previewUrl === s.mp3Url ? (
                                                <Square className="w-2.5 h-2.5 fill-current" />
                                              ) : isVerified ? (
                                                <Play className="w-2.5 h-2.5 fill-current" />
                                              ) : (
                                                <XCircle className="w-2.5 h-2.5" />
                                              )
                                            )}
                                            <span className="text-xs font-black uppercase whitespace-nowrap">
                                              {isScript ? (isVerified ? 'Preview' : 'Locked') : (previewUrl === s.mp3Url ? 'Stop' : isVerified ? 'Preview' : 'Locked')}
                                            </span>
                                          </div>
                                        </button>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    {inactiveOnes.length > 5 && (
                      <p className="text-xs text-center text-slate-400 font-bold uppercase tracking-tighter pt-1">
                        + {inactiveOnes.length - 5} more hidden inactive items
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
          )}
        </div>
      ) : (
        <div className={cn(
          "bg-white rounded-lg border border-slate-300 flex flex-col h-full overflow-hidden shadow-md transition-all duration-300",
          !formData.enabled && "bg-orange-50/40 border-orange-500 border-2 shadow-[0_0_12px_rgba(249,115,22,0.15)] ring-1 ring-orange-500"
        )}>
          <div className="p-4 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Basic Info */}
              <div className="space-y-4 md:sticky md:top-0 md:self-start">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  {/* Spanning clock dial inside basic info (Moved to left) */}
                  <div className="sm:col-span-5 md:col-span-4 flex items-center justify-center select-none">
                    <div className="flex flex-col items-center justify-center p-[1px] bg-slate-50 border border-slate-200/80 rounded-xl shadow-xs hover:bg-slate-100/50 transition-colors w-[114px] h-[114px] shrink-0">
                      <svg
                        width="120"
                        height="120"
                        viewBox="0 0 80 80"
                        className="cursor-pointer select-none active:brightness-95 transition-all w-[112px] h-[112px]"
                        onMouseDown={e => {
                          setIsDraggingClock(true);
                          handleClockInteraction(e);
                        }}
                        onMouseMove={e => {
                          if (isDraggingClock) {
                            handleClockInteraction(e);
                          }
                        }}
                        onMouseUp={() => setIsDraggingClock(false)}
                        onMouseLeave={() => setIsDraggingClock(false)}
                        onTouchStart={e => {
                          setIsDraggingClock(true);
                          handleClockInteraction(e);
                        }}
                        onTouchMove={e => {
                          if (isDraggingClock) {
                            handleClockInteraction(e);
                          }
                        }}
                        onTouchEnd={() => setIsDraggingClock(false)}
                      >
                      {/* Clock Face base */}
                      <circle 
                        cx="40" 
                        cy="40" 
                        r="38" 
                        className={cn(
                          "fill-white stroke-slate-200 stroke-[2]",
                          isDraggingClock && "stroke-blue-500 stroke-[2.5]"
                        )} 
                      />
                      
                      {/* Main numbers for orientation */}
                      <text x="40" y="18" textAnchor="middle" className={cn("text-xs font-black fill-slate-400 select-none", isDraggingClock && "fill-slate-600")}>0</text>
                      <text x="67" y="44" textAnchor="middle" className="text-[10px] font-bold fill-slate-350 select-none">15</text>
                      <text x="40" y="71" textAnchor="middle" className="text-[10px] font-bold fill-slate-350 select-none">30</text>
                      <text x="13" y="44" textAnchor="middle" className="text-[10px] font-bold fill-slate-350 select-none">45</text>
                      
                      {/* 5-minute ticks */}
                      {Array.from({ length: 12 }).map((_, idx) => {
                        const angle = idx * 30;
                        if (idx % 3 === 0) return null;
                        return (
                          <line
                            key={idx}
                            x1="40"
                            y1="5"
                            x2="40"
                            y2="8"
                            transform={`rotate(${angle}, 40, 40)`}
                            className={cn(
                              "stroke-slate-300 stroke-[2]",
                              isDraggingClock && "stroke-slate-400"
                            )}
                          />
                        );
                      })}
                      
                      {/* Moving minute hand */}
                      <line
                        x1="40"
                        y1="40"
                        x2="40"
                        y2="10"
                        transform={`rotate(${(formData.minute || 0) * 6}, 40, 40)`}
                        stroke={isDraggingClock ? "#1e3a8a" : "#2563eb"}
                        strokeWidth={isDraggingClock ? 5 : 3.5}
                        strokeLinecap="round"
                      />
                      
                      {/* Center cap */}
                      <circle cx="40" cy="40" r="4.5" className={cn("fill-slate-800", isDraggingClock && "fill-slate-950")} />
                      <circle cx="40" cy="40" r="1.5" className="fill-white" />
                      </svg>
                    </div>
                  </div>

                  {/* Fields Block (Moved to right) */}
                  <div className="sm:col-span-7 md:col-span-8 flex flex-col justify-start gap-2">
                    {/* Horizontal row aligning Editor Title/ID and Status/Buttons on Left */}
                    <div className="flex items-center gap-3 pb-1.5 border-b border-slate-300">
                      {/* Editor Header Indicator */}
                      <div className="bg-blue-600 p-1.5 rounded shrink-0 flex items-center justify-center w-8 h-8">
                        <FileText className="w-4 h-4 text-white" />
                      </div>
                      
                      <div className="flex items-center gap-6 min-w-0">
                        {/* Column 1: Editor/ID Label and ID Value */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-black text-slate-700 uppercase tracking-widest select-none leading-none">Editor</span>
                          <p className="text-xs text-slate-400 font-black truncate leading-none mt-1 font-mono">
                            {editingId === 'new' ? 'New Profile' : `${formData.id}`}
                          </p>
                        </div>
                        
                        {/* Column 2: Status Label and Active/Suspended Buttons */}
                        <div className="flex flex-col gap-0.5">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest block select-none leading-none">Status</label>
                          <div className="flex items-center">
                            <div className="flex items-center -space-x-px shrink-0">
                              <button
                                type="button"
                                onClick={() => setFormData({...formData, enabled: true})}
                                className={cn(
                                  "px-2 py-0.5 text-xs font-black uppercase transition-all select-none cursor-pointer rounded-l rounded-r-none h-6 flex items-center justify-center leading-none border",
                                  formData.enabled 
                                    ? "bg-emerald-700 border-emerald-700 text-white shadow-xs z-10" 
                                    : "bg-slate-50 border-slate-300 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                )}
                              >
                                Active
                              </button>
                              <button
                                type="button"
                                onClick={() => setFormData({...formData, enabled: false})}
                                className={cn(
                                  "px-2 py-0.5 text-xs font-black uppercase transition-all select-none cursor-pointer rounded-r rounded-l-none h-6 flex items-center justify-center leading-none border",
                                  !formData.enabled 
                                    ? "bg-orange-600 border-orange-600 text-white shadow-xs z-10" 
                                    : "bg-slate-50 border-slate-300 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                )}
                              >
                                Suspended
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                     {/* Type and Play Time rows */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Interstitial Type */}
                      <div className="space-y-1">
                        <label className="text-xs/none font-black text-slate-400 uppercase tracking-widest block select-none">type</label>
                        {!isNew ? (
                          <div className="px-3 py-2 rounded-lg border border-slate-350 bg-slate-50 text-xs font-bold text-slate-700 w-full select-none h-10 flex items-center shadow-xs">
                            {formData.type === InterstitialType.ONE_TIME && "One-Time Play"}
                            {formData.type === InterstitialType.BASIC_HOURLY && "Repeating Hourly"}
                            {formData.type === InterstitialType.ADVANCED && "Advanced Calendar"}
                          </div>
                        ) : (
                          <select 
                            value={formData.type} 
                            onChange={e => setFormData({...formData, type: e.target.value as InterstitialType})}
                            className="px-3 py-2 rounded-lg border text-xs font-black outline-none transition-all w-full bg-white border-slate-350 text-slate-700 hover:border-blue-400 cursor-pointer h-10 shadow-xs"
                          >
                            <option value={InterstitialType.ONE_TIME}>One-Time Play</option>
                            <option value={InterstitialType.BASIC_HOURLY}>Repeating Hourly</option>
                            <option value={InterstitialType.ADVANCED}>Advanced Calendar</option>
                          </select>
                        )}
                      </div>

                      {/* Play Time */}
                      <div className="space-y-1">
                        <label className="text-xs/none font-black text-slate-400 uppercase tracking-widest block select-none">Play Time</label>
                        <div className="flex items-center gap-2">
                          {/* Formatted numerical indicator - e.g. :15 m */}
                          <div className="relative w-16 shrink-0">
                            <input 
                              type="text"
                              value={`:${(formData.minute || 0).toString().padStart(2, '0')}`}
                              onChange={e => {
                                const clean = e.target.value.replace(/\D/g, '');
                                const parsed = parseInt(clean, 10);
                                const val = isNaN(parsed) ? 0 : Math.max(0, Math.min(59, parsed));
                                setFormData({...formData, minute: val});
                              }}
                              className="w-full text-center text-blue-600 bg-white pl-1 pr-5 py-1.5 border border-slate-350 rounded-lg font-black outline-none focus:ring-1 focus:ring-blue-500 text-xs h-10 shadow-xs"
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 pointer-events-none select-none">m</span>
                          </div>

                          {/* Doubled Arrow Controls */}
                          <div className="flex flex-col -space-y-px shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const val = ((formData.minute || 0) + 1) % 65;
                                const wrapped = val >= 60 ? 0 : val;
                                setFormData({...formData, minute: wrapped});
                              }}
                              className="bg-slate-100 hover:bg-slate-200 border border-slate-350 rounded-t rounded-b-none text-slate-700 h-4 w-8 flex items-center justify-center cursor-pointer transition-colors active:bg-slate-300 shadow-xs"
                              title="Increase Minute"
                            >
                              <ChevronUp className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const val = ((formData.minute || 0) - 1 + 60) % 60;
                                setFormData({...formData, minute: val});
                              }}
                              className="bg-slate-100 hover:bg-slate-200 border border-slate-350 rounded-b rounded-t-none text-slate-700 h-4 w-8 flex items-center justify-center cursor-pointer transition-colors active:bg-slate-300 shadow-xs"
                              title="Decrease Minute"
                            >
                              <ChevronDown className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                            {/* Group Interstitial Name and MP3 File Group to remove any whitespace/margin between them */}
                <div className="space-y-0">
                  {/* Interstitial Name */}
                  <div className="space-y-0">
                    <div className="bg-blue-600 text-white text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-t-lg select-none">
                      Interstitial Name
                    </div>
                    <input 
                      type="text" 
                      value={formData.name || ''} 
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="Identify the interstitial..."
                      className={cn(
                        "w-full px-3 py-2 rounded-b-none border-x border-b border-t border-slate-350 text-sm font-black text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none",
                        !formData.name && editingId ? "border-red-400" : ""
                      )}
                    />
                    {!formData.name && <p className="text-xs text-red-500 font-bold uppercase tracking-tighter mt-1">Name is required</p>}
                  </div>

                  {/* File Group with Blue Header */}
                  <div className="space-y-0 mt-0">
                    <div className="bg-blue-600 text-white text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-t-none select-none">
                      {formData.assetType === 'script' ? 'Script / Image File' : 'File'}
                    </div>
                    <div className="p-3 bg-slate-50 border-x border-b border-slate-350 rounded-b-lg space-y-3 shadow-xs">
                      {/* MP3 Row */}
                      <div className="leading-tight select-none">
                        {formData.mp3Url ? (
                          <span className="text-sm font-mono font-bold text-slate-850 break-all" title={getFilenameFromUrlOrPath(formData.mp3Url)}>
                            {getFilenameFromUrlOrPath(formData.mp3Url)}
                            {formData.assetType !== 'script' && formData.duration && ` (${formData.duration})`}
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-slate-400 italic">None Selected</span>
                        )}
                      </div>

                      {/* Display metadata inline underneath the filename if available */}
                      {formData.mp3Url && formData.assetType !== 'script' && (() => {
                        const filename = getFilenameFromUrlOrPath(formData.mp3Url);
                        const meta = metadataCache[filename];
                        if (meta && (meta.title || meta.artist || meta.album)) {
                          const parts = [meta.title, meta.artist, meta.album].filter(Boolean);
                          return (
                            <div className="text-xs text-slate-600 font-bold italic select-none">
                              Metadata: <span className="text-slate-800 font-semibold">{parts.join(", ")}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Actions Row */}
                      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-350">
                        <div className="flex items-center gap-2 min-w-0">
                          {formData.mp3Url ? (
                            <>
                              {(() => {
                                const status = getMP3Status(formData.mp3Url);
                                const isScript = formData.assetType === 'script';
                                const isVerified = status.exists && (isScript || status.valid);
                                return (
                                  <>
                                    {isVerified ? (
                                      <CheckCircle className="w-4 h-4 text-emerald-700 dark:text-emerald-400 stroke-[2.5] shrink-0" title={isScript ? "Script Verified" : "File Verified"} />
                                    ) : !status.exists ? (
                                      <AlertCircle className="w-4 h-4 text-red-500 stroke-[2.5] shrink-0 animate-pulse" title="File not found" />
                                    ) : (
                                      <Music className="w-4 h-4 text-orange-400 shrink-0" title="File not mp3" />
                                    )}
                                    
                                    <div className="flex flex-wrap items-center gap-x-2 text-xs">
                                      {!status.exists && (
                                        <span className="font-black text-red-500 uppercase">
                                          File not found.
                                        </span>
                                      )}
                                      {!isScript && !status.valid && status.exists && (
                                        <span className="font-black text-orange-500 uppercase">
                                          File not mp3.
                                        </span>
                                      )}
                                      {isVerified && (
                                        <span className="font-black text-emerald-700 dark:text-emerald-400 uppercase">
                                          {isScript ? "Script / Image Verified" : "File Verified"}
                                        </span>
                                      )}
                                    </div>

                                    {isVerified && (
                                      isScript ? (
                                        <button
                                          type="button"
                                          onClick={() => setPreviewScriptFile(formData.mp3Url)}
                                          className="flex items-center gap-1.5 text-xs font-black uppercase px-2.5 py-1 rounded border border-slate-300 shadow-xs bg-white text-blue-600 hover:bg-slate-50 transition-all cursor-pointer select-none h-8"
                                        >
                                          <FileText className="w-3.5 h-3.5 shrink-0" />
                                          Preview
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => togglePreview(formData.mp3Url)}
                                          className={cn(
                                            "flex items-center gap-1 text-xs font-black uppercase px-2.5 py-1 rounded border shadow-xs transition-all cursor-pointer select-none h-8",
                                            previewUrl === formData.mp3Url 
                                              ? "bg-slate-900 text-white border-slate-900" 
                                              : "bg-white text-blue-600 border-slate-300 hover:bg-slate-50"
                                          )}
                                        >
                                          {previewUrl === formData.mp3Url ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
                                          {previewUrl === formData.mp3Url ? 'Stop' : 'Preview'}
                                        </button>
                                      )
                                    )}
                                  </>
                                );
                              })()}
                            </>
                          ) : (
                            <p className="text-xs text-slate-400 font-medium">
                              Please select a file path from the library
                            </p>
                          )}
                        </div>
                        
                        <button 
                          type="button"
                          onClick={() => setIsPickerOpen(true)}
                          className="px-3 py-1.5 bg-slate-900 border border-slate-900 hover:bg-slate-800 text-white rounded text-xs font-black uppercase flex items-center justify-center gap-2 transition-all shadow-sm shrink-0 cursor-pointer select-none h-8"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          Choose
                        </button>
                      </div>
                    </div>
                  </div>

                  {formData.assetType === 'script' && (
                    <div className="space-y-0 mt-3">
                      <div className="bg-blue-600 text-white text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-t-lg select-none">
                        Approximate Read Time
                      </div>
                      <div className="p-3 bg-slate-50 border-x border-b border-slate-350 rounded-b-lg flex items-center justify-between gap-3 shadow-xs">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">
                          Read Time (m:ss):
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-slate-500 font-mono select-none">~</span>
                          <input
                            type="text"
                            placeholder="1:30"
                            value={(formData.approximateReadTime || '').replace(/^~/, '')}
                            onChange={e => setFormData({ ...formData, approximateReadTime: e.target.value })}
                            className="w-24 px-2 py-1 bg-white border border-slate-350 rounded text-xs font-bold font-mono text-slate-850 outline-none focus:ring-1 focus:ring-blue-500 h-7"
                          />
                          <span className="text-[11px] text-slate-400 font-medium italic">(m:ss)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column: Date/Advanced Rules */}
              <div className="space-y-4 md:sticky md:top-0 md:self-start">
                {/* Copied Top Action Buttons */}
                <div className="flex items-center justify-end gap-2 pb-4 border-b border-slate-300 select-none">
                  <button 
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-350 rounded text-xs font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest transition-all cursor-pointer bg-white"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel
                  </button>

                  <button 
                    type="button"
                    onClick={saveEdit}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md shadow-blue-100 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Save
                  </button>
                </div>

                {formData.type === InterstitialType.ONE_TIME && (
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 space-y-4">
                    <h4 className="text-xs font-black text-purple-700 uppercase tracking-widest">Static Play Logic</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-purple-400 uppercase">Target Date</label>
                        <input 
                          type="date" 
                          value={formData.date || ''} 
                          onChange={e => setFormData({...formData, date: e.target.value})} 
                          className={cn(
                            "w-full px-2 py-1.5 border rounded text-xs font-bold text-slate-850 outline-none [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer",
                            !formData.date && editingId ? "border-red-300 bg-red-50" : "border-purple-200"
                          )} 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-purple-400 uppercase">Target Hour</label>
                        <select 
                          value={formData.time || ''} 
                          onChange={e => setFormData({...formData, time: e.target.value})} 
                          className={cn(
                            "w-full px-2 py-1.5 border rounded text-xs outline-none bg-white font-bold",
                            !formData.time && editingId ? "border-red-300 bg-red-50" : "border-purple-200"
                          )}
                        >
                          <option value="">Select Hour</option>
                          {Array.from({ length: 24 }).map((_, i) => {
                            const val = i.toString().padStart(2, '0');
                            return <option key={val} value={val}>{val}:00</option>;
                          })}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {formData.type === InterstitialType.ADVANCED && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-4">
                    <div className="grid grid-cols-2 gap-3 pb-3 border-b border-blue-100/50">
                      <div className="space-y-1 text-left">
                        <label className="text-xs font-bold text-blue-400 uppercase">Effective Start</label>
                        <input 
                          type="date" 
                          value={formData.startDate || ''} 
                          onChange={e => setFormData({...formData, startDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-blue-200 rounded text-xs outline-none bg-white font-bold text-slate-850 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                        />
                      </div>
                      <div className="space-y-1 text-left">
                        <label className="text-xs font-bold text-blue-400 uppercase">Expiration Date</label>
                        <input 
                          type="date" 
                          value={formData.endDate || ''} 
                          onChange={e => setFormData({...formData, endDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-blue-200 rounded text-xs outline-none bg-white font-bold text-slate-850 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                        />
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">* Blank = No stop date</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-black text-blue-700 uppercase tracking-widest">Weekly Interstitial</h4>
                      <div className="flex gap-2 text-xs font-black uppercase text-slate-500">
                        <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-700 dark:text-emerald-400 stroke-[3.5] grid-weekly-check-icon" /> Active</span>
                        <span className="flex items-center gap-1.5"><X className="w-3 h-3 text-red-600 dark:text-red-400 stroke-[3.5] grid-weekly-x-icon" /> Inactive</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-blue-200/80 dark:border-slate-700/60 rounded-lg bg-white dark:bg-slate-900 shadow-xs grid-weekly-table-container">
                      <table className="w-full border-collapse table-fixed grid-weekly-table">
                        <thead>
                          <tr className="bg-blue-50/60 dark:bg-slate-800/60 border-b border-blue-200/80 dark:border-slate-700/60">
                            <th className="p-1 w-14 text-center border-r border-blue-200/80 dark:border-slate-700/60">
                              <button 
                                onClick={() => {
                                  const currentRules = formData.gridRules || [];
                                  const allKeys = Array.from({ length: 7 }, (_, d) => 
                                    Array.from({ length: 24 }, (_, h) => `${d}-${h}`)
                                  ).flat();
                                  
                                  if (currentRules.length === allKeys.length) {
                                    setFormData({ ...formData, gridRules: [] });
                                  } else {
                                    setFormData({ ...formData, gridRules: allKeys });
                                  }
                                }}
                                className="px-1.5 py-0.5 rounded bg-blue-600 text-xs font-black text-white hover:bg-blue-700 transition-colors uppercase cursor-pointer"
                              >
                                All
                              </button>
                            </th>
                            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, i) => (
                              <th 
                                key={i} 
                                onClick={() => toggleColumn(i)}
                                className="p-1 text-xs font-black text-slate-500 dark:text-slate-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase text-center border-r border-blue-200/80 dark:border-slate-700/60 last:border-r-0"
                              >
                                {day}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 24 }).map((_, h) => (
                            <tr key={h} className="hover:bg-blue-100/30 dark:hover:bg-slate-800/40 transition-colors">
                              <td 
                                onClick={() => toggleRow(h)}
                                className="p-0 text-xs font-black text-slate-500 dark:text-slate-400 pr-1.5 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors border-r border-b border-blue-200/80 dark:border-slate-700/60 text-right leading-none h-4 font-mono select-none"
                              >
                                {h.toString().padStart(2, '0')}:00
                              </td>
                              {Array.from({ length: 7 }).map((_, d) => {
                                const active = formData.gridRules?.includes(`${d}-${h}`);
                                return (
                                  <td key={d} className="p-0 border-b border-r border-blue-200/80 dark:border-slate-700/60 last:border-r-0">
                                    <button
                                      onClick={() => toggleGridCell(d, h)}
                                      className={cn(
                                        "w-full h-4 flex items-center justify-center transition-all cursor-pointer",
                                        active 
                                          ? "grid-weekly-cell-active bg-emerald-700 hover:bg-emerald-600 dark:bg-emerald-800 dark:hover:bg-emerald-700 shadow-xs" 
                                          : "grid-weekly-cell-inactive bg-slate-100 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/50"
                                      )}
                                    >
                                      {active ? (
                                        <Check className="w-3 h-3 text-white stroke-[3.5] grid-weekly-check-icon" />
                                      ) : (
                                        <X className="w-3 h-3 text-red-600 dark:text-red-400 stroke-[3.5] grid-weekly-x-icon" />
                                      )}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    <p className="text-xs text-slate-400 italic font-medium pt-2 border-t border-blue-100/50">
                      * Headers are clickable to toggle entire columns or rows.
                    </p>
                  </div>
                )}

                {formData.type === InterstitialType.BASIC_HOURLY && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 flex flex-col items-center justify-center text-center space-y-4 min-h-[140px]">
                    <div className="w-full grid grid-cols-2 gap-3 pb-4 border-b border-blue-100/50">
                      <div className="space-y-1 text-left">
                        <label className="text-xs font-bold text-blue-400 uppercase">Effective Start</label>
                        <input 
                          type="date" 
                          value={formData.startDate || ''} 
                          onChange={e => setFormData({...formData, startDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-blue-200 rounded text-xs outline-none bg-white font-bold text-slate-850 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                        />
                      </div>
                      <div className="space-y-1 text-left">
                        <label className="text-xs font-bold text-blue-400 uppercase">Expiration Date</label>
                        <input 
                          type="date" 
                          value={formData.endDate || ''} 
                          onChange={e => setFormData({...formData, endDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-blue-200 rounded text-xs outline-none bg-white font-bold text-slate-850 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                        />
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-tighter">* Blank = No stop date</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center opacity-70">
                      <Clock className="w-6 h-6 text-blue-400 mb-2" />
                      <p className="text-xs text-blue-600 font-medium">Auto-repeat hourly trigger enabled.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
              <button 
                onClick={() => setDeleteConfirmId(editingId!)}
                className="flex items-center gap-2 px-4 py-2 border border-red-200 rounded text-xs font-black text-red-600 hover:bg-red-50 hover:border-red-300 uppercase tracking-widest transition-all cursor-pointer shadow-sm shadow-red-50 bg-white"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                Delete
              </button>

              {formData.metadata && (
                <div className="text-xs font-mono text-slate-400 text-center leading-tight">
                  <div>Created {formatMetadataDate(formData.metadata.createdDate)}</div>
                  <div>Modified {formatMetadataDate(formData.metadata.lastModifiedDate)}</div>
                </div>
              )}
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setEditingId(null)}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded text-xs font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest transition-all"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel
                </button>

                <button 
                  onClick={saveEdit}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MP3 Picker Modal */}
      {isPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-4 justify-between">
              {/* Left Title block */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="bg-blue-600 p-2 rounded">
                  <FolderOpen className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none">
                    Select File Asset
                  </h3>
                  <p className="text-xs font-bold text-slate-400 mt-1">
                    Allowed: .mp3, .txt, .pdf, .png, .jpg, .jpeg
                  </p>
                </div>
              </div>

              {/* Middle Search Bar - between Title and close x */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search audio, scripts & images..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                />
              </div>

              {/* Right Exit & Refresh */}
              <div className="flex items-center gap-2 shrink-0">
                <button 
                  type="button" 
                  onClick={async () => {
                    if (onRefresh) {
                      setIsRefreshing(true);
                      await onRefresh();
                      setTimeout(() => setIsRefreshing(false), 800);
                    }
                  }} 
                  className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-full hover:bg-slate-100 transition-colors"
                  title="Refresh Files"
                >
                  <RefreshCw className={cn("w-4.5 h-4.5", isRefreshing && "animate-spin")} />
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsPickerOpen(false)} 
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Close"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-4">
              <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {filteredFiles.length > 0 ? filteredFiles.map((file, i) => {
                  const dispDuration = pickerDurations[file.name] || file.duration || '';
                  const isMp3 = file.name.toLowerCase().endsWith('.mp3');
                  return (
                    <div 
                      key={i}
                      className={cn(
                        "w-full text-left p-1.5 px-3 rounded-lg flex items-center transition-all border gap-3 duration-150 shadow-xs",
                        i % 2 === 0
                          ? "bg-white border-slate-300/90 hover:border-blue-600 hover:bg-blue-50/40 hover:ring-1 hover:ring-blue-600/20 hover:shadow-md"
                          : "bg-slate-100 border-slate-300/90 hover:border-blue-600 hover:bg-blue-50/40 hover:ring-1 hover:ring-blue-600/20 hover:shadow-md"
                      )}
                    >
                      {/* Left: Move ONLY the Select button here */}
                      <div className="shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            // Automatically infer assetType based on chosen file extension
                            const nameLower = file.name.toLowerCase();
                            const isScriptExt = ['.txt', '.pdf', '.png', '.jpg', '.jpeg'].some(ext => nameLower.endsWith(ext));
                            const inferredAssetType = isScriptExt ? 'script' : 'audio';

                            setFormData({ 
                              ...formData, 
                              mp3Url: file.name,
                              assetType: inferredAssetType
                            });
                            setIsPickerOpen(false);
                          }}
                          className="px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer flex items-center justify-center h-7 shrink-0 w-[64px]"
                        >
                          Select
                        </button>
                      </div>

                      {/* Middle: File description and meta info */}
                      <div className="min-w-0 flex-1 flex flex-col justify-center">
                        <div className="flex flex-wrap items-baseline gap-1.5 leading-tight">
                          <span className="text-xs font-bold line-clamp-1 break-all text-slate-800">
                            {file.name}
                          </span>
                          
                          {/* Audio metadata duration logic - format same as on edit page */}
                          {isMp3 && dispDuration && (
                            <span className="text-xs font-mono font-bold text-slate-400 whitespace-nowrap ml-1">
                              ({dispDuration})
                            </span>
                          )}
                        </div>

                        {/* Display ID3 Metadata and subtitles if cached */}
                        {isMp3 && (() => {
                          const meta = metadataCache[file.name];
                          if (meta && (meta.title || meta.artist || meta.album)) {
                            const parts = [meta.title, meta.artist, meta.album].filter(Boolean);
                            return (
                              <p className="text-xs text-slate-500 italic font-medium leading-none mt-0.5">
                                {parts.join(", ")}
                              </p>
                            );
                          }
                          return null;
                        })()}

                        {!isMp3 && (
                          <span className="text-xs font-black text-blue-600 uppercase bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded inline-block mt-0.5 font-sans self-start">
                            {file.name.toLowerCase().endsWith('.txt') ? "Plain Text Script" :
                             file.name.toLowerCase().endsWith('.pdf') ? "PDF Document" : "Image Asset"}
                          </span>
                        )}
                      </div>

                      {/* Right: Preview button (play audio or display script) */}
                      <div className="shrink-0 flex items-center">
                        {!isMp3 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewScriptFile(file.name);
                            }}
                            className="rounded text-xs font-bold uppercase tracking-wider transition-all border border-blue-300 text-blue-600 bg-white hover:bg-blue-50 cursor-pointer flex items-center justify-center gap-1.5 h-7 w-[88px] shrink-0"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Preview</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePreview(file.name);
                            }}
                            className={cn(
                              "rounded text-xs font-bold uppercase tracking-wider transition-all border cursor-pointer flex items-center justify-center gap-1 h-7 w-[88px] shrink-0",
                              previewUrl === file.name 
                                ? "bg-slate-900 text-white border-slate-900" 
                                : "bg-white text-blue-600 border-blue-300 hover:bg-blue-50"
                            )}
                          >
                            {previewUrl === file.name ? (
                              <>
                                <Square className="w-2.5 h-2.5 fill-current" />
                                <span>Stop</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>Preview</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="py-12 text-center">
                    <AlertCircle className="w-8 h-8 text-amber-500/60 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                      {isDriveActive ? "No files inside Drive folder" : "No matching resources"}
                    </p>
                    {isDriveActive && (
                      <p className="text-xs text-slate-400 mt-2 max-w-[225px] mx-auto leading-relaxed uppercase font-bold">
                        Please upload your custom .mp3 files into the Google Drive "medialibrary" folder!
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal Overlay */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-3">
              <div className="bg-red-600 p-2 rounded">
                <Trash2 className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-xs font-black text-red-800 uppercase tracking-widest">
                Delete Interstitial?
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-650 font-bold leading-relaxed">
                This will permanently remove the interstitial. If you want to keep it, but suspend it, cancel the delete and instead choose "suspend".
              </p>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 border border-slate-200 rounded text-xs font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteInterstitial(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-red-100 cursor-pointer"
              >
                I understand, delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Interstitial Details Modal Overlay */}
      {selectedCalendarInterstitial && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[90]">
          <div className="bg-white rounded-xl border border-slate-250 shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 bg-slate-50 border-b border-slate-155 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-500" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-tighter">Interstitial Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCalendarInterstitial(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <span className="text-xs font-black font-mono text-slate-350 uppercase block tracking-widest leading-none mb-1">ID: {selectedCalendarInterstitial.id}</span>
                <p className="text-sm font-black text-slate-800 leading-tight tracking-tight">{selectedCalendarInterstitial.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3 text-xs">
                <div>
                  <span className="text-slate-400 uppercase font-bold block mb-0.5">Type</span>
                  <span className="font-bold text-slate-700 capitalize">
                    {selectedCalendarInterstitial.type === InterstitialType.ONE_TIME ? "One-Time" : selectedCalendarInterstitial.type.split('-').pop()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold block mb-0.5">Status</span>
                  <span className={cn("font-bold", selectedCalendarInterstitial.enabled ? "text-green-600" : "text-slate-400")}>
                    {selectedCalendarInterstitial.enabled ? "Enabled" : "Suspended"}
                  </span>
                </div>
                <div className="col-span-2 border-t border-slate-200/50 pt-2">
                  <span className="text-slate-400 uppercase font-bold block mb-0.5">Timing Summary</span>
                  <span className="font-bold text-slate-755 block font-mono">
                    :{selectedCalendarInterstitial.minute.toString().padStart(2, '0')}m • {getInterstitialSummary(selectedCalendarInterstitial)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs text-slate-400 uppercase font-bold block">
                  {selectedCalendarInterstitial.assetType === 'script' ? "Target Script / Image File" : "Target Audio Track"}
                </span>
                <div className="p-2 border border-slate-200 rounded flex items-center justify-between gap-2 bg-slate-50/50">
                  <div className="flex items-center gap-2 min-w-0">
                    {selectedCalendarInterstitial.assetType === 'script' ? (
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    ) : (
                      <Music className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-slate-650 truncate font-mono">{selectedCalendarInterstitial.mp3Url}</span>
                  </div>
                  {selectedCalendarInterstitial.assetType === 'script' && (
                    <span className="text-xs font-mono font-bold text-slate-600 shrink-0">
                      {selectedCalendarInterstitial.approximateReadTime ? (selectedCalendarInterstitial.approximateReadTime.startsWith('~') ? selectedCalendarInterstitial.approximateReadTime : `~${selectedCalendarInterstitial.approximateReadTime}`) : '-:--'}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 uppercase font-bold block mb-0.5">Effective From</span>
                  <span className="font-mono text-slate-600 font-bold">{selectedCalendarInterstitial.startDate || "Any Date"}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold block mb-0.5">Expiration Limit</span>
                  <span className="font-mono text-slate-600 font-bold">{selectedCalendarInterstitial.endDate || "No Limit"}</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-150 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCalendarInterstitial(null)}
                className="px-3.5 py-1.5 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 text-xs font-black uppercase tracking-tighter cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const s = selectedCalendarInterstitial;
                  setSelectedCalendarInterstitial(null);
                  startEdit(s);
                }}
                className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-tighter flex items-center gap-1 cursor-pointer"
              >
                <FileText className="w-3 h-3" />
                <span>Edit Interstitial</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Show Details Modal Overlay */}
      {selectedCalendarShow && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[90]">
          <div className="bg-white rounded-xl border border-slate-250 shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 bg-slate-50 border-b border-slate-155 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-500" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-tighter">Show Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCalendarShow(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <span className="text-xs font-black font-mono text-slate-350 uppercase block tracking-widest leading-none mb-1">ID: {selectedCalendarShow.id}</span>
                <p className="text-base font-black text-slate-800 leading-tight tracking-tight">{selectedCalendarShow.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3 text-xs">
                <div>
                  <span className="text-slate-400 uppercase font-bold block mb-0.5 text-xs">Short Name</span>
                  <span className="font-bold text-slate-700 uppercase font-mono">
                    {selectedCalendarShow.nameShort}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold block mb-0.5 text-xs">Status</span>
                  <span className={cn("font-bold", selectedCalendarShow.active ? "text-green-600" : "text-slate-400")}>
                    {selectedCalendarShow.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="col-span-2 border-t border-slate-200/50 pt-2">
                  <span className="text-slate-400 uppercase font-bold block mb-0.5 text-xs">Interstitial Timing</span>
                  <span className="font-bold text-slate-755 block font-mono">
                    {selectedCalendarShow.day} at {selectedCalendarShow.startHour.toString().padStart(2, '0')}:{selectedCalendarShow.startMinute?.toString().padStart(2, '0') || '00'}
                  </span>
                </div>
                <div className="col-span-2 border-t border-slate-200/50 pt-2">
                  <span className="text-slate-400 uppercase font-bold block mb-0.5 text-xs">Duration</span>
                  <span className="font-bold text-slate-755 block">
                    {selectedCalendarShow.durationHours}h {selectedCalendarShow.durationMinutes}m
                  </span>
                </div>
              </div>

              {selectedCalendarShow.host && (
                <div className="space-y-1">
                  <span className="text-xs text-slate-400 uppercase font-bold block">Host</span>
                  <div className="p-2 border border-slate-200 rounded flex items-center gap-2 bg-slate-50/50 text-xs">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-bold text-slate-650">{selectedCalendarShow.host}</span>
                  </div>
                </div>
              )}

              {selectedCalendarShow.description && (
                <div className="space-y-1">
                  <span className="text-xs text-slate-400 uppercase font-bold block">Description</span>
                  <div className="p-2 border border-slate-200 rounded bg-slate-50/50 text-xs text-slate-650 font-medium leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {selectedCalendarShow.description}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-150 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCalendarShow(null)}
                className="px-3.5 py-1.5 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 text-xs font-black uppercase tracking-tighter cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const s = selectedCalendarShow;
                  setSelectedCalendarShow(null);
                  startEditShow(s);
                }}
                className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-tighter flex items-center gap-1 cursor-pointer"
              >
                <FileText className="w-3 h-3" />
                <span>Edit Show</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {previewScriptFile && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-150">
          <LiveReadPopout
            initialFileName={previewScriptFile}
            initialInterstitialName="File Preview"
            isOverlay={true}
            isPreview={true}
            onClose={() => setPreviewScriptFile(null)}
          />
        </div>
      )}

      {/* Interstitial Conflict Confirmation Dialog */}
      {pendingSaveInterstitial && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[110] animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-full shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Interstitial Conflict Detected</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  The changes you are saving introduce the following start-time conflict(s):
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs italic text-amber-900 space-y-1.5 max-h-40 overflow-y-auto">
              {pendingSaveInterstitial.conflicts.map((c, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="shrink-0 font-bold not-italic">•</span>
                  <span>{c.message}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-600 font-medium">
              Are you sure you want to save this interstitial with the conflict?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingSaveInterstitial(null)}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              >
                Continue Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  onSave(pendingSaveInterstitial.updatedList);
                  setEditingId(null);
                  setPendingSaveInterstitial(null);
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors cursor-pointer"
              >
                Save Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show Overlap Confirmation Dialog */}
      {pendingSaveShow && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[110] animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-full shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Show Overlap Detected</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  The show you are saving overlaps with existing show(s):
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs italic text-amber-900 space-y-1.5 max-h-40 overflow-y-auto">
              {pendingSaveShow.conflicts.map((c, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="shrink-0 font-bold not-italic">•</span>
                  <span>{c.message}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-600 font-medium">
              Are you sure you want to save this show with the overlap?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingSaveShow(null)}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              >
                Continue Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onSaveShows) onSaveShows(pendingSaveShow.updatedList);
                  setEditingShowId(null);
                  setPendingSaveShow(null);
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors cursor-pointer"
              >
                Save Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
