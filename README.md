# AMP - Announcement Media Player User Guide

AMP (Announcement Media Player) is a cross-platform desktop audio scheduling utility designed to coordinate precise playback of interstitial MP3 files. 

Because these installation files are distributed directly and are not downloaded from the official Mac App Store or Microsoft Store, both macOS and Windows will flag them as untrusted or "scary internet files" upon first launch. Follow the guide below to authorize and run the application.

---

## First-Time Configuration & Folder Setup

Once launched for the first time, you must **configure a Local Folder** within the folder settings window.  

If you need to specify unique locations for certain types of data, you can specify **Advanced** folders
1. **logs**: The folder containing the playback and live read logs.
2. **media_announcements**: The directory where your announcement audio and live read text are stored.
3. **media_evergreens**: The directory for storing "Evergreen Show" files.  "Evergreens" are generic prerecorded audio to replace a live or recorded show when the live or recorded show isn't available.  Separate folders for each show are created as shows are added in the application.
4. **media_shows**: The directory for storing "Playlist" files.  "Playlist" files are audio to be used _only_ on a specific show.  It could be prerecorded segments, or individual songs or cuts.  Separate folders for each show are created as shows are added in the application.
5. **settings**: The directory where the show and announcement definitions are stored.

*Note on "Local" Folders:*
- You can use mapped network drives or cloud-synchronized folders (such as Microsoft OneDrive or Google Drive) provided that the localized sync client is active and has full write permissions on that directory.
- The 5 Advanced locations can point to the exact same folder if desired.
--However, if you do put Evergreens and Shows in the same folder, then the interface will share any audio files found in those folders for both tasks.

---

## macOS Installation & Authorization

### 1. Selecting the Correct Architecture File
Select the installer appropriate for your hardware:
- **Apple Silicon (newer arm64)**: Choose this version if you are on a Mac with Apple Silicon (M1, M2, M3 chips, etc.).
- **Apple Intel (older x64)**: Choose this version if you are on an older, Intel-based Mac.

### 2. Bypassing macOS Gatekeeper Gate
Because the app is unsigned, macOS will block execution on the first attempt:
1. Double-click the application icon to launch it. A dialog box will appear stating that the app cannot be opened because it is from an unidentified developer. Click **OK**.
2. Open **System Settings** on your Mac.
3. Navigate to **Privacy & Security** and scroll down to the Security section.
4. Locate the message stating that *"AMP was blocked from use because it is not from an identified developer"* and click **Open Anyway**.
5. Authenticate with your Mac password or Touch ID, then click **Open** on the confirmation dialog. The app will launch normally from this point forward.
6. Later you may receive a System message or similar to allow local network permissions.  Do approve this.

---

## Windows Installation & Authorization

### 1. Selecting the Correct Format
- **Portable Version**: Runs directly from the `.exe` file without modifying system files or creating an installer profile.
- **Installer Version**: Installs the application to your standard Program Files registry.

### 2. Bypassing Windows Defender SmartScreen
When opening the executable on Windows:
1. A blue window will appear stating *"Windows protected your PC"* (SmartScreen).
2. Click the small **"More info"** text link underneath the warning statement.
3. A supplementary button labeled **"Run anyway"** will appear at the bottom right. Click this button to launch the application.
4. Later you may receive a Windows Defender message or similar to allow local network permissions.  Do approve this.

---

## License & Alternative Licensing

**AMP (Announcement Media Player)** is licensed under the **GNU General Public License v3.0 (GPLv3)**. See the [LICENSE](./LICENSE) file for the complete license terms.

Third-party dependencies and their respective open source licenses are documented in [OPEN_SOURCE_LICENSES.md](./OPEN_SOURCE_LICENSES.md).

### Alternative Licensing
If you desire alternative licensing terms (such as an exemption from GPLv3 copyleft terms), please contact the developer to discuss custom arrangements.

---

## Liability and Usage

The developer is just a simple cave man lawyer.  This code is provided without any kind of warranty or assurances.  It might royally fail.  It might mess something up.  It does create and rename folders.  It relies on code the author doesn't always understand.  USE AT YOUR OWN RISK!  But if it works for you and your organization, that's great.  And if you open source it into something even more beautiful, that's also great.




