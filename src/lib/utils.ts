import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const mockFiles = [
  { name: 'Chime 1.mp3', size: '0.5 MB', duration: '0:30', path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { name: 'Chime 2.mp3', size: '0.6 MB', duration: '1:15', path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { name: 'Announcement.mp3', size: '1.2 MB', duration: '2:45', path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { name: 'Alert.mp3', size: '0.8 MB', duration: '0:45', path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
];

export const getMP3Status = (url: string | undefined) => {
  if (!url) return { exists: false, valid: false, filename: 'None selected' };
  
  const cleanUrl = url.split('?')[0];
  const filename = cleanUrl.split('/').pop() || 'Unknown';
  
  // For demo: Only mock files exist. Anything else is "not found" so the user can test the error states.
  const mockFile = mockFiles.find(f => f.path === url || f.name === url || url.includes(f.name));
  const exists = !!mockFile;
  const valid = cleanUrl.toLowerCase().endsWith('.mp3');
  
  return { exists, valid, filename };
};

export const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
