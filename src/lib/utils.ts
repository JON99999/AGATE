import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { driveFileNameCache } from './driveService';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getMP3Status = (url: string | undefined) => {
  if (!url) return { exists: false, valid: false, filename: 'None selected' };
  
  const isLocal = url.includes('/api/local/play-mp3');
  const isDrive = url.includes('googleapis.com') || url.includes('drive.google.com') || url.includes('id=');
  
  let filename = 'Unknown';
  if (isLocal) {
    try {
      const urlObj = new URL(url, window.location.origin);
      filename = urlObj.searchParams.get('file') || 'Unknown';
    } catch (e) {
      filename = decodeURIComponent(url.split('file=').pop() || '').split('&')[0] || 'Unknown';
    }
  } else {
    const cleanUrl = url.split('?')[0];
    filename = cleanUrl.split('/').pop() || 'Unknown';
    if (isDrive && driveFileNameCache.get(url)) {
      filename = driveFileNameCache.get(url)!;
    }
  }
  
  const exists = isDrive || isLocal;
  const valid = url.toLowerCase().includes('.mp3') || url.toLowerCase().includes('.wav') || isDrive || url.includes('alt=media') || url.includes('id=') || isLocal;
  
  return { exists, valid, filename };
};

export const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
