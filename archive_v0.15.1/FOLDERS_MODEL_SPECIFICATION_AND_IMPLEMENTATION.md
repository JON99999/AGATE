# Folders Model Specification & Implementation Blueprint
**Document Version**: 1.1.0  
**Target Environment**: Electron Desktop Container (macOS arm64/x64, Windows 10/11), Express Local Backend (`server.ts`), and Google Drive Cloud Services (`src/lib/driveService.ts`)  
**Status**: Authoritative Reference Specification  

---

## 1. Executive Architectural Overview & Rationale

### 1.1 The Problem: Fragmented 3-Entity Model (Local & Google Drive)
In earlier versions of **Interstitial-er** (v0.1.0 – v0.13.0), the application required radio broadcasters to manually configure and link three independent directory locations or Google Drive folder IDs:
1. **Media / MP3s**: `localPathMP3s` (Local) / `driveFolderMP3s` (Google Drive)
2. **Audit & Playout Logs**: `localPathLogs` (Local) / `driveFolderLogs` (Google Drive)
3. **Calendar & Schedules**: `localPathCalendar` (Local) / `driveFolderPreferences` (Google Drive)

This tripartite configuration introduced operational friction in both environments:
* **Path & Folder ID Mismatches**: Broadcasters frequently pasted mismatched Google Drive IDs or local drive letters, pointing logs to one project and media or schedules to another, leading to desynchronization, permission errors, or silent logging failures.
* **Complex Multi-Step Setup**: Workstation setups required navigating three separate directory pickers or copying three distinct Google Drive URL identifiers before the station was operational.
* **Inconsistent Naming & Hierarchy**: Audio subfolders (`Interstitials` vs `interstitials`, `Evergreens` vs `evergreens`, `Playlists` vs `playlists`) created discrepancies across platforms.

### 1.2 The Solution: Unified "AGATE Station Location" Model
The **AGATE Station Location** model consolidates all application persistence into a **single root station directory or Google Drive folder**:
* **Local Mode**: `localPathAgate` (e.g., `/Users/studio/AGATE`, `C:\RadioStation\AGATE`, or mounted `/Volumes/AGATE`).
* **Google Drive Mode**: `driveFolderAgate` (e.g., Google Drive Folder ID `1ABC...xyz` or station folder URL).

Key architectural principles:
* **Strict Symmetrical Hierarchy**: The internal folder structure is **100% identical** whether running against local storage, mounted network storage, or direct Google Drive cloud storage.
* **One-Click Workstation & Cloud Provisioning**: Selecting or creating a single root folder allows the application to automatically validate, create, and seed all required subdirectories and JSON database stores in one atomic operation.
* **100% Backward Compatibility**: Legacy split setups (where physical drive constraints or existing Google Drive folders require separate targets) remain fully supported via an **Advanced / Legacy Folder Overrides** collapsible disclosure in the UI.
* **Hybrid Split Support**: Aligns with the hybrid model where Player workstations read locally synced folders without in-app cloud logins, while Admins manage schedules via direct cloud APIs.

---

## 2. Standardized Station Directory & Cloud Structure

The internal structure is standardized and identical across both **Local Filesystem** and **Google Drive Cloud Storage**:

```text
[AGATE_STATION_ROOT]/                        # Local path (localPathAgate) or Drive folder (driveFolderAgate)
├── logs/                                    # Playout logging database and rotation vault
│   ├── logs.json                            # Active broadcast playout log database
│   └── loghistory/                          # Rotated/archived historic logs & daily exports
├── settings/                                # Scheduler databases & configuration
│   ├── interstitials.json                   # Scheduled interstitial carts, categories, & rules
│   ├── shows.json                           # Master show schedules, evergreen links, & time slots
│   └── backups/                             # Atomic, timestamped rollbacks of settings files
├── media_announcements/                     # Audio carts, station IDs, legal IDs, underwriting spots
├── media_evergreens/                        # Prerecorded evergreen show audio repository
│   └── [ShowNameShort]/                     # Specific show evergreen audio files (.mp3, .wav)
└── media_shows/                             # Scheduled shows, episodic audio, & track playlists
    └── [ShowNameShort]/                     # Show track media (.mp3, .wav, .m4a) & .m3u playlists
```

### 2.1 Mapping Table: Legacy Entities to AGATE Standard

| Legacy Entity | Legacy Local Path | Legacy Drive Setting | AGATE Standard Subfolder | Purpose & Asset Types |
| :--- | :--- | :--- | :--- | :--- |
| **Station Root** | N/A (fragmented) | N/A (fragmented) | `[AGATE_ROOT]/` | Primary master directory on local OS or Google Drive |
| **Calendar / Schedules** | `localPathCalendar` | `driveFolderPreferences` | `[AGATE_ROOT]/settings/` | Houses `interstitials.json`, `shows.json`, and `backups/` |
| **Broadcast Logs** | `localPathLogs` | `driveFolderLogs` | `[AGATE_ROOT]/logs/` | Houses active `logs.json` and rotated archive folder `loghistory/` |
| **Interstitials / Carts**| `localPathMP3s/Interstitials`| `driveFolderMP3s/Interstitials` | `[AGATE_ROOT]/media_announcements/` | Station IDs, underwriting, promos, PSA audio files |
| **Evergreen Shows** | `localPathMP3s/Evergreens` | `driveFolderMP3s/Evergreens` | `[AGATE_ROOT]/media_evergreens/` | Backup / evergreen episode audio organized by `ShowNameShort` |
| **Show Playlists** | `localPathMP3s/Playlists` | `driveFolderMP3s/Playlists` | `[AGATE_ROOT]/media_shows/` | Active broadcast playlists, `.m3u` files, and show tracks |

---

## 3. Data Schemas & TypeScript Interfaces

### 3.1 Client & Cloud Location Settings (`src/lib/driveService.ts`)

```typescript
export interface LocationPathsOverride {
  logs?: string | null;
  loghistory?: string | null;
  settings?: string | null;
  media_announcements?: string | null;
  media_evergreens?: string | null;
  media_shows?: string | null;
  logsFile?: string | null;
  interstitialsFile?: string | null;
  showsFile?: string | null;
}

export interface LocationSettings {
  mode: 'Local' | 'Drive' | 'Demo';
  localPathAgate: string;                      // Primary unified Station Location root (Local)
  driveFolderAgate?: string;                   // Primary unified Station Location root (Google Drive)
  paths?: LocationPathsOverride;               // Optional explicit subfolder overrides
  // Legacy paths preserved for backward compatibility
  localPathMP3s: string;
  localPathLogs: string;
  localPathCalendar: string;
  driveFolderLogs: string;
  driveFolderMP3s: string;
  driveFolderPreferences: string;
}
```

### 3.2 Server-Side Configuration Interfaces (`server.ts`)

```typescript
export interface ServerSettings {
  mode: 'Local' | 'Drive' | 'Demo';
  localPathAgate: string;                      // Primary unified Station Location root (Local)
  driveFolderAgate?: string;                   // Primary unified Station Location root (Google Drive)
  paths?: LocationPathsOverride;               // Optional explicit subfolder overrides
  // Legacy paths preserved for backward compatibility
  localPathMP3s: string;
  localPathLogs: string;
  localPathCalendar: string;
  driveFolderLogs: string;
  driveFolderMP3s: string;
  driveFolderPreferences: string;
}
```

### 3.3 Default Settings Store (`agate_settings.json`)

```json
{
  "mode": "Local",
  "localPathAgate": "",
  "driveFolderAgate": "",
  "paths": {
    "logs": null,
    "loghistory": null,
    "settings": null,
    "media_announcements": null,
    "media_evergreens": null,
    "media_shows": null,
    "logsFile": null,
    "interstitialsFile": null,
    "showsFile": null
  },
  "localPathMP3s": "",
  "localPathLogs": "",
  "localPathCalendar": "",
  "driveFolderLogs": "",
  "driveFolderMP3s": "",
  "driveFolderPreferences": ""
}
```

---

## 4. Universal Backend Path Resolution Engine

To allow the server to operate seamlessly across both the unified AGATE Station Location and legacy individual paths, the backend utilizes hierarchical path resolution helpers. Each helper checks for:
1. **Explicit Granular Override** (in `settings.paths.*`)
2. **Unified AGATE Root Subfolder** (in `settings.localPathAgate/*`)
3. **Legacy Fallback Directory** (in `settings.localPath*`)

### 4.1 Resolution Helpers Implementation (`server.ts`)

```typescript
// 1. Logs Directory Resolver
function getAgateLogsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.logs && fs.existsSync(settings.paths.logs)) {
    return settings.paths.logs;
  }
  if (settings.localPathAgate && fs.existsSync(settings.localPathAgate)) {
    return path.join(settings.localPathAgate, 'logs');
  }
  if (settings.localPathLogs && fs.existsSync(settings.localPathLogs)) {
    return settings.localPathLogs;
  }
  return null;
}

// 2. Settings & Schedules Directory Resolver
function getAgateSettingsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.settings && fs.existsSync(settings.paths.settings)) {
    return settings.paths.settings;
  }
  if (settings.localPathAgate && fs.existsSync(settings.localPathAgate)) {
    return path.join(settings.localPathAgate, 'settings');
  }
  if (settings.localPathCalendar && fs.existsSync(settings.localPathCalendar)) {
    return settings.localPathCalendar;
  }
  return null;
}

// 3. Media Announcements / Interstitials Directory Resolver
function getAgateMediaAnnouncementsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.media_announcements && fs.existsSync(settings.paths.media_announcements)) {
    return settings.paths.media_announcements;
  }
  if (settings.localPathAgate && fs.existsSync(settings.localPathAgate)) {
    const p1 = path.join(settings.localPathAgate, 'media_announcements');
    if (fs.existsSync(p1)) return p1;
    return p1; // Return path for auto-creation if needed
  }
  if (settings.localPathMP3s && fs.existsSync(settings.localPathMP3s)) {
    const p1 = path.join(settings.localPathMP3s, 'Interstitials');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathMP3s, 'interstitials');
    if (fs.existsSync(p2)) return p2;
    return settings.localPathMP3s;
  }
  return null;
}

// 4. Media Evergreens Directory Resolver
function getAgateMediaEvergreensDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.media_evergreens && fs.existsSync(settings.paths.media_evergreens)) {
    return settings.paths.media_evergreens;
  }
  if (settings.localPathAgate && fs.existsSync(settings.localPathAgate)) {
    return path.join(settings.localPathAgate, 'media_evergreens');
  }
  if (settings.localPathMP3s && fs.existsSync(settings.localPathMP3s)) {
    const p1 = path.join(settings.localPathMP3s, 'Evergreens');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathMP3s, 'evergreens');
    if (fs.existsSync(p2)) return p2;
    return settings.localPathMP3s;
  }
  return null;
}

// 5. Media Shows / Playlists Directory Resolver
function getAgateMediaShowsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.media_shows && fs.existsSync(settings.paths.media_shows)) {
    return settings.paths.media_shows;
  }
  if (settings.localPathAgate && fs.existsSync(settings.localPathAgate)) {
    return path.join(settings.localPathAgate, 'media_shows');
  }
  if (settings.localPathMP3s && fs.existsSync(settings.localPathMP3s)) {
    const p1 = path.join(settings.localPathMP3s, 'Playlists');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathMP3s, 'playlists');
    if (fs.existsSync(p2)) return p2;
    return settings.localPathMP3s;
  }
  return null;
}
```

---

## 5. Universal Google Drive Cloud Hierarchy Resolution Engine (`src/lib/driveService.ts`)

In Google Drive mode, the application resolves folders symmetrically with the local filesystem. When an operator sets `driveFolderAgate` to a Google Drive folder ID, the client-side Google Drive service resolves all subfolders relative to this root ID. If a subfolder does not yet exist on Google Drive, it is dynamically created via the Drive v3 REST API.

### 5.1 Root Folder Accessor (`DRIVE_FOLDERS`)

```typescript
export const DRIVE_FOLDERS = {
  get agate() {
    const settings = getSavedSettings();
    return settings.driveFolderAgate || '';
  },
  get logs() {
    const settings = getSavedSettings();
    if (settings.mode === 'Demo') return '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx';
    return settings.driveFolderLogs || '';
  },
  get mp3s() {
    const settings = getSavedSettings();
    if (settings.mode === 'Demo') return '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch';
    return settings.driveFolderMP3s || '';
  },
  get preferences() {
    const settings = getSavedSettings();
    if (settings.mode === 'Demo') return '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED';
    return settings.driveFolderPreferences || '';
  }
};
```

### 5.2 Google Drive Subfolder Resolvers

#### 1. Settings & Schedules Folder Resolver (`getOrCreateDriveSettingsFolder`)
Resolves the `settings/` folder inside the AGATE Drive root. In legacy mode, it falls back to `DRIVE_FOLDERS.preferences`.

```typescript
export const getOrCreateDriveSettingsFolder = async (): Promise<string> => {
  const agateFolder = DRIVE_FOLDERS.agate;
  if (agateFolder) {
    let settingsId = await findFileInFolderCaseInsensitive('settings', agateFolder);
    if (!settingsId) {
      settingsId = await createFileInFolder('settings', agateFolder, 'application/vnd.google-apps.folder');
    }
    return settingsId;
  }
  const prefsFolder = DRIVE_FOLDERS.preferences;
  if (!prefsFolder) {
    throw new Error('Google Drive Station or Preferences folder is not configured. Please set it in Settings.');
  }
  return prefsFolder;
};
```

#### 2. Playout Logs Folder Resolver (`getOrCreateDriveLogsFolder`)
Resolves the `logs/` folder inside the AGATE Drive root. In legacy mode, it falls back to `DRIVE_FOLDERS.logs`.

```typescript
export const getOrCreateDriveLogsFolder = async (): Promise<string> => {
  const agateFolder = DRIVE_FOLDERS.agate;
  if (agateFolder) {
    let logsId = await findFileInFolderCaseInsensitive('logs', agateFolder);
    if (!logsId) {
      logsId = await createFileInFolder('logs', agateFolder, 'application/vnd.google-apps.folder');
    }
    return logsId;
  }
  const logsFolder = DRIVE_FOLDERS.logs;
  if (!logsFolder) {
    throw new Error('Google Drive Station or Logs folder is not configured. Please set it in Settings.');
  }
  return logsFolder;
};
```

#### 3. Playout Log History Archive Folder Resolver (`getOrCreateDriveLogHistoryFolder`)
Resolves or creates the `loghistory/` subfolder inside the `logs/` folder for historical playback archives and rotation snapshots.

```typescript
export async function getOrCreateDriveLogHistoryFolder(parentFolderId?: string): Promise<string> {
  const targetParent = parentFolderId || await getOrCreateDriveLogsFolder();
  let historyFolderId = await findFileInFolderCaseInsensitive('loghistory', targetParent);
  if (!historyFolderId) {
    historyFolderId = await createFileInFolder('loghistory', targetParent, 'application/vnd.google-apps.folder');
  }
  return historyFolderId;
}
```

#### 4. Media Announcements / Interstitials Folder Resolver (`getOrCreateDriveAnnouncementsFolder`)
Checks case-insensitively for `media_announcements`, then legacy `Interstitials`, then `interstitials` inside the AGATE Drive root (or legacy `mp3s` folder). Automatically creates `media_announcements` when operating under the unified AGATE root.

```typescript
export const getOrCreateDriveAnnouncementsFolder = async (): Promise<string> => {
  const rootFolder = DRIVE_FOLDERS.agate || DRIVE_FOLDERS.mp3s;
  if (!rootFolder) {
    throw new Error('Google Drive Station or Media folder is not configured. Please set it in Settings.');
  }
  const isConnValid = await validateGoogleDriveAccess();
  if (!isConnValid) {
    throw new Error('Google Drive connection validation failed. Cannot safely resolve announcements folder.');
  }
  let folderId = await findFileInFolderCaseInsensitive('media_announcements', rootFolder);
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('Interstitials', rootFolder);
  }
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('interstitials', rootFolder);
  }
  if (!folderId) {
    const targetName = DRIVE_FOLDERS.agate ? 'media_announcements' : 'Interstitials';
    folderId = await createFileInFolder(targetName, rootFolder, 'application/vnd.google-apps.folder');
  }
  return folderId;
};

// Backwards compatibility alias
export const getOrCreateDriveInterstitialsFolder = getOrCreateDriveAnnouncementsFolder;
```

#### 5. Media Evergreens Folder Resolver (`getOrCreateDriveEvergreensFolder`)
Checks case-insensitively for `media_evergreens`, then legacy `Evergreens`, then `evergreens` inside the AGATE Drive root (or legacy `mp3s` folder).

```typescript
export const getOrCreateDriveEvergreensFolder = async (): Promise<string> => {
  const rootFolder = DRIVE_FOLDERS.agate || DRIVE_FOLDERS.mp3s;
  if (!rootFolder) {
    throw new Error('Google Drive Station or Media folder is not configured. Please set it in Settings.');
  }
  const isConnValid = await validateGoogleDriveAccess();
  if (!isConnValid) {
    throw new Error('Google Drive connection validation failed. Cannot safely resolve evergreens folder.');
  }
  let folderId = await findFileInFolderCaseInsensitive('media_evergreens', rootFolder);
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('Evergreens', rootFolder);
  }
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('evergreens', rootFolder);
  }
  if (!folderId) {
    const targetName = DRIVE_FOLDERS.agate ? 'media_evergreens' : 'Evergreens';
    folderId = await createFileInFolder(targetName, rootFolder, 'application/vnd.google-apps.folder');
  }
  return folderId;
};
```

#### 6. Media Shows & Playlists Folder Resolver (`getOrCreateDriveShowsFolder`)
Checks case-insensitively for `media_shows`, then legacy `Playlists`, then `playlists` inside the AGATE Drive root (or legacy `mp3s` folder).

```typescript
export const getOrCreateDriveShowsFolder = async (): Promise<string> => {
  const rootFolder = DRIVE_FOLDERS.agate || DRIVE_FOLDERS.mp3s;
  if (!rootFolder) {
    throw new Error('Google Drive Station or Media folder is not configured. Please set it in Settings.');
  }
  const isConnValid = await validateGoogleDriveAccess();
  if (!isConnValid) {
    throw new Error('Google Drive connection validation failed. Cannot safely resolve shows/playlists folder.');
  }
  let folderId = await findFileInFolderCaseInsensitive('media_shows', rootFolder);
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('Playlists', rootFolder);
  }
  if (!folderId) {
    folderId = await findFileInFolderCaseInsensitive('playlists', rootFolder);
  }
  if (!folderId) {
    const targetName = DRIVE_FOLDERS.agate ? 'media_shows' : 'Playlists';
    folderId = await createFileInFolder(targetName, rootFolder, 'application/vnd.google-apps.folder');
  }
  return folderId;
};

// Backwards compatibility alias
export const getOrCreateDrivePlaylistsFolder = getOrCreateDriveShowsFolder;
```

---

## 6. Universal Media File Resolution & Streaming Engine

Audio playback must resolve audio files regardless of whether a query passes an absolute path, a relative path, a filename, or a show identifier with subfolder specifications.

### 5.1 Universal Path Resolver (`resolveMediaFilePath`)

```typescript
function resolveMediaFilePath(query: any): string | null {
  const file = (query.path || query.file) as string;
  const showNameShort = (query.showNameShort || '') as string;
  const showName = (query.showName || '') as string;
  const folderType = (query.folderType || 'Playlists') as string;

  if (!file && !showNameShort && !showName) return null;

  // 1. Direct absolute path check
  if (file && path.isAbsolute(file) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return file;
  }

  // 2. Specific show playlist or evergreen subfolder lookup
  if (showNameShort || showName) {
    const baseDir = folderType === 'Evergreens'
      ? getAgateMediaEvergreensDir(currentSettings)
      : getAgateMediaShowsDir(currentSettings);

    if (baseDir && fs.existsSync(baseDir)) {
      const showFolderPath = findShowPlaylistFolder(baseDir, showNameShort, showName);
      if (showFolderPath && fs.existsSync(showFolderPath)) {
        if (file) {
          const cleanFileName = path.basename(file);
          const directTarget = path.join(showFolderPath, cleanFileName);
          if (fs.existsSync(directTarget) && fs.statSync(directTarget).isFile()) {
            return directTarget;
          }
          const { audioFiles } = getAllAudioAndPlaylistFiles(showFolderPath);
          const matched = audioFiles.find(a => a.name === cleanFileName || a.relPath === file);
          if (matched && fs.existsSync(matched.fullPath) && fs.statSync(matched.fullPath).isFile()) {
            return matched.fullPath;
          }
        }
      }
    }
  }

  // 3. Check relative to localPathMP3s (Legacy structures)
  const folderPath = currentSettings.localPathMP3s;
  if (folderPath && fs.existsSync(folderPath) && file) {
    const directRel = path.join(folderPath, file);
    if (fs.existsSync(directRel) && fs.statSync(directRel).isFile()) {
      return directRel;
    }

    const intersPath = path.join(folderPath, 'Interstitials', path.basename(file));
    const lowerIntersPath = path.join(folderPath, 'interstitials', path.basename(file));
    if (fs.existsSync(intersPath) && fs.statSync(intersPath).isFile()) {
      return intersPath;
    }
    if (fs.existsSync(lowerIntersPath) && fs.statSync(lowerIntersPath).isFile()) {
      return lowerIntersPath;
    }

    const resolved = findInterstitialSourceFile(folderPath, file);
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }

  // 4. Check relative to unified AGATE directories
  if (currentSettings.localPathAgate && fs.existsSync(currentSettings.localPathAgate) && file) {
    const directAgateRel = path.join(currentSettings.localPathAgate, file);
    if (fs.existsSync(directAgateRel) && fs.statSync(directAgateRel).isFile()) {
      return directAgateRel;
    }
  }

  const mediaAnnounce = getAgateMediaAnnouncementsDir(currentSettings);
  if (mediaAnnounce && fs.existsSync(mediaAnnounce) && file) {
    const p = path.join(mediaAnnounce, path.basename(file));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    const resolved = findInterstitialSourceFile(mediaAnnounce, file);
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }

  const mediaEvergreens = getAgateMediaEvergreensDir(currentSettings);
  if (mediaEvergreens && fs.existsSync(mediaEvergreens) && file) {
    const p = path.join(mediaEvergreens, file);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    const resolved = findInterstitialSourceFile(mediaEvergreens, file);
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }

  const mediaShows = getAgateMediaShowsDir(currentSettings);
  if (mediaShows && fs.existsSync(mediaShows) && file) {
    const p = path.join(mediaShows, file);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    const resolved = findInterstitialSourceFile(mediaShows, file);
    if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }

  return null;
}
```

### 5.2 HTTP 206 Partial Content Streaming Engine (`streamMediaFile`)

```typescript
function streamMediaFile(req: express.Request, res: express.Response) {
  try {
    const targetFilePath = resolveMediaFilePath(req.query);
    if (!targetFilePath || !fs.existsSync(targetFilePath) || !fs.statSync(targetFilePath).isFile()) {
      return res.status(404).send('Media file not found');
    }

    const stat = fs.statSync(targetFilePath);
    const fileSize = stat.size;
    const ext = path.extname(targetFilePath).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac',
      '.txt': 'text/plain; charset=utf-8',
      '.pdf': 'application/pdf',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const range = req.headers.range;
    if (range) {
      // Parse byte range (e.g. "bytes=1048576-2097151")
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
        res.status(416).set({
          'Content-Range': `bytes */${fileSize}`,
          'Accept-Ranges': 'bytes'
        }).end();
        return;
      }

      const chunkSize = (end - start) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      const fileStream = fs.createReadStream(targetFilePath, { start, end });
      fileStream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).send('Streaming error');
        }
      });
      res.on('close', () => {
        fileStream.destroy();
      });
      fileStream.pipe(res);
    } else {
      // Standard HTTP 200 full stream
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });

      const fileStream = fs.createReadStream(targetFilePath);
      fileStream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).send('Streaming error');
        }
      });
      res.on('close', () => {
        fileStream.destroy();
      });
      fileStream.pipe(res);
    }
  } catch (e: any) {
    if (!res.headersSent) {
      res.status(500).send(e.message || 'Streaming failed');
    }
  }
}

// Unified route registrations
app.get('/api/media/stream', streamMediaFile);
app.get('/api/shows/playlist/stream-file', streamMediaFile);
```

---

## 7. Atomic Startup Gate & Verification Engine

At application startup or when paths are modified, `POST /api/startup/verify` acts as the single authoritative validation gate on the server. When operating in Google Drive mode, validation is executed client-side through OAuth token verification and the Drive REST API (`validateGoogleDriveAccess`).

### 7.1 Server-Side Implementation (`server.ts`)

```typescript
const handleStartupVerify = (req: express.Request, res: express.Response) => {
  try {
    const settings = { ...currentSettings, ...(req.body || {}) };
    const effectiveMode = settings.mode || 'Local';

    // Cloud / Demo modes bypass local path validation
    if (effectiveMode === 'Drive' || effectiveMode === 'Demo') {
      return res.json({ ready: true, status: 'READY', mode: effectiveMode });
    }

    // --- STRATEGY 1: Unified AGATE Station Location ---
    const agateRoot = settings.localPathAgate || '';
    if (agateRoot) {
      if (!fs.existsSync(agateRoot)) {
        return res.json({
          ready: false,
          status: 'INACCESSIBLE',
          message: `AGATE Station Location folder could not be accessed at: ${agateRoot}`,
          missingFolders: { agate: true }
        });
      }

      // Standard subdirectories
      const logsDir = settings.paths?.logs || path.join(agateRoot, 'logs');
      const logHistoryDir = settings.paths?.loghistory || path.join(logsDir, 'loghistory');
      const settingsDir = settings.paths?.settings || path.join(agateRoot, 'settings');
      const settingsBackupsDir = path.join(settingsDir, 'backups');
      const mediaAnnounceDir = settings.paths?.media_announcements || path.join(agateRoot, 'media_announcements');
      const mediaEvergreensDir = settings.paths?.media_evergreens || path.join(agateRoot, 'media_evergreens');
      const mediaShowsDir = settings.paths?.media_shows || path.join(agateRoot, 'media_shows');

      const dirsToEnsure = [
        logsDir,
        logHistoryDir,
        settingsDir,
        settingsBackupsDir,
        mediaAnnounceDir,
        mediaEvergreensDir,
        mediaShowsDir
      ];

      // Auto-create missing subdirectories
      dirsToEnsure.forEach(dir => {
        if (!fs.existsSync(dir)) {
          try {
            fs.mkdirSync(dir, { recursive: true });
          } catch (err) {
            console.error(`Error ensuring directory ${dir}:`, err);
          }
        }
      });

      // Atomic auto-seeding of missing database stores
      const logsFile = settings.paths?.logsFile || path.join(logsDir, 'logs.json');
      const interstitialsFile = settings.paths?.interstitialsFile || path.join(settingsDir, 'interstitials.json');
      const showsFile = settings.paths?.showsFile || path.join(settingsDir, 'shows.json');

      if (!fs.existsSync(logsFile)) {
        atomicWriteFileSync(logsFile, JSON.stringify({ LogsBackupCounter: 0, data: [] }, null, 2));
      }
      if (!fs.existsSync(interstitialsFile)) {
        atomicWriteFileSync(interstitialsFile, JSON.stringify({ InterstitialsBackupCounter: 0, data: [] }, null, 2));
      }
      if (!fs.existsSync(showsFile)) {
        atomicWriteFileSync(showsFile, JSON.stringify({ ShowsBackupCounter: 0, data: [] }, null, 2));
      }

      return res.json({
        ready: true,
        status: 'READY',
        message: 'AGATE Station Location and subdirectories verified successfully.'
      });
    }

    // --- STRATEGY 2: Legacy Fallback Individual Paths ---
    const mp3Path = settings.localPathMP3s || '';
    const calPath = settings.localPathCalendar || '';
    const logPath = settings.localPathLogs || '';

    if (!mp3Path || !calPath || !logPath) {
      return res.json({
        ready: false,
        status: 'NOT_DEFINED',
        message: 'AGATE Station Location or folder definitions are missing.',
        missingDefinitions: {
          agate: !agateRoot,
          mp3s: !mp3Path,
          calendar: !calPath,
          logs: !logPath
        }
      });
    }

    const mp3Exists = fs.existsSync(mp3Path);
    const calExists = fs.existsSync(calPath);
    const logExists = fs.existsSync(logPath);

    if (!mp3Exists || !calExists || !logExists) {
      return res.json({
        ready: false,
        status: 'INACCESSIBLE',
        message: 'Configured folders could not be accessed on the local filesystem.',
        missingFolders: {
          mp3s: !mp3Exists,
          calendar: !calExists,
          logs: !logExists
        }
      });
    }

    // Initialize legacy JSON files if missing
    const interstitialsFile = path.join(calPath, 'interstitials.json');
    const showsFile = path.join(calPath, 'shows.json');
    const logsFile = path.join(logPath, 'logs.json');

    if (!fs.existsSync(interstitialsFile)) {
      atomicWriteFileSync(interstitialsFile, JSON.stringify({ InterstitialsBackupCounter: 0, data: [] }, null, 2));
    }
    if (!fs.existsSync(showsFile)) {
      atomicWriteFileSync(showsFile, JSON.stringify({ ShowsBackupCounter: 0, data: [] }, null, 2));
    }
    if (!fs.existsSync(logsFile)) {
      atomicWriteFileSync(logsFile, JSON.stringify({ LogsBackupCounter: 0, data: [] }, null, 2));
    }

    // Ensure legacy backup directories exist
    const calBackupDir = path.join(calPath, 'backups');
    if (!fs.existsSync(calBackupDir)) {
      try { fs.mkdirSync(calBackupDir, { recursive: true }); } catch (e) {}
    }
    const logBackupDir = path.join(logPath, 'backups');
    if (!fs.existsSync(logBackupDir)) {
      try { fs.mkdirSync(logBackupDir, { recursive: true }); } catch (e) {}
    }

    // Ensure legacy media subfolders exist
    const intersDir = path.join(mp3Path, 'Interstitials');
    if (!fs.existsSync(intersDir) && !fs.existsSync(path.join(mp3Path, 'interstitials'))) {
      try { fs.mkdirSync(intersDir, { recursive: true }); } catch (e) {}
    }
    const evergreensDir = path.join(mp3Path, 'Evergreens');
    if (!fs.existsSync(evergreensDir) && !fs.existsSync(path.join(mp3Path, 'evergreens'))) {
      try { fs.mkdirSync(evergreensDir, { recursive: true }); } catch (e) {}
    }
    const playlistsDir = path.join(mp3Path, 'Playlists');
    if (!fs.existsSync(playlistsDir) && !fs.existsSync(path.join(mp3Path, 'playlists'))) {
      try { fs.mkdirSync(playlistsDir, { recursive: true }); } catch (e) {}
    }

    return res.json({
      ready: true,
      status: 'READY',
      message: 'Local paths and default data files verified successfully.'
    });
  } catch (e: any) {
    console.error('Error verifying startup paths:', e);
    return res.status(500).json({ ready: false, status: 'ERROR', message: e.message || 'Verification failure' });
  }
};

app.post('/api/startup/verify', handleStartupVerify);
app.post('/api/check-local-paths', handleStartupVerify);
app.post('/api/create-local-paths', handleStartupVerify);
```

---

## 8. Frontend Locations Modal Architecture (`src/components/LocationsModal.tsx` & `src/App.tsx`)

The UI presents the single **AGATE Station Location** prominently for both **Local Storage** and **Google Drive**, while retaining full backward compatibility for existing split-folder setups under expandable "Advanced / Legacy Overrides" disclosures.

### 8.1 Local Mode Layout (`LocationsModal.tsx`)

In Local mode, operators configure a single filesystem directory:

```tsx
{/* 1. PRIMARY SECTION: AGATE Station Location */}
<div>
  <div className="flex justify-between items-center mb-1">
    <label className="text-xs font-black uppercase text-blue-600 tracking-wider">
      AGATE Station Location
    </label>
    {!(draftLocalPathAgate || draftLocalPathCalendar) ? (
      <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-bold uppercase">
        To be set
      </span>
    ) : (
      <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-bold uppercase">
        Configured
      </span>
    )}
  </div>

  <input
    type="text"
    placeholder="e.g. /Users/name/AGATE or C:\AGATE or /Volumes/Share"
    value={draftLocalPathAgate || draftLocalPathCalendar}
    onChange={(e) => {
      if (setDraftLocalPathAgate) setDraftLocalPathAgate(e.target.value);
      setDraftLocalPathCalendar(e.target.value);
    }}
    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
  />

  <div className="flex gap-2 mt-1">
    <button
      type="button"
      onClick={() => onBrowseNative("agate")}
      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
    >
      Browse
    </button>
    {(draftLocalPathAgate || draftLocalPathCalendar) && (
      <button
        type="button"
        onClick={() => onOpenLocalPath(draftLocalPathAgate || draftLocalPathCalendar)}
        className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
      >
        Open
      </button>
    )}
  </div>
  <p className="text-xs text-slate-500 mt-0.5">
    Root station directory containing logs, settings, and media folders.
  </p>
</div>

{/* 2. ADVANCED SECTION: Collapsible Legacy Overrides */}
<details className="text-xs border border-slate-200 rounded p-2 bg-slate-50/50">
  <summary className="cursor-pointer font-bold text-slate-700 select-none">
    Advanced / Legacy Path Overrides
  </summary>
  <div className="mt-2.5 space-y-3 pt-2 border-t border-slate-200">
    {/* Settings / Schedules Override */}
    <div>
      <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
        Interstitials & Schedules Path
      </label>
      <input
        type="text"
        placeholder="Default: [AGATE]/settings"
        value={draftLocalPathCalendar}
        onChange={(e) => setDraftLocalPathCalendar(e.target.value)}
        className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900"
      />
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={() => onBrowseNative("calendar")}
          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-[11px] font-bold uppercase"
        >
          Edit
        </button>
      </div>
    </div>

    {/* Media Announcements Override */}
    <div>
      <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
        Media Announcements Directory Path
      </label>
      <input
        type="text"
        placeholder="Default: [AGATE]/media_announcements"
        value={draftLocalPathMP3s}
        onChange={(e) => setDraftLocalPathMP3s(e.target.value)}
        className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900"
      />
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={() => onBrowseNative("mp3s")}
          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-[11px] font-bold uppercase"
        >
          Edit
        </button>
      </div>
    </div>

    {/* Logs Override */}
    <div>
      <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">
        Logs Directory Path
      </label>
      <input
        type="text"
        placeholder="Default: [AGATE]/logs"
        value={draftLocalPathLogs}
        onChange={(e) => setDraftLocalPathLogs(e.target.value)}
        className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900"
      />
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={() => onBrowseNative("logs")}
          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-[11px] font-bold uppercase"
        >
          Edit
        </button>
      </div>
    </div>
  </div>
</details>
```

### 8.2 Google Drive Mode Layout (`LocationsModal.tsx`)

In Google Drive mode, the primary control is the **AGATE Station Location** Google Drive folder. Setting this folder automatically resolves all subfolders (`settings/`, `logs/`, `media_announcements/`, `media_evergreens/`, `media_shows/`) on Google Drive:

```tsx
{/* 1. PRIMARY SECTION: AGATE Station Location (Google Drive) */}
<div>
  <div className="flex justify-between items-center mb-1">
    <label className="text-xs font-black uppercase text-blue-600 tracking-wider">
      AGATE Station Location
    </label>
    {!draftDriveFolderAgate ? (
      <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-bold uppercase">
        To be set
      </span>
    ) : (
      <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-bold uppercase">
        Configured
      </span>
    )}
  </div>

  <div className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 min-h-[30px] flex items-center">
    {draftDriveFolderAgate ? (
      <div className="truncate">
        <span className="font-sans font-medium text-slate-700 mr-2">
          {driveFolderDescMap[draftDriveFolderAgate] || "Google Drive Folder"}:
        </span>
        <span className="text-slate-500">{draftDriveFolderAgate}</span>
      </div>
    ) : (
      <span className="text-slate-400 italic">No root folder configured</span>
    )}
  </div>

  <div className="flex gap-2 mt-1">
    <button
      type="button"
      onClick={() => onOpenDriveEditor("agate")}
      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
    >
      Edit
    </button>
    {draftDriveFolderAgate && (
      <button
        type="button"
        onClick={() => onOpenDriveFolder(draftDriveFolderAgate)}
        className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
      >
        Open
      </button>
    )}
  </div>
  <p className="text-xs text-slate-500 mt-0.5">
    Root station folder in Google Drive containing logs, settings, and media.
  </p>
</div>

{/* 2. ADVANCED SECTION: Collapsible Legacy Drive Overrides */}
<details className="text-xs border border-slate-200 rounded p-2 bg-slate-50/50">
  <summary className="cursor-pointer font-bold text-slate-700 select-none">
    Advanced / Legacy Drive Folder Overrides
  </summary>
  <div className="mt-2.5 space-y-3 pt-2 border-t border-slate-200">
    {/* Preferences / Settings Override */}
    {/* MP3s / Media Override */}
    {/* Logs Override */}
  </div>
</details>
```

### 8.3 Drive ID Editor Modal Handler

When clicking "Edit" for any Drive folder, `editingDriveField` specifies the active field:

```typescript
// Drive Field Editor title and save dispatch
const getTitle = () => {
  if (editingDriveField === 'agate') return 'AGATE Station Location Folder';
  if (editingDriveField === 'preferences') return 'Interstitials & Schedules Folder';
  if (editingDriveField === 'mp3s') return 'Media Announcements Folder';
  if (editingDriveField === 'logs') return 'Logs Folder';
  return 'Google Drive Folder';
};

const handleApply = () => {
  const cleanId = extractFolderId(tempDriveInput);
  if (editingDriveField === 'agate' && setDraftDriveFolderAgate) {
    setDraftDriveFolderAgate(cleanId);
  } else if (editingDriveField === 'preferences') {
    setDraftDriveFolderPreferences(cleanId);
  } else if (editingDriveField === 'mp3s') {
    setDraftDriveFolderMP3s(cleanId);
  } else if (editingDriveField === 'logs') {
    setDraftDriveFolderLogs(cleanId);
  }
  setEditingDriveField(null);
};
```

### 8.4 Application State & Persistence Flow (`src/App.tsx`)

In `App.tsx`, the root state variables maintain active and draft locations for both Local and Google Drive:

```typescript
// Active and draft state hooks
const [driveFolderAgate, setDriveFolderAgate] = useState<string>('');
const [draftDriveFolderAgate, setDraftDriveFolderAgate] = useState<string>('');

// Sync descriptors for display labels
useEffect(() => {
  const ids = [driveFolderAgate, draftDriveFolderAgate, driveFolderPreferences, driveFolderMP3s, driveFolderLogs].filter(Boolean);
  ids.forEach(async (id) => {
    if (!driveFolderDescMap[id] && googleAccessToken) {
      const name = await getDriveFolderName(id, googleAccessToken);
      if (name) setDriveFolderDescMap(prev => ({ ...prev, [id]: name }));
    }
  });
}, [driveFolderAgate, draftDriveFolderAgate, googleAccessToken]);

// Persistence handler: updates server and local storage atomically
const handleSaveLocations = async () => {
  const payload = locationMode === 'Drive' ? {
    mode: 'Drive',
    driveFolderAgate: draftDriveFolderAgate,
    driveFolderPreferences: draftDriveFolderPreferences,
    driveFolderMP3s: draftDriveFolderMP3s,
    driveFolderLogs: draftDriveFolderLogs
  } : {
    mode: 'Local',
    localPathAgate: draftLocalPathAgate || draftLocalPathCalendar,
    localPathCalendar: draftLocalPathCalendar,
    localPathMP3s: draftLocalPathMP3s,
    localPathLogs: draftLocalPathLogs
  };

  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  setDriveFolderAgate(draftDriveFolderAgate);
  setShowLocationsModal(false);
};
```

---

## 9. Electron Native Desktop IPC Integration (`electron-main.cjs`)

The Electron main process bridges native OS folder selection and Finder/File Explorer reveal actions without exposing node file APIs directly to the DOM.

### 9.1 IPC Handlers Implementation

```javascript
// 1. Native Folder Picker Dialog Handler
ipcMain.handle('browse-folder', async (event, defaultPath) => {
  const focusedWin = BrowserWindow.getFocusedWindow() || mainWindow;
  const dialogOptions = {
    title: 'Select AGATE Station Location Folder',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: (typeof defaultPath === 'string' && defaultPath.trim().length > 0)
      ? defaultPath
      : app.getPath('documents')
  };

  try {
    const result = focusedWin
      ? await dialog.showOpenDialog(focusedWin, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  } catch (err) {
    console.error('Failed to open native directory browse dialog:', err);
    return null;
  }
});

// 2. Reveal in Finder / File Explorer Handler
ipcMain.handle('open-local-path', async (event, targetPath) => {
  if (!targetPath || typeof targetPath !== 'string') return false;
  try {
    const errMsg = await shell.openPath(targetPath);
    if (errMsg) {
      console.warn('shell.openPath warning:', errMsg);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to open directory via shell:', err);
    return false;
  }
});
```

---

## 10. Operational Hybrid Split Model (Player vs. Admin)

The AGATE Station Location model is optimized to operate under a **Hybrid Split**:

### 10.1 Player Workstations (Local OS Sync)
* **Storage Location**: Mapped local path (e.g., `G:\My Drive\AGATE\` via Google Drive for Desktop, or `smb://nas/AGATE` mounted to `/Volumes/AGATE`).
* **Identity & Access**: 
  * Operators in Player Mode do **not** sign in with Google or cloud accounts inside the application.
  * Node.js reads schedules and streams media through standard local file I/O (`fs.readFile`, `fs.createReadStream`).
  * Cloud sync, caching, and offline buffering are offloaded completely to the operating system's native daemon.

### 10.2 Admin Workstations (Direct Cloud API)
* **Storage Location**: Direct Google Drive v3 REST API endpoints.
* **Identity & Access**:
  * Elevating to Admin Mode invokes an in-app OAuth 2.0 PKCE loopback server on localhost.
  * Admin tokens are kept strictly in volatile RAM.
  * Master schedule publishing, emergency cart pushes, and backup vault snapshots execute via direct HTTPS calls to Google Cloud, avoiding OS file locks.

---

## 11. Summary Implementation & Verification Checklist

When verifying or implementing this unified model, confirm the following items across both storage modes:

### 11.1 Local Filesystem Checklist
1. **`currentSettings` in `server.ts`**: Contains `localPathAgate: string` and optional `paths: LocationPathsOverride`.
2. **Local Path Resolvers in `server.ts`**: Confirm `getAgateLogsDir`, `getAgateSettingsDir`, `getAgateMediaAnnouncementsDir`, `getAgateMediaEvergreensDir`, and `getAgateMediaShowsDir` prioritize overrides -> AGATE root (`localPathAgate`) -> legacy paths.
3. **Unified Media Streaming**: Confirm `resolveMediaFilePath` and `streamMediaFile` resolve audio paths dynamically and support HTTP 206 partial content.
4. **Startup Gate**: Confirm `POST /api/startup/verify` auto-provisions missing local subfolders and seeds `interstitials.json`, `shows.json`, and `logs.json` atomically.

### 11.2 Google Drive Cloud Checklist
1. **`LocationSettings` & `ServerSettings`**: Contain `driveFolderAgate?: string` alongside legacy fields (`driveFolderPreferences`, `driveFolderMP3s`, `driveFolderLogs`).
2. **Drive Subfolder Resolvers in `src/lib/driveService.ts`**:
   * `getOrCreateDriveSettingsFolder()`: Resolves `settings` under `driveFolderAgate` or falls back to `driveFolderPreferences`.
   * `getOrCreateDriveLogsFolder()`: Resolves `logs` under `driveFolderAgate` or falls back to `driveFolderLogs`.
   * `getOrCreateDriveLogHistoryFolder()`: Resolves `loghistory` under the logs folder.
   * `getOrCreateDriveAnnouncementsFolder()`: Resolves `media_announcements` under `driveFolderAgate` (or legacy `Interstitials`).
   * `getOrCreateDriveEvergreensFolder()`: Resolves `media_evergreens` under `driveFolderAgate` (or legacy `Evergreens`).
   * `getOrCreateDriveShowsFolder()`: Resolves `media_shows` under `driveFolderAgate` (or legacy `Playlists`).
3. **UI Integration (`LocationsModal.tsx` & `App.tsx`)**:
   * Displays primary **AGATE Station Location** with status badge ("Configured" / "To be set").
   * Provides "Edit" and "Open" actions.
   * Encapsulates legacy overrides inside collapsible `<details>`.
   * Persists `driveFolderAgate` via `handleSaveLocations`.

