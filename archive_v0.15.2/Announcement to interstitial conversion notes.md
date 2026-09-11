# Announcement to Interstitial Conversion Notes

**Document Purpose**: Comprehensive reference documenting the completed codebase conversion from "Interstitial" / "Interstitials" to "Announcement" / "Announcements", along with the exact checklist of manual data, file, folder, and JSON schema updates required for existing station files to remain compatible.

---

## 1. Codebase Conversion Summary

All references across all layers of the codebase (excluding historical archives and this documentation file) have been converted to **"Announcement"** (singular) and **"Announcements"** (plural), with exact case preservation (`announcement`, `Announcement`, `ANNOUNCEMENT`, `announcements`, `Announcements`, `ANNOUNCEMENTS`).

No fallback code was retained; the application is now configured natively for announcement files, routes, and data schemas.

### Converted Layers:
1. **Frontend User Interface (React / Tailwind)**:
   - Navigation tabs (*Announcements*), section headers (*Weekly Announcement Schedule*), form inputs (*Announcement Name*, *Announcement Minute*), radio buttons (*Basic Hourly Announcement*, *One-Time Announcement*, *Advanced Weekly Grid Announcement*), action buttons (*+ Add Announcement*, *Play Announcement*), and modal dialogs (*Announcement Conflict Detected*, *Announcement Gaps Detected*).
   - Filter dropdowns, search bars, table column headers (*Scheduled Announcement*, *Hourly Announcement*), and log table badges.
2. **TypeScript Types & Interfaces (`src/types.ts`, `src/lib/*.ts`)**:
   - `Announcement` (formerly `Interstitial`), `AnnouncementType` (formerly `InterstitialType`), `AnnouncementMetadata`, `AnnouncementConflict`, `AnnouncementGap`, `AnnouncementPlacementModalState`.
   - Log entry properties: `announcementName`, `announcementId`, `announcementTime`, `isAnnouncement`.
3. **Backend Express Server (`server.ts`)**:
   - Primary schedule filename: `announcements.json`
   - Backup filename: `announcements_backup.json`
   - Backup counter key in JSON: `"AnnouncementsBackupCounter"`
   - Express REST API routes: `GET /api/announcements`, `POST /api/announcements`
   - Path setting: `currentSettings.paths.announcementsFile`
4. **Google Drive Integration (`src/lib/driveService.ts`)**:
   - Primary remote file: `announcements.json`
   - Announcements audio folder: `media_announcements` (or `Announcements`)
5. **Configuration & Manifests**:
   - `amp_settings.json`: `"announcementsFile": null`
   - `metadata.json` & `index.html`: updated description text to announcements.

---

## 2. Manual Update Checklist for Existing Station Stores & Folders

When transitioning an existing station deployment (or upgrading a folder from a previous version) to work with this updated build, the following manual adjustments must be made to files, folders, and JSON contents:

---

### A. Local Filesystem & Storage Folders

| Location | Old Name / Path | New Required Name / Path | Notes |
| :--- | :--- | :--- | :--- |
| **Settings Directory** | `interstitials.json` (or `Interstitials.json`) | `announcements.json` | Rename the file in your settings folder. |
| **Backups Directory** | `backups/interstitials_backup.json` | `backups/announcements_backup.json` | Rename existing backup files if tracking rolling backups. |
| **Settings Subfolder** *(if used)* | `settings/Interstitials/interstitials.json` | `settings/Announcements/announcements.json` | Rename subfolder and internal JSON if nested. |
| **Media Audio Folder** | `media_interstitials` or `Interstitials` | `media_announcements` | Ensure announcement audio files reside in `media_announcements`. |

---

### B. Google Drive Cloud Folders & Files

| Remote Location | Old Name | New Required Name | Notes |
| :--- | :--- | :--- | :--- |
| **Station Root** | `interstitials.json` | `announcements.json` | Rename the schedule JSON stored in the Google Drive station root. |
| **Media Folder** | `/medialibrary/Interstitials` | `media_announcements` (or `Announcements`) | Google Drive folder storing MP3/WAV audio assets. |

---

### C. JSON File Internal Keys & Payload Schemas

#### 1. `announcements.json` (formerly `interstitials.json`)
Open your renamed `announcements.json` in a text editor and update the top-level backup counter key:
- **Old Key**: `"InterstitialsBackupCounter": 12`
- **New Key**: `"AnnouncementsBackupCounter": 12`

```json
{
  "AnnouncementsBackupCounter": 0,
  "data": [
    {
      "id": "schedule-1",
      "name": "Legal ID",
      "type": "BASIC_HOURLY",
      "minute": 0,
      "timeGatedMp3s": [...]
    }
  ]
}
```

#### 2. `Logs.json` (or `logs.json`)
If you wish existing log entries to show announcement names in the newly updated log viewer:
- Change key `"interstitialName"` $\rightarrow$ `"announcementName"`
- Change key `"interstitialId"` $\rightarrow$ `"announcementId"`
- Change key `"interstitialTime"` $\rightarrow$ `"announcementTime"`
- Change key `"isInterstitial": true` $\rightarrow$ `"isAnnouncement": true`
- Change log type value `"INTERSTITIAL"` $\rightarrow$ `"ANNOUNCEMENT"`

```json
[
  {
    "id": "log-1",
    "timestamp": "2026-09-10T11:00:00.000Z",
    "type": "ANNOUNCEMENT",
    "status": "success",
    "announcementName": "Legal ID",
    "announcementId": "schedule-1",
    "announcementTime": "11:00",
    "isAnnouncement": true
  }
]
```

#### 3. `amp_settings.json` (Workstation Settings)
In the station's `amp_settings.json`:
- Change key `"paths.interstitialsFile"` $\rightarrow$ `"paths.announcementsFile"`
- If a custom file path was specified, update the filename inside the path from `.../interstitials.json` to `.../announcements.json`.

```json
{
  "paths": {
    "settingsDir": "/path/to/settings",
    "mediaDir": "/path/to/media",
    "announcementsFile": "/path/to/settings/announcements.json",
    "showsFile": null,
    "logsFile": null
  }
}
```

---

## 3. Preparation for Future Folder Review

When submitting a "fixed" folder for validation in a future prompt, the following elements will be checked:
1. **File Names**: Verify presence of `announcements.json` (and absence of un-migrated `interstitials.json`).
2. **Root Keys**: Verify `"AnnouncementsBackupCounter"` exists in `announcements.json`.
3. **Settings Config**: Verify `amp_settings.json` references `announcementsFile`.
4. **Log Structure**: Verify historical or test logs in `Logs.json` use `announcementName`, `announcementId`, `isAnnouncement`, and type `ANNOUNCEMENT`.
5. **Media Directory**: Verify audio tracks are placed in `media_announcements`.
