# Playlist Folder Disambiguation & Custom Folder Specification

## Overview

This specification establishes an explicit, non-recursive folder selection workflow for shows and Evergreens across all modes that discover non-scheduled audio files (Live Player, Playlist, Prerecord, and Export).

Under this model:
1. **Top-Level Root & Subfolders Treated Independently**: Directories are isolated. The media scanner never recurses or flattens multiple folders into a single playlist.
2. **Empty Folder Filtering**: Subdirectories containing zero relevant audio (`.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg`, `.aiff`) or playlist files (`.m3u`, `.m3u8`) are ignored and excluded from all UI listings.
3. **Passive Show Initialization (No Forced Intercept)**: Selecting a show/date opens immediately without interrupting the broadcaster with a modal dialog:
   - If a saved `.json` log exists with a previously recorded folder, the show opens directly to that folder.
   - If no `.json` log exists or no folder was recorded, it opens to the default Top Level (Root) folder.
4. **Dedicated "Choose Playlist" Button**: Located directly next to "Choose Show" in the header bar, giving broadcasters instant on-demand access to the Folder Chooser dialog.
5. **Folder Chooser Modal**: Presents three clear, unambiguous options:
   - **Found Directory / Directories**: Discovered internal folders with file counts, `(current)` active badge, and `(missing)` disconnected badges.
   - **User Specified Directory ("Bring Your Own / USB")**: Native OS directory picker allowing playback from USB drives or external storage paths.
   - **No Playlist**: Loads the show with an empty audio track queue while preserving all scheduled station breaks, announcements, and live reads.
6. **M3U Precedence with Loose File Append**: If an `.m3u` file exists in the selected folder, its referenced files are queued first in sequence; any remaining loose audio files in that same folder are appended to the end of the queue.
7. **Compliance History Preservation & Queue Reconciliation**: Switching folders preserves all existing entries in `playedTracks` for FCC/station broadcast compliance logs while reconciling `unplayedTrackIds` and `trackMetadata` against the new folder.
8. **Live Read / Show Picker Modal Badge**: Displays `"xx files in yy folders"` whenever multiple non-empty folders exist.

---

## 1. Data Models & Schema Definitions

### 1.1 Show Log Schema (`.json` Session File)
Each show log file (e.g. `2026-09-21_Positively_Everything_with_Moe_Fuz.json`) persists the explicit folder selection:

```typescript
export interface ShowPlaylistLog {
  showId: string;
  showName: string;
  showStart?: string;
  showEnd?: string;
  playlistFolderType?: "Shows" | "Evergreens";
  
  // Folder Disambiguation Fields
  selectedFolderPath: string;        // "." for root, "Subfolder_Name" for internal, or display folder name for external
  isExternalFolder: boolean;         // true if loaded from USB or custom OS path outside station media dirs
  externalAbsolutePath: string | null; // Full OS path (e.g. "/Volumes/USB_STICK/Set_01" or "D:\Sets\ShowA")
  
  // Track State
  playedTracks: PlayedTrackRecord[];
  unplayedTrackIds: string[];
  trackMetadata: Record<string, TrackMetadataItem>;
  
  updatedAt?: string;
}
```

### 1.2 Folder Discovery Types (`src/types.ts`)
```typescript
export interface DiscoveredFolderItem {
  id: string;              // "root" or subfolder name
  name: string;            // "Top Level (Root)" or subfolder display name
  relPath: string;         // "." for root or relative path string
  fileCount: number;       // Count of valid audio & playlist files directly in this folder
  isRoot: boolean;         // true if top-level root
  hasM3u: boolean;         // true if an .m3u/.m3u8 file exists in this folder
  isMissing?: boolean;     // true if previously logged folder no longer exists on disk
  isCurrent?: boolean;     // true if matches active show log
}

export interface DiscoverFoldersResponse {
  success: boolean;
  hasMultipleFolders: boolean;
  totalFiles: number;
  folderCount: number;
  folders: DiscoveredFolderItem[];
  error?: string;
}
```

---

## 2. Server-Side Endpoints & Ingestion Mechanics (`server.ts`)

### 2.1 Folder Discovery Endpoint (`/api/shows/discover-folders`)
* **Method**: `GET`
* **Query Parameters**:
  - `folderType`: `"Shows"` | `"Evergreens"`
  - `showName`: e.g. `"Positively Everything with Moe Fuz"`
  - `showId`: e.g. `"2"`
* **Discovery Algorithm**:
  1. Resolves show directory: `path.join(media_shows_path, folderName)`.
  2. Reads direct children via `fs.promises.readdir(showDir, { withFileTypes: true })`.
  3. Counts audio files directly in the root directory (excluding subdirectories).
  4. Scans immediate subdirectories only (depth = 1):
     - For each subfolder, counts direct audio files (`.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg`, `.aiff`) and `.m3u`/`.m3u8` files.
     - **Filter Rule**: If a subfolder contains 0 audio/M3U files, it is completely ignored and excluded from the returned array.
  5. Computes `folderCount` (1 if only root has files, >1 if root + subfolders or multiple subfolders have files).
  6. Returns `DiscoverFoldersResponse`.

### 2.2 Scoped Single-Level Audio Scanner (`getAllAudioAndPlaylistFilesAsync`)
* **Signature Modification**:
  ```typescript
  async function getAllAudioAndPlaylistFilesAsync(
    targetDir: string,
    options?: {
      targetSubfolder?: string;      // e.g. "Spotisaver Rips" or "."
      externalAbsolutePath?: string; // e.g. "/Volumes/USB/Set"
      recursive?: boolean;           // Default: false (enforces single-level scan)
    }
  ): Promise<{ audioFiles: FileItem[]; m3uFiles: FileItem[] }>
  ```
* **Scanning Logic**:
  1. If `externalAbsolutePath` is provided, `targetDir = externalAbsolutePath`.
  2. Else if `targetSubfolder` is provided and `targetSubfolder !== "."`, `targetDir = path.join(baseShowDir, targetSubfolder)`.
  3. Reads **only direct children** in `targetDir`. Subdirectories inside `targetDir` are skipped and never traversed.
  4. Collects audio files and M3U files into separate arrays.

### 2.3 M3U Precedence & Loose File Append Algorithm
When assembling the playlist tracks for the selected folder:
1. If one or more `.m3u` / `.m3u8` files exist in the folder:
   - Reads the first M3U file in line order.
   - Resolves referenced filenames against direct audio files in that same directory.
   - Appends all referenced tracks to the playlist array in exact M3U sequence.
   - Gathers all audio files in the folder that were **not** referenced in the M3U.
   - Sorts loose files using natural alphabetical order (`localeCompare(..., undefined, { numeric: true })`) and appends them to the end of the playlist array.
2. If no M3U file exists:
   - All direct audio files in that directory are sorted alphabetically via natural/numeric sort.

### 2.4 Stream & Range Request Resolution for External Paths
* `/api/media/stream` and `/api/media/download-range` must accept a stream request where the file path is either:
  1. A relative path under `media_shows` / `media_evergreens`.
  2. An absolute path when `isExternal: true`, verified against allowed system directory access permissions.

---

## 3. Native File Explorer / Electron IPC Bridge

### 3.1 Electron Main Process (`electron-main.cjs`)
```javascript
ipcMain.handle('dialog:openDirectory', async (event, defaultPath) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: defaultPath || undefined,
    title: 'Select Playlist Folder (USB / Custom Directory)'
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { canceled: true, folderPath: null };
  }
  return { canceled: false, folderPath: result.filePaths[0] };
});
```

### 3.2 Preload Script & Web Fallback (`preload.cjs` / `src/lib/nativeDialog.ts`)
```typescript
export async function pickExternalDirectory(): Promise<{ canceled: boolean; folderPath: string | null }> {
  if (window.electronAPI?.selectFolder) {
    return await window.electronAPI.selectFolder();
  }
  // Web browser fallback using Directory System Access API or hidden input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    (input as any).webkitdirectory = true;
    input.onchange = (e: any) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        // In web preview, use folder name as synthetic path
        const relativePath = files[0].webkitRelativePath || '';
        const folderName = relativePath.split('/')[0] || 'Selected Folder';
        resolve({ canceled: false, folderPath: folderName });
      } else {
        resolve({ canceled: true, folderPath: null });
      }
    };
    input.click();
  });
}
```

---

## 4. User Interface Specifications

### 4.1 "Choose Playlist" Header Button
* **Placement**: In `App.tsx` and `PlayerTab.tsx` header toolbar, placed directly to the right of the existing **`Choose Show`** button.
* **Visibility**: Displayed when viewing a show in `Playlist`, `Prerecord`, `Export`, or `Live` player modes.
* **Visual Style**: Consistent with `Choose Show` button (clean slate background, standard text size, icon badge `FolderTree` or `ListMusic` from `lucide-react`).
* **Interaction**: Clicking opens `FolderChooserModal`.

### 4.2 Folder Chooser Modal (`FolderChooserModal.tsx`)
* **Header**: Title: `"Choose Playlist Folder"`, Subtitle: `Show: [Show Name]`.
* **Section 1: Discovered Station Folders (Radio Group)**
  - Lists every non-empty folder discovered on disk (Top Level Root and subfolders).
  - Each item displays:
    - Folder Name (e.g. `Top Level (Root)` or `Spotisaver Rips`).
    - File Count Badge (e.g. `37 files`, `M3U Playlist`).
    - Active Indicator: `(current)` badge if matching the current show session.
    - Missing Indicator: `(missing)` badge if the previous folder from `.json` no longer exists on disk (disabled state).
* **Section 2: User Specified Directory ("Bring Your Own / USB")**
  - Button with folder icon: `"Browse Folder (USB / Custom)..."`
  - When selected via native OS picker, displays the chosen folder path in a highlighted card with `(external)` badge and path tooltip.
* **Section 3: No Playlist**
  - Selectable radio card: `"No Playlist"`
  - Description: `"Load show with an empty audio track queue."`
* **Footer Actions**:
  - `Cancel` button (closes modal without changing active session).
  - `Load Playlist` primary button (executes folder selection and applies changes).

### 4.3 Live Read / Show Picker Modal Badge
* In the Show Picker Modal (e.g. `PrerecordModal.tsx`, `LiveReadsModal.tsx`, and Playlist show selector):
  - If `folderCount === 1` (or no eligible subfolders exist): Displays `"xx files"`.
  - If `folderCount > 1`: Displays `"xx files in yy folders"`.

---

## 5. Lifecycle, Re-entry & Folder Switching Reconciliation

### 5.1 Automatic Show Open Lifecycle
```
[User Clicks Show/Date in Show Picker]
               │
               ▼
[Fetch Saved Show .json Log from Cache/Drive]
               │
      ┌────────┴────────┐
      ▼                 ▼
[.json Log Exists]   [No .json Log]
      │                 │
      ├─► Has Saved Folder ──► Open show with `selectedFolderPath` or `externalAbsolutePath`
      │
      └─► No Saved Folder  ──► Open show with Top Level (Root) `"."`
```

### 5.2 Folder Switching Reconciliation Flow
When the broadcaster opens the "Choose Playlist" dialog and confirms a switch from Folder A to Folder B on an existing show session:

1. **Preserve Compliance History**:
   - `playedTracks` array is **never wiped or overwritten**. All tracks played earlier in the broadcast session remain in `playedTracks` with their original timestamps.
2. **Reconcile Active Queue**:
   - Scans the direct files of Folder B.
   - For each track in `existingLog.unplayedTrackIds`:
     - Checks if matching track ID or filename exists in Folder B scan.
     - If found, retains its position and updates metadata.
     - If not found in Folder B, prunes the track ID from `unplayedTrackIds` and `trackMetadata`.
   - For newly discovered files in Folder B not in `existingLog`:
     - Assigns new sequential IDs.
     - Appends IDs to the end of `unplayedTrackIds`.
     - Inserts metadata into `trackMetadata`.
3. **If "No Playlist" is Selected**:
   - Retains `playedTracks`.
   - Clears `unplayedTrackIds = []` and prunes unplayed items from `trackMetadata`.
4. **Update Session Context**:
   - Sets `selectedFolderPath`, `isExternalFolder`, and `externalAbsolutePath` to Folder B parameters.
   - Saves updated `.json` log to disk/Drive cache immediately.
   - Re-renders `PlayerTab` track list with the refreshed queue.

---

## 6. Phased Implementation Prompts

### Phase 1: Backend Folder Discovery, Scoped Scanning & M3U Logic
> **Prompt 1**:
> "1. Implement the `/api/shows/discover-folders` GET endpoint in `server.ts` to inspect the specified show/Evergreen directory. Scan top-level and immediate subdirectories (depth 1), counting audio and playlist files while filtering out any subdirectories containing 0 files. Return a `DiscoverFoldersResponse` payload containing `hasMultipleFolders`, `totalFiles`, `folderCount`, and the list of eligible folders.
> 2. Refactor `getAllAudioAndPlaylistFilesAsync` and `buildShowContext` in `server.ts` to accept `targetSubfolder` and `externalAbsolutePath` options, ensuring that file scanning is strictly confined to direct children of the target directory without recursive subfolder traversal.
> 3. Implement M3U ordering semantics: when an `.m3u` file is present in the chosen directory, load its referenced files first in line order, and append any remaining loose audio files in that same directory to the end of the track list in natural alphabetical order.
> 4. Ensure `/api/media/stream` and audio range routes properly resolve files located in `externalAbsolutePath` when `isExternal` is set."

### Phase 2: Schema Persistence, Drive Service & Queue Reconciliation
> **Prompt 2**:
> "1. Update `src/types.ts` to add `selectedFolderPath`, `isExternalFolder`, `externalAbsolutePath`, and `DiscoveredFolderItem` / `DiscoverFoldersResponse` interfaces to `ShowPlaylistLog` and show context models.
> 2. Update `src/lib/driveService.ts` and `PlayerTab.tsx` functions (`loadShowPlaylistLogFromDrive`, `saveShowPlaylistLogToDrive`, `loadPlaylistTracksFromDrive`, `syncPlaylistTracks`) to persist and restore the folder selection fields.
> 3. Implement folder switching reconciliation in `driveService.ts` / `PlayerTab.tsx`: when switching folders on an existing show, preserve all completed `playedTracks` for compliance logging, prune unplayed tracks missing from the new folder, and append newly discovered tracks to `unplayedTrackIds` and `trackMetadata`."

### Phase 3: Choose Playlist Button, FolderChooserModal & Live Read Badges
> **Prompt 3**:
> "1. Add a 'Choose Playlist' button adjacent to 'Choose Show' in the header toolbar in `App.tsx` and `PlayerTab.tsx`.
> 2. Create `src/components/FolderChooserModal.tsx` displaying:
>    - Found Directory/Directories with file counts, `(current)` active badge, and `(missing)` disconnected badges.
>    - 'Bring Your Own Folder (USB / Custom)' option using `window.electronAPI.selectFolder()` with web fallback.
>    - 'No Playlist' option to load the show with an empty audio queue.
> 3. Connect the modal to the show loading workflow: opening a show opens directly to the saved folder or root without blocking modals, while clicking 'Choose Playlist' opens the modal on demand.
> 4. Update the show picker badges in `PrerecordModal.tsx`, `LiveReadsModal.tsx`, and playlist modals to display 'xx files in yy folders' when multiple eligible folders exist."
