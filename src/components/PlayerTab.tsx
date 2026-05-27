import { useState, useEffect, useMemo, useRef } from 'react';
import { format, addMinutes, subMinutes, isSameMinute, isBefore, isAfter, startOfMinute, differenceInSeconds, parseISO } from 'date-fns';
import { Play, Square, CheckCircle, AlertCircle, RefreshCw, Clock, X } from 'lucide-react';
import { Schedule, ScheduleType, LogEntry } from '../types';
import { cn, getMP3Status } from '../lib/utils';
import { mp3BlobCache, getPlayableUrl, mp3DurationCache, availableFilesCache } from '../lib/driveService';

interface PlayerTabProps {
  schedules: Schedule[];
  logs: LogEntry[];
  onLog: (entry: LogEntry) => void;
  now: Date;
  syncTime: Date;
  scrollTrigger: number;
  playMode?: 'Live' | 'Prerecord';
  prerecordDate?: Date | null;
  prerecordLengthMinutes?: number;
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
  prerecordLengthMinutes = 240
}: PlayerTabProps) {
  const [playingAudio, setPlayingAudio] = useState<HTMLAudioElement | null>(null);
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingSlotKey, setPlayingSlotKey] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

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
                  className="bg-purple-600 h-6 flex items-center justify-between px-3 rounded shadow-sm border border-purple-500 mx-1"
                  id="prerecord-start-indicator"
                >
                  <span className="text-[12px] font-black uppercase text-white tracking-widest font-sans">Prerecord Start</span>
                  {renderCacheStatusMessage()}
                </div>
              )}

              {isPresent && (
                <div 
                  ref={activeItemRef}
                  className="bg-blue-600 h-6 flex items-center justify-between px-3 rounded shadow-sm border border-blue-500 mx-1"
                  id="now-indicator"
                >
                  <span className="text-[12px] font-black uppercase text-white tracking-widest font-sans">now</span>
                  {renderCacheStatusMessage()}
                </div>
              )}
              
              {sForSlot.map((s, idx) => {
                const playedLog = logs.find(l => 
                  l.scheduleId === s.id && 
                  (l.scheduledTime === slot.toISOString() || isSameMinute(parseISO(l.timestamp), slot)) &&
                  l.status === 'played'
                );
                const played = !!playedLog;
                const slotKey = `${slot.toISOString()}-${s.id}`;
                const status = getMP3Status(s.mp3Url);
                const isVerified = status.exists && status.valid;
                const isCurrentlyPlaying = playingSlotKey === slotKey;
                const isUpcoming = !played && !isPast && !isPresent && diffSeconds <= 600 && isAfter(slot, now);
                
                // RECENT MISSED: Less than 30 mins ago, not played
                // OLD MISSED: More than 30 mins ago, not played
                const isMissedRecent = isPast && !played && diffSeconds <= 1800;
                const isMissedOld = isPast && !played && diffSeconds > 1800;
                
                const fileInCache = availableFilesCache.get(s.mp3Url);
                const resolvedUrl = fileInCache ? fileInCache.path : s.mp3Url;
                const isCached = mp3BlobCache.has(resolvedUrl) || mp3BlobCache.has(s.mp3Url) || getPlayableUrl(s.mp3Url).startsWith('blob:');

                const cardBorderClass = !isVerified
                  ? "border-red-500"
                  : isCurrentlyPlaying || isUpcoming
                    ? (isPre ? "border-purple-600 ring-1 ring-purple-600/30" : "border-blue-600 ring-1 ring-blue-600/30")
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
                      : (isMissedRecent || isMissedOld)
                        ? "bg-amber-50/20"
                        : (isPast && played)
                          ? "bg-emerald-50/5"
                          : isPresent
                            ? (isPre ? "bg-purple-50/30" : "bg-blue-50/30")
                            : "bg-white";

                const cardOpacityClass = (isPast && played && !isCurrentlyPlaying)
                  ? "opacity-75"
                  : (isMissedRecent || isMissedOld) && !isCurrentlyPlaying
                    ? "opacity-95"
                    : "opacity-100";
                
                return (
                  <div 
                    key={`${slot.toISOString()}-${s.id}-${idx}`}
                    onClick={() => isVerified ? handlePlay(s, slot) : null}
                    className={cn(
                      "rounded border shadow-sm p-2 transition-all flex flex-col gap-1.5 select-none cursor-pointer hover:shadow hover:border-slate-300 active:scale-[99.5%] active:bg-slate-50/30 text-left",
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
                  
                  <div 
                    className={cn(
                      "shrink-0 p-1 rounded-full transition-all shadow-sm",
                      !isVerified ? "bg-red-50 text-red-300" :
                      isCurrentlyPlaying ? "bg-slate-900 text-white" :
                      played ? "bg-slate-100 text-slate-500" :
                      isMissedRecent ? "bg-slate-500 text-white" :
                      isPresent || isUpcoming ? (isPre ? "bg-purple-600 text-white shadow-md shadow-purple-200" : "bg-blue-600 text-white shadow-md shadow-blue-200") :
                      "bg-slate-700 text-white"
                    )}
                    title={!isVerified ? "Invalid or missing file" : played ? "Play Again" : undefined}
                  >
                    {!isVerified ? (
                      <X className="w-2.5 h-2.5" />
                    ) : isCurrentlyPlaying ? (
                      <Square className="w-2.5 h-2.5 fill-current" />
                    ) : played ? (
                      <RefreshCw className="w-2.5 h-2.5" />
                    ) : (
                      <Play className="w-2.5 h-2.5 fill-current" />
                    )}
                  </div>
                </div>

                {/* Status & Details */}
                <div className="flex items-center justify-between">
                  {isVerified ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1">
                        {(played || isCurrentlyPlaying) ? (
                          <>
                            <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                            <span className="text-[12px] font-bold text-green-600 uppercase tracking-tighter">
                              Played {playedLog ? format(parseISO(playedLog.timestamp), 'HH:mm') : ''}
                            </span>
                          </>
                        ) : isMissedRecent || isMissedOld ? (
                          <>
                            <AlertCircle className="w-2.5 h-2.5 text-orange-600" />
                            <span className="text-[12px] font-bold text-orange-600 uppercase tracking-tighter">Missed</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                            <span className="text-[12px] font-bold text-slate-400 uppercase tracking-tighter">To be played</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <AlertCircle className="w-2.5 h-2.5 text-red-500" />
                      <span className="text-[12px] font-bold text-red-600 uppercase tracking-tighter">
                        {!status.exists ? "File not found." : "File not mp3."}
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
                      {mp3DurationCache.get(s.mp3Url) || s.duration || '--:--'}
                    </span>
                  ) : null}
                </div>
              </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* No Playback Error Overlay as per user request */}
    </div>
  );
}


