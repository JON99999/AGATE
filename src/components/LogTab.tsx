import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { 
  Search, 
  Music
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { LogEntry } from '../types';
import { cn, getMP3Status } from '../lib/utils';

interface LogTabProps {
  logs: LogEntry[];
}

type SortField = 'timestamp' | 'mp3Name' | 'scheduleName' | 'scheduleId' | 'playMode' | 'logTimeStamp';
type SortOrder = 'asc' | 'desc';

export default function LogTab({ logs }: LogTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Adjustable column widths
  const [colWidths, setColWidths] = useState({
    time: 156,
    schedule: 186,
    id: 86
  });
  const [isDragging, setIsDragging] = useState<'time' | 'schedule' | 'id' | null>(null);

  const startResize = (col: 'time' | 'schedule' | 'id', e: React.MouseEvent) => {
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
          const scheduleNameMatch = l.scheduleName.toLowerCase().includes(q);
          const filenameMatch = getMP3Status(l.mp3Name).filename.toLowerCase().includes(q);
          const idMatch = l.scheduleId.toLowerCase().includes(q);
          const playModeMatch = l.playMode && l.playMode.toLowerCase().includes(q);
          
          const timestampMatch = format(new Date(l.timestamp), 'yyyy-MM-dd HH:mm:ss').includes(q);
          const actualTimestampMatch = l.logTimeStamp && format(new Date(l.logTimeStamp), 'yyyy-MM-dd HH:mm:ss').includes(q);
          
          return scheduleNameMatch || filenameMatch || idMatch || playModeMatch || timestampMatch || actualTimestampMatch;
        } catch (e) {
          return l.scheduleName.toLowerCase().includes(q) || l.scheduleId.toLowerCase().includes(q);
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
    const headers = ['Scheduled Date', 'Scheduled Time', 'Actual Playback Time', 'Schedule Name', 'Play Mode', 'MP3 File', 'Schedule ID'];
    const rows = sortedAndFilteredLogsAll.map(log => [
      format(new Date(log.timestamp), 'yyyy-MM-dd'),
      format(new Date(log.timestamp), 'HH:mm:ss'),
      log.logTimeStamp ? format(new Date(log.logTimeStamp), 'yyyy-MM-dd HH:mm:ss') : '-',
      log.scheduleName,
      log.playMode || 'Live',
      log.mp3Name,
      log.scheduleId
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
      'Schedule Name': log.scheduleName,
      'Play Mode': log.playMode || 'Live',
      'MP3 File': log.mp3Name,
      'Schedule ID': log.scheduleId
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
      <span className="inline-flex flex-col ml-1 shrink-0 select-none leading-none -space-y-0.5">
        <span className={cn(
          "text-[12px] leading-none transition-all",
          isAsc 
            ? "text-blue-600 font-black scale-125" 
            : "text-slate-300 font-normal opacity-50"
        )}>▲</span>
        <span className={cn(
          "text-[12px] leading-none transition-all",
          isDesc 
            ? "text-blue-600 font-black scale-125" 
            : "text-slate-300 font-normal opacity-50"
        )}>▼</span>
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Search, Range, Count & Exports unified in a single compact bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm shrink-0 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          {/* Search filter */}
          <div className="relative w-full max-w-[210px] shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filter logs by name..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500/80 transition-all font-sans"
            />
          </div>
          
          {/* Date Range filters */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-[12px] font-black text-slate-400 uppercase tracking-wider shrink-0">From:</span>
              <input 
                type="date" 
                value={startDateStr}
                onChange={e => setStartDateStr(e.target.value)}
                className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700 cursor-pointer transition-colors"
              />
            </div>
            
            <div className="flex items-center gap-1">
              <span className="text-[12px] font-black text-slate-400 uppercase tracking-wider shrink-0">To:</span>
              <input 
                type="date" 
                value={endDateStr}
                onChange={e => setEndDateStr(e.target.value)}
                className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold outline-none text-slate-700 cursor-pointer transition-colors"
                title="End Date (inclusive)"
              />
            </div>

            {(startDateStr || endDateStr) && (
              <button 
                onClick={() => { setStartDateStr(''); setEndDateStr(''); }}
                className="text-[11px] text-slate-450 hover:text-slate-600 font-bold underline cursor-pointer ml-1 select-none"
              >
                Clear Dates
              </button>
            )}
          </div>
        </div>

        {/* Count and Exports bundle */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Count and limit indicators */}
          <div className="text-[12px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 shrink-0 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
            <span>Count:</span>
            <span className="text-xs font-black text-slate-900 tabular-nums">{filteredLogsBase.length}</span>
            {filteredLogsBase.length > DISPLAY_LIMIT && (
              <span className="text-[11px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ml-1 tracking-normal border border-amber-250">
                (limited to {DISPLAY_LIMIT} items)
              </span>
            )}
          </div>

          {/* Export buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleExportCSV}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-[12px] font-bold text-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
              title="Export filtered logs as CSV"
            >
              CSV
            </button>
            <button
              onClick={handleExportXLSX}
              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-[12px] font-bold text-emerald-700 transition-colors flex items-center gap-1 cursor-pointer"
              title="Export filtered logs as Excel"
            >
              XLSX
            </button>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        
        {/* Header containing the dynamic incorporated sorts with 2 row headers */}
        <div className="bg-slate-50 border-b border-slate-200 py-2 flex items-stretch text-[12px] font-black text-slate-400 uppercase tracking-wider shrink-0 select-none">
          
          {/* 1st Column: Timestamp (2 rows: Scheduled & Actual) */}
          <div style={{ width: `${colWidths.time}px` }} className="flex flex-col justify-center gap-1.5 pr-2 pl-4 shrink-0 overflow-hidden">
            <button 
              onClick={() => toggleSort('timestamp')}
              className="flex items-center gap-1 text-left cursor-pointer group hover:text-slate-700 transition-colors"
            >
              <span className="truncate">Scheduled Time</span>
              <SortArrow field="timestamp" />
            </button>
            <button 
              onClick={() => toggleSort('logTimeStamp')}
              className="flex items-center gap-1 text-left cursor-pointer group hover:text-slate-700 transition-colors"
            >
              <span className="truncate">Actual Time</span>
              <SortArrow field="logTimeStamp" />
            </button>
          </div>

          {/* Resizer 1 */}
          <div 
            onMouseDown={(e) => startResize('time', e)}
            className={cn(
              "w-1 cursor-col-resize hover:bg-blue-500/80 hover:w-1.5 transition-all shrink-0 self-stretch relative bg-slate-200/40 z-10",
              isDragging === 'time' && "bg-blue-600 w-1.5"
            )}
            title="Drag to resize Scheduled/Actual column"
          />
          
          {/* 2nd Column: Schedule (2 rows: Title & Play Mode) */}
          <div style={{ width: `${colWidths.schedule}px` }} className="flex flex-col justify-center gap-1.5 px-2 shrink-0 overflow-hidden">
            <button 
              onClick={() => toggleSort('scheduleName')}
              className="flex items-center gap-1 text-left cursor-pointer group hover:text-slate-700 transition-colors"
            >
              <span className="truncate">Schedule Name</span>
              <SortArrow field="scheduleName" />
            </button>
            <button 
              onClick={() => toggleSort('playMode')}
              className="flex items-center gap-1 text-left cursor-pointer group hover:text-slate-700 transition-colors"
            >
              <span className="truncate">Play Mode</span>
              <SortArrow field="playMode" />
            </button>
          </div>

          {/* Resizer 2 */}
          <div 
            onMouseDown={(e) => startResize('schedule', e)}
            className={cn(
              "w-1 cursor-col-resize hover:bg-blue-500/80 hover:w-1.5 transition-all shrink-0 self-stretch relative bg-slate-200/40 z-10",
              isDragging === 'schedule' && "bg-blue-600 w-1.5"
            )}
            title="Drag to resize Schedule/Mode column"
          />

          {/* 3rd Column: MP3 file path */}
          <div className="flex-1 flex flex-col justify-center gap-1.5 px-2 overflow-hidden">
            <button 
              onClick={() => toggleSort('mp3Name')}
              className="flex items-center gap-1 text-left cursor-pointer group hover:text-slate-700 transition-colors"
            >
              <span className="truncate">MP3 File</span>
              <SortArrow field="mp3Name" />
            </button>
          </div>

          {/* Resizer 3 */}
          <div 
            onMouseDown={(e) => startResize('id', e)}
            className={cn(
              "w-1 cursor-col-resize hover:bg-blue-500/80 hover:w-1.5 transition-all shrink-0 self-stretch relative bg-slate-200/40 z-10",
              isDragging === 'id' && "bg-blue-600 w-1.5"
            )}
            title="Drag to resize ID column"
          />

          {/* 4th Column: Schedule ID */}
          <div style={{ width: `${colWidths.id}px` }} className="flex flex-col justify-center gap-1.5 pr-4 pl-2 shrink-0 text-right items-end overflow-hidden">
            <button 
              onClick={() => toggleSort('scheduleId')}
              className="flex items-center gap-1 cursor-pointer group hover:text-slate-700 transition-colors justify-end"
            >
              <span className="truncate">ID</span>
              <SortArrow field="scheduleId" />
            </button>
          </div>
        </div>
        
        {/* Rows viewport */}
        <div className="flex-1 overflow-y-auto">
          {displayedLogs.length > 0 ? (
            displayedLogs.map((log, i) => (
              <div 
                key={`${log.scheduleId}-${log.timestamp}-${i}`}
                className={cn(
                  "flex items-stretch border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0 grow min-h-[52px]",
                  i % 2 === 0 ? "bg-white" : "bg-slate-50/20"
                )}
              >
                {/* Timestamp cell mapped to Schedule/Actual */}
                <div style={{ width: `${colWidths.time}px` }} className="text-[14px] font-mono font-bold text-slate-900 tabular-nums flex flex-col justify-center gap-1.5 pr-2 pl-4 shrink-0 overflow-hidden py-2.5">
                  <div className="leading-tight line-clamp-2 text-ellipsis overflow-hidden" title={`${format(new Date(log.timestamp), 'yyyy-MM-dd')} ${format(new Date(log.timestamp), 'HH:mm:ss')}`}>
                    <span className="inline-block mr-1.5">{format(new Date(log.timestamp), 'yyyy-MM-dd')}</span>
                    <span className="text-slate-400 font-medium inline-block">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                  </div>
                  {log.logTimeStamp ? (
                    <span 
                      className="text-[12px] font-mono font-medium text-slate-400 tracking-tighter leading-tight line-clamp-2 text-ellipsis overflow-hidden"
                      title={`ACTL: ${format(new Date(log.logTimeStamp), 'yyyy-MM-dd HH:mm:ss')}`}
                    >
                      ACTL: {format(new Date(log.logTimeStamp), 'yyyy-MM-dd HH:mm:ss')}
                    </span>
                  ) : (
                    <span className="text-[12px] font-mono font-medium text-slate-300 leading-tight">-</span>
                  )}
                </div>

                {/* Resizer guide line */}
                <div className="w-1 shrink-0 self-stretch border-r border-slate-100/50 bg-slate-50/10" />
                
                {/* Schedule details cell mapped to Name/PlayMode */}
                <div style={{ width: `${colWidths.schedule}px` }} className="px-2 flex flex-col justify-center gap-1 shrink-0 overflow-hidden py-2.5">
                  <span className="text-[14px] font-bold text-slate-800 line-clamp-2 leading-tight truncate">
                    {log.scheduleName}
                  </span>
                  <div>
                    <span className={cn(
                      "inline-block text-[12px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-sm leading-none border",
                      log.playMode === 'Prerecord' 
                        ? "bg-purple-50 text-purple-600 border-purple-100" 
                        : "bg-blue-50 text-blue-600 border-blue-100"
                    )}>
                      {log.playMode || 'Live'} Mode
                    </span>
                  </div>
                </div>

                {/* Resizer guide line */}
                <div className="w-1 shrink-0 self-stretch border-r border-slate-100/50 bg-slate-50/10" />
                
                {/* MP3 path cell */}
                <div className="flex-1 min-w-0 px-2 flex items-center py-2.5">
                  <div className="flex items-center gap-1.5 min-w-0 w-full">
                    <Music className="w-3 h-3 text-slate-300 shrink-0" />
                    <span className="text-[12px] font-mono text-slate-400 truncate w-full" title={log.mp3Name}>
                      {getMP3Status(log.mp3Name).filename}
                    </span>
                  </div>
                </div>

                {/* Resizer guide line */}
                <div className="w-1 shrink-0 self-stretch border-r border-slate-100/50 bg-slate-50/10" />
                
                {/* ID cell */}
                <div style={{ width: `${colWidths.id}px` }} className="pr-4 pl-2 text-right flex items-center justify-end shrink-0 overflow-hidden py-2.5">
                  <span className="text-[12px] font-black text-slate-300 uppercase truncate">
                    #{log.scheduleId}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">No logs found</span>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or wait for events to trigger</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
