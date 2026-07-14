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
  Eye
} from 'lucide-react';
import { LogEntry } from '../types';

interface LiveReadPopoutProps {
  initialFileName?: string;
  initialScheduleId?: string;
  initialScheduleName?: string;
  initialScheduledTime?: string;
  initialLoggedTime?: string;
  onClose?: () => void;
  onLogCommit?: (entry: LogEntry) => void;
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
  initialScheduleId = '',
  initialScheduleName = '',
  initialScheduledTime = '',
  initialLoggedTime = '',
  onClose,
  onLogCommit,
  isOverlay = false,
  isPreview = false
}: LiveReadPopoutProps) {
  // Configured file & schedule states
  const [fileName, setFileName] = useState(initialFileName);
  const [scheduleId, setScheduleId] = useState(initialScheduleId);
  const [scheduleName, setScheduleName] = useState(initialScheduleName);
  const [scheduledTime, setScheduledTime] = useState(initialScheduledTime);
  const [loggedTime, setLoggedTime] = useState(initialLoggedTime);

  // Content states
  const [fileContent, setFileContent] = useState<string>('');
  const [fileUrl, setFileUrl] = useState<string>('');
  const [extension, setExtension] = useState<string>('');
  const [nativePath, setNativePath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI adjustment states
  const [zoomLevel, setZoomLevel] = useState(20); // Font size in px, starting high for announcer readability
  const [currentTimeText, setCurrentTimeText] = useState('');
  const [logTimeText, setLogTimeText] = useState('');
  const [isEditingLogTime, setIsEditingLogTime] = useState(false);

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
      if ((window as any).electronAPI && (window as any).electronAPI.getLiveReadData) {
        try {
          const ipcData = await (window as any).electronAPI.getLiveReadData();
          if (ipcData) {
            setFileName(ipcData.name || ipcData.fileName || '');
            setScheduleId(ipcData.scheduleId || '');
            setScheduleName(ipcData.scheduleName || '');
            setScheduledTime(ipcData.scheduledTime || '');
            setLoggedTime(ipcData.initialLoggedTime || '');
            if (ipcData.name) {
              fetchFileContent(ipcData.name);
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
      const sId = params.get('scheduleId') || '';
      const sName = params.get('scheduleName') || '';
      const sTime = params.get('scheduledTime') || '';
      const sLogged = params.get('initialLoggedTime') || '';

      if (f) {
        setFileName(f);
        setScheduleId(sId);
        setScheduleName(sName);
        setScheduledTime(sTime);
        setLoggedTime(sLogged);
        fetchFileContent(f);
      } else if (initialFileName) {
        fetchFileContent(initialFileName);
      }
    }

    loadInitialData();
  }, [initialFileName]);

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

  // Handle Zoom In / Zoom Out (Announcer friendly readability)
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 2, 40));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 2, 14));

  const isLogTimeValid = !isEditingLogTime || parseCustomTimeText(logTimeText) !== null;

  // Commit Log as Read
  const handleLogAsRead = async () => {
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
      scheduledTime: scheduledTime || new Date().toISOString(),
      mp3Name: fileName || 'Unknown Script',
      scheduleName: scheduleName || 'Live Read Schedule',
      scheduleId: scheduleId || 'manual',
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
    if ((window as any).electronAPI && (window as any).electronAPI.closeLiveReadWindow) {
      await (window as any).electronAPI.closeLiveReadWindow();
    } else if (onClose) {
      onClose();
    }
  };

  // Close - Not Read (Dismissal)
  const handleCloseNotRead = async () => {
    if ((window as any).electronAPI && (window as any).electronAPI.closeLiveReadWindow) {
      await (window as any).electronAPI.closeLiveReadWindow();
    } else if (onClose) {
      onClose();
    }
  };

  const isText = extension === '.txt' || !extension;
  const isImage = ['.png', '.jpg', '.jpeg'].includes(extension);
  const isPdf = extension === '.pdf';

  const hasBeenLogged = !!loggedTime;
  const isTimeChangedFromLogged = hasBeenLogged && logTimeText !== initialFormattedLoggedTime;
  
  const closeButtonText = hasBeenLogged ? "Close" : "Close - Not Read";
  const isLogButtonDisabled = loading || !!error || !isLogTimeValid || (hasBeenLogged && !isTimeChangedFromLogged);
  const logButtonText = isTimeChangedFromLogged
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
          <div className="p-1.5 rounded-md bg-blue-600/20 text-blue-400">
            {isImage ? <Eye className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-black uppercase tracking-wider text-slate-200 truncate leading-none">
              {scheduleName || 'Live Read Reader'}
            </h1>
            <p className="text-[12px] text-slate-400 truncate mt-1 font-mono font-bold">
              File: {fileName}
            </p>
          </div>
        </div>

        {/* Live Read Clock & Adjustments */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Real-time Ticking Clock */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-950 border border-slate-850 font-mono font-bold text-[14px] text-emerald-400 shadow-inner">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>{currentTimeText}</span>
          </div>

          {/* Zoom Level buttons (only for Text scripts) */}
          {isText && (
            <div className="flex items-center bg-slate-950 border border-slate-850 rounded overflow-hidden">
              <button 
                onClick={handleZoomOut}
                disabled={zoomLevel <= 14}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                title="Zoom Text Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <div className="px-1 text-[12px] font-mono font-black text-slate-400 border-x border-slate-850 select-none">
                {zoomLevel}px
              </div>
              <button 
                onClick={handleZoomIn}
                disabled={zoomLevel >= 40}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                title="Zoom Text In"
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
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[14px] font-black uppercase text-slate-400 tracking-wider">Loading script file...</p>
          </div>
        ) : error ? (
          <div className="p-5 max-w-md bg-rose-50 border border-rose-200 rounded-xl flex flex-col items-center text-center gap-3 shadow-sm">
            <AlertTriangle className="w-10 h-10 text-rose-500" />
            <h2 className="text-[16px] font-black text-rose-800 uppercase tracking-wider">Failed to Load Script</h2>
            <p className="text-[14px] text-rose-700 leading-relaxed font-sans">{error}</p>
            <p className="text-[12px] font-mono text-slate-400 bg-white px-2 py-1 border border-slate-200 rounded select-all w-full truncate">
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
              <div className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-center overflow-auto shadow-inner">
                <img 
                  src={fileUrl} 
                  alt={fileName} 
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-full object-contain rounded shadow-md border border-slate-200"
                />
              </div>
            )}

            {/* PDF File Display */}
            {isPdf && fileUrl && (
              <div className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-inner flex flex-col">
                <iframe 
                  src={`${fileUrl}#toolbar=0`}
                  title="PDF Document Viewer"
                  className="flex-1 w-full h-full border-0"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* FOOTER & LOGGING CONTROLS */}
      <div className="bg-slate-50 border-t border-slate-200 p-4 shrink-0 flex justify-end items-center">
        {isPreview ? (
          <button
            type="button"
            onClick={handleCloseNotRead}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-[13px] uppercase rounded-lg transition-all shadow-md flex items-center gap-1.5 select-none cursor-pointer leading-none h-10"
          >
            <X className="w-4 h-4" />
            Close Preview
          </button>
        ) : (
          <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-4">
            {/* Timestamp editor and custom logger input */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="text-[13px] font-black text-slate-400 uppercase tracking-widest block select-none">
                Logged Time:
              </div>
              <div className={cn(
                "relative flex items-center bg-white border rounded px-2 py-1.5 focus-within:ring-1 max-w-[160px] w-full transition-all",
                isLogTimeValid 
                  ? "border-slate-300 focus-within:ring-blue-500 focus-within:border-blue-500" 
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
                    "w-full bg-transparent outline-none border-0 font-mono font-bold text-[13px]",
                    isLogTimeValid ? "text-slate-700" : "text-rose-600"
                  )}
                  title="Click to manually edit log execution time"
                />
                {isEditingLogTime && (
                  <button 
                    onClick={() => {
                      setIsEditingLogTime(false);
                      setLoggedTime(''); // Reset logged status so we tick live
                    }}
                    className="text-[10px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded font-black uppercase hover:bg-slate-300 transition-colors ml-1"
                    title="Reset to live ticking clock"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Logging action buttons */}
            <div className="flex gap-3 w-full sm:w-auto shrink-0 justify-end">
              <button
                type="button"
                onClick={handleCloseNotRead}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 hover:text-slate-800 font-black text-[13px] uppercase rounded-lg transition-all shadow-xs flex items-center gap-1.5 select-none cursor-pointer leading-none"
              >
                <X className="w-4 h-4" />
                {closeButtonText}
              </button>
              <button
                type="button"
                onClick={handleLogAsRead}
                disabled={isLogButtonDisabled}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-black text-[13px] uppercase rounded-lg transition-all shadow-md flex items-center gap-1.5 select-none cursor-pointer leading-none"
              >
                <Check className="w-4 h-4" />
                {logButtonText}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
