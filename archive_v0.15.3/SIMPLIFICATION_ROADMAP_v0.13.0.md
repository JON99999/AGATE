# v0.13.0 Simplification & Architecture Roadmap

This document outlines the phased simplification plan for Interstitial-er version `0.13.0`, constructed in strict accordance with `AGENTS_PHILOSOPHY.md` to remove redundancies, spaghetti state, dead features, and over-complications.

---

## Stage 1: Unify Backend Endpoints & Media Streaming

### Staged Prompt
> Consolidate the Express API in `server.ts` according to `AGENTS_PHILOSOPHY.md`. Replace all duplicate streaming endpoints (`/api/stream-local`, `/api/mp3-file/:fileName`, `/api/shows/playlist/stream-file`) with a single, high-performance endpoint `GET /api/media/stream`. Remove duplicate route registrations (e.g., duplicate `/api/shows/playlist/check-show-files`), eliminate legacy and dead endpoints, and consolidate path validation into a single `POST /api/startup/verify` route.

### Actions
1. **Single Audio Route**: Implement `GET /api/media/stream?path=<relative_path>` supporting standard HTTP 206 partial-content byte-ranges (`Range: bytes=start-end`) directly streaming from `currentSettings.localPathMP3s`.
2. **Remove Route Duplication**: Delete conflicting legacy streaming routes and duplicate playlist check handlers.
3. **Consolidate Path Validation**: Merge `/api/check-local-paths`, `/api/create-local-paths`, and `/api/verify-startup` into a single endpoint (`POST /api/startup/verify`) that checks paths and ensures valid initial JSON stores (`interstitials.json`, `shows.json`, `logs.json`) in one atomic pass.
4. **Prune Dead Endpoints**: Remove orphaned routes no longer needed by the core architecture.

### Performance vs. Current Method
- **Streaming Latency**: Instant audio seek times and zero redundant stream-buffering wrappers. Standard HTTP 206 byte-range handling eliminates browser playback stalls on large audio files.
- **Server Footprint**: Reduces `server.ts` size by ~40% (removing ~1,200 lines of duplicated handler logic and redundant regex path decoders).
- **Network Overhead**: Startup validation collapses 3 sequential roundtrip network calls into 1 atomic verification request.

---

## Stage 2: Contextual On-Demand Caching (Show, Prerecord, Export, Playlist)

### Staged Prompt
> Implement a targeted, context-driven media caching architecture. Eliminate global multi-gigabyte directory scans at startup. Baseline startup only verifies paths and loads active schedule definitions. Multi-gigabyte Evergreen and Playlist libraries are indexed and cached in memory ONLY when a specific show is selected for Prerecord, Export, or Playlist editing in the modal window, and released when the session closes.

### Actions
1. **Lightweight Baseline Boot**: On startup, index only active interstitial carts and schedule files. Do not scan or pre-buffer large Evergreen or Playlist library trees.
2. **Context-Driven Show Cache API**: Expose `POST /api/shows/:showId/prepare-context` taking the requested context (`Prerecord` | `Export` | `Playlist`). The server resolves and caches durations, track tags, and audio buffers ONLY for the specific files referenced by that show.
3. **Focused UI Progress**: The caching modal reports progress exclusively for the active show's track set.
4. **Automatic Memory Cleanup**: When the user exits the show editor or switches shows, previous show audio buffers are released from memory to ensure low RAM footprint.

### Performance vs. Current Method
- **Startup Speed**: Near-instant app launch (under 100ms) with zero disk thrashing on startup even with 50GB+ audio libraries.
- **Memory Efficiency**: Node and Chromium memory usage stays minimal (typically <150MB) instead of ballooning to several gigabytes from indexing unused archives.
- **Filesystem I/O**: Eliminates repetitive, blocking disk reads (`fs.readdirSync`, `fs.statSync`) on every playlist switch, evergreen selection, or cart render.
- **UI Responsiveness**: Catalog retrieval drops from hundreds of milliseconds (or seconds on network shares/external drives) to sub-millisecond memory lookups.
- **Zero Race Conditions**: Replaces 4 distinct polling routines that repeatedly scanned the disk for new files simultaneously with a single authoritative in-memory state.

---

## Stage 3: Modular State Architecture & Strict Startup Gate

### Staged Prompt
> Refactor the global frontend state in `src/App.tsx` into dedicated Context providers (`AppContext.tsx` for settings and schedule data, `PlayerContext.tsx` for audio engine state). Introduce a strict `StartupGate` component that prevents any UI rendering or playback timers from initializing until `POST /api/startup/verify` returns a verified status.

### Actions
1. **Startup Gate**: Create `src/components/StartupGate.tsx`. If local paths are undefined or unreachable, display a dedicated setup prompt and halt all background sync intervals and audio engine loops.
2. **Context Modularization**:
   - `src/context/AppContext.tsx`: Houses `settings`, `schedule`, `shows`, `logs`, and the startup gate state.
   - `src/context/PlayerContext.tsx`: Houses active playlist queue, current playing track, countdown timers, and audio volume/mute state.
3. **Single Source of Truth**: Data updates flow through explicit actions rather than ad-hoc state mutations spread across multiple child components.

### Performance vs. Current Method
- **React Render Efficiency**: Decomposes 70+ root `useState` hooks in `App.tsx`. Component re-renders are isolated exclusively to the specific tabs or widgets that depend on updated state, rather than re-rendering the entire 6,000-line DOM tree on every second of clock tick.
- **Fail-Safe Startup**: Guarantees zero "null pointer" or "undefined path" runtime exceptions on fresh installs or unmounted USB drives.

---

## Stage 4: Decompose Monolithic Views into Independent Components

### Staged Prompt
> Extract the monolithic view layouts out of `src/App.tsx` into clean, isolated tab components: `PlayerTab.tsx`, `CalendarTab.tsx`, `ShowsTab.tsx`, and `LogTab.tsx`. Move all modal dialogs (Folder Setup, Log Export, Track Details) into `src/components/modals/`.

### Actions
1. **Extract Core Views**: Move visual layout and interaction logic into dedicated modular files (`src/components/tabs/PlayerTab.tsx`, `src/components/tabs/CalendarTab.tsx`, etc.).
2. **Dedicated Hooks**:
   - `useAudioPlayer.ts`: Encapsulates HTML5 `<audio>` element management, seek events, and buffer state.
   - `useScheduledBroadcast.ts`: Pure mathematical calculations for time-boundary cues and schedule triggers.
3. **Clean App Root**: Reduce `src/App.tsx` to ~150 lines responsible solely for shell layout, top navigation bar, and active tab routing.

### Performance vs. Current Method
- **DOM & Garbage Collection**: Dramatically reduces memory churn. Tab switches mount lightweight, isolated trees rather than managing a single massive component containing all tabs in memory simultaneously.
- **Code Maintainability**: Isolates bugs and layout changes to specific component files without risking unintended side effects in unrelated tabs.

---

## Stage 5: Code Pruning & Dead Feature Removal

### Staged Prompt
> Audit the entire codebase to purge unused utilities, redundant abstractions, and dead code according to `AGENTS_PHILOSOPHY.md`. Remove pixel ruler overlays, artificial caching progress simulators, dead Google Drive descriptor parsers, legacy duplicate logging schemas, and unnecessary CSS animations.

### Actions
1. **Remove Artificial Caching Complexity**: Replace multi-stage progress bars and fake pre-buffer timers with direct, instant local streaming.
2. **Purge Debug Scaffolding**: Delete screen ruler overlays, latency injection tools, and unused experimental features.
3. **Consolidate Logging Schema**: Standardize all broadcast event logging into a single consistent JSON schema for `logs.json` and `Playlists/<ShowName>_*.log`.
4. **Neutralize CPU-Intensive CSS**: Ensure all transitions and keyframe animations respect the `.disable-animations` high-performance broadcast mode.

### Performance vs. Current Method
- **CPU / GPU Load**: Eliminates idle CPU spikes from background animation timers and canvas redraw loops, ensuring low-latency execution essential for live radio broadcasting.
- **Bundle Size**: Drops client bundle size by removing unneeded dependencies and dead utility functions.
- **Mental Simplicity**: Results in a codebase that is straightforward to read, audit, maintain, and extend.
