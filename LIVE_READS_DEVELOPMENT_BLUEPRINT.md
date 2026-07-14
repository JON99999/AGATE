# Interstitial-er Live Reads Integration Blueprint
This document preserves the architecture, phase prompts, and state for the "Live Read" text script integration. It serves as both a reference and a sequence of prompts that can be fed back to the AI assistant to perform the implementation in stages without overwhelming the context window.

## Current System State (Baseline for Reversion)
- **Baseline Version**: `0.9.10`
- **Baseline Behavior**: Audio-only scheduler (MP3/WAV/etc.). Tracks time as dynamic audio duration.
- **Optimization Override Status**: Local React/Tailwind performance overrides (Flat rendering, non-intensive CSS Keyframes, GPU Compositing layers) are active by default. Option 1, 2, and 3 in the Electron main process (`electron-main.cjs`) exist as non-active code parameters.

---

## The "Live Read" Philosophy & Core Paradigms
"Live Reads" represent human-read scripts spoken live on-air. They differ from audio files in several critical ways:
1. **Time is a Timestamp, Not a Duration**: We do not care about or measure the duration of a Live Read. Instead, we care about the **exact time of day** the Live Read was initiated or marked as completed.
2. **Interactive Windowing**: Instead of hitting "Play", clicking a Live Read opens a clean, separate, sized-to-fit popout window (or elegant overlay) containing the script text.
3. **Double-State Logging**: When the window is open, the announcer can choose to either **"Log as Read"** (committing the execution with a configurable, live-updating start timestamp) or **"Close - Not Read"** (canceling).

---

## Phase 1: File Storage, Schema, & Folder Integration
**Target Version**: `0.10.1`

### Objectives
- Support `.txt` and `.pdf` files natively in the designated folders alongside existing `.mp3` files.
- Update the directories window interface, headers, and tooltips to represent that the folder stores both "Audio & Scripts".
- Modify the JSON metadata and schedule structure to support a new content type: `"Live Read"`.

### Step-by-Step Prompt to Initiate Phase 1
```markdown
Please implement Phase 1 of the Live Reads Integration for "Interstitial-er". 

### Phase 1 Scope & Requirements:
1. **Schema & Types**:
   - Update file models/interfaces to support `type: 'audio' | 'script'` or similar indicator.
   - Detect script files by extension: `.txt` and `.pdf`. Treat other audio types as usual.
2. **Shared Folders UI**:
   - Locate folder headers/labels in the directories manager and update them to read "Audio & Scripts Folder" or "Media & Scripts Folder".
   - Update tooltips to specify that both audio and plain text scripts/PDF documents can reside in these directories.
3. **File Discovery**:
   - Adapt the directory scanning methods on the backend (Express server scanning files) to read and return `.txt` and `.pdf` files alongside audio files.
   - Ensure script files have a default duration of 0 or a placeholder symbol (e.g. "—" or "Read") to signify they are scripts, rather than an audio duration.
4. **Main Screen & Schedules**:
   - When importing schedules, if a file matches a script extension (`.txt` or `.pdf`), automatically parse or designate its type as a "Live Read" (Script/Read) instead of a playable audio.
5. **Version Update**:
   - Set the application version globally to `0.10.1` in `package.json`, `package-lock.json`, and any other applicable files.
   - Update `HOW_TO_RELEASE_IN_GITHUB_ONLINE.md` to reference `v0.10.1`.

All code modifications must be carefully structured and cleanly documented for future reviews or potential removal. Ensure all existing performance overrides and animation settings remain untouched.
```

---

## Phase 2: Interface Redesign, Icons, & Live Popout Controls
**Target Version**: `0.10.3`

### Objectives
- Differentiate Live Read items visually across all primary tabs (Live, Prerecorded, Export).
- Swap standard play controls with action buttons representing a speaker or open script icon.
- Design the Live Popout overlay/window for reading and log committing.

### Step-by-Step Prompt to Initiate Phase 2
```markdown
Please implement Phase 2 of the Live Reads Integration for "Interstitial-er".

### Phase 2 Scope & Requirements:
1. **Visual Styling & Icons**:
   - In all list cards (Live, Prerecorded, Export, Admin Schedule list), change the visual design of Live Read items.
   - Use a clean Lucide icon (e.g., `Volume2` or `Mic` for audio, and `BookOpen` or `FileText` or `Megaphone` for Live Reads).
   - Change the action button from a "Play/Pause" triangle/icon to an "Open/Read" icon.
2. **The "Live Read" Popout Overlay/Window**:
   - Clicking the action button on a Live Read item in **Live Player Mode** must spawn an elegant, dedicated overlay or pop-up panel.
   - This popout must present the human-readable script beautifully. (For `.txt` files, display the plain text contents; for `.pdf`, embed a safe preview or text representation).
   - **Time-as-Timestamp Behavior (Live Mode)**: Next to the script card or in the popout header, show the current time of day updating dynamically by the second (e.g., `12:04:15 PM`). This acts as the pre-filled start timestamp.
3. **Logging & Dismissal Controls**:
   - Provide two main buttons in the reading interface:
     - **"Log as Read"**: Closes the view and records the item in the execution log with the active timestamp. Allow the announcer to manually edit this timestamp in an input box if they need to log a different start time.
     - **"Close - Not Read"**: Closes the view without writing to the execution logs.
4. **Version Update**:
   - Set the application version globally to `0.10.3` in `package.json`, `package-lock.json`, and any other applicable files.
   - Update `HOW_TO_RELEASE_IN_GITHUB_ONLINE.md` to reference `v0.10.3`.

Ensure all rendering pathways respect the global animations switch, remaining flat and zero-latency when overrides are enabled.
```

---

## Phase 3: Prerecord, Export Log Integration, & Refinements
**Target Version**: `0.10.3`

### Objectives
- Integrate Live Reads into Prerecord Player automation workflows.
- Integrate Live Reads into Export workflows, allowing users to flag and record them in final reports.
- Support timestamp configuration and default times.

### Step-by-Step Prompt to Initiate Phase 3
```markdown
Please implement Phase 3 of the Live Reads Integration for "Interstitial-er".

### Phase 3 Scope & Requirements:
1. **Prerecorded / Automation Mode**:
   - Since there is no live announcer during automated runs, Live Reads in Prerecorded lists default to the scheduled time as configured in the Schedule item.
   - Provide an option for the user to manually modify or adjust this logged timestamp if needed.
2. **Export Log Integration**:
   - When exporting or flagging schedules, include the Live Read events within the generated reports.
   - Maintain the timestamp of the start of the read in the logged columns (instead of dynamic durations or playback status).
   - If a user marks everything as "played/read" in the export window, include all designated Live Reads with their correct scheduled/execution timestamps.
3. **"Add New" Panel Adaptations**:
   - In the Schedule Creator / "Add New" form, allow specifying whether an item is a standard audio file or a "Live Read" script.
   - If selected as a Live Read, adjust the fields to prompt for a script path and skip duration configs in favor of timestamp mappings.
4. **Version Update**:
   - Set the application version globally to `0.10.5` in `package.json`, `package-lock.json`, and any other applicable files.
   - Update `HOW_TO_RELEASE_IN_GITHUB_ONLINE.md` to reference `v0.10.5`.

Run complete linter and compiler validations to verify structural and execution safety across all modules.
```

---

## Phase 4: Logging Backend Integration & Export Reporting
**Target Version**: `0.10.5`

### Objectives
- Update the logger and export modules to capture Live Read executions. Ensure "Read" items are appended to play logs with their logged time-of-day timestamps.
- Include these logged live reads in the final export files (CSV/Excel) as equivalent entries, distinguished by an asset-type field.
- Ensure that the global `.disable-animations` structural classes are respected throughout any new visual additions.
- Perform final compilation and validation checks.

