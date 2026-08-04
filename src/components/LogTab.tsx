import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { 
  Search, 
  Music,
  Download,
  FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { LogEntry } from '../types';
import { cn, getMP3Status } from '../lib/utils';

export const getLogAssetType = (log: LogEntry): 'audio' | 'script' => {
  if (log.assetType) return log.assetType;
  
  const fileName = log.mp3Name ? log.mp3Name.toLowerCase() : '';
  
  if (
    fileName.endsWith('.txt') || 
    fileName.endsWith('.md') || 
    fileName.endsWith('.pdf') || 
    fileName.endsWith('.docx') || 
    fileName.endsWith('.doc')
  ) {
    return 'script';
  }
  
  if (fileName && !fileName.endsWith('.mp3') && !fileName.endsWith('.wav') && !fileName.endsWith('.m4a') && !fileName.endsWith('.ogg')) {
    if (fileName === 'script' || fileName === 'script file' || fileName.includes('read') || fileName.includes('script')) {
      return 'script';
    }
  }
  
  return 'audio';
};

interface LogTabProps {
  logs: LogEntry[];
}

type SortField = 'timestamp' | 'mp3Name' | 'interstitialName' | 'interstitialId' | 'playMode' | 'logTimeStamp' | 'showName' | 'hostName';
type SortOrder = 'asc' | 'desc';

function formatLogTime(dateVal: string | number | Date, width: number): { dateStr: string; timeStr: string } {
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) {
    return { dateStr: '-', timeStr: '-' };
  }

  const yyyy = d.getFullYear();
  const yy = String(yyyy).slice(-2);
  const m = d.getMonth() + 1; // 1-12
  const mm = String(m).padStart(2, '0');
  const day = d.getDate(); // 1-31
  const dd = String(day).padStart(2, '0');

  const h = d.getHours(); // 0-23
  const hh = String(h).padStart(2, '0');
  const min = d.getMinutes();
  const minStr = String(min).padStart(2, '0');
  const sec = d.getSeconds();
  const secStr = String(sec).padStart(2, '0');

  let dateStr = `${yyyy}-${mm}-${dd}`;
  let timeStr = `${hh}:${minStr}:${secStr}`;

  // 1. First, Truncate "HH:MM:SS" to "HH:MM"
  if (width < 200) {
    timeStr = `${hh}:${minStr}`;
  }

  // 2. Then, to "H:MM" with no leading zero on the H
  if (width < 185) {
    timeStr = `${h}:${minStr}`;
  }

  // 3. Next, when even more space is needed, Change "YYYY-MM-DD" to "YY-M-D", with no leading zero on the m and d
  if (width < 165) {
    dateStr = `${yy}-${m}-${day}`;
  }

  // 4. If you need even more, then change to "M-D"
  if (width < 145) {
    dateStr = `${m}-${day}`;
  }

  return { dateStr, timeStr };
}

export default function LogTab({ logs }: LogTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Adjustable column widths
  const [colWidths, setColWidths] = useState({
    time: 210,
    name: 320,
    id: 110
  });
  const [isDragging, setIsDragging] = useState<'time' | 'name' | 'id' | null>(null);

  const startResize = (col: 'time' | 'name' | 'id', e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(col);

    const startX = e.clientX;
    const startWidth = colWidths[col];

    const doDrag = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const direction = col === 'id' ? -1 : 1;
      const newWidth = Math.max(70, Math.min(600, startWidth + deltaX * direction));
      setColWidths(prev => ({
        ...prev,
        [col]: newWidth
      }));
    };

    const stopDrag = () => {
      setIsDragging(null);
      window.removeEventListener('mousemove', doDrag);
      window.removeEventListener('mouseup', stopDrag);
    };

    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);
  };

  // Limit for memory/performance as requested
  const DISPLAY_LIMIT = 200;

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Filter logs by query and start/end dates
  const filteredLogsBase = useMemo(() => {
    let result = [...logs];

    // Filter by start date
    if (startDateStr) {
      const start = new Date(startDateStr);
      start.setHours(0, 0, 0, 0);
      result = result.filter(l => new Date(l.timestamp).getTime() >= start.getTime());
    }

    // Filter by end date
    if (endDateStr) {
      const end = new Date(endDateStr);
      end.setHours(23, 59, 59, 999);
      result = result.filter(l => new Date(l.timestamp).getTime() <= end.getTime());
    }

    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => {
        try {
          const interstitialNameMatch = l.interstitialName && l.interstitialName.toLowerCase().includes(q);
          const filenameMatch = getMP3Status(l.mp3Name).filename.toLowerCase().includes(q);
          const idMatch = l.interstitialId && l.interstitialId.toLowerCase().includes(q);
          const playModeMatch = l.playMode && l.playMode.toLowerCase().includes(q);
          const assetType = getLogAssetType(l);
          const assetTypeMatch = assetType.toLowerCase().includes(q);
          
          const timestampMatch = format(new Date(l.timestamp), 'yyyy-MM-dd HH:mm:ss').includes(q);
          const actualTimestampMatch = l.logTimeStamp && format(new Date(l.logTimeStamp), 'yyyy-MM-dd HH:mm:ss').includes(q);
          const showMatch = l.showName && l.showName.toLowerCase().includes(q);
          const hostMatch = l.hostName && l.hostName.toLowerCase().includes(q);
          
          return interstitialNameMatch || filenameMatch || idMatch || playModeMatch || assetTypeMatch || timestampMatch || actualTimestampMatch || showMatch || hostMatch;
        } catch (e) {
          return (l.interstitialName && l.interstitialName.toLowerCase().includes(q)) || (l.interstitialId && l.interstitialId.toLowerCase().includes(q));
        }
      });
    }

    return result;
  }, [logs, searchQuery, startDateStr, endDateStr]);

  // Sort the fully filtered logs
  const sortedAndFilteredLogsAll = useMemo(() => {
    const result = [...filteredLogsBase];

    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'timestamp' || sortField === 'logTimeStamp') {
        const timeA = valA ? new Date(valA).getTime() : 0;
        const timeB = valB ? new Date(valB).getTime() : 0;
        valA = timeA;
        valB = timeB;
      } else if (sortField === 'mp3Name') {
        valA = getMP3Status(a.mp3Name).filename.toLowerCase();
        valB = getMP3Status(b.mp3Name).filename.toLowerCase();
      } else if (sortField === 'showName') {
        valA = (a.showName || '').toLowerCase();
        valB = (b.showName || '').toLowerCase();
      } else if (sortField === 'hostName') {
        valA = (a.hostName || '').toLowerCase();
        valB = (b.hostName || '').toLowerCase();
      } else if (sortField === 'playMode') {
        valA = (valA || 'Live').toLowerCase();
        valB = (valB || 'Live').toLowerCase();
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [filteredLogsBase, sortField, sortOrder]);

  // Sliced logs to show on screen for memory reasons
  const displayedLogs = useMemo(() => {
    return sortedAndFilteredLogsAll.slice(0, DISPLAY_LIMIT);
  }, [sortedAndFilteredLogsAll]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Scheduled Date', 'Scheduled Time', 'Actual Playback Time', 'Interstitial Name', 'MP3 File', 'Show Name', 'Host Name', 'Play Mode', 'Interstitial ID', 'Asset Type'];
    const rows = sortedAndFilteredLogsAll.map(log => [
      format(new Date(log.timestamp), 'yyyy-MM-dd'),
      format(new Date(log.timestamp), 'HH:mm:ss'),
      log.logTimeStamp ? format(new Date(log.logTimeStamp), 'yyyy-MM-dd HH:mm:ss') : '-',
      log.interstitialName,
      log.mp3Name,
      log.showName || '',
      log.hostName || '',
      log.playMode || 'Live',
      log.interstitialId,
      getLogAssetType(log)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `interstititaler_logs_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to XLSX
  const handleExportXLSX = () => {
    const exportData = sortedAndFilteredLogsAll.map(log => ({
      'Scheduled Date': format(new Date(log.timestamp), 'yyyy-MM-dd'),
      'Scheduled Time': format(new Date(log.timestamp), 'HH:mm:ss'),
      'Actual Playback Time': log.logTimeStamp ? format(new Date(log.logTimeStamp), 'yyyy-MM-dd HH:mm:ss') : '-',
      'Interstitial Name': log.interstitialName,
      'MP3 File': log.mp3Name,
      'Show Name': log.showName || '',
      'Host Name': log.hostName || '',
      'Play Mode': log.playMode || 'Live',
      'Interstitial ID': log.interstitialId,
      'Asset Type': getLogAssetType(log)
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Filtered Logs');
    XLSX.writeFile(wb, `interstititaler_logs_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`);
  };

  const SortArrow = ({ field }: { field: SortField }) => {
    const isActive = sortField === field;
    const isAsc = isActive && sortOrder === 'asc';
    const isDesc = isActive && sortOrder === 'desc';
    
    return (
      <span className="inline-flex flex-col ml-1 shrink-0 select-none leading-none -space-y-1">
        <span className={cn(
          "text-[10px] leading-none transition-all",
          isAsc 
            ? "text-blue-600 font-black" 
            : "text-slate-300 font-normal opacity-50"
        )}>▲</span>
        <span className={cn(
          "text-[10px] leading-none transition-all",
          isDesc 
            ? "text-blue-600 font-black" 
            : "text-slate-300 font-normal opacity-50"
        )}>▼</span>
      </span>
    );
  };

  const isTight = containerWidth < 800;

  return (
    <div ref={containerRef} className="flex flex-col h-full space-y-3 font-sans">
      {/* Search, Range, Count & Exports unified in a single compact bar */}
      {isTight ? (
        <div className="bg-white rounded-xl border border-slate-350 p-1.5 shadow-sm shrink-0 flex flex-col gap-1.5">
          {/* Row 1: Search + Export Buttons */}
          <div className="flex items-center justify-between gap-1.5 w-full">
            {/* Search filter */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input 
                type="text" 
                placeholder="Filter Logs..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2 py-1 bg-slate-50 border border-slate-350 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500/80 transition-all font-sans text-slate-850 placeholder-slate-450"
              />
            </div>

            {/* Export buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleExportCSV}
                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-350 rounded-lg text-xs font-bold text-blue-700 transition-colors flex items-center gap-1 cursor-pointer"
                title="Export filtered logs as CSV"
              >
                <Download className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                CSV
              </button>
              <button
                onClick={handleExportXLSX}
                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-350 rounded-lg text-xs font-bold text-emerald-700 transition-colors flex items-center gap-1 cursor-pointer"
                title="Export filtered logs as Excel"
              >
                <Download className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                XLSX
              </button>
            </div>
          </div>

          {/* Row 2: Date Filters + Count */}
          <div className="flex items-center justify-between gap-1.5 w-full">
            {/* Date Range filters */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
              <div className="flex items-center gap-0.5">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider shrink-0">From:</span>
                <input 
                  type="date" 
                  value={startDateStr}
                  onChange={e => setStartDateStr(e.target.value)}
                  className="px-1.5 py-0.5 bg-slate-50 hover:bg-slate-100 border border-slate-350 rounded-lg text-xs font-bold outline-none text-slate-700 cursor-pointer transition-colors"
                />
              </div>
              
              <div className="flex items-center gap-0.5">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider shrink-0">To:</span>
                <input 
                  type="date" 
                  value={endDateStr}
                  onChange={e => setEndDateStr(e.target.value)}
                  className="px-1.5 py-0.5 bg-slate-50 hover:bg-slate-100 border border-slate-350 rounded-lg text-xs font-bold outline-none text-slate-700 cursor-pointer transition-colors"
                  title="End Date (inclusive)"
                />
              </div>

              {(startDateStr || endDateStr) && (
                <button 
                  onClick={() => { setStartDateStr(''); setEndDateStr(''); }}
                  className="text-xs text-slate-500 hover:text-slate-700 font-bold underline cursor-pointer ml-1 select-none"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Count indicator */}
            <div className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 shrink-0 bg-slate-50 px-2 py-1 rounded-lg border border-slate-300">
              <span>Count:</span>
              <span className="text-xs font-black text-slate-900 tabular-nums">{filteredLogsBase.length}</span>
              {filteredLogsBase.length > DISPLAY_LIMIT && (
                <span className="text-xs font-black text-amber-700 bg-amber-50 px-1 py-0.5 rounded ml-1 tracking-normal border border-amber-300">
                  (max {DISPLAY_LIMIT})
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-350 p-2.5 shadow-sm shrink-0 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
            {/* Search filter */}
            <div className="relative w-full max-w-[210px] shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input 
                type="text" 
                placeholder="Filter Logs..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-350 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500/80 transition-all font-sans text-slate-850 placeholder-slate-450"
              />
            </div>
            
            {/* Date Range filters */}
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider shrink-0">From:</span>
                <input 
                  type="date" 
                  value={startDateStr}
                  onChange={e => setStartDateStr(e.target.value)}
                  className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-350 rounded-lg text-xs font-bold outline-none text-slate-700 cursor-pointer transition-colors"
                />
              </div>
              
              <div className="flex items-center gap-1">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider shrink-0">To:</span>
                <input 
                  type="date" 
                  value={endDateStr}
                  onChange={e => setEndDateStr(e.target.value)}
                  className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-350 rounded-lg text-xs font-bold outline-none text-slate-700 cursor-pointer transition-colors"
                  title="End Date (inclusive)"
                />
              </div>

              {(startDateStr || endDateStr) && (
                <button 
                  onClick={() => { setStartDateStr(''); setEndDateStr(''); }}
                  className="text-xs text-slate-500 hover:text-slate-700 font-bold underline cursor-pointer ml-1 select-none"
                >
                  Clear Dates
                </button>
              )}
            </div>
          </div>

          {/* Count and Exports bundle */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Count and limit indicators */}
            <div className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 shrink-0 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-300">
              <span>Count:</span>
              <span className="text-xs font-black text-slate-900 tabular-nums">{filteredLogsBase.length}</span>
              {filteredLogsBase.length > DISPLAY_LIMIT && (
                <span className="text-xs font-black text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded ml-1 tracking-normal border border-amber-300">
                  (limited to {DISPLAY_LIMIT} items)
                </span>
              )}
            </div>

            {/* Export buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleExportCSV}
                className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-350 rounded-lg text-xs font-bold text-blue-700 transition-colors flex items-center gap-1 cursor-pointer"
                title="Export filtered logs as CSV"
              >
                <Download className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                CSV
              </button>
              <button
                onClick={handleExportXLSX}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-350 rounded-lg text-xs font-bold text-emerald-700 transition-colors flex items-center gap-1 cursor-pointer"
                title="Export filtered logs as Excel"
              >
                <Download className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                XLSX
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-white rounded-xl border border-grid-active shadow-sm overflow-hidden flex flex-col">
        
        {/* Rows viewport */}
        <div className="flex-1 overflow-y-auto">
          {/* Header containing the dynamic incorporated sorts with 2 row headers */}
          <div className="bg-slate-100 border-b border-grid-active py-0.5 flex items-stretch text-xs font-black text-slate-650 uppercase tracking-wider shrink-0 select-none sticky top-0 z-20 shadow-sm">
            
            {/* 1st Column: Timestamp (2 rows: Scheduled & Actual) */}
            <div style={{ width: `${colWidths.time}px` }} className="flex flex-col justify-center py-0.5 gap-0.5 pr-1 pl-2 shrink-0 overflow-hidden">
              <button 
                onClick={() => toggleSort('timestamp')}
                className="flex items-center gap-1 text-left cursor-pointer group hover:text-slate-900 transition-colors text-slate-650"
              >
                <span className="truncate">Scheduled Time</span>
                <SortArrow field="timestamp" />
              </button>
              <button 
                onClick={() => toggleSort('logTimeStamp')}
                className="flex items-center gap-1 text-left cursor-pointer group hover:text-slate-900 transition-colors text-slate-650"
              >
                <span className="truncate">Actual Time</span>
                <SortArrow field="logTimeStamp" />
              </button>
            </div>

            {/* Resizer 1 */}
            <div 
              onMouseDown={(e) => startResize('time', e)}
              className={cn(
                "w-[1px] cursor-col-resize bg-slate-300 hover:bg-slate-450 transition-colors shrink-0 self-stretch relative z-10",
                isDragging === 'time' && "bg-slate-500"
              )}
              title="Drag to resize Scheduled/Actual column"
            />
            
            {/* 2nd Column: Consolidated Interstitial & MP3 / Show & Host details */}
            <div className="flex-1 flex flex-col justify-center py-0.5 gap-0.5 px-2 min-w-0 overflow-hidden">
              {/* Top row sorting: Interstitial Name : MP3 File */}
              <div className="flex items-center gap-2 truncate">
                <button 
                  onClick={() => toggleSort('interstitialName')}
                  className="flex items-center gap-1 text-left cursor-pointer group hover:text-slate-900 transition-colors text-slate-650 truncate"
                  title="Sort by Interstitial Name"
                >
                  <span className="truncate">Interstitial Name</span>
                  <SortArrow field="interstitialName" />
                </button>
                <span className="text-slate-400 font-normal">:</span>
                <button 
                  onClick={() => toggleSort('mp3Name')}
                  className="flex items-center gap-1 text-left cursor-pointer group hover:text-slate-900 transition-colors text-slate-650 truncate"
                  title="Sort by MP3 File"
                >
                  <span className="truncate">MP3 File</span>
                  <SortArrow field="mp3Name" />
                </button>
              </div>

              {/* Bottom row sorting: Show Name : Host Name */}
              <div className="flex items-center gap-2 truncate text-slate-500">
                <button 
                  onClick={() => toggleSort('showName')}
                  className="flex items-center gap-1 text-left cursor-pointer group hover:text-slate-900 transition-colors text-slate-500 truncate"
                  title="Sort by Show Name"
                >
                  <span className="truncate">Show Name</span>
                  <SortArrow field="showName" />
                </button>
                <span className="text-slate-300 font-normal">:</span>
                <button 
                  onClick={() => toggleSort('hostName')}
                  className="flex items-center gap-1 text-left cursor-pointer group hover:text-slate-900 transition-colors text-slate-500 truncate"
                  title="Sort by Host Name"
                >
                  <span className="truncate">Host Name</span>
                  <SortArrow field="hostName" />
                </button>
              </div>
            </div>

            {/* Resizer 3 */}
            <div 
              onMouseDown={(e) => startResize('id', e)}
              className={cn(
                "w-[1px] cursor-col-resize bg-slate-300 hover:bg-slate-450 transition-colors shrink-0 self-stretch relative z-10",
                isDragging === 'id' && "bg-slate-500"
              )}
              title="Drag to resize ID column"
            />

            {/* 4th Column: Interstitial ID & Play Mode */}
            <div style={{ width: `${colWidths.id}px` }} className="flex flex-col justify-center py-0.5 gap-0.5 pr-2 pl-1 shrink-0 text-right items-end overflow-hidden">
              <button 
                onClick={() => toggleSort('interstitialId')}
                className="flex items-center gap-1 cursor-pointer group hover:text-slate-900 transition-colors justify-end text-slate-650"
              >
                <span className="truncate">ID#</span>
                <SortArrow field="interstitialId" />
              </button>
              <button 
                onClick={() => toggleSort('playMode')}
                className="flex items-center gap-1 cursor-pointer group hover:text-slate-900 transition-colors justify-end text-slate-650"
              >
                <span className="truncate">Mode</span>
                <SortArrow field="playMode" />
              </button>
            </div>
          </div>

          {displayedLogs.length > 0 ? (
            displayedLogs.map((log, i) => (
              <div 
                key={`${log.interstitialId}-${log.timestamp}-${i}`}
                className={cn(
                  "flex items-stretch border-b border-grid-active hover:bg-slate-50 transition-colors last:border-0 grow min-h-[32px]",
                  i % 2 === 0 ? "bg-white" : "bg-slate-205",
                  getLogAssetType(log) === 'script' && "border-l-4 border-l-purple-500",
                  getLogAssetType(log) === 'audio' && "border-l-4 border-l-blue-500"
                )}
              >
                {/* Timestamp cell mapped to Schedule/Actual */}
                {(() => {
                  const sched = formatLogTime(log.timestamp, colWidths.time);
                  const actl = log.logTimeStamp ? formatLogTime(log.logTimeStamp, colWidths.time) : null;
                  return (
                    <div style={{ width: `${colWidths.time}px` }} className="text-xs font-mono font-bold text-slate-900 tabular-nums flex flex-col justify-center gap-0 pr-1 pl-2 shrink-0 overflow-hidden py-1">
                      <div className="leading-tight line-clamp-2 text-ellipsis overflow-hidden text-slate-905" title={`${format(new Date(log.timestamp), 'yyyy-MM-dd')} ${format(new Date(log.timestamp), 'HH:mm:ss')}`}>
                        S:{sched.dateStr} {sched.timeStr}
                      </div>
                      {actl ? (
                        <span 
                          className="text-xs font-mono font-medium text-slate-500 tracking-tighter leading-tight line-clamp-2 text-ellipsis overflow-hidden"
                          title={`ACTL: ${format(new Date(log.logTimeStamp), 'yyyy-MM-dd HH:mm:ss')}`}
                        >
                          A:{actl.dateStr} {actl.timeStr}
                        </span>
                      ) : (
                        <span className="text-xs font-mono font-medium text-slate-400 leading-tight">-</span>
                      )}
                    </div>
                  );
                })()}

                {/* Resizer guide line 1 */}
                <div className="w-[1px] shrink-0 self-stretch bg-slate-200" />
                
                {/* Consolidated Interstitial Name: MP3 File on top row, Show Name: Host Name on bottom row */}
                <div className="flex-1 min-w-0 px-2 flex flex-col justify-center py-1 overflow-hidden">
                  {/* Top row: Interstitial Name : MP3 File */}
                  <div className="flex items-center gap-1.5 min-w-0 w-full truncate">
                    {getLogAssetType(log) === 'script' ? (
                      <FileText className="w-3 h-3 text-purple-500 shrink-0" />
                    ) : (
                      <Music className="w-3 h-3 text-slate-400 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-slate-850 truncate shrink-0 max-w-[50%]" title={log.interstitialName}>
                      {log.interstitialName || '—'}
                    </span>
                    <span className="text-slate-400 font-normal shrink-0">:</span>
                    <span className="text-xs font-mono text-slate-600 truncate min-w-0 flex-1" title={log.mp3Name}>
                      {getMP3Status(log.mp3Name).filename}
                    </span>
                  </div>

                  {/* Bottom row: Show Name : Host Name */}
                  <div className="flex items-center gap-1.5 min-w-0 w-full text-xs text-slate-500 font-medium truncate mt-0.5">
                    <span className="truncate" title={log.showName ? `Show: ${log.showName}` : 'No show specified'}>
                      {log.showName ? log.showName : '—'}
                    </span>
                    <span className="text-slate-300 font-normal shrink-0">:</span>
                    <span className="truncate text-slate-500" title={log.hostName ? `Host: ${log.hostName}` : 'No host specified'}>
                      {log.hostName ? log.hostName : '—'}
                    </span>
                  </div>
                </div>

                {/* Resizer guide line 3 */}
                <div className="w-[1px] shrink-0 self-stretch bg-slate-200" />
                
                {/* ID & Play Mode cell */}
                <div style={{ width: `${colWidths.id}px` }} className="pr-2 pl-1 text-right flex flex-col justify-center items-end gap-0.5 shrink-0 overflow-hidden py-1">
                  <span className="text-xs font-black text-slate-500 uppercase truncate leading-none">
                    {log.interstitialId}
                  </span>
                  <span className={cn(
                    "inline-block text-xs font-black uppercase tracking-wider px-1 py-0.2 rounded-sm leading-none border",
                    log.playMode === 'Prerecord' 
                      ? "bg-emerald-100/90 text-emerald-800 border-emerald-200" 
                      : log.playMode === 'Export'
                        ? "bg-blue-100/90 text-blue-800 border-blue-200"
                        : "bg-purple-100/90 text-purple-800 border-purple-200"
                  )}>
                    {log.playMode || 'Live'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">No logs found</span>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or wait for events to trigger</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
