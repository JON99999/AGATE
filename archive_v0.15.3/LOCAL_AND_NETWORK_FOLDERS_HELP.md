# Local, Network, and Cloud Directory Mapping Guide (Interstitial-er)

This guide provides technical steps to configure local network directories and cloud-synchronized folders so they appear as standard local directories on your operating system. By mapping these systems correctly, **Interstitial-er**'s "Local Folder" synchronization option can read scheduler databases, log listings, and play MP3 audio files directly from remote sources.

---

## 🖥️ Section 1: Local Network Shares and NAS Setup (Home & Small Business)

For home networks or small businesses without complex enterprise domain controllers, you can share files between computers or an on-premise NAS (Network Attached Storage) using standard local network methods.

### 1. NAS (Synology, QNAP, etc.) Setup
1. Log into your NAS web administration interface.
2. Ensure the **SMB (Server Message Block) Service** is enabled (usually under File Services / Win/Mac/NFS settings).
3. Create a shared folder dedicated to your scheduler (e.g., `InterstitialerShare`).
4. Under User/Group permissions, create a local user account for the player terminals and grant it **Full Read/Write privileges** to that folder.
5. Create an `mp3` subfolder inside this share to store your audio files.

---

### 2. macOS Client Configuration (Mounting & Auto-Mounting)

macOS mounts network volumes under the `/Volumes/` directory. You must mount the network share and configure it to reconnect automatically on boot.

#### Step A: Mount the Share
1. Open **Finder**.
2. Press `Command + K` (or select **Go** > **Connect to Server** from the menu bar).
3. Input the server address using the SMB protocol:
   * By IP Address: `smb://192.168.1.100/InterstitialerShare`
   * By Hostname: `smb://mynas.local/InterstitialerShare`
4. Click **Connect**.
5. Enter the username and password created on the NAS/host computer, check "Remember this password in my keychain", and click **Connect**.
6. The volume will mount and appear in Finder.

#### Step B: Configure Persistence (Auto-Mount on Boot)
To ensure the folder remains mapped after a restart:
1. Open **System Settings** > **General** > **Login Items**.
2. Under **Open at Login**, click the **+ (Add)** button.
3. Browse to your mounted network volume under **Locations** in Finder and click **Add**.
4. The system will now automatically attempt to remount the share when the user logs in.

#### Target Path in Interstitial-er:
When using the "Local Folder" picker in Interstitial-er, select the mounted volume. The underlying absolute path resolved by the OS is:
```text
/Volumes/InterstitialerShare/
```

---

### 3. Windows Client Configuration (Mapping Network Drives)

On Windows, network paths should be assigned a persistent drive letter (e.g., `Z:\`) so that the application has a static target identifier.

#### Step A: Map the Network Drive
1. Open **File Explorer**.
2. Right-click **This PC** in the left sidebar and select **Map network drive...** (or click the three dots in the top menu and choose **Map network drive**).
3. Choose an available drive letter from the dropdown (e.g., `Z:`).
4. In the **Folder** input box, enter the UNC path to your share:
   * By IP Address: `\\192.168.1.100\InterstitialerShare`
   * By Hostname: `\\mynas\InterstitialerShare`
5. Ensure **Reconnect at sign-in** is checked.
6. Check **Connect using different credentials** if you are accessing another computer's files with separate local accounts.
7. Click **Finish**. Enter the credentials and check "Remember my credentials".

#### Target Path in Interstitial-er:
In the Interstitial-er settings panel, use the folder selector to navigate to the mapped drive or enter:
```text
Z:\
```

---

## ☁️ Section 2: Integration with Cloud Synchronization Clients

Online storage services (Google Drive, Dropbox, OneDrive, iCloud) offer desktop synchronization clients. These clients download or cache files locally, allowing the operating system to serve them as native file directories.

> ### ⚠️ Critical Performance Prerequisite: Always Enable Offline Access
> Most modern sync clients use "On-Demand" or "Stream" mode by default. This keeps files virtual, downloading them only when opened. If an audio track has not been cached, Interstitial-er may experience latency or lookup failures when trying to play a scheduled track.
>
> You **MUST** mark your scheduler directory as **"Available Offline"** or **"Always keep on this device"** in your operating system's file browser to ensure instant playback without network delays.

---

### 1. Google Drive (Google Drive for Desktop)

The Google Drive client supports two file-handling modes. We recommend using **Mirror** mode for maximum local reliability, though **Stream** mode is compatible if offline folders are configured correctly.

#### Preparation Setup:
1. Download and install [Google Drive for Desktop](https://www.google.com/drive/download/).
2. Open the Google Drive preferences panel.
3. Choose your synchronization style:
   * **Stream Files (Default):** Virtualizes your files. Right-click your specialized scheduler folder in Finder or File Explorer, select **Google Drive**, and change the setting to **Available offline**.
   * **Mirror Files:** Copies all My Drive files directly to a designated physical path on your hard disk. This is the most stable option for secondary network players.

#### Default Local Folder Directories:
* **macOS (Stream mode):** `/Volumes/GoogleDrive/My Drive/` (or via CloudStorage relative mounting: `/Users/[Username]/Library/CloudStorage/GoogleDrive-[Email]/My Drive/`)
* **macOS (Mirror mode):** `/Users/[Username]/Google Drive/My Drive/`
* **Windows (Stream mode):** `G:\My Drive\` (The drive letter can be configured in Google Drive settings).
* **Windows (Mirror mode):** `C:\Users\[Username]\Google Drive\My Drive\`

---

### 2. Dropbox (Dropbox Desktop Client)

Dropbox maintains a physical, synchronized copy of files locally on the hard drive. 

#### Preparation Setup:
1. Install the Dropbox desktop app.
2. Sign in and wait for primary metadata synchronization.
3. Locate your scheduler folder in Finder or File Explorer.
4. Right-click the folder and select **Make available offline** (this forces Dropbox to download all assets, turning the grey cloud icon into a green checkmark).

#### Default Local Folder Directories:
* **macOS:** `/Users/[Username]/Dropbox/` (On newer macOS versions, it may map to `/Users/[Username]/Library/CloudStorage/Dropbox/`)
* **Windows:** `C:\Users\[Username]\Dropbox\`

---

### 3. Microsoft OneDrive

OneDrive is built natively into Windows 10/11 and available as a separate installation for macOS.

#### Preparation Setup:
1. Install or sign in to the OneDrive application.
2. Locate your synced directory.
3. Right-click the folder containing your MP3 files and schedule list, and select **Always keep on this device** to prevent files from converting to online-only status.

#### Default Local Folder Directories:
* **macOS:** `/Users/[Username]/Library/CloudStorage/OneDrive-Personal/` (or `/Users/[Username]/OneDrive/`)
* **Windows:** `C:\Users\[Username]\OneDrive\`

---

### 4. iCloud Drive (Apple Devices / iCloud for Windows App)

iCloud Drive behaves identically to other cloud sync services and can be accessed locally.

#### Preparation Setup (macOS):
1. Enable iCloud Drive under **System Settings** > **[Your Apple ID]** > **iCloud**.
2. Open Finder.
3. Right-click your scheduler directory under iCloud Drive and select **Download Now** to cache files offline.

#### Preparation Setup (Windows):
1. Install [iCloud for Windows](https://support.apple.com/en-us/118471) from the Microsoft Store.
2. Sign in and check the box to enable **iCloud Drive**.
3. In File Explorer, locate the folder inside iCloud Drive, right-click, and select **Always keep on this device**.

#### Default Local Folder Directories:
* **macOS:** `/Users/[Username]/Library/Mobile Documents/com~apple~CloudDocs/`
* **Windows:** `C:\Users\[Username]\iCloudDrive\`

---

## 🔧 Section 3: Configuring the Path inside Interstitial-er

Once your network or cloud drive is correctly mounted and synced offline, configure the application to target it.

1. Open **Interstitial-er**.
2. Go to **Settings** (gear icon).
3. Find the directory configuration section.
4. Under **Sync Source**, choose the **Local Folder** option.
5. Click the directory selection button to browse your system folders:
   * **macOS Finder:** Navigate to the mapped path (e.g., scroll down to *Locations* for mapped servers, select the volume, or go to your user home folder to select iCloud Drive, OneDrive, Google Drive, or Dropbox).
   * **Windows File Explorer:** Navigate to the designated drive letter (e.g., `Z:\` for network drives, or `G:\` / `C:\Users\[Username]...` for synced cloud folders).
6. Click **Save** or **Confirm** to lock in the directory path. The scheduling engine will now monitor this folder for schedule databases and audio files.
