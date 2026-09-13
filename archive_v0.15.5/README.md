# AMP - Announcement Media Player User Guide

AMP (Announcement Media Player) is a cross-platform announcement scheduling utility designed to coordinate playback and live-reads of interstitials in a broadcast situation such as a radio station, podcasting network, or public address system.

---

## Overview & Key Features

AMP (Announcement Media Player) is an all-in-one broadcast automation and scheduling platform designed for radio stations, studio hosts, and audio producers. It streamlines station programming and coordinates music, underwriting, and announcements in one place:

- **Tailored with 3 Applications**:
  - **Admin app**: Build weekly show calendars, schedule underwriting and promo carts, organize scripts and audio files, and configure station settings.
  - **User apps**: An interactive console for announcers, show hosts and DJs, featuring organized track queues, countdown clocks, break markers, audio plays, and live script teleprompter overlays.
    - **Studio app**: Designed for pre-recording, exporting playlists, and managing evergreen show fallbacks.  
    - **Live App**: Designed for live broadcast control with zero lag.

- **Flexibility of 4 Play Modes**:
  - **Live**: For On-Air and Live broadcasts.  Keeps audio and live reads cached, ready to play, and synchronized to real-world time.
  - **Playlist**: Allows advanced Live hosts to bring their own audio and playlists to supplement the standard scheduled audio and live reads.
  - **Prerecord**: Lets hosts record and time future shows in advance.  Hosts can specify which future show they are recording, and the appropriate scheduled audio and live reads are retrieved for use and logging.
  - **Log Export**: Generates an export of all files needed for a show.  Files are labeled and placed in sequence, and a m3u playlist is generated.  Serves 2 uses.  First, hosts who need the Announcements, but prefer to use them outside of the AMP application.  And Second, hosts or station managers who need to create a playlist from the Evergreen show and the currently scheduled announcements.  (i.e. when a host is sick or there is inclement weather.)

- **One-Folder Simplicity (5 Organized Subfolders)**:
  - Connect a single main folder on your computer, network share (NAS), or cloud drive, and AMP automatically creates and manages the complete station storage tree:
    - **Logs**: Real-time playout audit trails and daily playback history.
    - **Media_Announcements**: Carts, promos, station IDs, legal IDs, and script cards.
    - **Media_Evergreens**: Backup show audio ready to air whenever a live host is unavailable.
    - **MEDIA_ Shows**: Music playlists, tracks, and episodic recordings organized by show.
    - **Settings**: Centralized show schedules, announcement definitions, and instant rollbacks.

- **Visual Calendars of Shows and Announcements with Auditing**:
  - Shows: Weekly programming grids with each show, host, and time defined along with a description of the show.
  - Announcements: Hourly announcement rules, time-gated underwriting schedules with start/end dates over the course of a campaign, and live-read script prompts backed with alternate audio.  Options for Hour by Weekday grid scheduling, Hourly Scheduling, and One time Scheduling.
  - Smart audit tools that find and highlight missing and overlapping Shows and Announcements. 

- **Automated Logging & Compliance Reporting**:
  - Every played, skipped, or fallback item is automatically recorded with timestamps, durations, and metadata for underwriter and stakeholder proof-of-performance and broadcast reporting.
  - Logs are filterable and exportable as .csv (Comma Separated) or .xlsx (Excel) format.

---

# INSTALLATION

## First-Time Configuration & Folder Setup

Once launched for the first time, you must **configure a Local Folder** within the folder settings window. Setting one main root folder handles all 5 subfolders automatically.

### macOS Optimization with `.noindex`
On macOS, naming your main folder with the `.noindex` extension (e.g., `AMP_files.noindex`) provides significant operational benefits:
- Prevents macOS Spotlight from adding `.json` schedule and log files to your **Finder Recents** list.
- Minimizes risk of non-Admin users from accidentally opening or editing critical broadcast files.
- Eliminates background Spotlight re-indexing overhead whenever the player saves logs or updates schedules.

### 5-Folder Structure Details & Permissions
If you need to specify unique locations for certain types of data, you can specify **Advanced** folders:
1. **`settings` (Read & Write)**: Contains show definitions, announcement carts, and automated backups. Requires full read and write access for schedule management.
2. **`logs` (Read & Write)**: Contains daily playout logs and audit records. Requires full read and write access for live logging.
3. **`media_announcements` (Read-Only or Read-Write)**: Station IDs, PSAs, underwriting spots, and live read scripts.
4. **`media_evergreens` (Read-Only or Read-Write)**: Prerecorded fallback show episodes organized by show name.
5. **`media_shows` (Read-Only or Read-Write)**: Show playlists, episodic tracks, and audio cues organized by show name.

*Note on Network & Cloud Folders:*
- You can use mapped network drives (SMB/NAS) or cloud-synchronized folders (Microsoft OneDrive, Google Drive, Dropbox) provided that the localized sync client is active and has full write permissions on that directory.
- The 5 Advanced locations can point to the exact same folder if desired.
- If you place Evergreens and Shows in the same directory, the interface will share audio files found in those folders for both tasks.

---

## Installation & Authorization

Because these installation files are distributed directly and are not downloaded from the official Mac App Store or Microsoft Store, both macOS and Windows will flag them as untrusted or "scary internet files" upon first launch. Follow the guide below to authorize and run the application.

### macOS Installation & Authorization

#### 1. Selecting the Correct Architecture File
Select the installer appropriate for your hardware:
- **Apple Silicon (newer arm64)**: Choose this version if you are on a Mac with Apple Silicon (M1, M2, M3 chips, etc.).
- **Apple Intel (older x64)**: Choose this version if you are on an older, Intel-based Mac.

#### 2. Bypassing macOS Gatekeeper Gate
Because the app is unsigned, macOS will block execution on the first attempt:
1. Double-click the application icon to launch it. A dialog box will appear stating that the app cannot be opened because it is from an unidentified developer. Click **OK**.
2. Open **System Settings** on your Mac.
3. Navigate to **Privacy & Security** and scroll down to the Security section.
4. Locate the message stating that *"AMP was blocked from use because it is not from an identified developer"* and click **Open Anyway**.
5. Authenticate with your Mac password or Touch ID, then click **Open** on the confirmation dialog. The app will launch normally from this point forward.
6. Later you may receive a System message or similar to allow local network permissions. Do approve this.

---

### Windows Installation & Authorization

#### 1. Selecting the Correct Format
- **Portable Version**: Runs directly from the `.exe` file without modifying system files or creating an installer profile.
- **Installer Version**: Installs the application to your standard Program Files registry.

#### 2. Bypassing Windows Defender SmartScreen
When opening the executable on Windows:
1. A blue window will appear stating *"Windows protected your PC"* (SmartScreen).
2. Click the small **"More info"** text link underneath the warning statement.
3. A supplementary button labeled **"Run anyway"** will appear at the bottom right. Click this button to launch the application.
4. Later you may receive a Windows Defender message or similar to allow local network permissions. Do approve this.

---

## License & Alternative Licensing

**AMP (Announcement Media Player)** is licensed under the **GNU General Public License v3.0 (GPLv3)**. See the [LICENSE](./LICENSE) file for the complete license terms.

Third-party dependencies and their respective open source licenses are documented in [OPEN_SOURCE_LICENSES.md](./OPEN_SOURCE_LICENSES.md).

### Alternative Licensing
If you desire alternative licensing terms (such as an exemption from GPLv3 copyleft terms), please contact the developer to discuss custom arrangements.

---

## Liability and Usage

The developer is just a simple cave man lawyer. This code is provided without any kind of warranty or assurances. It might royally fail. It might mess something up. It does create and rename folders and files. It relies on code the author doesn't always understand. USE AT YOUR OWN RISK! But if it works for you and your organization, that's great. And if you open source it into something even more beautiful, that's also great.




