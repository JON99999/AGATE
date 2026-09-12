# Minimal Architectural Analysis: Hybrid Local OS Sync (Player) & Direct API (Admin) Split Model

---

### Executive Summary

This document presents a minimal architectural blueprint for **Interstitial-er** operating as a native desktop application across studio workstations under a **hybrid split access model**:

1. **Player Users (Standard Operations)**: Access schedules, `.m3u` playlists, and `.mp3` audio files strictly through **localized Google Drive folders** provided at the operating system level by the official Google Drive for Desktop application (`G:\My Drive\...` on Windows or `~/Library/CloudStorage/GoogleDrive-...` on macOS).
2. **Admin Users (Administrative Operations)**: Authenticate directly inside the Interstitial-er application via **direct Google Drive REST API calls (OAuth 2.0 PKCE)**, bypassing local OS mounted Google Drive folders to perform admin management, schedule overrides, and backup triggers.
3. **Automated Vault Mirroring**: An isolated backup vault receives scheduled or admin-triggered copies of the organization-wide open-security folder.

---

### 1. Minimal Architectural Requirements

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                         DESKTOP WORKSTATION (macOS / Windows)                            │
│                                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                        Interstitial-er Native Desktop App                          │  │
│  │                                                                                    │  │
│  │  ┌──────────────────────────────────────┐  ┌────────────────────────────────────┐  │  │
│  │  │        PLAYER UI / PLAYBACK          │  │          ADMIN INTERFACE           │  │  │
│  │  │  (Reads Local Sync Folders via OS)   │  │ (In-Memory OAuth 2.0 PKCE Session)  │  │  │
│  │  └──────────────────┬───────────────────┘  └─────────────────┬──────────────────┘  │  │
│  └─────────────────────┼────────────────────────────────────────┼─────────────────────┘  │
└────────────────────────┼────────────────────────────────────────┼────────────────────────┘
                         │                                        │
           Local File I/O (fs.readFile)                  Direct REST API Calls
                         │                               (HTTPS / JSON / OAuth)
                         ▼                                        │
┌──────────────────────────────────────────┐                      │
│     Google Drive for Desktop Client      │                      │
│ (OS Virtual Filesystem / Background Sync) │                      │
└────────────────────┬─────────────────────┘                      │
                     │                                            │
           Background OS Sync                                     │
                     │                                            │
                     ▼                                            ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                              GOOGLE WORKSPACE CLOUD DOMAIN                               │
│                                                                                          │
│  ┌──────────────────────────────────────────┐  ┌───────────────────────────────────────┐ │
│  │  Organization-Wide Open Drive Folder     │  │  Superuser Vault Backup Folder        │ │
│  │  • Read-Write for Station Staff          │  │  • 0% Access for Station Operators    │ │
│  │  • Houses MP3s, Schedules, & Playlists   │  │  • Accessible ONLY to Superusers      │ │
│  └──────────────────────────────────────────┘  └───────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2. Operational Breakdown of the Hybrid Split Model

#### Mechanism A: Player Operations via Localized OS Google Drive Folders
- **Target Location**: Localized OS paths managed by Google Drive for Desktop (e.g., `G:\My Drive\Public_Station_Storage\` or `~/Library/CloudStorage/GoogleDrive-user@domain.com/My Drive/Public_Station_Storage/`).
- **Application Interaction**:
  - The Interstitial-er Player engine reads schedules (`.json`), playlists (`.m3u`), and audio (`.mp3`) directly from the local OS filesystem using standard Node.js file I/O (`fs.promises.readFile`, `fs.promises.stat`).
  - Player users **do not perform any in-app Google authentication**.
  - Local caching, file streaming, and background cloud synchronization are handled entirely by the background Google Drive for Desktop OS client.

#### Mechanism B: Admin Operations via Direct In-App Google Drive API
- **Target Location**: Direct REST API calls to Google Drive v3 endpoints (`https://www.googleapis.com/drive/v3/files`).
- **Application Interaction**:
  - Elevating to Admin Mode triggers an in-app OAuth 2.0 PKCE flow (`http://127.0.0.1:<port>`), prompting the Admin to sign in with their Google Workspace credentials (`admin@domain.com`).
  - Short-lived access tokens are held strictly in volatile application memory.
  - Admin operations (uploading master schedules, pushing emergency announcements, triggering backups to the Superuser Vault) bypass local OS folders completely, executing direct HTTPS requests to Google Cloud.

#### Mechanism C: Automated Superuser Vault Backup
- **Target Location**: An isolated Google Drive folder (`/Superuser_Vault/`) owned exclusively by `admin-vault@domain.com`.
- **Execution**:
  - A Google Apps Script time-driven trigger or an Admin-initiated in-app API trigger copies files from the open-security folder (`/Public_Station_Storage/`) to `/Superuser_Vault/YYYY-MM-DD/`.
  - Regular terminal operators working in Player Mode have no access rights to the Vault directory in Google Drive or on disk.

---

### 3. Architectural Vulnerabilities & "Holes" in this Hybrid Model

While separating Player local file reads from Admin direct API access simplifies user management, it introduces specific vulnerabilities across both operational channels:

#### A. Vulnerabilities in Player Mode (Localized OS Google Drive Folders)

1. **File Hydration & Cloud Sync Stalls ("Beachballing")**
   - **Hole**: Google Drive for Desktop uses "Files On-Demand" (virtual stubs). If an `.mp3` or `.json` file is modified on another machine but hasn't fully downloaded to the local workstation OS filesystem when Interstitial-er attempts to play or read it, file I/O calls freeze or return incomplete data.
   - **Impact**: Playback stutters or silent failures occur during live broadcast automation.

2. **Operating System File Locking Conflicts**
   - **Hole**: When Google Drive for Desktop is actively uploading or downloading a modified schedule or audio file, the OS locks the file handles (`EBUSY` or `PERM` errors on Windows/macOS).
   - **Impact**: Interstitial-er may throw unhandled read/write errors when accessing files currently locked by the Google Drive sync daemon.

3. **Unrestricted Local OS File Tampering**
   - **Hole**: Because Player users access files via standard local filesystem directories, any operator on the shared workstation can open Finder or File Explorer and manually alter or delete `.json` schedules or `.mp3` files outside of Interstitial-er.
   - **Impact**: Accidental deletions bypass application logic and take effect immediately in the local OS sync folder.

4. **Lack of Offline/Sync Status Awareness in App**
   - **Hole**: The Electron application reading local OS files has no native visibility into whether the Google Drive for Desktop client is currently online, paused, disconnected, or encountering sync errors.
   - **Impact**: The app may display stale schedule data without alerting operators that local files are out of sync with the cloud.

---

#### B. Vulnerabilities in Admin Mode (Direct In-App Google Drive API)

1. **OAuth Session Persistence Risk on Shared OS Logins**
   - **Hole**: Since all workstation users log into the same local OS account, if an Admin logs into Interstitial-er and forgets to explicitly log out, subsequent operators on that workstation remain authenticated as Admins.
   - **Mitigation Requirement**: Implement aggressive, non-persistent session timers (e.g., automatically revoking in-memory OAuth tokens after 15 minutes of inactivity or when the app window is blurred/closed).

2. **Unverified OAuth Application Rate Limits**
   - **Hole**: Operating as an unapproved/testing Google OAuth app imposes strict API quotas (10,000 requests/day).
   - **Impact**: Frequent Admin operations or batch file uploads across multiple station PCs can hit API rate limits (`429 Too Many Requests`), blocking administrative actions until quota reset.

3. **Administrative Network Dependency**
   - **Hole**: Because Admin functions bypass local OS mounted folders and rely strictly on direct HTTPS REST API calls, Admins cannot perform administrative overrides or schedule uploads if the workstation loses internet connectivity.

---

#### C. Vulnerabilities in Open-Security Folder Backups

1. **RPO Data Loss Window**
   - **Hole**: Scheduled backups (e.g., nightly) leave a gap where edits made during the day can be accidentally deleted or corrupted before the next snapshot runs.
   - **Impact**: Edits made between backup cycles are lost if a user corrupts an open schedule file.

2. **Zero Per-User Accountability**
   - **Hole**: Since Player users operate under a shared OS login and edit local OS files in an open folder, cloud logs only show changes originated from the shared terminal account or Google Drive sync daemon, preventing identification of the specific person who made an accidental edit.

---

### Summary Matrix

| Architectural Vector | Player Mode (OS Local Drive) | Admin Mode (Direct In-App API) | Primary Risk / Hole |
| :--- | :--- | :--- | :--- |
| **File Access Method** | Local OS Path (`G:\My Drive\...`) | Direct HTTPS (`google.googleapis.com`) | Sync locking & hydration delays on local OS files. |
| **Authentication** | OS Drive Client (No In-App Login) | In-App OAuth 2.0 PKCE Loopback | Persistent Admin tokens on shared OS accounts. |
| **Network Reliance** | Offline Capable (Cached Files) | 100% Online Required for Admin Tasks | Admin features fail if studio internet drops. |
| **Data Protection** | Open Read/Write Access | Direct API to Superuser Vault | Data deleted between backup intervals is unrecoverable. |
