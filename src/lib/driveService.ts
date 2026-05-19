import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { Schedule, LogEntry } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App & Auth
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const provider = new GoogleAuthProvider();
// Required Scope for reading and writing files in Drive
provider.addScope('https://www.googleapis.com/auth/drive');

let cachedAccessToken: string | null = null;
let currentAuthUser: User | null = null;
let isSigningIn = false;

// Folders
let activeDriveFolders = {
  logs: '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx',
  mp3s: '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch',
  preferences: '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED'
};

export const setDriveFoldersConfig = (config: { logs: string; mp3s: string; preferences: string }) => {
  activeDriveFolders = { ...config };
};

export const DRIVE_FOLDERS = {
  get logs() {
    return activeDriveFolders.logs;
  },
  get mp3s() {
    return activeDriveFolders.mp3s;
  },
  get preferences() {
    return activeDriveFolders.preferences;
  }
};

// Listen to Auth changes
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    currentAuthUser = user;
    if (user) {
      // In Firebase Auth, we need to extract the accessToken from the User Credential on sign-in,
      // or we can refresh it. Since Firebase doesn't persist the raw provider accessToken in onAuthStateChanged directly
      // on page refresh, we can request the user to authenticate, or we can look up if we have cached it session-wise.
      // If we don't have cachedAccessToken, we might prompt for signIn on direct reload which is standard.
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // Fallback or trigger failure to sign in again
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve access token from Google Auth');
    }
    cachedAccessToken = credential.accessToken;
    currentAuthUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const getCurrentUser = (): User | null => {
  return currentAuthUser;
};

export const handleLogout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  currentAuthUser = null;
  // Revoke cached Blob URLs to free up memory
  clearAudioCache();
};

// Memory Cache for MP3 binary blobs to provide immediate playback and zero latency
export const mp3BlobCache = new Map<string, string>(); // Maps raw URL (e.g. googleapis drive url) to local Blob URL

export const clearAudioCache = () => {
  for (const blobUrl of mp3BlobCache.values()) {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.warn('Failed to revoke object URL:', e);
    }
  }
  mp3BlobCache.clear();
};

/**
 * Download an MP3 from Drive into memory cache
 */
export const cacheMP3 = async (url: string, token: string): Promise<string> => {
  if (mp3BlobCache.has(url)) {
    return mp3BlobCache.get(url)!;
  }

  const isDriveUrl = url.includes('googleapis.com') || url.includes('drive.google.com');
  if (!isDriveUrl) {
    // Non-Drive URLs cannot be fetched via standard browser XMLHttpRequest/fetch due to CORS
    // (e.g., soundhelix.com pages are not CORS accessible).
    // They are played properly using standard HTML5 <audio> without CORS if we supply the URL directly.
    return url;
  }

  // If it's a Drive URL, download with oauth bearer token
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch MP3 from url: ${res.statusText}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    mp3BlobCache.set(url, blobUrl);
    return blobUrl;
  } catch (err) {
    console.error(`Error caching MP3 (${url}):`, err);
    throw err;
  }
};

/**
 * Clean up the audio memory cache by revoking files that are no longer part of active schedules.
 */
export const updateAudioCache = async (activeUrls: string[], token: string | null) => {
  // 1. Purge urls no longer needed
  const activeSet = new Set(activeUrls);
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

  // 2. Pre-cache newly active urls if token is available
  if (token) {
    await Promise.allSettled(
      activeUrls.map(url => {
        if (!mp3BlobCache.has(url)) {
          return cacheMP3(url, token);
        }
        return Promise.resolve();
      })
    );
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

  const res = await fetch(`https://www.googleapis.com/${endpoint}`, {
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
  const query = encodeURIComponent(`name = '${name}' and '${folderId}' in parents and trashed = false`);
  const res = await driveFetch(`drive/v3/files?q=${query}&fields=files(id,name)`);
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
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
  await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
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
 * Load schedules from Drive schedules.json in folder
 */
export const loadSchedulesFromDrive = async (): Promise<Schedule[]> => {
  try {
    let fileId = await findFileInFolder('schedules.json', DRIVE_FOLDERS.preferences);
    if (!fileId) {
      // Create empty schedules.json if not found
      fileId = await createFileInFolder('schedules.json', DRIVE_FOLDERS.preferences);
      await uploadFileContent(fileId, JSON.stringify([]));
      return [];
    }
    const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
    const jsonStr = await res.text();
    const parsed = JSON.parse(jsonStr || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading schedules from Google Drive:', err);
    throw err;
  }
};

/**
 * Save schedules to Drive schedules.json
 */
export const saveSchedulesToDrive = async (schedules: Schedule[]): Promise<void> => {
  try {
    let fileId = await findFileInFolder('schedules.json', DRIVE_FOLDERS.preferences);
    if (!fileId) {
      fileId = await createFileInFolder('schedules.json', DRIVE_FOLDERS.preferences);
    }
    await uploadFileContent(fileId, JSON.stringify(schedules, null, 2));
  } catch (err) {
    console.error('Error saving schedules to Google Drive:', err);
    throw err;
  }
};

/**
 * Load logs from Drive logs.json
 */
export const loadLogsFromDrive = async (): Promise<LogEntry[]> => {
  try {
    let fileId = await findFileInFolder('logs.json', DRIVE_FOLDERS.logs);
    if (!fileId) {
      fileId = await createFileInFolder('logs.json', DRIVE_FOLDERS.logs);
      await uploadFileContent(fileId, JSON.stringify([]));
      return [];
    }
    const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
    const jsonStr = await res.text();
    const parsed = JSON.parse(jsonStr || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading logs from Google Drive:', err);
    throw err;
  }
};

/**
 * Save logs array to Drive logs.json
 */
export const saveLogsToDrive = async (logs: LogEntry[]): Promise<void> => {
  try {
    let fileId = await findFileInFolder('logs.json', DRIVE_FOLDERS.logs);
    if (!fileId) {
      fileId = await createFileInFolder('logs.json', DRIVE_FOLDERS.logs);
    }
    await uploadFileContent(fileId, JSON.stringify(logs, null, 2));
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
    let fileId = await findFileInFolder('logs.json', DRIVE_FOLDERS.logs);
    let logs: LogEntry[] = [];
    if (!fileId) {
      fileId = await createFileInFolder('logs.json', DRIVE_FOLDERS.logs);
    } else {
      try {
        const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
        const text = await res.text();
        logs = JSON.parse(text || '[]');
      } catch (e) {
        console.warn('Could not load existing logs to append, rewriting:', e);
      }
    }
    logs.push(entry);
    await uploadFileContent(fileId, JSON.stringify(logs, null, 2));
    return logs;
  } catch (err) {
    console.error('Error appending log to Google Drive:', err);
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
 * Lists MP3 files from Drive mp3s folder
 */
export interface DriveMP3 {
  name: string;
  size: string;
  duration: string;
  path: string;
}

export const listMP3sFromDrive = async (): Promise<DriveMP3[]> => {
  try {
    const query = encodeURIComponent(`'${DRIVE_FOLDERS.mp3s}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`);
    const res = await driveFetch(`drive/v3/files?q=${query}&fields=files(id,name,size)&pageSize=100`);
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
        duration: '0:15', // Default standard mock duration for scheduling chimes
        path: path
      };
    });
  } catch (err) {
    console.error('Error listing MP3s from Google Drive:', err);
    return [];
  }
};

/**
 * Resolves a URL to a playable one, utilizing the cache or attaching the token if needed
 */
export const getPlayableUrl = (url: string | undefined): string => {
  if (!url) return '';
  if (mp3BlobCache.has(url)) {
    return mp3BlobCache.get(url)!;
  }
  const token = getAccessToken();
  if (url.includes('googleapis.com') && token) {
    return `${url}&access_token=${token}`;
  }
  return url;
};

export const validateGoogleDriveAccess = async (): Promise<boolean> => {
  const token = getAccessToken();
  if (!token) return false;

  try {
    const resPref = await fetch(`https://www.googleapis.com/drive/v3/files/${DRIVE_FOLDERS.preferences}?fields=id,name`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const resMp3 = await fetch(`https://www.googleapis.com/drive/v3/files/${DRIVE_FOLDERS.mp3s}?fields=id,name`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const resLogs = await fetch(`https://www.googleapis.com/drive/v3/files/${DRIVE_FOLDERS.logs}?fields=id,name`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (resPref.ok && resMp3.ok && resLogs.ok) {
      console.log('Google Drive folder validation succeeded');
      return true;
    } else {
      console.warn('One or more Google Drive folder requests failed:', {
        pref: resPref.status,
        mp3: resMp3.status,
        logs: resLogs.status
      });
      return false;
    }
  } catch (err) {
    console.error('Error validating Google Drive shared links:', err);
    return false;
  }
};
