import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { driveFileNameCache, availableFilesCache, rawBlobCache, mp3MetadataCache, cacheMP3 } from './driveService';
import { Interstitial, TimeGatedMp3 } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getMP3Status = (url: string | undefined) => {
  if (!url) return { exists: false, valid: false, filename: 'None selected' };

  // 1. Direct match by raw url in availableFilesCache
  let fileInCache = availableFilesCache.get(url);

  // 2. Extract clean filename / decoded file parameter if url is a stream URL or path
  let cleanName = url;
  if (cleanName.includes('/api/media/stream')) {
    const parts = cleanName.split(/(?:file|path)=/);
    if (parts.length > 1) {
      cleanName = decodeURIComponent(parts[1].split('&')[0]);
    }
  }
  const baseName = cleanName.split('?')[0].split('/').pop() || cleanName;

  if (!fileInCache && availableFilesCache.has(cleanName)) {
    fileInCache = availableFilesCache.get(cleanName);
  }
  if (!fileInCache && availableFilesCache.has(baseName)) {
    fileInCache = availableFilesCache.get(baseName);
  }

  if (fileInCache) {
    return {
      exists: true,
      valid: true,
      filename: baseName || url
    };
  }

  // 3. Search availableFilesCache values and keys case-insensitively
  for (const [name, info] of Array.from(availableFilesCache.entries())) {
    if (
      info.path === url ||
      info.path === cleanName ||
      name.toLowerCase() === baseName.toLowerCase() ||
      name.toLowerCase() === cleanName.toLowerCase()
    ) {
      return {
        exists: true,
        valid: true,
        filename: name
      };
    }
  }

  // Fallback to driveFileNameCache or web/local URLs
  const cleanUrl = url.split('?')[0];
  let filename = baseName || cleanUrl.split('/').pop() || 'Unknown';
  
  const isDrive = url.includes('googleapis.com') || url.includes('drive.google.com') || url.includes('id=');
  const isLocal = url.includes('/api/media/stream');
  const isExternalWeb = (url.startsWith('http://') || url.startsWith('https://')) && !isLocal && !isDrive;
  
  if (driveFileNameCache.has(url)) {
    filename = driveFileNameCache.get(url)!;
  } else if (driveFileNameCache.has(baseName)) {
    filename = driveFileNameCache.get(baseName)!;
  }
  
  const exists = driveFileNameCache.has(url) || driveFileNameCache.has(baseName) || isExternalWeb || isLocal;
  const lower = cleanUrl.toLowerCase();
  const isAudio = lower.endsWith('.mp3');
  const isScript = lower.endsWith('.txt') || lower.endsWith('.pdf') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg');
  const valid = isAudio || isScript || isDrive || isLocal || isExternalWeb || url.includes('alt=media') || url.includes('id=');
  
  return { exists, valid, filename };
};

export const formatDuration = (seconds: number) => {
  const totalSec = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const formatTotalTrackTime = (seconds: number): string => {
  const totalSec = Math.max(0, Math.round(seconds));
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hrs > 0) parts.push(`${hrs}hr`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}min`);

  return parts.join(' ');
};

export interface Mp3ID3Metadata {
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  durationSeconds?: number;
}

export function parseID3v1Bytes(bytes: Uint8Array): Mp3ID3Metadata | null {
  if (bytes.length < 128) return null;
  const tagOffset = bytes.length - 128;
  if (bytes[tagOffset] === 0x54 && bytes[tagOffset + 1] === 0x41 && bytes[tagOffset + 2] === 0x47) { // "TAG"
    const decoder = new TextDecoder('iso-8859-1');
    const cleanStr = (buf: Uint8Array) => {
      const decoded = decoder.decode(buf);
      const nullIdx = decoded.indexOf('\0');
      const clean = nullIdx !== -1 ? decoded.substring(0, nullIdx) : decoded;
      return clean.trim();
    };

    const title = cleanStr(bytes.subarray(tagOffset + 3, tagOffset + 33));
    const artist = cleanStr(bytes.subarray(tagOffset + 33, tagOffset + 63));
    const album = cleanStr(bytes.subarray(tagOffset + 63, tagOffset + 93));

    if (title || artist || album) {
      return {
        title: title || undefined,
        artist: artist || undefined,
        albumArtist: artist || undefined,
        album: album || undefined
      };
    }
  }
  return null;
}

// Pure-JS ID3v2 & ID3v1 metadata parser

export async function readMp3ID3Metadata(url: string, authToken?: string): Promise<Mp3ID3Metadata | null> {
  try {
    // 1. Check if metadata is already cached in RAM
    if (mp3MetadataCache.has(url)) {
      return mp3MetadataCache.get(url)!;
    }

    // 2. If it's a local streamUrl endpoint, call server endpoint directly
    if (url.startsWith('/api/shows/playlist/stream-file')) {
      const query = url.substring(url.indexOf('?'));
      const metaRes = await fetch(`/api/shows/playlist/file-metadata${query}`);
      if (metaRes.ok) {
        const d = await metaRes.json();
        if (d.success && d.metadata) {
          const meta: Mp3ID3Metadata = {
            title: d.metadata.title,
            artist: d.metadata.artist,
            albumArtist: d.metadata.albumArtist || d.metadata.artist,
            album: d.metadata.album
          };
          mp3MetadataCache.set(url, meta);
          return meta;
        }
      }
    }

    // 3. If raw blob is already cached in RAM, parse it instantly with pure-JS ID3 parser
    const cachedBlob = rawBlobCache.get(url);
    if (cachedBlob) {
      try {
        const arrayBuf = await cachedBlob.arrayBuffer();
        const meta = parseID3Bytes(new Uint8Array(arrayBuf));
        if (meta && (meta.title || meta.artist || meta.albumArtist || meta.album)) {
          mp3MetadataCache.set(url, meta);
          return meta;
        }
      } catch (e) {}
    }

    // 4. For Google Drive or other web URLs, trigger cacheMP3 (which deduplicates fetches and extracts metadata from blob)
    const isDriveUrl = url.includes('googleapis.com/drive') || url.includes('drive.google.com');
    if (isDriveUrl && authToken) {
      await cacheMP3(url, authToken);
      if (mp3MetadataCache.has(url)) {
        return mp3MetadataCache.get(url)!;
      }
    }

    const headers: Record<string, string> = {};
    if (authToken && isDriveUrl) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Parse directly on fetch using pure-JS byte parser
    try {
      const response = await fetch(url, { headers });
      if (response.ok) {
        const blob = await response.blob();
        rawBlobCache.set(url, blob);
        const arrayBuf = await blob.arrayBuffer();
        const meta = parseID3Bytes(new Uint8Array(arrayBuf));
        if (meta && (meta.title || meta.artist || meta.albumArtist || meta.album)) {
          mp3MetadataCache.set(url, meta);
          return meta;
        }
      }
    } catch (e) {
      // Fallback to manual byte parsing
    }

    const rangeHeaders: Record<string, string> = {
      ...headers,
      'Range': 'bytes=0-65535' // Request first 64KB only
    };

    const response = await fetch(url, { headers: rangeHeaders });
    let buffer: ArrayBuffer;
    if (response.ok || response.status === 206) {
      buffer = await response.arrayBuffer();
    } else {
      const fallbackResponse = await fetch(url, { headers });
      if (!fallbackResponse.ok) return null;
      buffer = await fallbackResponse.arrayBuffer();
    }
    const bytes = new Uint8Array(buffer);
    const id3v2Meta = parseID3Bytes(bytes);

    if (id3v2Meta && id3v2Meta.title && id3v2Meta.artist) {
      mp3MetadataCache.set(url, id3v2Meta);
      return id3v2Meta;
    }

    // Try fetching last 128 bytes for ID3v1 fallback if ID3v2 is incomplete or missing
    try {
      const v1Headers: Record<string, string> = {
        ...headers,
        'Range': 'bytes=-128'
      };
      const v1Response = await fetch(url, { headers: v1Headers });
      if (v1Response.ok || v1Response.status === 206) {
        const v1Buffer = await v1Response.arrayBuffer();
        const v1Meta = parseID3v1Bytes(new Uint8Array(v1Buffer));
        if (v1Meta) {
          const combined: Mp3ID3Metadata = {
            title: id3v2Meta?.title || v1Meta.title,
            artist: id3v2Meta?.artist || v1Meta.artist,
            albumArtist: id3v2Meta?.albumArtist || v1Meta.albumArtist || v1Meta.artist,
            album: id3v2Meta?.album || v1Meta.album
          };
          mp3MetadataCache.set(url, combined);
          return combined;
        }
      }
    } catch (e) {}

    if (id3v2Meta) {
      mp3MetadataCache.set(url, id3v2Meta);
    }
    return id3v2Meta;
  } catch (err) {
    console.warn("Failed to fetch MP3 metadata:", err);
    return null;
  }
}

export function parseID3Bytes(bytes: Uint8Array): Mp3ID3Metadata | null {
  let result: Mp3ID3Metadata | null = null;

  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const majorVersion = bytes[3];
    if (majorVersion === 2 || majorVersion === 3 || majorVersion === 4) {
      const tagSize = ((bytes[6] & 0x7f) << 21) |
                      ((bytes[7] & 0x7f) << 14) |
                      ((bytes[8] & 0x7f) << 7) |
                      (bytes[9] & 0x7f);

      const limit = Math.min(bytes.length, tagSize + 10);
      let offset = 10;

      const parsed: Mp3ID3Metadata = {};

      const textDecode = (encoding: number, data: Uint8Array): string => {
        try {
          let str = '';
          if (encoding === 0 || encoding === 3) {
            str = new TextDecoder(encoding === 3 ? 'utf-8' : 'iso-8859-1').decode(data);
          } else if (encoding === 1 || encoding === 2) {
            str = new TextDecoder('utf-16').decode(data);
          }
          return str.replace(/^[\s\uFEFF\0]+|[\s\uFEFF\0]+$/g, '').replace(/\0.*$/g, '').trim();
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
          if (frameId === "TT2" || frameId === "TP1" || frameId === "TP2" || frameId === "TAL") {
            const encoding = frameData[0];
            const text = textDecode(encoding, frameData.subarray(1));
            if (text) {
              if (frameId === "TT2") parsed.title = text;
              if (frameId === "TP1") parsed.artist = text;
              if (frameId === "TP2") parsed.albumArtist = text;
              if (frameId === "TAL") parsed.album = text;
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
          if (frameId === "TIT2" || frameId === "TPE1" || frameId === "TPE2" || frameId === "TALB") {
            const encoding = frameData[0];
            const text = textDecode(encoding, frameData.subarray(1));
            if (text) {
              if (frameId === "TIT2") parsed.title = text;
              if (frameId === "TPE1") parsed.artist = text;
              if (frameId === "TPE2") parsed.albumArtist = text;
              if (frameId === "TALB") parsed.album = text;
            }
          }
          offset += frameSize;
        }
      }

      if (parsed.title || parsed.artist || parsed.albumArtist || parsed.album) {
        result = parsed;
      }
    }
  }

  // Fallback to ID3v1
  const v1Meta = parseID3v1Bytes(bytes);
  if (v1Meta) {
    if (!result) result = {};
    if (!result.title && v1Meta.title) result.title = v1Meta.title;
    if (!result.artist && v1Meta.artist) result.artist = v1Meta.artist;
    if (!result.albumArtist && (v1Meta.albumArtist || v1Meta.artist)) result.albumArtist = v1Meta.albumArtist || v1Meta.artist;
    if (!result.album && v1Meta.album) result.album = v1Meta.album;
  }

  if (result && (result.title || result.artist || result.albumArtist || result.album)) {
    return result;
  }
  return null;
}

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

export interface BaseShow {
  id: string;
  day: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  startHour: number;
  startMinute: number;
  durationHours: number;
  durationMinutes: number;
  name: string;
}

export function getSortedShows(showsList: BaseShow[]): BaseShow[] {
  const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return [...showsList].sort((a, b) => {
    const aMin = daysOrder.indexOf(a.day) * 1440 + a.startHour * 60 + a.startMinute;
    const bMin = daysOrder.indexOf(b.day) * 1440 + b.startHour * 60 + b.startMinute;
    return aMin - bMin;
  });
}

export function getShowShade(show: BaseShow, sortedShows: BaseShow[]): { bg: string; border: string; title: string } {
  const index = sortedShows && sortedShows.length > 0 
    ? sortedShows.findIndex(s => s.id === show.id) 
    : -1;
  
  // Use index-based alternating colors supporting light and dark theme CSS variables
  if (index !== -1 && index % 2 !== 0) {
    return {
      bg: 'var(--show-shade-odd-bg)',
      border: 'var(--show-shade-odd-border)',
      title: `Active during show: ${show.name}`
    };
  }

  return {
    bg: 'var(--show-shade-even-bg)',
    border: 'var(--show-shade-even-border)',
    title: `Active during show: ${show.name}`
  };
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

export function getActualShowStart(
  show: { day?: string; startHour: number; startMinute: number; durationHours: number; durationMinutes?: number },
  referenceTime: Date
): Date {
  const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const durationMin = (show.durationHours * 60) + (show.durationMinutes || 0);

  if (show.day && daysOrder.includes(show.day)) {
    const showDayIdx = daysOrder.indexOf(show.day);
    const targetDayIdx = referenceTime.getDay();
    const showStartMinInWeek = showDayIdx * 1440 + show.startHour * 60 + show.startMinute;
    const targetMinInWeek = targetDayIdx * 1440 + referenceTime.getHours() * 60 + referenceTime.getMinutes();
    
    // Minutes since the show started in a circular weekly calendar
    const diffMin = (targetMinInWeek - showStartMinInWeek + 10080) % 10080;
    if (diffMin < durationMin) {
      const showStartDate = new Date(referenceTime.getTime() - (diffMin * 60 * 1000) - (referenceTime.getSeconds() * 1000) - referenceTime.getMilliseconds());
      return showStartDate;
    }
  }

  const start = new Date(referenceTime);
  start.setHours(show.startHour, show.startMinute, 0, 0);
  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  if (referenceTime.getTime() < start.getTime()) {
    const yesterdayStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    if (referenceTime.getTime() >= yesterdayStart.getTime() && referenceTime.getTime() < yesterdayEnd.getTime()) {
      return yesterdayStart;
    }
  }
  return start;
}

export function getGatedAssetType(
  item?: TimeGatedMp3 | null
): 'audio' | 'script' {
  const url = (item?.mp3Url || '').toLowerCase();
  if (
    url.endsWith('.txt') ||
    url.endsWith('.pdf') ||
    url.endsWith('.png') ||
    url.endsWith('.jpg') ||
    url.endsWith('.jpeg')
  ) {
    return 'script';
  }
  if (
    url.endsWith('.mp3') ||
    url.endsWith('.wav') ||
    url.endsWith('.m4a') ||
    url.endsWith('.aac') ||
    url.endsWith('.flac') ||
    url.endsWith('.ogg')
  ) {
    return 'audio';
  }
  if (item?.assetType) return item.assetType;
  return 'audio';
}

export function normalizeInterstitial(item: Interstitial): Interstitial {
  if (!item) return item;

  const rawMp3s: any[] = Array.isArray(item.timeGatedMp3s) ? item.timeGatedMp3s : [];

  const normalizedTimeGated: TimeGatedMp3[] = rawMp3s.map(m => {
    const derivedAssetType = getGatedAssetType(m);
    return {
      id: m.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `mp3-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
      mp3Url: m.mp3Url || '',
      startDate: m.startDate || '',
      endDate: m.endDate || undefined,
      assetType: derivedAssetType,
      approximateReadTime: derivedAssetType === 'script' ? m.approximateReadTime : undefined,
      backupMp3Url: derivedAssetType === 'script' ? m.backupMp3Url : undefined,
      duration: derivedAssetType === 'audio' ? m.duration : undefined,
      fileSize: m.fileSize || undefined
    };
  });

  const base: any = {
    ...item,
    timeGatedMp3s: normalizedTimeGated
  };

  delete base.mp3Url;
  delete base.assetType;
  delete base.duration;
  delete base.backupMp3Url;
  delete base.approximateReadTime;

  return base as Interstitial;
}

export function normalizeInterstitials(items: Interstitial[]): Interstitial[] {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeInterstitial);
}

export function getActiveMp3ForSlot(
  interstitial: Interstitial | undefined | null,
  slotTime?: Date | string | number
): TimeGatedMp3 | null {
  if (!interstitial) return null;
  if (interstitial.enabled === false) return null;

  let targetMs: number;
  if (!slotTime) {
    targetMs = Date.now();
  } else if (slotTime instanceof Date) {
    targetMs = slotTime.getTime();
  } else if (typeof slotTime === 'number') {
    targetMs = slotTime;
  } else {
    const parsed = new Date(slotTime).getTime();
    targetMs = isNaN(parsed) ? Date.now() : parsed;
  }

  // Check parent Interstitial date envelope
  if (interstitial.startDate) {
    const parentStartMs = new Date(formatToDatetimeLocal(interstitial.startDate)).getTime();
    if (!isNaN(parentStartMs) && targetMs < parentStartMs) {
      return null;
    }
  }
  if (interstitial.endDate) {
    const parentEndMs = new Date(formatToDatetimeLocal(interstitial.endDate)).getTime();
    if (!isNaN(parentEndMs) && targetMs >= parentEndMs) {
      return null;
    }
  }

  const mp3s = interstitial.timeGatedMp3s || [];
  if (mp3s.length === 0) return null;

  const sorted = sortMp3sByStartDate(mp3s);

  // Step 1: Check for currently active window
  for (const item of sorted) {
    const startMs = item.startDate ? new Date(formatToDatetimeLocal(item.startDate)).getTime() : 0;
    const endMs = item.endDate ? new Date(formatToDatetimeLocal(item.endDate)).getTime() : Infinity;

    if (!isNaN(startMs) && targetMs >= startMs) {
      if (isNaN(endMs) || targetMs <= endMs) {
        return item;
      }
    }
  }

  // Step 2: Check for earliest forward-looking (future) window
  for (const item of sorted) {
    const startMs = item.startDate ? new Date(formatToDatetimeLocal(item.startDate)).getTime() : 0;
    if (!isNaN(startMs) && startMs > targetMs) {
      return item;
    }
  }

  // Step 3: All entries are in the past and no future entries exist
  return null;
}

export function getAllRequiredMp3Urls(interstitials: Interstitial[]): string[] {
  if (!Array.isArray(interstitials)) return [];
  const urls = new Set<string>();

  interstitials.forEach(item => {
    if (!item || !item.enabled) return;
    if (Array.isArray(item.timeGatedMp3s)) {
      item.timeGatedMp3s.forEach(m => {
        if (m.mp3Url && m.mp3Url.trim()) {
          urls.add(m.mp3Url.trim());
        }
        if (m.backupMp3Url && m.backupMp3Url.trim()) {
          urls.add(m.backupMp3Url.trim());
        }
      });
    }
  });

  return Array.from(urls);
}

export function formatToDatetimeLocal(dateStr?: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateStr)) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateStr)) return dateStr.substring(0, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return `${dateStr}T00:00`;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${mins}`;
  } catch (e) {
    return dateStr;
  }
}

export function getCurrentDatetimeLocal(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

export function getDatePart(dateStr?: string): string {
  if (!dateStr) return '';
  const formatted = formatToDatetimeLocal(dateStr);
  if (!formatted) return '';
  return formatted.split('T')[0] || '';
}

export function getTimePart(dateStr?: string): string {
  if (!dateStr) return '';
  const formatted = formatToDatetimeLocal(dateStr);
  if (!formatted) return '';
  const parts = formatted.split('T');
  return parts[1] ? parts[1].substring(0, 5) : '';
}

/**
 * Checks if an end datetime (e.g. 2026-08-30T23:59) and a start datetime (e.g. 2026-08-31T00:00)
 * represent a contiguous transition across midnight (Prior Day 23:59 to Next Day 00:00),
 * which is treated as seamless continuous coverage (not a gap).
 */
export function isContiguousMidnightTransition(endStr?: string, startStr?: string): boolean {
  if (!endStr || !startStr) return false;
  const endFormatted = formatToDatetimeLocal(endStr);
  const startFormatted = formatToDatetimeLocal(startStr);
  if (!endFormatted || !startFormatted) return false;

  const endDate = getDatePart(endFormatted);
  const endTime = getTimePart(endFormatted);
  const startDate = getDatePart(startFormatted);
  const startTime = getTimePart(startFormatted);

  if (endTime === '23:59' && startTime === '00:00') {
    const [ey, em, ed] = endDate.split('-').map(Number);
    const [sy, sm, sd] = startDate.split('-').map(Number);
    if (!isNaN(ey) && !isNaN(em) && !isNaN(ed) && !isNaN(sy) && !isNaN(sm) && !isNaN(sd)) {
      const nextDayOfEnd = new Date(ey, em - 1, ed + 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      const expectedStartDate = `${nextDayOfEnd.getFullYear()}-${pad(nextDayOfEnd.getMonth() + 1)}-${pad(nextDayOfEnd.getDate())}`;
      if (startDate === expectedStartDate) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Given a new start datetime ISO (e.g. 2026-09-08T00:00),
 * computes the backfilled end datetime for a preceding open-ended or abutting slot.
 * If the new start is at 00:00, the preceding slot ends at Prior Day 23:59 (e.g. 2026-09-07T23:59).
 * Otherwise, it matches the start datetime.
 */
export function computeBackfilledEndTime(newStartIso: string): string {
  if (!newStartIso) return '';
  const timePart = getTimePart(newStartIso) || '00:00';
  if (timePart === '00:00') {
    const datePart = getDatePart(newStartIso);
    const [y, m, d] = datePart.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const prevDate = new Date(y, m - 1, d - 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(prevDate.getDate())}T23:59`;
    }
  }
  return newStartIso;
}

/**
 * Given a preceding slot's end datetime ISO or (date, time) pair,
 * computes the starting datetime for the next interstitial gap auto-fill.
 * If the preceding stop time ends in 23:59 (e.g. 2026-09-07T23:59),
 * applies the 00:00 next day rule so the next interstitial starts at Next Day 00:00 (e.g. 2026-09-08T00:00).
 */
export function getNextGapAutoFillStart(endIsoOrDate: string, endTime?: string): { startDate: string; startTime: string; startIso: string } {
  let eDate = '';
  let eTime = '';
  if (endTime !== undefined) {
    eDate = endIsoOrDate;
    eTime = endTime;
  } else {
    const formatted = formatToDatetimeLocal(endIsoOrDate);
    eDate = getDatePart(formatted);
    eTime = getTimePart(formatted) || '00:00';
  }

  if (eTime === '23:59') {
    const [y, m, d] = eDate.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const nextDay = new Date(y, m - 1, d + 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      const nextDateStr = `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
      return {
        startDate: nextDateStr,
        startTime: '00:00',
        startIso: `${nextDateStr}T00:00`
      };
    }
  }

  return {
    startDate: eDate,
    startTime: eTime || '00:00',
    startIso: `${eDate}T${eTime || '00:00'}`
  };
}

export function sortMp3sByStartDate(mp3s: TimeGatedMp3[]): TimeGatedMp3[] {
  if (!Array.isArray(mp3s)) return [];
  return [...mp3s].sort((a, b) => {
    const aStart = formatToDatetimeLocal(a.startDate) || '';
    const bStart = formatToDatetimeLocal(b.startDate) || '';
    if (aStart < bStart) return -1;
    if (aStart > bStart) return 1;
    return 0;
  });
}

export function findFirstGapOrEnd(mp3s: TimeGatedMp3[], fallbackDate?: string): { startDate: string; endDate?: string } {
  const sorted = sortMp3sByStartDate(mp3s);
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const currEnd = sorted[i].endDate ? formatToDatetimeLocal(sorted[i].endDate) : null;
    const nextStart = sorted[i + 1].startDate ? formatToDatetimeLocal(sorted[i + 1].startDate) : null;
    
    if (currEnd && nextStart && currEnd < nextStart && !isContiguousMidnightTransition(currEnd, nextStart)) {
      const autoFillStart = getNextGapAutoFillStart(currEnd);
      const autoFillEnd = computeBackfilledEndTime(nextStart);
      return { startDate: autoFillStart.startIso, endDate: autoFillEnd };
    }
  }

  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    if (last.endDate) {
      const autoFillStart = getNextGapAutoFillStart(formatToDatetimeLocal(last.endDate));
      return { startDate: autoFillStart.startIso };
    }
  }

  const fallback = fallbackDate ? formatToDatetimeLocal(fallbackDate) : getCurrentDatetimeLocal();
  return { startDate: fallback };
}

export function validateTimeGatedMp3s(mp3s: TimeGatedMp3[], nowIso?: string, parentProfileEndDate?: string) {
  const sorted = sortMp3sByStartDate(mp3s);
  const errors: { [id: string]: string[] } = {};
  const warnings: { [id: string]: string[] } = {};
  const gapStartIds = new Set<string>();
  const gapEndIds = new Set<string>();
  const overlapStartIds = new Set<string>();
  const overlapEndIds = new Set<string>();
  const missingStartIds = new Set<string>();
  const missingFileIds = new Set<string>();
  let hasErrors = false;

  sorted.forEach((item) => {
    errors[item.id] = [];
    warnings[item.id] = [];
  });

  sorted.forEach((item) => {
    if (!item.startDate || item.startDate.trim() === '') {
      warnings[item.id].push('Start date & time is missing.');
      missingStartIds.add(item.id);
    }
    if (!item.mp3Url || item.mp3Url.trim() === '') {
      warnings[item.id].push('File attachment selection is missing.');
      missingFileIds.add(item.id);
    }
  });

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const aStart = formatToDatetimeLocal(a.startDate);
    const aEnd = a.endDate ? formatToDatetimeLocal(a.endDate) : null;

    if (!aStart) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const bStart = formatToDatetimeLocal(b.startDate);
      const bEnd = b.endDate ? formatToDatetimeLocal(b.endDate) : null;

      if (!bStart) continue;

      let overlap = false;
      if (aEnd === null) {
        if (bStart >= aStart) {
          overlap = true;
        }
      } else {
        if (bEnd === null) {
          if (bStart < aEnd) {
            overlap = true;
          }
        } else {
          if (aStart < bEnd && bStart < aEnd) {
            overlap = true;
          }
        }
      }

      if (overlap) {
        warnings[a.id].push(`Time range overlaps with Interstitial #${j + 1}`);
        warnings[b.id].push(`Time range overlaps with Interstitial #${i + 1}`);

        // Flag specific Start and End boundaries that contribute to the overlap
        if (aStart === bStart) {
          overlapStartIds.add(a.id);
          overlapStartIds.add(b.id);
        } else {
          // Since sorted by start, aStart < bStart
          overlapEndIds.add(a.id);
          overlapStartIds.add(b.id);
        }

        if (aEnd === null) {
          overlapEndIds.add(a.id);
          if (bEnd !== null) {
            overlapEndIds.add(b.id);
          } else {
            overlapEndIds.add(b.id);
          }
        } else {
          if (bEnd !== null && bEnd <= aEnd) {
            overlapEndIds.add(b.id);
            overlapEndIds.add(a.id);
          }
        }
      }
    }
  }

  // 1. Check for leading gap from now() to first forward-looking startDate
  const currentNow = nowIso || getCurrentDatetimeLocal();
  if (sorted.length > 0 && sorted[0].startDate) {
    const firstStart = formatToDatetimeLocal(sorted[0].startDate);
    if (firstStart && firstStart > currentNow && !isContiguousMidnightTransition(currentNow, firstStart)) {
      warnings[sorted[0].id].push(`Gap detected: ${currentNow.replace('T', ' ')} (now) to ${firstStart.replace('T', ' ')}`);
      gapStartIds.add(sorted[0].id);
    }
  }

  // 2. Check for subsequent gaps between interstitials
  // Note: To prevent redundant/duplicate warning boxes across adjacent cards,
  // we record the gap warning on the incoming item (b) so it renders once above Start on item b,
  // while keeping gapEndIds on item a to preserve color highlighting on item a's End inputs.
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const aEnd = a.endDate ? formatToDatetimeLocal(a.endDate) : null;
    const bStart = b.startDate ? formatToDatetimeLocal(b.startDate) : null;

    if (aEnd && bStart && aEnd < bStart && !isContiguousMidnightTransition(aEnd, bStart)) {
      warnings[b.id].push(`Gap detected: ${aEnd.replace('T', ' ')} to ${bStart.replace('T', ' ')}`);
      gapEndIds.add(a.id);
      gapStartIds.add(b.id);
    }
  }

  // 3. Check for trailing post-expiration gap after the last gated item
  // If the last item has an endDate and either the parent interstitial has no endDate or an endDate beyond the last item's endDate
  if (sorted.length > 0) {
    const lastItem = sorted[sorted.length - 1];
    if (lastItem.endDate && lastItem.endDate.trim()) {
      const lastEnd = formatToDatetimeLocal(lastItem.endDate);
      const parentEnd = parentProfileEndDate ? formatToDatetimeLocal(parentProfileEndDate) : null;
      if (!parentEnd || (parentEnd > lastEnd && !isContiguousMidnightTransition(lastEnd, parentEnd))) {
        gapEndIds.add(lastItem.id);
        const gapTargetText = parentEnd ? parentEnd.replace('T', ' ') : 'the future';
        warnings[lastItem.id].push(`Gap detected: ${lastEnd.replace('T', ' ')} to ${gapTargetText}`);
      }
    }
  }

  return { errors, warnings, gapStartIds, gapEndIds, overlapStartIds, overlapEndIds, missingStartIds, missingFileIds, hasErrors, sorted };
}

/**
 * Generates a collision-resistant, lexicographically sortable backup filename:
 * [type]_backup_[YYYYMMDD]_[HHmmss]_[MODE]_[salt].json
 * where [MODE] is 'LIVE', 'STUDIO', or 'ADMIN'
 */
export function generateBackupFilename(
  type: 'logs' | 'interstitials' | 'shows',
  workstationMode?: string
): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  const rawMode = (workstationMode || '').toUpperCase().trim();
  const mode = rawMode === 'LIVE' ? 'LIVE' : rawMode === 'STUDIO' ? 'STUDIO' : 'ADMIN';
  const salt = Math.random().toString(16).substring(2, 6).padStart(4, '0');

  return `${type}_backup_${yyyy}${mm}${dd}_${hh}${min}${ss}_${mode}_${salt}.json`;
}


