import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, FileText, Calendar, Clock, CheckCircle, AlertCircle, ShieldAlert, Copy, Check, XCircle, FolderOpen, Music, Search, Play, Square, ChevronUp, ChevronDown } from 'lucide-react';
import { Schedule, ScheduleType, ScheduleMetadata } from '../types';
import { cn, getMP3Status, formatDuration, getFilenameFromUrlOrPath } from '../lib/utils';
import { getPlayableUrl, DRIVE_FOLDERS } from '../lib/driveService';

// Pure-JS ID3v2 metadata parser supporting ID3v2.2, ID3v2.3 and ID3v2.4
async function readMp3ID3Metadata(url: string): Promise<{ title?: string; artist?: string; album?: string } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'Range': 'bytes=0-65535' // Request first 64KB only
      }
    });
    if (!response.ok && response.status !== 206) {
      const fallbackResponse = await fetch(url);
      if (!fallbackResponse.ok) return null;
      const buffer = await fallbackResponse.arrayBuffer();
      return parseID3Bytes(new Uint8Array(buffer));
    }
    const buffer = await response.arrayBuffer();
    return parseID3Bytes(new Uint8Array(buffer));
  } catch (err) {
    console.warn("Failed to fetch MP3 metadata:", err);
    return null;
  }
}

function parseID3Bytes(bytes: Uint8Array): { title?: string; artist?: string; album?: string } | null {
  if (bytes.length < 10) return null;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
  
  const majorVersion = bytes[3];
  if (majorVersion !== 3 && majorVersion !== 4 && majorVersion !== 2) {
    return null;
  }
  
  const tagSize = ((bytes[6] & 0x7f) << 21) |
                  ((bytes[7] & 0x7f) << 14) |
                  ((bytes[8] & 0x7f) << 7) |
                  (bytes[9] & 0x7f);
                  
  const limit = Math.min(bytes.length, tagSize + 10);
  let offset = 10;
  
  const result: { title?: string; artist?: string; album?: string } = {};
  
  const textDecode = (encoding: number, data: Uint8Array): string => {
    try {
      if (encoding === 0 || encoding === 3) {
        return new TextDecoder(encoding === 3 ? 'utf-8' : 'iso-8859-1').decode(data).replace(/\0+$/, '').trim();
      } else if (encoding === 1 || encoding === 2) {
        return new TextDecoder('utf-16').decode(data).replace(/\0+$/, '').trim();
      }
    } catch (e) {}
    return '';
  };
  
  if (majorVersion === 2) {
    while (offset + 6 < limit) {
      const frameId = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2]);
      const frameSize = (bytes[offset+3] << 16) | (bytes[offset+4] << 8) | bytes[offset+5];
      offset += 6;
      if (frameSize <= 0 || offset + frameSize > limit) break;
      
      const frameData = bytes.subarray(offset, offset + frameSize);
      if (frameId === "TT2" || frameId === "TP1" || frameId === "TAL") {
        const encoding = frameData[0];
        const text = textDecode(encoding, frameData.subarray(1));
        if (text) {
          if (frameId === "TT2") result.title = text;
          if (frameId === "TP1") result.artist = text;
          if (frameId === "TAL") result.album = text;
        }
      }
      offset += frameSize;
    }
  } else {
    while (offset + 10 < limit) {
      const frameId = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
      let frameSize = 0;
      if (majorVersion === 4) {
        frameSize = ((bytes[offset+4] & 0x7f) << 21) |
                    ((bytes[offset+5] & 0x7f) << 14) |
                    ((bytes[offset+6] & 0x7f) << 7) |
                    (bytes[offset+7] & 0x7f);
      } else {
        frameSize = (bytes[offset+4] << 24) |
                    (bytes[offset+5] << 16) |
                    (bytes[offset+6] << 8) |
                    bytes[offset+7];
      }
      offset += 10;
      if (frameSize <= 0 || offset + frameSize > limit) break;
      
      const frameData = bytes.subarray(offset, offset + frameSize);
      if (frameId === "TIT2" || frameId === "TPE1" || frameId === "TALB") {
        const encoding = frameData[0];
        const text = textDecode(encoding, frameData.subarray(1));
        if (text) {
          if (frameId === "TIT2") result.title = text;
          if (frameId === "TPE1") result.artist = text;
          if (frameId === "TALB") result.album = text;
        }
      }
      offset += frameSize;
    }
  }
  
  if (result.title || result.artist || result.album) {
    return result;
  }
  return null;
}

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
  const isNew = editingId ? !schedules.some(s => s.id === editingId) : false;
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scheduleFilterQuery, setScheduleFilterQuery] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Type-ahead states for MP3 selector
  const [mp3InputVal, setMp3InputVal] = useState('');
  const [originalMp3OnFocus, setOriginalMp3OnFocus] = useState('');
  const [isMp3Focused, setIsMp3Focused] = useState(false);

  // MP3 Metadata Cache and loader
  const [metadataCache, setMetadataCache] = useState<Record<string, { title?: string; artist?: string; album?: string }>>({});
  const [pickerDurations, setPickerDurations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isPickerOpen) return;
    
    const soundLibrary = driveMP3s;
    soundLibrary.forEach(file => {
      const filename = file.name;
      if (filename.toLowerCase().endsWith('.mp3') && !pickerDurations[filename]) {
        try {
          const playableUrl = getPlayableUrl(filename);
          if (playableUrl) {
            const audio = new Audio(playableUrl);
            const handleLoaded = () => {
              const d = audio.duration;
              if (!isNaN(d) && d > 0) {
                const formatted = formatDuration(d);
                setPickerDurations(prev => ({
                  ...prev,
                  [filename]: formatted
                }));
              }
            };
            audio.addEventListener('loadedmetadata', handleLoaded);
            audio.addEventListener('error', () => {});
          }
        } catch (e) {
          console.error("Failed to load metadata for " + filename, e);
        }
      }
    });
  }, [isPickerOpen, driveMP3s, pickerDurations]);

  useEffect(() => {
    if (!isPickerOpen) return;
    
    const soundLibrary = driveMP3s;
    soundLibrary.slice(0, 40).forEach(file => {
      let alreadyFetched = false;
      setMetadataCache(current => {
        if (current[file.name] !== undefined) {
          alreadyFetched = true;
        }
        return current;
      });
      
      if (alreadyFetched) return;

      setMetadataCache(prev => ({ ...prev, [file.name]: {} }));

      const playableUrl = getPlayableUrl(file.name);
      readMp3ID3Metadata(playableUrl).then(meta => {
        if (meta) {
          setMetadataCache(prev => ({ ...prev, [file.name]: meta }));
        }
      });
    });
  }, [isPickerOpen, driveMP3s, isDriveActive]);

  // States and helper for interactive clock-style dialing
  const [isDraggingClock, setIsDraggingClock] = useState(false);
  const handleClockInteraction = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    // If it is a touch event, prevent default scrolling to make dialing super smooth
    if (e.cancelable) {
      e.preventDefault();
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = clientX - centerX;
    const y = clientY - centerY;
    
    let angleDegrees = Math.atan2(y, x) * (180 / Math.PI);
    let adjustedAngle = angleDegrees + 90;
    if (adjustedAngle < 0) {
      adjustedAngle += 360;
    }
    
    let minute = Math.round(adjustedAngle / 6);
    if (minute >= 60) minute = 0;
    
    setFormData(prev => ({ ...prev, minute }));
  };

  // Synchronize type-ahead input value when formData.mp3Url changes
  useEffect(() => {
    setMp3InputVal(formData.mp3Url || '');
  }, [formData.mp3Url]);

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

  const formatMetadataDate = (dString: string | Date | undefined) => {
    if (!dString) return "N/A";
    try {
      const d = new Date(dString);
      if (isNaN(d.getTime())) return "N/A";
      const year = d.getFullYear();
      const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const mss = monthShorts[d.getMonth()] || 'JUN';
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${mss}-${day} ${hh}:${mm}`;
    } catch {
      return "N/A";
    }
  };

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
  const filteredFiles = soundLibrary.filter(f => {
    const nameLower = f.name.toLowerCase();
    
    // Filter by type
    if (formData.assetType === 'script') {
      const allowed = ['.txt', '.pdf', '.png', '.jpg', '.jpeg'];
      if (!allowed.some(ext => nameLower.endsWith(ext))) return false;
    } else {
      // default: audio
      if (!nameLower.endsWith('.mp3')) return false;
    }
    
    return nameLower.includes(searchQuery.toLowerCase());
  });

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

    return "Open for details";
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
      // Apply basic text filter search
      if (scheduleFilterQuery) {
        const q = scheduleFilterQuery.toLowerCase();
        const summaryText = getScheduleSummary(s).toLowerCase();
        const playModeText = (s.type === ScheduleType.ONE_TIME ? "One-Time" : s.type === ScheduleType.BASIC_HOURLY ? "Hourly" : "Advanced").toLowerCase();
        const matchesQuery = s.name.toLowerCase().includes(q) || 
                             (s.mp3Url && s.mp3Url.toLowerCase().includes(q)) ||
                             playModeText.includes(q) ||
                             summaryText.includes(q);
        if (!matchesQuery) return false;
      }

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
    }).sort((a, b) => a.minute - b.minute);
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
            
            <div className="flex gap-2.5 items-center">
              <div className="relative w-48 sm:w-56 shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Filter schedules..." 
                  value={scheduleFilterQuery}
                  onChange={e => setScheduleFilterQuery(e.target.value)}
                  className="w-full pl-8 pr-6 py-1 bg-white border border-slate-350 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans text-slate-850 placeholder-slate-450 h-8"
                />
                {scheduleFilterQuery && (
                  <button 
                    onClick={() => setScheduleFilterQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
                    title="Clear filter"
                  >
                    ×
                  </button>
                )}
              </div>
              <button 
                onClick={createNew}
                className="p-1.5 px-4 bg-blue-600 text-white rounded text-[12px] font-black tracking-tighter shadow-sm hover:bg-blue-700 transition-colors uppercase cursor-pointer h-8 border border-blue-700"
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
                {/* Scrollable list of hours */}
                <div className="overflow-y-auto flex-1 custom-scrollbar min-h-0 flex flex-col">
                  {/* Header row (Static outside of the scrollable viewport, matching log grid layout) */}
                  <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] bg-slate-100 border-b border-slate-250 select-none text-[14px] font-black text-slate-500 uppercase tracking-tighter shrink-0 shadow-sm sticky top-0 z-20">
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
                  {Array.from({ length: 24 }).map((_, h) => h)
                    .filter(h => selectedHours.includes(h))
                    .map((hour) => {
                      return (
                      <div key={hour} className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-slate-150 last:border-b-0 hover:bg-slate-50/10 transition-colors">
                        {/* Hour column */}
                        <div className={cn(
                          "border-r border-slate-200 flex items-center justify-center bg-slate-50/50 select-none font-black font-mono text-slate-455 uppercase shrink-0",
                          calendarLayoutMode === 'compact'
                            ? "p-1 px-0.5 text-[12px] min-h-[26px]"
                            : "p-1.5 px-0.5 text-[14px]"
                        )}>
                          {hour.toString().padStart(2, '0')}:00
                        </div>

                        {/* Day slots */}
                        {getWeekDays(calendarDate).map((day, dayIdx) => {
                          const cellSchedules = getSchedulesForDateTime(day, hour);
                          return (
                            <div 
                              key={dayIdx} 
                              className={cn(
                                "p-1 border-r border-slate-205 last:border-r-0 h-auto overflow-visible justify-start",
                                calendarLayoutMode === 'compact' 
                                  ? "min-h-[26px] flex flex-row flex-wrap gap-[1px] items-start content-start animate-fade-in" 
                                  : "min-h-[28px] flex flex-col gap-1"
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
                                        "inline-flex items-center justify-center p-0.5 px-0.5 rounded font-mono text-[12px] font-black leading-none shadow-sm border cursor-pointer select-none shrink-0 transition-all hover:scale-105",
                                        !s.enabled 
                                          ? "bg-slate-100 text-slate-400 border-grid-inactive line-through" 
                                          : s.type === ScheduleType.ONE_TIME 
                                            ? "bg-purple-100 text-purple-700 border-grid-onetime font-extrabold" 
                                            : s.type === ScheduleType.BASIC_HOURLY 
                                              ? "bg-blue-100 text-blue-700 border-grid-hourly" 
                                              : "bg-orange-100 text-orange-700 border-grid-advanced"
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
                                        ? "bg-slate-105 text-slate-400 border-grid-inactive line-through" 
                                        : s.type === ScheduleType.ONE_TIME 
                                          ? "bg-purple-50 text-purple-700 border-grid-onetime font-bold" 
                                          : s.type === ScheduleType.BASIC_HOURLY 
                                            ? "bg-blue-50 text-blue-700 border-grid-hourly" 
                                            : "bg-orange-50 text-orange-700 border-grid-advanced"
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
                <div className="h-px bg-green-300 flex-1"></div>
                <span className="text-[12px] font-black text-green-700 uppercase tracking-widest leading-none">Active Schedules</span>
                <div className="h-px bg-green-300 flex-1"></div>
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
                  
                  // Apply active basic search filter
                  if (scheduleFilterQuery) {
                    const q = scheduleFilterQuery.toLowerCase();
                    const summaryText = getScheduleSummary(s).toLowerCase();
                    const playModeText = (s.type === ScheduleType.ONE_TIME ? "One-Time" : s.type === ScheduleType.BASIC_HOURLY ? "Hourly" : "Advanced").toLowerCase();
                    const matchesFilter = s.name.toLowerCase().includes(q) || 
                                          (s.mp3Url && s.mp3Url.toLowerCase().includes(q)) || 
                                          playModeText.includes(q) || 
                                          summaryText.includes(q);
                    return s.enabled && !isExpired && matchesFilter;
                  }
                  
                  return s.enabled && !isExpired;
                });

                if (activeOnes.length === 0) {
                  return (
                    <div className="py-8 text-center bg-slate-50/50 rounded-lg border border-dashed border-slate-350">
                      <p className="text-[12px] font-bold text-slate-450 uppercase tracking-widest leading-none">No active triggers</p>
                    </div>
                  );
                }

                return (
                  <div className="border border-grid-active rounded-lg overflow-hidden divide-y divide-grid-active bg-white shadow-sm">
                    {activeOnes
                      .sort((a, b) => a.minute - b.minute)
                      .map((s, idx) => (
                        <div 
                          key={s.id}
                          onClick={() => startEdit(s)}
                          className={cn(
                            "transition-all cursor-pointer group relative flex items-stretch min-h-[64px]",
                            idx % 2 === 0 ? "bg-white" : "bg-slate-205"
                          )}
                        >
                          {/* Left: clock dial, spanning the entire card height, no pixel gap, high contrast lines */}
                          <div className="shrink-0 flex items-center justify-center p-1 bg-slate-50 border-r border-grid-active w-[64px] select-none">
                            <svg
                              width="56"
                              height="56"
                              viewBox="0 0 80 80"
                              className="w-[52px] h-[52px] select-none"
                            >
                              <circle 
                                cx="40" 
                                cy="40" 
                                r="37" 
                                className="fill-white stroke-slate-350 stroke-[2]" 
                              />
                              <text x="40" y="21" textAnchor="middle" className="text-[17px] font-black fill-slate-500">0</text>
                              <text x="66" y="45" textAnchor="middle" className="text-[12px] font-bold fill-slate-450">15</text>
                              <text x="40" y="69" textAnchor="middle" className="text-[12px] font-bold fill-slate-450">30</text>
                              <text x="14" y="45" textAnchor="middle" className="text-[12px] font-bold fill-slate-450">45</text>
                              {Array.from({ length: 12 }).map((_, ticksIdx) => {
                                const angle = ticksIdx * 30;
                                if (ticksIdx % 3 === 0) return null;
                                return (
                                  <line
                                    key={ticksIdx}
                                    x1="40"
                                    y1="5"
                                    x2="40"
                                    y2="9"
                                    transform={`rotate(${angle}, 40, 40)`}
                                    className="stroke-slate-300 stroke-[2]"
                                  />
                                );
                              })}
                              <line
                                x1="40"
                                y1="40"
                                x2="40"
                                y2="11"
                                transform={`rotate(${(s.minute || 0) * 6}, 40, 40)`}
                                  stroke="#2563eb"
                                strokeWidth="4"
                                strokeLinecap="round"
                              />
                              <circle cx="40" cy="40" r="5" className="fill-slate-800" />
                              <circle cx="40" cy="40" r="1.5" className="fill-white" />
                            </svg>
                          </div>

                          {/* Right: details area with comfortable inner padding */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between py-2 pr-3 pl-3.5">
                            {/* Title of schedule first, category tag on the right attached to details tag */}
                            <div className="flex justify-between items-center mb-1 gap-2">
                              <span className="text-[18px] font-black text-slate-800 truncate leading-none">
                                {s.name}
                              </span>
                              <div className="text-[14px] font-bold uppercase tracking-tighter shrink-0 text-right flex items-center gap-1.5 leading-none">
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-[12px] uppercase font-bold tracking-tighter leading-none inline-block border border-slate-300",
                                  s.type === ScheduleType.ONE_TIME ? "bg-purple-100 text-purple-700 font-black border-purple-300" :
                                  s.type === ScheduleType.BASIC_HOURLY ? "bg-blue-100 text-blue-700 border-blue-200" :
                                  "bg-orange-100 text-orange-700 border-orange-200"
                                )}>
                                  {s.type === ScheduleType.ONE_TIME ? "One-Time" : s.type === ScheduleType.BASIC_HOURLY ? "Hourly" : "Advanced"}
                                </span>
                                <span className="text-slate-550 font-bold">
                                  {getScheduleSummary(s)}
                                </span>
                              </div>
                            </div>

                            {/* Bottom Row of metadata & view actions */}
                            <div className="flex justify-between items-center gap-4">
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="flex items-center gap-1.5 text-[14px] text-slate-500 font-bold uppercase tracking-tighter">
                                  <span>:{s.minute.toString().padStart(2, '0')}m</span>
                                </div>

                                <div className="flex items-center gap-1.5 underline-offset-4">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(s);
                                    }}
                                    className="flex items-center gap-1 py-0.5 px-2 hover:bg-blue-600 hover:text-white bg-white border border-blue-300 rounded text-blue-700 transition-all shadow-sm group/btn cursor-pointer"
                                    title="View or Edit Schedule"
                                  >
                                    <FileText className="w-2.5 h-2.5" />
                                    <span className="text-[14px] font-black uppercase">View/Edit</span>
                                  </button>
                                  <button 
                                    onClick={(e) => duplicate(s, e)}
                                    className="flex items-center gap-1 py-0.5 px-2 hover:bg-blue-50 bg-white border border-slate-350 rounded text-blue-700 transition-all shadow-sm cursor-pointer"
                                    title="Copy Schedule"
                                  >
                                    <Copy className="w-2.5 h-2.5" />
                                    <span className="text-[14px] font-black uppercase">Copy</span>
                                  </button>
                                </div>
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
                                         "flex items-center gap-2 py-0.5 px-3 rounded border shadow-sm transition-all group/play min-w-0 cursor-pointer w-full justify-start",
                                         previewUrl === s.mp3Url 
                                           ? "bg-slate-900 text-white border-slate-900" 
                                           : isVerified
                                             ? "bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                                             : "bg-slate-50 text-slate-400 border-slate-300 cursor-not-allowed"
                                       )}
                                     >
                                       <div className="flex items-center gap-1.5 min-w-0 overflow-hidden flex-1 text-left order-3">
                                         <Music className={cn(
                                           "w-2.5 h-2.5 shrink-0", 
                                           previewUrl === s.mp3Url ? "text-slate-400" : 
                                           isVerified ? "text-slate-400 group-hover/play:text-blue-500" : "text-slate-300"
                                         )} />
                                         <span className={cn(
                                           "text-[14px] font-bold uppercase truncate",
                                           previewUrl === s.mp3Url ? "text-white" :
                                           !status.exists ? "text-red-600 font-extrabold" : !status.valid && s.assetType !== 'script' ? "text-orange-600 font-extrabold" : "text-slate-600 group-hover/play:text-blue-800"
                                         )}>
                                           {!status.exists ? "File not found." : !status.valid && s.assetType !== 'script' ? "File not mp3." : status.filename}
                                         </span>
                                       </div>

                                       <div className={cn(
                                         "h-3 w-px shrink-0 mx-0.5",
                                         previewUrl === s.mp3Url ? "bg-slate-700" : isVerified ? "bg-slate-300 group-hover/play:bg-blue-300" : "bg-slate-300"
                                       )} />

                                       <div className="flex items-center gap-1.5 shrink-0 order-[-1]">
                                         {previewUrl === s.mp3Url ? (
                                           <Square className="w-2.5 h-2.5 fill-current" />
                                         ) : isVerified ? (
                                           <Play className="w-2.5 h-2.5 fill-current" />
                                         ) : (
                                           <XCircle className="w-2.5 h-2.5" />
                                         )}
                                         <span className="text-[14px] font-black uppercase whitespace-nowrap">
                                           {previewUrl === s.mp3Url ? 'Stop' : isVerified ? 'Preview' : 'Locked'}
                                         </span>
                                       </div>
                                     </button>
                                   </div>
                                 );
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                );
              })()}
            </div>

            {/* Inactive Schedules Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px bg-slate-300 flex-1"></div>
                <span className="text-[12px] font-black text-slate-600 uppercase tracking-widest leading-none">Inactive Schedules</span>
                <div className="h-px bg-slate-300 flex-1"></div>
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

                  // Apply basic text filter search
                  if (scheduleFilterQuery) {
                    const q = scheduleFilterQuery.toLowerCase();
                    const summaryText = getScheduleSummary(s).toLowerCase();
                    const playModeText = (s.type === ScheduleType.ONE_TIME ? "One-Time" : s.type === ScheduleType.BASIC_HOURLY ? "Hourly" : "Advanced").toLowerCase();
                    const matchesFilter = s.name.toLowerCase().includes(q) || 
                                          (s.mp3Url && s.mp3Url.toLowerCase().includes(q)) || 
                                          playModeText.includes(q) || 
                                          summaryText.includes(q);
                    return (!s.enabled || isExpired) && matchesFilter;
                  }

                  return !s.enabled || isExpired;
                });

                if (inactiveOnes.length === 0) {
                  return (
                    <div className="py-4 text-center">
                      <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">No inactive items</p>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col gap-2">
                    <div className="border border-grid-inactive rounded-lg overflow-hidden divide-y divide-grid-inactive bg-slate-50/10 shadow-sm">
                      {inactiveOnes
                        .sort((a, b) => parseInt(b.id) - parseInt(a.id))
                        .slice(0, 5)
                        .map((s, idx) => {
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
                                "transition-all cursor-pointer group relative flex items-stretch min-h-[64px]",
                                idx % 2 === 0 ? "bg-white" : "bg-slate-205"
                              )}
                            >
                              {/* Left: Clock Dial Pointer, no pixel gap, increased line contrast */}
                              <div className="shrink-0 flex items-center justify-center p-1 bg-slate-100/55 border-r border-grid-inactive w-[64px] select-none">
                                <svg
                                  width="56"
                                  height="56"
                                  viewBox="0 0 80 80"
                                  className="w-[52px] h-[52px] select-none opacity-80"
                                >
                                  <circle 
                                    cx="40" 
                                    cy="40" 
                                    r="37" 
                                    className="fill-white stroke-slate-350 stroke-[2]" 
                                  />
                                  <text x="40" y="21" textAnchor="middle" className="text-[17px] font-black fill-slate-400">0</text>
                                  <text x="66" y="45" textAnchor="middle" className="text-[12px] font-bold fill-slate-355">15</text>
                                  <text x="40" y="69" textAnchor="middle" className="text-[12px] font-bold fill-slate-355">30</text>
                                  <text x="14" y="45" textAnchor="middle" className="text-[12px] font-bold fill-slate-355">45</text>
                                  {Array.from({ length: 12 }).map((_, ticksIdx) => {
                                    const angle = ticksIdx * 30;
                                    if (ticksIdx % 3 === 0) return null;
                                    return (
                                      <line
                                        key={ticksIdx}
                                        x1="40"
                                        y1="5"
                                        x2="40"
                                        y2="9"
                                        transform={`rotate(${angle}, 40, 40)`}
                                        className="stroke-slate-250 stroke-[2]"
                                      />
                                    );
                                  })}
                                  <line
                                    x1="40"
                                    y1="40"
                                    x2="40"
                                    y2="11"
                                    transform={`rotate(${(s.minute || 0) * 6}, 40, 40)`}
                                    stroke="#475569"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                  />
                                  <circle cx="40" cy="40" r="5" className="fill-slate-600" />
                                  <circle cx="40" cy="40" r="1.5" className="fill-white" />
                                </svg>
                              </div>

                              {/* Right: details area with comfortable inner padding */}
                              <div className="flex-1 min-w-0 flex flex-col justify-between py-2 pr-3 pl-3.5 opacity-90">
                                {/* Title of schedule first, category tag on the right attached to details tag */}
                                <div className="flex justify-between items-center mb-1 gap-2">
                                  <span className="text-[18px] font-black text-slate-750 truncate leading-none">
                                    {s.name}
                                  </span>
                                  <div className="text-[14px] font-bold uppercase tracking-tighter shrink-0 text-right flex items-center gap-1.5 leading-none">
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded text-[12px] uppercase font-bold tracking-tighter leading-none inline-block opacity-75 border border-slate-300",
                                      s.type === ScheduleType.ONE_TIME ? "bg-purple-100 text-purple-700 font-black border-purple-200" :
                                      s.type === ScheduleType.BASIC_HOURLY ? "bg-blue-100 text-blue-700 border-blue-200" :
                                      "bg-orange-100 text-orange-700 border-orange-200"
                                    )}>
                                      {s.type === ScheduleType.ONE_TIME ? "One-Time" : s.type === ScheduleType.BASIC_HOURLY ? "Hourly" : "Advanced"}
                                    </span>
                                    <span className="text-slate-500 font-bold">
                                      {getScheduleSummary(s)} • {isExpired ? <span className="text-red-650 font-black">EXPIRED</span> : 'SUSPENDED'}
                                    </span>
                                  </div>
                                </div>

                                {/* Bottom row of metadata & view actions */}
                                <div className="flex justify-between items-center gap-4">
                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="flex items-center gap-1.5 text-[14px] text-slate-500 font-bold uppercase tracking-tighter">
                                      <span>:{s.minute.toString().padStart(2, '0')}m</span>
                                    </div>

                                    <div className="flex items-center gap-1.5 underline-offset-4">
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          startEdit(s);
                                        }}
                                        className="flex items-center gap-1 py-0.5 px-2 hover:bg-slate-300 bg-white border border-slate-350 rounded text-slate-700 transition-all shadow-sm cursor-pointer"
                                        title="View or Edit Schedule"
                                      >
                                        <FileText className="w-2.5 h-2.5" />
                                        <span className="text-[14px] font-black uppercase">View/Edit</span>
                                      </button>
                                      <button 
                                        onClick={(e) => duplicate(s, e)}
                                        className="flex items-center gap-1 py-0.5 px-2 hover:bg-white bg-slate-100/50 border border-slate-350 rounded text-slate-700 transition-all shadow-sm cursor-pointer"
                                        title="Copy Schedule"
                                      >
                                        <Copy className="w-2.5 h-2.5" />
                                        <span className="text-[14px] font-black uppercase">Copy</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* MP3 Status Info Inactive */}
                                  {(() => {
                                    const status = getMP3Status(s.mp3Url);
                                    const isVerified = status.exists && status.valid;
                                    return (
                                      <div className="flex items-center gap-1.5 overflow-hidden text-right justify-end flex-1 opacity-90">
                                        <button 
                                          onClick={(e) => isVerified ? togglePreview(s.mp3Url, e) : e.stopPropagation()}
                                          disabled={!isVerified}
                                          className={cn(
                                            "flex items-center gap-2 py-0.5 px-3 rounded border shadow-sm transition-all group/play min-w-0 cursor-pointer w-full justify-start",
                                            previewUrl === s.mp3Url 
                                              ? "bg-slate-900 text-white border-slate-900 opacity-100" 
                                              : isVerified
                                                ? "bg-white text-slate-700 border-slate-350 hover:bg-slate-50"
                                                : "bg-slate-50 text-slate-400 border-slate-300 cursor-not-allowed"
                                          )}
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden font-bold flex-1 text-left order-3">
                                            <Music className={cn(
                                              "w-2.5 h-2.5 shrink-0", 
                                              previewUrl === s.mp3Url ? "text-slate-400" : 
                                              isVerified ? "text-slate-450 group-hover/play:text-slate-600" : "text-slate-300"
                                            )} />
                                            <span className={cn(
                                              "text-[14px] font-bold uppercase truncate",
                                              previewUrl === s.mp3Url ? "text-white" :
                                              !status.exists ? "text-red-600 font-extrabold" : !status.valid && s.assetType !== 'script' ? "text-orange-600 font-extrabold" : "text-slate-600 group-hover/play:text-slate-800"
                                            )}>
                                              {!status.exists ? "File not found." : !status.valid && s.assetType !== 'script' ? "File not mp3." : status.filename}
                                            </span>
                                          </div>

                                          <div className={cn(
                                            "h-3 w-px shrink-0 mx-0.5",
                                            previewUrl === s.mp3Url ? "bg-slate-700" : isVerified ? "bg-slate-300 group-hover/play:bg-slate-400" : "bg-slate-350"
                                          )} />

                                          <div className="flex items-center gap-1.5 shrink-0 order-[-1]">
                                            {previewUrl === s.mp3Url ? (
                                              <Square className="w-2.5 h-2.5 fill-current" />
                                            ) : isVerified ? (
                                              <Play className="w-2.5 h-2.5 fill-current" />
                                            ) : (
                                              <XCircle className="w-2.5 h-2.5" />
                                            )}
                                            <span className="text-[14px] font-black uppercase whitespace-nowrap">
                                              {previewUrl === s.mp3Url ? 'Stop' : isVerified ? 'Preview' : 'Locked'}
                                            </span>
                                          </div>
                                        </button>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    {inactiveOnes.length > 5 && (
                      <p className="text-[12px] text-center text-slate-400 font-bold uppercase tracking-tighter pt-1">
                        + {inactiveOnes.length - 5} more hidden inactive items
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
          )}
        </div>
      ) : (
        <div className={cn(
          "bg-white rounded-lg border border-slate-300 flex flex-col h-full overflow-hidden shadow-md transition-all duration-300",
          !formData.enabled && "bg-orange-50/40 border-orange-500 border-2 shadow-[0_0_12px_rgba(249,115,22,0.15)] ring-1 ring-orange-500"
        )}>
          <div className="p-4 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Basic Info */}
              <div className="space-y-4 md:sticky md:top-0 md:self-start">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  {/* Spanning clock dial inside basic info (Moved to left) */}
                  <div className="sm:col-span-5 md:col-span-4 flex items-center justify-center select-none">
                    <div className="flex flex-col items-center justify-center p-[1px] bg-slate-50 border border-slate-200/80 rounded-xl shadow-xs hover:bg-slate-100/50 transition-colors w-[114px] h-[114px] shrink-0">
                      <svg
                        width="120"
                        height="120"
                        viewBox="0 0 80 80"
                        className="cursor-pointer select-none active:brightness-95 transition-all w-[112px] h-[112px]"
                        onMouseDown={e => {
                          setIsDraggingClock(true);
                          handleClockInteraction(e);
                        }}
                        onMouseMove={e => {
                          if (isDraggingClock) {
                            handleClockInteraction(e);
                          }
                        }}
                        onMouseUp={() => setIsDraggingClock(false)}
                        onMouseLeave={() => setIsDraggingClock(false)}
                        onTouchStart={e => {
                          setIsDraggingClock(true);
                          handleClockInteraction(e);
                        }}
                        onTouchMove={e => {
                          if (isDraggingClock) {
                            handleClockInteraction(e);
                          }
                        }}
                        onTouchEnd={() => setIsDraggingClock(false)}
                      >
                      {/* Clock Face base */}
                      <circle 
                        cx="40" 
                        cy="40" 
                        r="38" 
                        className={cn(
                          "fill-white stroke-slate-200 stroke-[2]",
                          isDraggingClock && "stroke-blue-500 stroke-[2.5]"
                        )} 
                      />
                      
                      {/* Main numbers for orientation */}
                      <text x="40" y="18" textAnchor="middle" className={cn("text-[13px] font-black fill-slate-400 select-none", isDraggingClock && "fill-slate-600")}>0</text>
                      <text x="67" y="44" textAnchor="middle" className="text-[10px] font-bold fill-slate-350 select-none">15</text>
                      <text x="40" y="71" textAnchor="middle" className="text-[10px] font-bold fill-slate-350 select-none">30</text>
                      <text x="13" y="44" textAnchor="middle" className="text-[10px] font-bold fill-slate-350 select-none">45</text>
                      
                      {/* 5-minute ticks */}
                      {Array.from({ length: 12 }).map((_, idx) => {
                        const angle = idx * 30;
                        if (idx % 3 === 0) return null;
                        return (
                          <line
                            key={idx}
                            x1="40"
                            y1="5"
                            x2="40"
                            y2="8"
                            transform={`rotate(${angle}, 40, 40)`}
                            className={cn(
                              "stroke-slate-300 stroke-[2]",
                              isDraggingClock && "stroke-slate-400"
                            )}
                          />
                        );
                      })}
                      
                      {/* Moving minute hand */}
                      <line
                        x1="40"
                        y1="40"
                        x2="40"
                        y2="10"
                        transform={`rotate(${(formData.minute || 0) * 6}, 40, 40)`}
                        stroke={isDraggingClock ? "#1e3a8a" : "#2563eb"}
                        strokeWidth={isDraggingClock ? 5 : 3.5}
                        strokeLinecap="round"
                      />
                      
                      {/* Center cap */}
                      <circle cx="40" cy="40" r="4.5" className={cn("fill-slate-800", isDraggingClock && "fill-slate-950")} />
                      <circle cx="40" cy="40" r="1.5" className="fill-white" />
                      </svg>
                    </div>
                  </div>

                  {/* Fields Block (Moved to right) */}
                  <div className="sm:col-span-7 md:col-span-8 flex flex-col justify-start gap-2">
                    {/* Horizontal row aligning Editor Title/ID and Status/Buttons on Left */}
                    <div className="flex items-center gap-3 pb-1.5 border-b border-slate-300">
                      {/* Editor Header Indicator */}
                      <div className="bg-blue-600 p-1.5 rounded shrink-0 flex items-center justify-center w-8 h-8">
                        <FileText className="w-4 h-4 text-white" />
                      </div>
                      
                      <div className="flex items-center gap-6 min-w-0">
                        {/* Column 1: Editor/ID Label and ID Value */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[14px] font-black text-slate-700 uppercase tracking-widest select-none leading-none">Editor</span>
                          <p className="text-[14px] text-slate-400 font-black truncate leading-none mt-1 font-mono">
                            {editingId === 'new' ? 'New Profile' : `${formData.id}`}
                          </p>
                        </div>
                        
                        {/* Column 2: Status Label and Active/Suspended Buttons */}
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[12px] font-black text-slate-400 uppercase tracking-widest block select-none leading-none">Status</label>
                          <div className="flex items-center">
                            <div className="flex items-center -space-x-px shrink-0">
                              <button
                                type="button"
                                onClick={() => setFormData({...formData, enabled: true})}
                                className={cn(
                                  "px-2 py-0.5 text-[13px] font-black uppercase transition-all select-none cursor-pointer rounded-l rounded-r-none h-6 flex items-center justify-center leading-none border",
                                  formData.enabled 
                                    ? "bg-emerald-600 border-emerald-600 text-white shadow-xs z-10" 
                                    : "bg-slate-50 border-slate-300 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                )}
                              >
                                Active
                              </button>
                              <button
                                type="button"
                                onClick={() => setFormData({...formData, enabled: false})}
                                className={cn(
                                  "px-2 py-0.5 text-[13px] font-black uppercase transition-all select-none cursor-pointer rounded-r rounded-l-none h-6 flex items-center justify-center leading-none border",
                                  !formData.enabled 
                                    ? "bg-orange-600 border-orange-600 text-white shadow-xs z-10" 
                                    : "bg-slate-50 border-slate-300 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                )}
                              >
                                Suspended
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Type, Play Time, and Asset Type rows */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Asset Type */}
                      <div className="space-y-1">
                        <label className="text-[14px]/none font-black text-slate-400 uppercase tracking-widest block select-none">Asset Type</label>
                        <div className="flex items-center -space-x-px shrink-0 w-full">
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, assetType: 'audio'})}
                            className={cn(
                              "px-2 py-0.5 text-[13px] font-black uppercase transition-all select-none cursor-pointer rounded-l rounded-r-none h-10 flex-1 flex items-center justify-center leading-none border",
                              (formData.assetType || 'audio') === 'audio'
                                ? "bg-blue-600 border-blue-600 text-white shadow-xs z-10 font-black"
                                : "bg-white border-slate-300 text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                            )}
                          >
                            MP3 Audio
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, assetType: 'script'})}
                            className={cn(
                              "px-2 py-0.5 text-[13px] font-black uppercase transition-all select-none cursor-pointer rounded-r rounded-l-none h-10 flex-1 flex items-center justify-center leading-none border",
                              formData.assetType === 'script'
                                ? "bg-blue-600 border-blue-600 text-white shadow-xs z-10 font-black"
                                : "bg-white border-slate-300 text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                            )}
                          >
                            Live Read
                          </button>
                        </div>
                      </div>

                      {/* Schedule Type */}
                      <div className="space-y-1">
                        <label className="text-[14px]/none font-black text-slate-400 uppercase tracking-widest block select-none">type</label>
                        {!isNew ? (
                          <div className="px-3 py-2 rounded-lg border border-slate-350 bg-slate-50 text-[14px] font-bold text-slate-700 w-full select-none h-10 flex items-center shadow-xs">
                            {formData.type === ScheduleType.ONE_TIME && "One-Time Play"}
                            {formData.type === ScheduleType.BASIC_HOURLY && "Repeating Hourly"}
                            {formData.type === ScheduleType.ADVANCED && "Advanced Calendar"}
                          </div>
                        ) : (
                          <select 
                            value={formData.type} 
                            onChange={e => setFormData({...formData, type: e.target.value as ScheduleType})}
                            className="px-3 py-2 rounded-lg border text-[14px] font-black outline-none transition-all w-full bg-white border-slate-350 text-slate-700 hover:border-blue-400 cursor-pointer h-10 shadow-xs"
                          >
                            <option value={ScheduleType.ONE_TIME}>One-Time Play</option>
                            <option value={ScheduleType.BASIC_HOURLY}>Repeating Hourly</option>
                            <option value={ScheduleType.ADVANCED}>Advanced Calendar</option>
                          </select>
                        )}
                      </div>

                      {/* Play Time */}
                      <div className="space-y-1">
                        <label className="text-[14px]/none font-black text-slate-400 uppercase tracking-widest block select-none">Play Time</label>
                        <div className="flex items-center gap-2">
                          {/* Formatted numerical indicator - e.g. :15 m */}
                          <div className="relative w-16 shrink-0">
                            <input 
                              type="text"
                              value={`:${(formData.minute || 0).toString().padStart(2, '0')}`}
                              onChange={e => {
                                const clean = e.target.value.replace(/\D/g, '');
                                const parsed = parseInt(clean, 10);
                                const val = isNaN(parsed) ? 0 : Math.max(0, Math.min(59, parsed));
                                setFormData({...formData, minute: val});
                              }}
                              className="w-full text-center text-blue-600 bg-white pl-1 pr-5 py-1.5 border border-slate-350 rounded-lg font-black outline-none focus:ring-1 focus:ring-blue-500 text-[14px] h-10 shadow-xs"
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[12px] font-black text-slate-400 pointer-events-none select-none">m</span>
                          </div>

                          {/* Doubled Arrow Controls */}
                          <div className="flex flex-col -space-y-px shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const val = ((formData.minute || 0) + 1) % 65;
                                const wrapped = val >= 60 ? 0 : val;
                                setFormData({...formData, minute: wrapped});
                              }}
                              className="bg-slate-100 hover:bg-slate-200 border border-slate-350 rounded-t rounded-b-none text-slate-700 h-4 w-8 flex items-center justify-center cursor-pointer transition-colors active:bg-slate-300 shadow-xs"
                              title="Increase Minute"
                            >
                              <ChevronUp className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const val = ((formData.minute || 0) - 1 + 60) % 60;
                                setFormData({...formData, minute: val});
                              }}
                              className="bg-slate-100 hover:bg-slate-200 border border-slate-350 rounded-b rounded-t-none text-slate-700 h-4 w-8 flex items-center justify-center cursor-pointer transition-colors active:bg-slate-300 shadow-xs"
                              title="Decrease Minute"
                            >
                              <ChevronDown className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                            {/* Group Schedule Name and MP3 File Group to remove any whitespace/margin between them */}
                <div className="space-y-0">
                  {/* Schedule Name */}
                  <div className="space-y-0">
                    <div className="bg-blue-600 text-white text-[13px] font-black uppercase tracking-widest px-3 py-1.5 rounded-t-lg select-none">
                      Schedule Name
                    </div>
                    <input 
                      type="text" 
                      value={formData.name || ''} 
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="Identify the schedule..."
                      className={cn(
                        "w-full px-3 py-2 rounded-b-none border-x border-b border-t border-slate-350 text-[16px] font-black text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none",
                        !formData.name && editingId ? "border-red-400" : ""
                      )}
                    />
                    {!formData.name && <p className="text-[14px] text-red-500 font-bold uppercase tracking-tighter mt-1">Name is required</p>}
                  </div>

                  {/* MP3 File Group with Blue Header */}
                  <div className="space-y-0 mt-0">
                    <div className="bg-blue-600 text-white text-[13px] font-black uppercase tracking-widest px-3 py-1.5 rounded-t-none select-none">
                      {formData.assetType === 'script' ? 'Script / Image File' : 'MP3 File'}
                    </div>
                    <div className="p-3 bg-slate-50 border-x border-b border-slate-350 rounded-b-lg space-y-3 shadow-xs">
                      {/* MP3 Row */}
                      <div className="leading-tight select-none">
                        {formData.mp3Url ? (
                          <span className="text-[16px] font-mono font-bold text-slate-850 break-all" title={getFilenameFromUrlOrPath(formData.mp3Url)}>
                            {getFilenameFromUrlOrPath(formData.mp3Url)}
                            {formData.assetType !== 'script' && formData.duration && ` (${formData.duration})`}
                          </span>
                        ) : (
                          <span className="text-[16px] font-medium text-slate-400 italic">None Selected</span>
                        )}
                      </div>

                      {/* Display metadata inline underneath the filename if available */}
                      {formData.mp3Url && formData.assetType !== 'script' && (() => {
                        const filename = getFilenameFromUrlOrPath(formData.mp3Url);
                        const meta = metadataCache[filename];
                        if (meta && (meta.title || meta.artist || meta.album)) {
                          const parts = [meta.title, meta.artist, meta.album].filter(Boolean);
                          return (
                            <div className="text-[13px] text-slate-600 font-bold italic select-none">
                              Metadata: <span className="text-slate-800 font-semibold">{parts.join(", ")}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Actions Row */}
                      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-350">
                        <div className="flex items-center gap-2 min-w-0">
                          {formData.mp3Url ? (
                            <>
                              {(() => {
                                const status = getMP3Status(formData.mp3Url);
                                const isScript = formData.assetType === 'script';
                                const isVerified = status.exists && (isScript || status.valid);
                                return (
                                  <>
                                    {isVerified ? (
                                      <CheckCircle className="w-4 h-4 text-green-600 shrink-0" title={isScript ? "Script Verified" : "File Verified"} />
                                    ) : !status.exists ? (
                                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 animate-pulse" title="File not found" />
                                    ) : (
                                      <Music className="w-4 h-4 text-orange-400 shrink-0" title="File not mp3" />
                                    )}
                                    
                                    <div className="flex flex-wrap items-center gap-x-2 text-[14px]">
                                      {!status.exists && (
                                        <span className="font-black text-red-500 uppercase">
                                          File not found.
                                        </span>
                                      )}
                                      {!isScript && !status.valid && status.exists && (
                                        <span className="font-black text-orange-500 uppercase">
                                          File not mp3.
                                        </span>
                                      )}
                                      {isVerified && (
                                        <span className="font-black text-green-600 uppercase">
                                          {isScript ? "Script / Image Verified" : "File Verified"}
                                        </span>
                                      )}
                                    </div>

                                    {!isScript && isVerified && (
                                      <button
                                        type="button"
                                        onClick={() => togglePreview(formData.mp3Url)}
                                        className={cn(
                                          "flex items-center gap-1 text-[13px] font-black uppercase px-2.5 py-1 rounded border shadow-xs transition-all cursor-pointer select-none h-8",
                                          previewUrl === formData.mp3Url 
                                            ? "bg-slate-900 text-white border-slate-900" 
                                            : "bg-white text-blue-600 border-slate-300 hover:bg-slate-50"
                                        )}
                                      >
                                        {previewUrl === formData.mp3Url ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
                                        {previewUrl === formData.mp3Url ? 'Stop' : 'Preview'}
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                            </>
                          ) : (
                            <p className="text-[14px] text-slate-400 font-medium">
                              {formData.assetType === 'script' ? 'Please select a script/image file path from the library' : 'Please select an MP3 file path from the library'}
                            </p>
                          )}
                        </div>
                        
                        <button 
                          type="button"
                          onClick={() => setIsPickerOpen(true)}
                          className="px-3 py-1.5 bg-slate-900 border border-slate-900 hover:bg-slate-800 text-white rounded text-[13px] font-black uppercase flex items-center justify-center gap-2 transition-all shadow-sm shrink-0 cursor-pointer select-none h-8"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          Choose
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column: Date/Advanced Rules */}
              <div className="space-y-4 md:sticky md:top-0 md:self-start">
                {/* Copied Top Action Buttons */}
                <div className="flex items-center justify-end gap-2 pb-4 border-b border-slate-300 select-none">
                  <button 
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-350 rounded text-[14px] font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest transition-all cursor-pointer bg-white"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel
                  </button>

                  <button 
                    type="button"
                    onClick={saveEdit}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded text-[14px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md shadow-blue-100 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Save
                  </button>
                </div>

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
                            "w-full px-2 py-1.5 border rounded text-[14px] font-bold text-slate-850 outline-none [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer",
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
                    <div className="grid grid-cols-2 gap-3 pb-3 border-b border-blue-100/50">
                      <div className="space-y-1 text-left">
                        <label className="text-[12px] font-bold text-blue-400 uppercase">Effective Start</label>
                        <input 
                          type="date" 
                          value={formData.startDate || ''} 
                          onChange={e => setFormData({...formData, startDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-blue-200 rounded text-[14px] outline-none bg-white font-bold text-slate-850 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                        />
                      </div>
                      <div className="space-y-1 text-left">
                        <label className="text-[12px] font-bold text-blue-400 uppercase">Expiration Date</label>
                        <input 
                          type="date" 
                          value={formData.endDate || ''} 
                          onChange={e => setFormData({...formData, endDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-blue-200 rounded text-[14px] outline-none bg-white font-bold text-slate-850 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                        />
                        <p className="text-[12px] text-slate-400 font-bold uppercase tracking-tighter">* Blank = No stop date</p>
                      </div>
                    </div>

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
                  </div>
                )}

                {formData.type === ScheduleType.BASIC_HOURLY && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 flex flex-col items-center justify-center text-center space-y-4 min-h-[140px]">
                    <div className="w-full grid grid-cols-2 gap-3 pb-4 border-b border-blue-100/50">
                      <div className="space-y-1 text-left">
                        <label className="text-[12px] font-bold text-blue-400 uppercase">Effective Start</label>
                        <input 
                          type="date" 
                          value={formData.startDate || ''} 
                          onChange={e => setFormData({...formData, startDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-blue-200 rounded text-[14px] outline-none bg-white font-bold text-slate-850 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                        />
                      </div>
                      <div className="space-y-1 text-left">
                        <label className="text-[12px] font-bold text-blue-400 uppercase">Expiration Date</label>
                        <input 
                          type="date" 
                          value={formData.endDate || ''} 
                          onChange={e => setFormData({...formData, endDate: e.target.value})} 
                          className="w-full px-2 py-1 border border-blue-200 rounded text-[14px] outline-none bg-white font-bold text-slate-850 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:brightness-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                        />
                        <p className="text-[12px] text-slate-400 font-bold uppercase tracking-tighter">* Blank = No stop date</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center opacity-70">
                      <Clock className="w-6 h-6 text-blue-400 mb-2" />
                      <p className="text-[12px] text-blue-600 font-medium">Auto-repeat hourly trigger enabled.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
              <button 
                onClick={() => setDeleteConfirmId(editingId!)}
                className="flex items-center gap-2 px-4 py-2 border border-red-200 rounded text-[14px] font-black text-red-600 hover:bg-red-50 hover:border-red-300 uppercase tracking-widest transition-all cursor-pointer shadow-sm shadow-red-50 bg-white"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                Delete
              </button>

              {formData.metadata && (
                <div className="text-[12px] font-mono text-slate-400 text-center leading-tight">
                  <div>Created {formatMetadataDate(formData.metadata.createdDate)}</div>
                  <div>Modified {formatMetadataDate(formData.metadata.lastModifiedDate)}</div>
                </div>
              )}
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setEditingId(null)}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded text-[14px] font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest transition-all"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel
                </button>

                <button 
                  onClick={saveEdit}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded text-[14px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MP3 Picker Modal */}
      {isPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-4 justify-between">
              {/* Left Title block */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="bg-blue-600 p-2 rounded">
                  <FolderOpen className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-[14px] font-black text-slate-800 uppercase tracking-widest leading-none">
                    {formData.assetType === 'script' ? 'Select Script / Image' : 'Select Mp3'}
                  </h3>
                </div>
              </div>

              {/* Middle Search Bar - between Title and close x */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder={formData.assetType === 'script' ? "Search scripts & images..." : "Search mp3's..."}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[14px] font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans"
                />
              </div>

              {/* Right Exit X */}
              <button 
                type="button" 
                onClick={() => setIsPickerOpen(false)} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {filteredFiles.length > 0 ? filteredFiles.map((file, i) => {
                  const dispDuration = pickerDurations[file.name] || file.duration || '';
                  const isMp3 = file.name.toLowerCase().endsWith('.mp3');
                  const isScriptAsset = formData.assetType === 'script';
                  const showWarning = !isMp3 && !isScriptAsset;
                  return (
                    <div 
                      key={i}
                      className={cn(
                        "w-full text-left p-1.5 px-3 rounded-lg flex items-center transition-all border gap-3 duration-150 shadow-xs",
                        showWarning
                          ? "bg-orange-50/45 border-orange-200"
                          : i % 2 === 0
                            ? "bg-white border-slate-300/90 hover:border-blue-600 hover:bg-blue-50/40 hover:ring-1 hover:ring-blue-600/20 hover:shadow-md"
                            : "bg-slate-100 border-slate-300/90 hover:border-blue-600 hover:bg-blue-50/40 hover:ring-1 hover:ring-blue-600/20 hover:shadow-md"
                      )}
                    >
                      {/* Left: Move ONLY the Select button here */}
                      <div className="shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, mp3Url: file.name });
                            setIsPickerOpen(false);
                          }}
                          className="px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[12px] font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer flex items-center justify-center h-7 shrink-0 w-[64px]"
                        >
                          Select
                        </button>
                      </div>

                      {/* Middle: File description and meta info */}
                      <div className="min-w-0 flex-1 flex flex-col justify-center">
                        <div className="flex flex-wrap items-baseline gap-1.5 leading-tight">
                          <span className={cn(
                            "text-[14px] font-bold line-clamp-1 break-all",
                            showWarning ? "text-orange-700 font-black" : "text-slate-800"
                          )}>
                            {file.name}
                          </span>
                          
                          {/* Audio metadata duration logic - format same as on edit page */}
                          {!isScriptAsset && dispDuration && (
                            <span className="text-[12px] font-mono font-bold text-slate-400 whitespace-nowrap ml-1">
                              ({dispDuration})
                            </span>
                          )}
                        </div>

                        {/* Display ID3 Metadata and subtitles if cached */}
                        {!isScriptAsset && (() => {
                          const meta = metadataCache[file.name];
                          if (meta && (meta.title || meta.artist || meta.album)) {
                            const parts = [meta.title, meta.artist, meta.album].filter(Boolean);
                            return (
                              <p className="text-[12px] text-slate-500 italic font-medium leading-none mt-0.5">
                                {parts.join(", ")}
                              </p>
                            );
                          }
                          return null;
                        })()}

                        {showWarning && (
                          <span className="text-[12px] font-black text-orange-500 uppercase bg-orange-100 px-1.5 py-0.5 rounded inline-block mt-0.5 font-sans">No .mp3 extension</span>
                        )}
                        {!isMp3 && isScriptAsset && (
                          <span className="text-[12px] font-black text-blue-600 uppercase bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded inline-block mt-0.5 font-sans">Script / Image Asset</span>
                        )}
                      </div>

                      {/* Right: Leave the Preview on the right, aligned to the end of each row */}
                      <div className="shrink-0 flex items-center">
                        {file.name.toLowerCase().endsWith('.mp3') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePreview(file.name);
                            }}
                            className={cn(
                              "rounded text-[12px] font-bold uppercase tracking-wider transition-all border cursor-pointer flex items-center justify-center gap-1 h-7 w-[88px] shrink-0",
                              previewUrl === file.name 
                                ? "bg-slate-900 text-white border-slate-900" 
                                : "bg-white text-blue-600 border-blue-300 hover:bg-blue-50"
                            )}
                          >
                            {previewUrl === file.name ? (
                              <>
                                <Square className="w-2.5 h-2.5 fill-current" />
                                <span>Stop</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>Preview</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }) : (
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
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal Overlay */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-3">
              <div className="bg-red-600 p-2 rounded">
                <Trash2 className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-[14px] font-black text-red-800 uppercase tracking-widest">
                Delete Schedule?
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[14px] text-slate-650 font-bold leading-relaxed">
                This will permanently remove the schedule. If you want to keep it, but suspend it, cancel the delete and instead choose "suspend".
              </p>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 border border-slate-200 rounded text-[14px] font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteSchedule(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-[14px] font-black uppercase tracking-widest transition-all shadow-md shadow-red-100 cursor-pointer"
              >
                I understand, delete
              </button>
            </div>
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
