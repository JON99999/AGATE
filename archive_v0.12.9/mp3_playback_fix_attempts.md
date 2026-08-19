# Summary of MP3 Playback Fix Attempts (Post-v0.11.5)

This document details the modifications attempted after version `0.11.5` to resolve HTML5 Audio playback collisions, cascading media resource errors, and preview failures across `PlayerTab` and `CalendarTab`.

---

## 1. Problem Description

### Observed Symptoms
- **HTML5 Audio Engine Cascading Error**:
  ```text
  Playback failed
  The media resource indicated by the src attribute or assigned media provider object was not suitable.
  ```
- Triggered when switching rapidly between live read scripts and audio files, or triggering multiple audio previews in quick succession.
- Once the initial playback error occurred, subsequent audio play calls failed in a cascade due to stale `HTMLAudioElement` instances holding open file locks / decoders or active audio streams.
- Secondary regression: Previews in `CalendarTab` (Schedule modal, sound picker library) broke when given raw filenames (e.g., `ad.mp3`) instead of fully-resolved file paths.

---

## 2. Implemented Logic and Architecture Changes

### A. Dedicated Audio Cleanup Helper (`stopAndCleanAudio`)
**Location**: `src/components/PlayerTab.tsx`

**Logic**:
Standard `audio.pause()` and `audio.src = ""` calls are insufficient in Chromium/Electron web engines to release hardware decoders and reset media pipeline state. Setting `.src = ""` without calling `.load()` can leave the HTML5 media element in an error state (`MEDIA_ERR_SRC_NOT_SUPPORTED`).

**Implementation**:
```typescript
export const stopAndCleanAudio = (audio: HTMLAudioElement | null) => {
  if (!audio) return;
  try {
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    audio.ontimeupdate = null;
    audio.onloadedmetadata = null;
    audio.removeAttribute('src');
    audio.load(); // Forces HTML5 media pipeline to detach from stream and reset state
  } catch (e) {
    // Ignore cleanup exceptions
  }
};
```

---

### B. Player Tab Playback Pipeline Hardening
**Location**: `src/components/PlayerTab.tsx`

**Logic & Changes**:
1. **Unmount & State Switch**: Applied `stopAndCleanAudio` across component unmount effects, playlist item changes, track switches, export preview modal controls, and slot trigger handlers.
2. **Promise Failure Cleanup**: Added explicit call to `stopAndCleanAudio(audio)` inside `.catch()` blocks for all `audio.play()` promises. If browser autoplay policy or media loading fails, the `Audio` object is instantly cleaned up so it does not block the next attempt.
3. **Live Read Transition**: Enforced a complete stop and cleanup of all active `playingAudio` instances immediately when a live read or script-type slot is clicked, preventing overlapping audio states.

---

### C. Calendar Tab & Sound Picker Path Resolution
**Location**: `src/components/CalendarTab.tsx`

**Logic & Changes**:
1. **Path Resolution Lookup**: `togglePreview` was receiving bare filenames (e.g., `commercial.mp3`) which `getPlayableUrl()` could not resolve to a local file or drive stream. Implemented fallback lookups in `availableFilesCache` and `driveMP3s`:
```typescript
let actualUrl = urlOrName;
if (!actualUrl.startsWith('http') && !actualUrl.startsWith('blob:') && !actualUrl.startsWith('app://') && !actualUrl.startsWith('file://')) {
  const fileInCache = availableFilesCache.get(urlOrName);
  if (fileInCache) {
    actualUrl = fileInCache.path;
  } else {
    const matchInDrive = driveMP3s.find(f => f.name === urlOrName || f.path === urlOrName);
    if (matchInDrive && matchInDrive.path) {
      actualUrl = matchInDrive.path;
    }
  }
}
```
2. **Display Key Disambiguation**: Updated `togglePreview` to accept a distinct `displayKey` parameter so button toggle state (`previewUrl === displayKey`) tracks correctly even when underlying path resolution converts `filename.mp3` to `app://local/path/filename.mp3`.
3. **Metadata & Probe Cleanup**: Transient `Audio` objects instantiated in `useEffect` hooks solely for probing duration or ID3 metadata now detach event listeners and call `.pause()`, `.removeAttribute('src')`, `.load()` immediately after `loadedmetadata` or `error` events fire.

---

## 3. Key Technical Takeaways for Future Iterations

1. **Always invoke `audio.load()` after clearing `src`**: Browsers require `.load()` to explicitly transition an `HTMLAudioElement` out of an active media stream.
2. **Never leave rejected `audio.play()` promises unhandled**: Always attach `.catch()` handlers that purge the failed element.
3. **Distinguish file display names from underlying path/URL keys**: Always ensure `getPlayableUrl()` receives the canonical file path or URL from cache maps (`availableFilesCache`, `driveFileNameCache`, or `driveMP3s`) rather than unpath'd display strings.
