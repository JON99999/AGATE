# WIPE - Wonderful Interstitial PlayEr User Guide

WIPE (Wonderful Interstitial PlayEr) is a cross-platform desktop audio scheduling utility designed to coordinate precise playback of interstitial MP3 files. 

Because these installation files are distributed directly and are not downloaded from the official Mac App Store or Microsoft Store, both macOS and Windows will flag them as untrusted or "scary internet files" upon first launch. Follow the guide below to authorize and run the application.

---

## First-Time Configuration & Folder Setup

Once launched for the first time, you must configure **3 Local folders** within the configuration settings window:
1. **MP3 Storage Folder**: The folder containing the audio files scheduled for playback.
2. **Schedules Folder**: The directory where your schedule files are stored.
3. **Logs Folder**: The directory where play logs and diagnostics are written.

*Note on Folders:*
- These three locations can point to the exact same folder if desired.
- You can use mapped network drives or cloud-synchronized folders (such as Microsoft OneDrive or Google Drive) provided that the localized sync client is active and has full write permissions on that directory.

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
4. Locate the message stating that *"Interstitial-er was blocked from use because it is not from an identified developer"* and click **Open Anyway**.
5. Authenticate with your Mac password or Touch ID, then click **Open** on the confirmation dialog. The app will launch normally from this point forward.

---

## Windows Installation & Authorization

### 1. Selecting the Correct Format
- **Portable Version**: Runs directly from the `.exe` file without modifying system files or creating an installer profile. Recommended for quick testing.
- **Installer Version**: Installs the application to your standard Program Files registry.

### 2. Bypassing Windows Defender SmartScreen
When opening the executable on Windows:
1. A blue window will appear stating *"Windows protected your PC"* (SmartScreen).
2. Click the small **"More info"** text link underneath the warning statement.
3. A supplementary button labeled **"Run anyway"** will appear at the bottom right. Click this button to launch the application.

---

## License & Alternative Licensing

**WIPE (Wonderful Interstitial PlayEr)** is licensed under the **GNU General Public License v3.0 (GPLv3)**. See the [LICENSE](./LICENSE) file for the complete license terms.

Third-party dependencies and their respective open source licenses are documented in [OPEN_SOURCE_LICENSES.md](./OPEN_SOURCE_LICENSES.md).

### Alternative Licensing
If you desire alternative licensing terms (such as an exemption from GPLv3 copyleft terms), please contact the developer to discuss custom arrangements.
