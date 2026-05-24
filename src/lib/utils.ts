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

