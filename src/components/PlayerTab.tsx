import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { format, addMinutes, subMinutes, isSameMinute, isBefore, isAfter, startOfMinute, differenceInSeconds, parseISO } from 'date-fns';
import { Play, Pause, Square, CheckCircle, AlertCircle, RefreshCw, Clock, X, Copy, RadioTower, CassetteTape, ListOrdered, Download, Ear, FileText, Volume2 } from 'lucide-react';
import { Interstitial, InterstitialType, LogEntry, Show } from '../types';
import { cn, getMP3Status, parseCustomTimeText, getParsedCustomTimeISO, isTimeInShow, getSortedShows, getShowShade } from '../lib/utils';
import LiveReadPopout from './LiveReadPopout';
import { mp3BlobCache, getPlayableUrl, mp3DurationCache, availableFilesCache } from '../lib/driveService';

interface PlayerTabProps {
  interstitials: Interstitial[];
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
  shows?: Show[];
}

export default function PlayerTab({ 
  interstitials, 
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
  onRefresh,
  shows = []
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
    const handleLogged = (logEntry?: any) => {
      setActiveLiveReadOverlay(null);
      if (logEntry && onLog) {
        onLog(logEntry);
      }
    };
    const handleClosed = () => {
      setActiveLiveReadOverlay(null);
    };

    if ((window as any).electronAPI) {
      (window as any).electronAPI.onLiveReadLogged(handleLogged);
      (window as any).electronAPI.onLiveReadClosed(handleClosed);
    } else {
      window.addEventListener('live-read-logged', handleLogged);
      window.addEventListener('live-read-closed', handleClosed);
    }

    return () => {
      if (!(window as any).electronAPI) {
        window.removeEventListener('live-read-logged', handleLogged);
        window.removeEventListener('live-read-closed', handleClosed);
      }
    };
  }, [onLog]);

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

  // Compute active verified Interstitials and their cache status
  const activeVerifiedInterstitials = useMemo(() => {
    return interstitials.filter(s => {
      if (!s.enabled || !s.mp3Url) return false;
      const status = getMP3Status(s.mp3Url);
      return status.exists && status.valid;
    });
  }, [interstitials]);

  const activeMp3Urls = useMemo(() => {
    return activeVerifiedInterstitials.map(s => s.mp3Url);
  }, [activeVerifiedInterstitials]);

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
        <div id="global-cache-status-caching" className="flex items-center gap-1.5 text-xs font-bold text-white/95 uppercase tracking-wider animate-pulse select-none shrink-0 ml-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 text-white" />
          <span>Caching mp3's</span>
        </div>
      );
    }

    /*
    if (cacheDisplayStatus === 'all-cached') {
      return (
        <div id="global-cache-status-cached" className="flex items-center gap-1.5 text-xs font-bold text-emerald-200 uppercase tracking-wider select-none shrink-0 ml-2">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-300 shrink-0 fill-emerald-500/20" />
          <span>All cached</span>
        </div>
      );
    }
    */

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

  const persistentHeaderRef = useRef<HTMLDivElement>(null);
  const persistentLeftStripRef = useRef<HTMLDivElement>(null);
  const persistentTitleRef = useRef<HTMLDivElement>(null);
  const persistentTextBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const slotElements = container.querySelectorAll('[data-slot-time]');
      let currentActiveShow: Show | null = null;
      const containerRect = container.getBoundingClientRect();
      
      for (let i = 0; i < slotElements.length; i++) {
        const el = slotElements[i] as HTMLElement;
        const rect = el.getBoundingClientRect();
        
        if (rect.top - containerRect.top <= 15 && rect.bottom - containerRect.top > 15) {
          const timeStr = el.getAttribute('data-slot-time');
          if (timeStr) {
            const slotDate = new Date(timeStr);
            const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
            const dayName = daysOrder[slotDate.getDay()];
            const hour = slotDate.getHours();
            const minute = slotDate.getMinutes();
            
            const activeShows = shows.filter(show => 
              isTimeInShow(show, dayName, hour, minute)
            );
            if (activeShows.length > 0) {
              currentActiveShow = activeShows[0];
            }
          }
          break;
        }
      }

      // Update persistent header DOM directly to avoid full-screen React redraw
      if (persistentTitleRef.current && persistentLeftStripRef.current && persistentTextBoxRef.current) {
        const shade = currentActiveShow 
          ? getShowShade(currentActiveShow, getSortedShows(shows))
          : { bg: 'var(--show-shade-none-bg, #f1f5f9)', border: 'var(--show-shade-none-border, #cbd5e1)', title: 'No active show scheduled' };
        
        const newText = currentActiveShow ? currentActiveShow.name : "No Scheduled Show";
        if (persistentTitleRef.current.textContent !== newText) {
          persistentTitleRef.current.textContent = newText;
        }

        persistentLeftStripRef.current.style.backgroundColor = shade.bg;
        persistentLeftStripRef.current.title = shade.title;
        persistentTextBoxRef.current.style.backgroundColor = shade.bg;
        persistentTextBoxRef.current.style.borderColor = shade.border;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    const timer = setTimeout(handleScroll, 300);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
    };
  }, [shows, scrollTrigger]);

  useEffect(() => {
    // Initial call or when dependency changes to ensure header is correctly synced
    const timer = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (container) {
        const slotElements = container.querySelectorAll('[data-slot-time]');
        let currentActiveShow: Show | null = null;
        const containerRect = container.getBoundingClientRect();
        
        for (let i = 0; i < slotElements.length; i++) {
          const el = slotElements[i] as HTMLElement;
          const rect = el.getBoundingClientRect();
          
          if (rect.top - containerRect.top <= 15 && rect.bottom - containerRect.top > 15) {
            const timeStr = el.getAttribute('data-slot-time');
            if (timeStr) {
              const slotDate = new Date(timeStr);
              const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
              const dayName = daysOrder[slotDate.getDay()];
              const hour = slotDate.getHours();
              const minute = slotDate.getMinutes();
              
              const activeShows = shows.filter(show => 
                isTimeInShow(show, dayName, hour, minute)
              );
              if (activeShows.length > 0) {
                currentActiveShow = activeShows[0];
              }
            }
            break;
          }
        }
        
        // Update persistent header DOM directly
        if (persistentTitleRef.current && persistentLeftStripRef.current && persistentTextBoxRef.current) {
          const shade = currentActiveShow 
            ? getShowShade(currentActiveShow, getSortedShows(shows))
            : { bg: 'var(--show-shade-none-bg, #f1f5f9)', border: 'var(--show-shade-none-border, #cbd5e1)', title: 'No active show scheduled' };
          
          const newText = currentActiveShow ? currentActiveShow.name : "No Scheduled Show";
          if (persistentTitleRef.current.textContent !== newText) {
            persistentTitleRef.current.textContent = newText;
          }
          persistentLeftStripRef.current.style.backgroundColor = shade.bg;
          persistentLeftStripRef.current.title = shade.title;
          persistentTextBoxRef.current.style.backgroundColor = shade.bg;
          persistentTextBoxRef.current.style.borderColor = shade.border;
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [shows, scrollTrigger, playMode]);

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

  // Dynamic persistent header padding adjustment to align its right edge with the cards in the scrollable container.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateHeaderAlignment = () => {
      const header = persistentHeaderRef.current;
      if (header) {
        const scrollbarWidth = container.offsetWidth - container.clientWidth;
        // The default card right padding is 4px (pr-1). Add the scrollbar width to align them.
        header.style.paddingRight = `${scrollbarWidth + 4}px`;
      }
    };

    updateHeaderAlignment();

    const resizeObserver = new ResizeObserver(() => {
      updateHeaderAlignment();
    });
    resizeObserver.observe(container);

    const timer = setTimeout(updateHeaderAlignment, 100);
    const timer2 = setTimeout(updateHeaderAlignment, 500);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timer);
      clearTimeout(timer2);
    };
  }, [playMode, timeline]);

  const getInterstitialsForSlot = (slot: Date) => {
    const day = slot.getDay();
    const hour = slot.getHours();
    const minute = slot.getMinutes();
    const dateStr = format(slot, 'yyyy-MM-dd');

    return interstitials.filter(s => {
      if (!s.enabled) return false;
      if (s.type === InterstitialType.ONE_TIME) {
        const hourStr = format(slot, 'HH');
        return s.date === dateStr && s.minute === minute && s.time === hourStr;
      }
      if (s.type === InterstitialType.BASIC_HOURLY) {
        const afterStart = s.startDate ? !isBefore(slot, parseISO(s.startDate)) : true;
        const beforeEnd = s.endDate ? !isAfter(slot, parseISO(s.endDate)) : true;
        return s.minute === minute && afterStart && beforeEnd;
      }
      if (s.type === InterstitialType.ADVANCED) {
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

  const handlePlay = (s: Interstitial, slot: Date) => {
    const slotKey = `${slot.toISOString()}-${s.id}`;
    
    if (s.assetType === 'script') {
      const parts = s.mp3Url ? s.mp3Url.split('/') : [];
      const filename = parts[parts.length - 1] || 'Script';
      
      const interstitialTimeISO = getParsedCustomTimeISO(customScriptTimes[slotKey], slot);

      const slotISO = slot.toISOString();
      const playedLog = logs.find(l => 
        l.interstitialId === s.id && 
        (l.interstitialTime === slotISO || isSameMinute(parseISO(l.timestamp), slot)) &&
        l.status === 'played'
      );

      const payload = {
        name: filename,
        fileName: filename,
        filePath: s.mp3Url,
        interstitialId: s.id,
        interstitialName: s.name,
        interstitialTime: interstitialTimeISO,
        initialLoggedTime: playedLog?.logTimeStamp || playedLog?.timestamp || ''
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
        interstitialTime: slot.toISOString(),
        mp3Name: s.mp3Url,
        interstitialName: s.name,
        interstitialId: s.id,
        status: 'played'
      });
    }).catch(err => {
      console.error('Playback failed', err);
      onLog({
        timestamp: new Date().toISOString(),
        interstitialTime: slot.toISOString(),
        mp3Name: s.mp3Url,
        interstitialName: s.name,
        interstitialId: s.id,
        status: 'failed'
      });
    });
  };

  const isPlayed = (interstitialId: string, slot: Date) => {
    return logs.some(l => 
      l.interstitialId === interstitialId && 
      (l.interstitialTime === slot.toISOString() || isSameMinute(parseISO(l.timestamp), slot)) &&
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

    // 2. Filter & map slot matching interstitials
    const itemsToExport: any[] = [];
    slots.forEach(slot => {
      const sForSlot = getInterstitialsForSlot(slot);
      sForSlot.forEach(s => {
        itemsToExport.push({
          slotTime: format(slot, 'HH:mm'),
          fileName: s.mp3Url,
          interstitialName: s.name,
          interstitialId: s.id,
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
        
        const rawName = item.interstitialName || 'Unnamed Break';
        const safeInterstitialName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
        const sourceFileName = item.fileName || '';
        const dotIndex = sourceFileName.lastIndexOf('.');
        const ext = dotIndex !== -1 ? sourceFileName.substring(dotIndex) : '.mp3';
        const targetFileName = `Break ${itemIdx} - (${safeSlotTime}) - (${safeInterstitialName})${ext}`;
        
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
  }, [playMode, prerecordDate, prerecordLengthMinutes, interstitials]);

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

    // 2. Filter & map slot matching interstitials
    const items: Array<{
      slotTime: string;
      fileName: string;
      interstitialName: string;
      interstitialId: string;
      minute: number;
      exists: boolean;
      targetFileName: string;
      slotISO: string;
      assetType?: 'audio' | 'script';
      approximateReadTime?: string;
    }> = [];

    slots.forEach(slot => {
      const sForSlot = getInterstitialsForSlot(slot);
      sForSlot.forEach(s => {
        const itemIdx = items.length + 1;
        const slotTimeStr = format(slot, 'HH:mm');
        const safeSlotTime = slotTimeStr.replace(/:/g, '-');
        const rawName = s.name || 'Unnamed Break';
        const safeInterstitialName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
        const sourceFileName = s.mp3Url || '';
        const dotIndex = sourceFileName.lastIndexOf('.');
        const ext = dotIndex !== -1 ? sourceFileName.substring(dotIndex) : '.mp3';
        const targetFileName = `Break ${itemIdx} - (${safeSlotTime}) - (${safeInterstitialName})${ext}`;
        const exists = getMP3Status(s.mp3Url).exists;

        items.push({
          slotTime: slotTimeStr,
          fileName: s.mp3Url,
          interstitialName: rawName,
          interstitialId: s.id,
          minute: s.minute,
          exists,
          targetFileName,
          slotISO: slot.toISOString(),
          assetType: s.assetType,
          approximateReadTime: s.approximateReadTime
        });
      });
    });

    return items;
  }, [playMode, prerecordDate, prerecordLengthMinutes, interstitials]);

  const exportActiveShow = useMemo(() => {
    if (playMode !== 'Export' || !prerecordDate) return null;
    const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
    const dayName = daysOrder[prerecordDate.getDay()];
    const hour = prerecordDate.getHours();
    const minute = prerecordDate.getMinutes();
    const activeShows = shows.filter(show => 
      isTimeInShow(show, dayName, hour, minute)
    );
    return activeShows[0] || null;
  }, [playMode, prerecordDate, shows]);

  const exportShade = useMemo(() => {
    if (exportActiveShow) {
      return getShowShade(exportActiveShow, getSortedShows(shows));
    }
    return { bg: '#FFF6BC', border: '#EADA76', title: 'Export Show' };
  }, [exportActiveShow, shows]);

  const hasUnlogged = useMemo(() => {
    if (!itemsToExport) return false;
    return itemsToExport.some(item => {
      const slot = parseISO(item.slotISO);
      const playedLog = logs.find(l => 
        l.interstitialId === item.interstitialId && 
        (l.interstitialTime === item.slotISO || isSameMinute(parseISO(l.timestamp), slot)) &&
        l.status === 'played'
      );
      return !playedLog;
    });
  }, [itemsToExport, logs]);

  const handleLogExportAsPlayed = async () => {
    const unlogged = itemsToExport.filter(item => {
      const slot = parseISO(item.slotISO);
      const playedLog = logs.find(l => 
        l.interstitialId === item.interstitialId && 
        (l.interstitialTime === item.slotISO || isSameMinute(parseISO(l.timestamp), slot)) &&
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
          interstitialTime: item.slotISO,
          mp3Name: item.fileName,
          interstitialName: item.interstitialName,
          interstitialId: item.interstitialId,
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
        m3uLines.push(`#EXTINF:-1,Break ${itemIdx} - ${item.slotTime} - ${item.interstitialName}`);
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
        <div id="export-mode-unconfigured" className="flex flex-col items-center justify-center h-full text-slate-800 p-3 text-center space-y-3 bg-slate-50">
          <div className="w-10 h-10 rounded-full bg-blue-100 border border-blue-300 flex items-center justify-center shrink-0">
            <ListOrdered className="w-5 h-5 text-blue-700" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center justify-center gap-1.5">
              <ListOrdered className="w-4 h-4 text-blue-700" />
              Export Setup
            </h3>
            <p className="text-xs text-slate-600 leading-normal">
              Select air date & duration to export broadcast breaks.
            </p>
          </div>
          <button
            id="btn-configure-export-timeframe"
            onClick={onConfigureTimeframe}
            className="w-full h-10 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded border-b-[4px] border-blue-800 hover:brightness-110 active:border-b-0 active:translate-y-[4px] font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
          >
            Configure
          </button>
        </div>
      );
    }

    return (
      <div id="export-mode-container" className="flex flex-col h-full bg-slate-50">
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto space-y-2 pb-4 scroll-smooth"
        >
          {/* Action stacked buttons above the MP3 list, satisfying layout requests A & B */}
          <div className="sticky top-0 bg-slate-50 z-10 space-y-1.5 pt-1.5 pb-2 px-1.5 border-b border-slate-200">
            <button
              id="bg-btn-execute-export"
              onClick={onExecuteExport}
              className="w-full h-10 flex items-center justify-center gap-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded border-b-[4px] border-blue-800 hover:brightness-110 active:border-b-0 active:translate-y-[4px] transition-all font-black uppercase text-sm tracking-wide font-sans cursor-pointer select-none shadow-sm"
            >
              <Download className="w-5 h-5 shrink-0" />
              <span>Export</span>
            </button>

            <button
              id="btn-log-export-as-played"
              onClick={handleLogExportAsPlayed}
              disabled={!hasUnlogged || isLoggingExports}
              className={cn(
                "w-full h-10 flex items-center justify-center gap-2 px-3 rounded font-black uppercase text-xs tracking-wide font-sans select-none transition-all duration-75 shadow-sm",
                hasUnlogged && !isLoggingExports
                  ? "bg-blue-800 hover:bg-blue-700 text-white border-b-[4px] border-blue-950 hover:brightness-110 active:border-b-0 active:translate-y-[4px] cursor-pointer"
                  : "bg-slate-200 text-slate-400 border-b-[4px] border-slate-300 cursor-not-allowed opacity-65"
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

            {/* Yellow card for the show name */}
            <div 
              className="flex items-stretch gap-2 w-full relative min-h-[2.5rem] h-[2.5rem] z-10 shrink-0 mb-0 font-sans"
              style={{ paddingRight: '4px' }}
            >
              <div 
                className="absolute left-0 top-0 bottom-0 w-1 z-10"
                style={{ backgroundColor: exportShade.bg }}
                title={exportShade.title}
              />
              <div 
                className="text-slate-800 p-1 px-3 rounded-none shadow-sm flex flex-col justify-center text-xs font-black tracking-normal leading-tight ml-1 select-none uppercase border flex-1"
                style={{ 
                  backgroundColor: exportShade.bg, 
                  borderColor: exportShade.border 
                }}
              >
                <div className="line-clamp-2 font-sans">
                  {exportActiveShow ? exportActiveShow.name : "No Scheduled Show"}
                </div>
              </div>
            </div>

            {/* Header indicator bar matching 'mp3's' */}
            <div 
              ref={activeItemRef}
              className="bg-blue-600 h-6 flex items-center justify-start px-3 rounded shadow-sm border border-blue-500"
              id="export-start-indicator"
            >
              <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5">
                <ListOrdered className="w-3.5 h-3.5 text-white/90 shrink-0" />
                mp3's
              </span>
            </div>
          </div>

          {/* Cards for each item in the export timeframe */}
          <div className="space-y-2 px-1">
            {itemsToExport.length === 0 ? (
              <div className="p-3 bg-white border border-slate-300 border-dashed rounded text-center text-xs text-slate-500 mx-1">
                No active scheduled breaks found in timeframe.
              </div>
            ) : (
              itemsToExport.map((item, idx) => {
                const key = `${item.interstitialId}-${item.slotTime}-${idx}`;
                const isExpanded = isAdmin && !!expandedCards[key];

                const slot = parseISO(item.slotISO);

                const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
                const dayName = daysOrder[slot.getDay()];
                const hour = slot.getHours();
                const minute = slot.getMinutes();

                const activeShowsForSlot = shows.filter(show => 
                  isTimeInShow(show, dayName, hour, minute)
                );
                const currentShow = activeShowsForSlot[0] || null;

                let prevShow: Show | null = null;
                if (idx === 0) {
                  prevShow = exportActiveShow;
                } else {
                  const prevSlot = parseISO(itemsToExport[idx - 1].slotISO);
                  const prevDayName = daysOrder[prevSlot.getDay()];
                  const prevActiveShows = shows.filter(show => 
                    isTimeInShow(show, prevDayName, prevSlot.getHours(), prevSlot.getMinutes())
                  );
                  prevShow = prevActiveShows[0] || null;
                }

                const showChanged = currentShow ? (prevShow?.id !== currentShow.id) : (prevShow !== null);

                const playedLog = logs.find(l => 
                  l.interstitialId === item.interstitialId && 
                  (l.interstitialTime === item.slotISO || isSameMinute(parseISO(l.timestamp), slot)) &&
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
                  ? "bg-red-50 border-red-300 hover:border-red-400"
                  : exported
                    ? "bg-blue-50 border-blue-300 hover:border-blue-400"
                    : played
                      ? "bg-green-50 border-green-300 hover:border-green-400"
                      : isMissedRecent || isMissedOld
                        ? "bg-amber-50 border-amber-300 hover:border-amber-400"
                        : "bg-white border-slate-200 hover:border-slate-300";

                return (
                  <Fragment key={`export-slot-${key}`}>
                    {showChanged && (() => {
                      const shade = currentShow 
                        ? getShowShade(currentShow, getSortedShows(shows)) 
                        : { bg: 'var(--show-shade-none-bg, #f1f5f9)', border: 'var(--show-shade-none-border, #cbd5e1)', title: 'No Scheduled Show' };
                      return (
                        <div key={`export-show-header-${idx}`} className="flex items-stretch gap-2 w-full pr-1 relative min-h-[1.75rem] my-1 z-10 font-sans">
                          <div 
                            className="absolute left-0 top-[-6px] bottom-[-6px] w-1 animate-fade-in z-10" 
                            style={{ backgroundColor: shade.bg }} 
                            title={shade.title}
                          />
                          <div 
                            className="text-slate-800 p-1 px-3 rounded-none shadow-sm flex flex-col justify-center text-xs font-black tracking-normal leading-tight ml-1 select-none uppercase border flex-1"
                            style={{ backgroundColor: shade.bg, borderColor: shade.border }}
                          >
                            <div className="line-clamp-2 font-sans">
                              {currentShow ? currentShow.name : "No Scheduled Show"}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div 
                      key={key} 
                      title={`MP3: ${item.fileName || ""}\nAs: ${item.targetFileName || ""}`}
                      className={cn(
                        "rounded border shadow-sm p-2 transition-all flex flex-col gap-1.5 mx-1 text-left select-none relative",
                        bgClass,
                      )}
                      style={{
                        borderLeftWidth: '4px',
                        borderLeftColor: item.assetType === 'script'
                          ? (item.exists ? '#3b82f6' : '#f43f5e')
                          : (item.exists ? '#a855f7' : '#f43f5e')
                      }}
                    >
                    {/* Header: Date & Time in full-width strip */}
                    <div className="flex justify-between items-center bg-slate-100/90 -mx-2 -mt-2 px-2.5 py-1 rounded-t border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase font-black text-slate-600 tracking-tighter">
                          {format(slot, 'MMM dd')}
                        </span>
                        <span className="text-xs font-mono font-black text-blue-700">
                          {item.slotTime}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {playingSlotKey === `export-preview-${key}` ? (
                          <div className="flex items-center gap-1 text-xs font-black uppercase text-blue-700">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                            Preview
                          </div>
                        ) : isPresent ? (
                          <span className="text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none bg-blue-600">Next</span>
                        ) : isUpcoming ? (
                          <span className="text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none shadow-sm bg-blue-600">Next</span>
                        ) : null}
                      </div>
                    </div>

                    {/* Track Row: Title + Play/Stop Icon */}
                    <div className="flex items-center justify-between gap-2">
                      <div className={cn(
                        "text-xs font-bold leading-tight break-words line-clamp-2 flex-1",
                        playingSlotKey === `export-preview-${key}` ? "text-blue-700" : "text-slate-800"
                      )}>
                        {item.interstitialName}
                      </div>

                      <div className="shrink-0">
                        {item.assetType === 'script' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const filename = item.fileName.split('/').pop() || 'Script';
                              const interstitialTimeISO = getParsedCustomTimeISO(
                                customScriptTimes[`${item.interstitialId}-${item.slotISO}`], 
                                parseISO(item.slotISO)
                              );

                              const payload = {
                                name: filename,
                                fileName: filename,
                                filePath: item.fileName,
                                interstitialId: item.interstitialId,
                                interstitialName: item.interstitialName,
                                interstitialTime: interstitialTimeISO,
                                initialLoggedTime: playedLog?.logTimeStamp || playedLog?.timestamp || ''
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
                                ? "bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200" 
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
                                ? "bg-blue-100 border-blue-300 text-blue-700"
                                : "bg-slate-200 hover:bg-slate-300 text-slate-700 border-transparent"
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
                            className="p-1 rounded-full bg-red-100 text-red-600 border border-red-300 flex items-center justify-center shadow-sm"
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
                              <CheckCircle className="w-3 h-3 text-blue-600" />
                              <span className="text-xs font-bold text-blue-700 uppercase tracking-tighter">
                                Exported
                              </span>
                            </>
                          ) : played ? (
                            <>
                              <CheckCircle className="w-3 h-3 text-green-600" />
                              <span className="text-xs font-bold text-green-700 uppercase tracking-tighter">
                                {item.assetType === 'script' ? 'Read' : 'Played'} {playedLog ? format(parseISO(playedLog.logTimeStamp || playedLog.timestamp), 'HH:mm') : ''}
                              </span>
                            </>
                          ) : isMissedRecent || isMissedOld ? (
                            <>
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              <span className="text-xs font-bold text-amber-700 uppercase tracking-tighter">
                                Missed
                              </span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">
                                {`Break ${idx + 1}`}
                              </span>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <AlertCircle className="w-3 h-3 text-red-600" />
                          <span className="text-xs font-bold text-red-600 uppercase tracking-tighter">
                            Missing File
                          </span>
                        </div>
                      )}

                      {playingSlotKey === `export-preview-${key}` ? (
                        <div className="flex items-center gap-1 text-xs font-mono font-bold leading-none text-emerald-700">
                          <span>{formatTime(currentTime)}</span>
                          <span className="opacity-40">/</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      ) : item.exists ? (
                        <span className="text-xs font-mono font-bold text-slate-500 leading-none">
                          {item.assetType === 'script' ? (item.approximateReadTime ? (item.approximateReadTime.startsWith('~') ? item.approximateReadTime : `~${item.approximateReadTime}`) : '-:--') : (mp3DurationCache.get(item.fileName) || item.duration || '--:--')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Fragment>
              );
            })
            )}
          </div>

          {/* Action button boxes, satisfying rule 3 */}
          <div className="space-y-2 pt-2 px-1">
            <button
              id="btn-copy-play-plan"
              onClick={handleCopyPlan}
              className="w-full h-10 flex items-center justify-center gap-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded border-b-[4px] border-blue-800 hover:brightness-110 active:border-b-0 active:translate-y-[4px] transition-all font-black uppercase text-xs tracking-wide font-sans cursor-pointer select-none shadow-sm"
            >
              <Copy className="w-4 h-4 shrink-0" />
              <span>{copiedPlan ? "Copied!" : "Copy Plan"}</span>
            </button>

            <button
              id="btn-copy-playlist"
              onClick={handleCopyPlaylist}
              className="w-full h-10 flex items-center justify-center gap-2 px-3 bg-blue-700 hover:bg-blue-600 text-white rounded border-b-[4px] border-blue-900 hover:brightness-110 active:border-b-0 active:translate-y-[4px] transition-all font-black uppercase text-xs tracking-wide font-sans cursor-pointer select-none shadow-sm"
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
    <div className="flex flex-col h-full relative">
      {(() => {
        const initialActiveShow = timeline.length > 0 ? (() => {
          const firstSlot = timeline[0];
          const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
          const dayName = daysOrder[firstSlot.getDay()];
          const hour = firstSlot.getHours();
          const minute = firstSlot.getMinutes();
          const activeShows = shows.filter(show => 
            isTimeInShow(show, dayName, hour, minute)
          );
          return activeShows[0] || null;
        })() : null;

        const initialShade = initialActiveShow 
          ? getShowShade(initialActiveShow, getSortedShows(shows))
          : { bg: 'var(--show-shade-none-bg, #f1f5f9)', border: 'var(--show-shade-none-border, #cbd5e1)', title: 'No active show scheduled' };

        return (
          <div 
            ref={persistentHeaderRef}
            className="flex items-stretch gap-2 w-full relative min-h-[2.5rem] h-[2.5rem] z-10 shrink-0 mb-0 font-sans"
            style={{ paddingRight: '4px' }}
          >
            <div 
              ref={persistentLeftStripRef}
              className="absolute left-0 top-0 bottom-0 w-1 z-10"
              style={{ backgroundColor: initialShade.bg }}
              title={initialShade.title}
            />
            <div 
              ref={persistentTextBoxRef}
              className="text-slate-800 p-1 px-3 rounded-none shadow-sm flex flex-col justify-center text-xs font-black tracking-normal leading-tight ml-1 select-none uppercase border flex-1"
              style={{ 
                backgroundColor: initialShade.bg, 
                borderColor: initialShade.border 
              }}
            >
              <div ref={persistentTitleRef} className="line-clamp-2 font-sans">
                {initialActiveShow ? initialActiveShow.name : "No Scheduled Show"}
              </div>
            </div>
          </div>
        );
      })()}

      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pb-4 scroll-smooth relative"
      >
        {timeline.map((slot, index) => {
          const sForSlot = getInterstitialsForSlot(slot);
          const isPre = playMode === 'Prerecord';
          const isPresent = !isPre && isSameMinute(slot, now);

          const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
          const dayName = daysOrder[slot.getDay()];
          const hour = slot.getHours();
          const minute = slot.getMinutes();

          const activeShows = shows.filter(show => 
            isTimeInShow(show, dayName, hour, minute)
          );
          const activeShow = activeShows[0];
          const showShade = activeShow ? getShowShade(activeShow, getSortedShows(shows)) : null;

          const startingShows = shows.filter(show => 
            show.day === dayName && 
            show.startHour === hour && 
            show.startMinute === minute
          );

          const continuingShows = (hour === 0 && minute === 0) ? shows.filter(show => 
            isTimeInShow(show, dayName, 0, 0) &&
            !(show.day === dayName && show.startHour === 0 && show.startMinute === 0)
          ) : [];
          
          if (sForSlot.length === 0 && !isPresent && !(isPre && index === 0) && startingShows.length === 0 && continuingShows.length === 0) return null;

          const isPast = !isPre && isBefore(slot, now) && !isPresent;
          const diffSeconds = !isPre ? Math.abs(differenceInSeconds(now, slot)) : 0;

          return (
            <div 
              key={slot.toISOString()} 
              data-slot-time={slot.toISOString()} 
              className="space-y-2 py-1"
              style={showShade ? { backgroundColor: showShade.bg } : undefined}
            >
              {(!isPre || index !== 0) && startingShows.map(show => {
                const shade = getShowShade(show, getSortedShows(shows));
                return (
                  <div key={`show-start-${show.id}`} className="flex items-stretch gap-2 w-full pr-1 relative min-h-[1.75rem] -mb-2 z-10">
                    <div 
                      className="absolute left-0 top-[-6px] bottom-[-6px] w-1 animate-fade-in z-10" style={{ backgroundColor: shade.bg }} 
                      title={shade.title}
                    />
                    <div 
                      className="text-slate-800 p-1 px-3 rounded-none shadow-sm flex flex-col justify-center text-xs font-black tracking-normal leading-tight ml-1 select-none uppercase border flex-1"
                      style={{ backgroundColor: shade.bg, borderColor: shade.border }}
                    >
                      <div className="line-clamp-2 font-sans">
                        {show.name}
                      </div>
                    </div>
                  </div>
                );
              })}

              {(!isPre || index !== 0) && continuingShows.map(show => {
                const shade = getShowShade(show, getSortedShows(shows));
                return (
                  <div key={`show-cont-${show.id}`} className="flex items-stretch gap-2 w-full pr-1 relative min-h-[1.75rem] -mb-2 z-10">
                    <div 
                      className="absolute left-0 top-[-6px] bottom-[-6px] w-1 animate-fade-in z-10" style={{ backgroundColor: shade.bg }} 
                      title={shade.title}
                    />
                    <div 
                      className="text-slate-800 p-1 px-3 rounded-none shadow-sm flex flex-col justify-center text-xs font-black tracking-normal leading-tight ml-1 select-none uppercase border flex-1"
                      style={{ backgroundColor: shade.bg, borderColor: shade.border }}
                    >
                      <div className="line-clamp-2 font-sans">
                        (cont.) {show.name}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isPre && index === 0 && (
                <div className="relative w-full pr-1">
                  {(() => {
                    const activeShowsForPre = shows.filter(show => 
                      isTimeInShow(show, dayName, hour, minute)
                    );
                    const activeShowForPre = activeShowsForPre[0];
                    const shadeForPre = activeShowForPre ? getShowShade(activeShowForPre, getSortedShows(shows)) : null;
                    return shadeForPre ? (
                      <div 
                        className="absolute left-0 top-[-2px] bottom-[-2px] w-1 animate-fade-in z-10" style={{ backgroundColor: shadeForPre.bg }} 
                        title={shadeForPre.title}
                      />
                    ) : null;
                  })()}
                  <div 
                    ref={activeItemRef}
                    className="bg-emerald-600 h-6 flex items-center justify-between pl-1 pr-3 rounded shadow-sm border border-emerald-500 ml-2"
                    id="prerecord-start-indicator"
                  >
                    <span className="text-xs font-black uppercase text-white tracking-normal font-sans flex items-center gap-1.5 font-sans">
                      <CassetteTape className="w-3.5 h-3.5 text-white/90 shrink-0" />
                      Prerecord Start
                    </span>
                    {renderCacheStatusMessage()}
                  </div>
                </div>
              )}

              {isPresent && (
                <div className="relative w-full pr-1">
                  {(() => {
                    const activeShowsForNow = shows.filter(show => 
                      isTimeInShow(show, dayName, hour, minute)
                    );
                    const activeShowForNow = activeShowsForNow[0];
                    const shadeForNow = activeShowForNow ? getShowShade(activeShowForNow, getSortedShows(shows)) : null;
                    return shadeForNow ? (
                      <div 
                        className="absolute left-0 top-[-2px] bottom-[-2px] w-1 animate-fade-in z-10" style={{ backgroundColor: shadeForNow.bg }} 
                        title={shadeForNow.title}
                      />
                    ) : null;
                  })()}
                  <div 
                    ref={activeItemRef}
                    className="bg-blue-600 h-6 flex items-center justify-between px-3 rounded shadow-sm border border-blue-500 ml-2"
                    id="now-indicator"
                  >
                    <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5">
                      <RadioTower className="w-3.5 h-3.5 text-white/90 shrink-0" />
                      now
                    </span>
                    {renderCacheStatusMessage()}
                  </div>
                </div>
              )}
              
               {sForSlot.map((s, idx) => {
                 const playedLog = logs.find(l => 
                   l.interstitialId === s.id && 
                   (l.interstitialTime === slot.toISOString() || isSameMinute(parseISO(l.timestamp), slot)) &&
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
                  const activeShows = shows.filter(show => 
                    isTimeInShow(show, dayName, hour, minute)
                  );
                  const activeShow = activeShows[0];
                  const sortedShows = getSortedShows(shows);
                  const showShade = activeShow ? getShowShade(activeShow, sortedShows) : null;
                 const resolvedUrl = fileInCache ? fileInCache.path : s.mp3Url;
                 const isCached = mp3BlobCache.has(resolvedUrl) || mp3BlobCache.has(s.mp3Url) || getPlayableUrl(s.mp3Url).startsWith('blob:');

                 const cardBorderClass = !isVerified
                   ? "border-red-500"
                   : isCurrentlyPlaying || isUpcoming
                     ? (isPre ? "border-emerald-600 ring-1 ring-emerald-600/30" : "border-purple-600 ring-1 ring-purple-600/30")
                     : exported
                       ? "border-emerald-600"
                       : (isMissedRecent || isMissedOld)
                         ? "border-amber-600"
                         : (isPast && played)
                           ? "border-emerald-600"
                           : "border-slate-500";

                 const cardBgClass = !isVerified
                   ? "bg-[#fef2f2]"
                   : isCurrentlyPlaying
                     ? "bg-white"
                     : isUpcoming
                       ? (isPre ? "bg-[#f0fdf4]" : "bg-[#faf5ff]")
                       : exported
                         ? "bg-[#f0fdf4]"
                         : (isMissedRecent || isMissedOld)
                           ? "bg-[#fffbeb]"
                           : (isPast && played)
                             ? "bg-white"
                             : isPresent
                               ? (isPre ? "bg-[#f0fdf4]" : "bg-[#faf5ff]")
                               : "bg-white";

                 const cardOpacityClass = (isPast && (played || exported) && !isCurrentlyPlaying)
                   ? "opacity-75"
                   : (isMissedRecent || isMissedOld) && !isCurrentlyPlaying
                     ? "opacity-95"
                     : "opacity-100";
                 
                 const isThisCardDisplayed = playMode === 'Live' && activeLiveReadOverlay && activeLiveReadOverlay.interstitialId === s.id && activeLiveReadOverlay.interstitialTime === slot.toISOString();
                 
                 return (
                   <div key={`${slot.toISOString()}-${s.id}-${idx}`} className="flex items-stretch gap-2 w-full pr-1 relative min-h-[4.5rem]">
                     {(() => {
                       const activeShows = shows.filter(show => 
                         isTimeInShow(show, dayName, hour, minute)
                       );
                       const activeShow = activeShows[0];
                       return activeShow ? (
                         <div 
                           className="absolute left-0 top-[-6px] bottom-[-6px] w-1 animate-fade-in z-10" style={{ backgroundColor: showShade?.bg }} 
                           title={showShade?.title}
                         />
                       ) : null;
                     })()}
                     <div 
                       onClick={() => isVerified ? handlePlay(s, slot) : null}
                       style={{
                         borderLeftColor: !isVerified
                           ? '#f43f5e'
                           : s.assetType === 'script'
                             ? '#3b82f6'
                             : '#a855f7'
                       }}
                       className={cn(
                         "flex-1 rounded border shadow-sm p-2 transition-all flex flex-col gap-1.5 select-none cursor-pointer hover:shadow hover:border-slate-300 active:scale-[99.5%] active:bg-slate-50/30 text-left",
                         activeShow ? "ml-1" : "", "border-l-[4px] rounded-l-none",
                         cardBorderClass,
                         cardBgClass,
                         cardOpacityClass
                       )}
                     >
                    {/* Header: Date & Time */}
                    <div className="flex justify-between items-center bg-slate-50 -mx-2 -mt-2 px-2 py-1 rounded-t">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase font-black text-slate-600 tracking-tighter">
                          {format(slot, 'MMM dd')}
                        </span>
                        <span className={cn(
                          "text-xs font-mono font-black",
                          isMissedRecent && !isCurrentlyPlaying ? "text-amber-800" : (isPre ? "text-emerald-600" : "text-purple-600")
                        )}>
                          {format(slot, 'HH:mm')}
                        </span>
                      </div>
                     {isCurrentlyPlaying ? (
                       <div className={cn(
                         "flex items-center gap-1 text-xs font-black uppercase",
                         isPre ? "text-emerald-600" : "text-purple-600"
                       )}>
                         <div className={cn("w-1.5 h-1.5 rounded-full", isPre ? "bg-emerald-600" : "bg-purple-600")}></div>
                         {isPre ? "Prerecord" : "Live"}
                       </div>
                     ) : isPresent ? (
                       <span className={cn("text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none", isPre ? "bg-emerald-600" : "bg-purple-600")}>Next</span>
                     ) : isUpcoming ? (
                       <span className={cn("text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none shadow-sm animate-pulse", isPre ? "bg-emerald-500 shadow-emerald-200" : "bg-purple-500 shadow-purple-200")}>Next</span>
                     ) : null}
                   </div>

                   {/* Track Row: Title + Play/Stop Icon */}
                   <div className="flex items-center justify-between gap-2">
                     <div className={cn(
                       "text-xs font-bold leading-tight break-words line-clamp-2 flex-1",
                       isCurrentlyPlaying ? (isPre ? "text-emerald-700" : "text-purple-700") : "text-slate-800"
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
                           "shrink-0 p-1 rounded-full transition-all shadow-sm cursor-pointer",
                           !isVerified ? "bg-red-50 text-red-300" :
                           isCurrentlyPlaying ? "bg-slate-900 text-white" :
                           (played || exported) ? "bg-slate-100 text-slate-500" :
                           isMissedRecent ? "bg-slate-500 text-white" :
                           isPresent || isUpcoming ? (isPre ? "bg-emerald-600 text-white shadow-md shadow-emerald-200" : "bg-purple-600 text-white shadow-md shadow-purple-200") :
                           "bg-slate-700 text-white"
                         )}
                         title={!isVerified ? "Invalid or missing file" : (played || exported) ? "Read Again" : "Display Script"}
                       >
                         {!isVerified ? (
                           <X className="w-2.5 h-2.5" />
                         ) : (played || exported) ? (
                           <RefreshCw className="w-2.5 h-2.5" />
                         ) : isCurrentlyPlaying ? (
                           <Square className="w-2.5 h-2.5 fill-current" />
                         ) : (
                           <FileText className="w-2.5 h-2.5" />
                         )}
                       </button>
                     ) : (
                       <div 
                         className={cn(
                           "shrink-0 p-1 rounded-full transition-all shadow-sm",
                           !isVerified ? "bg-red-50 text-red-300" :
                           isCurrentlyPlaying ? "bg-slate-900 text-white" :
                           (played || exported) ? "bg-slate-100 text-slate-500" :
                           isMissedRecent ? "bg-slate-500 text-white" :
                           isPresent || isUpcoming ? (isPre ? "bg-emerald-600 text-white shadow-md shadow-emerald-200" : "bg-purple-600 text-white shadow-md shadow-purple-200") :
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
                               <CheckCircle className={cn("w-2.5 h-2.5", isPre ? "text-emerald-500" : "text-purple-500")} />
                               <span className={cn("text-xs font-bold uppercase tracking-tighter", isPre ? "text-emerald-600" : "text-purple-600")}>
                                 Exported
                               </span>
                             </>
                           ) : (played || isCurrentlyPlaying) ? (
                             <>
                               <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                               <span className="text-xs font-bold text-green-600 uppercase tracking-tighter">
                                 {s.assetType === 'script' ? 'Read' : 'Played'} {playedLog ? format(parseISO(playedLog.logTimeStamp || playedLog.timestamp), 'HH:mm') : format(new Date(), 'HH:mm')}
                               </span>
                             </>
                           ) : isMissedRecent || isMissedOld ? (
                             <>
                               <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                               <span className="text-xs font-bold text-amber-700 uppercase tracking-tighter">Missed</span>
                             </>
                           ) : (
                             <>
                               <Clock className="w-2.5 h-2.5 text-slate-500" />
                               <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">{s.assetType === 'script' ? "To be read" : "To be played"}</span>
                             </>
                           )}
                         </div>
                       </div>
                     ) : (
                       <div className="flex items-center gap-1">
                         <AlertCircle className="w-2.5 h-2.5 text-red-500" />
                         <span className="text-xs font-bold text-red-600 uppercase tracking-tighter">
                           {!status.exists ? "File not found." : (s.assetType === 'script' ? "Invalid script file." : "File not mp3.")}
                         </span>
                       </div>
                     )}
                     
                     {isCurrentlyPlaying ? (
                       <div className={cn("flex items-center gap-1 text-xs font-mono font-bold leading-none", isPre ? "text-emerald-600" : "text-purple-600")}>
                         <span>{formatTime(currentTime)}</span>
                         <span className="opacity-30">/</span>
                         <span>{formatTime(duration)}</span>
                       </div>
                     ) : isVerified ? (
                       <span className="text-xs font-mono font-bold text-slate-500 leading-none">
                         {s.assetType === 'script' ? (s.approximateReadTime ? (s.approximateReadTime.startsWith('~') ? s.approximateReadTime : `~${s.approximateReadTime}`) : '-:--') : (mp3DurationCache.get(s.mp3Url) || s.duration || '--:--')}
                       </span>
                     ) : null}
                   </div>
                 </div>
                 {isThisCardDisplayed && (
                   <div className="shrink-0 flex flex-col items-center justify-center px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
                     <span className="text-[10px] uppercase font-black text-blue-500 tracking-wider">Current Time</span>
                     <div className="flex items-center gap-1.5 mt-0.5">
                       <Clock className="w-4 h-4 text-blue-600" />
                       <span className="font-mono font-black text-sm text-blue-700 whitespace-nowrap">
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
            initialInterstitialId={activeLiveReadOverlay.interstitialId}
            initialInterstitialName={activeLiveReadOverlay.interstitialName}
            initialInterstitialTime={activeLiveReadOverlay.interstitialTime}
            initialLoggedTime={activeLiveReadOverlay.initialLoggedTime}
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


