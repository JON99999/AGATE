import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, FileText, Calendar, Clock, CheckCircle, AlertCircle, ShieldAlert, Copy, Check, XCircle, FolderOpen, Music, Search, Play, Square } from 'lucide-react';
import { Schedule, ScheduleType, ScheduleMetadata } from '../types';
import { cn, getMP3Status, formatDuration, getFilenameFromUrlOrPath } from '../lib/utils';
import { getPlayableUrl, DRIVE_FOLDERS } from '../lib/driveService';

interface SchedulerTabProps {
  schedules: Schedule[];
  onSave: (schedules: Schedule[]) => void;
  isAdmin: boolean;
  onAdminToggle: (val: boolean) => void;
  now: Date;
  driveMP3s?: any[];
  isDriveActive?: boolean;
}

export default function SchedulerTab({ schedules, onSave, isAdmin, onAdminToggle, now, driveMP3s = [], isDriveActive = false }: SchedulerTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Schedule>>({});
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Calendar View states
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarLayoutMode, setCalendarLayoutMode] = useState<'full' | 'compact'>(() => (localStorage.getItem('interstitial_calendar_layout_mode') as 'full' | 'compact') || 'full');
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [calendarDate, setCalendarDate] = useState<Date>(() => new Date(now));
  const [selectedCalendarSchedule, setSelectedCalendarSchedule] = useState<Schedule | null>(null);
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
  const filteredFiles = soundLibrary.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const startEdit = (s: Schedule) => {
    setEditingId(s.id);
    setFormData(s);
  };

  const getScheduleSummary = (s: Schedule) => {
    if (s.type === ScheduleType.ONE_TIME) {
      const timeStr = s.time ? `${s.time}:${s.minute.toString().padStart(2, '0')}` : `??:${s.minute.toString().padStart(2, '0')}`;
      return `${s.date || 'No Date'} @ ${timeStr}`;
    }
    if (s.type === ScheduleType.BASIC_HOURLY) {
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

    return "Open for more details";
  };

  const getNextId = () => {
    const ids = schedules.map(s => parseInt(s.id)).filter(id => !isNaN(id));
    const max = ids.length > 0 ? Math.max(...ids) : 99999;
    return (max + 1).toString();
  };

  const createNew = () => {
    const id = getNextId();
    const today = new Date().toISOString().split('T')[0];
    const newSchedule: Schedule = {
      id,
      name: '',
      type: ScheduleType.BASIC_HOURLY,
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

  const duplicate = (s: Schedule, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = getNextId();
    const today = new Date().toISOString().split('T')[0];
    
    // Check if start date is in the past
    let newStartDate = s.startDate;
    if (s.startDate && s.startDate < today) {
      newStartDate = today;
    }

    const newSchedule: Schedule = {
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

    if (formData.type === ScheduleType.ONE_TIME) {
      if (!formData.date || !formData.time) {
        return;
      }
    }

    const sanitizedMp3Url = getFilenameFromUrlOrPath(formData.mp3Url);
    
    const now = new Date().toISOString();
    const updated: Schedule = {
      ...formData as Schedule,
      mp3Url: sanitizedMp3Url,
      metadata: {
        ...(formData.metadata as ScheduleMetadata),
        lastModifiedDate: now
      }
    };
    
    const exists = schedules.some(s => s.id === editingId);
    let newSchedules;
    if (exists) {
      newSchedules = schedules.map(s => s.id === editingId ? updated : s);
    } else {
      newSchedules = [...schedules, updated];
    }
    
    onSave(newSchedules);
    setEditingId(null);
  };

  const deleteSchedule = (id: string) => {
    onSave(schedules.filter(s => s.id !== id));
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

  const formatDayHeader = (date: Date) => {
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return {
      dayName: dayNames[date.getDay()],
      dateStr: `${month}/${day}`
    };
  };

  const getSchedulesForDateTime = (date: Date, hour: number) => {
    const yyyy = date.getFullYear();
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const localDateStr = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = date.getDay(); // 0-6

    return schedules.filter(s => {
      // Hide all inactive schedules by default if setting checked
      if (!showInactive && !s.enabled) return false;

      // Check range bounds
      if (s.startDate && localDateStr < s.startDate) return false;
      if (s.endDate && localDateStr > s.endDate) return false;

      if (s.type === ScheduleType.ONE_TIME) {
        if (!s.date || !s.time) return false;
        const sHour = parseInt(s.time, 10);
        return s.date === localDateStr && sHour === hour;
      }

      if (s.type === ScheduleType.BASIC_HOURLY) {
        return true;
      }

      if (s.type === ScheduleType.ADVANCED) {
        if (!s.gridRules) return false;
        return s.gridRules.includes(`${dayOfWeek}-${hour}`);
      }

      return false;
    });
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="bg-orange-50 p-4 rounded-full mb-4">
          <ShieldAlert className="w-12 h-12 text-orange-500" />
        </div>
        <h2 className="text-sm font-black text-slate-800 uppercase tracking-tighter mb-2">For Programming Administrators ONLY</h2>
        <p className="text-[12px] text-slate-500 max-w-[280px] mb-6 leading-relaxed font-medium">
          Please don't change or edit unless you know how it all works. Thanks!
        </p>
        <button 
          onClick={() => onAdminToggle(true)}
          className="px-6 py-2.5 bg-slate-900 text-white rounded text-[12px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95"
        >
          Enter Admin Mode
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-sans">
      {!editingId ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-3 px-1 shrink-0">
            <div className="flex bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] items-center gap-0.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  "px-3 py-1.5 flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wider rounded transition-all cursor-pointer border",
                  viewMode === 'list'
                    ? "bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] border-blue-500"
                    : "bg-transparent border-transparent text-slate-400 hover:text-slate-300"
                )}
              >
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-300",
                  viewMode === 'list'
                    ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                    : "bg-slate-800"
                )} />
                <span>Schedules</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={cn(
                  "px-3 py-1.5 flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wider rounded transition-all cursor-pointer border",
                  viewMode === 'calendar'
                    ? "bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)] border-blue-500"
                    : "bg-transparent border-transparent text-slate-400 hover:text-slate-300"
                )}
              >
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-300",
                  viewMode === 'calendar'
                    ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                    : "bg-slate-800"
                )} />
                <span>Calendar</span>
              </button>
            </div>
            
            <div className="flex gap-2 items-center">
              <button 
                onClick={createNew}
                className="p-1.5 px-4 bg-blue-600 text-white rounded text-[12px] font-black tracking-tighter shadow-sm hover:bg-blue-700 transition-colors uppercase cursor-pointer"
              >
                + ADD NEW
              </button>
            </div>
          </div>

          {viewMode === 'calendar' ? (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Calendar View Controls */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigateWeek(-1)}
                    className="px-2.5 py-1 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer text-[12px] font-black uppercase tracking-tighter"
                    title="Previous Week"
                  >
                    &larr; Prev Week
                  </button>
                  <button
                    type="button"
                    onClick={jumpToToday}
                    className="px-3 py-1 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 font-black cursor-pointer text-[12px] uppercase tracking-tighter"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateWeek(1)}
                    className="px-2.5 py-1 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer text-[12px] font-black uppercase tracking-tighter"
                    title="Next Week"
                  >
                    Next Week &rarr;
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 text-[12px] font-black uppercase tracking-tighter">
                  <span className="text-slate-450">Filter:</span>
                  <select
                    value={calendarDate.getMonth()}
                    onChange={handleMonthChange}
                    className="bg-white border border-slate-250 rounded px-2 py-1 text-[12px] font-black text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    {months.map((m, idx) => (
                      <option key={idx} value={idx}>{m}</option>
                    ))}
                  </select>

                  <select
                    value={calendarDate.getFullYear()}
                    onChange={handleYearChange}
                    className="bg-white border border-slate-250 rounded px-2 py-1 text-[12px] font-black text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    {years.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>

                  <div className="relative inline-block text-left mr-1">
                    <button
                      type="button"
                      onClick={() => setIsHoursDropdownOpen(!isHoursDropdownOpen)}
                      className="bg-white border border-slate-250 rounded px-2 py-1 text-[12px] font-black text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1 min-w-[100px] justify-between"
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
                            <span className="text-[12px] font-black text-slate-700 uppercase tracking-tighter">
                              Select Hours
                            </span>
                            <div className="flex gap-1.5 text-[11px] font-black uppercase tracking-tighter">
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
                                    "p-1 py-1 rounded text-[11px] font-black font-mono tracking-tight text-center border cursor-pointer select-none transition-all",
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

                  <span className="text-slate-450 ml-1">Mode:</span>
                  <div className="relative inline-flex bg-slate-200/70 p-0.5 rounded border border-slate-300/40 font-black text-[12px] uppercase w-36 select-none shrink-0">
                    <div 
                      className={cn(
                        "absolute top-0.5 bottom-0.5 rounded bg-white shadow-sm transition-all duration-200 ease-out",
                        calendarLayoutMode === 'full' 
                          ? "left-0.5 w-[calc(50%-1px)]" 
                          : "left-[calc(50%+0.5px)] w-[calc(50%-1px)]"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarLayoutMode('full');
                        localStorage.setItem('interstitial_calendar_layout_mode', 'full');
                      }}
                      className={cn(
                        "relative py-0.5 rounded text-[12px] font-black tracking-tight uppercase transition-colors z-10 w-1/2 text-center cursor-pointer",
                        calendarLayoutMode === 'full' ? "text-slate-800" : "text-slate-500 hover:text-slate-700"
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
                        "relative py-0.5 rounded text-[12px] font-black tracking-tight uppercase transition-colors z-10 w-1/2 text-center cursor-pointer",
                        calendarLayoutMode === 'compact' ? "text-slate-800" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      Compact
                    </button>
                  </div>

                  <label className="flex items-center gap-1.5 text-slate-650 cursor-pointer select-none text-[12px] font-black uppercase tracking-tighter ml-1">
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
                {/* Header row (Static outside of the scrollable viewport, matching log grid layout) */}
                <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] bg-slate-100 border-b border-slate-250 select-none text-[14px] font-black text-slate-500 uppercase tracking-tighter shrink-0 shadow-sm z-10">
                  <div className="p-2 border-r border-slate-205 flex items-center justify-center font-mono text-slate-450">
                    Hour
                  </div>
                  {getWeekDays(calendarDate).map((day, idx) => {
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
                        <span className="font-black text-[14px] leading-tight truncate">
                          {dayName} <span className="opacity-80 font-normal ml-1">{dateStr}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Scrollable list of hours */}
                <div className="overflow-y-auto flex-1 custom-scrollbar min-h-0 grid grid-cols-1">
                  {Array.from({ length: 24 }).map((_, h) => h)
                    .filter(h => selectedHours.includes(h))
                    .map((hour) => {
                      return (
                      <div key={hour} className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-slate-150 last:border-b-0 hover:bg-slate-50/10 transition-colors">
                        {/* Hour column */}
                        <div className="p-1.5 px-0.5 border-r border-slate-200 flex items-center justify-center bg-slate-50/50 select-none text-[14px] font-black font-mono text-slate-455 uppercase shrink-0">
                          {hour.toString().padStart(2, '0')}:00
                        </div>

                        {/* Day slots */}
                        {getWeekDays(calendarDate).map((day, dayIdx) => {
                          const cellSchedules = getSchedulesForDateTime(day, hour);
                          return (
                            <div 
                              key={dayIdx} 
                              className={cn(
                                "p-1 border-r border-slate-205 last:border-r-0 min-h-[28px] h-auto overflow-visible justify-start",
                                calendarLayoutMode === 'compact' 
                                  ? "flex flex-row flex-wrap gap-1 items-start content-start animate-fade-in" 
                                  : "flex flex-col gap-1"
                              )}
                            >
                              {cellSchedules.map(s => {
                                const formattedMin = s.minute.toString().padStart(2, '0');
                                const summaryText = `ID: ${s.id} — ${s.name}\nTime: :${formattedMin}\nFile: ${s.mp3Url || 'None'}\nMode: ${s.type}`;
                                if (calendarLayoutMode === 'compact') {
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => setSelectedCalendarSchedule(s)}
                                      className={cn(
                                        "inline-flex items-center justify-center p-0.5 px-1.5 rounded font-mono text-[12px] font-black leading-none shadow-sm border cursor-pointer select-none shrink-0 transition-all hover:scale-105",
                                        !s.enabled 
                                          ? "bg-slate-100 text-slate-400 border-slate-200 line-through" 
                                          : s.type === ScheduleType.ONE_TIME 
                                            ? "bg-purple-100 text-purple-700 border-purple-200 font-extrabold" 
                                            : s.type === ScheduleType.BASIC_HOURLY 
                                              ? "bg-blue-100 text-blue-700 border-blue-200" 
                                              : "bg-orange-100 text-orange-700 border-orange-200"
                                      )}
                                      title={summaryText}
                                    >
                                      {formattedMin}
                                    </button>
                                  );
                                }
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setSelectedCalendarSchedule(s)}
                                    className={cn(
                                      "w-full text-left p-1 rounded font-sans text-[12px] leading-tight truncate shadow-sm border block cursor-pointer select-none transition-all hover:translate-x-0.5",
                                      !s.enabled 
                                        ? "bg-slate-105 text-slate-400 border-slate-200 line-through" 
                                        : s.type === ScheduleType.ONE_TIME 
                                          ? "bg-purple-50 text-purple-700 border-purple-200 font-bold" 
                                          : s.type === ScheduleType.BASIC_HOURLY 
                                            ? "bg-blue-50 text-blue-700 border-blue-200" 
                                            : "bg-orange-50 text-orange-700 border-orange-200"
                                    )}
                                    title={summaryText}
                                  >
                                    <div className="truncate flex items-center gap-0.5">
                                      <span className="font-mono font-black text-[12px] text-slate-455 shrink-0">:{formattedMin}</span>
                                      <span className="truncate">{s.name}</span>
                                    </div>
                                  </button>
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
          ) : (
            <div className="flex flex-col gap-6 overflow-y-auto flex-1 pb-4 pr-1 custom-scrollbar">
            {/* Active Schedules Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px bg-green-100 flex-1"></div>
                <span className="text-[12px] font-black text-green-500 uppercase tracking-widest">Active Schedules</span>
                <div className="h-px bg-green-100 flex-1"></div>
              </div>
              
              {(() => {
                const today = now.toISOString().split('T')[0];
                const activeOnes = schedules.filter(s => {
                  let isExpired = false;
                  if (s.type === ScheduleType.ONE_TIME) {
                    if (s.date && s.time) {
                      const expiry = new Date(`${s.date}T${s.time}:${(s.minute || 0).toString().padStart(2, '0')}:00`);
                      isExpired = expiry < now;
                    } else if (s.date) {
                      isExpired = s.date < today;
                    }
                  } else {
                    isExpired = !!(s.endDate && s.endDate < today);
                  }
                  return s.enabled && !isExpired;
                });

                if (activeOnes.length === 0) {
                  return (
                    <div className="py-8 text-center bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                      <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest leading-none">No active triggers</p>
                    </div>
                  );
                }

                return activeOnes
                  .sort((a, b) => a.minute - b.minute)
                  .map(s => (
                    <div 
                      key={s.id}
                      onClick={() => startEdit(s)}
                      className={cn(
                        "p-3 rounded-lg border transition-all cursor-pointer group relative",
                        "bg-white border-slate-200 hover:border-blue-300 shadow-sm"
                      )}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                          <span className="text-[12px] font-black text-slate-300 uppercase leading-none mb-1 sm:mb-0">ID: {s.id}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[12px] uppercase font-bold tracking-tighter inline-block w-fit leading-none mb-1 sm:mb-0",
                            s.type === ScheduleType.ONE_TIME ? "bg-purple-100 text-purple-700 font-black" :
                            s.type === ScheduleType.BASIC_HOURLY ? "bg-blue-100 text-blue-700" :
                            "bg-orange-100 text-orange-700"
                          )}>
                            {s.type === ScheduleType.ONE_TIME ? "One-Time" : s.type.split('-').pop()}
                          </span>
                          <span className="hidden sm:inline-block text-[16px] font-bold text-slate-800 truncate max-w-[200px] leading-none ml-1">
                            {s.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 underline-offset-4">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(s);
                            }}
                            className="flex items-center gap-1 py-1 px-2 hover:bg-blue-600 hover:text-white bg-white border border-blue-100 rounded text-blue-600 transition-all shadow-sm group/btn"
                            title="View or Edit Schedule"
                          >
                            <FileText className="w-2.5 h-2.5" />
                            <span className="text-[12px] font-black uppercase">View/Edit</span>
                          </button>
                          <button 
                            onClick={(e) => duplicate(s, e)}
                            className="flex items-center gap-1 py-1 px-2 hover:bg-blue-50 bg-white border border-slate-100 rounded text-blue-600 transition-all shadow-sm"
                            title="Duplicate Schedule"
                          >
                            <Copy className="w-2.5 h-2.5" />
                            <span className="text-[12px] font-black uppercase">Duplicate</span>
                          </button>
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1" />
                        </div>
                      </div>
                      <p className="font-bold text-slate-800 text-[16px] truncate leading-tight mb-1 sm:hidden">{s.name}</p>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-1.5 text-[14px] text-slate-400 font-bold uppercase tracking-tighter shrink-0">
                          <Clock className="w-3 h-3" />
                          <span>:{s.minute.toString().padStart(2, '0')}m </span>
                          <span className="text-slate-300 ml-1">• {getScheduleSummary(s)}</span>
                        </div>
                        
                        {/* MP3 Status Info */}
                        {(() => {
                           const status = getMP3Status(s.mp3Url);
                           const isVerified = status.exists && status.valid;
                           return (
                             <div className="flex items-center gap-1.5 min-w-0 overflow-hidden text-right justify-end flex-1">
                               <button 
                                 onClick={(e) => isVerified ? togglePreview(s.mp3Url, e) : e.stopPropagation()}
                                 disabled={!isVerified}
                                 className={cn(
                                   "flex items-center gap-2 py-0.5 px-3 rounded border shadow-sm transition-all group/play min-w-0 max-w-full",
                                   previewUrl === s.mp3Url 
                                     ? "bg-slate-900 text-white border-slate-900" 
                                     : isVerified
                                       ? "bg-white text-blue-600 border-blue-100 hover:bg-blue-50"
                                       : "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
                                 )}
                               >
                                 <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                                   <Music className={cn(
                                     "w-2.5 h-2.5 shrink-0", 
                                     previewUrl === s.mp3Url ? "text-slate-400" : 
                                     isVerified ? "text-slate-300 group-hover/play:text-blue-400" : "text-slate-200"
                                   )} />
                                   <span className={cn(
                                     "text-[12px] font-bold uppercase truncate",
                                     previewUrl === s.mp3Url ? "text-white" :
                                     !status.exists ? "text-red-400" : !status.valid ? "text-orange-400" : "text-slate-400 group-hover/play:text-blue-700"
                                   )}>
                                     {!status.exists ? "File not found." : !status.valid ? "File not mp3." : status.filename}
                                   </span>
                                 </div>

                                 <div className={cn(
                                   "h-3 w-px shrink-0 mx-0.5",
                                   previewUrl === s.mp3Url ? "bg-slate-700" : isVerified ? "bg-slate-200 group-hover/play:bg-blue-200" : "bg-slate-200"
                                 )} />

                                 <div className="flex items-center gap-1.5 shrink-0">
                                   {previewUrl === s.mp3Url ? (
                                     <Square className="w-2.5 h-2.5 fill-current" />
                                   ) : isVerified ? (
                                     <Play className="w-2.5 h-2.5 fill-current" />
                                   ) : (
                                     <XCircle className="w-2.5 h-2.5" />
                                   )}
                                   <span className="text-[12px] font-black uppercase whitespace-nowrap">
                                     {previewUrl === s.mp3Url ? 'Stop' : isVerified ? 'Preview' : 'Locked'}
                                   </span>
                                 </div>
                               </button>
                             </div>
                           );
                        })()}
                      </div>
                    </div>
                  ));
              })()}
            </div>

            {/* Inactive Schedules Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px bg-slate-100 flex-1"></div>
                <span className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Inactive Schedules</span>
                <div className="h-px bg-slate-100 flex-1"></div>
              </div>

              {(() => {
                const today = now.toISOString().split('T')[0];
                const inactiveOnes = schedules.filter(s => {
                  let isExpired = false;
                  if (s.type === ScheduleType.ONE_TIME) {
                    if (s.date && s.time) {
                      const expiry = new Date(`${s.date}T${s.time}:${(s.minute || 0).toString().padStart(2, '0')}:00`);
                      isExpired = expiry < now;
                    } else if (s.date) {
                      isExpired = s.date < today;
                    }
                  } else {
                    isExpired = !!(s.endDate && s.endDate < today);
                  }
                  return !s.enabled || isExpired;
                });

                if (inactiveOnes.length === 0) {
                  return (
                    <div className="py-4 text-center">
                      <p className="text-[12px] font-bold text-slate-300 uppercase tracking-widest">No inactive items</p>
                    </div>
                  );
                }

                return (
                  <>
                    {inactiveOnes
                      .sort((a, b) => parseInt(b.id) - parseInt(a.id))
                      .slice(0, 5)
                      .map(s => {
                        let isExpired = false;
                        if (s.type === ScheduleType.ONE_TIME) {
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
                              "p-3 rounded-lg border transition-all cursor-pointer group relative",
                              "bg-slate-50/50 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            <div className="flex justify-between items-start mb-1.5">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                                <span className="text-[12px] font-black text-slate-300 uppercase leading-none mb-1 sm:mb-0">ID: {s.id}</span>
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-[12px] uppercase font-bold tracking-tighter inline-block w-fit leading-none mb-1 sm:mb-0 opacity-60",
                                  s.type === ScheduleType.ONE_TIME ? "bg-purple-100 text-purple-700 font-black" :
                                  s.type === ScheduleType.BASIC_HOURLY ? "bg-blue-100 text-blue-700" :
                                  "bg-orange-100 text-orange-700"
                                )}>
                                  {s.type === ScheduleType.ONE_TIME ? "One-Time" : s.type.split('-').pop()}
                                </span>
                                <span className="hidden sm:inline-block text-[16px] font-bold text-slate-600 truncate max-w-[200px] leading-none ml-1">
                                  {s.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 underline-offset-4">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEdit(s);
                                  }}
                                  className="flex items-center gap-1 py-1 px-2 hover:bg-slate-300 bg-white border border-slate-100 rounded text-slate-600 transition-all shadow-sm"
                                  title="View or Edit Schedule"
                                >
                                  <FileText className="w-2.5 h-2.5" />
                                  <span className="text-[12px] font-black uppercase">View/Edit</span>
                                </button>
                                <button 
                                  onClick={(e) => duplicate(s, e)}
                                  className="flex items-center gap-1 py-1 px-2 hover:bg-white bg-slate-100/50 border border-slate-200/50 rounded text-slate-500 transition-all shadow-sm"
                                  title="Duplicate Schedule"
                                >
                                  <Copy className="w-2.5 h-2.5" />
                                  <span className="text-[12px] font-black uppercase">Duplicate</span>
                                </button>
                                <span className={cn("w-1.5 h-1.5 rounded-full ml-1", isExpired ? "bg-red-300" : "bg-slate-300")} />
                              </div>
                            </div>
                            <p className="font-bold text-slate-600 text-[16px] truncate leading-tight mb-1 sm:hidden">{s.name}</p>
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-1.5 text-[14px] text-slate-400 font-bold uppercase tracking-tighter shrink-0">
                                <Clock className="w-3 h-3 opacity-50" />
                                <span>:{s.minute.toString().padStart(2, '0')}m </span>
                                <span className="text-slate-300 ml-1">• {getScheduleSummary(s)} • {isExpired ? <span className="text-red-400/70 font-black">EXPIRED</span> : 'SUSPENDED'}</span>
                              </div>

                              {/* MP3 Status Info Inactive */}
                              {(() => {
                                const status = getMP3Status(s.mp3Url);
                                const isVerified = status.exists && status.valid;
                                return (
                                  <div className="flex items-center gap-1.5 overflow-hidden text-right justify-end flex-1 opacity-60">
                                    <button 
                                      onClick={(e) => isVerified ? togglePreview(s.mp3Url, e) : e.stopPropagation()}
                                      disabled={!isVerified}
                                      className={cn(
                                        "flex items-center gap-2 py-0.5 px-3 rounded border shadow-sm transition-all group/play min-w-0 max-w-full",
                                        previewUrl === s.mp3Url 
                                          ? "bg-slate-900 text-white border-slate-900 opacity-100" 
                                          : isVerified
                                            ? "bg-white text-slate-500 border-slate-100 hover:bg-slate-50"
                                            : "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
                                      )}
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0 overflow-hidden font-medium">
                                        <Music className={cn(
                                          "w-2.5 h-2.5 shrink-0", 
                                          previewUrl === s.mp3Url ? "text-slate-400" : 
                                          isVerified ? "text-slate-300 group-hover/play:text-slate-400" : "text-slate-200"
                                        )} />
                                        <span className={cn(
                                          "text-[12px] font-bold uppercase truncate",
                                          previewUrl === s.mp3Url ? "text-white" :
                                          !status.exists ? "text-red-400" : !status.valid ? "text-orange-400" : "text-slate-400 group-hover/play:text-slate-600"
                                        )}>
                                          {!status.exists ? "File not found." : !status.valid ? "File not mp3." : status.filename}
                                        </span>
                                      </div>

                                      <div className={cn(
                                        "h-3 w-px shrink-0 mx-0.5",
                                        previewUrl === s.mp3Url ? "bg-slate-700" : isVerified ? "bg-slate-200 group-hover/play:bg-slate-300" : "bg-slate-200"
                                      )} />

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {previewUrl === s.mp3Url ? (
                                          <Square className="w-2.5 h-2.5 fill-current" />
                                        ) : isVerified ? (
                                          <Play className="w-2.5 h-2.5 fill-current" />
                                        ) : (
                                          <XCircle className="w-2.5 h-2.5" />
                                        )}
                                        <span className="text-[12px] font-black uppercase whitespace-nowrap">
                                          {previewUrl === s.mp3Url ? 'Stop' : isVerified ? 'Preview' : 'Locked'}
                                        </span>
                                      </div>
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    {inactiveOnes.length > 5 && (
                      <p className="text-[12px] text-center text-slate-400 font-bold uppercase tracking-tighter pt-1">
                        + {inactiveOnes.length - 5} more hidden inactive items
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 flex flex-col h-full overflow-hidden shadow-md">
          {/* Editor Header */}
          <div className="border-b border-slate-100 p-3 bg-slate-50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <div className="bg-blue-600 p-1.5 rounded shrink-0">
                <FileText className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-black text-slate-800 truncate uppercase tracking-tighter">Editor</h3>
                <p className="text-[12px] text-slate-400 truncate">{editingId === 'new' ? 'New Profile' : `ID: ${formData.id} — ${formData.name || 'Unnamed'}`}</p>
              </div>
            </div>
          </div>

          <div className="p-4 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Basic Info */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Schedule Type</label>
                  <select 
                    value={formData.type} 
                    disabled={schedules.some(s => s.id === editingId)}
                    onChange={e => setFormData({...formData, type: e.target.value as ScheduleType})}
                    className={cn(
                      "w-full px-3 py-2 rounded border text-xs font-bold outline-none transition-all",
                      schedules.some(s => s.id === editingId) 
                        ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed" 
                        : "bg-white border-blue-200 text-slate-700 hover:border-blue-400"
                    )}
                  >
                    <option value={ScheduleType.ONE_TIME}>One-Time Play</option>
                    <option value={ScheduleType.BASIC_HOURLY}>Repeating Hourly</option>
                    <option value={ScheduleType.ADVANCED}>Advanced Calendar</option>
                  </select>
                  {schedules.some(s => s.id === editingId) && (
                    <p className="text-[12px] text-slate-400 font-medium italic">Type cannot be changed after creation.</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Entry Name</label>
                  <input 
                    type="text" 
                    value={formData.name || ''} 
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Identify the schedule..."
                    className={cn(
                      "w-full px-3 py-2 rounded border text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none",
                      !formData.name && editingId ? "border-red-300" : "border-slate-200"
                    )}
                  />
                  {!formData.name && <p className="text-[12px] text-red-500 font-bold uppercase tracking-tighter">Name is required</p>}
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-black text-slate-400 uppercase tracking-widest">MP3 location</label>
                    {formData.mp3Url && (
                      <div className="flex items-center gap-2">
                        {(() => {
                          const status = getMP3Status(formData.mp3Url);
                          const isVerified = status.exists && status.valid;
                          return (
                            <>
                              {!status.exists && (
                                <span className="flex items-center gap-1 text-[12px] font-black text-red-500 uppercase bg-red-50 px-1.5 py-0.5 rounded border border-red-100 shadow-sm animate-pulse">
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  File not found.
                                </span>
                              )}
                              {!status.valid && status.exists && (
                                <span className="flex items-center gap-1 text-[12px] font-black text-orange-500 uppercase bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 shadow-sm">
                                  <Music className="w-2.5 h-2.5" />
                                  File not mp3.
                                </span>
                              )}
                              {isVerified && (
                                <div className="flex flex-col items-end">
                                  <span className="flex items-center gap-1 text-[12px] font-black text-green-500 uppercase bg-green-50 px-1.5 py-0.5 rounded border border-green-100 shadow-sm">
                                    <CheckCircle className="w-2.5 h-2.5" />
                                    File Verified
                                  </span>
                                  {formData.duration && (
                                    <span className="text-[12px] font-mono font-bold text-slate-400 mt-0.5">Length: {formData.duration}</span>
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        <button
                          onClick={() => togglePreview(formData.mp3Url)}
                          disabled={!(getMP3Status(formData.mp3Url).exists && getMP3Status(formData.mp3Url).valid)}
                          className={cn(
                            "flex items-center gap-1 text-[12px] font-black uppercase px-2 py-0.5 rounded border shadow-sm transition-all",
                            previewUrl === formData.mp3Url 
                              ? "bg-slate-900 text-white border-slate-900" 
                              : (getMP3Status(formData.mp3Url).exists && getMP3Status(formData.mp3Url).valid)
                                ? "bg-white text-blue-600 border-blue-100 hover:bg-blue-50"
                                : "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
                          )}
                        >
                          {previewUrl === formData.mp3Url ? <Square className="w-2 h-2 fill-current" /> : <Play className="w-2 h-2 fill-current" />}
                          {previewUrl === formData.mp3Url ? 'Stop Preview' : 'Preview MP3'}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="text" 
                        value={formData.mp3Url || ''} 
                        onChange={e => setFormData({...formData, mp3Url: e.target.value})}
                        placeholder="https://www.googleapis.com/drive/v3/files/... or select from browse"
                        className={cn(
                          "w-full px-3 py-2 rounded border font-mono text-[12px] outline-none transition-all pr-12",
                          formData.mp3Url && !getMP3Status(formData.mp3Url).exists 
                            ? "bg-red-50 border-red-200 focus:ring-red-500" 
                            : "bg-slate-50 border-slate-100 focus:ring-blue-500"
                        )}
                      />
                      {formData.mp3Url && (
                        <button
                          onClick={() => togglePreview(formData.mp3Url)}
                          disabled={!(getMP3Status(formData.mp3Url).exists && getMP3Status(formData.mp3Url).valid)}
                          className={cn(
                            "absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded transition-all",
                            previewUrl === formData.mp3Url 
                              ? "bg-slate-900 text-white" 
                              : (getMP3Status(formData.mp3Url).exists && getMP3Status(formData.mp3Url).valid)
                                ? "text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                : "text-slate-200 cursor-not-allowed"
                          )}
                          title={previewUrl === formData.mp3Url ? "Stop" : "Preview"}
                        >
                          {previewUrl === formData.mp3Url ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
                        </button>
                      )}
                    </div>
                    <button 
                      onClick={() => setIsPickerOpen(true)}
                      className="px-3 py-2 bg-slate-900 text-white rounded text-[12px] font-black uppercase flex items-center gap-2 hover:bg-slate-800 transition-all shadow-sm"
                    >
                      <FolderOpen className="w-3 h-3" />
                      Browse
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded border border-slate-100 space-y-3">
                  <div className="flex justify-between items-center text-[12px] font-black uppercase text-slate-500 tracking-tighter">
                    <span>Scheduled play time</span>
                    <div className="flex items-center gap-1">
                      <span className="text-blue-600 font-bold">:</span>
                      <input 
                        type="number"
                        min="0"
                        max="59"
                        value={formData.minute || 0}
                        onChange={e => {
                          const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                          setFormData({...formData, minute: val});
                        }}
                        className="w-10 text-center text-blue-600 bg-white px-1 py-0.5 border rounded font-black outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <input 
                      type="range" 
                      min="0" 
                      max="59" 
                      value={formData.minute || 0} 
                      onChange={e => setFormData({...formData, minute: parseInt(e.target.value)})}
                      className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-full cursor-pointer"
                    />
                    <div className="flex justify-between px-0.5 text-[12px] font-black text-slate-300 uppercase tracking-tighter">
                      {[0, 20, 40, 59].map(m => (
                        <span key={m} className="cursor-pointer hover:text-blue-600" onClick={() => setFormData({...formData, minute: m})}>
                          :{m.toString().padStart(2, '0')}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Schedule Status</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setFormData({...formData, enabled: true})}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded border text-[12px] font-black uppercase transition-all shadow-sm",
                        formData.enabled ? "bg-green-600 border-green-600 text-white" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                      )}
                    >
                      Active
                      {formData.enabled && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <button 
                      onClick={() => setFormData({...formData, enabled: false})}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded border text-[12px] font-black uppercase transition-all shadow-sm",
                        !formData.enabled ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                      )}
                    >
                      Suspended
                      {!formData.enabled && <AlertCircle className="w-3 h-3 text-white" />}
                    </button>
                  </div>
                </div>

                {formData.metadata && (
                  <div className="p-3 bg-slate-50/50 rounded-lg border border-slate-100 flex flex-col gap-2">
                    <div className="flex justify-between items-center text-[12px] font-black uppercase text-slate-400">
                      <span>System Metadata</span>
                      <ShieldAlert className="w-2.5 h-2.5 opacity-30" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[12px] text-slate-400 font-bold uppercase mb-0.5">Created</p>
                        <p className="text-[12px] text-slate-600 font-mono font-medium leading-none">
                          {new Date(formData.metadata.createdDate).toLocaleDateString([], { month: '2-digit', day: '2-digit', year: '2-digit' })} {new Date(formData.metadata.createdDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </p>
                      </div>
                      <div>
                        <p className="text-[12px] text-slate-400 font-bold uppercase mb-0.5">Last Modification</p>
                        <p className="text-[12px] text-slate-600 font-mono font-medium leading-none">
                          {new Date(formData.metadata.lastModifiedDate).toLocaleDateString([], { month: '2-digit', day: '2-digit', year: '2-digit' })} {new Date(formData.metadata.lastModifiedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Date/Advanced Rules */}
              <div className="space-y-4">
                {formData.type === ScheduleType.ONE_TIME && (
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-100 space-y-4">
                    <h4 className="text-[12px] font-black text-purple-700 uppercase tracking-widest">Static Play Logic</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-purple-400 uppercase">Target Date</label>
                        <input 
                          type="date" 
                          value={formData.date || ''} 
                          onChange={e => setFormData({...formData, date: e.target.value})} 
                          className={cn(
                            "w-full px-2 py-1.5 border rounded text-[12px] outline-none",
                            !formData.date && editingId ? "border-red-300 bg-red-50" : "border-purple-200"
                          )} 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-purple-400 uppercase">Target Hour</label>
                        <select 
                          value={formData.time || ''} 
                          onChange={e => setFormData({...formData, time: e.target.value})} 
                          className={cn(
                            "w-full px-2 py-1.5 border rounded text-[12px] outline-none bg-white font-bold",
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

                {formData.type === ScheduleType.ADVANCED && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[12px] font-black text-blue-700 uppercase tracking-widest">Weekly Schedule</h4>
                      <div className="flex gap-2 text-[12px] font-black uppercase text-slate-400">
                        <span className="flex items-center gap-1"><Check className="w-2.5 h-2.5 text-green-600" /> Active</span>
                        <span className="flex items-center gap-1"><XCircle className="w-2.5 h-2.5 text-red-400" /> Inactive</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-blue-100/50">
                            <th className="p-1">
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
                                className="px-1.5 py-0.5 rounded bg-blue-600 text-[12px] font-black text-white hover:bg-blue-700 transition-colors uppercase"
                              >
                                All
                              </button>
                            </th>
                            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day, i) => (
                              <th 
                                key={i} 
                                onClick={() => toggleColumn(i)}
                                className="p-1 text-[12px] font-black text-slate-400 cursor-pointer hover:text-blue-600 transition-colors uppercase pb-2"
                              >
                                {day}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 24 }).map((_, h) => (
                            <tr key={h} className="hover:bg-blue-100/30 transition-colors">
                              <td 
                                onClick={() => toggleRow(h)}
                                className="p-0 text-[12px] font-black text-slate-400 pr-2 cursor-pointer hover:text-blue-600 transition-colors border-r border-slate-100 text-right leading-none h-4"
                              >
                                {h.toString().padStart(2, '0')}:00
                              </td>
                              {Array.from({ length: 7 }).map((_, d) => {
                                const active = formData.gridRules?.includes(`${d}-${h}`);
                                return (
                                  <td key={d} className="p-0 border-b border-white/50">
                                    <button
                                      onClick={() => toggleGridCell(d, h)}
                                      className={cn(
                                        "w-full h-4 flex items-center justify-center transition-all border-r border-white/50",
                                        active 
                                          ? "bg-green-500 hover:bg-green-400 shadow-sm" 
                                          : "bg-red-50 hover:bg-red-100"
                                      )}
                                    >
                                      {active ? (
                                        <Check className="w-2.5 h-2.5 text-white" />
                                      ) : (
                                        <XCircle className="w-2 h-2 text-red-200" />
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
                    
                    <p className="text-[12px] text-slate-400 italic font-medium pt-2 border-t border-blue-100/50">
                      * Headers are clickable to toggle entire columns or rows.
                    </p>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-blue-400 uppercase">Effective Start</label>
                        <input 
                          type="date" 
                          value={formData.startDate || ''} 
                          onChange={e => setFormData({...formData, startDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-blue-200 rounded text-[12px] outline-none bg-white font-medium" 
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[12px] font-bold text-blue-400 uppercase">Expiration Date</label>
                        <input 
                          type="date" 
                          value={formData.endDate || ''} 
                          onChange={e => setFormData({...formData, endDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-blue-200 rounded text-[12px] outline-none bg-white font-medium" 
                        />
                        <p className="text-[12px] text-slate-400 font-bold uppercase tracking-tighter">* Blank = No stop date</p>
                      </div>
                    </div>
                  </div>
                )}

                {formData.type === ScheduleType.BASIC_HOURLY && (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-col items-center justify-center text-center space-y-4 min-h-[140px]">
                    <div className="flex flex-col items-center justify-center opacity-60">
                      <Clock className="w-6 h-6 text-slate-300 mb-2" />
                      <p className="text-[12px] text-slate-500 font-medium">Auto-repeat hourly trigger enabled.</p>
                    </div>
                    
                    <div className="w-full grid grid-cols-2 gap-3 pt-4 border-t border-slate-200">
                      <div className="space-y-1 text-left">
                        <label className="text-[12px] font-bold text-slate-400 uppercase">Effective Start</label>
                        <input 
                          type="date" 
                          value={formData.startDate || ''} 
                          onChange={e => setFormData({...formData, startDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-slate-300 rounded text-[12px] outline-none bg-white font-medium" 
                        />
                      </div>
                      <div className="space-y-1 text-left">
                        <label className="text-[12px] font-bold text-slate-400 uppercase">Expiration Date</label>
                        <input 
                          type="date" 
                          value={formData.endDate || ''} 
                          onChange={e => setFormData({...formData, endDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-slate-300 rounded text-[12px] outline-none bg-white font-medium" 
                        />
                        <p className="text-[12px] text-slate-400 font-bold uppercase tracking-tighter">* Blank = No stop date</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
              <button 
                onClick={() => deleteSchedule(editingId!)}
                className="px-4 py-2 flex items-center justify-center gap-2 text-red-500 font-black text-[12px] uppercase hover:bg-red-50 rounded transition-colors border border-transparent hover:border-red-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete this Schedule
              </button>
              
              <div className="flex gap-2">
                <button 
                  onClick={saveEdit}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded text-[12px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Save and Close
                </button>

                <button 
                  onClick={() => setEditingId(null)}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded text-[12px] font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest transition-all"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MP3 Picker Modal */}
      {isPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded">
                  <FolderOpen className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                    {isDriveActive ? "google drive mp3library folder" : "local mp3 library"}
                  </h3>
                  <p className="text-[12px] text-slate-400 font-bold uppercase">
                    Source: {isDriveActive ? `Google Drive mp3library folder (${DRIVE_FOLDERS.mp3s})` : 'Bundled Local Audio Assets'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsPickerOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Filter resources..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-4 py-2 bg-slate-100 rounded text-[12px] font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
              
              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {filteredFiles.length > 0 ? filteredFiles.map((file, i) => (
                  <button 
                    key={i}
                    onClick={() => {
                      setFormData({ ...formData, mp3Url: file.name });
                      setIsPickerOpen(false);
                    }}
                    className={cn(
                      "w-full text-left p-3 rounded-lg group flex items-center justify-between transition-all border",
                      !file.name.toLowerCase().endsWith('.mp3')
                        ? "bg-orange-50/30 border-orange-100 hover:border-orange-300"
                        : "bg-white hover:bg-blue-50 border-transparent hover:border-blue-100"
                    )}
                  >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <Music className={cn(
                        "w-4 h-4 shrink-0",
                        !file.name.toLowerCase().endsWith('.mp3') ? "text-orange-400" : "text-slate-300 group-hover:text-blue-500"
                      )} />
                      <div className="min-w-0">
                        <p className={cn(
                          "text-[12px] font-bold truncate leading-none",
                          !file.name.toLowerCase().endsWith('.mp3') ? "text-orange-700" : "text-slate-700 group-hover:text-blue-700"
                        )}>{file.name}</p>
                        <p className="text-[12px] text-slate-400 mt-1 font-mono">{file.path}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[12px] font-black text-slate-300 uppercase leading-none">{file.size}</span>
                      {!file.name.toLowerCase().endsWith('.mp3') && (
                        <span className="text-[12px] font-black text-orange-500 uppercase bg-orange-100 px-1 rounded">No .mp3 extension</span>
                      )}
                    </div>
                  </button>
                )) : (
                  <div className="py-12 text-center">
                    <AlertCircle className="w-8 h-8 text-amber-500/60 mx-auto mb-2" />
                    <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">
                      {isDriveActive ? "No files inside Drive folder" : "No matching resources"}
                    </p>
                    {isDriveActive && (
                      <p className="text-[12px] text-slate-400 mt-2 max-w-[225px] mx-auto leading-relaxed uppercase font-bold">
                        Please upload your custom .mp3 files into the Google Drive "mp3library" folder!
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {isDriveActive && (
              <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                <p className="text-[12px] text-slate-400 font-bold uppercase italic leading-relaxed">
                  * Real-time sync with default folder "google drive mp3library folder" enabled.<br/>
                  Drive Location Target: google drive mp3library folder (ID: {DRIVE_FOLDERS.mp3s})
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Calendar Schedule Details Modal Overlay */}
      {selectedCalendarSchedule && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[90]">
          <div className="bg-white rounded-xl border border-slate-250 shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
            <div className="p-4 bg-slate-50 border-b border-slate-155 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-500" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-tighter">Schedule Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCalendarSchedule(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <span className="text-[12px] font-black font-mono text-slate-350 uppercase block tracking-widest leading-none mb-1">ID: {selectedCalendarSchedule.id}</span>
                <p className="text-[16px] font-black text-slate-800 leading-tight tracking-tight">{selectedCalendarSchedule.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3 text-[12px]">
                <div>
                  <span className="text-slate-400 uppercase font-bold block mb-0.5">Type</span>
                  <span className="font-bold text-slate-700 capitalize">
                    {selectedCalendarSchedule.type === ScheduleType.ONE_TIME ? "One-Time" : selectedCalendarSchedule.type.split('-').pop()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold block mb-0.5">Status</span>
                  <span className={cn("font-bold", selectedCalendarSchedule.enabled ? "text-green-600" : "text-slate-400")}>
                    {selectedCalendarSchedule.enabled ? "Enabled" : "Suspended"}
                  </span>
                </div>
                <div className="col-span-2 border-t border-slate-200/50 pt-2">
                  <span className="text-slate-400 uppercase font-bold block mb-0.5">Timing Summary</span>
                  <span className="font-bold text-slate-755 block font-mono">
                    :{selectedCalendarSchedule.minute.toString().padStart(2, '0')}m • {getScheduleSummary(selectedCalendarSchedule)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[12px] text-slate-400 uppercase font-bold block">Target Audio Track</span>
                <div className="p-2 border border-slate-200 rounded flex items-center gap-2 bg-slate-50/50">
                  <Music className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[12px] font-bold text-slate-650 truncate font-mono">{selectedCalendarSchedule.mp3Url}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <span className="text-slate-400 uppercase font-bold block mb-0.5">Effective From</span>
                  <span className="font-mono text-slate-600 font-bold">{selectedCalendarSchedule.startDate || "Any Date"}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase font-bold block mb-0.5">Expiration Limit</span>
                  <span className="font-mono text-slate-600 font-bold">{selectedCalendarSchedule.endDate || "No Limit"}</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-150 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCalendarSchedule(null)}
                className="px-3.5 py-1.5 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 text-[12px] font-black uppercase tracking-tighter cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const s = selectedCalendarSchedule;
                  setSelectedCalendarSchedule(null);
                  startEdit(s);
                }}
                className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-black uppercase tracking-tighter flex items-center gap-1 cursor-pointer"
              >
                <FileText className="w-3 h-3" />
                <span>Edit Schedule</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
