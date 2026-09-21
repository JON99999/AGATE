import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { Announcement, LogEntry, Show } from '../types';
import { Mp3ID3Metadata, parseID3Bytes, normalizeAnnouncements, generateBackupFilename } from './utils';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App & Auth
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const provider = new GoogleAuthProvider();
// Required Scope for reading and writing files in Drive
provider.addScope('https://www.googleapis.com/auth/drive');

let cachedAccessToken: string | null = (typeof window !== 'undefined') 
  ? (sessionStorage.getItem('amp_drive_token') || localStorage.getItem('amp_override_token')) 
  : null;
let currentAuthUser: any = null;
let isSigningIn = false;

export interface LocationPathsOverride {
  logs?: string | null;
  loghistory?: string | null;
  settings?: string | null;
  media_announcements?: string | null;
  media_evergreens?: string | null;
  media_shows?: string | null;
  logsFile?: string | null;
  announcementsFile?: string | null;
  showsFile?: string | null;
}

export interface LocationSettings {
  mode: 'Local' | 'Drive' | 'Demo';
  localPathAmp: string;
  driveFolderAmp?: string;
  paths?: LocationPathsOverride;
  localPathMP3s: string;
  localPathLogs: string;
  localPathCalendar: string;
  driveFolderLogs: string;
  driveFolderMP3s: string;
  driveFolderPreferences: string;
  driveFolderAnnouncements?: string;
  driveFolderEvergreens?: string;
  driveFolderShows?: string;
}

export const isElectronEnv = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !!(window as any).electronAPI || (navigator && navigator.userAgent && navigator.userAgent.includes('Electron'));
};

export const DEFAULT_SETTINGS: LocationSettings = {
  mode: isElectronEnv() ? 'Local' : 'Drive',
  localPathAmp: '',
  driveFolderAmp: '',
  paths: {
    logs: null,
    loghistory: null,
    settings: null,
    media_announcements: null,
    media_evergreens: null,
    media_shows: null,
    logsFile: null,
    announcementsFile: null,
    showsFile: null,
  },
  localPathMP3s: '',
  localPathLogs: '',
  localPathCalendar: '',
  driveFolderLogs: '',
  driveFolderMP3s: '',
  driveFolderPreferences: '',
  driveFolderAnnouncements: '',
  driveFolderEvergreens: '',
  driveFolderShows: '',
};

export const getSavedSettings = (): LocationSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem('amp_location_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load settings from localStorage', e);
  }
  return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: LocationSettings) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('amp_location_settings', JSON.stringify(settings));
};

// Folders
export const DRIVE_FOLDERS = {
  get amp() {
    const settings = getSavedSettings();
    return settings.driveFolderAmp || '';
  },
  get logs() {
    const settings = getSavedSettings();
    if (settings.mode === 'Demo') return '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx';
    return settings.driveFolderLogs || '';
  },
  get mp3s() {
    const settings = getSavedSettings();
    if (settings.mode === 'Demo') return '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch';
    return settings.driveFolderAnnouncements || settings.driveFolderMP3s || '';
  },
  get announcements() {
    const settings = getSavedSettings();
    if (settings.mode === 'Demo') return '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch';
    return settings.driveFolderAnnouncements || settings.driveFolderMP3s || '';
  },
  get evergreens() {
    const settings = getSavedSettings();
    return settings.driveFolderEvergreens || '';
  },
  get shows() {
    const settings = getSavedSettings();
    return settings.driveFolderShows || '';
  },
  get preferences() {
    const settings = getSavedSettings();
    if (settings.mode === 'Demo') return '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED';
    return settings.driveFolderPreferences || '';
  }
};

// Listen to Auth changes
export const initAuth = (
  onAuthSuccess?: (user: any, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (typeof window !== 'undefined') {
    const savedToken = cachedAccessToken || localStorage.getItem('amp_override_token');
    const savedUserJson = localStorage.getItem('amp_user_profile');
    
    if (savedToken) {
      cachedAccessToken = savedToken;
      let parsedUser = null;
      if (savedUserJson) {
        try {
          parsedUser = JSON.parse(savedUserJson);
        } catch (e) {}
      }
      
      if (parsedUser) {
        currentAuthUser = parsedUser;
        if (onAuthSuccess) {
          // Delay briefly to allow main components to finish mounting
          setTimeout(() => onAuthSuccess(parsedUser, savedToken), 50);
        }
      } else {
        // Retrieve details from Google
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': `Bearer ${savedToken}` }
        })
        .then(res => {
          if (res.ok) return res.json();
          // Fallback to Drive About if userinfo is unavailable
          return fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
            headers: { 'Authorization': `Bearer ${savedToken}` }
          }).then(r => r.ok ? r.json() : null);
        })
        .then(data => {
          if (data) {
            const userObj = data.user 
              ? { email: data.user.emailAddress || 'authorized-device@amp.local', displayName: data.user.displayName || 'Authorized User' }
              : { email: data.email || 'authorized-device@amp.local', displayName: data.name || 'Authorized User' };
            currentAuthUser = userObj;
            localStorage.setItem('amp_user_profile', JSON.stringify(userObj));
            if (onAuthSuccess) onAuthSuccess(userObj, savedToken);
          } else {
            if (onAuthFailure) onAuthFailure();
          }
        })
        .catch(() => {
          if (onAuthFailure) onAuthFailure();
        });
      }
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  } else {
    if (onAuthFailure) onAuthFailure();
  }
  
  // Return dummy unsubscribe function
  return () => {};
};

export const googleSignIn = async (): Promise<{ user: any; accessToken: string } | null> => {
  throw new Error('Standard Firebase googleSignIn has been replaced with the 3 Google Auth Option flows inside AMP.');
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const setOverrideAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem('amp_drive_token', token);
      localStorage.setItem('amp_override_token', token);
    } else {
      sessionStorage.removeItem('amp_drive_token');
      localStorage.removeItem('amp_override_token');
      localStorage.removeItem('amp_user_profile');
    }
  }
};

export const getCurrentUser = (): any => {
  return currentAuthUser;
};

export const handleLogout = async () => {
  cachedAccessToken = null;
  currentAuthUser = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('amp_drive_token');
    localStorage.removeItem('amp_override_token');
    localStorage.removeItem('amp_user_profile');
  }
  // Revoke cached Blob URLs to free up memory
  clearAudioCache();
};

// Memory Cache for MP3 binary blobs to provide immediate playback and zero latency
export const mp3BlobCache = new Map<string, string>(); // Maps raw URL (e.g. googleapis drive url) to local Blob URL
export const rawBlobCache = new Map<string, Blob>(); // Maps raw URL to binary Blob
export const mp3MetadataCache = new Map<string, Mp3ID3Metadata>(); // Maps raw URL to parsed ID3 metadata
export const mp3DurationCache = new Map<string, string>(); // Maps raw URL to calculated duration "m:ss"
export const mp3WaveformCache = new Map<string, number[]>(); // Maps raw URL or path to normalized waveform peaks
export const availableFilesCache = new Map<string, { path: string; size: string; duration: string }>();

const pendingFetches = new Map<string, Promise<string>>();

export const extractWaveformForUrl = async (url: string, sourceUrlOrBlob?: string | Blob): Promise<number[]> => {
  if (mp3WaveformCache.has(url)) return mp3WaveformCache.get(url)!;
  if (typeof window === 'undefined') return [];

  try {
    let arrayBuffer: ArrayBuffer | null = null;
    const cachedBlob = rawBlobCache.get(url);
    if (cachedBlob) {
      arrayBuffer = await cachedBlob.arrayBuffer();
    } else if (sourceUrlOrBlob instanceof Blob) {
      arrayBuffer = await sourceUrlOrBlob.arrayBuffer();
    } else if (typeof sourceUrlOrBlob === 'string') {
      const targetUrl = mp3BlobCache.get(sourceUrlOrBlob) || sourceUrlOrBlob;
      const resp = await fetch(targetUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        arrayBuffer = await blob.arrayBuffer();
      }
    }

    if (!arrayBuffer) return [];

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return [];
    const audioCtx = new AudioCtx();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    const numBars = 60;
    const samplesPerBar = Math.floor(totalSamples / numBars);
    const peaks: number[] = [];

    for (let i = 0; i < numBars; i++) {
      let max = 0;
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, totalSamples);
      const step = Math.max(1, Math.floor((end - start) / 80));
      for (let j = start; j < end; j += step) {
        const val = Math.abs(channelData[j]);
        if (val > max) max = val;
      }
      peaks.push(max);
    }

    const maxPeak = Math.max(...peaks, 0.001);
    const normalized = peaks.map(p => Math.max(0.15, Math.min(1.0, p / maxPeak)));

    mp3WaveformCache.set(url, normalized);
    try { audioCtx.close(); } catch (e) {}

    window.dispatchEvent(new CustomEvent('mp3-waveform-cached', { 
      detail: { url, peaks: normalized } 
    }));

    return normalized;
  } catch (err) {
    console.warn(`Could not extract waveform for ${url}:`, err);
    return [];
  }
};

export const calculateDurationForUrl = (url: string, sourceUrl: string) => {
  if (mp3DurationCache.has(url)) return;
  
  if (typeof window === 'undefined') return;
  
  const audio = new Audio();
  audio.src = sourceUrl;
  audio.addEventListener('loadedmetadata', () => {
    const durationSec = audio.duration;
    if (durationSec && !isNaN(durationSec) && durationSec !== Infinity) {
      const minutes = Math.floor(durationSec / 60);
      const seconds = Math.floor(durationSec % 60);
      const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      mp3DurationCache.set(url, formatted);
      console.log(`Successfully calculated duration for ${url}: ${formatted}`);
      window.dispatchEvent(new CustomEvent('mp3-duration-cached', { 
        detail: { url, duration: formatted } 
      }));
    }
  });
  audio.addEventListener('error', (err) => {
    console.warn(`Could not load audio metadata for calculating duration: ${url}`, err);
  });
};

export const clearAudioCache = () => {
  for (const blobUrl of mp3BlobCache.values()) {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.warn('Failed to revoke object URL:', e);
    }
  }
  mp3BlobCache.clear();
  rawBlobCache.clear();
  mp3MetadataCache.clear();
  mp3DurationCache.clear();
  mp3WaveformCache.clear();
  pendingFetches.clear();
};

/**
 * Download an MP3 from Drive or Local into memory cache and parse ID3 metadata simultaneously
 */
export const cacheMP3 = async (url: string, token: string): Promise<string> => {
  let resolvedUrl = url;
  const fileInCache = availableFilesCache.get(url);
  if (fileInCache) {
    resolvedUrl = fileInCache.path;
  }

  if (mp3BlobCache.has(resolvedUrl)) {
    return mp3BlobCache.get(resolvedUrl)!;
  }

  if (pendingFetches.has(resolvedUrl)) {
    return pendingFetches.get(resolvedUrl)!;
  }

  const isDriveUrl = resolvedUrl.includes('googleapis.com') || resolvedUrl.includes('drive.google.com');
  
  const headers: HeadersInit = {};
  if (isDriveUrl) {
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      throw new Error(`Google Drive token is required to fetch Drive file: ${resolvedUrl}`);
    }
  }

  const fetchPromise = (async () => {
    try {
      const res = await fetch(resolvedUrl, { headers });
      if (!res.ok) throw new Error(`Failed to fetch MP3 from url: ${res.statusText}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      mp3BlobCache.set(resolvedUrl, blobUrl);
      mp3BlobCache.set(url, blobUrl);
      rawBlobCache.set(resolvedUrl, blob);
      rawBlobCache.set(url, blob);

      // Calculate duration for the newly cached audio file
      calculateDurationForUrl(url, blobUrl);
      calculateDurationForUrl(resolvedUrl, blobUrl);

      // Extract audio waveform peaks as part of caching process
      try {
        await extractWaveformForUrl(url, blob);
        await extractWaveformForUrl(resolvedUrl, blob);
      } catch (e) {
        console.warn('Waveform analysis failed during caching', e);
      }

      // Parse ID3 metadata directly from the downloaded blob in RAM
      try {
        const arrayBuf = await blob.arrayBuffer();
        const meta = parseID3Bytes(new Uint8Array(arrayBuf));
        if (meta && (meta.title || meta.artist || meta.albumArtist || meta.album)) {
          mp3MetadataCache.set(resolvedUrl, meta);
          mp3MetadataCache.set(url, meta);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mp3-metadata-loaded', { 
              detail: { url, resolvedUrl, meta } 
            }));
          }
        }
      } catch (e) {
        // ID3 parse fail on blob
      }

      return blobUrl;
    } catch (err) {
      console.error(`Error caching MP3 (${url}):`, err);
      if (!isDriveUrl) {
        calculateDurationForUrl(url, resolvedUrl);
        return resolvedUrl;
      }
      throw err;
    } finally {
      pendingFetches.delete(resolvedUrl);
    }
  })();

  pendingFetches.set(resolvedUrl, fetchPromise);
  return fetchPromise;
};

export interface CachingProgressReport {
  total: number;
  completed: number;
  failed: number;
  errors: Array<{ url: string; fileName?: string; error: string }>;
  isComplete: boolean;
}

/**
 * Clean up the audio memory cache by revoking files that are no longer part of active schedules,
 * and pre-cache new URLs with detailed progress reporting.
 */
export const updateAudioCacheWithProgress = async (
  activeUrls: string[],
  token: string | null,
  onProgress?: (report: CachingProgressReport) => void
): Promise<CachingProgressReport> => {
  const resolvedActiveUrls = activeUrls.map(url => {
    const file = availableFilesCache.get(url);
    return file ? file.path : url;
  });

  // 1. Purge urls no longer needed
  const activeSet = new Set([...activeUrls, ...resolvedActiveUrls]);
  for (const cachedUrl of Array.from(mp3BlobCache.keys())) {
    if (!activeSet.has(cachedUrl)) {
      const blobUrl = mp3BlobCache.get(cachedUrl);
      if (blobUrl) {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (e) {
          console.warn('Revoke error:', e);
        }
      }
      mp3BlobCache.delete(cachedUrl);
    }
  }

  for (const cachedUrl of Array.from(rawBlobCache.keys())) {
    if (!activeSet.has(cachedUrl)) {
      rawBlobCache.delete(cachedUrl);
    }
  }

  for (const cachedUrl of Array.from(mp3MetadataCache.keys())) {
    if (!activeSet.has(cachedUrl)) {
      mp3MetadataCache.delete(cachedUrl);
    }
  }

  for (const cachedUrl of Array.from(mp3DurationCache.keys())) {
    if (!activeSet.has(cachedUrl)) {
      mp3DurationCache.delete(cachedUrl);
    }
  }

  for (const cachedUrl of Array.from(mp3WaveformCache.keys())) {
    if (!activeSet.has(cachedUrl)) {
      mp3WaveformCache.delete(cachedUrl);
    }
  }

  const uniqueActiveUrls = Array.from(new Set(activeUrls));
  let completed = 0;
  let failed = 0;
  const errors: Array<{ url: string; fileName?: string; error: string }> = [];

  const reportProgress = (isComplete = false) => {
    if (onProgress) {
      onProgress({
        total: uniqueActiveUrls.length,
        completed,
        failed,
        errors,
        isComplete
      });
    }
  };

  reportProgress(false);

  if (uniqueActiveUrls.length === 0) {
    const finalReport = { total: 0, completed: 0, failed: 0, errors: [], isComplete: true };
    reportProgress(true);
    return finalReport;
  }

  await Promise.all(
    uniqueActiveUrls.map(async (url) => {
      const file = availableFilesCache.get(url);
      const resolvedUrl = file ? file.path : url;
      const fileName = file ? file.path : (driveFileNameCache.get(url) || url.split('/').pop() || url);

      if (mp3BlobCache.has(resolvedUrl)) {
        completed++;
        reportProgress(false);
        return;
      }

      try {
        await cacheMP3(url, token || '');
        completed++;
      } catch (err: any) {
        failed++;
        errors.push({
          url,
          fileName,
          error: err?.message || 'Failed to download audio file'
        });
      }
      reportProgress(false);
    })
  );

  const finalReport = {
    total: uniqueActiveUrls.length,
    completed,
    failed,
    errors,
    isComplete: true
  };
  reportProgress(true);
  return finalReport;
};

export const updateAudioCache = async (activeUrls: string[], token: string | null) => {
  return updateAudioCacheWithProgress(activeUrls, token);
};

/**
 * Prepare and cache context for a specific show on-demand (Prerecord / Export / Playlist)
 */
export const prepareShowContext = async (params: {
  showId: string;
  showName?: string;
  showNameShort?: string;
  context?: 'Prerecord' | 'Export' | 'Playlist';
  folderType?: 'Playlists' | 'Evergreens';
}): Promise<{
  success: boolean;
  context: any;
  totalTracks: number;
  totalDurationSeconds: number;
}> => {
  try {
    const res = await fetch(`/api/shows/${encodeURIComponent(params.showId)}/prepare-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to prepare show context');
    }
    return await res.json();
  } catch (err: any) {
    console.error('Error preparing show context:', err);
    throw err;
  }
};

/**
 * Clear the server-side show context and release memory
 */
export const clearShowContext = async (showId?: string): Promise<void> => {
  try {
    const endpoint = showId ? `/api/shows/${encodeURIComponent(showId)}/clear-context` : '/api/shows/clear-context';
    await fetch(endpoint, { method: 'POST' });
  } catch (err) {
    console.warn('Error clearing show context:', err);
  }
};

/**
 * Get the currently active prepared show context
 */
export const getActiveShowContext = async (): Promise<any> => {
  try {
    const res = await fetch('/api/shows/active-context');
    if (!res.ok) return null;
    const data = await res.json();
    return data.context || null;
  } catch (err) {
    return null;
  }
};

// General Google Drive Helpers
async function driveFetch(endpoint: string, options: RequestInit = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let finalEndpoint = endpoint.replace(/^\//, '');
  if (finalEndpoint.startsWith('drive/v3/')) {
    const sep = finalEndpoint.includes('?') ? '&' : '?';
    if (!finalEndpoint.includes('supportsAllDrives')) {
      finalEndpoint = `${finalEndpoint}${sep}supportsAllDrives=true`;
    }
    if (finalEndpoint.includes('drive/v3/files?') && !finalEndpoint.includes('includeItemsFromAllDrives')) {
      finalEndpoint = `${finalEndpoint}&includeItemsFromAllDrives=true`;
    }
  }

  const res = await fetch(`https://www.googleapis.com/${finalEndpoint}`, {
    ...options,
    headers
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive API error (${res.status}): ${errText || res.statusText}`);
  }

  return res;
}

/**
 * Searches for a file by name inside a specific folder
 */
async function findFileInFolder(name: string, folderId: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`name = '${name}' and '${folderId}' in parents and trashed = false`);
    const res = await driveFetch(`drive/v3/files?q=${query}&fields=files(id,name)`);
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  } catch (e) {
    // Fall back to case-insensitive scan
  }
  return findFileInFolderCaseInsensitive(name, folderId);
}

/**
 * Lists all active files/folders inside a parent folder in Google Drive
 */
async function listFilesInFolder(folderId: string): Promise<Array<{ id: string; name: string; mimeType: string }>> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await driveFetch(`drive/v3/files?q=${query}&fields=files(id,name,mimeType)&pageSize=1000`);
  const data = await res.json();
  return data.files || [];
}

/**
 * Searches for a file/folder case-insensitively inside a specific folder
 */
async function findFileInFolderCaseInsensitive(name: string, folderId: string): Promise<string | null> {
  if (!folderId) {
    throw new Error('Target parent folder ID is missing or empty.');
  }
  const files = await listFilesInFolder(folderId);
  const target = name.toLowerCase();
  const found = files.find(f => f.name.toLowerCase() === target);
  return found ? found.id : null;
}

/**
 * Creates a file with metadata and empty body in a parent folder
 */
async function createFileInFolder(name: string, folderId: string, mimeType: string = 'application/json'): Promise<string> {
  const body = {
    name,
    parents: [folderId],
    mimeType
  };
  const res = await driveFetch('drive/v3/files', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return data.id;
}

/**
 * Uploads/overwrites content of an existing file
 */
async function uploadFileContent(fileId: string, content: string, mimeType: string = 'application/json'): Promise<void> {
  const token = getAccessToken();
  await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': mimeType
    },
    body: content
  });
}

// Higher level API functions

/**
 * Resolves or creates the 'settings' folder on Google Drive.
 * In unified mode (driveFolderAmp is set), it looks for/creates 'settings' inside driveFolderAmp.
/**
 * Resolves or creates the 'settings' folder strictly inside the AMP station root on Google Drive
 * (or uses the legacy/override preferences folder if configured).
 */
export const getOrCreateDriveSettingsFolder = async (): Promise<string> => {
  const overrideFolder = DRIVE_FOLDERS.preferences;
  if (overrideFolder) return overrideFolder;

  const ampFolder = DRIVE_FOLDERS.amp;
  if (!ampFolder) {
    throw new Error('Google Drive Station folder is not configured. Please set it in Settings.');
  }
  let settingsId = await findFileInFolderCaseInsensitive('settings', ampFolder);
  if (!settingsId) {
    settingsId = await findFileInFolderCaseInsensitive('Settings', ampFolder);
  }
  if (!settingsId) {
    settingsId = await findFileInFolderCaseInsensitive('preferences', ampFolder);
  }
  if (!settingsId) {
    settingsId = await createFileInFolder('settings', ampFolder, 'application/vnd.google-apps.folder');
  }
  return settingsId;
};

// Backwards compatibility alias
export const getOrCreateDrivePreferencesFolder = getOrCreateDriveSettingsFolder;

/**
 * Resolves or creates the 'logs' folder strictly inside the AMP station root on Google Drive
 * (or uses the legacy/override logs folder if configured).
 */
export const getOrCreateDriveLogsFolder = async (): Promise<string> => {
  const overrideFolder = DRIVE_FOLDERS.logs;
  if (overrideFolder) return overrideFolder;

  const ampFolder = DRIVE_FOLDERS.amp;
  if (!ampFolder) {
    throw new Error('Google Drive Station folder is not configured. Please set it in Settings.');
  }
  let logsId = await findFileInFolderCaseInsensitive('logs', ampFolder);
  if (!logsId) {
    logsId = await findFileInFolderCaseInsensitive('Logs', ampFolder);
  }
  if (!logsId) {
    logsId = await createFileInFolder('logs', ampFolder, 'application/vnd.google-apps.folder');
  }
  return logsId;
};

/**
 * Resolves or creates the 'media_announcements' folder strictly inside the AMP station root on Google Drive.
 */
export const getOrCreateDriveAnnouncementsFolder = async (): Promise<string> => {
  const overrideFolder = DRIVE_FOLDERS.announcements || DRIVE_FOLDERS.mp3s;
  if (overrideFolder) return overrideFolder;

  const rootFolder = DRIVE_FOLDERS.amp;
  if (!rootFolder) {
    throw new Error('Google Drive Station folder is not configured. Please set it in Settings.');
  }
  const isConnValid = await validateGoogleDriveAccess();
  if (!isConnValid) {
    throw new Error('Google Drive connection validation failed. Cannot safely resolve announcements folder.');
  }
  let folderId = await findFileInFolderCaseInsensitive('media_announcements', rootFolder);
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('MediaAnnouncements', rootFolder);
  }
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('Media_Announcements', rootFolder);
  }
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('Announcements', rootFolder);
  }
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('announcements', rootFolder);
  }
  if (!folderId) {
    folderId = await createFileInFolder('media_announcements', rootFolder, 'application/vnd.google-apps.folder');
  }
  return folderId;
};

/**
 * Resolves or creates the 'media_evergreens' folder strictly inside the AMP station root on Google Drive.
 */
export const getOrCreateDriveEvergreensFolder = async (): Promise<string> => {
  const overrideFolder = DRIVE_FOLDERS.evergreens;
  if (overrideFolder) return overrideFolder;

  const rootFolder = DRIVE_FOLDERS.amp;
  if (!rootFolder) {
    throw new Error('Google Drive Station folder is not configured. Please set it in Settings.');
  }
  const isConnValid = await validateGoogleDriveAccess();
  if (!isConnValid) {
    throw new Error('Google Drive connection validation failed. Cannot safely resolve evergreens folder.');
  }
  let folderId = await findFileInFolderCaseInsensitive('media_evergreens', rootFolder);
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('MediaEvergreens', rootFolder);
  }
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('Media_Evergreens', rootFolder);
  }
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('Evergreens', rootFolder);
  }
  if (!folderId) {
    folderId = await createFileInFolder('media_evergreens', rootFolder, 'application/vnd.google-apps.folder');
  }
  return folderId;
};

/**
 * Resolves or creates the 'media_shows' folder strictly inside the AMP station root on Google Drive.
 */
export const getOrCreateDriveShowsFolder = async (): Promise<string> => {
  const overrideFolder = DRIVE_FOLDERS.shows;
  if (overrideFolder) return overrideFolder;

  const rootFolder = DRIVE_FOLDERS.amp;
  if (!rootFolder) {
    throw new Error('Google Drive Station folder is not configured. Please set it in Settings.');
  }
  const isConnValid = await validateGoogleDriveAccess();
  if (!isConnValid) {
    throw new Error('Google Drive connection validation failed. Cannot safely resolve shows folder.');
  }
  let folderId = await findFileInFolderCaseInsensitive('media_shows', rootFolder);
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('MediaShows', rootFolder);
  }
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('Media_Shows', rootFolder);
  }
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('Shows', rootFolder);
  }
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('Playlists', rootFolder);
  }
  if (!folderId) {
    folderId = await createFileInFolder('media_shows', rootFolder, 'application/vnd.google-apps.folder');
  }
  return folderId;
};

// Backwards compatibility alias
export const getOrCreateDrivePlaylistsFolder = getOrCreateDriveShowsFolder;

/**
 * Resolves or creates a 'loghistory' folder inside the logs folder on Google Drive
 */
export async function getOrCreateDriveLogHistoryFolder(parentFolderId?: string): Promise<string> {
  const targetParent = parentFolderId || await getOrCreateDriveLogsFolder();
  let historyFolderId = await findFileInFolderCaseInsensitive('loghistory', targetParent);
  if (!historyFolderId) {
    historyFolderId = await findFileInFolderCaseInsensitive('LogHistory', targetParent);
  }
  if (!historyFolderId) {
    historyFolderId = await findFileInFolderCaseInsensitive('backups', targetParent);
  }
  if (!historyFolderId) {
    historyFolderId = await createFileInFolder('loghistory', targetParent, 'application/vnd.google-apps.folder');
  }
  return historyFolderId;
}

/**
 * Load schedules from Drive announcements.json in settings folder (or legacy preferences folder)
 */
export const loadCalendarFromDrive = async (): Promise<Announcement[]> => {
  try {
    const settingsFolder = await getOrCreateDriveSettingsFolder();
    let fileId = await findFileInFolder('announcements.json', settingsFolder);
    if (!fileId) {
      // Create empty announcements.json if not found
      fileId = await createFileInFolder('announcements.json', settingsFolder);
      await uploadFileContent(fileId, JSON.stringify({ AnnouncementsBackupCounter: 0, data: [] }));
      return [];
    }
    const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
    const jsonStr = await res.text();
    const parsed = JSON.parse(jsonStr || '[]');
    let rawList: Announcement[] = [];
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      rawList = Array.isArray(parsed.data) ? parsed.data : [];
    } else {
      rawList = Array.isArray(parsed) ? parsed : [];
    }
    return normalizeAnnouncements(rawList);
  } catch (err) {
    console.error('Error loading schedules from Google Drive:', err);
    throw err;
  }
};

/**
 * Save schedules to Drive announcements.json in settings folder
 */
export const saveCalendarToDrive = async (schedules: Announcement[]): Promise<void> => {
  try {
    const settingsFolder = await getOrCreateDriveSettingsFolder();
    let fileId = await findFileInFolder('announcements.json', settingsFolder);
    if (!fileId) {
      fileId = await createFileInFolder('announcements.json', settingsFolder);
    }
    let counter = 0;
    try {
      const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
      const jsonStr = await res.text();
      const parsed = JSON.parse(jsonStr || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        counter = parsed.AnnouncementsBackupCounter || 0;
      }
    } catch (e) {}
    const normalizedSchedules = normalizeAnnouncements(schedules);
    await uploadFileContent(fileId, JSON.stringify({ AnnouncementsBackupCounter: counter, data: normalizedSchedules }, null, 2));
  } catch (err) {
    console.error('Error saving schedules to Google Drive:', err);
    throw err;
  }
};

/**
 * Load shows from Drive shows.json in settings folder
 */
export const loadShowsFromDrive = async (): Promise<Show[]> => {
  try {
    const settingsFolder = await getOrCreateDriveSettingsFolder();
    let fileId = await findFileInFolder('shows.json', settingsFolder);
    if (!fileId) {
      fileId = await createFileInFolder('shows.json', settingsFolder);
      await uploadFileContent(fileId, JSON.stringify({ ShowsBackupCounter: 0, data: [] }, null, 2));
      return [];
    }
    const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
    const jsonStr = await res.text();
    const parsed = JSON.parse(jsonStr || '[]');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Array.isArray(parsed.data) ? parsed.data : [];
    }
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading shows from Google Drive:', err);
    throw err;
  }
};

/**
 * Save shows to Drive shows.json in settings folder
 */
export const saveShowsToDrive = async (shows: Show[]): Promise<void> => {
  try {
    const settingsFolder = await getOrCreateDriveSettingsFolder();
    let fileId = await findFileInFolder('shows.json', settingsFolder);
    if (!fileId) {
      fileId = await createFileInFolder('shows.json', settingsFolder);
    }
    let counter = 0;
    try {
      const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
      const jsonStr = await res.text();
      const parsed = JSON.parse(jsonStr || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        counter = parsed.ShowsBackupCounter || 0;
      }
    } catch (e) {}
    counter += 1;
    await uploadFileContent(fileId, JSON.stringify({ ShowsBackupCounter: counter, data: shows }, null, 2));
  } catch (err) {
    console.error('Error saving shows to Google Drive:', err);
    throw err;
  }
};

/**
 * Load logs from Drive logs.json in logs folder
 */
export const loadLogsFromDrive = async (): Promise<LogEntry[]> => {
  try {
    const logsFolder = await getOrCreateDriveLogsFolder();
    let fileId = await findFileInFolder('logs.json', logsFolder);
    if (!fileId) {
      fileId = await createFileInFolder('logs.json', logsFolder);
      await uploadFileContent(fileId, JSON.stringify({ LogsBackupCounter: 0, data: [] }));
      return [];
    }
    const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
    const jsonStr = await res.text();
    const parsed = JSON.parse(jsonStr || '[]');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Array.isArray(parsed.data) ? parsed.data : [];
    }
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading logs from Google Drive:', err);
    throw err;
  }
};

/**
 * Save logs array to Drive logs.json in logs folder
 */
export const saveLogsToDrive = async (logs: LogEntry[]): Promise<void> => {
  try {
    const logsFolder = await getOrCreateDriveLogsFolder();
    let fileId = await findFileInFolder('logs.json', logsFolder);
    if (!fileId) {
      fileId = await createFileInFolder('logs.json', logsFolder);
    }
    let counter = 0;
    try {
      const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
      const jsonStr = await res.text();
      const parsed = JSON.parse(jsonStr || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        counter = parsed.LogsBackupCounter || 0;
      }
    } catch (e) {}
    await uploadFileContent(fileId, JSON.stringify({ LogsBackupCounter: counter, data: logs }, null, 2));
  } catch (err) {
    console.error('Error saving logs to Google Drive:', err);
    throw err;
  }
};

/**
 * Append single log to Drive logs.json (concurrency friendly)
 */
export const appendLogToDrive = async (entry: LogEntry): Promise<LogEntry[]> => {
  try {
    const logsFolder = await getOrCreateDriveLogsFolder();
    let fileId = await findFileInFolder('logs.json', logsFolder);
    let logs: LogEntry[] = [];
    let counter = 0;
    if (!fileId) {
      fileId = await createFileInFolder('logs.json', logsFolder);
    } else {
      try {
        const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
        const text = await res.text();
        const parsed = JSON.parse(text || '[]');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          logs = Array.isArray(parsed.data) ? parsed.data : [];
          counter = parsed.LogsBackupCounter || 0;
        } else {
          logs = Array.isArray(parsed) ? parsed : [];
        }
      } catch (e) {
        console.warn('Could not load existing logs to append, rewriting:', e);
      }
    }
    logs.push(entry);
    await uploadFileContent(fileId, JSON.stringify({ LogsBackupCounter: counter, data: logs }, null, 2));
    return logs;
  } catch (err) {
    console.error('Error appending log to Google Drive:', err);
    throw err;
  }
};

/**
 * Resolves or creates a 'backups' folder inside a parent folder on Google Drive
 */
async function getOrCreateBackupsFolder(parentFolderId: string): Promise<string> {
  let backupsFolderId = await findFileInFolder('backups', parentFolderId);
  if (!backupsFolderId) {
    backupsFolderId = await createFileInFolder('backups', parentFolderId, 'application/vnd.google-apps.folder');
  }
  return backupsFolderId;
}

/**
 * Trigger archiving backup copies in Google Drive
 */
export const triggerDriveBackup = async (appMode?: string): Promise<void> => {
  // 1. Backup schedules
  try {
    const settingsFolder = await getOrCreateDriveSettingsFolder();
    if (settingsFolder) {
      let fileId = await findFileInFolder('announcements.json', settingsFolder);
      if (!fileId) {
        fileId = await createFileInFolder('announcements.json', settingsFolder);
        await uploadFileContent(fileId, JSON.stringify({ AnnouncementsBackupCounter: 0, data: [] }));
      }
      if (fileId) {
        let parsed: any;
        try {
          const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
          const jsonStr = await res.text();
          parsed = JSON.parse(jsonStr || '[]');
        } catch {
          parsed = [];
        }

        let arrayData = Array.isArray(parsed) ? parsed : (parsed.data || []);
        let currentCounter = Array.isArray(parsed) ? 1 : ((parsed.AnnouncementsBackupCounter || 0) + 1);

        const updatedObj = {
          AnnouncementsBackupCounter: currentCounter,
          data: arrayData
        };

        const updatedStr = JSON.stringify(updatedObj, null, 2);
        await uploadFileContent(fileId, updatedStr);

        const backupName = generateBackupFilename('announcements', appMode || 'DRIVE');
        const backupsFolderId = await getOrCreateBackupsFolder(settingsFolder);
        let backupFileId = await findFileInFolder(backupName, backupsFolderId);
        if (!backupFileId) {
          backupFileId = await createFileInFolder(backupName, backupsFolderId);
        }
        await uploadFileContent(backupFileId, updatedStr);
      }
    }
  } catch (err) {
    console.error('Failed to backup schedules in Drive:', err);
    throw err;
  }

  // 2. Backup logs
  try {
    const logsFolder = await getOrCreateDriveLogsFolder();
    if (logsFolder) {
      let fileId = await findFileInFolder('logs.json', logsFolder);
      if (!fileId) {
        fileId = await createFileInFolder('logs.json', logsFolder);
        await uploadFileContent(fileId, JSON.stringify({ LogsBackupCounter: 0, data: [] }));
      }
      if (fileId) {
        let parsed: any;
        try {
          const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
          const jsonStr = await res.text();
          parsed = JSON.parse(jsonStr || '[]');
        } catch {
          parsed = [];
        }

        let arrayData = Array.isArray(parsed) ? parsed : (parsed.data || []);
        let currentCounter = Array.isArray(parsed) ? 1 : ((parsed.LogsBackupCounter || 0) + 1);

        const updatedObj = {
          LogsBackupCounter: currentCounter,
          data: arrayData
        };

        const updatedStr = JSON.stringify(updatedObj, null, 2);
        await uploadFileContent(fileId, updatedStr);

        const backupName = generateBackupFilename('logs', appMode || 'DRIVE');
        const backupsFolderId = await getOrCreateDriveLogHistoryFolder(logsFolder);
        let backupFileId = await findFileInFolder(backupName, backupsFolderId);
        if (!backupFileId) {
          backupFileId = await createFileInFolder(backupName, backupsFolderId);
        }
        await uploadFileContent(backupFileId, updatedStr);
      }
    }
  } catch (err) {
    console.error('Failed to backup logs in Drive:', err);
    throw err;
  }

  // 3. Backup shows
  try {
    const settingsFolder = await getOrCreateDriveSettingsFolder();
    if (settingsFolder) {
      let fileId = await findFileInFolder('shows.json', settingsFolder);
      if (!fileId) {
        fileId = await createFileInFolder('shows.json', settingsFolder);
        await uploadFileContent(fileId, JSON.stringify({ ShowsBackupCounter: 0, data: [] }, null, 2));
      }
      if (fileId) {
        let parsed: any;
        try {
          const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
          const jsonStr = await res.text();
          parsed = JSON.parse(jsonStr || '[]');
        } catch {
          parsed = [];
        }

        let arrayData = Array.isArray(parsed) ? parsed : (parsed.data || []);
        let currentCounter = Array.isArray(parsed) ? 1 : ((parsed.ShowsBackupCounter || 0) + 1);

        const updatedObj = {
          ShowsBackupCounter: currentCounter,
          data: arrayData
        };

        const updatedStr = JSON.stringify(updatedObj, null, 2);
        await uploadFileContent(fileId, updatedStr);

        const backupName = generateBackupFilename('shows', appMode || 'DRIVE');
        const backupsFolderId = await getOrCreateBackupsFolder(settingsFolder);
        let backupFileId = await findFileInFolder(backupName, backupsFolderId);
        if (!backupFileId) {
          backupFileId = await createFileInFolder(backupName, backupsFolderId);
        }
        await uploadFileContent(backupFileId, updatedStr);
      }
    }
  } catch (err) {
    console.error('Failed to backup shows in Drive:', err);
    throw err;
  }
};


// Memory cache + LocalStorage backup for persistent filenames
export const driveFileNameCache = {
  get: (url: string): string | undefined => {
    try {
      const cached = localStorage.getItem(`drive_filename_${url}`);
      return cached || undefined;
    } catch {
      return undefined;
    }
  },
  set: (url: string, name: string): void => {
    try {
      localStorage.setItem(`drive_filename_${url}`, name);
    } catch {
      // Ignore
    }
  },
  has: (url: string): boolean => {
    try {
      return !!localStorage.getItem(`drive_filename_${url}`);
    } catch {
      return false;
    }
  }
};

/**
 * Lists MP3 files from Drive media_announcements (or legacy Announcements) folder
 */
export interface DriveMP3 {
  name: string;
  size: string;
  duration: string;
  path: string;
}

export const listMP3sFromDrive = async (): Promise<DriveMP3[]> => {
  try {
    const announcementsFolderId = await getOrCreateDriveAnnouncementsFolder();
    if (!announcementsFolderId) return [];

    const query = encodeURIComponent(`'${announcementsFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`);
    const res = await driveFetch(`drive/v3/files?q=${query}&fields=files(id,name,size)&pageSize=1000`);
    const data = await res.json();
    if (!data.files) return [];
    
    return data.files.map((file: any) => {
      const sizeBytes = parseInt(file.size || '0');
      const sizeMB = sizeBytes ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : '0.1 MB';
      const path = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
      
      // Store filename mapping in cache
      driveFileNameCache.set(path, file.name);
      
      return {
        name: file.name,
        size: sizeMB,
        duration: '', // Loaded dynamically at runtime
        path: path
      };
    });
  } catch (err) {
    console.error('Error listing MP3s from Google Drive Announcements folder:', err);
    return [];
  }
};

/**
 * Resolves a URL to a playable one, utilizing the cache or attaching the token if needed
 */
export const getPlayableUrl = (url: string | undefined): string => {
  if (!url) return '';
  
  let resolvedUrl = url;
  const fileInCache = availableFilesCache.get(url);
  if (fileInCache && fileInCache.path) {
    resolvedUrl = fileInCache.path;
  }

  if (mp3BlobCache.has(resolvedUrl)) {
    return mp3BlobCache.get(resolvedUrl)!;
  }
  const token = getAccessToken();
  if (resolvedUrl.includes('googleapis.com') && token) {
    return `${resolvedUrl}&access_token=${token}`;
  }
  if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://') && !resolvedUrl.startsWith('blob:') && !resolvedUrl.startsWith('/')) {
    return `/api/media/stream?path=${encodeURIComponent(resolvedUrl)}`;
  }
  return resolvedUrl;
};

export interface DriveValidationResult {
  valid: boolean;
  tokenValid: boolean;
  tokenUser?: { email: string; displayName: string };
  checkedFolders: {
    amp?: { id: string; ok: boolean; status?: number; name?: string };
    preferences?: { id: string; ok: boolean; status?: number; name?: string };
    announcements?: { id: string; ok: boolean; status?: number; name?: string };
    evergreens?: { id: string; ok: boolean; status?: number; name?: string };
    shows?: { id: string; ok: boolean; status?: number; name?: string };
    logs?: { id: string; ok: boolean; status?: number; name?: string };
  };
  errorMessage?: string;
  warningMessage?: string;
}

export const verifyGoogleDriveDetails = async (
  foldersOverride?: Partial<LocationSettings>,
  tokenOverride?: string
): Promise<DriveValidationResult> => {
  const token = tokenOverride || getAccessToken();
  if (!token) {
    return {
      valid: false,
      tokenValid: false,
      checkedFolders: {},
      errorMessage: 'Missing Google authentication token. Please connect your Google account.'
    };
  }

  const settings = { ...getSavedSettings(), ...(foldersOverride || {}) };
  if (settings.mode === 'Demo') {
    return {
      valid: true,
      tokenValid: true,
      checkedFolders: {}
    };
  }

  // 1. Inspect token info for expiration and scopes
  let tokenUser: { email: string; displayName: string } | undefined;
  try {
    const tokenInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (tokenInfoRes.ok) {
      const info = await tokenInfoRes.json();
      if (info.email) {
        tokenUser = { email: info.email, displayName: info.email.split('@')[0] };
      }
      // Check if user specifically requested drive.appdata scope instead of full drive
      const scopes = (info.scope || '').split(' ');
      const hasDriveScope = scopes.some((s: string) => s === 'https://www.googleapis.com/auth/drive' || s === 'https://www.googleapis.com/auth/drive.file');
      if (!hasDriveScope && scopes.includes('https://www.googleapis.com/auth/drive.appdata')) {
        return {
          valid: false,
          tokenValid: false,
          tokenUser,
          checkedFolders: {},
          errorMessage: 'Token was issued with scope "drive.appdata", which only allows access to hidden app data. In Google OAuth Playground, select "https://www.googleapis.com/auth/drive" in Step 1 so AMP can read your station audio files and logs.'
        };
      }
    } else if (tokenInfoRes.status === 400 || tokenInfoRes.status === 401) {
      return {
        valid: false,
        tokenValid: false,
        checkedFolders: {},
        errorMessage: 'Google token is invalid or has expired. Please generate a fresh access token.'
      };
    }
  } catch (e) {
    console.warn('tokeninfo check non-fatal error:', e);
  }

  // 2. Validate token directly with Google Drive API /about
  try {
    const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user&supportsAllDrives=true', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!aboutRes.ok) {
      console.warn('Google Drive token validation failed:', aboutRes.status);
      return {
        valid: false,
        tokenValid: false,
        checkedFolders: {},
        errorMessage: `Google token rejected by Drive API (HTTP ${aboutRes.status}). Check if token is expired or lacks Drive read/write permissions (https://www.googleapis.com/auth/drive).`
      };
    }
    const aboutData = await aboutRes.json().catch(() => ({}));
    if (aboutData.user) {
      tokenUser = {
        email: aboutData.user.emailAddress || tokenUser?.email || '',
        displayName: aboutData.user.displayName || tokenUser?.displayName || 'Google User'
      };
    }
  } catch (err: any) {
    console.warn('Network error during Google Drive token verification:', err);
    return {
      valid: false,
      tokenValid: false,
      checkedFolders: {},
      errorMessage: `Failed to reach Google Drive API: ${err?.message || 'Network error'}`
    };
  }

  // Token is verified!
  const checkedFolders: DriveValidationResult['checkedFolders'] = {};

  const checkFolder = async (folderId: string): Promise<{ ok: boolean; status?: number; name?: string }> => {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,trashed&supportsAllDrives=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, status: res.status, name: data.name };
      }
      return { ok: false, status: res.status };
    } catch (e) {
      return { ok: false };
    }
  };

  const ampFolder = (settings.driveFolderAmp || '').trim();
  const logsFolder = (settings.driveFolderLogs || '').trim();
  const announcementsFolder = (settings.driveFolderAnnouncements || settings.driveFolderMP3s || '').trim();
  const evergreensFolder = (settings.driveFolderEvergreens || '').trim();
  const showsFolder = (settings.driveFolderShows || '').trim();
  const prefsFolder = (settings.driveFolderPreferences || '').trim();

  // If Main Top-Level Station Drive folder is set:
  if (ampFolder) {
    const ampRes = await checkFolder(ampFolder);
    checkedFolders.amp = { id: ampFolder, ...ampRes };
    if (!ampRes.ok) {
      const reason = ampRes.status === 404 ? 'Folder not found' : ampRes.status === 403 ? 'Access denied' : `HTTP ${ampRes.status || 'unknown'}`;
      return {
        valid: false,
        tokenValid: true,
        tokenUser,
        checkedFolders,
        errorMessage: `Main Station folder (${ampFolder}) could not be accessed (${reason}). Ensure the folder exists in Google Drive and is shared with ${tokenUser?.email || 'your account'}.`
      };
    }

    // Check any non-empty legacy overrides if explicitly provided
    const overrideErrors: string[] = [];
    if (prefsFolder) {
      const res = await checkFolder(prefsFolder);
      checkedFolders.preferences = { id: prefsFolder, ...res };
      if (!res.ok) overrideErrors.push(`Preferences override folder (${prefsFolder}) not accessible`);
    }
    if (announcementsFolder) {
      const res = await checkFolder(announcementsFolder);
      checkedFolders.announcements = { id: announcementsFolder, ...res };
      if (!res.ok) overrideErrors.push(`Announcements override folder (${announcementsFolder}) not accessible`);
    }
    if (evergreensFolder) {
      const res = await checkFolder(evergreensFolder);
      checkedFolders.evergreens = { id: evergreensFolder, ...res };
      if (!res.ok) overrideErrors.push(`Evergreens override folder (${evergreensFolder}) not accessible`);
    }
    if (showsFolder) {
      const res = await checkFolder(showsFolder);
      checkedFolders.shows = { id: showsFolder, ...res };
      if (!res.ok) overrideErrors.push(`Shows override folder (${showsFolder}) not accessible`);
    }
    if (logsFolder) {
      const res = await checkFolder(logsFolder);
      checkedFolders.logs = { id: logsFolder, ...res };
      if (!res.ok) overrideErrors.push(`Logs override folder (${logsFolder}) not accessible`);
    }

    if (overrideErrors.length > 0) {
      return {
        valid: false,
        tokenValid: true,
        tokenUser,
        checkedFolders,
        errorMessage: overrideErrors.join('; ')
      };
    }

    return {
      valid: true,
      tokenValid: true,
      tokenUser,
      checkedFolders
    };
  }

  // If Main Top-Level Station Drive folder is NOT set:
  const foldersToCheck = [
    { key: 'preferences', id: prefsFolder, label: 'Preferences' },
    { key: 'announcements', id: announcementsFolder, label: 'Announcements' },
    { key: 'evergreens', id: evergreensFolder, label: 'Evergreens' },
    { key: 'shows', id: showsFolder, label: 'Shows' },
    { key: 'logs', id: logsFolder, label: 'Logs' }
  ].filter(f => !!f.id);

  if (foldersToCheck.length === 0) {
    // Token is valid, but no folders configured yet
    return {
      valid: true,
      tokenValid: true,
      tokenUser,
      checkedFolders,
      warningMessage: 'Google account authenticated. Please configure the AMP Station folder above.'
    };
  }

  const errors: string[] = [];
  for (const f of foldersToCheck) {
    const res = await checkFolder(f.id);
    (checkedFolders as any)[f.key] = { id: f.id, ...res };
    if (!res.ok) {
      errors.push(`${f.label} folder (${f.id}) not accessible`);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      tokenValid: true,
      tokenUser,
      checkedFolders,
      errorMessage: errors.join('; ')
    };
  }

  return {
    valid: true,
    tokenValid: true,
    tokenUser,
    checkedFolders
  };
};

export const validateGoogleDriveAccess = async (
  foldersOverride?: Partial<LocationSettings>,
  tokenOverride?: string
): Promise<boolean> => {
  const result = await verifyGoogleDriveDetails(foldersOverride, tokenOverride);
  return result.valid;
};

export const checkEvergreenFolderOnDrive = async (
  oldNameShort: string | undefined,
  newNameShort: string | undefined
): Promise<{ success: boolean; oldExists: boolean; newExists: boolean }> => {
  try {
    const evergreensId = await getOrCreateDriveEvergreensFolder();
    const playlistsId = await getOrCreateDrivePlaylistsFolder();

    const oldEvergreenExists = oldNameShort ? (await findFileInFolderCaseInsensitive(oldNameShort, evergreensId) !== null) : false;
    const oldPlaylistExists = oldNameShort ? (await findFileInFolderCaseInsensitive(oldNameShort, playlistsId) !== null) : false;
    const oldExists = oldEvergreenExists || oldPlaylistExists;

    const newEvergreenExists = newNameShort ? (await findFileInFolderCaseInsensitive(newNameShort, evergreensId) !== null) : false;
    const newPlaylistExists = newNameShort ? (await findFileInFolderCaseInsensitive(newNameShort, playlistsId) !== null) : false;
    const newExists = newEvergreenExists || newPlaylistExists;

    return { success: true, oldExists, newExists };
  } catch (err: any) {
    console.error('Error checking evergreen/playlist folder on Drive:', err);
    throw err;
  }
};

export const applyEvergreenChangeOnDrive = async (
  action: 'create' | 'update',
  nameShort: string,
  oldNameShort?: string,
  renameFolder?: boolean
): Promise<{ success: boolean; folderCreated: boolean; folderRenamed: boolean }> => {
  try {
    const evergreensId = await getOrCreateDriveEvergreensFolder();
    const playlistsId = await getOrCreateDrivePlaylistsFolder();

    let folderCreated = false;
    let folderRenamed = false;

    const token = getAccessToken();
    if (!token) throw new Error('Not authenticated with Google');

    // Sync Evergreens
    const newEvergreenFolderId = await findFileInFolderCaseInsensitive(nameShort, evergreensId);
    if (action === 'update' && oldNameShort && oldNameShort !== nameShort) {
      const oldEvergreenFolderId = await findFileInFolderCaseInsensitive(oldNameShort, evergreensId);
      if (oldEvergreenFolderId && renameFolder) {
        if (!newEvergreenFolderId || newEvergreenFolderId === oldEvergreenFolderId) {
          await driveFetch(`drive/v3/files/${oldEvergreenFolderId}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: nameShort })
          });
          folderRenamed = true;
        }
      } else if (!newEvergreenFolderId) {
        await createFileInFolder(nameShort, evergreensId, 'application/vnd.google-apps.folder');
        folderCreated = true;
      }
    } else if (!newEvergreenFolderId) {
      await createFileInFolder(nameShort, evergreensId, 'application/vnd.google-apps.folder');
      folderCreated = true;
    }

    // Sync Playlists
    const newPlaylistFolderId = await findFileInFolderCaseInsensitive(nameShort, playlistsId);
    if (action === 'update' && oldNameShort && oldNameShort !== nameShort) {
      const oldPlaylistFolderId = await findFileInFolderCaseInsensitive(oldNameShort, playlistsId);
      if (oldPlaylistFolderId && renameFolder) {
        if (!newPlaylistFolderId || newPlaylistFolderId === oldPlaylistFolderId) {
          await driveFetch(`drive/v3/files/${oldPlaylistFolderId}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: nameShort })
          });
          folderRenamed = true;
        }
      } else if (!newPlaylistFolderId) {
        await createFileInFolder(nameShort, playlistsId, 'application/vnd.google-apps.folder');
        folderCreated = true;
      }
    } else if (!newPlaylistFolderId) {
      await createFileInFolder(nameShort, playlistsId, 'application/vnd.google-apps.folder');
      folderCreated = true;
    }

    return { success: true, folderCreated, folderRenamed };
  } catch (err: any) {
    console.error('Error applying evergreen/playlist change on Drive:', err);
    throw err;
  }
};

export const verifyEvergreensOnDrive = async (shows: Show[]): Promise<{
  success: boolean;
  evergreensFolderCreated: boolean;
  playlistsFolderCreated: boolean;
  announcementsFolderCreated: boolean;
  evergreensPath: string;
  playlistsPath: string;
  announcementsPath: string;
  createdFolders: string[];
}> => {
  try {
    const isConnValid = await validateGoogleDriveAccess();
    if (!isConnValid) {
      throw new Error('Google Drive connection validation failed. Aborting evergreen/announcements folder verification to prevent duplicates.');
    }

    const evergreensId = await getOrCreateDriveEvergreensFolder();
    const playlistsId = await getOrCreateDriveShowsFolder();
    const announcementsId = await getOrCreateDriveAnnouncementsFolder();

    const createdFolders: string[] = [];
    for (const show of shows) {
      if (show.nameShort) {
        const showFolderId = await findFileInFolderCaseInsensitive(show.nameShort, evergreensId);
        if (!showFolderId) {
          await createFileInFolder(show.nameShort, evergreensId, 'application/vnd.google-apps.folder');
          if (!createdFolders.includes(show.nameShort)) {
            createdFolders.push(show.nameShort);
          }
        }

        const showPlaylistFolderId = await findFileInFolderCaseInsensitive(show.nameShort, playlistsId);
        if (!showPlaylistFolderId) {
          await createFileInFolder(show.nameShort, playlistsId, 'application/vnd.google-apps.folder');
          if (!createdFolders.includes(show.nameShort)) {
            createdFolders.push(show.nameShort);
          }
        }
      }
    }

    const isAmp = !!DRIVE_FOLDERS.amp;

    return {
      success: true,
      evergreensFolderCreated: false,
      playlistsFolderCreated: false,
      announcementsFolderCreated: false,
      evergreensPath: isAmp ? 'Google Drive: [Station]/media_evergreens' : 'Google Drive: /medialibrary/Evergreens',
      playlistsPath: isAmp ? 'Google Drive: [Station]/media_shows' : 'Google Drive: /medialibrary/Playlists',
      announcementsPath: isAmp ? 'Google Drive: [Station]/media_announcements' : 'Google Drive: /medialibrary/Announcements',
      createdFolders
    };
  } catch (err: any) {
    console.error('Error in verifyEvergreensOnDrive:', err);
    throw err;
  }
};

export const loadPlaylistTracksFromDrive = async (
  showNameShort?: string,
  showName?: string,
  mode: 'Local' | 'Drive' | 'Demo' = 'Drive',
  parentFolder: 'Playlists' | 'Evergreens' = 'Playlists',
  targetSubfolder?: string
): Promise<{ tracks: Array<{ id: string; fileName: string; title: string; durationSeconds: number; durationFormatted: string; streamUrl: string }>; playlistFile: string | null }> => {
  const getDemoTracks = (nameKey: string) => {
    return [
      {
        id: `demo-track-1`,
        fileName: `${nameKey}_Track_01.mp3`,
        title: `${nameKey} - Track 01`,
        durationSeconds: 180,
        durationFormatted: '3:00',
        streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
      },
      {
        id: `demo-track-2`,
        fileName: `${nameKey}_Track_02.mp3`,
        title: `${nameKey} - Track 02`,
        durationSeconds: 210,
        durationFormatted: '3:30',
        streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'
      },
      {
        id: `demo-track-3`,
        fileName: `${nameKey}_Track_03.mp3`,
        title: `${nameKey} - Track 03`,
        durationSeconds: 240,
        durationFormatted: '4:00',
        streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
      }
    ];
  };

  const primaryKey = showNameShort || showName || 'Show';

  if (mode === 'Demo') {
    const tracks = getDemoTracks(primaryKey);
    tracks.forEach(t => {
      availableFilesCache.set(t.fileName, { path: t.streamUrl, size: '0.1 MB', duration: t.durationFormatted });
      driveFileNameCache.set(t.streamUrl, t.fileName);
    });
    return { tracks, playlistFile: null };
  }

  try {
    const playlistsId = parentFolder === 'Evergreens' ? await getOrCreateDriveEvergreensFolder() : await getOrCreateDrivePlaylistsFolder();
    let showFolderId: string | null = null;
    if (showNameShort) {
      showFolderId = await findFileInFolderCaseInsensitive(showNameShort, playlistsId);
    }
    if (!showFolderId && showName) {
      showFolderId = await findFileInFolderCaseInsensitive(showName, playlistsId);
    }

    if (!showFolderId) {
      return { tracks: [], playlistFile: null };
    }

    if (targetSubfolder && targetSubfolder !== '.') {
      const subFolderId = await findFileInFolderCaseInsensitive(targetSubfolder, showFolderId);
      if (subFolderId) {
        showFolderId = subFolderId;
      }
    }

    const files = await listFilesInFolder(showFolderId);
    const m3uFile = files.find(f => f.name.toLowerCase().endsWith('.m3u') || f.name.toLowerCase().endsWith('.m3u8'));

    const tracks: Array<{ id: string; fileName: string; title: string; durationSeconds: number; durationFormatted: string; streamUrl: string }> = [];
    let playlistFileName: string | null = null;
    const audioExtensions = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'aiff', 'aif'];

    if (m3uFile) {
      playlistFileName = m3uFile.name;
      try {
        const m3uRes = await driveFetch(`drive/v3/files/${m3uFile.id}?alt=media`);
        const m3uText = await m3uRes.text();
        const lines = m3uText.split(/\r?\n/);

        let pendingTitle: string | null = null;
        let pendingDuration: number | null = null;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('#EXTINF:')) {
            const rest = trimmed.substring(8);
            const commaIdx = rest.indexOf(',');
            if (commaIdx !== -1) {
              const durSec = parseInt(rest.substring(0, commaIdx).trim(), 10);
              if (!isNaN(durSec) && durSec > 0) pendingDuration = durSec;
              pendingTitle = rest.substring(commaIdx + 1).trim();
            }
          } else if (!trimmed.startsWith('#')) {
            const cleanPath = trimmed.replace(/\\/g, '/');
            let targetName = cleanPath.split('/').pop() || cleanPath;
            try {
              targetName = decodeURIComponent(targetName);
            } catch (e) {}

            const normTarget = targetName.toLowerCase().trim();
            const matchedAudio = files.find(f => {
              const normF = f.name.toLowerCase().trim();
              return normF === normTarget || normF === normTarget.replace(/%20/g, ' ');
            });
            if (matchedAudio) {
              const streamUrl = `https://www.googleapis.com/drive/v3/files/${matchedAudio.id}?alt=media`;
              const durationSec = pendingDuration || 180;
              const m = Math.floor(durationSec / 60);
              const s = Math.floor(durationSec % 60);
              const durationFormatted = `${m}:${s.toString().padStart(2, '0')}`;
              const title = pendingTitle || matchedAudio.name.replace(/\.[^/.]+$/, '');

              tracks.push({
                id: `drive-track-${tracks.length + 1}`,
                fileName: matchedAudio.name,
                title,
                durationSeconds: durationSec,
                durationFormatted,
                streamUrl
              });
            }
            pendingTitle = null;
            pendingDuration = null;
          }
        }

        // Loose files in directory not referenced in M3U
        const m3uFileNames = new Set(tracks.map(t => t.fileName.toLowerCase()));
        const looseFiles = files.filter(f => {
          const ext = f.name.toLowerCase().split('.').pop();
          return ext && audioExtensions.includes(ext) && !m3uFileNames.has(f.name.toLowerCase());
        });
        looseFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        looseFiles.forEach(f => {
          const streamUrl = `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`;
          tracks.push({
            id: `drive-track-${tracks.length + 1}`,
            fileName: f.name,
            title: f.name.replace(/\.[^/.]+$/, ''),
            durationSeconds: 180,
            durationFormatted: '3:00',
            streamUrl
          });
        });
      } catch (e) {
        console.warn('Error reading M3U file from Google Drive:', e);
      }
    }

    if (tracks.length === 0) {
      const audioFiles = files.filter(f => {
        const ext = f.name.toLowerCase().split('.').pop();
        return ext && audioExtensions.includes(ext);
      });

      audioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      audioFiles.forEach((f, idx) => {
        const streamUrl = `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`;
        tracks.push({
          id: `drive-track-${idx + 1}`,
          fileName: f.name,
          title: f.name.replace(/\.[^/.]+$/, ''),
          durationSeconds: 180,
          durationFormatted: '3:00',
          streamUrl
        });
      });
    }

    tracks.forEach(t => {
      availableFilesCache.set(t.fileName, { path: t.streamUrl, size: '0.1 MB', duration: t.durationFormatted });
      driveFileNameCache.set(t.streamUrl, t.fileName);
    });

    return { tracks, playlistFile: playlistFileName };

  } catch (err) {
    console.error('Error loading playlist tracks from Google Drive:', err);
    return { tracks: [], playlistFile: null };
  }
};

export const checkPlaylistShowFilesOnDrive = async (
  currentShowNameShort?: string,
  currentShowName?: string,
  nextShowNameShort?: string,
  nextShowName?: string,
  mode: 'Local' | 'Drive' | 'Demo' = 'Drive'
): Promise<{
  currentShowFileCount: number;
  currentShowFolderCount: number;
  nextShowFileCount: number;
  nextShowFolderCount: number;
}> => {
  if (mode === 'Demo') {
    return {
      currentShowFileCount: (currentShowNameShort || currentShowName) ? 3 : 0,
      currentShowFolderCount: (currentShowNameShort || currentShowName) ? 1 : 0,
      nextShowFileCount: (nextShowNameShort || nextShowName) ? 3 : 0,
      nextShowFolderCount: (nextShowNameShort || nextShowName) ? 1 : 0
    };
  }

  try {
    const playlistsId = await getOrCreateDrivePlaylistsFolder();

    const getShowCount = async (shortName?: string, name?: string): Promise<{ fileCount: number; folderCount: number }> => {
      if (!shortName && !name) return { fileCount: 0, folderCount: 0 };
      let showFolderId: string | null = null;
      if (shortName) {
        showFolderId = await findFileInFolderCaseInsensitive(shortName, playlistsId);
      }
      if (!showFolderId && name) {
        showFolderId = await findFileInFolderCaseInsensitive(name, playlistsId);
      }
      if (!showFolderId) return { fileCount: 0, folderCount: 0 };

      const files = await listFilesInFolder(showFolderId);
      const m3uFile = files.find(f => f.name.toLowerCase().endsWith('.m3u') || f.name.toLowerCase().endsWith('.m3u8'));

      if (m3uFile) {
        try {
          const m3uRes = await driveFetch(`drive/v3/files/${m3uFile.id}?alt=media`);
          const m3uText = await m3uRes.text();
          const lines = m3uText.split(/\r?\n/);
          let count = 0;
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) count++;
          }
          if (count > 0) return { fileCount: count, folderCount: 1 };
        } catch (e) {}
      }

      const audioFiles = files.filter(f => {
        const ext = f.name.toLowerCase().split('.').pop();
        return ext && ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext);
      });
      return { fileCount: audioFiles.length, folderCount: audioFiles.length > 0 ? 1 : 0 };
    };

    const currentStats = await getShowCount(currentShowNameShort, currentShowName);
    const nextStats = await getShowCount(nextShowNameShort, nextShowName);

    return {
      currentShowFileCount: currentStats.fileCount,
      currentShowFolderCount: currentStats.folderCount,
      nextShowFileCount: nextStats.fileCount,
      nextShowFolderCount: nextStats.folderCount
    };
  } catch (err) {
    console.error('Error checking playlist show files on Google Drive:', err);
    return {
      currentShowFileCount: 0,
      currentShowFolderCount: 0,
      nextShowFileCount: 0,
      nextShowFolderCount: 0
    };
  }
};

export const formatShowPlaylistLogFileName = (showNameShort: string, showStartTime?: string | Date): string => {
  const safeShowName = String(showNameShort || 'Show').replace(/[\/\\?%*:|"<>]/g, '_');
  const dateObj = showStartTime ? new Date(showStartTime) : new Date();
  const YYYY = dateObj.getFullYear();
  const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
  const DD = String(dateObj.getDate()).padStart(2, '0');
  const HH = String(dateObj.getHours()).padStart(2, '0');
  const min = String(dateObj.getMinutes()).padStart(2, '0');
  return `Log_${safeShowName}_${YYYY}_${MM}_${DD}_at_${HH}_${min}.json`;
};

const playlistLogFileIdCache = new Map<string, string>();
const playlistLogSaveQueue = new Map<string, Promise<string>>();

export const saveShowPlaylistLogToDrive = async (
  showNameShort: string,
  showName: string,
  showStartTime: string | Date | undefined,
  logData: any,
  parentFolder: 'Playlists' | 'Evergreens' = 'Playlists'
): Promise<string> => {
  const fileName = formatShowPlaylistLogFileName(showNameShort || showName, showStartTime);

  const previousSave = playlistLogSaveQueue.get(fileName) || Promise.resolve('');

  const currentSave = (async () => {
    try {
      await previousSave;
    } catch (e) {}

    const playlistsId = parentFolder === 'Evergreens' ? await getOrCreateDriveEvergreensFolder() : await getOrCreateDrivePlaylistsFolder();
    let showFolderId = await findFileInFolderCaseInsensitive(showNameShort, playlistsId);
    if (!showFolderId && showName) {
      showFolderId = await findFileInFolderCaseInsensitive(showName, playlistsId);
    }
    if (!showFolderId) {
      showFolderId = await createFileInFolder(showNameShort || showName, playlistsId, 'application/vnd.google-apps.folder');
    }

    let fileId = playlistLogFileIdCache.get(fileName) || null;

    if (!fileId) {
      fileId = await findFileInFolderCaseInsensitive(fileName, showFolderId);
    }

    const jsonStr = JSON.stringify(logData, null, 2);

    if (!fileId) {
      fileId = await createFileInFolder(fileName, showFolderId, 'application/json');
    }

    if (fileId) {
      playlistLogFileIdCache.set(fileName, fileId);
      await uploadFileContent(fileId, jsonStr, 'application/json');
    }

    return fileName;
  })();

  playlistLogSaveQueue.set(fileName, currentSave);
  return await currentSave;
};

export const loadShowPlaylistLogFromDrive = async (
  showNameShort: string,
  showName: string,
  showStartTime: string | Date | undefined,
  parentFolder: 'Playlists' | 'Evergreens' = 'Playlists'
): Promise<any | null> => {
  try {
    const playlistsId = parentFolder === 'Evergreens' ? await getOrCreateDriveEvergreensFolder() : await getOrCreateDrivePlaylistsFolder();
    let showFolderId = await findFileInFolderCaseInsensitive(showNameShort, playlistsId);
    if (!showFolderId && showName) {
      showFolderId = await findFileInFolderCaseInsensitive(showName, playlistsId);
    }
    if (!showFolderId) return null;

    const fileName = formatShowPlaylistLogFileName(showNameShort || showName, showStartTime);
    const fileId = playlistLogFileIdCache.get(fileName) || await findFileInFolderCaseInsensitive(fileName, showFolderId);
    if (!fileId) return null;

    playlistLogFileIdCache.set(fileName, fileId);

    const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('Error loading show playlist log from Drive:', err);
    return null;
  }
};

export const checkMissingDriveItems = async (
  settingsOverride?: Partial<LocationSettings>
): Promise<{ hasMissing: boolean; missingItems: string[]; targetFolderDesc: string }> => {
  const currentToken = getAccessToken();
  if (!currentToken) {
    return { hasMissing: false, missingItems: [], targetFolderDesc: '' };
  }

  const s = { ...getSavedSettings(), ...(settingsOverride || {}) };
  const rootFolderId = s.driveFolderAmp;
  if (!rootFolderId) {
    return { hasMissing: false, missingItems: [], targetFolderDesc: '' };
  }

  const missingItems: string[] = [];

  try {
    const rootRes = await driveFetch(`drive/v3/files/${rootFolderId}?fields=id,name`);
    if (!rootRes.ok) {
      return { hasMissing: true, missingItems: ['AMP folder'], targetFolderDesc: rootFolderId };
    }
    const rootData = await rootRes.json();
    const targetFolderDesc = rootData.name || rootFolderId;

    const settingsFolder = s.driveFolderPreferences || await findFileInFolderCaseInsensitive('settings', rootFolderId) || await findFileInFolderCaseInsensitive('preferences', rootFolderId);
    if (!settingsFolder) {
      missingItems.push('settings folder');
    } else {
      const announcementsFile = await findFileInFolderCaseInsensitive('announcements.json', settingsFolder);
      if (!announcementsFile) {
        missingItems.push('announcements.json');
      }
      const showsFile = await findFileInFolderCaseInsensitive('shows.json', settingsFolder);
      if (!showsFile) {
        missingItems.push('shows.json');
      }
    }

    const logsFolder = s.driveFolderLogs || await findFileInFolderCaseInsensitive('logs', rootFolderId);
    if (!logsFolder) {
      missingItems.push('logs folder');
    } else {
      const logsFile = await findFileInFolderCaseInsensitive('logs.json', logsFolder);
      if (!logsFile) {
        missingItems.push('logs.json');
      }
    }

    const announcementsFolder = s.driveFolderAnnouncements || s.driveFolderMP3s || await findFileInFolderCaseInsensitive('media_announcements', rootFolderId);
    if (!announcementsFolder) {
      missingItems.push('media_announcements folder');
    }

    const evergreensFolder = s.driveFolderEvergreens || await findFileInFolderCaseInsensitive('media_evergreens', rootFolderId);
    if (!evergreensFolder) {
      missingItems.push('media_evergreens folder');
    }

    const showsFolder = s.driveFolderShows || await findFileInFolderCaseInsensitive('media_shows', rootFolderId);
    if (!showsFolder) {
      missingItems.push('media_shows folder');
    }

    return {
      hasMissing: missingItems.length > 0,
      missingItems,
      targetFolderDesc
    };
  } catch (err) {
    console.warn('Error checking missing Drive items:', err);
    return { hasMissing: false, missingItems: [], targetFolderDesc: rootFolderId };
  }
};

