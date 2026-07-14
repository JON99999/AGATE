import { useState, useEffect, useMemo, useRef } from 'react';
import { format, addMinutes, subMinutes, isSameMinute, isBefore, isAfter, startOfMinute, differenceInSeconds, parseISO } from 'date-fns';
import { Play, Pause, Square, CheckCircle, AlertCircle, RefreshCw, Clock, X, Copy, RadioTower, CassetteTape, ListOrdered, Download, Ear, FileText, Volume2 } from 'lucide-react';
import { Schedule, ScheduleType, LogEntry } from '../types';
import { cn, getMP3Status, parseCustomTimeText, getParsedCustomTimeISO } from '../lib/utils';
import LiveReadPopout from './LiveReadPopout';
import { mp3BlobCache, getPlayableUrl, mp3DurationCache, availableFilesCache } from '../lib/driveService';

interface PlayerTabProps {
  schedules: Schedule[];
  logs: LogEntry[];
  onLog: (entry: LogEntry) => Promise<any> | void;
  now: Date;
  syncTime: Date;
  scrollTrigger: number;
  playMode?: 'Live' | 'Prerecord' | 'Export';
  prerecordDate?: Date | null;
  prerecordLengthMinutes?: number;
  onConfigureTimeframe?: () => void;
  onExecuteExport?: () => void;
  isAdmin?: boolean;
  onRefresh?: () => Promise<any> | void;
}

export default function PlayerTab({ 
  schedules, 
  logs, 
  onLog, 
  now, 
  syncTime, 
  scrollTrigger,
  playMode = 'Live',
  prerecordDate = null,
  prerecordLengthMinutes = 240,
  onConfigureTimeframe,
  onExecuteExport,
  isAdmin = false,
  onRefresh
}: PlayerTabProps) {
  const [playingAudio, setPlayingAudio] = useState<HTMLAudioElement | null>(null);
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingSlotKey, setPlayingSlotKey] = useState<string | null>(null);
  const [activeLiveReadOverlay, setActiveLiveReadOverlay] = useState<any | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [isLoggingExports, setIsLoggingExports] = useState(false);
  const [customScriptTimes, setCustomScriptTimes] = useState<Record<string, string>>({});
  const [nowClock, setNowClock] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleLogged = () => {
      setActiveLiveReadOverlay(null);
    };
    const handleClosed = () => {
      setActiveLiveReadOverlay(null);
    };

    window.addEventListener('live-read-logged', handleLogged);
    window.addEventListener('live-read-closed', handleClosed);

    return () => {
      window.removeEventListener('live-read-logged', handleLogged);
      window.removeEventListener('live-read-closed', handleClosed);
    };
  }, []);

  const currentTimeText = useMemo(() => {
    let hours = nowClock.getHours();
    const minutes = String(nowClock.getMinutes()).padStart(2, '0');
    const seconds = String(nowClock.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
  }, [nowClock]);

  const [cacheDisplayStatus, setCacheDisplayStatus] = useState<'idle' | 'caching' | 'all-cached'>('idle');
  const [prevActiveUrlsHash, setPrevActiveUrlsHash] = useState<string>('');

  // Compute active verified Schedules and their cache status
  const activeVerifiedSchedules = useMemo(() => {
    return schedules.filter(s => {
      if (!s.enabled || !s.mp3Url) return false;
      const status = getMP3Status(s.mp3Url);
      return status.exists && status.valid;
    });
  }, [schedules]);

  const activeMp3Urls = useMemo(() => {
    return activeVerifiedSchedules.map(s => s.mp3Url);
  }, [activeVerifiedSchedules]);

  useEffect(() => {
    const hash = activeMp3Urls.join(',');
    
    let hasNewUncached = false;
    if (hash !== prevActiveUrlsHash) {
      setPrevActiveUrlsHash(hash);
      let uncached = 0;
      activeMp3Urls.forEach(url => {
        const fileInCache = availableFilesCache.get(url);
        const resolvedUrl = fileInCache ? fileInCache.path : url;
        const isCached = mp3BlobCache.has(resolvedUrl) || mp3BlobCache.has(url) || getPlayableUrl(url).startsWith('blob:');
        if (!isCached) {
          uncached++;
        }
      });
      if (uncached > 0) {
        hasNewUncached = true;
      }
    }

    const checkStatus = () => {
      let uncached = 0;
      activeMp3Urls.forEach(url => {
        const fileInCache = availableFilesCache.get(url);
        const resolvedUrl = fileInCache ? fileInCache.path : url;
        const isCached = mp3BlobCache.has(resolvedUrl) || mp3BlobCache.has(url) || getPlayableUrl(url).startsWith('blob:');
        if (!isCached) {
          uncached++;
        }
      });
      return uncached;
    };

    const currentUncached = checkStatus();

    if (currentUncached > 0) {
      if (cacheDisplayStatus !== 'caching') {
        setCacheDisplayStatus('caching');
      }
    } else {
      if (cacheDisplayStatus === 'caching') {
        setCacheDisplayStatus('all-cached');
        const timer = setTimeout(() => {
          setCacheDisplayStatus('idle');
        }, 4000);
        return () => clearTimeout(timer);
      }
    }

    if (cacheDisplayStatus === 'caching' || hasNewUncached) {
      const interval = setInterval(() => {
        const uncached = checkStatus();
        if (uncached === 0) {
          setCacheDisplayStatus('all-cached');
          clearInterval(interval);
          const timer = setTimeout(() => {
            setCacheDisplayStatus('idle');
          }, 4000);
          return () => clearTimeout(timer);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [activeMp3Urls, scrollTrigger, cacheDisplayStatus, prevActiveUrlsHash]);

  const renderCacheStatusMessage = () => {
    if (cacheDisplayStatus === 'idle') return null;

    if (cacheDisplayStatus === 'caching') {
      return (
        <div id="global-cache-status-caching" className="flex items-center gap-1.5 text-[12px] font-bold text-white/95 uppercase tracking-wider animate-pulse select-none shrink-0 ml-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-white" />
          <span>Caching mp3's</span>
        </div>
      );
    }

    if (cacheDisplayStatus === 'all-cached') {
      return (
        <div id="global-cache-status-cached" className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-200 uppercase tracking-wider select-none shrink-0 ml-2">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-300 shrink-0 fill-emerald-500/20" />
          <span>All cached</span>
        </div>
      );
    }

    return null;
  };

  // Sync ref with state
  useEffect(() => {
    playingAudioRef.current = playingAudio;
  }, [playingAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playingAudioRef.current) {
        playingAudioRef.current.pause();
        playingAudioRef.current.src = "";
      }
    };
  }, []);

  const [duration, setDuration] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic: centered on "now" indicator or scrolled to top for Prerecord
  useEffect(() => {
    // Small timeout to ensure DOM layout has settled after data load/render
    const timer = setTimeout(() => {
      if (playMode === 'Prerecord') {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        if (activeItemRef.current) {
          activeItemRef.current.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [scrollTrigger, playMode]);

  useEffect(() => {
    if (!playingAudio) return;

    const updateProgress = () => {
      setCurrentTime(playingAudio.currentTime);
      setDuration(playingAudio.duration || 0);
    };

    const handleEnded = () => {
      setPlayingAudio(null);
      setPlayingSlotKey(null);
    };

    playingAudio.addEventListener('timeupdate', updateProgress);
    playingAudio.addEventListener('loadedmetadata', updateProgress);
    playingAudio.addEventListener('ended', handleEnded);

    return () => {
      playingAudio.removeEventListener('timeupdate', updateProgress);
      playingAudio.removeEventListener('loadedmetadata', updateProgress);
      playingAudio.removeEventListener('ended', handleEnded);
    };
  }, [playingAudio]);

  const timeline = useMemo(() => {
    if (playMode === 'Prerecord' && prerecordDate) {
      const slots = [];
      let current = startOfMinute(prerecordDate);
      const end = addMinutes(current, prerecordLengthMinutes);
      while (isBefore(current, end)) {
        slots.push(new Date(current));
        current = addMinutes(current, 1);
      }
      return slots;
    } else {
      const start = subMinutes(syncTime, 120);
      const end = addMinutes(syncTime, 120);
      const slots = [];
      
      let current = startOfMinute(start);
      while (isBefore(current, end)) {
        slots.push(new Date(current));
        current = addMinutes(current, 1);
      }
      return slots;
    }
  }, [syncTime, playMode, prerecordDate, prerecordLengthMinutes]);

  const getSchedulesForSlot = (slot: Date) => {
    const day = slot.getDay();
    const hour = slot.getHours();
    const minute = slot.getMinutes();
    const dateStr = format(slot, 'yyyy-MM-dd');

    return schedules.filter(s => {
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
  };

  const handlePlay = (s: Schedule, slot: Date) => {
    const slotKey = `${slot.toISOString()}-${s.id}`;
    
    if (s.assetType === 'script') {
      const parts = s.mp3Url ? s.mp3Url.split('/') : [];
      const filename = parts[parts.length - 1] || 'Script';
      
      const scheduledTimeISO = getParsedCustomTimeISO(customScriptTimes[slotKey], slot);

      const slotISO = slot.toISOString();
      const playedLog = logs.find(l => 
        l.scheduleId === s.id && 
        (l.scheduledTime === slotISO || isSameMinute(parseISO(l.timestamp), slot)) &&
        l.status === 'played'
      );

      const payload = {
        name: filename,
        fileName: filename,
        filePath: s.mp3Url,
        scheduleId: s.id,
        scheduleName: s.name,
        scheduledTime: scheduledTimeISO,
        initialLoggedTime: playedLog?.timestamp || ''
      };

      if ((window as any).electronAPI && (window as any).electronAPI.spawnLiveRead) {
        (window as any).electronAPI.spawnLiveRead(payload);
        setActiveLiveReadOverlay(payload); // Set local state so we can show active ticking clock
      } else {
        // Fallback to server call & client-side overlay
        fetch('/api/live-read/spawn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.mode === 'browser') {
              setActiveLiveReadOverlay(payload);
            } else {
              setActiveLiveReadOverlay(payload); // Keep local state active to show clock next to card
            }
          })
          .catch((err) => {
            console.error("Failed to spawn live read window:", err);
            // Even if server call fails, open overlay as a fallback
            setActiveLiveReadOverlay(payload);
          });
      }
      return;
    }
    
    if (playingAudio && playingSlotKey === slotKey) {
      playingAudio.pause();
      playingAudio.src = "";
      setPlayingAudio(null);
      setPlayingSlotKey(null);
      return;
    }

    if (playingAudio) {
      playingAudio.pause();
      playingAudio.src = "";
    }

    const playableUrl = getPlayableUrl(s.mp3Url);
    const audio = new Audio(playableUrl);
    
    audio.play().then(() => {
      setPlayingAudio(audio);
      setPlayingSlotKey(slotKey);
      onLog({
        timestamp: new Date().toISOString(), 
        scheduledTime: slot.toISOString(),
        mp3Name: s.mp3Url,
        scheduleName: s.name,
        scheduleId: s.id,
        status: 'played'
      });
    }).catch(err => {
      console.error('Playback failed', err);
      onLog({
        timestamp: new Date().toISOString(),
        scheduledTime: slot.toISOString(),
        mp3Name: s.mp3Url,
        scheduleName: s.name,
        scheduleId: s.id,
        status: 'failed'
      });
    });
  };

  const isPlayed = (scheduleId: string, slot: Date) => {
    return logs.some(l => 
      l.scheduleId === scheduleId && 
      (l.scheduledTime === slot.toISOString() || isSameMinute(parseISO(l.timestamp), slot)) &&
      l.status === 'played'
    );
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const previewText = useMemo(() => {
    if (playMode !== 'Export' || !prerecordDate) return '';
    
    // 1. Recreate timeline slots exactly like in runExportPrerecord
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
      const sForSlot = getSchedulesForSlot(slot);
      sForSlot.forEach(s => {
        itemsToExport.push({
          slotTime: format(slot, 'HH:mm'),
          fileName: s.mp3Url,
          scheduleName: s.name,
          scheduleId: s.id,
          minute: s.minute
        });
      });
    });

    const year = prerecordDate.getFullYear();
    const month = String(prerecordDate.getMonth() + 1).padStart(2, '0');
    const day = String(prerecordDate.getDate()).padStart(2, '0');
    const hours = String(prerecordDate.getHours()).padStart(2, '0');
    const minutes = String(prerecordDate.getMinutes()).padStart(2, '0');

    const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthShort = monthShorts[prerecordDate.getMonth()] || 'JUN';

    const dateStr = `${year}-${month}-${monthShort}-${day}`;

    const txtLines: string[] = [
      '========================================================================',
      '              PRERECORD BROADCAST SCHEDULE SUMMARY',
      '========================================================================',
      `Air Date: ${dateStr}`,
      `Start Time: ${hours}:${minutes}`,
      `Duration: ${prerecordLengthMinutes} minutes`,
      '========================================================================',
      '',
      'SEQUENCE OF SCHEDULED SPECIALS & BREAKS:',
      '------------------------------------------------------------------------'
    ];

    if (itemsToExport.length === 0) {
      txtLines.push('No active scheduled breaks found in this timeframe.');
    } else {
      itemsToExport.forEach((item: any, idx: number) => {
        const itemIdx = idx + 1;
        const itemSlotTime = item.slotTime;
        const safeSlotTime = typeof itemSlotTime === 'string' ? itemSlotTime.replace(/:/g, '-') : '00-00';
        
        const rawName = item.scheduleName || 'Unnamed Break';
        const safeScheduleName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
        const sourceFileName = item.fileName || '';
        const dotIndex = sourceFileName.lastIndexOf('.');
        const ext = dotIndex !== -1 ? sourceFileName.substring(dotIndex) : '.mp3';
        const targetFileName = `Break ${itemIdx} - (${safeSlotTime}) - (${safeScheduleName})${ext}`;
        
        const status = getMP3Status(sourceFileName).exists ? 'Found' : 'Missing';

        if (status === 'Found') {
          txtLines.push(`${itemIdx}. Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported File: ${targetFileName}`);
          txtLines.push(`   Title: ${rawName}`);
          txtLines.push(`   Source File: ${sourceFileName}`);
        } else {
          txtLines.push(`${itemIdx}. MISSING FILE - THIS FILE COULD NOT BE FOUND.  PLEASE REVERIFY AND EXPORT.`);
          txtLines.push(`   Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported File: ${targetFileName}`);
          txtLines.push(`   Title: ${rawName}`);
          txtLines.push(`   Source File: ${sourceFileName}`);
        }
        txtLines.push('------------------------------------------------------------------------');
      });
    }

    return txtLines.join('\n');
  }, [playMode, prerecordDate, prerecordLengthMinutes, schedules]);

  const itemsToExport = useMemo(() => {
    if (playMode !== 'Export' || !prerecordDate) return [];
    
    // 1. Recreate timeline slots exactly like in runExportPrerecord
    const slots = [];
    let current = new Date(prerecordDate);
    current.setSeconds(0, 0);
    
    const end = new Date(current.getTime() + prerecordLengthMinutes * 60 * 1000);
    
    while (current.getTime() < end.getTime()) {
      slots.push(new Date(current));
      current = new Date(current.getTime() + 60 * 1000);
    }

    // 2. Filter & map slot matching schedules
    const items: Array<{
      slotTime: string;
      fileName: string;
      scheduleName: string;
      scheduleId: string;
      minute: number;
      exists: boolean;
      targetFileName: string;
      slotISO: string;
      assetType?: 'audio' | 'script';
    }> = [];

    slots.forEach(slot => {
      const sForSlot = getSchedulesForSlot(slot);
      sForSlot.forEach(s => {
        const itemIdx = items.length + 1;
        const slotTimeStr = format(slot, 'HH:mm');
        const safeSlotTime = slotTimeStr.replace(/:/g, '-');
        const rawName = s.name || 'Unnamed Break';
        const safeScheduleName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
        const sourceFileName = s.mp3Url || '';
        const dotIndex = sourceFileName.lastIndexOf('.');
        const ext = dotIndex !== -1 ? sourceFileName.substring(dotIndex) : '.mp3';
        const targetFileName = `Break ${itemIdx} - (${safeSlotTime}) - (${safeScheduleName})${ext}`;
        const exists = getMP3Status(s.mp3Url).exists;

        items.push({
          slotTime: slotTimeStr,
          fileName: s.mp3Url,
          scheduleName: rawName,
          scheduleId: s.id,
          minute: s.minute,
          exists,
          targetFileName,
          slotISO: slot.toISOString(),
          assetType: s.assetType
        });
      });
    });

    return items;
  }, [playMode, prerecordDate, prerecordLengthMinutes, schedules]);

  const hasUnlogged = useMemo(() => {
    if (!itemsToExport) return false;
    return itemsToExport.some(item => {
      const slot = parseISO(item.slotISO);
      const playedLog = logs.find(l => 
        l.scheduleId === item.scheduleId && 
        (l.scheduledTime === item.slotISO || isSameMinute(parseISO(l.timestamp), slot)) &&
        l.status === 'played'
      );
      return !playedLog;
    });
  }, [itemsToExport, logs]);

  const handleLogExportAsPlayed = async () => {
    const unlogged = itemsToExport.filter(item => {
      const slot = parseISO(item.slotISO);
      const playedLog = logs.find(l => 
        l.scheduleId === item.scheduleId && 
        (l.scheduledTime === item.slotISO || isSameMinute(parseISO(l.timestamp), slot)) &&
        l.status === 'played'
      );
      return !playedLog;
    });

    if (unlogged.length === 0) return;

    setIsLoggingExports(true);
    try {
      for (const item of unlogged) {
        await onLog({
          timestamp: new Date().toISOString(),
          scheduledTime: item.slotISO,
          mp3Name: item.fileName,
          scheduleName: item.scheduleName,
          scheduleId: item.scheduleId,
          status: 'played',
          playMode: 'Export'
        });
      }
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      console.error("Failed to log exports:", err);
    } finally {
      setIsLoggingExports(false);
    }
  };

  const [copiedPlan, setCopiedPlan] = useState(false);
  const [copiedPlaylist, setCopiedPlaylist] = useState(false);

  const handleCopyPlan = () => {
    navigator.clipboard.writeText(previewText);
    setCopiedPlan(true);
    setTimeout(() => setCopiedPlan(false), 2000);
  };

  const playlistText = useMemo(() => {
    if (!itemsToExport || itemsToExport.length === 0) return '';
    const m3uLines: string[] = ['#EXTM3U'];
    itemsToExport.forEach((item, idx) => {
      const itemIdx = idx + 1;
      const sourceFileName = item.fileName || '';
      const dotIndex = sourceFileName.lastIndexOf('.');
      const ext = dotIndex !== -1 ? sourceFileName.substring(dotIndex).toLowerCase() : '';
      if (ext === '.mp3') {
        m3uLines.push(`#EXTINF:-1,Break ${itemIdx} - ${item.slotTime} - ${item.scheduleName}`);
        m3uLines.push(item.targetFileName);
      }
    });
    return m3uLines.join('\n');
  }, [itemsToExport]);

  const handleCopyPlaylist = () => {
    navigator.clipboard.writeText(playlistText);
    setCopiedPlaylist(true);
    setTimeout(() => setCopiedPlaylist(false), 2000);
  };

  if (playMode === 'Export') {
    if (!prerecordDate) {
      return (
        <div id="export-mode-unconfigured" className="flex flex-col items-center justify-center h-full text-slate-100 p-3 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-emerald-900/40 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <ListOrdered className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-[14px] font-black uppercase tracking-wider text-white flex items-center justify-center gap-1.5">
              <ListOrdered className="w-4 h-4 text-emerald-400" />
              Export Setup
            </h3>
            <p className="text-[12px] text-slate-400 leading-normal">
              Select air date & duration to export broadcast breaks.
            </p>
          </div>
          <button
            id="btn-configure-export-timeframe"
            onClick={onConfigureTimeframe}
            className="w-full h-10 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white rounded border-b-[4px] border-emerald-800 hover:brightness-110 active:border-b-0 active:translate-y-[4px] font-black text-[14px] uppercase tracking-wider transition-all cursor-pointer shadow-[0_4px_6px_rgba(0,0,0,0.4)]"
          >
            Configure
          </button>
        </div>
      );
    }

    return (
      <div id="export-mode-container" className="flex flex-col h-full bg-slate-900">
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto space-y-2 pb-4 scroll-smooth"
        >
          {/* Action stacked buttons above the MP3 list, satisfying layout requests A & B */}
          <div className="sticky top-0 bg-slate-900 z-10 space-y-1.5 pt-1.5 pb-2 px-1.5 border-b border-slate-800/60">
            <button
              id="bg-btn-execute-export"
              onClick={onExecuteExport}
              className="w-full h-10 flex items-center justify-center gap-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded border-b-[4px] border-emerald-800 hover:brightness-110 active:border-b-0 active:translate-y-[4px] transition-all font-black uppercase text-[15px] tracking-wide font-sans cursor-pointer select-none shadow-[0_4px_6px_rgba(0,0,0,0.4)]"
            >
              <Download className="w-5 h-5 shrink-0" />
              <span>Export</span>
            </button>

            <button
              id="btn-log-export-as-played"
              onClick={handleLogExportAsPlayed}
              disabled={!hasUnlogged || isLoggingExports}
              className={cn(
                "w-full h-10 flex items-center justify-center gap-2 px-3 rounded font-black uppercase text-[14px] tracking-wide font-sans select-none transition-all duration-75 shadow-[0_4px_6px_rgba(0,0,0,0.4)]",
                hasUnlogged && !isLoggingExports
                  ? "bg-emerald-800 hover:bg-emerald-700 text-white border-b-[4px] border-emerald-950 hover:brightness-110 active:border-b-0 active:translate-y-[4px] cursor-pointer"
                  : "bg-slate-800 text-slate-500 border-b-[4px] border-slate-900 cursor-not-allowed opacity-65"
              )}
            >
              {isLoggingExports ? (
                <>
                  <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                  <span>Logging Exports...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Log Export As Played</span>
                </>
              )}
            </button>
          </div>

          {/* Header indicator bar matching 'Prerecord Start' */}
          <div 
            ref={activeItemRef}
            className="bg-emerald-600 h-6 flex items-center justify-start px-3 rounded shadow-sm border border-emerald-500 mx-1 mt-1"
            id="export-start-indicator"
          >
            <span className="text-[12px] font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5">
              <ListOrdered className="w-3.5 h-3.5 text-white/90 shrink-0" />
              mp3's
            </span>
          </div>

          {/* Cards for each item in the export timeframe */}
          <div className="space-y-2 px-1">
            {itemsToExport.length === 0 ? (
              <div className="p-3 bg-slate-900/40 border border-slate-900 border-dashed rounded text-center text-[12px] text-slate-500 mx-1">
                No active scheduled breaks found in timeframe.
              </div>
            ) : (
              itemsToExport.map((item, idx) => {
                const key = `${item.scheduleId}-${item.slotTime}-${idx}`;
                const isExpanded = isAdmin && !!expandedCards[key];

                const slot = parseISO(item.slotISO);
                const playedLog = logs.find(l => 
                  l.scheduleId === item.scheduleId && 
                  (l.scheduledTime === item.slotISO || isSameMinute(parseISO(l.timestamp), slot)) &&
                  l.status === 'played'
                );
                const played = !!playedLog && playedLog.playMode !== 'Export';
                const exported = !!playedLog && playedLog.playMode === 'Export';

                const diffSeconds = differenceInSeconds(now, slot);
                const isPast = isBefore(slot, now);
                const isPresent = isSameMinute(now, slot);
                const isUpcoming = !played && !exported && !isPast && !isPresent && diffSeconds <= 600 && isAfter(slot, now);
                
                const isMissedRecent = isPast && !played && !exported && diffSeconds <= 1800;
                const isMissedOld = isPast && !played && !exported && diffSeconds > 1800;

                const bgClass = !item.exists
                  ? "bg-red-950/20 border-red-800 hover:border-red-700"
                  : exported
                    ? "bg-emerald-950/25 border-emerald-600 hover:border-emerald-500"
                    : played
                      ? "bg-green-950/25 border-green-600 hover:border-green-500"
                      : isMissedRecent || isMissedOld
                        ? "bg-amber-950/15 border-amber-800 hover:border-amber-700"
                        : "bg-slate-950 border-slate-700 hover:border-slate-500";

                return (
                  <div 
                    key={key} 
                    onClick={() => {
                      if (isAdmin) {
                        setExpandedCards(prev => ({
                          ...prev,
                          [key]: !prev[key]
                        }));
                      }
                    }}
                    className={cn(
                      "rounded border shadow-sm p-2 transition-all flex flex-col gap-1.5 mx-1 text-left select-none relative",
                      bgClass,
                      item.assetType === 'script' && (item.exists ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-rose-500"),
                      isAdmin && "cursor-pointer"
                    )}
                  >
                    {/* Header: Date & Time in full-width strip */}
                    <div className="flex justify-between items-center bg-slate-900/60 -mx-2 -mt-2 px-2.5 py-1 rounded-t border-b border-slate-700/60">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] uppercase font-black text-slate-400 tracking-tighter">
                          {format(slot, 'MMM dd')}
                        </span>
                        <span className="text-[12px] font-mono font-black text-emerald-400">
                          {item.slotTime}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {playingSlotKey === `export-preview-${key}` ? (
                          <div className="flex items-center gap-1 text-[12px] font-black uppercase text-emerald-400">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                            Preview
                          </div>
                        ) : isPresent ? (
                          <span className="text-[12px] text-white px-1 py-0.5 rounded font-black uppercase leading-none bg-emerald-600">Next</span>
                        ) : isUpcoming ? (
                          <span className="text-[12px] text-white px-1 py-0.5 rounded font-black uppercase leading-none shadow-sm bg-emerald-600 shadow-emerald-950/35">Next</span>
                        ) : null}
                      </div>
                    </div>

                    {/* Track Row: Title + Play/Stop Icon */}
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <div className={cn(
                        "text-[12px] font-bold leading-tight break-words line-clamp-2 flex-1 flex items-center gap-1.5",
                        playingSlotKey === `export-preview-${key}` ? "text-emerald-400" : "text-slate-200"
                      )}>
                        <span>{item.scheduleName}</span>
                      </div>

                      <div className="shrink-0">
                        {item.assetType === 'script' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const filename = item.fileName.split('/').pop() || 'Script';
                              const scheduledTimeISO = getParsedCustomTimeISO(
                                customScriptTimes[`${item.scheduleId}-${item.slotISO}`], 
                                parseISO(item.slotISO)
                              );

                              const payload = {
                                name: filename,
                                fileName: filename,
                                filePath: item.fileName,
                                scheduleId: item.scheduleId,
                                scheduleName: item.scheduleName,
                                scheduledTime: scheduledTimeISO,
                                initialLoggedTime: playedLog?.timestamp || ''
                              };

                              if ((window as any).electronAPI && (window as any).electronAPI.spawnLiveRead) {
                                (window as any).electronAPI.spawnLiveRead(payload);
                                setActiveLiveReadOverlay(payload);
                              } else {
                                setActiveLiveReadOverlay(payload);
                              }
                            }}
                            className={cn(
                              "p-1 rounded-full transition-all shadow-sm flex items-center justify-center cursor-pointer active:scale-95 border",
                              played 
                                ? "bg-blue-900 border-blue-500/20 text-blue-400 hover:bg-blue-850" 
                                : "bg-blue-600 hover:bg-blue-700 text-white border-transparent"
                            )}
                            title={played ? "Re-read / View Script" : "Read Script"}
                          >
                            {played ? (
                              <RefreshCw className="w-3 h-3" />
                            ) : (
                              <FileText className="w-3 h-3" />
                            )}
                          </button>
                        ) : item.exists ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const isPlaying = playingSlotKey === `export-preview-${key}`;
                              if (isPlaying) {
                                playingAudio?.pause();
                                if (playingAudio) {
                                  playingAudio.src = "";
                                }
                                setPlayingAudio(null);
                                setPlayingSlotKey(null);
                              } else {
                                if (playingAudio) {
                                  playingAudio.pause();
                                  playingAudio.src = "";
                                }
                                const playableUrl = getPlayableUrl(item.fileName);
                                const audio = new Audio(playableUrl);
                                audio.play().then(() => {
                                  setPlayingAudio(audio);
                                  setPlayingSlotKey(`export-preview-${key}`);
                                }).catch(err => {
                                  console.error("Preview playback failed", err);
                                });
                              }
                            }}
                            className={cn(
                              "p-1 rounded-full transition-all shadow-sm flex items-center justify-center cursor-pointer active:scale-95 border",
                              playingSlotKey === `export-preview-${key}`
                                ? "bg-slate-900 border-emerald-500/20 text-emerald-400"
                                : "bg-slate-700 hover:bg-slate-650 hover:text-white text-slate-300 border-transparent"
                            )}
                            title="Preview Audio"
                          >
                            {playingSlotKey === `export-preview-${key}` ? (
                              <Square className="w-2.5 h-2.5 fill-current" />
                            ) : (
                              <Ear className="w-3 h-3" />
                            )}
                          </button>
                        ) : (
                          <div 
                            className="p-1 rounded-full bg-red-950/40 text-red-400 border border-red-900/50 flex items-center justify-center shadow-sm"
                            title="Missing File"
                          >
                            <X className="w-2.5 h-2.5" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status & Details Footer */}
                    <div className="flex items-center justify-between mt-1">
                      {item.exists ? (
                        <div className="flex items-center gap-1.5">
                          {exported ? (
                            <>
                              <CheckCircle className="w-3 h-3 text-emerald-400" />
                              <span className="text-[14px] font-bold text-emerald-400 uppercase tracking-tighter">
                                Exported
                              </span>
                            </>
                          ) : played ? (
                            <>
                              <CheckCircle className="w-3 h-3 text-green-400" />
                              <span className="text-[14px] font-bold text-green-400 uppercase tracking-tighter">
                                {item.assetType === 'script' ? 'Read' : 'Played'} {playedLog ? format(parseISO(playedLog.timestamp), 'HH:mm') : ''}
                              </span>
                            </>
                          ) : isMissedRecent || isMissedOld ? (
                            <>
                              <AlertCircle className="w-3 h-3 text-amber-500" />
                              <span className="text-[14px] font-bold text-amber-500 uppercase tracking-tighter">
                                Missed
                              </span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span className="text-[14px] font-bold text-slate-500 uppercase tracking-tighter">
                                {item.assetType === 'script' ? 'To be read' : 'To be played'}
                              </span>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <AlertCircle className="w-3 h-3 text-red-400" />
                          <span className="text-[14px] font-bold text-red-400 uppercase tracking-tighter">
                            Missing File
                          </span>
                        </div>
                      )}

                      {playingSlotKey === `export-preview-${key}` ? (
                        <div className="flex items-center gap-1 text-[12px] font-mono font-bold leading-none text-emerald-400">
                          <span>{formatTime(currentTime)}</span>
                          <span className="opacity-30">/</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      ) : item.exists ? (
                        <span className="text-[12px] font-mono font-bold text-slate-500 leading-none">
                          {item.assetType === 'script' ? 'read' : (mp3DurationCache.get(item.fileName) || item.duration || '--:--')}
                        </span>
                      ) : null}
                    </div>

                    <div className="text-[14px] font-sans leading-tight space-y-1 mt-1">
                      <div className={cn("break-all leading-tight", isExpanded ? "" : "line-clamp-2")}>
                        <span className="text-slate-500 font-sans font-bold uppercase text-[11px] tracking-wider font-sans">MP3: </span>
                        <span className="text-slate-500 font-mono text-[11px] font-sans">{item.fileName || ""}</span>
                      </div>
                      <div className={cn("break-all select-all leading-tight", isExpanded ? "" : "line-clamp-2")} title={item.targetFileName}>
                        <span className="text-slate-500 font-sans font-bold uppercase text-[11px] tracking-wider font-sans">As: </span>
                        <span className="text-emerald-400 font-mono text-[11px]">{item.targetFileName}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Action button boxes, satisfying rule 3 */}
          <div className="space-y-2 pt-2 px-1">
            <button
              id="btn-copy-play-plan"
              onClick={handleCopyPlan}
              className="w-full h-10 flex items-center justify-center gap-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded border-b-[4px] border-emerald-800 hover:brightness-110 active:border-b-0 active:translate-y-[4px] transition-all font-black uppercase text-[14px] tracking-wide font-sans cursor-pointer select-none shadow-[0_4px_6px_rgba(0,0,0,0.4)]"
            >
              <Copy className="w-4 h-4 shrink-0" />
              <span>{copiedPlan ? "Copied!" : "Copy Plan"}</span>
            </button>

            <button
              id="btn-copy-playlist"
              onClick={handleCopyPlaylist}
              className="w-full h-10 flex items-center justify-center gap-2 px-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded border-b-[4px] border-emerald-900 hover:brightness-110 active:border-b-0 active:translate-y-[4px] transition-all font-black uppercase text-[14px] tracking-wide font-sans cursor-pointer select-none shadow-[0_4px_6px_rgba(0,0,0,0.4)]"
            >
              <Copy className="w-4 h-4 shrink-0" />
              <span>{copiedPlaylist ? "Copied!" : "Copy Playlist"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto space-y-2 pb-4 scroll-smooth"
      >
        {timeline.map((slot, index) => {
          const sForSlot = getSchedulesForSlot(slot);
          const isPre = playMode === 'Prerecord';
          const isPresent = !isPre && isSameMinute(slot, now);
          
          if (sForSlot.length === 0 && !isPresent && !(isPre && index === 0)) return null;

          const isPast = !isPre && isBefore(slot, now) && !isPresent;
          const diffSeconds = !isPre ? Math.abs(differenceInSeconds(now, slot)) : 0;

          return (
            <div key={slot.toISOString()} className="space-y-2">
              {isPre && index === 0 && (
                <div 
                  ref={activeItemRef}
                  className="bg-purple-600 h-6 flex items-center justify-between pl-1 pr-3 rounded shadow-sm border border-purple-500"
                  id="prerecord-start-indicator"
                >
                  <span className="text-[12px] font-black uppercase text-white tracking-normal font-sans flex items-center gap-1.5 font-sans">
                    <CassetteTape className="w-3.5 h-3.5 text-white/90 shrink-0" />
                    Prerecord Start
                  </span>
                  {renderCacheStatusMessage()}
                </div>
              )}

              {isPresent && (
                <div 
                  ref={activeItemRef}
                  className="bg-blue-600 h-6 flex items-center justify-between px-3 rounded shadow-sm border border-blue-500 mx-1"
                  id="now-indicator"
                >
                  <span className="text-[12px] font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5">
                    <RadioTower className="w-3.5 h-3.5 text-white/90 shrink-0" />
                    now
                  </span>
                  {renderCacheStatusMessage()}
                </div>
              )}
              
               {sForSlot.map((s, idx) => {
                 const playedLog = logs.find(l => 
                   l.scheduleId === s.id && 
                   (l.scheduledTime === slot.toISOString() || isSameMinute(parseISO(l.timestamp), slot)) &&
                   l.status === 'played'
                 );
                 const played = !!playedLog && playedLog.playMode !== 'Export';
                 const exported = !!playedLog && playedLog.playMode === 'Export';
                 const slotKey = `${slot.toISOString()}-${s.id}`;
                 const customVal = customScriptTimes[slotKey];
                 const isValid = !customVal || parseCustomTimeText(customVal) !== null;
                 const status = getMP3Status(s.mp3Url);
                 const isVerified = s.assetType === 'script' ? status.exists : (status.exists && status.valid);
                 const isCurrentlyPlaying = playingSlotKey === slotKey;
                 const isUpcoming = !played && !exported && !isPast && !isPresent && diffSeconds <= 600 && isAfter(slot, now);
                 
                 // RECENT MISSED: Less than 30 mins ago, not played or exported
                 // OLD MISSED: More than 30 mins ago, not played or exported
                 const isMissedRecent = isPast && !played && !exported && diffSeconds <= 1800;
                 const isMissedOld = isPast && !played && !exported && diffSeconds > 1800;
                 
                 const fileInCache = availableFilesCache.get(s.mp3Url);
                 const resolvedUrl = fileInCache ? fileInCache.path : s.mp3Url;
                 const isCached = mp3BlobCache.has(resolvedUrl) || mp3BlobCache.has(s.mp3Url) || getPlayableUrl(s.mp3Url).startsWith('blob:');

                 const cardBorderClass = !isVerified
                   ? "border-red-500"
                   : isCurrentlyPlaying || isUpcoming
                     ? (isPre ? "border-purple-600 ring-1 ring-purple-600/30" : "border-blue-600 ring-1 ring-blue-600/30")
                     : exported
                       ? "border-emerald-600"
                       : (isMissedRecent || isMissedOld)
                         ? "border-amber-600"
                         : (isPast && played)
                           ? "border-emerald-600"
                           : "border-slate-500";

                 const cardBgClass = !isVerified
                   ? "bg-red-50/10"
                   : isCurrentlyPlaying
                     ? "bg-white"
                     : isUpcoming
                       ? (isPre ? "bg-purple-50/20" : "bg-blue-50/20")
                       : exported
                         ? "bg-emerald-50/10"
                         : (isMissedRecent || isMissedOld)
                           ? "bg-amber-50/20"
                           : (isPast && played)
                             ? "bg-emerald-50/5"
                             : isPresent
                               ? (isPre ? "bg-purple-50/30" : "bg-blue-50/30")
                               : "bg-white";

                 const cardOpacityClass = (isPast && (played || exported) && !isCurrentlyPlaying)
                   ? "opacity-75"
                   : (isMissedRecent || isMissedOld) && !isCurrentlyPlaying
                     ? "opacity-95"
                     : "opacity-100";
                 
                 const isThisCardDisplayed = playMode === 'Live' && activeLiveReadOverlay && activeLiveReadOverlay.scheduleId === s.id && activeLiveReadOverlay.scheduledTime === slot.toISOString();
                 
                 return (
                   <div key={`${slot.toISOString()}-${s.id}-${idx}`} className="flex items-center gap-3 w-full">
                     <div 
                       onClick={() => isVerified ? handlePlay(s, slot) : null}
                       className={cn(
                         "flex-1 rounded border shadow-sm p-2 transition-all flex flex-col gap-1.5 select-none cursor-pointer hover:shadow hover:border-slate-300 active:scale-[99.5%] active:bg-slate-50/30 text-left",
                         cardBorderClass,
                         cardBgClass,
                         cardOpacityClass
                       )}
                     >
                    {/* Header: Date & Time */}
                    <div className="flex justify-between items-center bg-slate-50 -mx-2 -mt-2 px-2 py-1 rounded-t">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] uppercase font-black text-slate-500 tracking-tighter">
                          {format(slot, 'MMM dd')}
                        </span>
                        <span className={cn(
                          "text-[12px] font-mono font-black",
                          isMissedRecent && !isCurrentlyPlaying ? "text-amber-800" : (isPresent || isCurrentlyPlaying || isUpcoming) ? (isPre ? "text-purple-600" : "text-blue-600") : "text-slate-900"
                        )}>
                          {format(slot, 'HH:mm')}
                        </span>
                      </div>
                     {isCurrentlyPlaying ? (
                       <div className={cn(
                         "flex items-center gap-1 text-[12px] font-black uppercase",
                         isPre ? "text-purple-600" : "text-blue-600"
                       )}>
                         <div className={cn("w-1.5 h-1.5 rounded-full", isPre ? "bg-purple-600" : "bg-blue-600")}></div>
                         {isPre ? "Prerecord" : "Live"}
                       </div>
                     ) : isPresent ? (
                       <span className={cn("text-[12px] text-white px-1 py-0.5 rounded font-black uppercase leading-none", isPre ? "bg-purple-600" : "bg-blue-600")}>Next</span>
                     ) : isUpcoming ? (
                       <span className={cn("text-[12px] text-white px-1 py-0.5 rounded font-black uppercase leading-none shadow-sm animate-pulse", isPre ? "bg-purple-500 shadow-purple-200" : "bg-blue-500 shadow-blue-200")}>Next</span>
                     ) : null}
                   </div>

                   {/* Track Row: Title + Play/Stop Icon */}
                   <div className="flex items-center justify-between gap-2">
                     <div className={cn(
                       "text-[12px] font-bold leading-tight break-words line-clamp-2 flex-1",
                       isCurrentlyPlaying ? (isPre ? "text-purple-700" : "text-blue-700") : "text-slate-800"
                     )}>
                       {s.name}
                     </div>
                     
                     {s.assetType === 'script' ? (
                       <button
                         type="button"
                         onClick={(e) => {
                           e.stopPropagation();
                           handlePlay(s, slot);
                         }}
                         className={cn(
                           "px-3 py-1 text-white font-black text-[14px] uppercase rounded-lg shadow-sm flex items-center gap-1 cursor-pointer transition-all active:scale-95 leading-none",
                           isPre ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700"
                         )}
                       >
                         <FileText className="w-3.5 h-3.5 text-white" />
                         <span>Display</span>
                       </button>
                     ) : (
                       <div 
                         className={cn(
                           "shrink-0 p-1 rounded-full transition-all shadow-sm",
                           !isVerified ? "bg-red-50 text-red-300" :
                           isCurrentlyPlaying ? "bg-slate-900 text-white" :
                           (played || exported) ? "bg-slate-100 text-slate-500" :
                           isMissedRecent ? "bg-slate-500 text-white" :
                           isPresent || isUpcoming ? (isPre ? "bg-purple-600 text-white shadow-md shadow-purple-200" : "bg-blue-600 text-white shadow-md shadow-blue-200") :
                           "bg-slate-700 text-white"
                         )}
                         title={!isVerified ? "Invalid or missing file" : (played || exported) ? "Play Again" : undefined}
                       >
                         {!isVerified ? (
                           <X className="w-2.5 h-2.5" />
                         ) : isCurrentlyPlaying ? (
                           <Square className="w-2.5 h-2.5 fill-current" />
                         ) : (played || exported) ? (
                           <RefreshCw className="w-2.5 h-2.5" />
                         ) : (
                           <Play className="w-2.5 h-2.5 fill-current" />
                         )}
                       </div>
                     )}
                   </div>

                   {/* Status & Details */}
                   <div className="flex items-center justify-between">
                     {isVerified ? (
                       <div className="flex flex-col gap-0.5">
                         <div className="flex items-center gap-1">
                           {exported ? (
                             <>
                               <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                               <span className="text-[14px] font-bold text-emerald-600 uppercase tracking-tighter">
                                 Exported
                               </span>
                             </>
                           ) : (played || isCurrentlyPlaying) ? (
                             <>
                               <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                               <span className="text-[14px] font-bold text-green-600 uppercase tracking-tighter">
                                 Played {playedLog ? format(parseISO(playedLog.timestamp), 'HH:mm') : ''}
                               </span>
                             </>
                           ) : isMissedRecent || isMissedOld ? (
                             <>
                               <AlertCircle className="w-2.5 h-2.5 text-orange-600" />
                               <span className="text-[14px] font-bold text-orange-600 uppercase tracking-tighter">Missed</span>
                             </>
                           ) : (
                             <>
                               <Clock className="w-2.5 h-2.5 text-slate-400" />
                               <span className="text-[14px] font-bold text-slate-400 uppercase tracking-tighter">To be played</span>
                             </>
                           )}
                         </div>
                       </div>
                     ) : (
                       <div className="flex items-center gap-1">
                         <AlertCircle className="w-2.5 h-2.5 text-red-500" />
                         <span className="text-[12px] font-bold text-red-600 uppercase tracking-tighter">
                           {!status.exists ? "File not found." : (s.assetType === 'script' ? "Invalid script file." : "File not mp3.")}
                         </span>
                       </div>
                     )}
                     
                     {isCurrentlyPlaying ? (
                       <div className={cn("flex items-center gap-1 text-[12px] font-mono font-bold leading-none", isPre ? "text-purple-600" : "text-blue-600")}>
                         <span>{formatTime(currentTime)}</span>
                         <span className="opacity-30">/</span>
                         <span>{formatTime(duration)}</span>
                       </div>
                     ) : isVerified ? (
                       <span className="text-[12px] font-mono font-bold text-slate-400 leading-none">
                         {s.assetType === 'script' ? 'read' : (mp3DurationCache.get(s.mp3Url) || s.duration || '--:--')}
                       </span>
                     ) : null}
                   </div>
                 </div>
                 {isThisCardDisplayed && (
                   <div className="shrink-0 flex flex-col items-center justify-center px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
                     <span className="text-[10px] uppercase font-black text-blue-500 tracking-wider">Current Time</span>
                     <div className="flex items-center gap-1.5 mt-0.5">
                       <Clock className="w-4 h-4 text-blue-600" />
                       <span className="font-mono font-black text-[16px] text-blue-700 whitespace-nowrap">
                         {currentTimeText}
                       </span>
                     </div>
                   </div>
                 )}
               </div>
                 );
              })}
            </div>
          );
        })}
      </div>

      {/* No Playback Error Overlay as per user request */}
      {activeLiveReadOverlay && !(window as any).electronAPI && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <LiveReadPopout
            initialFileName={activeLiveReadOverlay.fileName}
            initialScheduleId={activeLiveReadOverlay.scheduleId}
            initialScheduleName={activeLiveReadOverlay.scheduleName}
            initialScheduledTime={activeLiveReadOverlay.scheduledTime}
            isOverlay={true}
            onClose={() => setActiveLiveReadOverlay(null)}
            onLogCommit={(logEntry) => {
              onLog(logEntry);
              setActiveLiveReadOverlay(null);
            }}
          />
        </div>
      )}
    </div>
  );
}


