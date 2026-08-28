# Storage, Writing Architecture, and Save Recovery Documentation

This document records the design, implementation, and comparison between legacy save mechanics, intermediate iterations, and the current atomic save and recovery architecture in **Interstitial-er**.

---

## 1. Previous Architecture (Before)

### Backend Writing Architecture:
- Direct synchronous file writes using `fs.writeFileSync(targetPath, jsonString, 'utf-8')`.
- Target files (`interstitials.json`, `shows.json`, `settings.json`) were directly opened, truncated, and written in-place.
- **Vulnerabilities**:
  - If a process crashed, power was cut, disk ran out of space (`ENOSPC`), or a network share became unavailable mid-write, the existing file could be wiped to 0 bytes or left with partial JSON syntax, corrupting entire schedules or show profiles.
  - Backend API routes caught errors and only sent generic `{ success: false, error: 'Internal Server Error' }` or simple text without error codes (`EACCES`, `EPERM`, `EBUSY`, `EROFS`) or the resolved target filesystem path.

### Frontend Save Handling & Dialog Lifecycle:
- `saveInterstitials` and `saveShows` in `App.tsx` fired fetch requests or Google Drive calls with basic `try / catch` blocks.
- On error, they only ran `console.error(...)`.
- **Vulnerabilities**:
  - The user received **no visual notification** that their schedule or show profiles had failed to write to disk or Google Drive.
  - If a broadcaster edited extensive schedules and closed or refreshed the application, all unsaved changes were silently lost because the user assumed the save succeeded.
  - There was no in-flight save state guard or status badge to inform users when a save was actively in progress.

---

## 2. Current Architecture (Implemented)

### A. Backend Atomic File Writing (`server.ts`)

#### Helper Implementation:
```ts
function atomicWriteFileSync(filePath: string, data: string, encoding: BufferEncoding = 'utf-8') {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  try {
    fs.writeFileSync(tmpPath, data, encoding);
    fs.renameSync(tmpPath, filePath);
  } finally {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {}
    }
  }
}
```

#### Key Properties:
1. **Staging File**: Data is written completely to a hidden temporary file in the same directory (`.${basename}.tmp.${timestamp}_${rand}`).
2. **Atomic OS Rename**: `fs.renameSync` invokes the operating system's atomic filesystem rename call (`rename` syscall on POSIX, atomic move on Windows). If any failure occurs during writing or encoding, the original target file remains 100% intact and uncorrupted.
3. **Automatic Cleanup**: If writing or renaming fails, the `finally` block unlinks the temporary file to prevent orphan files on disk.
4. **Structured Backend Responses**: The endpoints `/api/interstitials`, `/api/shows`, and `/api/settings` return structured error details:
   ```json
   {
     "success": false,
     "error": "EACCES: permission denied, open '...'",
     "code": "EACCES",
     "targetPath": "/path/to/target/file.json"
   }
   ```

---

### B. Frontend Hybrid Save Workflow (Option C: Modal-Scoped Lock + Global Centered Overlay with Blur)

#### 1. Contract & State Synchronization:
- `onSave` (for Interstitials) and `onSaveShows` (for Shows) in `CalendarTab.tsx` accept a promise-returning signature:
  ```ts
  onSave: (interstitials: Interstitial[]) => Promise<boolean | void> | void;
  onSaveShows?: (shows: Show[]) => Promise<boolean | void> | void;
  ```
- `saveInterstitials` and `saveShows` in `App.tsx` return `Promise<boolean>` (`true` on completed write, `false` on caught error/recovery).

#### 2. Modal-Scoped Locking:
- When a user submits an Interstitial or Show edit:
  1. The editor sets a local `isSavingInterstitial` or `isSavingShow` state to `true`.
  2. The action buttons (Save, Cancel, Delete, Reset) are immediately disabled.
  3. The Save button transitions to a spinning indicator (`<RefreshCw className="animate-spin" />`) with `"Saving..."` text.
  4. The editor **remains mounted** while the asynchronous I/O (local filesystem atomic rename or Google Drive upload) executes.
  5. If the save operation resolves successfully (`true`), the modal unmounts cleanly (`setEditingId(null)` or `setEditingShowId(null)`).
  6. If the save operation fails (`false`), the modal **remains open** with all input fields and in-memory edits preserved for immediate retry or correction once the user resolves the disk/network issue via `SaveRecoveryModal`.

#### 3. Global Centered Interaction Blocker with Background Blur:
- While `isSaving` is active:
  1. A full-screen fixed backdrop (`fixed inset-0 z-[9990] bg-slate-950/40`) captures and blocks all pointer events across the entire viewport.
  2. A subtle backdrop blur (`backdrop-blur-[2px]`) softly defuses the background interface (neutralized when `animationsDisabled` is active to respect performance switches).
  3. A centered floating modal card displays a high-visibility spinner with dynamic status text (e.g., `"Saving interstitials schedule..."` / `"Saving shows profile..."`) and `"Writing and syncing data..."`.
  4. This eliminates accidental clicks on underlying navigation bars, tab switchers, playback controls, or calendar rows while save I/O is executing.

---

### C. Save Failure Recovery System (`src/components/SaveRecoveryModal.tsx`)

When any save operation fails (local filesystem error or Google Drive network/token issue):
1. **Memory Preservation**: User changes are kept in memory; state is not reset or discarded.
2. **Detailed Error Display**:
   - Target filename (`interstitials.json`, `shows.json`, `settings.json`)
   - Target destination path or Drive folder
   - Exact system error message / code
3. **Actionable Resolution Paths**:
   - **Retry Save**: Re-executes the specific save closure with a retry spinner and success confirmation.
   - **Storage Settings**: Opens the Storage Locations modal to allow the user to inspect/reconfigure local paths, repair permissions, or change Google Drive folders without losing current in-memory edits.
   - **Return to Editor**: Closes the recovery modal and returns the user to the active screen with all in-memory changes preserved so they can continue working or export schedules manually.

---

## 3. Prior Iterations & Alternative Methods

### A. Prior Iteration 1: Synchronous Modal Dismiss with Floating Toast (Superseded)
- **Mechanism**: `saveEdit` invoked `onSave(...)` asynchronously without awaiting the returned promise, and immediately followed with synchronous `setEditingId(null)`. A non-blocking toast (`pointer-events-none`) was shown at the top-right of `App.tsx`.
- **Flaws Identified**:
  - The modal dismissed instantly before file write completed, exposing the underlying calendar/list rows.
  - Users could immediately click and reopen the record being written, causing duplicate write races.
  - If the save failed, the form had already unmounted and user input was wiped from component state.

### B. Prior Iteration 2: Modal-Only Lock (Option A - Superseded by Hybrid Option C)
- **Mechanism**: The modal remained open and its buttons were locked during save, but outside controls (such as header navigation tabs, sidebar buttons, or play controls) were theoretically still clickable if clicked outside the active modal boundary.

### C. Implemented Architecture: Option C (Hybrid Modal Lock + Centered Overlay with Blur)
- **Mechanism**: Combines modal-scoped state persistence and button locking with a global interaction blocker overlay that centers the save progress message and softly blurs the background.

---

## 4. Reference Locations in Codebase

| Component | File Path | Responsibilities |
|---|---|---|
| Atomic File Writer | `server.ts` (`atomicWriteFileSync`) | Safe temporary staging and atomic renaming |
| API Endpoints | `server.ts` (`/api/interstitials`, `/api/shows`, `/api/settings`) | Status checks, error payload structure |
| Centered Save Overlay & State | `src/App.tsx` (`isSaving`, `savingLabel`, centered backdrop overlay) | Global pointer-event blocking, backdrop blur, centered status |
| Modal Save Lock | `src/components/CalendarTab.tsx` (`saveEdit`, `handleSaveShow`, `deleteInterstitial`, `handleDeleteShow`) | Asynchronous save locking, button disabling, retaining form state on failure |
| Recovery Modal Component | `src/components/SaveRecoveryModal.tsx` | Error rendering, retry execution, settings navigation |
