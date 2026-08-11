import { useState, useEffect, useLayoutEffect, useMemo, useRef, Fragment } from 'react';
import { format, addMinutes, subMinutes, subDays, isSameMinute, isBefore, isAfter, startOfMinute, differenceInSeconds, parseISO } from 'date-fns';
import { Play, Pause, Square, CheckCircle, AlertCircle, RefreshCw, Clock, X, Copy, RadioTower, CassetteTape, ListOrdered, Download, Ear, FileText, Volume2, ListMusic, ChevronUp, ChevronDown, RotateCcw, Music, Flag, ListPlus } from 'lucide-react';
import { Interstitial, InterstitialType, LogEntry, Show } from '../types';
import { cn, getMP3Status, parseCustomTimeText, getParsedCustomTimeISO, isTimeInShow, getSortedShows, getShowShade, readMp3ID3Metadata, Mp3ID3Metadata, formatDuration, formatTotalTrackTime } from '../lib/utils';
import LiveReadPopout from './LiveReadPopout';
import { WaveformVisualizer } from './WaveformVisualizer';
import { mp3BlobCache, getPlayableUrl, mp3DurationCache, availableFilesCache, updateAudioCache, getAccessToken, driveFileNameCache, loadPlaylistTracksFromDrive, saveShowPlaylistLogToDrive, loadShowPlaylistLogFromDrive, formatShowPlaylistLogFileName, getSavedSettings } from '../lib/driveService';
import { ShowPlaylistLog } from '../types';

interface PlayerTabProps {
  interstitials: Interstitial[];
  logs: LogEntry[];
  onLog: (entry: LogEntry) => Promise<any> | void;
  now: Date;
  syncTime: Date;
  scrollTrigger: number;
  playMode?: 'Live' | 'Prerecord' | 'Export' | 'Playlist';
  playlistShow?: Show | null;
  prerecordDate?: Date | null;
  prerecordLengthMinutes?: number;
  onConfigureTimeframe?: () => void;
  onExecuteExport?: (items?: any[], txtSummary?: string) => void;
  isAdmin?: boolean;
  onRefresh?: () => Promise<any> | void;
  shows?: Show[];
  onTriggerCaching?: (targetMode: 'Live' | 'Prerecord' | 'Export' | 'Playlist', additionalUrls?: string[]) => void;
}

export default function PlayerTab({ 
  interstitials, 
  logs, 
  onLog, 
  now, 
  syncTime, 
  scrollTrigger,
  playMode = 'Live',
  playlistShow = null,
  prerecordDate = null,
  prerecordLengthMinutes = 240,
  onConfigureTimeframe,
  onExecuteExport,
  isAdmin = false,
  onRefresh,
  shows = [],
  onTriggerCaching
}: PlayerTabProps) {
  const playingAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [playingStates, setPlayingStates] = useState<Record<string, { currentTime: number; duration: number }>>({});
  const [playingAudio, setPlayingAudio] = useState<HTMLAudioElement | null>(null);
  const playingAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingSlotKey, setPlayingSlotKey] = useState<string | null>(null);
  const [activeLiveReadOverlay, setActiveLiveReadOverlay] = useState<any | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [isLoggingExports, setIsLoggingExports] = useState(false);
  const [customScriptTimes, setCustomScriptTimes] = useState<Record<string, string>>({});
  const [nowClock, setNowClock] = useState(new Date());
  const [cardRotateStep, setCardRotateStep] = useState(0);
  const [movedHighlightTrackId, setMovedHighlightTrackId] = useState<string | null>(null);
  const movedHighlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerMovedHighlight = (trackId: string) => {
    setMovedHighlightTrackId(trackId);
    if (movedHighlightTimeoutRef.current) clearTimeout(movedHighlightTimeoutRef.current);
    movedHighlightTimeoutRef.current = setTimeout(() => {
      setMovedHighlightTrackId(null);
    }, 1200);
  };

  const getActualShowStart = (show: Show, time: Date): Date => {
    const start = new Date(time);
    start.setHours(show.startHour, show.startMinute, 0, 0);
    const durationMin = (show.durationHours * 60) + (show.durationMinutes || 0);
    const end = addMinutes(start, durationMin);

    if (isBefore(time, start)) {
      const yesterdayStart = subDays(start, 1);
      const yesterdayEnd = subDays(end, 1);
      if (time.getTime() >= yesterdayStart.getTime() && isBefore(time, yesterdayEnd)) {
        return yesterdayStart;
      }
    }
    return start;
  };
  const pendingPlayedPlaylistTracksRef = useRef<Record<string, { playedAt: string; fileName: string; title: string }>>({});
  const cardRotateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTriggeredCacheHashRef = useRef<string>('');

  // Synchronized 4-second rotation interval for playlist song cards
  const startCardRotateTimer = () => {
    if (cardRotateTimerRef.current) {
      clearInterval(cardRotateTimerRef.current);
    }
    cardRotateTimerRef.current = setInterval(() => {
      setCardRotateStep(prev => prev + 1);
      if (Object.keys(pendingPlayedPlaylistTracksRef.current).length > 0) {
        setPlayedPlaylistTracks(prev => ({
          ...prev,
          ...pendingPlayedPlaylistTracksRef.current
        }));
        pendingPlayedPlaylistTracksRef.current = {};
      }
    }, 4000);
  };

  useEffect(() => {
    startCardRotateTimer();
    return () => {
      if (cardRotateTimerRef.current) {
        clearInterval(cardRotateTimerRef.current);
      }
    };
  }, []);

  // Playlist Mode State
  const [playlistTracks, setPlaylistTracks] = useState<Array<{
    id: string;
    fileName: string;
    title: string;
    artist?: string;
    albumArtist?: string;
    album?: string;
    durationSeconds: number;
    durationFormatted: string;
    streamUrl: string;
  }>>([]);
  const [playlistFile, setPlaylistFile] = useState<string | null>(null);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [isVerifyingEvergreens, setIsVerifyingEvergreens] = useState(false);
  const [playedPlaylistTracks, setPlayedPlaylistTracks] = useState<Record<string, {
    id?: string;
    playedAt: string;
    fileName: string;
    title: string;
    artist?: string;
    albumArtist?: string;
    album?: string;
    durationSeconds?: number;
    durationFormatted?: string;
    isInterstitial?: boolean;
  }>>({});
  const [cancelledTrackIds, setCancelledTrackIds] = useState<string[]>([]);
  const [pushedBeforeBreakTrackIds, setPushedBeforeBreakTrackIds] = useState<string[]>([]);
  const [breakPositions, setBreakPositions] = useState<Record<string, number>>({});
  const [trackMetadataMap, setTrackMetadataMap] = useState<Record<string, Mp3ID3Metadata>>({});

  const [, setPlaylistDurationUpdates] = useState(0);

  // Derive effective show for Playlist, Prerecord, and Export modes
  const effectiveShow = useMemo(() => {
    if (playMode === 'Playlist') return playlistShow;
    if (playlistShow) return playlistShow;
    if ((playMode === 'Prerecord' || playMode === 'Export') && prerecordDate && shows && shows.length > 0) {
      const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      const dayName = daysOrder[prerecordDate.getDay()];
      const hour = prerecordDate.getHours();
      const minute = prerecordDate.getMinutes();
      const activeShows = shows.filter(show => 
        isTimeInShow(show, dayName, hour, minute)
      );
      return activeShows[0] || null;
    }
    return null;
  }, [playMode, playlistShow, prerecordDate, shows]);

  const playlistFolderType: 'Playlists' | 'Evergreens' = playMode === 'Export' ? 'Evergreens' : 'Playlists';

  // Synchronization refs for background tasks & state persistence
  const playedPlaylistTracksRef = useRef(playedPlaylistTracks);
  useEffect(() => {
    playedPlaylistTracksRef.current = playedPlaylistTracks;
  }, [playedPlaylistTracks]);

  const cancelledTrackIdsRef = useRef(cancelledTrackIds);
  useEffect(() => {
    cancelledTrackIdsRef.current = cancelledTrackIds;
  }, [cancelledTrackIds]);

  const playlistTracksRef = useRef(playlistTracks);
  useEffect(() => {
    playlistTracksRef.current = playlistTracks;
  }, [playlistTracks]);

  const trackMetadataMapRef = useRef(trackMetadataMap);
  useEffect(() => {
    trackMetadataMapRef.current = trackMetadataMap;
  }, [trackMetadataMap]);

  const breakPositionsRef = useRef(breakPositions);
  useEffect(() => {
    breakPositionsRef.current = breakPositions;
  }, [breakPositions]);

  const saveLogPromiseQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSavedLogJsonRef = useRef<string>('');

  // Helper to accurately resolve track duration in seconds and formatted string
  const resolveTrackDuration = (
    track: any,
    meta?: Mp3ID3Metadata,
    overrideSeconds?: number
  ): { durationSeconds: number; durationFormatted: string } => {
    let durSec = 0;

    if (typeof overrideSeconds === 'number' && !isNaN(overrideSeconds) && overrideSeconds > 0) {
      durSec = Math.round(overrideSeconds);
    } else if (track?.durationSeconds && track.durationSeconds > 0) {
      durSec = Math.round(track.durationSeconds);
    } else if (meta?.durationSeconds && meta.durationSeconds > 0) {
      durSec = Math.round(meta.durationSeconds);
    } else {
      const cachedStr = mp3DurationCache.get(track?.streamUrl) || availableFilesCache.get(track?.fileName)?.duration;
      if (cachedStr && typeof cachedStr === 'string') {
        const parts = cachedStr.split(':');
        if (parts.length === 2) {
          const mins = parseInt(parts[0], 10);
          const secs = parseInt(parts[1], 10);
          if (!isNaN(mins) && !isNaN(secs)) {
            durSec = mins * 60 + secs;
          }
        }
      }
    }

    if (durSec <= 0) durSec = 180;

    const mins = Math.floor(durSec / 60);
    const secs = Math.floor(durSec % 60);
    const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;

    return { durationSeconds: durSec, durationFormatted: formatted };
  };

  // Helper to persist the current playlist show state into JSON log file
  const saveCurrentShowPlaylistLog = (
    overridePlayedMap?: Record<string, {
      id?: string;
      playedAt: string;
      fileName: string;
      title: string;
      artist?: string;
      albumArtist?: string;
      album?: string;
      durationSeconds?: number;
      durationFormatted?: string;
      isInterstitial?: boolean;
    }>,
    overrideCancelledIds?: string[],
    overrideTracksList?: Array<any>,
    overrideMetaMap?: Record<string, Mp3ID3Metadata>,
    overrideBreakPositions?: Record<string, number>
  ) => {
    if ((playMode !== 'Playlist' && playMode !== 'Prerecord' && playMode !== 'Export') || !effectiveShow) return Promise.resolve();

    saveLogPromiseQueueRef.current = saveLogPromiseQueueRef.current.then(async () => {
      try {
        const settings = getSavedSettings();
        const showNameShort = effectiveShow.nameShort || effectiveShow.name;
        const showName = effectiveShow.name;
        const hostName = effectiveShow.host;

        const showStart = (playMode === 'Prerecord' || playMode === 'Export') && prerecordDate
          ? prerecordDate
          : getActualShowStart(effectiveShow, syncTime || new Date());

        const activePlayedMap = (overridePlayedMap && Object.keys(overridePlayedMap).length > 0)
          ? { ...playedPlaylistTracksRef.current, ...overridePlayedMap }
          : playedPlaylistTracksRef.current;
        const activeCancelledIds = overrideCancelledIds !== undefined
          ? overrideCancelledIds
          : cancelledTrackIdsRef.current;
        const activeTracksList = overrideTracksList || playlistTracksRef.current;
        const activeMetaMap = overrideMetaMap || trackMetadataMapRef.current;
        const activeBreakPositions = overrideBreakPositions !== undefined
          ? overrideBreakPositions
          : breakPositionsRef.current;

        const playedTrackMap = new Map<string, any>();
        Object.entries(activePlayedMap).forEach(([key, info]: [string, any]) => {
          if (!info) return;
          const trackId = info.id || key;
          if (!playedTrackMap.has(trackId)) {
            const trackObj = activeTracksList.find((t: any) => t.id === trackId || t.fileName === info.fileName);
            const meta = activeMetaMap[trackId] || activeMetaMap[info.fileName] || activeMetaMap[key];

            const durInfo = resolveTrackDuration(
              trackObj || { durationSeconds: info.durationSeconds, streamUrl: trackObj?.streamUrl, fileName: info.fileName },
              meta,
              info.durationSeconds
            );

            const finalDurationSeconds = info.durationSeconds && info.durationSeconds > 0 ? info.durationSeconds : durInfo.durationSeconds;
            const finalDurationFormatted = info.durationFormatted && info.durationFormatted !== '' ? info.durationFormatted : durInfo.durationFormatted;

            playedTrackMap.set(trackId, {
              id: trackId,
              fileName: info.fileName,
              title: info.title || meta?.title || trackObj?.title || info.fileName || '',
              artist: info.artist || meta?.artist || trackObj?.artist || '',
              albumArtist: info.albumArtist || meta?.albumArtist || trackObj?.albumArtist || meta?.artist || info.artist || '',
              album: info.album || meta?.album || trackObj?.album || '',
              durationSeconds: finalDurationSeconds,
              durationFormatted: finalDurationFormatted,
              playedAt: info.playedAt,
              isInterstitial: info.isInterstitial || false
            });
          }
        });

        const playedTracksList = Array.from(playedTrackMap.values());
        // Chronological sort by playedAt
        playedTracksList.sort((a, b) => {
          const timeA = new Date(a.playedAt).getTime();
          const timeB = new Date(b.playedAt).getTime();
          return timeA - timeB;
        });

        const unplayedIds = activeTracksList
          .filter(t => {
            const isPlayed = !!activePlayedMap[t.id] || !!activePlayedMap[t.fileName];
            const isCancelled = activeCancelledIds.includes(t.id) || activeCancelledIds.includes(t.fileName);
            return !isPlayed && !isCancelled;
          })
          .map(t => t.id);

        const metaObj: Record<string, any> = {};
        activeTracksList.forEach(track => {
          const meta = activeMetaMap[track.id] || activeMetaMap[track.fileName] || activeMetaMap[track.streamUrl];
          metaObj[track.id] = {
            id: track.id,
            fileName: track.fileName,
            title: meta?.title || track.title || '',
            artist: meta?.artist || track.artist || '',
            albumArtist: meta?.albumArtist || meta?.artist || track.artist || '',
            album: meta?.album || ''
          };
        });

        const logPayload: ShowPlaylistLog = {
          showId: effectiveShow.id,
          showName,
          hostName,
          showDateTime: showStart.toISOString(),
          logFileName: formatShowPlaylistLogFileName(showNameShort || showName, showStart),
          playedTracks: playedTracksList,
          cancelledTrackIds: activeCancelledIds,
          unplayedTrackIds: unplayedIds,
          breakPositions: activeBreakPositions,
          trackMetadata: metaObj
        };

        const logPayloadJson = JSON.stringify(logPayload);
        if (lastSavedLogJsonRef.current === logPayloadJson) {
          return;
        }
        lastSavedLogJsonRef.current = logPayloadJson;

        if (settings.mode === 'Local') {
          await fetch('/api/shows/playlist/save-log-json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              showNameShort,
              showName,
              showStartTime: showStart.toISOString(),
              logFileName: logPayload.logFileName,
              logData: logPayload,
              folderType: playlistFolderType
            })
          });
        } else {
          await saveShowPlaylistLogToDrive(showNameShort, showName, showStart, logPayload, playlistFolderType);
        }
      } catch (err) {
        console.error('Failed to save show playlist log JSON:', err);
      }
    });

    return saveLogPromiseQueueRef.current;
  };

  const syncRequestIdRef = useRef(0);

  // Sync playlist tracks from server, update caches, and load/restore state from JSON show log
  const syncPlaylistTracks = async (isInitial = false) => {
    if ((playMode !== 'Playlist' && playMode !== 'Prerecord' && playMode !== 'Export') || !effectiveShow) {
      setPlaylistTracks([]);
      setPlaylistFile(null);
      return;
    }

    const currentSyncId = ++syncRequestIdRef.current;

    if (isInitial) {
      setIsPlaylistLoading(true);
    }
    setPlaylistError(null);

    try {
      const settings = getSavedSettings();
      const showNameShort = effectiveShow.nameShort || effectiveShow.name;
      const showName = effectiveShow.name;

      const showStart = (playMode === 'Prerecord' || playMode === 'Export') && prerecordDate
        ? prerecordDate
        : getActualShowStart(effectiveShow, syncTime || new Date());

      // 1. Fetch physical tracks present in show playlist folder
      let serverTracks: any[] = [];
      let playlistFileName: string | null = null;

      if (settings.mode === 'Local') {
        const resp = await fetch('/api/shows/playlist/load-tracks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ showNameShort, showName, folderType: playlistFolderType })
        });
        const data = await resp.json();
        if (currentSyncId !== syncRequestIdRef.current) return;
        if (!resp.ok) throw new Error(data.error || 'Failed to load tracks');
        serverTracks = data.tracks || [];
        playlistFileName = data.playlistFile || null;
      } else {
        const result = await loadPlaylistTracksFromDrive(showNameShort, showName, settings.mode, playlistFolderType);
        if (currentSyncId !== syncRequestIdRef.current) return;
        serverTracks = result.tracks || [];
        playlistFileName = result.playlistFile || null;
      }

      setPlaylistFile(playlistFileName);

      // 2. Fetch existing JSON playlist log for state restoration on re-entry
      let existingLog: ShowPlaylistLog | null = null;
      if (settings.mode === 'Local') {
        try {
          const resp = await fetch('/api/shows/playlist/load-log-json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              showNameShort,
              showName,
              showStartTime: showStart.toISOString(),
              logFileName: formatShowPlaylistLogFileName(showNameShort || showName, showStart),
              folderType: playlistFolderType
            })
          });
          if (currentSyncId !== syncRequestIdRef.current) return;
          if (resp.ok) {
            const data = await resp.json();
            existingLog = data?.logData || data;
          }
        } catch (e) {
          console.warn('No existing show playlist JSON log found or failed to fetch:', e);
        }
      } else {
        existingLog = await loadShowPlaylistLogFromDrive(showNameShort, showName, showStart, playlistFolderType);
        if (currentSyncId !== syncRequestIdRef.current) return;
      }

      if (currentSyncId !== syncRequestIdRef.current) return;

      // Restored state containers
      let restoredPlayedMap: Record<string, {
        id?: string;
        playedAt: string;
        fileName: string;
        title: string;
        artist?: string;
        albumArtist?: string;
        album?: string;
        durationSeconds?: number;
        durationFormatted?: string;
        isInterstitial?: boolean;
      }> = { ...playedPlaylistTracksRef.current };
      let restoredCancelledIds: string[] = [...cancelledTrackIdsRef.current];

      if (existingLog) {
        if (Array.isArray(existingLog.playedTracks)) {
          existingLog.playedTracks.forEach((pt: any) => {
            const key = pt.id || pt.fileName;
            if (key) {
              const info = {
                id: pt.id || key,
                playedAt: pt.playedAt,
                fileName: pt.fileName,
                title: pt.title,
                artist: pt.artist || '',
                albumArtist: pt.albumArtist || pt.artist || '',
                album: pt.album || '',
                durationSeconds: pt.durationSeconds || 0,
                durationFormatted: pt.durationFormatted || '',
                isInterstitial: pt.isInterstitial || false
              };
              if (pt.id && !restoredPlayedMap[pt.id]) restoredPlayedMap[pt.id] = info;
              if (pt.fileName && !restoredPlayedMap[pt.fileName]) restoredPlayedMap[pt.fileName] = info;
            }
          });
          setPlayedPlaylistTracks(prev => ({ ...restoredPlayedMap, ...prev }));
        }

        if (Array.isArray(existingLog.cancelledTrackIds)) {
          const mergedCancelled = Array.from(new Set([...restoredCancelledIds, ...existingLog.cancelledTrackIds]));
          restoredCancelledIds = mergedCancelled;
          setCancelledTrackIds(restoredCancelledIds);
        }

        if (existingLog.trackMetadata && typeof existingLog.trackMetadata === 'object') {
          setTrackMetadataMap(prev => ({
            ...prev,
            ...existingLog.trackMetadata
          }));
        }

        if (existingLog.breakPositions && typeof existingLog.breakPositions === 'object') {
          setBreakPositions(existingLog.breakPositions);
        }
      }

      const normalizedTracks = (serverTracks as any[]).map((t: any, idx: number) => {
        const id = (t as any).id || `playlist-track-${idx + 1}`;
        const restoredMeta = (existingLog?.trackMetadata && (existingLog.trackMetadata as any)[id]) || (existingLog?.trackMetadata && (existingLog.trackMetadata as any)[t.fileName]);
        return {
          ...t,
          id,
          title: restoredMeta?.title || (t as any).title,
          artist: restoredMeta?.artist || (t as any).artist,
          albumArtist: restoredMeta?.albumArtist || (t as any).albumArtist || restoredMeta?.artist || (t as any).artist,
          album: restoredMeta?.album || (t as any).album
        };
      });

      // Register tracks in availableFilesCache & driveFileNameCache matching regular interstitials
      normalizedTracks.forEach((t: any) => {
        availableFilesCache.set(t.fileName, {
          path: t.streamUrl,
          size: '0 MB',
          duration: t.durationFormatted
        });
        driveFileNameCache.set(t.streamUrl, t.fileName);
      });

      // Sequence unplayed tracks according to log sequence if log exists
      let orderedTracks = normalizedTracks;
      if (existingLog && Array.isArray(existingLog.unplayedTrackIds) && existingLog.unplayedTrackIds.length > 0) {
        const trackMap = new Map(normalizedTracks.map((t: any) => [t.id, t]));
        const fileNameMap = new Map(normalizedTracks.map((t: any) => [t.fileName, t]));

        const sequenced: any[] = [];
        const usedIds = new Set<string>();

        // 1. Keep played tracks first
        normalizedTracks.forEach((t: any) => {
          const isPlayed = !!restoredPlayedMap[t.id] || !!restoredPlayedMap[t.fileName];
          if (isPlayed && !usedIds.has(t.id)) {
            sequenced.push(t);
            usedIds.add(t.id);
          }
        });

        // 2. Add unplayed tracks in existingLog.unplayedTrackIds sequence
        existingLog.unplayedTrackIds.forEach((uid: string) => {
          const match = trackMap.get(uid) || fileNameMap.get(uid);
          if (match && !usedIds.has(match.id)) {
            const isCancelled = restoredCancelledIds.includes(match.id) || restoredCancelledIds.includes(match.fileName);
            if (!isCancelled) {
              sequenced.push(match);
              usedIds.add(match.id);
            }
          }
        });

        // 3. Append physical files not in log sequence, not played, not cancelled
        normalizedTracks.forEach((t: any) => {
          const isPlayed = !!restoredPlayedMap[t.id] || !!restoredPlayedMap[t.fileName];
          const isCancelled = restoredCancelledIds.includes(t.id) || restoredCancelledIds.includes(t.fileName);
          if (!usedIds.has(t.id) && !isPlayed && !isCancelled) {
            sequenced.push(t);
            usedIds.add(t.id);
          }
        });

        // 4. Finally append cancelled tracks so they are preserved in state
        normalizedTracks.forEach((t: any) => {
          if (!usedIds.has(t.id)) {
            sequenced.push(t);
            usedIds.add(t.id);
          }
        });

        orderedTracks = sequenced;
      }

      if (currentSyncId !== syncRequestIdRef.current) return;

      // Pre-cache only physical files present
      const trackUrls = serverTracks.map((t: any) => t.streamUrl).filter(Boolean);
      const trackUrlsHash = trackUrls.join(',');
      const token = getAccessToken();
      if (onTriggerCaching) {
        onTriggerCaching((playMode as any) || 'Playlist', trackUrls);
        lastTriggeredCacheHashRef.current = trackUrlsHash;
      } else if (trackUrls.length > 0 && lastTriggeredCacheHashRef.current !== trackUrlsHash) {
        lastTriggeredCacheHashRef.current = trackUrlsHash;
        updateAudioCache(trackUrls, token).catch(e => console.warn('Playlist track pre-caching error:', e));
      }

      // Asynchronously load ID3 metadata for tooltips & log
      const loadedMetaMap: Record<string, Mp3ID3Metadata> = {};
      await Promise.all(
        orderedTracks.map(async (t: any) => {
          let directMeta: Mp3ID3Metadata | null = null;
          if (t.artist || t.album) {
            directMeta = {
              title: t.title || '',
              artist: t.artist || '',
              albumArtist: t.albumArtist || t.artist || '',
              album: t.album || ''
            };
          } else if (t.streamUrl) {
            try {
              const meta = await readMp3ID3Metadata(t.streamUrl, token || undefined);
              if (meta && (meta.artist || meta.album || meta.title)) {
                directMeta = {
                  title: meta.title || t.title || '',
                  artist: meta.artist || '',
                  albumArtist: meta.albumArtist || meta.artist || '',
                  album: meta.album || ''
                };
              }
            } catch (e) {}
          }

          if (directMeta) {
            loadedMetaMap[t.id] = directMeta;
            loadedMetaMap[t.fileName] = directMeta;
            if (t.streamUrl) loadedMetaMap[t.streamUrl] = directMeta;

            if (directMeta.artist) t.artist = directMeta.artist;
            if (directMeta.albumArtist) t.albumArtist = directMeta.albumArtist;
            if (directMeta.album) t.album = directMeta.album;
            if (directMeta.title && directMeta.title !== t.fileName) t.title = directMeta.title;
          }
        })
      );

      if (currentSyncId !== syncRequestIdRef.current) return;

      if (Object.keys(loadedMetaMap).length > 0) {
        setTrackMetadataMap(prev => ({ ...prev, ...loadedMetaMap }));
      }

      // Replace tracks state with authoritative ordered tracks list
      setPlaylistTracks(orderedTracks);

      // Immediately write/initialize the playlist show log upon evaluating, caching, parsing, and ordering the tracks
      await saveCurrentShowPlaylistLog(
        restoredPlayedMap,
        restoredCancelledIds,
        orderedTracks,
        loadedMetaMap
      );

    } catch (err: any) {
      if (currentSyncId !== syncRequestIdRef.current) return;
      console.error('Failed to sync playlist tracks:', err);
      if (onTriggerCaching) {
        onTriggerCaching((playMode as any) || 'Playlist', []);
      }
      if (isInitial) {
        setPlaylistError(err.message || 'Error loading playlist tracks');
      }
    } finally {
      if (currentSyncId === syncRequestIdRef.current && isInitial) {
        setIsPlaylistLoading(false);
      }
    }
  };

  // Initial load when switching mode, show, or prerecord date
  useEffect(() => {
    // Invalidate any in-flight sync calls from previous view/mode
    syncRequestIdRef.current++;

    if ((playMode !== 'Playlist' && playMode !== 'Prerecord' && playMode !== 'Export') || !effectiveShow) {
      setPlaylistTracks([]);
      setPlaylistFile(null);
      setCancelledTrackIds([]);
      setPushedBeforeBreakTrackIds([]);
      setBreakPositions({});
      setPlayedPlaylistTracks({});
      setIsPlaylistLoading(false);
      lastTriggeredCacheHashRef.current = '';
      lastSavedLogJsonRef.current = '';
      return;
    }

    // Immediately purge tracks and state so previous view/mode items are cleared before async load
    setPlaylistTracks([]);
    setPlaylistFile(null);
    setCancelledTrackIds([]);
    setPushedBeforeBreakTrackIds([]);
    setBreakPositions({});
    setPlayedPlaylistTracks({});
    setIsPlaylistLoading(true);
    lastTriggeredCacheHashRef.current = '';
    lastSavedLogJsonRef.current = '';

    syncPlaylistTracks(true);
  }, [playMode, effectiveShow, prerecordDate]);

  // Periodic check for additional tracks added to folder (every 30 seconds)
  useEffect(() => {
    if ((playMode !== 'Playlist' && playMode !== 'Prerecord' && playMode !== 'Export') || !effectiveShow) return;

    const interval = setInterval(() => {
      syncPlaylistTracks(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [playMode, effectiveShow, prerecordDate, syncTime, scrollTrigger]);

  // Listen for browser duration calculation events ('mp3-duration-cached')
  useEffect(() => {
    const handleDurationCached = () => {
      setPlaylistDurationUpdates(prev => prev + 1);
    };
    window.addEventListener('mp3-duration-cached', handleDurationCached);
    return () => window.removeEventListener('mp3-duration-cached', handleDurationCached);
  }, []);

  // Listen for MP3 metadata parsing events ('mp3-metadata-loaded')
  useEffect(() => {
    const handleMetadataLoaded = (e: any) => {
      const { url, resolvedUrl, meta } = e.detail || {};
      if (meta) {
        setTrackMetadataMap(prev => {
          const updated = { ...prev };
          if (url) updated[url] = meta;
          if (resolvedUrl) updated[resolvedUrl] = meta;
          return updated;
        });
      }
    };
    window.addEventListener('mp3-metadata-loaded', handleMetadataLoaded);
    return () => window.removeEventListener('mp3-metadata-loaded', handleMetadataLoaded);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleLogged = (logEntry?: any) => {
      setActiveLiveReadOverlay(prev => {
        if (logEntry && logEntry.status === 'backup play' && prev) {
          if (prev.interstitialId && prev.slotKey && prev.slotISO) {
            const targetInterstitial = interstitials.find(s => s.id === prev.interstitialId);
            if (targetInterstitial) {
              const slotDate = new Date(prev.slotISO);
              playBackupAudioTrack(logEntry.mp3Name || prev.backupMp3Url, prev.slotKey, targetInterstitial, slotDate);
            }
          }
        }
        return null;
      });
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
    const interstitialUrls = activeVerifiedInterstitials.map(s => s.mp3Url);
    if (playMode === 'Playlist' && playlistTracks.length > 0) {
      const trackUrls = playlistTracks.map(t => t.streamUrl).filter(Boolean);
      return Array.from(new Set([...interstitialUrls, ...trackUrls]));
    }
    return interstitialUrls;
  }, [activeVerifiedInterstitials, playMode, playlistTracks]);

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

  const stopAllAudios = () => {
    for (const a of playingAudiosRef.current.values()) {
      try {
        a.pause();
        a.src = "";
      } catch (e) {}
    }
    playingAudiosRef.current.clear();
    setPlayingStates({});
    if (playingAudioRef.current) {
      playingAudioRef.current.pause();
      playingAudioRef.current.src = "";
    }
    setPlayingAudio(null);
    setPlayingSlotKey(null);
  };

  // Sync window methods for global navigation check
  useEffect(() => {
    (window as any).interstitialerIsAudioPlaying = () => {
      return playingAudiosRef.current.size > 0 || (playingAudioRef.current && !playingAudioRef.current.paused);
    };
    (window as any).interstitialerStopAllAudio = () => stopAllAudios();
    return () => {
      delete (window as any).interstitialerIsAudioPlaying;
      delete (window as any).interstitialerStopAllAudio;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllAudios();
    };
  }, []);

  const [duration, setDuration] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLDivElement>(null);
  const userScrollTopRef = useRef<number | null>(null);
  const lastModeRef = useRef<string | null>(null);
  const isAutoScrollingRef = useRef<boolean>(false);
  const prevScrollTriggerRef = useRef<number>(scrollTrigger);

  const persistentHeaderRef = useRef<HTMLDivElement>(null);
  const persistentLeftStripRef = useRef<HTMLDivElement>(null);
  const persistentTitleRef = useRef<HTMLDivElement>(null);
  const persistentTitleTextRef = useRef<HTMLSpanElement>(null);
  const persistentTextBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (scrollContainerRef.current && !isAutoScrollingRef.current) {
        userScrollTopRef.current = scrollContainerRef.current.scrollTop;
      }
      if (persistentTitleRef.current && persistentLeftStripRef.current && persistentTextBoxRef.current) {
        if (playMode === 'Playlist' || playMode === 'Prerecord' || playMode === 'Export') {
          const defaultTitle = playMode === 'Export' ? 'Export Mode' : playMode === 'Prerecord' ? 'Prerecord Mode' : 'Playlist Mode';
          const shade = effectiveShow 
            ? getShowShade(effectiveShow, getSortedShows(shows))
            : { bg: '#faf5ff', border: '#c084fc', title: defaultTitle };
          
          const newText = effectiveShow ? effectiveShow.name : defaultTitle;
          if (persistentTitleTextRef.current) {
            if (persistentTitleTextRef.current.textContent !== newText) {
              persistentTitleTextRef.current.textContent = newText;
            }
          } else if (persistentTitleRef.current.textContent !== newText) {
            persistentTitleRef.current.textContent = newText;
          }
          persistentLeftStripRef.current.style.backgroundColor = shade.bg;
          persistentLeftStripRef.current.title = shade.title;
          persistentTextBoxRef.current.style.backgroundColor = shade.bg;
          persistentTextBoxRef.current.style.borderColor = shade.border;
          return;
        }

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

        const shade = currentActiveShow 
          ? getShowShade(currentActiveShow, getSortedShows(shows))
          : { bg: 'var(--show-shade-none-bg, #f1f5f9)', border: 'var(--show-shade-none-border, #cbd5e1)', title: 'No active show scheduled' };
        
        const newText = currentActiveShow ? currentActiveShow.name : "No Scheduled Show";
        if (persistentTitleTextRef.current) {
          if (persistentTitleTextRef.current.textContent !== newText) {
            persistentTitleTextRef.current.textContent = newText;
          }
        } else if (persistentTitleRef.current.textContent !== newText) {
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
  }, [shows, scrollTrigger, playMode, playlistShow, effectiveShow]);

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
          if (playMode === 'Playlist' || playMode === 'Prerecord' || playMode === 'Export') {
            const defaultTitle = playMode === 'Export' ? 'Export Mode' : playMode === 'Prerecord' ? 'Prerecord Mode' : 'Playlist Mode';
            const shade = effectiveShow 
              ? getShowShade(effectiveShow, getSortedShows(shows))
              : { bg: '#faf5ff', border: '#c084fc', title: defaultTitle };
            
            const newText = effectiveShow ? effectiveShow.name : defaultTitle;
            if (persistentTitleTextRef.current) {
              if (persistentTitleTextRef.current.textContent !== newText) {
                persistentTitleTextRef.current.textContent = newText;
              }
            } else if (persistentTitleRef.current.textContent !== newText) {
              persistentTitleRef.current.textContent = newText;
            }
            persistentLeftStripRef.current.style.backgroundColor = shade.bg;
            persistentLeftStripRef.current.title = shade.title;
            persistentTextBoxRef.current.style.backgroundColor = shade.bg;
            persistentTextBoxRef.current.style.borderColor = shade.border;
          } else {
            const shade = currentActiveShow 
              ? getShowShade(currentActiveShow, getSortedShows(shows))
              : { bg: 'var(--show-shade-none-bg, #f1f5f9)', border: 'var(--show-shade-none-border, #cbd5e1)', title: 'No active show scheduled' };
            
            const newText = currentActiveShow ? currentActiveShow.name : "No Scheduled Show";
            if (persistentTitleTextRef.current) {
              if (persistentTitleTextRef.current.textContent !== newText) {
                persistentTitleTextRef.current.textContent = newText;
              }
            } else if (persistentTitleRef.current.textContent !== newText) {
              persistentTitleRef.current.textContent = newText;
            }
            persistentLeftStripRef.current.style.backgroundColor = shade.bg;
            persistentLeftStripRef.current.title = shade.title;
            persistentTextBoxRef.current.style.backgroundColor = shade.bg;
            persistentTextBoxRef.current.style.borderColor = shade.border;
          }
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [shows, scrollTrigger, playMode, playlistShow, effectiveShow]);

  // Auto-scroll logic: centered on "now" indicator or scrolled to top for Prerecord on initial mode switch or "Now" refresh click,
  // while preserving exact user scroll position across track re-orders, automated background updates, and post-cache updates.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isModeSwitch = lastModeRef.current !== playMode;
    const isSyncTriggered = prevScrollTriggerRef.current !== scrollTrigger;

    if (isModeSwitch || isSyncTriggered) {
      lastModeRef.current = playMode;
      prevScrollTriggerRef.current = scrollTrigger;
      userScrollTopRef.current = null;
      isAutoScrollingRef.current = true;

      const performAutoScroll = () => {
        const cont = scrollContainerRef.current;
        if (!cont) return;

        if (playMode === 'Prerecord') {
          cont.scrollTop = 0;
        } else if (playMode === 'Live') {
          const nowEl = (cont.querySelector('#now-indicator') as HTMLElement) || activeItemRef.current;
          if (nowEl) {
            const containerRect = cont.getBoundingClientRect();
            const targetRect = nowEl.getBoundingClientRect();
            const targetTop = targetRect.top - containerRect.top + cont.scrollTop;
            cont.scrollTop = Math.max(0, targetTop - (cont.clientHeight / 2) + (targetRect.height / 2));
          } else {
            cont.scrollTop = 0;
          }
        } else if (playMode === 'Playlist') {
          const targetEl = (cont.querySelector('#now-indicator') as HTMLElement) || activeItemRef.current;
          if (targetEl) {
            const containerRect = cont.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();
            const targetTop = targetRect.top - containerRect.top + cont.scrollTop;
            cont.scrollTop = Math.max(0, targetTop - (cont.clientHeight / 2) + (targetRect.height / 2));
          } else {
            cont.scrollTop = 0;
          }
        } else if (playMode === 'Export') {
          const targetEl = (cont.querySelector('#export-start-indicator') as HTMLElement) || activeItemRef.current;
          if (targetEl) {
            const containerRect = cont.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();
            const targetTop = targetRect.top - containerRect.top + cont.scrollTop;
            cont.scrollTop = Math.max(0, targetTop - (cont.clientHeight / 2) + (targetRect.height / 2));
          } else {
            cont.scrollTo({ top: 0, behavior: 'auto' });
          }
        }

        if (scrollContainerRef.current) {
          userScrollTopRef.current = scrollContainerRef.current.scrollTop;
        }

        requestAnimationFrame(() => {
          isAutoScrollingRef.current = false;
        });
      };

      // Double requestAnimationFrame ensures layout and DOM paint are fully complete
      requestAnimationFrame(() => {
        requestAnimationFrame(performAutoScroll);
      });
    } else {
      // Restore exact saved scroll position on re-renders, track re-orders, and refreshes without jumping
      if (!isAutoScrollingRef.current && userScrollTopRef.current !== null && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = userScrollTopRef.current;
      }
    }
  }, [scrollTrigger, playMode, playlistTracks, cancelledTrackIds, cacheDisplayStatus]);

  useLayoutEffect(() => {
    if (!isAutoScrollingRef.current && lastModeRef.current === playMode && prevScrollTriggerRef.current === scrollTrigger && userScrollTopRef.current !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = userScrollTopRef.current;
    }
  });

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

  const playlistTimeline = useMemo(() => {
    if ((playMode !== 'Playlist' && playMode !== 'Prerecord' && playMode !== 'Export') || !effectiveShow) return [];

    const showStart = (playMode === 'Prerecord' || playMode === 'Export') && prerecordDate
      ? prerecordDate
      : getActualShowStart(effectiveShow, syncTime);

    const showDurationMinutes = (effectiveShow.durationHours * 60) + effectiveShow.durationMinutes;
    const showEnd = addMinutes(showStart, showDurationMinutes);

    // 1. Collect all scheduled Interstitial Breaks in the show window
    const scheduledBreaks: Array<{
      id: string;
      slotTime: Date;
      interstitials: Interstitial[];
      totalDurationSec: number;
    }> = [];

    let currentSlot = startOfMinute(showStart);
    while (isBefore(currentSlot, showEnd)) {
      const sForSlot = getInterstitialsForSlot(currentSlot);
      if (sForSlot.length > 0) {
        const totalDur = sForSlot.reduce((acc, item) => {
          const d = parseInt(item.duration, 10);
          return acc + (!isNaN(d) && d > 0 ? d : 60);
        }, 0);
        scheduledBreaks.push({
          id: `break-${currentSlot.toISOString()}`,
          slotTime: new Date(currentSlot),
          interstitials: sForSlot,
          totalDurationSec: totalDur
        });
      }
      currentSlot = addMinutes(currentSlot, 1);
    }

    type PlaylistTimelineEntry =
      | {
          type: 'header';
          id: string;
          show: Show;
          startTime: Date;
          playlistFile: string | null;
          trackCount: number;
        }
      | {
          type: 'track';
          id: string;
          track: {
            id: string;
            fileName: string;
            title: string;
            durationSeconds: number;
            durationFormatted: string;
            streamUrl: string;
          };
          trackNumber: number;
          startTime: Date;
          endTime: Date;
          played?: boolean;
          playedAt?: string;
          cancelled?: boolean;
          isOverrun?: boolean;
        }
      | {
          type: 'break';
          id: string;
          slotTime: Date;
          startTime: Date;
          endTime: Date;
          interstitials: Interstitial[];
          isOverrun?: boolean;
          played?: boolean;
          playedAt?: string;
        }
      | {
          type: 'show-end';
          id: string;
          showEnd: Date;
          diffSeconds: number;
          diffFormatted: string;
          status: 'over' | 'under' | 'exact';
          startTime: Date;
        }
      | {
          type: 'extra-tracks';
          id: string;
          totalExtraSeconds: number;
          extraFormatted: string;
          startTime: Date;
        };

    const items: PlaylistTimelineEntry[] = [
      {
        type: 'header',
        id: 'playlist-header',
        show: effectiveShow,
        startTime: showStart,
        playlistFile,
        trackCount: playlistTracks.length
      }
    ];

    let maxPlayedEnd = new Date(showStart);

    // 2. Add Played Tracks and Played Interstitial Breaks sorted by playedAt timestamp
    const playedItems: PlaylistTimelineEntry[] = [];

    // 2.a. Played Music Tracks
    const playedTracks = (playMode === 'Export') ? [] : playlistTracks.filter(t => !!playedPlaylistTracks[t.id] || !!playedPlaylistTracks[t.fileName]);
    for (const track of playedTracks) {
      const exactCachedDurationStr = mp3DurationCache.get(track.streamUrl) || availableFilesCache.get(track.fileName)?.duration;
      let trackDur = track.durationSeconds || 180;
      if (exactCachedDurationStr) {
        const parts = exactCachedDurationStr.split(':');
        if (parts.length === 2) {
          const mins = parseInt(parts[0], 10);
          const secs = parseInt(parts[1], 10);
          if (!isNaN(mins) && !isNaN(secs)) {
            trackDur = (mins * 60) + secs;
          }
        }
      }
      const playedInfo = playedPlaylistTracks[track.id] || playedPlaylistTracks[track.fileName];
      const playedDate = new Date(playedInfo.playedAt);
      const playedEnd = new Date(playedDate.getTime() + trackDur * 1000);
      playedItems.push({
        type: 'track',
        id: track.id,
        track,
        trackNumber: 0,
        startTime: playedDate,
        endTime: playedEnd,
        played: true,
        playedAt: playedInfo.playedAt,
        cancelled: false
      });
      if (playedEnd.getTime() > maxPlayedEnd.getTime()) {
        maxPlayedEnd = new Date(playedEnd);
      }
    }

    // 2.b. Played Interstitial Breaks
    const playedBreakIds = new Set<string>();
    if (playMode !== 'Export') {
      for (const b of scheduledBreaks) {
        const playedInBreak = b.interstitials.filter(s => {
          if (playedPlaylistTracks[s.id]) return true;
          return logs.some(l => 
            l.interstitialId === s.id && 
            (l.interstitialTime === b.slotTime.toISOString() || isSameMinute(parseISO(l.timestamp), b.slotTime)) &&
            (l.status === 'played' || l.status === 'backup play') &&
            l.playMode !== 'Export'
          );
        });

        if (playedInBreak.length > 0) {
          playedBreakIds.add(b.id);
          let earliestPlayedAt = b.slotTime;
          for (const s of playedInBreak) {
            const pInfo = playedPlaylistTracks[s.id];
            if (pInfo?.playedAt) {
              const d = new Date(pInfo.playedAt);
              if (!isNaN(d.getTime())) earliestPlayedAt = d;
            } else {
              const pLog = logs.find(l => 
                l.interstitialId === s.id && 
                (l.interstitialTime === b.slotTime.toISOString() || isSameMinute(parseISO(l.timestamp), b.slotTime)) &&
                (l.status === 'played' || l.status === 'backup play') &&
                l.playMode !== 'Export'
              );
              if (pLog?.timestamp) {
                const d = new Date(pLog.timestamp);
                if (!isNaN(d.getTime())) earliestPlayedAt = d;
              }
            }
          }

          const bEnd = new Date(earliestPlayedAt.getTime() + b.totalDurationSec * 1000);
          playedItems.push({
            type: 'break',
            id: b.id,
            slotTime: b.slotTime,
            startTime: earliestPlayedAt,
            endTime: bEnd,
            interstitials: b.interstitials,
            played: true,
            playedAt: earliestPlayedAt.toISOString()
          });
          if (bEnd.getTime() > maxPlayedEnd.getTime()) {
            maxPlayedEnd = new Date(bEnd);
          }
        }
      }
    }

    // Sort played items chronologically by playedAt / startTime
    playedItems.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    items.push(...playedItems);

    const unplayedScheduledBreaks = scheduledBreaks.filter(b => !playedBreakIds.has(b.id));

    // Reference now time cursor
    let totalPlayedSec = 0;
    Object.values(playedPlaylistTracks).forEach((p: any) => {
      if (p.durationSeconds && p.durationSeconds > 0) totalPlayedSec += p.durationSeconds;
      else totalPlayedSec += 180;
    });
    const virtualNow = new Date(showStart.getTime() + totalPlayedSec * 1000);
    const nowRef = (playMode === 'Prerecord' || playMode === 'Export')
      ? virtualNow
      : (nowClock || syncTime || new Date());

    const unplayedStartCursor = new Date(Math.max(nowRef.getTime(), showStart.getTime(), maxPlayedEnd.getTime()));

    // 3. Separate Missed Interstitial Breaks vs Upcoming Interstitial Breaks
    // Rule 4.a: Missed interstitials sort AFTER played items and BEFORE the NOW indicator
    const missedBreaks = unplayedScheduledBreaks.filter(b => b.slotTime.getTime() < unplayedStartCursor.getTime());
    const upcomingBreaks = unplayedScheduledBreaks.filter(b => b.slotTime.getTime() >= unplayedStartCursor.getTime());

    let missedCursor = new Date(maxPlayedEnd);
    for (const b of missedBreaks) {
      const bEnd = new Date(missedCursor.getTime() + b.totalDurationSec * 1000);
      items.push({
        type: 'break',
        id: b.id,
        slotTime: b.slotTime,
        startTime: new Date(missedCursor),
        endTime: bEnd,
        interstitials: b.interstitials
      });
      missedCursor = bEnd;
    }

    // 4. Calculate default track insertion indices for upcoming breaks, and interleave with active unplayed tracks
    const activeUnplayedTracks = (playMode === 'Export')
      ? playlistTracks.filter(t => !cancelledTrackIds.includes(t.id) && !cancelledTrackIds.includes(t.fileName))
      : playlistTracks.filter(t => !playedPlaylistTracks[t.id] && !playedPlaylistTracks[t.fileName] && !cancelledTrackIds.includes(t.id) && !cancelledTrackIds.includes(t.fileName));

    const getTrackDurationSec = (track: any): number => {
      const exactCachedDurationStr = mp3DurationCache.get(track.streamUrl) || availableFilesCache.get(track.fileName)?.duration;
      if (exactCachedDurationStr) {
        const parts = exactCachedDurationStr.split(':');
        if (parts.length === 2) {
          const mins = parseInt(parts[0], 10);
          const secs = parseInt(parts[1], 10);
          if (!isNaN(mins) && !isNaN(secs)) {
            return (mins * 60) + secs;
          }
        }
      }
      return track.durationSeconds || 180;
    };

    const breakTargetCounts: Array<{ breakObj: typeof upcomingBreaks[0]; afterCount: number }> = [];

    for (const b of upcomingBreaks) {
      if (breakPositions[b.id] !== undefined) {
        breakTargetCounts.push({
          breakObj: b,
          afterCount: Math.min(activeUnplayedTracks.length, Math.max(0, breakPositions[b.id]))
        });
      } else {
        let defaultCount = 0;
        let tempTime = new Date(unplayedStartCursor);
        for (const track of activeUnplayedTracks) {
          const trackDur = getTrackDurationSec(track);
          const nominalEnd = new Date(tempTime.getTime() + trackDur * 1000);
          if (nominalEnd.getTime() <= b.slotTime.getTime()) {
            defaultCount++;
            tempTime = nominalEnd;
          } else {
            break;
          }
        }
        breakTargetCounts.push({
          breakObj: b,
          afterCount: defaultCount
        });
      }
    }

    const breaksByAfterCount = new Map<number, typeof upcomingBreaks>();
    for (const entry of breakTargetCounts) {
      const existing = breaksByAfterCount.get(entry.afterCount) || [];
      existing.push(entry.breakObj);
      breaksByAfterCount.set(entry.afterCount, existing);
    }
    for (const [, breakList] of breaksByAfterCount.entries()) {
      breakList.sort((a, b) => a.slotTime.getTime() - b.slotTime.getTime());
    }

    type ActiveItem =
      | { type: 'track'; track: typeof activeUnplayedTracks[0] }
      | { type: 'break'; breakObj: typeof upcomingBreaks[0] };

    const activeTimelineSequence: ActiveItem[] = [];

    for (let i = 0; i <= activeUnplayedTracks.length; i++) {
      const breaksHere = breaksByAfterCount.get(i);
      if (breaksHere) {
        for (const b of breaksHere) {
          activeTimelineSequence.push({ type: 'break', breakObj: b });
        }
      }
      if (i < activeUnplayedTracks.length) {
        activeTimelineSequence.push({ type: 'track', track: activeUnplayedTracks[i] });
      }
    }

    let cursorTime = new Date(unplayedStartCursor);
    let activeTrackCounter = 1;
    let lastActiveTrackEnd = new Date(cursorTime);

    const activeTimelineEntries: PlaylistTimelineEntry[] = [];

    for (const item of activeTimelineSequence) {
      if (item.type === 'track') {
        const track = item.track;
        const trackDur = getTrackDurationSec(track);
        const trackStart = new Date(cursorTime);
        const trackEnd = new Date(trackStart.getTime() + trackDur * 1000);

        activeTimelineEntries.push({
          type: 'track',
          id: track.id,
          track,
          trackNumber: activeTrackCounter++,
          startTime: trackStart,
          endTime: trackEnd,
          played: false,
          cancelled: false
        });

        cursorTime = new Date(trackEnd);
        lastActiveTrackEnd = new Date(trackEnd);
      } else {
        const b = item.breakObj;
        const breakStart = new Date(cursorTime);
        const breakEnd = new Date(breakStart.getTime() + b.totalDurationSec * 1000);

        activeTimelineEntries.push({
          type: 'break',
          id: b.id,
          slotTime: b.slotTime,
          startTime: breakStart,
          endTime: breakEnd,
          interstitials: b.interstitials
        });

        cursorTime = new Date(breakEnd);
        lastActiveTrackEnd = new Date(breakEnd);
      }
    }

    // 5. Calculate Show End indicator card and Overrun card positions
    const showEndMs = showEnd.getTime();
    const showEntries = activeTimelineEntries.filter(i => i.startTime.getTime() < showEndMs);

    let maxShowEndMs = showStart.getTime();
    showEntries.forEach(i => {
      const endMs = (i.type === 'track' || i.type === 'break') ? i.endTime.getTime() : i.startTime.getTime();
      if (endMs > maxShowEndMs) {
        maxShowEndMs = endMs;
      }
    });

    let status: 'over' | 'under' | 'exact' = 'exact';
    let diffSeconds = 0;

    if (maxShowEndMs > showEndMs) {
      status = 'over';
      diffSeconds = Math.round((maxShowEndMs - showEndMs) / 1000);
    } else if (maxShowEndMs < showEndMs) {
      status = 'under';
      diffSeconds = Math.round((showEndMs - maxShowEndMs) / 1000);
    } else {
      status = 'exact';
      diffSeconds = 0;
    }

    const diffFormatted = formatDuration(diffSeconds);
    const showEndCardTimeMs = Math.max(showEndMs, maxShowEndMs);

    // Append show entries first
    items.push(...showEntries);

    // Append Show End indicator card right after show entries
    items.push({
      type: 'show-end',
      id: 'show-end-indicator',
      showEnd,
      diffSeconds,
      diffFormatted,
      status,
      startTime: new Date(showEndCardTimeMs)
    });

    // Extra entries are active entries starting at or after showEnd boundary / showEndCardTimeMs
    const extraEntries = activeTimelineEntries.filter(i => i.startTime.getTime() >= showEndMs || i.startTime.getTime() >= showEndCardTimeMs);
    let maxExtraEndMs = showEndCardTimeMs;

    if (extraEntries.length > 0) {
      extraEntries.forEach(i => {
        const endMs = (i.type === 'track' || i.type === 'break') ? i.endTime.getTime() : i.startTime.getTime();
        if (endMs > maxExtraEndMs) {
          maxExtraEndMs = endMs;
        }
      });

      const totalExtraSeconds = Math.round((maxExtraEndMs - showEndCardTimeMs) / 1000);
      const extraFormatted = formatDuration(totalExtraSeconds);

      items.push({
        type: 'extra-tracks',
        id: 'extra-tracks-indicator',
        totalExtraSeconds,
        extraFormatted,
        startTime: new Date(showEndCardTimeMs + 1)
      });

      // Append overrun extra entries after Overrun indicator card
      const overrunItems = extraEntries.map(entry => ({ ...entry, isOverrun: true }));
      items.push(...overrunItems);
    }

    // 6. Cancelled Playlist Tracks positioned after the Overrun card at the bottom of the view
    const cancelledTracks = playlistTracks.filter(t => !playedPlaylistTracks[t.id] && !playedPlaylistTracks[t.fileName] && (cancelledTrackIds.includes(t.id) || cancelledTrackIds.includes(t.fileName)));
    let bottomCursor = new Date(Math.max(lastActiveTrackEnd.getTime(), showEnd.getTime(), maxExtraEndMs) + 60000);

    for (const track of cancelledTracks) {
      const trackDur = getTrackDurationSec(track);
      const trackStart = new Date(bottomCursor);
      const trackEnd = new Date(trackStart.getTime() + trackDur * 1000);
      items.push({
        type: 'track',
        id: track.id,
        track,
        trackNumber: 0,
        startTime: trackStart,
        endTime: trackEnd,
        played: false,
        cancelled: true
      });
      bottomCursor = new Date(trackEnd.getTime() + 1000);
    }

    return items;
  }, [playMode, playlistShow, playlistTracks, playlistFile, syncTime, interstitials, playedPlaylistTracks, cancelledTrackIds, nowClock, breakPositions]);

  const breakIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    let breakSlotCount = 0;
    playlistTimeline.forEach((item) => {
      if (item.type === 'break') {
        breakSlotCount++;
        item.interstitials.forEach((s) => {
          const slotKey = `${item.slotTime.toISOString()}-${s.id}`;
          map[slotKey] = breakSlotCount;
        });
      }
    });
    return map;
  }, [playlistTimeline]);

  const handleMoveTrackUp = (trackId: string) => {
    triggerMovedHighlight(trackId);
    
    // Check if moving inside cancelled tracks
    const isCancelled = cancelledTrackIds.includes(trackId);
    if (isCancelled) {
      setPlaylistTracks(prev => {
        let updatedTracks = prev;
        const cancelledTracks = prev.filter(t => !playedPlaylistTracks[t.id] && !playedPlaylistTracks[t.fileName] && (cancelledTrackIds.includes(t.id) || cancelledTrackIds.includes(t.fileName)));
        const idxInCancelled = cancelledTracks.findIndex(t => t.id === trackId);
        if (idxInCancelled === 0) {
          // Reactivate track when moved above top cancelled item
          const newCancelled = cancelledTrackIds.filter(id => id !== trackId);
          setCancelledTrackIds(newCancelled);
          saveCurrentShowPlaylistLog(undefined, newCancelled, prev);
          return prev;
        } else if (idxInCancelled > 0) {
          const prevTrack = cancelledTracks[idxInCancelled - 1];
          const newTracks = [...prev];
          const pos1 = newTracks.findIndex(t => t.id === trackId);
          const pos2 = newTracks.findIndex(t => t.id === prevTrack.id);
          if (pos1 !== -1 && pos2 !== -1) {
            newTracks[pos1] = prevTrack;
            newTracks[pos2] = trackId ? prev.find(t => t.id === trackId)! : prevTrack;
            updatedTracks = newTracks;
          }
        }
        saveCurrentShowPlaylistLog(undefined, undefined, updatedTracks);
        return updatedTracks;
      });
      return;
    }

    // Active unplayed item move: look at active timeline cards (tracks & breaks)
    const activeTimelineCards = playlistTimeline.filter(
      item => (item.type === 'track' && !item.played && !item.cancelled) || item.type === 'break'
    );
    const cardIdx = activeTimelineCards.findIndex(item => item.type === 'track' && item.id === trackId);
    if (cardIdx > 0) {
      const prevItem = activeTimelineCards[cardIdx - 1];
      if (prevItem.type === 'track') {
        // Swap with previous track in playlistTracks
        setPlaylistTracks(prev => {
          const currentTrack = prev.find(t => t.id === trackId);
          const prevTrack = prev.find(t => t.id === prevItem.id);
          if (currentTrack && prevTrack) {
            const newTracks = [...prev];
            const pos1 = newTracks.findIndex(t => t.id === currentTrack.id);
            const pos2 = newTracks.findIndex(t => t.id === prevTrack.id);
            if (pos1 !== -1 && pos2 !== -1) {
              newTracks[pos1] = prevTrack;
              newTracks[pos2] = currentTrack;
              saveCurrentShowPlaylistLog(undefined, undefined, newTracks);
              return newTracks;
            }
          }
          return prev;
        });
      } else if (prevItem.type === 'break') {
        // Track wants to move ABOVE break (prevItem) -> break should come AFTER trackId
        let tracksBeforeBreakCount = 0;
        for (let i = 0; i < cardIdx - 1; i++) {
          if (activeTimelineCards[i].type === 'track') {
            tracksBeforeBreakCount++;
          }
        }
        const newCount = tracksBeforeBreakCount + 1;
        const newBreakPositions = { ...breakPositions, [prevItem.id]: newCount };
        setBreakPositions(newBreakPositions);
        saveCurrentShowPlaylistLog(undefined, undefined, undefined, undefined, newBreakPositions);
      }
    }
  };

  const handleMoveTrackDown = (trackId: string) => {
    triggerMovedHighlight(trackId);

    // Check if moving inside cancelled tracks
    const isCancelled = cancelledTrackIds.includes(trackId);
    if (isCancelled) {
      setPlaylistTracks(prev => {
        let updatedTracks = prev;
        const cancelledTracks = prev.filter(t => !playedPlaylistTracks[t.id] && !playedPlaylistTracks[t.fileName] && (cancelledTrackIds.includes(t.id) || cancelledTrackIds.includes(t.fileName)));
        const idxInCancelled = cancelledTracks.findIndex(t => t.id === trackId);
        if (idxInCancelled >= 0 && idxInCancelled < cancelledTracks.length - 1) {
          const nextTrack = cancelledTracks[idxInCancelled + 1];
          const newTracks = [...prev];
          const pos1 = newTracks.findIndex(t => t.id === trackId);
          const pos2 = newTracks.findIndex(t => t.id === nextTrack.id);
          if (pos1 !== -1 && pos2 !== -1) {
            newTracks[pos1] = nextTrack;
            newTracks[pos2] = prev.find(t => t.id === trackId)!;
            updatedTracks = newTracks;
          }
        }
        saveCurrentShowPlaylistLog(undefined, undefined, updatedTracks);
        return updatedTracks;
      });
      return;
    }

    // Active unplayed item move: look at active timeline cards (tracks & breaks)
    const activeTimelineCards = playlistTimeline.filter(
      item => (item.type === 'track' && !item.played && !item.cancelled) || item.type === 'break'
    );
    const cardIdx = activeTimelineCards.findIndex(item => item.type === 'track' && item.id === trackId);
    if (cardIdx !== -1 && cardIdx < activeTimelineCards.length - 1) {
      const nextItem = activeTimelineCards[cardIdx + 1];
      if (nextItem.type === 'track') {
        // Swap with next track in playlistTracks
        setPlaylistTracks(prev => {
          const currentTrack = prev.find(t => t.id === trackId);
          const nextTrack = prev.find(t => t.id === nextItem.id);
          if (currentTrack && nextTrack) {
            const newTracks = [...prev];
            const pos1 = newTracks.findIndex(t => t.id === currentTrack.id);
            const pos2 = newTracks.findIndex(t => t.id === nextTrack.id);
            if (pos1 !== -1 && pos2 !== -1) {
              newTracks[pos1] = nextTrack;
              newTracks[pos2] = currentTrack;
              saveCurrentShowPlaylistLog(undefined, undefined, newTracks);
              return newTracks;
            }
          }
          return prev;
        });
      } else if (nextItem.type === 'break') {
        // Track wants to move BELOW break (nextItem) -> break should come BEFORE trackId
        let tracksBeforeBreakCount = 0;
        for (let i = 0; i < cardIdx + 1; i++) {
          if (activeTimelineCards[i].type === 'track' && activeTimelineCards[i].id !== trackId) {
            tracksBeforeBreakCount++;
          }
        }
        const newCount = tracksBeforeBreakCount;
        const newBreakPositions = { ...breakPositions, [nextItem.id]: newCount };
        setBreakPositions(newBreakPositions);
        saveCurrentShowPlaylistLog(undefined, undefined, undefined, undefined, newBreakPositions);
      }
    }
  };

  const handleCancelTrack = (trackId: string) => {
    const updatedCancelled = [...cancelledTrackIds, trackId];
    setCancelledTrackIds(updatedCancelled);
    saveCurrentShowPlaylistLog(undefined, updatedCancelled);
  };

  const handleReactivateTrack = (trackId: string) => {
    const updatedCancelled = cancelledTrackIds.filter(id => id !== trackId);
    setCancelledTrackIds(updatedCancelled);
    saveCurrentShowPlaylistLog(undefined, updatedCancelled);
  };

  const handleTogglePlayTrack = (track: {
    id: string;
    fileName: string;
    title: string;
    durationSeconds: number;
    durationFormatted: string;
    streamUrl: string;
  }) => {
    const slotKey = track.id;
    if (playingAudiosRef.current.has(slotKey)) {
      const a = playingAudiosRef.current.get(slotKey);
      if (a) {
        a.pause();
        a.src = "";
      }
      playingAudiosRef.current.delete(slotKey);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[slotKey];
        return copy;
      });
    } else {
      const playableUrl = getPlayableUrl(track.streamUrl);
      const audio = new Audio(playableUrl);
      const playedAt = new Date().toISOString();

      const updateProgress = () => {
        setPlayingStates(prev => ({
          ...prev,
          [slotKey]: { currentTime: audio.currentTime, duration: audio.duration || 0 }
        }));
      };

      audio.addEventListener('loadedmetadata', updateProgress);
      audio.addEventListener('timeupdate', updateProgress);

      audio.addEventListener('ended', () => {
        playingAudiosRef.current.delete(slotKey);
        setPlayingStates(prev => {
          const copy = { ...prev };
          delete copy[slotKey];
          return copy;
        });
      });

      audio.addEventListener('error', () => {
        playingAudiosRef.current.delete(slotKey);
        setPlayingStates(prev => {
          const copy = { ...prev };
          delete copy[slotKey];
          return copy;
        });
      });

      audio.play().then(() => {
        playingAudiosRef.current.set(slotKey, audio);
        setPlayingStates(prev => ({
          ...prev,
          [slotKey]: { currentTime: audio.currentTime, duration: audio.duration || track.durationSeconds || 0 }
        }));

        const meta = trackMetadataMap[track.id] || trackMetadataMap[track.fileName] || trackMetadataMap[track.streamUrl];
        const durRes = resolveTrackDuration(track, meta, audio.duration);
        const trackDurationSeconds = durRes.durationSeconds;
        const trackDurationFormatted = durRes.durationFormatted;

        const showStart = playlistShow ? getActualShowStart(playlistShow, syncTime || new Date()) : undefined;

        const trackTitle = meta?.title || track.title || track.fileName;
        const trackArtist = meta?.artist || (track as any).artist || '';
        const trackAlbumArtist = meta?.albumArtist || (track as any).albumArtist || trackArtist;
        const trackAlbum = meta?.album || (track as any).album || '';

        // 1. Central Logs.json is strictly for interstitials (playlist tracks are logged exclusively to the show JSON log)
        // onLog(logEntry) omitted for playlist music tracks as per logging configuration

        // 2. Defer moving played card above NOW bar until next regular redraw tick
        const playedInfo = {
          id: track.id,
          playedAt,
          fileName: track.fileName,
          title: trackTitle,
          artist: trackArtist,
          albumArtist: trackAlbumArtist,
          album: trackAlbum,
          durationSeconds: trackDurationSeconds,
          durationFormatted: trackDurationFormatted,
          isInterstitial: false
        };

        if (playMode !== 'Export') {
          pendingPlayedPlaylistTracksRef.current[track.id] = playedInfo;
          pendingPlayedPlaylistTracksRef.current[track.fileName] = playedInfo;

          const updatedPlayedMap = {
            ...playedPlaylistTracks,
            [track.id]: playedInfo,
            [track.fileName]: playedInfo
          };
          setPlayedPlaylistTracks(updatedPlayedMap);

          // 3. Save entry to playlist show Log___.json
          saveCurrentShowPlaylistLog(updatedPlayedMap);
        }

        // Reset card redraw timer when play is started
        startCardRotateTimer();

        if (playlistShow && showStart) {
          const showNameShort = playlistShow.nameShort || playlistShow.name;

          fetch('/api/shows/playlist/log-entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              showNameShort,
              showStartTime: showStart.toISOString(),
              entry: {
                timestamp: playedAt,
                type: 'track',
                name: trackTitle,
                fileName: track.fileName,
                status: 'played',
                artist: trackArtist,
                albumArtist: trackAlbumArtist,
                album: trackAlbum,
                durationSeconds: trackDurationSeconds,
                durationFormatted: trackDurationFormatted
              }
            })
          }).catch(e => console.error('Failed to save playlist track log:', e));
        }
      }).catch(e => console.error('Error playing playlist track:', e));
    }
  };

  const handleVerifyEvergreens = async () => {
    setIsVerifyingEvergreens(true);
    try {
      const resp = await fetch('/api/shows/verify-evergreens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shows })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to verify folders');
      
      if (data.interstitialsReadonlyError) {
        alert(`Warning: ${data.interstitialsReadonlyMessage}`);
        return;
      }

      const createdMsg = data.createdFolders?.length > 0
        ? `\n\nCreated folders for shows: ${data.createdFolders.join(', ')}`
        : '';
      const playlistsLoc = data.playlistsPath ? `\nPlaylists Location: ${data.playlistsPath}` : '';
      const intersLoc = data.interstitialsPath ? `\nInterstitials Location: ${data.interstitialsPath}` : '';
      alert(`Evergreen, Playlist & Interstitial folder verification completed successfully!\n\nEvergreens Location: ${data.evergreensPath}${playlistsLoc}${intersLoc}${createdMsg}`);
    } catch (err: any) {
      alert(`Error verifying folders:\n${err.message}`);
    } finally {
      setIsVerifyingEvergreens(false);
    }
  };

  const renderLiveReadOverlay = () => {
    if (!activeLiveReadOverlay) return null;

    // In Desktop App (Mac/Win), spawnLiveRead creates a standalone BrowserWindow.
    // Do NOT render the in-app modal overlay inside the main window when Electron window is spawned.
    if ((window as any).electronAPI && (window as any).electronAPI.spawnLiveRead) {
      return null;
    }

    return (
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <LiveReadPopout
          initialFileName={activeLiveReadOverlay.filePath || activeLiveReadOverlay.fileName}
          initialInterstitialId={activeLiveReadOverlay.interstitialId}
          initialInterstitialName={activeLiveReadOverlay.interstitialName}
          initialInterstitialTime={activeLiveReadOverlay.interstitialTime}
          initialLoggedTime={activeLiveReadOverlay.initialLoggedTime}
          backupMp3Url={activeLiveReadOverlay.backupMp3Url}
          isOverlay={true}
          isPreview={activeLiveReadOverlay.playMode === 'Export' || activeLiveReadOverlay.isPreview || playMode === 'Export'}
          onClose={() => setActiveLiveReadOverlay(null)}
          onLogCommit={(logEntry) => {
            if (playMode !== 'Export' && activeLiveReadOverlay.playMode !== 'Export' && !activeLiveReadOverlay.isPreview) {
              onLog(logEntry);
              const activeShow = effectiveShow || playlistShow;
              if ((playMode === 'Playlist' || playMode === 'Prerecord') && activeShow && logEntry.interstitialId) {
                const targetInterstitial = interstitials.find(s => s.id === logEntry.interstitialId);
                const durSec = targetInterstitial ? parseInt(targetInterstitial.duration, 10) || 60 : 60;
                const mins = Math.floor(durSec / 60);
                const secs = durSec % 60;
                const durFmt = `${mins}:${secs.toString().padStart(2, '0')}`;
                const updatedPlayed = {
                  ...playedPlaylistTracksRef.current,
                  [logEntry.interstitialId]: {
                    id: logEntry.interstitialId,
                    playedAt: logEntry.timestamp,
                    fileName: logEntry.mp3Name || targetInterstitial?.mp3Url || 'Live Read',
                    title: logEntry.interstitialName || targetInterstitial?.name || 'Live Read',
                    durationSeconds: durSec,
                    durationFormatted: durFmt,
                    isInterstitial: true
                  }
                };
                setPlayedPlaylistTracks(updatedPlayed);
                saveCurrentShowPlaylistLog(updatedPlayed);
              }
            }
            setActiveLiveReadOverlay(null);
          }}
          onPlayBackupMp3={(backupUrl) => {
            setActiveLiveReadOverlay(null);
            if (activeLiveReadOverlay.interstitialId && activeLiveReadOverlay.slotKey && activeLiveReadOverlay.slotISO) {
              const targetInterstitial = interstitials.find(s => s.id === activeLiveReadOverlay.interstitialId);
              if (targetInterstitial) {
                const slotDate = new Date(activeLiveReadOverlay.slotISO);
                playBackupAudioTrack(backupUrl, activeLiveReadOverlay.slotKey, targetInterstitial, slotDate);
              }
            }
          }}
        />
      </div>
    );
  };

  const handlePlay = (s: Interstitial, slot: Date) => {
    const slotKey = `${slot.toISOString()}-${s.id}`;
    
    if (playingAudiosRef.current.has(slotKey)) {
      const a = playingAudiosRef.current.get(slotKey);
      if (a) {
        a.pause();
        a.src = "";
      }
      playingAudiosRef.current.delete(slotKey);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[slotKey];
        return copy;
      });
      return;
    }

    if (s.assetType === 'script') {
      const parts = s.mp3Url ? s.mp3Url.split('/') : [];
      const filename = parts[parts.length - 1] || 'Script';
      
      const interstitialTimeISO = getParsedCustomTimeISO(customScriptTimes[slotKey], slot);

      const slotISO = slot.toISOString();
      const playedLog = logs.find(l => 
        l.interstitialId === s.id && 
        (l.interstitialTime === slotISO || isSameMinute(parseISO(l.timestamp), slot)) &&
        (l.status === 'played' || l.status === 'backup play')
      );

      const payload = {
        name: filename,
        fileName: filename,
        filePath: s.mp3Url,
        interstitialId: s.id,
        interstitialName: s.name,
        interstitialTime: interstitialTimeISO,
        initialLoggedTime: playedLog?.logTimeStamp || playedLog?.timestamp || '',
        backupMp3Url: s.backupMp3Url,
        slotKey,
        slotISO: interstitialTimeISO,
        playMode,
        isPreview: playMode === 'Export'
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

    const playableUrl = getPlayableUrl(s.mp3Url);
    const audio = new Audio(playableUrl);

    const updateProgress = () => {
      setPlayingStates(prev => ({
        ...prev,
        [slotKey]: { currentTime: audio.currentTime, duration: audio.duration || 0 }
      }));
    };

    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('timeupdate', updateProgress);

    audio.addEventListener('ended', () => {
      playingAudiosRef.current.delete(slotKey);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[slotKey];
        return copy;
      });
    });

    audio.addEventListener('error', () => {
      playingAudiosRef.current.delete(slotKey);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[slotKey];
        return copy;
      });
    });

    audio.play().then(() => {
      playingAudiosRef.current.set(slotKey, audio);
      setPlayingStates(prev => ({
        ...prev,
        [slotKey]: { currentTime: audio.currentTime, duration: audio.duration || 0 }
      }));

      if (playMode !== 'Export') {
        const playedAt = new Date().toISOString();
        const logEntry: LogEntry = {
          timestamp: playedAt,
          interstitialTime: slot.toISOString(),
          mp3Name: s.mp3Url,
          interstitialName: s.name,
          interstitialId: s.id,
          status: 'played',
          playMode: playMode,
          ...(playlistShow ? {
            showId: playlistShow.id,
            showName: playlistShow.name,
            hostName: playlistShow.host,
            showDateTime: new Date(slot).toISOString()
          } : {})
        };
        onLog(logEntry);

        if (playMode === 'Playlist' && playlistShow) {
          const durRes = resolveTrackDuration({ streamUrl: s.mp3Url, fileName: s.mp3Url }, undefined, audio.duration);
          const updatedPlayed = {
            ...playedPlaylistTracks,
            [s.id]: {
              id: s.id,
              playedAt,
              fileName: s.mp3Url,
              title: s.name,
              durationSeconds: durRes.durationSeconds,
              durationFormatted: durRes.durationFormatted,
              isInterstitial: true
            }
          };
          setPlayedPlaylistTracks(updatedPlayed);
          saveCurrentShowPlaylistLog(updatedPlayed);
        }
      }
    }).catch(err => {
      console.error('Playback failed', err);
      if (playMode !== 'Export') {
        onLog({
          timestamp: new Date().toISOString(),
          interstitialTime: slot.toISOString(),
          mp3Name: s.mp3Url,
          interstitialName: s.name,
          interstitialId: s.id,
          status: 'failed',
          playMode: playMode,
          ...(playlistShow ? {
            showId: playlistShow.id,
            showName: playlistShow.name,
            hostName: playlistShow.host,
            showDateTime: new Date(slot).toISOString()
          } : {})
        });
      }
    });
  };

  const playBackupAudioTrack = (backupUrl: string, slotKey: string, s: Interstitial, slot: Date) => {
    if (playingAudiosRef.current.has(slotKey)) {
      const a = playingAudiosRef.current.get(slotKey);
      if (a) {
        a.pause();
        a.src = "";
      }
      playingAudiosRef.current.delete(slotKey);
    }

    const playableUrl = getPlayableUrl(backupUrl);
    if (!playableUrl) return;
    const audio = new Audio(playableUrl);

    const updateProgress = () => {
      setPlayingStates(prev => ({
        ...prev,
        [slotKey]: { currentTime: audio.currentTime, duration: audio.duration || 0 }
      }));
    };

    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('timeupdate', updateProgress);

    audio.addEventListener('ended', () => {
      playingAudiosRef.current.delete(slotKey);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[slotKey];
        return copy;
      });
    });

    audio.addEventListener('error', () => {
      playingAudiosRef.current.delete(slotKey);
      setPlayingStates(prev => {
        const copy = { ...prev };
        delete copy[slotKey];
        return copy;
      });
    });

    audio.play().then(() => {
      playingAudiosRef.current.set(slotKey, audio);
      setPlayingStates(prev => ({
        ...prev,
        [slotKey]: { currentTime: audio.currentTime, duration: audio.duration || 0 }
      }));

      if (playMode !== 'Export') {
        const playedAt = new Date().toISOString();
        const activeShow = effectiveShow || playlistShow;
        const logEntry: LogEntry = {
          timestamp: playedAt,
          interstitialTime: slot.toISOString(),
          mp3Name: backupUrl,
          interstitialName: s.name,
          interstitialId: s.id,
          status: 'backup play',
          playMode: playMode,
          ...(activeShow ? {
            showId: activeShow.id,
            showName: activeShow.name,
            hostName: activeShow.host,
            showDateTime: new Date(slot).toISOString()
          } : {})
        };
        onLog(logEntry);

        if ((playMode === 'Playlist' || playMode === 'Prerecord') && activeShow) {
          const durRes = resolveTrackDuration({ streamUrl: backupUrl, fileName: backupUrl }, undefined, audio.duration);
          const updatedPlayed = {
            ...playedPlaylistTracks,
            [s.id]: {
              id: s.id,
              playedAt,
              fileName: backupUrl,
              title: `${s.name} (backup mp3)`,
              durationSeconds: durRes.durationSeconds,
              durationFormatted: durRes.durationFormatted,
              isInterstitial: true
            }
          };
          setPlayedPlaylistTracks(updatedPlayed);
          saveCurrentShowPlaylistLog(updatedPlayed);
        }
      }
    }).catch(err => {
      console.error('Backup MP3 playback failed', err);
    });
  };

  const isPlayed = (interstitialId: string, slot: Date) => {
    return logs.some(l => 
      l.interstitialId === interstitialId && 
      (l.interstitialTime === slot.toISOString() || isSameMinute(parseISO(l.timestamp), slot)) &&
      (l.status === 'played' || l.status === 'backup play')
    );
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const itemsToExport = useMemo(() => {
    if (playMode !== 'Export' || !prerecordDate) return [];
    
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
      isEvergreen?: boolean;
      showNameShort?: string;
      showName?: string;
    }> = [];

    playlistTimeline.forEach((item) => {
      if (item.type === 'break') {
        item.interstitials.forEach((s) => {
          const itemIdx = items.length + 1;
          const slotTimeStr = format(item.slotTime, 'HH:mm');
          const safeSlotTime = slotTimeStr.replace(/:/g, '-');
          const rawName = s.name || 'Unnamed Break';
          const safeInterstitialName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
          const sourceFileName = s.mp3Url || '';
          const dotIndex = sourceFileName.lastIndexOf('.');
          const ext = dotIndex !== -1 ? sourceFileName.substring(dotIndex) : '.mp3';
          const paddedIdx = String(itemIdx).padStart(2, '0');
          const targetFileName = `Break ${paddedIdx} at ${safeSlotTime} - ${safeInterstitialName}${ext}`;
          const exists = getMP3Status(s.mp3Url).exists;

          const backupMp3Exists = s.backupMp3Url ? getMP3Status(s.backupMp3Url).exists : false;

          items.push({
            slotTime: slotTimeStr,
            fileName: s.mp3Url,
            interstitialName: rawName,
            interstitialId: s.id,
            minute: s.minute,
            exists,
            targetFileName,
            slotISO: item.slotTime.toISOString(),
            assetType: s.assetType,
            approximateReadTime: s.approximateReadTime,
            backupMp3Url: s.backupMp3Url,
            backupMp3Exists,
            isEvergreen: false,
          });
        });
      } else if (item.type === 'track') {
        const itemIdx = items.length + 1;
        const slotTimeStr = format(item.startTime, 'HH:mm');
        const safeSlotTime = slotTimeStr.replace(/:/g, '-');
        const rawName = item.track.title || item.track.fileName || 'Evergreen Track';
        const safeTrackName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
        const sourceFileName = item.track.fileName || '';
        const dotIndex = sourceFileName.lastIndexOf('.');
        const ext = dotIndex !== -1 ? sourceFileName.substring(dotIndex) : '.mp3';
        const paddedIdx = String(itemIdx).padStart(2, '0');
        const targetFileName = `Track ${paddedIdx} at ${safeSlotTime} - ${safeTrackName}${ext}`;
        const exists = getMP3Status(sourceFileName).exists;

        items.push({
          slotTime: slotTimeStr,
          fileName: sourceFileName,
          interstitialName: rawName,
          interstitialId: item.track.id,
          minute: item.startTime.getMinutes(),
          exists,
          targetFileName,
          slotISO: item.startTime.toISOString(),
          assetType: 'audio',
          isEvergreen: true,
          showNameShort: playlistShow?.shortName,
          showName: playlistShow?.name,
        });
      }
    });

    return items;
  }, [playMode, prerecordDate, playlistTimeline, playlistShow]);

  const previewText = useMemo(() => {
    if (playMode !== 'Export' || !prerecordDate) return '';

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
      'SEQUENCE OF SCHEDULED EVERGREENS, SPECIALS & BREAKS:',
      '------------------------------------------------------------------------'
    ];

    if (itemsToExport.length === 0) {
      txtLines.push('No active scheduled items or breaks found in this timeframe.');
    } else {
      itemsToExport.forEach((item: any, idx: number) => {
        const itemIdx = idx + 1;
        const itemSlotTime = item.slotTime;
        const rawName = item.interstitialName || 'Unnamed Item';
        const sourceFileName = item.fileName || '';
        const targetFileName = item.targetFileName || sourceFileName;
        const isScript = item.assetType === 'script';
        const typeLabel = item.isEvergreen ? 'EVERGREEN TRACK' : (isScript ? 'LIVE READ BREAK' : 'BREAK');
        const status = item.exists ? 'Found' : 'Missing';

        if (status === 'Found') {
          txtLines.push(`${itemIdx}. [${typeLabel}] Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported ${isScript ? 'Script' : 'File'}: ${targetFileName}`);
          txtLines.push(`   Title: ${rawName}`);
          txtLines.push(`   Source ${isScript ? 'Script' : 'File'}: ${sourceFileName}`);
        } else {
          txtLines.push(`${itemIdx}. [${typeLabel}] MISSING FILE - THIS FILE COULD NOT BE FOUND.`);
          txtLines.push(`   Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported ${isScript ? 'Script' : 'File'}: ${targetFileName}`);
          txtLines.push(`   Title: ${rawName}`);
          txtLines.push(`   Source ${isScript ? 'Script' : 'File'}: ${sourceFileName}`);
        }

        if (isScript && item.backupMp3Url) {
          const dotIdx = targetFileName.lastIndexOf('.');
          const baseName = dotIdx !== -1 ? targetFileName.substring(0, dotIdx) : targetFileName;
          const backupExt = item.backupMp3Url.lastIndexOf('.') !== -1 ? item.backupMp3Url.substring(item.backupMp3Url.lastIndexOf('.')) : '.mp3';
          const backupTargetName = `${baseName} (Backup)${backupExt}`;
          const backupStatus = item.backupMp3Exists ? 'Found' : 'Missing';
          txtLines.push(`   Alternate Backup MP3: ${backupTargetName} (${backupStatus})`);
          txtLines.push(`   Source Backup MP3: ${item.backupMp3Url}`);
        }

        txtLines.push('------------------------------------------------------------------------');
      });
    }

    return txtLines.join('\n');
  }, [playMode, prerecordDate, prerecordLengthMinutes, itemsToExport]);

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
        (l.status === 'played' || l.status === 'backup play')
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
        (l.status === 'played' || l.status === 'backup play')
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
          {renderLiveReadOverlay()}
        </div>
      );
    }

    return (
      <div id="export-mode-container" className="flex flex-col h-full bg-slate-50">
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto space-y-2 pb-4"
        >
          {/* Action stacked buttons above the MP3 list, satisfying layout requests A & B */}
          <div className="sticky top-0 bg-slate-50 z-10 space-y-1.5 pt-1.5 pb-2 px-1.5 border-b border-slate-200">
            <button
              id="bg-btn-execute-export"
              onClick={() => onExecuteExport ? onExecuteExport(itemsToExport, previewText) : undefined}
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
                  <span>{exportActiveShow ? exportActiveShow.name : (effectiveShow ? effectiveShow.name : "Export Mode")}</span>
                </div>
              </div>
            </div>

            {/* Header indicator bar matching 'mp3's' */}
            <div 
              ref={activeItemRef}
              className="bg-blue-600 min-h-7 py-1 px-3 flex items-center justify-between gap-2 rounded shadow-sm border border-blue-500 flex-wrap"
              id="export-start-indicator"
            >
              <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5 flex-wrap">
                <ListOrdered className="w-3.5 h-3.5 text-white/90 shrink-0" />
                mp3's ({playlistTimeline.filter(i => i.type === 'track').length} tracks, {playlistTimeline.filter(i => i.type === 'break').length} breaks, {formatTotalTrackTime(playlistTimeline.reduce((acc, item) => item.type === 'track' ? acc + Math.round((item.endTime.getTime() - item.startTime.getTime()) / 1000) : acc, 0))})
              </span>
              {isPlaylistLoading && (
                <span className="text-[10px] font-mono text-blue-100 flex items-center gap-1 shrink-0">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  loading...
                </span>
              )}
            </div>
          </div>

          {/* Cards for each item in the export timeframe */}
          <div className="space-y-2 px-1">
            {playlistTimeline.length === 0 || playlistTimeline.every(i => i.type === 'header') ? (
              <div className="p-3 bg-white border border-slate-300 border-dashed rounded text-center text-xs text-slate-500 mx-1">
                No active items found in timeframe.
              </div>
            ) : (
              playlistTimeline.map((item, index) => {
                if (item.type === 'header') {
                  return null;
                }

                if (item.type === 'track') {
                  const isCurrentlyPlaying = !!playingStates[item.track.id] || playingAudiosRef.current.has(item.track.id);
                  const isPlayedTrack = !!item.played || !!playedPlaylistTracks[item.track.id] || !!playedPlaylistTracks[item.track.fileName] || !!pendingPlayedPlaylistTracksRef.current[item.track.id] || !!pendingPlayedPlaylistTracksRef.current[item.track.fileName];
                  const playedAtTime = item.playedAt || playedPlaylistTracks[item.track.id]?.playedAt || playedPlaylistTracks[item.track.fileName]?.playedAt || pendingPlayedPlaylistTracksRef.current[item.track.id]?.playedAt || pendingPlayedPlaylistTracksRef.current[item.track.fileName]?.playedAt;
                  const formattedPlayedAt = playedAtTime ? format(parseISO(playedAtTime), 'HH:mm') : format(new Date(), 'HH:mm');
                  const isCancelledTrack = !!item.cancelled;

                  const meta = trackMetadataMap[item.track.streamUrl] || 
                               trackMetadataMap[item.track.fileName] || 
                               trackMetadataMap[item.track.id];

                  const isParsed = !!meta;
                  const mp3FileName = item.track.fileName || item.track.title || '';
                  const rawArtist = meta?.artist ? meta.artist.trim() : null;
                  const rawAlbumArtist = meta?.albumArtist ? meta.albumArtist.trim() : null;
                  const rawTitle = meta?.title ? meta.title.trim() : null;
                  const rawAlbum = meta?.album ? meta.album.trim() : null;

                  let row1Text: string | null = null;
                  if (rawArtist && rawAlbumArtist && rawArtist.toLowerCase() !== rawAlbumArtist.toLowerCase()) {
                    row1Text = `${rawArtist} (${rawAlbumArtist})`;
                  } else if (rawArtist) {
                    row1Text = rawArtist;
                  } else if (rawAlbumArtist) {
                    row1Text = rawAlbumArtist;
                  }

                  let row2Text = rawTitle || mp3FileName;
                  if (rawAlbum) {
                    row2Text = `${row2Text} - ${rawAlbum}`;
                  }

                  const tooltipParts: string[] = [];
                  if (mp3FileName) tooltipParts.push(`File: ${mp3FileName}`);
                  if (rawTitle) tooltipParts.push(`Title: ${rawTitle}`);
                  if (rawArtist) tooltipParts.push(`Artist: ${rawArtist}`);
                  if (rawAlbumArtist) tooltipParts.push(`Album Artist: ${rawAlbumArtist}`);
                  if (rawAlbum) tooltipParts.push(`Album: ${rawAlbum}`);
                  if (!isParsed) tooltipParts.push(`(ID3 Tags: ...parsing...)`);
                  const tooltipText = tooltipParts.join('\n');

                  return (
                    <div 
                      key={item.id}
                      className={cn(
                        "rounded border shadow-xs p-2 my-1.5 transition-all flex flex-col gap-0 select-none text-left border-l-[4px]",
                        item.track ? "pb-[1px]" : "",
                        item.isOverrun ? "border-amber-600" : "",
                        (item.track && item.track.id === movedHighlightTrackId)
                          ? "ring-2 ring-purple-500/90 shadow-lg scale-[1.01] z-10"
                          : isCurrentlyPlaying 
                            ? "ring-1 ring-purple-500/40" 
                            : isPlayedTrack
                              ? "opacity-90"
                              : isCancelledTrack
                                ? "opacity-75"
                                : ""
                      )}
                      style={{
                        backgroundColor: 'var(--playlist-card-bg)',
                        borderColor: item.isOverrun ? '#d97706' : 'var(--playlist-card-border)',
                        color: 'var(--playlist-card-text)',
                        borderLeftColor: isCurrentlyPlaying
                          ? '#9333ea'
                          : isPlayedTrack
                            ? '#10b981'
                            : isCancelledTrack
                              ? '#94a3b8'
                              : '#a855f7'
                      }}
                      title={tooltipText}
                    >
                      {/* Top Header Bar for Playlist card: ListMusic icon + Up/Down/X controls on left, Play button right-justified */}
                      <div 
                        className={cn(
                          "flex justify-between items-center -mx-2 -mt-2 px-2 py-1 rounded-t border-b",
                          item.isOverrun ? "border-amber-600/50" : "border-slate-200/60 dark:border-slate-700/60"
                        )}
                        style={{ backgroundColor: item.isOverrun ? 'rgba(217, 119, 6, 0.15)' : 'var(--playlist-card-header-bg)' }}
                      >
                        <div className="flex items-center gap-1.5">
                          <ListMusic className={cn("w-3.5 h-3.5 shrink-0", item.isOverrun ? "text-amber-600 dark:text-amber-400" : "text-purple-600 dark:text-purple-300")} />
                          
                          {/* Up, Down, X, Reactivate controls */}
                          <div className="flex items-center gap-0.5 ml-0.5">
                            {(!isPlayedTrack && !isCancelledTrack) && (
                              <>
                                <button
                                  onClick={() => handleMoveTrackUp(item.track.id)}
                                  className="p-0.5 text-slate-700 dark:text-slate-200 hover:text-purple-800 dark:hover:text-purple-200 hover:bg-purple-200/60 dark:hover:bg-purple-900/60 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                                  title="Move song up in queue"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleMoveTrackDown(item.track.id)}
                                  className="p-0.5 text-slate-700 dark:text-slate-200 hover:text-purple-800 dark:hover:text-purple-200 hover:bg-purple-200/60 dark:hover:bg-purple-900/60 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                                  title="Move song down in queue"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleCancelTrack(item.track.id)}
                                  className="p-0.5 text-slate-600 dark:text-slate-300 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-950/60 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                                  title="Cancel song (move to bottom)"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            )}

                            {isCancelledTrack && (
                              <button
                                onClick={() => handleReactivateTrack(item.track.id)}
                                className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors shadow-xs"
                                title="Reactivate song to queue"
                              >
                                <RotateCcw className="w-2.5 h-2.5 text-slate-600 dark:text-slate-300" />
                                <span>Reactivate</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Right side: Right-justified circular Play / Pause / Check / Ear button */}
                        <div className="flex items-center gap-1.5 ml-auto">
                          <button
                            onClick={() => handleTogglePlayTrack(item.track)}
                            className={cn(
                              "w-5 h-5 rounded-full shrink-0 aspect-square transition-all shadow-xs cursor-pointer flex items-center justify-center p-0 border border-transparent",
                              isCurrentlyPlaying
                                ? "bg-purple-700 hover:bg-purple-800 text-white"
                                : isPlayedTrack
                                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                  : isCancelledTrack
                                    ? "bg-slate-400 dark:bg-slate-700 hover:bg-slate-500 text-white"
                                    : "bg-purple-600 hover:bg-purple-500 text-white"
                            )}
                            title={isCurrentlyPlaying ? "Stop track" : isPlayedTrack ? "Replay playlist track" : "Play track"}
                          >
                            {isCurrentlyPlaying ? (
                              <Square className="w-2.5 h-2.5 fill-current" />
                            ) : isPlayedTrack ? (
                              <CheckCircle className="w-2.5 h-2.5 text-white" />
                            ) : (
                              <Ear className="w-3 h-3 text-white" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* MP3 Information */}
                      <div 
                        className={cn(
                          "flex flex-col justify-start items-start text-left w-full font-sans font-normal text-xs leading-snug gap-0.5 pt-[3px] pb-[3px]",
                          isCurrentlyPlaying ? "text-purple-800 dark:text-purple-200" :
                          isPlayedTrack ? "text-emerald-950 dark:text-emerald-100" :
                          isCancelledTrack ? "text-slate-500 dark:text-slate-400 line-through decoration-slate-400/60" :
                          "text-slate-900 dark:text-slate-100"
                        )}
                        title={tooltipText}
                      >
                        {!isParsed ? (
                          <div className="line-clamp-3 break-words font-sans font-normal text-xs w-full">
                            {mp3FileName}
                          </div>
                        ) : (
                          <>
                            {row1Text && (
                              <div className="line-clamp-1 truncate font-sans font-normal text-xs w-full text-slate-600 dark:text-slate-300">
                                {row1Text}
                              </div>
                            )}
                            <div className={cn("break-words font-sans font-normal text-xs w-full", row1Text ? "line-clamp-2" : "line-clamp-3")}>
                              {row2Text}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Status & Duration row + Waveform visualizer */}
                      <div className="flex flex-col gap-[1px] pt-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1">
                            {isCurrentlyPlaying ? (
                              <>
                                <Volume2 className="w-2.5 h-2.5 text-purple-600 animate-pulse" />
                                <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-tighter">
                                  Playing
                                </span>
                              </>
                            ) : isPlayedTrack ? (
                              <>
                                <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                                <span className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-tighter">
                                  Played {formattedPlayedAt}
                                </span>
                              </>
                            ) : isCancelledTrack ? (
                              <>
                                <AlertCircle className="w-2.5 h-2.5 text-slate-400" />
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                                  Cancelled
                                </span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-2.5 h-2.5 text-slate-500" />
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                                  To be played
                                </span>
                              </>
                            )}
                          </div>

                          {isCurrentlyPlaying ? (
                            <div className="flex items-center gap-1 text-xs font-mono font-bold leading-none text-purple-600 dark:text-purple-400">
                              <span>{formatTime(playingStates[item.track.id]?.currentTime || 0)}</span>
                              <span className="opacity-30">/</span>
                              <span>{formatTime(playingStates[item.track.id]?.duration || item.track.durationSeconds || 0)}</span>
                            </div>
                          ) : (
                            <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 leading-none">
                              {mp3DurationCache.get(item.track.streamUrl) || availableFilesCache.get(item.track.fileName)?.duration || item.track.durationFormatted}
                            </span>
                          )}
                        </div>

                        <WaveformVisualizer 
                          url={item.track.streamUrl || item.track.fileName}
                          currentTime={isCurrentlyPlaying ? (playingStates[item.track.id]?.currentTime || 0) : 0}
                          duration={playingStates[item.track.id]?.duration || item.track.durationSeconds || 0}
                          isPlaying={isCurrentlyPlaying}
                          isPlayed={isPlayedTrack}
                        />
                      </div>
                    </div>
                  );
                }

                if (item.type === 'break') {
                  const slot = item.slotTime;
                  const sForSlot = item.interstitials;
                  const isPresent = isSameMinute(slot, now);
                  const isPast = isBefore(slot, now) && !isPresent;
                  const diffSeconds = Math.abs(differenceInSeconds(now, slot));

                  return (
                    <div key={item.id} className="space-y-1.5 my-1.5">
                      {sForSlot.map((s, bIdx) => {
                        const playedLog = logs.find(l => 
                          l.interstitialId === s.id && 
                          (l.interstitialTime === slot.toISOString() || isSameMinute(parseISO(l.timestamp), slot)) &&
                          (l.status === 'played' || l.status === 'backup play')
                        );
                        const exported = !!playedLog && playedLog.playMode === 'Export' && playedLog.status === 'played';
                        const played = !!playedLog && playedLog.playMode !== 'Export';
                        const slotKey = `${slot.toISOString()}-${s.id}`;
                        const breakNum = breakIndexMap[slotKey] || (bIdx + 1);
                        const previewKey = `export-preview-${slotKey}`;
                        const status = getMP3Status(s.mp3Url);
                        const isVerified = s.assetType === 'script' ? status.exists : (status.exists && status.valid);
                        const isCurrentlyPlaying = !!playingStates[previewKey] || playingAudiosRef.current.has(previewKey);
                        const isUpcoming = !played && !exported && !isPast && !isPresent && diffSeconds <= 600 && isAfter(slot, now);

                        const isMissedRecent = isPast && !played && !exported && diffSeconds <= 1800;
                        const isMissedOld = isPast && !played && !exported && diffSeconds > 1800;

                        const bgClass = !isVerified
                          ? "bg-red-50 border-red-300"
                          : exported
                            ? "bg-blue-50 border-blue-300"
                            : played
                              ? "bg-green-50 border-green-300"
                              : (isMissedRecent || isMissedOld)
                                ? "bg-amber-50 border-amber-300"
                                : "bg-white border-slate-200";

                        const slotTimeStr = format(slot, 'HH:mm');

                        return (
                          <div 
                            key={s.id} 
                            title={`MP3: ${s.mp3Url || ""}`}
                            onClick={() => isVerified ? handlePlay(s, slot) : null}
                            className={cn(
                              "rounded border shadow-xs p-2 transition-all flex flex-col gap-1.5 mx-1 text-left select-none relative cursor-pointer",
                              s.assetType !== 'script' && isVerified ? "pb-[1px]" : "",
                              bgClass,
                            )}
                            style={{
                              borderLeftWidth: '4px',
                              borderLeftColor: s.assetType === 'script'
                                ? (isVerified ? '#3b82f6' : '#f43f5e')
                                : (isVerified ? '#a855f7' : '#f43f5e')
                            }}
                          >
                            {/* Header: Date & Time in full-width strip */}
                            <div className="flex justify-between items-center bg-slate-100/90 -mx-2 -mt-2 px-2.5 py-1 rounded-t border-b border-slate-200">
                              <div className="flex items-center gap-2">
                                <span className="text-xs uppercase font-black text-slate-600 tracking-tighter">
                                  {format(slot, 'MMM dd')}
                                </span>
                                <span className="text-xs font-mono font-black text-blue-700">
                                  {slotTimeStr}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {isCurrentlyPlaying ? (
                                  <div className="flex items-center gap-1 text-xs font-black uppercase text-blue-700">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></div>
                                    Preview
                                  </div>
                                ) : isPresent ? (
                                  <span className="text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none bg-blue-600">Next</span>
                                ) : isUpcoming ? (
                                  <span className="text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none shadow-xs bg-blue-600">Next</span>
                                ) : null}
                              </div>
                            </div>

                            {/* Track Row: Title + Play/Stop/Script Icon */}
                            <div className="flex items-center justify-between gap-2">
                              <div className={cn(
                                "text-xs font-bold leading-tight break-words line-clamp-2 flex-1",
                                isCurrentlyPlaying ? "text-blue-700" : "text-slate-800"
                              )}>
                                {s.name}
                              </div>

                              <div className="shrink-0">
                                {s.assetType === 'script' ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePlay(s, slot);
                                    }}
                                    className={cn(
                                      "p-1 rounded-full transition-all shadow-xs flex items-center justify-center cursor-pointer active:scale-95 border",
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
                                ) : isVerified ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isCurrentlyPlaying) {
                                        const a = playingAudiosRef.current.get(previewKey);
                                        if (a) {
                                          a.pause();
                                          a.src = "";
                                        }
                                        playingAudiosRef.current.delete(previewKey);
                                        setPlayingStates(prev => {
                                          const copy = { ...prev };
                                          delete copy[previewKey];
                                          return copy;
                                        });
                                      } else {
                                        const playableUrl = getPlayableUrl(s.mp3Url);
                                        if (!playableUrl) return;
                                        const audio = new Audio(playableUrl);

                                        const updateProgress = () => {
                                          setPlayingStates(prev => ({
                                            ...prev,
                                            [previewKey]: { currentTime: audio.currentTime, duration: audio.duration || 0 }
                                          }));
                                        };

                                        audio.addEventListener('loadedmetadata', updateProgress);
                                        audio.addEventListener('timeupdate', updateProgress);

                                        audio.addEventListener('ended', () => {
                                          playingAudiosRef.current.delete(previewKey);
                                          setPlayingStates(prev => {
                                            const copy = { ...prev };
                                            delete copy[previewKey];
                                            return copy;
                                          });
                                        });

                                        audio.play().then(() => {
                                          playingAudiosRef.current.set(previewKey, audio);
                                        }).catch(err => {
                                          console.error("Preview playback failed", err);
                                        });
                                      }
                                    }}
                                    className={cn(
                                      "p-1 rounded-full transition-all shadow-xs flex items-center justify-center cursor-pointer active:scale-95 border",
                                      isCurrentlyPlaying
                                        ? "bg-blue-100 border-blue-300 text-blue-700"
                                        : "bg-slate-200 hover:bg-slate-300 text-slate-700 border-transparent"
                                    )}
                                    title="Preview Audio"
                                  >
                                    {isCurrentlyPlaying ? (
                                      <Square className="w-2.5 h-2.5 fill-current" />
                                    ) : (
                                      <Ear className="w-3 h-3" />
                                    )}
                                  </button>
                                ) : (
                                  <div 
                                    className="p-1 rounded-full bg-red-100 text-red-600 border border-red-300 flex items-center justify-center shadow-xs"
                                    title="Missing File"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Status & Details Footer */}
                            <div className="flex flex-col gap-[1px] mt-1">
                              <div className="flex items-center justify-between">
                                {isVerified ? (
                                  <div className="flex items-center gap-1.5">
                                    {isCurrentlyPlaying ? (
                                      <>
                                        <Volume2 className="w-3 h-3 text-purple-600 animate-pulse" />
                                        <span className="text-xs font-bold text-purple-700 uppercase tracking-tighter">
                                          Playing
                                        </span>
                                      </>
                                    ) : exported ? (
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
                                          {s.assetType === 'script' ? (playedLog?.status === 'backup play' ? 'Played' : 'Read') : 'Played'} {playedLog ? format(parseISO(playedLog.logTimeStamp || playedLog.timestamp), 'HH:mm') : ''}
                                        </span>
                                      </>
                                    ) : (isMissedRecent || isMissedOld) ? (
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
                                          {`Break ${breakNum}`}
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
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                if (item.type === 'show-end') {
                  return (
                    <div 
                      key={item.id}
                      className="min-h-7 py-1 px-3 flex items-center justify-between gap-2 rounded shadow-sm border bg-slate-700 border-slate-600 text-white select-none w-full flex-wrap"
                      id="show-end-indicator"
                    >
                      <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5 flex-wrap">
                        <Flag className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        show end
                        <span className="text-[10px] text-slate-300 font-mono font-normal">
                          ({format(item.showEnd, 'HH:mm')})
                        </span>
                      </span>
                      <span className="text-xs font-bold font-mono tracking-wide px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-600 text-slate-100 shrink-0">
                        {item.status === 'over' ? (
                          `Over by: ${item.diffFormatted}`
                        ) : item.status === 'under' ? (
                          `Under by: ${item.diffFormatted}`
                        ) : (
                          `On time (${item.diffFormatted})`
                        )}
                      </span>
                    </div>
                  );
                }

                if (item.type === 'extra-tracks') {
                  return (
                    <div 
                      key={item.id}
                      className="min-h-7 py-1 px-3 flex items-center justify-between gap-2 rounded shadow-sm border bg-amber-700 border-amber-600 text-white select-none w-full flex-wrap"
                      id="extra-tracks-indicator"
                    >
                      <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5 flex-wrap">
                        <ListPlus className="w-3.5 h-3.5 text-amber-200 shrink-0" />
                        overrun
                      </span>
                      <span className="text-xs font-bold font-mono tracking-wide px-1.5 py-0.5 rounded bg-amber-900/60 border border-amber-500/50 text-amber-100 shrink-0">
                        {`Over by: ${item.extraFormatted}`}
                      </span>
                    </div>
                  );
                }

                return null;
              })
            )}
          </div>

          {/* Copy Plan & Copy Playlist Action Buttons */}
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
        {renderLiveReadOverlay()}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      {(() => {
        const modeStr = playMode as string;
        const initialActiveShow = (modeStr === 'Playlist' || modeStr === 'Prerecord' || modeStr === 'Export') ? effectiveShow : (timeline.length > 0 ? (() => {
          const firstSlot = timeline[0];
          const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
          const dayName = daysOrder[firstSlot.getDay()];
          const hour = firstSlot.getHours();
          const minute = firstSlot.getMinutes();
          const activeShows = shows.filter(show => 
            isTimeInShow(show, dayName, hour, minute)
          );
          return activeShows[0] || null;
        })() : null);

        const initialShade = (modeStr === 'Playlist' || modeStr === 'Prerecord' || modeStr === 'Export')
          ? (effectiveShow 
              ? getShowShade(effectiveShow, getSortedShows(shows))
              : { bg: '#faf5ff', border: '#c084fc', title: modeStr === 'Export' ? 'Export Mode' : modeStr === 'Prerecord' ? 'Prerecord Mode' : 'Playlist Mode' })
          : (initialActiveShow 
              ? getShowShade(initialActiveShow, getSortedShows(shows))
              : { bg: 'var(--show-shade-none-bg, #f1f5f9)', border: 'var(--show-shade-none-border, #cbd5e1)', title: 'No active show scheduled' });

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
                <span ref={persistentTitleTextRef}>
                  {(modeStr === 'Playlist' || modeStr === 'Prerecord' || modeStr === 'Export') 
                    ? (effectiveShow ? effectiveShow.name : (modeStr === 'Export' ? 'Export Mode' : modeStr === 'Prerecord' ? 'Prerecord Mode' : 'Playlist Mode'))
                    : (initialActiveShow ? initialActiveShow.name : "No Scheduled Show")}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pb-4 relative"
      >
        {(() => {
          const modeStr = playMode as string;
          const shouldRenderPlaylistView = (modeStr === 'Playlist' || modeStr === 'Export') || 
            (modeStr === 'Prerecord' && playlistTracks.length > 0);

          if (shouldRenderPlaylistView) {
            if (!effectiveShow) {
              return (
                <div className="flex flex-col items-center justify-center p-6 text-center bg-slate-50 border border-slate-200 rounded-xl m-4 space-y-3">
                  <ListMusic className="w-8 h-8 text-purple-600" />
                  <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">No Show Selected</h3>
                  <p className="text-xs text-slate-600 max-w-sm">
                    Select a show to load its automated music tracks.
                  </p>
                </div>
              );
            }
            if (isPlaylistLoading) {
              return (
                <div className="flex items-center justify-center p-8 text-purple-700 space-x-2">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span className="text-xs font-black uppercase tracking-wider">Assembling Playlist Tracks & Interstitials...</span>
                </div>
              );
            }
            if (playlistTracks.length === 0) {
              const folderLabel = 'Playlists';
              return (
                <div className="flex flex-col items-center justify-center p-6 text-center bg-purple-50/50 border border-purple-200 rounded-xl m-4 space-y-3">
                  <ListMusic className="w-8 h-8 text-purple-600" />
                  <h3 className="text-sm font-black uppercase text-slate-900 tracking-wider">
                    No Tracks Found in {folderLabel} Folder
                  </h3>
                  <p className="text-xs text-slate-600 max-w-md">
                    Please place <strong>.m3u</strong> playlist files or <strong>.mp3</strong> tracks inside:
                    <br />
                    <code className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-800 text-[11px] font-mono mt-1 inline-block">
                      /medialibrary/{folderLabel}/{effectiveShow.nameShort || effectiveShow.name}
                    </code>
                  </p>
                  <button
                    onClick={handleVerifyEvergreens}
                    disabled={isVerifyingEvergreens}
                    className="p-1.5 px-3 bg-purple-700 hover:bg-purple-800 text-white rounded text-xs font-black uppercase cursor-pointer flex items-center gap-1.5 shadow-sm active:translate-y-px"
                  >
                    <span>{isVerifyingEvergreens ? "CHECKING..." : "CHECK EVERGREEN & PLAYLIST FOLDERS"}</span>
                  </button>
                </div>
              );
            }
            const firstUnplayedIdx = playlistTimeline.findIndex(item => item.type === 'track' && !item.played);
            const unplayedTimelineCards = playlistTimeline.filter(
              item => (item.type === 'track' && !item.played && !item.cancelled) || item.type === 'break'
            );

            return (
              <div className="space-y-2 p-2">
                {playlistTimeline.map((item, index) => {
                  if (item.type === 'header') {
                    return null;
                  }

                  const isNowPosition = index === firstUnplayedIdx || (firstUnplayedIdx === -1 && index === playlistTimeline.length - 1);

                  const nowCard = isNowPosition ? (
                    <div 
                      key="now-indicator"
                      ref={activeItemRef}
                      className="h-6 flex items-center justify-between px-3 rounded shadow-sm border my-1.5 ml-1 bg-blue-600 border-blue-500 text-white select-none"
                      id="now-indicator"
                    >
                      <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5">
                        <RadioTower className="w-3.5 h-3.5 text-white/90 shrink-0" />
                        now
                      </span>
                      {renderCacheStatusMessage()}
                    </div>
                  ) : null;

                  if (item.type === 'track') {
                    const isCurrentlyPlaying = !!playingStates[item.track.id] || playingAudiosRef.current.has(item.track.id);
                    const isPlayedTrack = !!item.played || !!playedPlaylistTracks[item.track.id] || !!playedPlaylistTracks[item.track.fileName] || !!pendingPlayedPlaylistTracksRef.current[item.track.id] || !!pendingPlayedPlaylistTracksRef.current[item.track.fileName];
                    const playedAtTime = item.playedAt || playedPlaylistTracks[item.track.id]?.playedAt || playedPlaylistTracks[item.track.fileName]?.playedAt || pendingPlayedPlaylistTracksRef.current[item.track.id]?.playedAt || pendingPlayedPlaylistTracksRef.current[item.track.fileName]?.playedAt;
                    const formattedPlayedAt = playedAtTime ? format(parseISO(playedAtTime), 'HH:mm') : format(new Date(), 'HH:mm');
                    const isCancelledTrack = !!item.cancelled;

                    const timelineCardIdx = unplayedTimelineCards.findIndex(c => c.id === item.id);
                    const isTopCardInTimeline = timelineCardIdx === 0;
                    const isBottomCardInTimeline = timelineCardIdx === unplayedTimelineCards.length - 1;

                    const meta = trackMetadataMap[item.track.streamUrl] ||
                                 trackMetadataMap[item.track.fileName] ||
                                 trackMetadataMap[item.track.id];

                    const isParsed = !!meta;

                    const mp3FileName = item.track.fileName || item.track.title || '';
                    const rawArtist = meta?.artist ? meta.artist.trim() : null;
                    const rawAlbumArtist = meta?.albumArtist ? meta.albumArtist.trim() : null;
                    const rawTitle = meta?.title ? meta.title.trim() : null;
                    const rawAlbum = meta?.album ? meta.album.trim() : null;

                    // Row 1: Artist and (Album Artist)
                    let row1Text: string | null = null;
                    if (rawArtist && rawAlbumArtist) {
                      const normArtist = rawArtist.toLowerCase();
                      const normAlbumArtist = rawAlbumArtist.toLowerCase();
                      if (normArtist === normAlbumArtist || normArtist.includes(normAlbumArtist)) {
                        row1Text = rawArtist;
                      } else {
                        row1Text = `${rawArtist} (${rawAlbumArtist})`;
                      }
                    } else if (rawArtist) {
                      row1Text = rawArtist;
                    } else if (rawAlbumArtist) {
                      row1Text = rawAlbumArtist;
                    }

                    // Row 2: Title - Album (Fallback to filename if title and album are blank)
                    let row2Text: string = mp3FileName;
                    if (rawTitle && rawAlbum) {
                      row2Text = `${rawTitle} - ${rawAlbum}`;
                    } else if (rawTitle) {
                      row2Text = rawTitle;
                    } else if (rawAlbum) {
                      row2Text = rawAlbum;
                    } else {
                      row2Text = mp3FileName;
                    }

                    // Tooltip
                    const tooltipParts: string[] = [];
                    if (mp3FileName) tooltipParts.push(`File: ${mp3FileName}`);
                    if (rawTitle) tooltipParts.push(`Track: ${rawTitle}`);
                    if (rawArtist) tooltipParts.push(`Artist: ${rawArtist}`);
                    if (rawAlbumArtist) tooltipParts.push(`Album Artist: ${rawAlbumArtist}`);
                    if (rawAlbum) tooltipParts.push(`Album: ${rawAlbum}`);
                    if (!isParsed) tooltipParts.push(`(ID3 Tags: ...parsing...)`);

                    const tooltipText = tooltipParts.join('\n');

                    return (
                      <Fragment key={item.id}>
                        {nowCard}
                        <div 
                          className={cn(
                            "rounded border shadow-xs p-2 my-1.5 transition-all flex flex-col gap-0 select-none text-left border-l-[4px]",
                            item.type !== 'break' && item.track ? "pb-[1px]" : "",
                            item.isOverrun ? "border-amber-600" : "",
                            (item.track && item.track.id === movedHighlightTrackId)
                              ? "ring-2 ring-purple-500/90 shadow-lg scale-[1.01] z-10"
                              : isCurrentlyPlaying 
                                ? "ring-1 ring-purple-500/40" 
                                : isPlayedTrack
                                  ? "opacity-90"
                                  : isCancelledTrack
                                    ? "opacity-75"
                                    : ""
                          )}
                          style={{
                            backgroundColor: 'var(--playlist-card-bg)',
                            borderColor: item.isOverrun ? '#d97706' : 'var(--playlist-card-border)',
                            color: 'var(--playlist-card-text)',
                            borderLeftColor: isCurrentlyPlaying
                              ? '#9333ea'
                              : isPlayedTrack
                                ? '#10b981'
                                : isCancelledTrack
                                  ? '#94a3b8'
                                  : '#a855f7'
                          }}
                          title={tooltipText}
                        >
                          {/* Top Header Bar for Playlist card: ListMusic icon + Up/Down/X controls on left, Play button right-justified */}
                          <div 
                            className={cn(
                              "flex justify-between items-center -mx-2 -mt-2 px-2 py-1 rounded-t border-b",
                              item.isOverrun ? "border-amber-600/50" : "border-slate-200/60 dark:border-slate-700/60"
                            )}
                            style={{ backgroundColor: item.isOverrun ? 'rgba(217, 119, 6, 0.15)' : 'var(--playlist-card-header-bg)' }}
                          >
                            <div className="flex items-center gap-1.5">
                              <ListMusic className={cn("w-3.5 h-3.5 shrink-0", item.isOverrun ? "text-amber-600 dark:text-amber-400" : "text-purple-600 dark:text-purple-300")} />
                              
                              {/* Up, Down, X, Reactivate controls slid to the left next to list note icon */}
                              <div className="flex items-center gap-0.5 ml-0.5">
                                {(!isPlayedTrack && !isCancelledTrack) && (
                                  <>
                                    {!isTopCardInTimeline && (
                                      <button
                                        onClick={() => handleMoveTrackUp(item.track.id)}
                                        className="p-0.5 text-slate-700 dark:text-slate-200 hover:text-purple-800 dark:hover:text-purple-200 hover:bg-purple-200/60 dark:hover:bg-purple-900/60 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                                        title="Move song up in queue"
                                      >
                                        <ChevronUp className="w-3 h-3" />
                                      </button>
                                    )}
                                    {!isBottomCardInTimeline && (
                                      <button
                                        onClick={() => handleMoveTrackDown(item.track.id)}
                                        className="p-0.5 text-slate-700 dark:text-slate-200 hover:text-purple-800 dark:hover:text-purple-200 hover:bg-purple-200/60 dark:hover:bg-purple-900/60 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                                        title="Move song down in queue"
                                      >
                                        <ChevronDown className="w-3 h-3" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleCancelTrack(item.track.id)}
                                      className="p-0.5 text-slate-600 dark:text-slate-300 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-950/60 rounded border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                                      title="Cancel song (move to bottom)"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </>
                                )}

                                {isCancelledTrack && (
                                  <button
                                    onClick={() => handleReactivateTrack(item.track.id)}
                                    className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors shadow-xs"
                                    title="Reactivate song to queue"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5 text-slate-600 dark:text-slate-300" />
                                    <span>Reactivate</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Right side: Right-justified circular Play / Pause / Check button */}
                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                onClick={() => handleTogglePlayTrack(item.track)}
                                className={cn(
                                  "w-5 h-5 rounded-full shrink-0 aspect-square transition-all shadow-xs cursor-pointer flex items-center justify-center p-0 border border-transparent",
                                  isCurrentlyPlaying
                                    ? "bg-purple-700 hover:bg-purple-800 text-white"
                                    : isPlayedTrack
                                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                      : isCancelledTrack
                                        ? "bg-slate-400 dark:bg-slate-700 hover:bg-slate-500 text-white"
                                        : "bg-purple-600 hover:bg-purple-500 text-white"
                                )}
                                title={isCurrentlyPlaying ? "Stop track" : isPlayedTrack ? "Replay playlist track" : "Play track"}
                              >
                                {isCurrentlyPlaying ? (
                                  <Square className="w-2.5 h-2.5 fill-current" />
                                ) : isPlayedTrack ? (
                                  <CheckCircle className="w-2.5 h-2.5 text-white" />
                                ) : (
                                  <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* MP3 Information: Top justified, 3 rows fixed min-height for uniform card size */}
                          <div 
                            className={cn(
                              "flex flex-col justify-start items-start text-left w-full font-sans font-normal text-xs leading-snug gap-0.5 pt-[3px] pb-[3px]",
                              isCurrentlyPlaying ? "text-purple-800 dark:text-purple-200" :
                              isPlayedTrack ? "text-emerald-950 dark:text-emerald-100" :
                              isCancelledTrack ? "text-slate-500 dark:text-slate-400 line-through decoration-slate-400/60" :
                              "text-slate-900 dark:text-slate-100"
                            )}
                            title={tooltipText}
                          >
                            {!isParsed ? (
                              <div className="line-clamp-3 break-words font-sans font-normal text-xs w-full">
                                {mp3FileName}
                              </div>
                            ) : (
                              <>
                                {row1Text && (
                                  <div className="line-clamp-1 truncate font-sans font-normal text-xs w-full text-slate-600 dark:text-slate-300">
                                    {row1Text}
                                  </div>
                                )}
                                <div className={cn("break-words font-sans font-normal text-xs w-full", row1Text ? "line-clamp-2" : "line-clamp-3")}>
                                  {row2Text}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Status & Duration row + Waveform visualizer */}
                          <div className="flex flex-col gap-[1px] pt-0.5">
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1">
                                {isCurrentlyPlaying ? (
                                  <>
                                    <Volume2 className="w-2.5 h-2.5 text-purple-600 animate-pulse" />
                                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-tighter">
                                      Playing
                                    </span>
                                  </>
                                ) : isPlayedTrack ? (
                                  <>
                                    <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                                    <span className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-tighter">
                                      Played {formattedPlayedAt}
                                    </span>
                                  </>
                                ) : isCancelledTrack ? (
                                  <>
                                    <AlertCircle className="w-2.5 h-2.5 text-slate-400" />
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                                      Cancelled
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-2.5 h-2.5 text-slate-500" />
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                                      To be played
                                    </span>
                                  </>
                                )}
                              </div>

                              {isCurrentlyPlaying ? (
                                <div className="flex items-center gap-1 text-xs font-mono font-bold leading-none text-purple-600 dark:text-purple-400">
                                  <span>{formatTime(playingStates[item.track.id]?.currentTime || 0)}</span>
                                  <span className="opacity-30">/</span>
                                  <span>{formatTime(playingStates[item.track.id]?.duration || item.track.durationSeconds || 0)}</span>
                                </div>
                              ) : (
                                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 leading-none">
                                  {mp3DurationCache.get(item.track.streamUrl) || availableFilesCache.get(item.track.fileName)?.duration || item.track.durationFormatted}
                                </span>
                              )}
                            </div>

                            <WaveformVisualizer 
                              url={item.track.streamUrl || item.track.fileName}
                              currentTime={isCurrentlyPlaying ? (playingStates[item.track.id]?.currentTime || 0) : 0}
                              duration={playingStates[item.track.id]?.duration || item.track.durationSeconds || 0}
                              isPlaying={isCurrentlyPlaying}
                              isPlayed={isPlayedTrack}
                            />
                          </div>
                        </div>
                      </Fragment>
                    );
                  }

                if (item.type === 'break') {
                  const slot = item.slotTime;
                  const sForSlot = item.interstitials;
                  const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
                  const dayName = daysOrder[slot.getDay()];
                  const hour = slot.getHours();
                  const minute = slot.getMinutes();
                  const isPre = false;
                  const isPresent = isSameMinute(slot, now);
                  const isPast = isBefore(slot, now) && !isPresent;
                  const diffSeconds = Math.abs(differenceInSeconds(now, slot));

                  return (
                    <div key={item.id} className="space-y-1.5 my-1.5">
                      {sForSlot.map((s, idx) => {
                        const playedLog = logs.find(l => 
                          l.interstitialId === s.id && 
                          (l.interstitialTime === slot.toISOString() || isSameMinute(parseISO(l.timestamp), slot)) &&
                          (l.status === 'played' || l.status === 'backup play')
                        );
                        const played = !!playedLog && playedLog.playMode !== 'Export';
                        const exported = !!playedLog && playedLog.playMode === 'Export';
                        const slotKey = `${slot.toISOString()}-${s.id}`;
                        const breakNum = breakIndexMap[slotKey] || (idx + 1);
                        const customVal = customScriptTimes[slotKey];
                        const isValid = !customVal || parseCustomTimeText(customVal) !== null;
                        const status = getMP3Status(s.mp3Url);
                        const isVerified = s.assetType === 'script' ? status.exists : (status.exists && status.valid);
                        const isCurrentlyPlaying = !!playingStates[slotKey] || playingAudiosRef.current.has(slotKey);
                        const isUpcoming = !played && !exported && !isPast && !isPresent && diffSeconds <= 600 && isAfter(slot, now);

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

                        const cardBorderClass = !isVerified
                          ? "border-red-500"
                          : isCurrentlyPlaying || isUpcoming
                            ? "border-purple-600 ring-1 ring-purple-600/30"
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
                              ? "bg-[#faf5ff]"
                              : exported
                                ? "bg-[#f0fdf4]"
                                : (isMissedRecent || isMissedOld)
                                  ? "bg-[#fffbeb]"
                                  : (isPast && played)
                                    ? "bg-white"
                                    : isPresent
                                      ? "bg-[#faf5ff]"
                                      : "bg-white";

                        const cardOpacityClass = (isPast && (played || exported) && !isCurrentlyPlaying)
                          ? "opacity-75"
                          : (isMissedRecent || isMissedOld) && !isCurrentlyPlaying
                            ? "opacity-95"
                            : "opacity-100";

                        return (
                          <div key={`${slot.toISOString()}-${s.id}-${idx}`} className="flex items-stretch gap-2 w-full pr-1 relative min-h-[4.5rem]">
                            {activeShow ? (
                              <div 
                                className="absolute left-0 top-[-6px] bottom-[-6px] w-1 animate-fade-in z-10" style={{ backgroundColor: showShade?.bg }} 
                                title={showShade?.title}
                              />
                            ) : null}
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
                                s.assetType !== 'script' && isVerified ? "pb-[1px]" : "",
                                cardBorderClass,
                                cardBgClass,
                                cardOpacityClass
                              )}
                            >
                              <div className="flex justify-between items-center bg-slate-50 -mx-2 -mt-2 px-2 py-1 rounded-t">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs uppercase font-black text-slate-600 tracking-tighter">
                                    {format(slot, 'MMM dd')}
                                  </span>
                                  <span className="text-xs font-mono font-black text-purple-600">
                                    {format(slot, 'HH:mm')}
                                  </span>
                                </div>
                                {isCurrentlyPlaying ? (
                                  <div className="flex items-center gap-1 text-xs font-black uppercase text-purple-600">
                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div>
                                    Playing
                                  </div>
                                ) : isPresent ? (
                                  <span className="text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none bg-purple-600">Next</span>
                                ) : isUpcoming ? (
                                  <span className="text-xs text-white px-1 py-0.5 rounded font-black uppercase leading-none shadow-sm animate-pulse bg-purple-500 shadow-purple-200">Next</span>
                                ) : null}
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <div className={cn(
                                  "text-xs font-bold leading-tight break-words line-clamp-2 flex-1",
                                  isCurrentlyPlaying ? "text-purple-700" : "text-slate-800"
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
                                      isPresent || isUpcoming ? "bg-purple-600 text-white shadow-md shadow-purple-200" :
                                      "bg-slate-700 text-white"
                                    )}
                                    title={!isVerified ? "Invalid or missing file" : isCurrentlyPlaying ? "Stop Audio" : (played || exported) ? "Read Again" : "Display Script"}
                                    >
                                    {!isVerified ? (
                                      <X className="w-2.5 h-2.5" />
                                    ) : isCurrentlyPlaying ? (
                                      <Square className="w-2.5 h-2.5 fill-current" />
                                    ) : (played || exported) ? (
                                      <RefreshCw className="w-2.5 h-2.5" />
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
                                      isPresent || isUpcoming ? "bg-purple-600 text-white shadow-md shadow-purple-200" :
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
                                    ) : (playMode as string) === 'Export' ? (
                                      <Ear className="w-2.5 h-2.5" />
                                    ) : (
                                      <Play className="w-2.5 h-2.5 fill-current" />
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col gap-[1px]">
                                <div className="flex items-center justify-between">
                                  {isVerified ? (
                                    <div className="flex flex-col gap-0.5">
                                      <div className="flex items-center gap-1">
                                        {exported ? (
                                          <>
                                            <CheckCircle className="w-2.5 h-2.5 text-purple-500" />
                                            <span className="text-xs font-bold uppercase tracking-tighter text-purple-600">
                                              Exported
                                            </span>
                                          </>
                                        ) : isCurrentlyPlaying ? (
                                          <>
                                            <Volume2 className="w-2.5 h-2.5 text-purple-600 animate-pulse" />
                                            <span className="text-xs font-bold text-purple-600 uppercase tracking-tighter">
                                              Playing
                                            </span>
                                          </>
                                        ) : played ? (
                                          <>
                                            <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                                            <span className="text-xs font-bold text-green-600 uppercase tracking-tighter">
                                              {s.assetType === 'script' ? (playedLog?.status === 'backup play' ? 'Played' : 'Read') : 'Played'} {playedLog ? format(parseISO(playedLog.logTimeStamp || playedLog.timestamp), 'HH:mm') : format(new Date(), 'HH:mm')}
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
                                    <div className="flex items-center gap-1 text-xs font-mono font-bold leading-none text-purple-600">
                                      <span>{formatTime(playingStates[slotKey]?.currentTime || 0)}</span>
                                      <span className="opacity-30">/</span>
                                      <span>{formatTime(playingStates[slotKey]?.duration || 0)}</span>
                                    </div>
                                  ) : isVerified ? (
                                    <span className="text-xs font-mono font-bold text-slate-500 leading-none">
                                      {s.assetType === 'script' ? (s.approximateReadTime ? (s.approximateReadTime.startsWith('~') ? s.approximateReadTime : `~${s.approximateReadTime}`) : '-:--') : (mp3DurationCache.get(s.mp3Url) || s.duration || '--:--')}
                                    </span>
                                  ) : null}
                                </div>

                                {s.assetType !== 'script' && isVerified && (
                                  <WaveformVisualizer 
                                    url={resolvedUrl}
                                    currentTime={isCurrentlyPlaying ? (playingStates[slotKey]?.currentTime || 0) : 0}
                                    duration={playingStates[slotKey]?.duration || 0}
                                    isPlaying={isCurrentlyPlaying}
                                    isPlayed={played || exported}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }

                if (item.type === 'show-end') {
                  return (
                    <Fragment key={item.id}>
                      {nowCard}
                      <div 
                        className="min-h-7 py-1 px-3 flex items-center justify-between gap-2 rounded shadow-sm border bg-slate-700 border-slate-600 text-white select-none w-full flex-wrap"
                        id="show-end-indicator"
                      >
                        <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5 flex-wrap">
                          <Flag className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          show end
                          <span className="text-[10px] text-slate-300 font-mono font-normal">
                            ({format(item.showEnd, 'HH:mm')})
                          </span>
                        </span>
                        <span className="text-xs font-bold font-mono tracking-wide px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-600 text-slate-100 shrink-0">
                          {item.status === 'over' ? (
                            `Over by: ${item.diffFormatted}`
                          ) : item.status === 'under' ? (
                            `Under by: ${item.diffFormatted}`
                          ) : (
                            `On time (${item.diffFormatted})`
                          )}
                        </span>
                      </div>
                    </Fragment>
                  );
                }

                if (item.type === 'extra-tracks') {
                  return (
                    <Fragment key={item.id}>
                      {nowCard}
                      <div 
                        className="min-h-7 py-1 px-3 flex items-center justify-between gap-2 rounded shadow-sm border bg-amber-700 border-amber-600 text-white select-none w-full flex-wrap"
                        id="extra-tracks-indicator"
                      >
                        <span className="text-xs font-black uppercase text-white tracking-widest font-sans flex items-center gap-1.5 flex-wrap">
                          <ListPlus className="w-3.5 h-3.5 text-amber-200 shrink-0" />
                          overrun
                        </span>
                        <span className="text-xs font-bold font-mono tracking-wide px-1.5 py-0.5 rounded bg-amber-900/60 border border-amber-500/50 text-amber-100 shrink-0">
                          {`Over by: ${item.extraFormatted}`}
                        </span>
                      </div>
                    </Fragment>
                  );
                }

                return null;
              })}
            </div>
          );
        }

        return timeline.map((slot, index) => {
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
                    className="h-6 flex items-center justify-between px-3 rounded shadow-sm border ml-2 bg-blue-600 border-blue-500"
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
                 const isCurrentlyPlaying = !!playingStates[slotKey] || playingAudiosRef.current.has(slotKey);
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
                         s.assetType !== 'script' && isVerified ? "pb-[1px]" : "",
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
                         title={!isVerified ? "Invalid or missing file" : isCurrentlyPlaying ? "Stop Audio" : (played || exported) ? "Read Again" : "Display Script"}
                         >
                         {!isVerified ? (
                           <X className="w-2.5 h-2.5" />
                         ) : isCurrentlyPlaying ? (
                           <Square className="w-2.5 h-2.5 fill-current" />
                         ) : (played || exported) ? (
                           <RefreshCw className="w-2.5 h-2.5" />
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
                   <div className="flex flex-col gap-[1px]">
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
                           ) : isCurrentlyPlaying ? (
                             <>
                               <Volume2 className="w-2.5 h-2.5 text-purple-600 animate-pulse" />
                               <span className="text-xs font-bold text-purple-600 uppercase tracking-tighter">
                                 Playing
                               </span>
                             </>
                           ) : played ? (
                             <>
                               <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                               <span className="text-xs font-bold text-green-600 uppercase tracking-tighter">
                                 {s.assetType === 'script' ? (playedLog?.status === 'backup play' ? 'Played' : 'Read') : 'Played'} {playedLog ? format(parseISO(playedLog.logTimeStamp || playedLog.timestamp), 'HH:mm') : format(new Date(), 'HH:mm')}
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
                         <span>{formatTime(playingStates[slotKey]?.currentTime || 0)}</span>
                         <span className="opacity-30">/</span>
                         <span>{formatTime(playingStates[slotKey]?.duration || 0)}</span>
                       </div>
                     ) : isVerified ? (
                       <span className="text-xs font-mono font-bold text-slate-500 leading-none">
                         {s.assetType === 'script' ? (s.approximateReadTime ? (s.approximateReadTime.startsWith('~') ? s.approximateReadTime : `~${s.approximateReadTime}`) : '-:--') : (mp3DurationCache.get(s.mp3Url) || s.duration || '--:--')}
                       </span>
                     ) : null}
                   </div>

                   {s.assetType !== 'script' && isVerified && (
                     <WaveformVisualizer 
                       url={resolvedUrl}
                       currentTime={isCurrentlyPlaying ? (playingStates[slotKey]?.currentTime || 0) : 0}
                       duration={playingStates[slotKey]?.duration || 0}
                       isPlaying={isCurrentlyPlaying}
                       isPlayed={played || exported}
                     />
                   )}
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
        });
      })()}
      </div>

      {renderLiveReadOverlay()}
    </div>
  );
}


