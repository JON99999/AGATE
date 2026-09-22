# Comprehensive Architectural & Security Blueprint: Native Desktop App Control, Granular Access, and Superuser Vault Archiving

---

### Executive Summary & Operational Context

This document outlines an enterprise-grade, highly portable architecture for **Interstitial-er** deployed exclusively as a **standalone native desktop application (macOS DMG / Windows NSIS Executable)** across physical studio workstations. All instances operate under shared local OS login accounts on workstations connected to a custom Google Workspace domain (< 100 total users).

#### Fundamental Constraints & Deployment Premises:
1. **Desktop Executable Only**: Users do not access a web-based client. Interstitial-er runs locally as an Electron + Express desktop binary on macOS (Silicon/Intel) and Windows 10/11.
2. **Unapproved OAuth App Boundary**: Operations utilize internal/testing Google Workspace OAuth scopes without requiring formal public Google Cloud OAuth Verification.
3. **Multi-PC Shared Workstation Terminals**: Multiple physical PCs/Macs run the standalone desktop executable. Because studio staff share local OS accounts, local operating system file permissions cannot differentiate individual human users.
4. **Domain Ownership**: Complete administrative authority over Google Workspace users, Organizational Units (OUs), Google Groups, and Shared Drives.
5. **Trusted Operator Threat Model**: The architecture targets prevention of **accidental, inadvertent, or non-malicious corruption and deletion** of local/synced `.json` configuration files and `.mp3` audio assets by studio staff.

---

### Architectural System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     LOCAL WORKSTATION RUNTIME (macOS / Windows PC)                      │
│                                                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────────────┐  │
│  │                     Interstitial-er Native Desktop App                             │  │
│  │   • Electron Main Process (Node.js) + Bundled Express Server                     │  │
│  │   • Default UI Mode: Player (Read-Only Schedule & Playback Controls)              │  │
│  └───────────────────────────┬───────────────────────────┬───────────────────────────┘  │
│                              │                           │                              │
│         Local File System    │                           │    OAuth 2.0 PKCE Loopback   │
│         Sync / Cache Access  │                           │    & Append Log Operations   │
│                              ▼                           ▼                              │
│  ┌─────────────────────────────────────────┐   ┌─────────────────────────────────────┐  │
│  │ Local Application Support / AppData     │   │ Native OS Backup Daemon             │  │
│  │ (Cached MP3s, Schedules, Config JSON)   │   │ (macOS Time Machine / Windows VSS)  │  │
│  └─────────────────────────────────────────┘   └─────────────────────────────────────┘  │
└──────────────────────────────────────┬──────────────────────────────────────────────────┘
                                       │
                         Secure HTTPS / API Boundaries
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                             GOOGLE WORKSPACE & CLOUD DOMAIN                             │
│                                                                                         │
│  ┌────────────────────────┐     ┌──────────────────────┐     ┌───────────────────────┐  │
│  │  Inviolable Log Store  │     │ Active Shared Drives │     │ Superuser Vault Zone  │  │
│  │  • Append-Only Log     │     │ • Show A (Show A Group)│    │ • Invisible to Users  │  │
│  │  • No Read/Delete for  │     │ • Show B (Show B Group)│    │ • Mirror Snapshots    │  │
│  │    Terminal Operators  │     │ • Schedules & Config │     │ • Isolated Backup     │  │
│  └────────────────────────┘     └──────────────────────┘     └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1. Inviolable Global Logging in Standalone Desktop Executables

When running native desktop software on shared OS workstation accounts, local `.log` files stored in system directories (`Application Support` on macOS or `AppData` on Windows) can theoretically be accessed or modified via File Explorer or Finder.

#### Architectural Solution: Dual-Write with Remote Append Endpoint
- **Local Application Logging**: The Electron main process writes entries locally to disk for instant in-app troubleshooting and offline fallback.
- **Asynchronous Cloud Append**: Concurrently, the Electron main process transmits structured JSON log payloads (containing Terminal Workstation ID, Timestamp, Action ID, and Authenticated User Identity) over HTTPS to an isolated ingestion endpoint (e.g., a Google Apps Script Web App or Google Cloud Logging endpoint).
- **Security Boundary**:
  - The central log store (Google Sheet or Log Storage Bucket) is owned exclusively by `admin-vault@domain.com`.
  - The Interstitial-er desktop app holds **Write/Append-Only** credentials for this endpoint.
  - Studio operators have zero Read, Edit, or Delete permissions on the cloud log repository, guaranteeing audit integrity even if local disk files are manipulated.

---

### 2. Desktop-Based Authorization & Show Scoping

#### A. Admin vs. Regular Player Authorization
- **Default State**: Interstitial-er launches in **Player Mode** on every desktop workstation (read-only schedule display, active audio playback engine, locked admin functions).
- **Desktop OAuth Loopback**: Elevating to Admin Mode initiates an OAuth 2.0 PKCE authentication flow. The Electron main process launches a secure system browser loop or embedded window asking for the user's custom-domain Google credentials (`user@domain.com`).
- **Group Verification**: The desktop app calls the Google Directory API using the acquired access token to verify membership in `admins@<domain>`.
  - **Success**: The desktop app unlocks Admin tabs and controls for that session.
  - **Failure**: The app remains locked in standard Player Mode.

#### B. Dynamic Show Owner Access Control (Evergreens & Interstitials)
To prevent Show Owner A from accidentally modifying or purging assets belonging to Show Owner B when sitting at any studio desktop PC:
- **Group-Based Access Control (GBAC)**: Create a Google Group per show (e.g., `show-morningbreak@domain.com`).
- **Shared Drive Mapping**: Drive storage folders are mapped according to these show groups.
- **Desktop UI Enforcement**:
  - Upon user login within the desktop executable, the Electron application evaluates the logged-in user's assigned Google Groups.
  - The desktop UI enables Read-Write file operations for Evergreens and Interstitials **only for shows matching the user's group memberships**.
  - Non-owned show folders are displayed in a locked Read-Only state within the application.

---

### 3. Desktop Multi-Tiered Archiving & Mirroring Framework

To insulate the studio against accidental file overwrites, corrupted MP3 headers, or unintended directory deletions across local desktop workstations, a **four-layer archiving framework** is implemented:

```
                      ┌────────────────────────────┐
                      │ Desktop Workstation Net    │
                      │ (macOS / Windows PCs)      │
                      └─────────────┬──────────────┘
                                    │
    ┌───────────────────┬───────────┴───────────┬───────────────────┐
    │                   │                       │                   │
    ▼                   ▼                       ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  ┌──────────────┐
│ Tier 1:      │  │ Tier 2:      │  │ Tier 3:              │  │ Tier 4:      │
│ Google Drive │  │ Superuser    │  │ Headless Station     │  │ Native OS    │
│ Versioning   │  │ Cloud Vault  │  │ Daemon Mirror        │  │ Time Capsule │
│ & Trash      │  │ Mirror       │  │ (rclone / Server)    │  │ & Win VSS    │
└──────────────┘  └──────────────┘  └──────────────────────┘  └──────────────┘
```

#### Tier 1: Google Drive File Versioning & Trash Rules
- **Native Revision Retention**: Google Drive automatically retains prior revisions of binary files (`.mp3`) and configuration files (`.json`, `.txt`) for 30 days. If an operator accidentally overwrites a file via Google Drive for Desktop or within the app, a Superuser can revert the file directly via Google Drive.
- **Restricted Trash Purging**: Domain-level Google Workspace policies are set to prohibit standard domain users from executing "Empty Trash" on Shared Drives.

#### Tier 2: Isolated Superuser Vault (Automated Cloud Snapshots)
- **Concept**: A scheduled Google Apps Script or background service mirrors active show folders (`/Shows/`) into an isolated `/Superuser_Vault/` cloud folder.
- **Permission Boundary**:
  - The `/Superuser_Vault/` directory is invisible to standard station users and show groups.
  - **Only Superusers (`superuser@domain.com`) have access rights**.
- **Execution Workflow**:
  - Incremental snapshots of `.json` schedules, `.m3u` playlists, and `.mp3` assets are copied into timestamped archive directories (e.g., `/Superuser_Vault/2026-08-12_0200/`).
  - Terminal operators at studio PCs cannot view, edit, or purge these vault archives.

#### Tier 3: Headless Station Daemon Mirroring (rclone / Server Cron)
- **Concept**: A dedicated background service running on a central station server or always-on host uses `rclone` or Node.js scripts to back up Google Drive show folders directly.
- **Operation**:
  - Command example: `rclone sync google-drive:ActiveShows /Vault/ActiveShows_Mirror --backup-dir /Vault/History/2026-08-12`
  - Runs independently of individual workstation power states, creating point-in-time recovery archives.

#### Tier 4: Desktop OS Native Hardware Snapshots (Time Capsule / macOS Time Machine / Windows VSS)
Because Interstitial-er runs as a native desktop application storing local caches and settings on local workstation drives:
- **macOS Time Machine & Time Capsule**:
  - On Mac studio terminals, configure macOS Time Machine to perform automated hourly backups to a local network backup target (e.g., Apple Time Capsule, Synology NAS, or encrypted USB/Thunderbolt storage).
  - Backs up local application paths (`~/Library/Application Support/interstitial-er`) and mapped media drives.
  - Access to the Time Capsule / network backup target is restricted to Superuser admin credentials so local workstation operators cannot format or purge backup images.
- **Windows Volume Shadow Copy Service (VSS)**:
  - On Windows studio PCs, enable system Volume Shadow Copies on the drive housing `%APPDATA%\interstitial-er` and local audio folders, maintaining automatic shadow points every 12–24 hours.

---

### 4. Portable Multi-Organization Schema (`org-config.json`)

To keep the desktop executable fully reusable across multiple independent radio stations or organizations, all parameters are configured externally via `org-config.json`:

```json
{
  "organizationName": "Community Public Radio",
  "domain": "communityradio.org",
  "groups": {
    "adminGroup": "station-admins@communityradio.org",
    "showGroupPrefix": "show-",
    "showGroupSuffix": "@communityradio.org"
  },
  "storage": {
    "provider": "google_drive",
    "rootSharedDriveId": "1A2B3C4D5E6F7G8H9",
    "superuserVaultDriveId": "9Z8Y7X6W5V4U3T2S1",
    "mirrorIntervalHours": 6
  },
  "logging": {
    "remoteEndpointUrl": "https://script.google.com/macros/s/AKfycbx.../exec",
    "retentionDays": 90
  }
}
```

---

### Operational Risk Mitigation Matrix

| Scenario / Threat | Primary Defense Mechanism | Recovery Procedure |
| :--- | :--- | :--- |
| **Accidental Overwrite of MP3 Asset** | Tier 1 (Drive Native Revisions) | Superuser reverts file version in Google Drive. |
| **Inadvertent Deletion of Show Folder** | Tier 2 & Tier 3 (Superuser Vault / rclone) | Superuser copies folder back from isolated Vault mirror. |
| **Tampering with Terminal Event Logs** | Cloud Append-Only Endpoint | Operators have zero permissions on the remote log store. |
| **Show Owner A Modifying Show B Assets** | Dynamic Group Scoping | Desktop UI locks write controls for non-owned show folders. |
| **Complete Workstation Disk / PC Failure** | Tier 4 (Time Machine / VSS Snapshots) | Restore local application state from Time Capsule or VSS snapshot. |
