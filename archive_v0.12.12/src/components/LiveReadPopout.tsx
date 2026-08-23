/**
 * ARCHITECTURAL MANDATE: Shared LiveReadPopout Component
 * ----------------------------------------------------------------------------------
 * This component handles Live Read script displays for BOTH execution environments:
 * 1. AI Studio Web (Iframe): Rendered as an in-app modal overlay (isOverlay={true}).
 * 2. Desktop Apps (macOS Silicon/Intel & Windows 10/11): Rendered in a standalone
 *    floating BrowserWindow spawned via Electron IPC (?popout=true).
 *
 * MAINTENANCE DIRECTIVE:
 * - Shared Codebase: Both modes share this exact same file for script rendering,
 *   font/image zoom controls, timestamp editing, preview audio playback, and logging.
 * - Parity Guarantee: Any UI layout refinement, bug fix, or feature enhancement 
 *   made for one window environment MUST be verified and maintained for the other.
 * ----------------------------------------------------------------------------------
 */

import React, { useState, useEffect } from 'react';
import { cn, parseCustomTimeText } from '../lib/utils';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  Check, 
  Clock, 
  AlertTriangle, 
  FileText, 
  Type, 
  Eye,
  Play,
  Square,
  Ear
} from 'lucide-react';
import { LogEntry } from '../types';
import { getPlayableUrl } from '../lib/driveService';

interface LiveReadPopoutProps {
  initialFileName?: string;
  initialInterstitialId?: string;
  initialInterstitialName?: string;
  initialInterstitialTime?: string;
  initialLoggedTime?: string;
  backupMp3Url?: string;
  onClose?: () => void;
  onLogCommit?: (entry: LogEntry) => void;
  onPlayBackupMp3?: (backupMp3Url: string) => void;
  isOverlay?: boolean;
  isPreview?: boolean;
}

const isMac = typeof window !== 'undefined' && (
  /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent) || 
  (navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0)
);

const formatToHHMM = (isoString: string) => {
  try {
    const d = new Date(isoString);
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // Hour '0' should be '12'
    return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
  } catch (e) {
    return '';
  }
};

const getLoggedAtLabel = (isoString: string) => {
  try {
    const d = new Date(isoString);
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  } catch (e) {
    return 'HH:MM';
  }
};

export default function LiveReadPopout({
  initialFileName = '',
  initialInterstitialId = '',
  initialInterstitialName = '',
  initialInterstitialTime = '',
  initialLoggedTime = '',
  backupMp3Url: initialBackupMp3Url = '',
  onClose,
  onLogCommit,
  onPlayBackupMp3,
  isOverlay = false,
  isPreview = false
}: LiveReadPopoutProps) {
  // Configured file & schedule states
  const [fileName, setFileName] = useState(initialFileName);
  const [interstitialId, setInterstitialId] = useState(initialInterstitialId);
  const [interstitialName, setInterstitialName] = useState(initialInterstitialName);
  const [interstitialTime, setInterstitialTime] = useState(initialInterstitialTime);
  const [loggedTime, setLoggedTime] = useState(initialLoggedTime);
  const [backupMp3Url, setBackupMp3Url] = useState(initialBackupMp3Url);
  const [isPreviewMode, setIsPreviewMode] = useState(isPreview);

  useEffect(() => {
    if (isPreview !== undefined) {
      setIsPreviewMode(isPreview);
    }
  }, [isPreview]);

  useEffect(() => {
    if (initialBackupMp3Url !== undefined) {
      setBackupMp3Url(initialBackupMp3Url);
    }
  }, [initialBackupMp3Url]);

  useEffect(() => {
    if (initialFileName) {
      setFileName(initialFileName);
    }
  }, [initialFileName]);

  // Backup MP3 playback state for preview
  const [backupAudioPlaying, setBackupAudioPlaying] = useState(false);
  const backupAudioRef = React.useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (backupAudioRef.current) {
        backupAudioRef.current.pause();
        backupAudioRef.current.src = "";
        backupAudioRef.current = null;
      }
    };
  }, []);

  const handleTogglePreviewBackupMp3 = () => {
    if (!backupMp3Url) return;
    if (backupAudioPlaying && backupAudioRef.current) {
      backupAudioRef.current.pause();
      backupAudioRef.current.src = "";
      backupAudioRef.current = null;
      setBackupAudioPlaying(false);
    } else {
      if (backupAudioRef.current) {
        backupAudioRef.current.pause();
        backupAudioRef.current.src = "";
        backupAudioRef.current = null;
      }
      const cleanName = backupMp3Url.includes('/') ? backupMp3Url.split('/').pop() : backupMp3Url;
      const playableUrl = getPlayableUrl(backupMp3Url) || `/api/stream-local?file=${encodeURIComponent(cleanName || '')}`;
      const audio = new Audio(playableUrl);
      backupAudioRef.current = audio;
      audio.play().then(() => {
        setBackupAudioPlaying(true);
      }).catch(err => {
        console.error("Failed to play preview backup audio:", err);
        // Secondary fallback to stream-local directly
        if (cleanName && !playableUrl.includes('/api/stream-local')) {
          const fallbackAudio = new Audio(`/api/stream-local?file=${encodeURIComponent(cleanName)}`);
          backupAudioRef.current = fallbackAudio;
          fallbackAudio.play().then(() => {
            setBackupAudioPlaying(true);
          }).catch(fbErr => {
            console.error("Failed secondary fallback preview backup audio:", fbErr);
            setBackupAudioPlaying(false);
            backupAudioRef.current = null;
          });
          fallbackAudio.onended = () => {
            setBackupAudioPlaying(false);
            backupAudioRef.current = null;
          };
          fallbackAudio.onerror = () => {
            setBackupAudioPlaying(false);
            backupAudioRef.current = null;
          };
        } else {
          setBackupAudioPlaying(false);
          backupAudioRef.current = null;
        }
      });
      audio.onended = () => {
        setBackupAudioPlaying(false);
        backupAudioRef.current = null;
      };
      audio.onerror = () => {
        setBackupAudioPlaying(false);
        backupAudioRef.current = null;
      };
    }
  };

  const handlePlayBackupMp3Action = async () => {
    if (!backupMp3Url) return;

    if (isPreviewMode) {
      handleTogglePreviewBackupMp3();
      return;
    }

    const nowISO = new Date().toISOString();
    let commitTimestamp = nowISO;
    if (logTimeText && logTimeText.trim()) {
      const parsedCustomDate = parseCustomTimeText(logTimeText.trim());
      if (parsedCustomDate) {
        commitTimestamp = parsedCustomDate.toISOString();
      }
    }

    const logEntry: LogEntry = {
      timestamp: commitTimestamp,
      interstitialTime: interstitialTime || commitTimestamp,
      mp3Name: backupMp3Url,
      interstitialName: interstitialName || fileName || 'Live Read (Backup MP3)',
      interstitialId: interstitialId,
      status: 'backup play',
      playMode: 'Live',
      logTimeStamp: commitTimestamp,
      assetType: 'audio'
    };

    if ((window as any).electronAPI && (window as any).electronAPI.logLiveReadCommit) {
      await (window as any).electronAPI.logLiveReadCommit(logEntry);
    }

    if (onLogCommit) {
      onLogCommit(logEntry);
    }

    if (onPlayBackupMp3) {
      onPlayBackupMp3(backupMp3Url);
    }

    if (onClose) {
      onClose();
    } else if ((window as any).electronAPI && (window as any).electronAPI.closeLiveReadWindow) {
      await (window as any).electronAPI.closeLiveReadWindow();
    }
  };

  // Content states
  const [fileContent, setFileContent] = useState<string>('');
  const [fileUrl, setFileUrl] = useState<string>('');
  const [extension, setExtension] = useState<string>('');
  const [nativePath, setNativePath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI adjustment states
  const [zoomLevel, setZoomLevel] = useState(20); // Font size in px for text
  const [imageZoom, setImageZoom] = useState(100); // Scale percentage for images
  const [imageNaturalWidth, setImageNaturalWidth] = useState<number | null>(null);
  const [imageFitZoom, setImageFitZoom] = useState<number | null>(null);
  const imageContainerRef = React.useRef<HTMLDivElement>(null);
  const [pdfZoom, setPdfZoom] = useState(100); // Scale percentage for PDFs
  const [currentTimeText, setCurrentTimeText] = useState('');
  const [logTimeText, setLogTimeText] = useState('');
  const [isEditingLogTime, setIsEditingLogTime] = useState(false);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.currentTarget;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    setImageNaturalWidth(nw);

    if (imageContainerRef.current) {
      const cw = imageContainerRef.current.clientWidth - 32;
      const ch = imageContainerRef.current.clientHeight - 32;
      if (cw > 0 && ch > 0) {
        const scaleX = cw / nw;
        const scaleY = ch / nh;
        const fitScale = Math.min(scaleX, scaleY, 1);
        const fitPercent = Math.max(10, Math.round(fitScale * 100));
        setImageFitZoom(fitPercent);
        setImageZoom(fitPercent);
      }
    }
  };

  // 1. Initial Data Loading (IPC or URL parameter fallbacks)
  const initialFormattedLoggedTime = React.useMemo(() => {
    if (!loggedTime) return '';
    return formatToHHMM(loggedTime);
  }, [loggedTime]);

  useEffect(() => {
    if (loggedTime) {
      const formatted = formatToHHMM(loggedTime);
      setLogTimeText(formatted);
      setIsEditingLogTime(true);
    }
  }, [loggedTime]);

  useEffect(() => {
    async function loadInitialData() {
      // Try Electron IPC first
      if (!isOverlay && (window as any).electronAPI && (window as any).electronAPI.getLiveReadData) {
        try {
          const ipcData = await (window as any).electronAPI.getLiveReadData();
          if (ipcData) {
            setFileName(ipcData.name || ipcData.fileName || '');
            setInterstitialId(ipcData.interstitialId || ipcData.scheduleId || '');
            setInterstitialName(ipcData.interstitialName || ipcData.scheduleName || '');
            setInterstitialTime(ipcData.interstitialTime || ipcData.scheduledTime || '');
            setLoggedTime(ipcData.initialLoggedTime || '');
            setBackupMp3Url(ipcData.backupMp3Url || '');
            if (ipcData.isPreview || ipcData.playMode === 'Export') {
              setIsPreviewMode(true);
            }
            if (ipcData.name || ipcData.fileName) {
              fetchFileContent(ipcData.name || ipcData.fileName);
            }
            return;
          }
        } catch (err) {
          console.error("Failed to get live read data via IPC:", err);
        }
      }

      // Fallback to URL query params
      const params = new URLSearchParams(window.location.search);
      const f = params.get('file') || '';
      const sId = params.get('interstitialId') || params.get('scheduleId') || '';
      const sName = params.get('interstitialName') || params.get('scheduleName') || '';
      const sTime = params.get('interstitialTime') || params.get('scheduledTime') || '';
      const sLogged = params.get('initialLoggedTime') || '';
      const bMp3 = params.get('backupMp3Url') || '';
      const pMode = params.get('playMode') || '';
      const isPrev = params.get('isPreview') === 'true' || pMode === 'Export';

      if (isPrev) {
        setIsPreviewMode(true);
      }

      if (f) {
        setFileName(f);
        setInterstitialId(sId);
        setInterstitialName(sName);
        setInterstitialTime(sTime);
        setLoggedTime(sLogged);
        if (bMp3) setBackupMp3Url(bMp3);
        fetchFileContent(f);
      } else if (initialFileName) {
        fetchFileContent(initialFileName);
      }
    }

    loadInitialData();
  }, [initialFileName, isOverlay]);

  // Fetch script file details and raw content from server
  const fetchFileContent = async (name: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/live-read/content?file=${encodeURIComponent(name)}`);
      if (!res.ok) {
        throw new Error(`Failed to load file info: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setFileContent(data.content || '');
        setFileUrl(data.url || '');
        setExtension(data.extension || '');
        setNativePath(data.path || '');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch script content');
    } finally {
      setLoading(false);
    }
  };

  // 2. Real-time clock ticking effect (Time-as-Timestamp Behavior)
  useEffect(() => {
    const formatTime = (d: Date) => {
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // Hour '0' should be '12'
      return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
    };

    const updateTime = () => {
      const now = new Date();
      const timeStr = formatTime(now);
      setCurrentTimeText(timeStr);
      
      // Auto pre-fill log time input unless user edited it or we have a logged time
      if (!isEditingLogTime && !loggedTime) {
        setLogTimeText(timeStr);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [isEditingLogTime, loggedTime]);

  const standardImageSteps = [25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400];
  const imageSteps = Array.from(new Set(imageFitZoom ? [...standardImageSteps, imageFitZoom] : standardImageSteps)).sort((a, b) => a - b);

  // Handle Zoom In / Zoom Out (Announcer friendly readability for text, images, and PDFs)
  const handleZoomIn = () => {
    if (isText) {
      setZoomLevel(prev => Math.min(prev + 2, 40));
    } else if (isImage) {
      const nextStep = imageSteps.find(s => s > imageZoom);
      if (nextStep) setImageZoom(nextStep);
    } else if (isPdf) {
      setPdfZoom(prev => Math.min(prev + 25, 300));
    }
  };

  const handleZoomOut = () => {
    if (isText) {
      setZoomLevel(prev => Math.max(prev - 2, 14));
    } else if (isImage) {
      const prevSteps = imageSteps.filter(s => s < imageZoom);
      if (prevSteps.length > 0) setImageZoom(prevSteps[prevSteps.length - 1]);
    } else if (isPdf) {
      setPdfZoom(prev => Math.max(prev - 25, 50));
    }
  };

  const isLogTimeValid = !isEditingLogTime || parseCustomTimeText(logTimeText) !== null;

  // Commit Log as Read
  const handleLogAsRead = async () => {
    if (isPreviewMode) {
      if (onClose) {
        onClose();
      } else if ((window as any).electronAPI && (window as any).electronAPI.closeLiveReadWindow) {
        await (window as any).electronAPI.closeLiveReadWindow();
      }
      return;
    }

    // Generate ISO timestamp or parse custom time text back to full ISO string
    let finalTimestamp = new Date().toISOString();
    
    if (isEditingLogTime && logTimeText) {
      const parsed = parseCustomTimeText(logTimeText);
      if (parsed) {
        finalTimestamp = parsed.toISOString();
      }
    }

    const logEntry: LogEntry = {
      timestamp: finalTimestamp,
      interstitialTime: interstitialTime || new Date().toISOString(),
      mp3Name: fileName || 'Unknown Script',
      interstitialName: interstitialName || 'Live Read Interstitial',
      interstitialId: interstitialId || 'manual',
      status: 'played',
      playMode: 'Live',
      logTimeStamp: finalTimestamp,
      assetType: 'script'
    };

    // Forward to main window via IPC if running inside Electron, or trigger callback
    if ((window as any).electronAPI && (window as any).electronAPI.logLiveReadCommit) {
      await (window as any).electronAPI.logLiveReadCommit(logEntry);
    }
    
    if (onLogCommit) {
      onLogCommit(logEntry);
    }

    // Close window if running inside Electron, or trigger callback
    if (onClose) {
      onClose();
    } else if ((window as any).electronAPI && (window as any).electronAPI.closeLiveReadWindow) {
      await (window as any).electronAPI.closeLiveReadWindow();
    }
  };

  // Close - Not Read (Dismissal)
  const handleCloseNotRead = async () => {
    if (onClose) {
      onClose();
    } else if ((window as any).electronAPI && (window as any).electronAPI.closeLiveReadWindow) {
      await (window as any).electronAPI.closeLiveReadWindow();
    }
  };

  const isText = extension === '.txt' || !extension;
  const isImage = ['.png', '.jpg', '.jpeg'].includes(extension);
  const isPdf = extension === '.pdf';

  const hasBeenLogged = !!loggedTime;
  const isTimeChangedFromLogged = hasBeenLogged && logTimeText !== initialFormattedLoggedTime;
  
  const closeButtonText = "Close";
  const isLogButtonDisabled = isPreviewMode ? false : (loading || !!error || !isLogTimeValid || (hasBeenLogged && !isTimeChangedFromLogged));
  const logButtonText = isPreviewMode
    ? "Close Preview"
    : isTimeChangedFromLogged
      ? "Log Again"
      : hasBeenLogged
        ? `Logged at ${getLoggedAtLabel(loggedTime)}`
        : "Log as Read";

  return (
    <div className={cn(
      "flex flex-col h-screen select-none font-sans text-slate-800 bg-slate-100",
      isOverlay ? "rounded-xl border border-slate-300 shadow-2xl max-w-3xl w-full max-h-[85vh] h-full overflow-hidden" : ""
    )}>
      {/* HEADER SECTION (MINIMAL BORDERS) */}
      <div className={cn(
        "flex justify-between items-center bg-slate-900 text-white px-4 py-3 border-b border-slate-800 shrink-0",
        isMac && !isOverlay ? "pl-20" : ""
      )}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-1.5 rounded-md bg-purple-600/20 text-purple-400">
            {isImage ? <Eye className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black uppercase tracking-wider text-slate-200 truncate leading-none">
              {interstitialName || 'Live Read Reader'}
            </h1>
            <p className="text-xs text-slate-400 truncate mt-1 font-mono font-bold">
              File: {fileName}
            </p>
          </div>
        </div>

        {/* Live Read Clock & Adjustments */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Real-time Ticking Clock */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-950 border border-slate-850 font-mono font-bold text-xs text-emerald-400 shadow-inner">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>{currentTimeText}</span>
          </div>

          {/* Zoom Level buttons (for Text scripts, Images, and PDFs) */}
          {(isText || isImage || isPdf) && (
            <div className="flex items-center bg-slate-950 border border-slate-850 rounded overflow-hidden">
              <button 
                type="button"
                onClick={handleZoomOut}
                disabled={
                  isText ? zoomLevel <= 14 :
                  isImage ? imageZoom <= 25 :
                  pdfZoom <= 50
                }
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                title={isText ? "Zoom Text Out" : isImage ? "Zoom Image Out" : "Zoom PDF Out"}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <div 
                className="px-2 text-xs font-mono font-black text-slate-400 border-x border-slate-850 select-none min-w-[3.5rem] text-center"
                title="Current Zoom Level"
              >
                {isText ? `${zoomLevel}px` : isImage ? `${imageZoom}%` : `${pdfZoom}%`}
              </div>
              <button 
                type="button"
                onClick={handleZoomIn}
                disabled={
                  isText ? zoomLevel >= 40 :
                  isImage ? imageZoom >= 400 :
                  pdfZoom >= 300
                }
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                title={isText ? "Zoom Text In" : isImage ? "Zoom Image In" : "Zoom PDF In"}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Close button if we are in overlay/modal mode */}
          {onClose && (
            <button 
              onClick={handleCloseNotRead}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Close script"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* SCRIPT CONTENT DISPLAY AREA */}
      <div className="flex-1 overflow-y-auto p-6 bg-white flex flex-col justify-center items-center relative custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Loading script file...</p>
          </div>
        ) : error ? (
          <div className="p-5 max-w-md bg-rose-50 border border-rose-200 rounded-xl flex flex-col items-center text-center gap-3 shadow-sm">
            <AlertTriangle className="w-10 h-10 text-rose-500" />
            <h2 className="text-sm font-black text-rose-800 uppercase tracking-wider">Failed to Load Script</h2>
            <p className="text-xs text-rose-700 leading-relaxed font-sans">{error}</p>
            <p className="text-xs font-mono text-slate-400 bg-white px-2 py-1 border border-slate-200 rounded select-all w-full truncate">
              {nativePath || fileName}
            </p>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col justify-start">
            {/* Plain Text Display */}
            {isText && (
              <div 
                className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-y-auto font-sans leading-relaxed select-text cursor-text text-slate-800 shadow-inner whitespace-pre-wrap"
                style={{ fontSize: `${zoomLevel}px`, lineHeight: 1.6 }}
              >
                {fileContent || (
                  <p className="text-slate-400 italic font-medium text-center py-20">Script content is empty.</p>
                )}
              </div>
            )}

            {/* Image File Display */}
            {isImage && fileUrl && (
              <div ref={imageContainerRef} className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-center overflow-auto shadow-inner custom-scrollbar relative">
                <img 
                  src={fileUrl} 
                  alt={fileName} 
                  onLoad={handleImageLoad}
                  referrerPolicy="no-referrer"
                  className="rounded shadow-md border border-slate-200 transition-all duration-150 shrink-0"
                  style={{
                    width: imageNaturalWidth ? `${(imageZoom / 100) * imageNaturalWidth}px` : `${imageZoom}%`,
                    height: 'auto',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    objectFit: 'contain'
                  }}
                />
              </div>
            )}

            {/* PDF File Display */}
            {isPdf && fileUrl && (
              <div className="flex-1 w-full h-full bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-inner flex flex-col p-0 relative">
                <iframe 
                  key={`pdf-frame-${pdfZoom}`}
                  src={`${fileUrl}#toolbar=0&navpanes=0&zoom=${pdfZoom}`}
                  title="PDF Document Viewer"
                  className="w-full h-full border-0 rounded flex-1"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* FOOTER & LOGGING CONTROLS */}
      <div className="bg-slate-50 border-t border-slate-200 p-4 shrink-0 flex justify-end items-center">
        {isPreviewMode ? (
          <div className="w-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs">
              <Ear className="w-4 h-4 text-purple-600" />
              <span>Preview Mode (No Logging)</span>
            </div>

            <div className="inline-flex items-center rounded-lg shadow-sm -space-x-px border border-slate-300 overflow-hidden shrink-0 h-9">
              {backupMp3Url && (
                <button
                  type="button"
                  onClick={handleTogglePreviewBackupMp3}
                  className={cn(
                    "h-full px-3 border-r border-slate-300 font-black text-xs uppercase flex items-center gap-1.5 select-none cursor-pointer leading-none shrink-0 transition-colors",
                    backupAudioPlaying
                      ? "bg-purple-700 text-white hover:bg-purple-800"
                      : "bg-purple-100 hover:bg-purple-200 text-purple-800"
                  )}
                  title={backupAudioPlaying ? "Stop backup MP3 preview playback" : "Listen to backup MP3 preview"}
                >
                  {backupAudioPlaying ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current text-white" />
                      <span>Stop mp3</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current text-purple-700" />
                      <span>Preview mp3</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleLogAsRead}
                className="h-full px-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase flex items-center gap-1.5 select-none cursor-pointer leading-none shrink-0 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close Preview</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-3">
            {/* Timestamp editor and custom logger input */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
              <div className="flex flex-col justify-between h-9 shrink-0 select-none py-0.5">
                <div className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider leading-none">
                  Logged Time:
                </div>
                {isEditingLogTime && (
                  <button 
                    type="button"
                    onClick={() => {
                      setIsEditingLogTime(false);
                      setLoggedTime(''); // Reset logged status so we tick live
                    }}
                    className="text-[9px] bg-slate-200 hover:bg-slate-300 text-slate-700 px-1 py-0.5 rounded font-black uppercase transition-colors text-center w-fit leading-none cursor-pointer"
                    title="Reset to live ticking clock"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className={cn(
                "relative flex items-center bg-white border rounded px-2 py-1 focus-within:ring-1 w-[115px] shrink-0 transition-all h-9",
                isLogTimeValid 
                  ? "border-slate-300 focus-within:ring-purple-500 focus-within:border-purple-500" 
                  : "border-rose-500 focus-within:ring-rose-500 focus-within:border-rose-500 ring-1 ring-rose-500"
              )}>
                <input 
                  type="text"
                  value={logTimeText}
                  onChange={(e) => {
                    setLogTimeText(e.target.value);
                    setIsEditingLogTime(true);
                  }}
                  onFocus={() => {
                    setIsEditingLogTime(true);
                  }}
                  className={cn(
                    "w-full bg-transparent outline-none border-0 font-mono font-bold text-xs text-center",
                    isLogTimeValid ? "text-slate-700" : "text-rose-600"
                  )}
                  title="Click to manually edit log execution time"
                />
              </div>
            </div>

            {/* Unified joined action buttons */}
            <div className="inline-flex items-center rounded-lg shadow-sm -space-x-px border border-slate-300 overflow-hidden shrink-0 h-9">
              {backupMp3Url && (
                <button
                  type="button"
                  onClick={handlePlayBackupMp3Action}
                  disabled={isLogButtonDisabled}
                  className="h-full px-3 bg-purple-100 hover:bg-purple-200 disabled:opacity-40 disabled:hover:bg-purple-100 disabled:cursor-not-allowed text-purple-800 border-r border-slate-300 font-black text-xs uppercase flex items-center gap-1.5 select-none cursor-pointer leading-none shrink-0 transition-colors"
                  title="Close read window and play backup MP3 track on player card"
                >
                  <Play className="w-3.5 h-3.5 fill-current text-purple-700" />
                  <span>Play mp3</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleCloseNotRead}
                className="h-full px-3 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-800 border-r border-slate-300 font-black text-xs uppercase flex items-center gap-1.5 select-none cursor-pointer leading-none shrink-0 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>{closeButtonText}</span>
              </button>
              <button
                type="button"
                onClick={handleLogAsRead}
                disabled={isLogButtonDisabled}
                className="h-full px-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:hover:bg-purple-600 text-white font-black text-xs uppercase flex items-center gap-1.5 select-none cursor-pointer leading-none shrink-0 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{logButtonText}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
