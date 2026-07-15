import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { driveFileNameCache, availableFilesCache } from './driveService';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getMP3Status = (url: string | undefined) => {
  if (!url) return { exists: false, valid: false, filename: 'None selected' };
  
  // 1. Direct match by filename in availableFilesCache
  const fileInCache = availableFilesCache.get(url);
  if (fileInCache) {
    return {
      exists: true,
      valid: url.toLowerCase().endsWith('.mp3') || fileInCache.path.toLowerCase().split('?')[0].endsWith('.mp3') || true,
      filename: url
    };
  }

  // 2. Direct match by path/URL in availableFilesCache
  let isFromCache = false;
  let cachedFilename = '';
  for (const [name, info] of Array.from(availableFilesCache.entries())) {
    if (info.path === url) {
      isFromCache = true;
      cachedFilename = name;
      break;
    }
  }

  if (isFromCache) {
    return {
      exists: true,
      valid: cachedFilename.toLowerCase().endsWith('.mp3') || url.toLowerCase().split('?')[0].endsWith('.mp3') || true,
      filename: cachedFilename
    };
  }

  // Fallback to old URL-based lookup logic
  const cleanUrl = url.split('?')[0];
  let filename = cleanUrl.split('/').pop() || 'Unknown';
  
  const isDrive = url.includes('googleapis.com') || url.includes('drive.google.com') || url.includes('id=');
  const isLocal = url.includes('/api/stream-local');
  const isExternalWeb = (url.startsWith('http://') || url.startsWith('https://')) && !isLocal && !isDrive;
  
  if (driveFileNameCache.has(url)) {
    filename = driveFileNameCache.get(url)!;
  }
  
  const exists = driveFileNameCache.has(url) || isExternalWeb;
  const valid = cleanUrl.toLowerCase().endsWith('.mp3') || isDrive || isLocal || isExternalWeb || url.includes('alt=media') || url.includes('id=');
  
  return { exists, valid, filename };
};

export const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export function extractFolderId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const folderMatch = trimmed.match(/(?:folders\/|folders%2F|d\/|id=)([a-zA-Z0-9-_]{25,50})/i);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }
  return trimmed;
}

export const getFilenameFromUrlOrPath = (pathOrUrl: string | undefined): string => {
  if (!pathOrUrl) return '';
  
  // Try matching search from availableFilesCache path
  for (const [name, info] of Array.from(availableFilesCache.entries())) {
    if (info.path === pathOrUrl) {
      return name;
    }
  }
  
  // Try checking driveFileNameCache
  if (driveFileNameCache.has(pathOrUrl)) {
    return driveFileNameCache.get(pathOrUrl)!;
  }
  
  // Otherwise split by path separators and ignore query parameters
  const cleanUrl = pathOrUrl.split('?')[0];
  const lastPart = cleanUrl.split('/').pop()?.split('\\').pop();
  return lastPart || pathOrUrl;
};

export function parseCustomTimeText(text: string, baseDate: Date = new Date()): Date | null {
  if (!text) return null;
  const cleaned = text.trim();
  
  // 1. Check for AM/PM formats (e.g. "12:04:15 PM" or "12:04 PM")
  const ampmMatch = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampmMatch) {
    const d = new Date(baseDate);
    let hrs = parseInt(ampmMatch[1], 10);
    const mins = parseInt(ampmMatch[2], 10);
    const secs = ampmMatch[3] ? parseInt(ampmMatch[3], 10) : 0;
    const ampm = ampmMatch[4].toUpperCase();
    
    if (ampm === 'PM' && hrs < 12) hrs += 12;
    if (ampm === 'AM' && hrs === 12) hrs = 0;
    
    if (hrs >= 0 && hrs < 24 && mins >= 0 && mins < 60 && secs >= 0 && secs < 60) {
      d.setHours(hrs, mins, secs, 0);
      return d;
    }
  }
  
  // 2. Check for 24-hour format or plain time without AM/PM (e.g. "14:05:30" or "14:05")
  const plainMatch = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (plainMatch) {
    const d = new Date(baseDate);
    const hrs = parseInt(plainMatch[1], 10);
    const mins = parseInt(plainMatch[2], 10);
    const secs = plainMatch[3] ? parseInt(plainMatch[3], 10) : 0;
    
    if (hrs >= 0 && hrs < 24 && mins >= 0 && mins < 60 && secs >= 0 && secs < 60) {
      d.setHours(hrs, mins, secs, 0);
      return d;
    }
  }
  
  return null;
}

export function getParsedCustomTimeISO(customTime: string | undefined, baseDate: Date): string {
  if (!customTime) return baseDate.toISOString();
  const parsed = parseCustomTimeText(customTime, baseDate);
  return parsed ? parsed.toISOString() : baseDate.toISOString();
}

interface SimpleShow {
  day: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  startHour: number;
  startMinute: number;
  durationHours: number;
  durationMinutes: number;
  name: string;
}

export function isTimeInShow(
  show: SimpleShow,
  dayName: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday',
  hour: number,
  minute: number = 0
): boolean {
  const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const showDayIdx = daysOrder.indexOf(show.day);
  const targetDayIdx = daysOrder.indexOf(dayName);
  
  if (showDayIdx === -1 || targetDayIdx === -1) return false;
  
  const startMin = showDayIdx * 1440 + show.startHour * 60 + show.startMinute;
  const durationMin = show.durationHours * 60 + show.durationMinutes;
  const endMin = startMin + durationMin;
  
  const targetMin = targetDayIdx * 1440 + hour * 60 + minute;
  
  if (endMin <= 10080) {
    return targetMin >= startMin && targetMin < endMin;
  } else {
    // wraps around
    return targetMin >= startMin || targetMin < (endMin % 10080);
  }
}


