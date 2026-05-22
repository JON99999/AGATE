import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { 
  Search, 
  Music
} from 'lucide-react';
import { LogEntry } from '../types';
import { cn, getMP3Status } from '../lib/utils';

interface LogTabProps {
  logs: LogEntry[];
}

type SortField = 'timestamp' | 'mp3Name' | 'scheduleName' | 'scheduleId' | 'playMode' | 'logTimeStamp';
type SortOrder = 'asc' | 'desc';

export default function LogTab({ logs }: LogTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
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
      // Dragging Time or Schedule right increases, ID decreases width unless inverted
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

  const filteredAndSortedLogs = useMemo(() => {
    let result = [...logs];

    // Filter
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

    // Sort
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

    return result.slice(0, DISPLAY_LIMIT);
  }, [logs, searchQuery, sortField, sortOrder]);

  // Sort Arrow component that renders both Up/Down arrows and bolds the active direction
  const SortArrow = ({ field }: { field: SortField }) => {
    const isActive = sortField === field;
    const isAsc = isActive && sortOrder === 'asc';
    const isDesc = isActive && sortOrder === 'desc';
    
    return (
      <span className="inline-flex flex-col ml-1 shrink-0 select-none leading-none -space-y-0.5">
        <span className={cn(
          "text-[7px] leading-none transition-all",
          isAsc 
            ? "text-blue-600 font-black scale-125" 
            : "text-slate-300 font-normal opacity-50"
        )}>▲</span>
        <span className={cn(
          "text-[7px] leading-none transition-all",
          isDesc 
            ? "text-blue-600 font-black scale-125" 
            : "text-slate-300 font-normal opacity-50"
        )}>▼</span>
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Tidy Search & Record Count on Same Line */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm shrink-0 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Filter logs by name, playback, or ID..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500/80 transition-all font-sans"
          />
        </div>
        
        {/* Count Label placed inline */}
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 shrink-0 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
          <span>Count:</span>
          <span className="text-xs font-black text-slate-900 tabular-nums">{logs.length}</span>
          {logs.length > DISPLAY_LIMIT && (
            <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1 py-0.5 rounded ml-1 tracking-normal">Last {DISPLAY_LIMIT}</span>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        
        {/* Header containing the dynamic incorporated sorts with 2 row headers */}
        <div className="bg-slate-50 border-b border-slate-200 py-2 flex items-stretch text-[9px] font-black text-slate-400 uppercase tracking-wider shrink-0 select-none">
          
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
          {filteredAndSortedLogs.length > 0 ? (
            filteredAndSortedLogs.map((log, i) => (
              <div 
                key={`${log.scheduleId}-${log.timestamp}-${i}`}
                className={cn(
                  "flex items-stretch border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0 grow min-h-[52px]",
                  i % 2 === 0 ? "bg-white" : "bg-slate-50/20"
                )}
              >
                {/* Timestamp cell mapped to Schedule/Actual */}
                <div style={{ width: `${colWidths.time}px` }} className="text-[11px] font-mono font-bold text-slate-900 tabular-nums leading-none flex flex-col justify-center gap-1.5 pr-2 pl-4 shrink-0 overflow-hidden py-2.5">
                  <div className="flex items-center truncate">
                    <span>{format(new Date(log.timestamp), 'yyyy-MM-dd')}</span>
                    <span className="text-slate-400 font-medium ml-1.5">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                  </div>
                  {log.logTimeStamp ? (
                    <span className="text-[8px] font-mono font-medium text-slate-400 tracking-tighter leading-none truncate">
                      ACTL: {format(new Date(log.logTimeStamp), 'yyyy-MM-dd HH:mm:ss')}
                    </span>
                  ) : (
                    <span className="text-[8px] font-mono font-medium text-slate-300 leading-none truncate">-</span>
                  )}
                </div>

                {/* Resizer guide line */}
                <div className="w-1 shrink-0 self-stretch border-r border-slate-100/50 bg-slate-50/10" />
                
                {/* Schedule details cell mapped to Name/PlayMode */}
                <div style={{ width: `${colWidths.schedule}px` }} className="px-2 flex flex-col justify-center gap-1 shrink-0 overflow-hidden py-2.5">
                  <span className="text-[11px] font-bold text-slate-800 line-clamp-2 leading-tight truncate">
                    {log.scheduleName}
                  </span>
                  <div>
                    <span className={cn(
                      "inline-block text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-sm leading-none border",
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
                    <span className="text-[10px] font-mono text-slate-400 truncate w-full" title={log.mp3Name}>
                      {getMP3Status(log.mp3Name).filename}
                    </span>
                  </div>
                </div>

                {/* Resizer guide line */}
                <div className="w-1 shrink-0 self-stretch border-r border-slate-100/50 bg-slate-50/10" />
                
                {/* ID cell */}
                <div style={{ width: `${colWidths.id}px` }} className="pr-4 pl-2 text-right flex items-center justify-end shrink-0 overflow-hidden py-2.5">
                  <span className="text-[9px] font-black text-slate-300 uppercase truncate">
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
