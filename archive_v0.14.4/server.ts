import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import NodeID3 from 'node-id3';
import { Interstitial, LogEntry, Show } from './src/types';

const isMac = process.platform === 'darwin';

// Detect safe persistent directory for packaged desktop apps
const isExplicitPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
const isExtractedPortable = !isMac && !process.defaultApp && path.basename(process.execPath).toLowerCase().includes('portable');
const IS_PORTABLE = isExplicitPortable || isExtractedPortable;

if (IS_PORTABLE && !process.env.PORTABLE_EXECUTABLE_DIR) {
  process.env.PORTABLE_EXECUTABLE_DIR = path.dirname(process.execPath);
}

const BASE_DIR = IS_PORTABLE
  ? process.env.PORTABLE_EXECUTABLE_DIR!
  : (process.env.APP_USER_DATA_PATH || process.cwd());

// Persist settings in the launch directory (portable) or application user directory (installed/dev)
const SETTINGS_FILE = path.join(BASE_DIR, 'agate_settings.json');

// Guaranteed synchronous directory verification for fresh installations
try {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true, mode: 0o755 });
    console.log(`[Init] Successfully initialized base storage directory for fresh installation: ${BASE_DIR}`);
  }
} catch (dirInitErr) {
  console.error(`[Init Error] Failed to create base storage directory: ${BASE_DIR}`, dirInitErr);
}

// Global server-side locations configuration
let currentSettings = {
  mode: 'Demo',
  localPathMP3s: '',
  localPathLogs: '',
  localPathCalendar: '',
  driveFolderLogs: '',
  driveFolderMP3s: '',
  driveFolderPreferences: '',
};

// Load settings from file on launch if available
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    currentSettings = { ...currentSettings, ...JSON.parse(raw) };
    console.log('Loaded application folder settings:', currentSettings);
  }
} catch (e) {
  console.log('Started with default settings configuration');
}

// Dynamic Path Resolutions - strictly resolve files within user-configured folders, or return null if unconfigured
function getCalendarFilePath(): string | null {
  if (currentSettings.localPathCalendar && fs.existsSync(currentSettings.localPathCalendar)) {
    const targetFile = path.join(currentSettings.localPathCalendar, 'interstitials.json');
    // If interstitials.json was saved in a subfolder during previous operation, copy back if needed
    if (!fs.existsSync(targetFile)) {
      const subFolderFile = path.join(currentSettings.localPathCalendar, 'Interstitials', 'interstitials.json');
      const mediaSubFolderFile = currentSettings.localPathMP3s && fs.existsSync(currentSettings.localPathMP3s)
        ? path.join(currentSettings.localPathMP3s, 'Interstitials', 'interstitials.json')
        : null;
      if (fs.existsSync(subFolderFile)) {
        try { fs.copyFileSync(subFolderFile, targetFile); } catch (e) {}
      } else if (mediaSubFolderFile && fs.existsSync(mediaSubFolderFile)) {
        try { fs.copyFileSync(mediaSubFolderFile, targetFile); } catch (e) {}
      }
    }
    return targetFile;
  }
  return null;
}

function getLogFilePath(): string | null {
  if (currentSettings.localPathLogs && fs.existsSync(currentSettings.localPathLogs)) {
    return path.join(currentSettings.localPathLogs, 'logs.json');
  }
  return null;
}

function getLogBackupPath(): string | null {
  if (currentSettings.localPathLogs && fs.existsSync(currentSettings.localPathLogs)) {
    return path.join(currentSettings.localPathLogs, 'backups', 'logs_backup.json');
  }
  return null;
}

function getCalendarBackupPath(): string | null {
  const calendarPath = getCalendarFilePath();
  if (calendarPath) {
    const calendarDir = path.dirname(calendarPath);
    return path.join(calendarDir, 'backups', 'interstitials_backup.json');
  }
  return null;
}

function getShowsFilePath(): string | null {
  const calendarPath = getCalendarFilePath();
  if (calendarPath) {
    return path.join(path.dirname(calendarPath), 'shows.json');
  }
  return null;
}

function getShowsBackupPath(): string | null {
  const showsPath = getShowsFilePath();
  if (showsPath) {
    return path.join(path.dirname(showsPath), 'backups', 'shows_backup.json');
  }
  return null;
}

/**
 * Generates a collision-resistant, lexicographically sortable backup filename:
 * [type]_backup_[YYYYMMDD]_[HHmmss]_[MODE]_[salt].json
 * where [MODE] is 'LIVE', 'STUDIO', or 'ADMIN'
 */
function generateBackupFilename(type: 'logs' | 'interstitials' | 'shows', workstationMode?: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  let resolvedMode = (workstationMode || '').toUpperCase().trim();
  if (resolvedMode !== 'LIVE' && resolvedMode !== 'STUDIO' && resolvedMode !== 'ADMIN') {
    // Check dist/app-config.json or environment variables
    try {
      const configPath = path.join(process.cwd(), 'dist', 'app-config.json');
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const cfgMode = String(cfg.mode || '').toUpperCase().trim();
        if (cfgMode === 'LIVE' || cfgMode === 'STUDIO' || cfgMode === 'ADMIN') {
          resolvedMode = cfgMode;
        }
      }
    } catch {
      // ignore
    }
  }

  if (resolvedMode !== 'LIVE' && resolvedMode !== 'STUDIO' && resolvedMode !== 'ADMIN') {
    const envMode = (process.env.VITE_APP_MODE || process.env.APP_MODE || '').toUpperCase().trim();
    if (envMode === 'LIVE' || envMode === 'STUDIO' || envMode === 'ADMIN') {
      resolvedMode = envMode;
    } else {
      resolvedMode = 'ADMIN';
    }
  }

  const salt = Math.random().toString(16).substring(2, 6).padStart(4, '0');
  return `${type}_backup_${yyyy}${mm}${dd}_${hh}${min}${ss}_${resolvedMode}_${salt}.json`;
}

/**
 * Atomic Write Utility
 * Writes to a temporary file in the target directory first, then renames atomically.
 * Prevents partially written or corrupted JSON files if an unexpected error occurs.
 */
function atomicWriteFileSync(filePath: string, data: string | Buffer): void {
  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  const tempFile = path.join(
    parentDir,
    `.${path.basename(filePath)}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );
  try {
    fs.writeFileSync(tempFile, data, 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (err: any) {
    // If temp file remains, attempt cleanup
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (_) {}
    throw err;
  }
}

// Try detecting Electron context-isolation open dialog options dynamically
let electronDialog: any = null;
try {
  const electron = require('electron');
  if (electron && electron.dialog) {
    electronDialog = electron.dialog;
  }
} catch (e) {
  // Graceful fallback outside Electron desktop application environment (e.g., standard browser view in Devbox)
}

let registeredOAuthToken: string | null = null;

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // API - Custom OAuth Loopback Handlers (Method B)
  app.post('/api/register-token', (req, res) => {
    const { token } = req.body;
    if (token) {
      registeredOAuthToken = token;
      console.log('Successfully registered OAuth token on local server.');
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Token is required' });
    }
  });

  app.get('/api/check-registered-token', (req, res) => {
    if (registeredOAuthToken) {
      const token = registeredOAuthToken;
      registeredOAuthToken = null; // Consume token to prevent re-use
      res.json({ token });
    } else {
      res.json({ token: null });
    }
  });

  app.get('/api/oauth-callback', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WIPE Sign-In Success</title>
  <style>
    body {
      background-color: #0f172a; /* Slate 900 */
      color: #cbd5e1; /* Slate 300 */
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background-color: #1e293b; /* Slate 800 */
      border: 1px solid #334155; /* Slate 700 */
      border-radius: 8px;
      padding: 32px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      text-align: center;
    }
    .title {
      color: #f1f5f9; /* Slate 100 */
      font-size: 20px;
      font-weight: 700;
      margin-top: 0;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .status-text {
      font-weight: 600;
      font-size: 14px;
      margin-top: 16px;
      margin-bottom: 8px;
    }
    .status-success {
      color: #34d399; /* Emerald 400 */
    }
    .status-error {
      color: #f87171; /* Red 400 */
    }
    .status-pending {
      color: #60a5fa; /* Blue 400 */
    }
    .desc {
      font-size: 13px;
      color: #94a3b8; /* Slate 400 */
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .token-container {
      margin-top: 20px;
      text-align: left;
    }
    .token-label {
      font-size: 9px;
      font-weight: bold;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
      display: block;
    }
    .token-box {
      width: 100%;
      height: 60px;
      background-color: #0f172a;
      border: 1px solid #334155;
      border-radius: 4px;
      color: #38bdf8;
      font-family: monospace;
      font-size: 11px;
      padding: 8px;
      box-sizing: border-box;
      resize: none;
      word-break: break-all;
    }
    .btn-copy {
      background-color: #3b82f6;
      border: none;
      color: white;
      padding: 6px 12px;
      font-size: 11px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 8px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      transition: background-color 0.15s;
    }
    .btn-copy:hover {
      background-color: #2563eb;
    }
    .brand {
      font-size: 11px;
      color: #64748b; /* Slate 500 */
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      margin-top: 24px;
      border-top: 1px solid #334155;
      padding-top: 16px;
    }
    .loader {
      display: inline-block;
      width: 24px;
      height: 24px;
      border: 3px solid #334155;
      border-top-color: #60a5fa;
      border-radius: 50%;
      animation: spin 1s ease-in-out infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">WIPE OAuth</div>
    <div id="loader-container" style="margin: 16px 0;">
      <div id="loader" class="loader"></div>
    </div>
    <div id="status" class="status-text status-pending">Exchanging Token...</div>
    <div id="message" class="desc">Please wait while the application registers your Google Drive access session credentials.</div>
    
    <div id="token-section" class="token-container" style="display: none;">
      <span class="token-label">Access Token (Option 2 Manual Copy-Paste)</span>
      <textarea id="token-textarea" class="token-box" readonly onclick="this.select()"></textarea>
      <button id="btn-copy" class="btn-copy">Copy to Clipboard</button>
    </div>

    <div class="brand">WIPE</div>
  </div>

  <script>
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const state = params.get('state');
    
    if (accessToken) {
      if (state === 'manual') {
        document.getElementById('loader').style.display = 'none';
        const st = document.getElementById('status');
        st.innerText = 'MANUAL TOKEN GENERATED';
        st.className = 'status-text status-success';
        document.getElementById('message').innerText = 'Please copy the secure access token below and paste it into the WIPE Option: Copy-Paste input field.';
        
        document.getElementById('token-section').style.display = 'block';
        document.getElementById('token-textarea').value = accessToken;
      } else {
        fetch('/api/register-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: accessToken })
        })
        .then(res => res.json())
        .then(data => {
          document.getElementById('loader').style.display = 'none';
          const st = document.getElementById('status');
          st.innerText = 'AUTHENTICATION COMPLETED';
          st.className = 'status-text status-success';
          document.getElementById('message').innerHTML = 'Your credentials have been verified and applied.<br>This window will close automatically.';
          
          setTimeout(() => {
            window.close();
            // Fallback if window.close() is blocked by the browser
            document.getElementById('message').innerHTML = 'Your login session is fully registered.<br>You can now safely close this browser window/tab.';
          }, 1200);
        })
        .catch(err => {
          document.getElementById('loader').style.display = 'none';
          const st = document.getElementById('status');
          st.innerText = 'AUTOMATION REGISTRATION FAILED';
          st.className = 'status-text status-error';
          document.getElementById('message').innerText = 'Failed to transmit token to the local server. Please write down or copy the manual option below to paste in Google settings:';
          
          // Show manual fallback only since auto transmission failed
          document.getElementById('token-section').style.display = 'block';
          document.getElementById('token-textarea').value = accessToken;
        });
      }

      document.getElementById('btn-copy').addEventListener('click', () => {
        const textarea = document.getElementById('token-textarea');
        textarea.select();
        navigator.clipboard.writeText(accessToken).then(() => {
          const btn = document.getElementById('btn-copy');
          btn.innerText = 'Copied!';
          btn.style.backgroundColor = '#10b981';
          setTimeout(() => {
            btn.innerText = 'Copy to Clipboard';
            btn.style.backgroundColor = '#3b82f6';
          }, 2050);
        });
      });
    } else {
      document.getElementById('loader').style.display = 'none';
      const st = document.getElementById('status');
      st.innerText = 'NO ACCESS TOKEN DETECTED';
      st.className = 'status-text status-error';
      document.getElementById('message').innerText = 'Could not find a valid Google access token in the redirect URL fragment. Google may have denied your request or redirected incorrectly.';
    }
  </script>
</body>
</html>`);
  });

  // API - Sync settings from frontend
  app.get('/api/settings', (req, res) => {
    res.json(currentSettings);
  });

  app.post('/api/settings', (req, res) => {
    try {
      currentSettings = { ...currentSettings, ...req.body };
      atomicWriteFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2));
      res.json({ success: true, settings: currentSettings });
    } catch (e: any) {
      console.error('Failed to write settings:', e);
      res.status(500).json({
        success: false,
        error: 'Failed to write settings: ' + (e?.message || e),
        code: e?.code || 'WRITE_FAILED',
        filePath: SETTINGS_FILE
      });
    }
  });

  // API - Check if local computer directories exist safely on system
  app.post('/api/check-local-paths', (req, res) => {
    try {
      const { localPathMP3s, localPathLogs, localPathCalendar } = req.body;
      
      const mp3Exists = localPathMP3s ? fs.existsSync(localPathMP3s) : true;
      const logsExists = localPathLogs ? fs.existsSync(localPathLogs) : true;
      const schedExists = localPathCalendar ? fs.existsSync(localPathCalendar) : true;

      let interstitialsFolderExists = true;
      if (localPathMP3s && fs.existsSync(localPathMP3s)) {
        const intersDir = path.join(localPathMP3s, 'Interstitials');
        const lowerIntersDir = path.join(localPathMP3s, 'interstitials');
        interstitialsFolderExists = fs.existsSync(intersDir) || fs.existsSync(lowerIntersDir);
      }

      res.json({
        exists: mp3Exists && logsExists && schedExists,
        mp3Exists,
        logsExists,
        schedExists,
        interstitialsFolderExists
      });
    } catch (e) {
      res.json({ exists: false });
    }
  });

  // API - Create local directories on request
  app.post('/api/create-local-paths', (req, res) => {
    try {
      const { localPathMP3s, localPathLogs, localPathCalendar } = req.body;
      let createdCount = 0;
      let interstitialsReadonlyError = false;
      let interstitialsReadonlyMessage = '';

      [localPathMP3s, localPathLogs, localPathCalendar].forEach(dirPath => {
        if (dirPath && !fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
          createdCount++;
        }
      });

      if (localPathMP3s && fs.existsSync(localPathMP3s)) {
        let intersDir = path.join(localPathMP3s, 'Interstitials');
        if (!fs.existsSync(intersDir) && fs.existsSync(path.join(localPathMP3s, 'interstitials'))) {
          intersDir = path.join(localPathMP3s, 'interstitials');
        }
        if (!fs.existsSync(intersDir)) {
          try {
            fs.mkdirSync(intersDir, { recursive: true });
            createdCount++;
          } catch (err: any) {
            console.error('Failed to create Interstitials folder in localPathMP3s:', err);
            interstitialsReadonlyError = true;
            interstitialsReadonlyMessage = "The 'interstitials' folder does not exist in your Media folder and could not be created because the directory is read-only. Administrator assistance is required to set folder permissions or create the 'interstitials' folder manually.";
          }
        }
      }

      res.json({ success: true, createdCount, interstitialsReadonlyError, interstitialsReadonlyMessage });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to auto-create paths' });
    }
  });

  // API - Single Consolidated Startup Verification Route
  app.post('/api/startup/verify', (req, res) => {
    try {
      const settings = { ...currentSettings, ...(req.body || {}) };
      const effectiveMode = settings.mode || 'Local';

      if (effectiveMode === 'Drive' || effectiveMode === 'Demo') {
        return res.json({ ready: true, status: 'READY', mode: effectiveMode });
      }

      const mp3Path = settings.localPathMP3s || '';
      const calPath = settings.localPathCalendar || '';
      const logPath = settings.localPathLogs || '';

      if (!mp3Path || !calPath || !logPath) {
        return res.json({
          ready: false,
          status: 'NOT_DEFINED',
          message: 'One or more folder definitions are missing.',
          missingDefinitions: {
            mp3s: !mp3Path,
            calendar: !calPath,
            logs: !logPath
          }
        });
      }

      const mp3Exists = fs.existsSync(mp3Path);
      const calExists = fs.existsSync(calPath);
      const logExists = fs.existsSync(logPath);

      if (!mp3Exists || !calExists || !logExists) {
        return res.json({
          ready: false,
          status: 'INACCESSIBLE',
          message: 'Configured folders could not be accessed on the local filesystem.',
          missingFolders: {
            mp3s: !mp3Exists,
            calendar: !calExists,
            logs: !logExists
          }
        });
      }

      // Step 3: Check for first-run files and initialize strictly inside designated directories
      const interstitialsFile = path.join(calPath, 'interstitials.json');
      const showsFile = path.join(calPath, 'shows.json');
      const logsFile = path.join(logPath, 'logs.json');

      if (!fs.existsSync(interstitialsFile)) {
        atomicWriteFileSync(interstitialsFile, JSON.stringify({ InterstitialsBackupCounter: 0, data: [] }, null, 2));
      }

      if (!fs.existsSync(showsFile)) {
        atomicWriteFileSync(showsFile, JSON.stringify({ ShowsBackupCounter: 0, data: [] }, null, 2));
      }

      if (!fs.existsSync(logsFile)) {
        atomicWriteFileSync(logsFile, JSON.stringify({ LogsBackupCounter: 0, data: [] }, null, 2));
      }

      // Ensure backup directories exist inside target folders
      const calBackupDir = path.join(calPath, 'backups');
      if (!fs.existsSync(calBackupDir)) {
        try { fs.mkdirSync(calBackupDir, { recursive: true }); } catch (e) {}
      }
      const logBackupDir = path.join(logPath, 'backups');
      if (!fs.existsSync(logBackupDir)) {
        try { fs.mkdirSync(logBackupDir, { recursive: true }); } catch (e) {}
      }

      // Ensure standard subdirectories exist in media folder
      const intersDir = path.join(mp3Path, 'Interstitials');
      if (!fs.existsSync(intersDir) && !fs.existsSync(path.join(mp3Path, 'interstitials'))) {
        try { fs.mkdirSync(intersDir, { recursive: true }); } catch (e) {}
      }
      const evergreensDir = path.join(mp3Path, 'Evergreens');
      if (!fs.existsSync(evergreensDir) && !fs.existsSync(path.join(mp3Path, 'evergreens'))) {
        try { fs.mkdirSync(evergreensDir, { recursive: true }); } catch (e) {}
      }
      const playlistsDir = path.join(mp3Path, 'Playlists');
      if (!fs.existsSync(playlistsDir) && !fs.existsSync(path.join(mp3Path, 'playlists'))) {
        try { fs.mkdirSync(playlistsDir, { recursive: true }); } catch (e) {}
      }

      return res.json({
        ready: true,
        status: 'READY',
        message: 'All folder definitions and files verified successfully.'
      });
    } catch (e: any) {
      console.error('Verify startup check failed:', e);
      return res.status(500).json({ ready: false, error: e?.message || 'Verification error' });
    }
  });

  // API - Standard Native selection dialogue via Electron Process
  app.post('/api/browse-folder', (req, res) => {
    try {
      if (electronDialog) {
        const dialogOptions: any = {
          title: 'Select Folder Destination',
          properties: ['openDirectory', 'createDirectory']
        };
        const defaultPath = req.body?.defaultPath;
        if (defaultPath && fs.existsSync(defaultPath)) {
          dialogOptions.defaultPath = defaultPath;
        } else if (IS_PORTABLE && BASE_DIR && fs.existsSync(BASE_DIR)) {
          dialogOptions.defaultPath = BASE_DIR;
        }
        const result = electronDialog.showOpenDialogSync(dialogOptions);
        if (result && result.length > 0) {
          res.json({ success: true, path: result[0] });
        } else {
          res.json({ success: true, cancelled: true });
        }
      } else {
        res.json({ success: false, error: 'Standard Browse dialog is only available when running inside Desktop App frame.' });
      }
    } catch (e: any) {
      res.json({ success: false, error: e.message || 'Native selection query errored' });
    }
  });

  // API - Get the default system Downloads path
  app.get('/api/downloads-path', (req, res) => {
    try {
      const downloadsPath = path.join(os.homedir(), 'Downloads');
      res.json({ success: true, path: downloadsPath });
    } catch (e: any) {
      res.json({ success: false, path: '' });
    }
  });

  // API - Custom web directory list (Browse Fancy)
  app.get('/api/list-directories', (req, res) => {
    try {
      let targetPath = req.query.path as string;
      if (!targetPath) {
        if (IS_PORTABLE && BASE_DIR) {
          targetPath = BASE_DIR;
        } else {
          try {
            const os = require('os');
            targetPath = os.homedir() || process.cwd();
          } catch {
            targetPath = process.cwd();
          }
        }
      }

      // Resolve absolute path
      const resolvedPath = path.resolve(targetPath);
      
      if (!fs.existsSync(resolvedPath)) {
        return res.json({ success: false, error: 'Path does not exist' });
      }

      const files = fs.readdirSync(resolvedPath, { withFileTypes: true });
      const folders: string[] = [];

      files.forEach((file) => {
        if (file.isDirectory()) {
          folders.push(file.name);
        }
      });

      folders.sort();

      const parentPath = path.dirname(resolvedPath);

      res.json({
        success: true,
        currentPath: resolvedPath,
        parentPath: parentPath !== resolvedPath ? parentPath : null,
        folders
      });
    } catch (e: any) {
      res.json({ success: false, error: e.message || 'Failed to list directory' });
    }
  });

  // API - List local MP3 files
  app.get('/api/local-mp3s', (req, res) => {
    try {
      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.json([]);
      }
      let targetDir = path.join(folderPath, 'Interstitials');
      if (!fs.existsSync(targetDir) && fs.existsSync(path.join(folderPath, 'interstitials'))) {
        targetDir = path.join(folderPath, 'interstitials');
      }
      if (!fs.existsSync(targetDir)) {
        return res.json([]);
      }
      const files = fs.readdirSync(targetDir);
      const allowedExtensions = ['.mp3', '.txt', '.pdf', '.png', '.jpg', '.jpeg'];
      const mp3List = files
        .filter(f => {
          const ext = path.extname(f).toLowerCase();
          return allowedExtensions.includes(ext);
        })
        .map(f => {
          const fullPath = path.join(targetDir, f);
          const stats = fs.statSync(fullPath);
          const ext = path.extname(f).toLowerCase();
          const isScript = ['.txt', '.pdf', '.png', '.jpg', '.jpeg'].includes(ext);
          return {
            name: f,
            size: `${(stats.size / (1024 * 1024)).toFixed(1)} MB`,
            duration: isScript ? '—' : '0:15', // Default starting duration for audio, placeholder for scripts
            path: `/api/media/stream?path=${encodeURIComponent(f)}`
          };
        });
      res.json(mp3List);
    } catch (e: any) {
      console.error('Failed to read local Interstitials directory:', e);
      res.status(500).json([]);
    }
  });

  // API - Stream local media audio files (Primary unified streaming endpoint with 206 Partial Content support)
  app.get('/api/media/stream', (req, res) => {
    try {
      const file = (req.query.path || req.query.file) as string;
      if (!file) return res.status(400).send('File parameter required');

      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(404).send('Local source folder not defined or offline');
      }

      let targetFilePath: string | null = null;

      // 1. Direct absolute path check
      if (path.isAbsolute(file) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        targetFilePath = file;
      }

      // 2. Relative to base MP3 directory (e.g. Playlists/MyShow/01.mp3, Evergreens/MyShow/track.mp3)
      if (!targetFilePath) {
        const directRelPath = path.join(folderPath, file);
        if (fs.existsSync(directRelPath) && fs.statSync(directRelPath).isFile()) {
          targetFilePath = directRelPath;
        }
      }

      // 3. Interstitials subfolder fallback for cart tracks
      if (!targetFilePath) {
        const intersPath = path.join(folderPath, 'Interstitials', path.basename(file));
        const lowerIntersPath = path.join(folderPath, 'interstitials', path.basename(file));
        if (fs.existsSync(intersPath) && fs.statSync(intersPath).isFile()) {
          targetFilePath = intersPath;
        } else if (fs.existsSync(lowerIntersPath) && fs.statSync(lowerIntersPath).isFile()) {
          targetFilePath = lowerIntersPath;
        }
      }

      // 4. Recursive lookup helper fallback
      if (!targetFilePath) {
        const resolved = findInterstitialSourceFile(folderPath, file);
        if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          targetFilePath = resolved;
        }
      }

      if (targetFilePath && fs.existsSync(targetFilePath) && fs.statSync(targetFilePath).isFile()) {
        res.sendFile(targetFilePath);
      } else {
        res.status(404).send('File not found');
      }
    } catch (e: any) {
      res.status(500).send(e.message || 'Streaming failed');
    }
  });

  // API - Get live-read script/image content
  app.get('/api/live-read/content', (req, res) => {
    try {
      const file = req.query.file as string;
      if (!file) return res.status(400).json({ error: 'Filename required' });

      const folderPath = currentSettings.localPathMP3s;

      let targetFilePath = file;
      if (!fs.existsSync(targetFilePath)) {
        if (!folderPath || !fs.existsSync(folderPath)) {
          return res.status(404).json({ error: 'Media & Scripts folder not defined or offline' });
        }
        targetFilePath = path.join(folderPath, 'Interstitials', path.basename(file));
        if (!fs.existsSync(targetFilePath)) {
          const lowerIntersSub = path.join(folderPath, 'interstitials', path.basename(file));
          if (fs.existsSync(lowerIntersSub)) {
            targetFilePath = lowerIntersSub;
          } else {
            const resolved = findInterstitialSourceFile(folderPath, file);
            if (resolved && fs.existsSync(resolved)) {
              targetFilePath = resolved;
            }
          }
        }
      }

      if (!fs.existsSync(targetFilePath)) {
        return res.status(404).json({ error: 'File not found in Interstitials directory' });
      }

      const ext = path.extname(file).toLowerCase();
      const isText = ext === '.txt';

      const responseData: any = {
        name: file,
        path: targetFilePath,
        extension: ext,
        url: `/api/media/stream?path=${encodeURIComponent(file)}`
      };

      if (isText) {
        // Read raw file content (supporting UTF-8 text for .txt)
        const textContent = fs.readFileSync(targetFilePath, 'utf8');
        responseData.content = textContent;
      }

      res.json(responseData);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to read file' });
    }
  });

  // API - Trigger Electron spawn live read window
  app.post('/api/live-read/spawn', (req, res) => {
    try {
      const data = req.body;
      if (typeof global !== 'undefined' && (global as any).spawnLiveRead) {
        (global as any).spawnLiveRead(data);
        return res.json({ success: true, mode: 'electron' });
      } else {
        console.log('Spawn live read window requested (browser fallback):', data);
        return res.json({ success: true, mode: 'browser' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to spawn window' });
    }
  });

  // API - Interstitial
  app.get('/api/interstitials', (req, res) => {
    try {
      const filePath = getCalendarFilePath();
      if (!filePath || !fs.existsSync(filePath)) {
        return res.json([]);
      }
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data || '[]');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return res.json(Array.isArray(parsed.data) ? parsed.data : []);
      }
      res.json(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.error('Failed to read schedules:', e);
      res.status(300).json([]);
    }
  });

  app.post('/api/interstitials', (req, res) => {
    try {
      const filePath = getCalendarFilePath();
      if (!filePath) {
        return res.status(400).json({ success: false, error: 'Calendar directory is not configured' });
      }
      const schedules: Interstitial[] = req.body;
      let counter = 0;
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        try {
          const parsed = JSON.parse(data || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            counter = parsed.InterstitialsBackupCounter || 0;
          }
        } catch (pe) {}
      }
      counter += 1; // Increment on every backup / save operation
      const updatedObj = { InterstitialsBackupCounter: counter, data: schedules };
      atomicWriteFileSync(filePath, JSON.stringify(updatedObj, null, 2));

      // Backup copy for schedules
      try {
        const backupPath = getCalendarBackupPath();
        if (backupPath) {
          atomicWriteFileSync(backupPath, JSON.stringify(updatedObj, null, 2));
        }
      } catch (e) {
        console.error('Schedules backup copy failed:', e);
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error('Failed to save schedules:', e);
      res.status(500).json({
        success: false,
        error: 'Failed to write schedules data: ' + (e?.message || e),
        code: e?.code || 'WRITE_FAILED',
        filePath: getCalendarFilePath()
      });
    }
  });

  // API - Shows
  app.get('/api/shows', (req, res) => {
    try {
      const filePath = getShowsFilePath();
      if (!filePath || !fs.existsSync(filePath)) {
        return res.json([]);
      }
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data || '[]');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return res.json(Array.isArray(parsed.data) ? parsed.data : []);
      }
      res.json(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.error('Failed to read shows:', e);
      res.status(500).json([]);
    }
  });

  app.post('/api/shows', (req, res) => {
    try {
      const filePath = getShowsFilePath();
      if (!filePath) {
        return res.status(400).json({ success: false, error: 'Calendar directory is not configured for shows' });
      }
      const shows: Show[] = req.body;
      let counter = 0;
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        try {
          const parsed = JSON.parse(data || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            counter = parsed.ShowsBackupCounter || 0;
          }
        } catch (pe) {}
      }
      counter += 1;
      const updatedObj = { ShowsBackupCounter: counter, data: shows };
      atomicWriteFileSync(filePath, JSON.stringify(updatedObj, null, 2));

      // Backup copy for shows
      try {
        const backupPath = getShowsBackupPath();
        if (backupPath) {
          atomicWriteFileSync(backupPath, JSON.stringify(updatedObj, null, 2));
        }
      } catch (e) {
        console.error('Shows backup copy failed:', e);
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error('Failed to save shows:', e);
      res.status(500).json({
        success: false,
        error: 'Failed to write shows data: ' + (e?.message || e),
        code: e?.code || 'WRITE_FAILED',
        filePath: getShowsFilePath()
      });
    }
  });

  // API - Verify Evergreen, Playlist, and Interstitial folders
  app.post('/api/shows/verify-evergreens', (req, res) => {
    try {
      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(400).json({ error: 'Local Media Directory is not defined or is offline. Please configure Local Media Directory in Settings.' });
      }
      let evergreensPath = path.join(folderPath, 'Evergreens');
      if (!fs.existsSync(evergreensPath) && fs.existsSync(path.join(folderPath, 'evergreens'))) {
        evergreensPath = path.join(folderPath, 'evergreens');
      }
      let evergreensFolderCreated = false;
      if (!fs.existsSync(evergreensPath)) {
        fs.mkdirSync(evergreensPath, { recursive: true });
        evergreensFolderCreated = true;
      }

      let playlistsPath = path.join(folderPath, 'Playlists');
      if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, 'playlists'))) {
        playlistsPath = path.join(folderPath, 'playlists');
      }
      let playlistsFolderCreated = false;
      if (!fs.existsSync(playlistsPath)) {
        fs.mkdirSync(playlistsPath, { recursive: true });
        playlistsFolderCreated = true;
      }

      let interstitialsPath = path.join(folderPath, 'Interstitials');
      if (!fs.existsSync(interstitialsPath) && fs.existsSync(path.join(folderPath, 'interstitials'))) {
        interstitialsPath = path.join(folderPath, 'interstitials');
      }
      let interstitialsFolderCreated = false;
      let interstitialsReadonlyError = false;
      let interstitialsReadonlyMessage = '';

      if (!fs.existsSync(interstitialsPath)) {
        try {
          fs.mkdirSync(interstitialsPath, { recursive: true });
          interstitialsFolderCreated = true;
        } catch (mkErr: any) {
          console.error('Failed to create Interstitials folder in media directory:', mkErr);
          interstitialsReadonlyError = true;
          interstitialsReadonlyMessage = "The 'interstitials' folder does not exist in your Media folder and could not be created because the directory is read-only. Administrator assistance is required to set folder permissions or create the 'interstitials' folder manually.";
        }
      }

      const showsFilePath = getShowsFilePath();
      let shows: any[] = [];
      if (fs.existsSync(showsFilePath)) {
        const data = fs.readFileSync(showsFilePath, 'utf-8');
        try {
          const parsed = JSON.parse(data || '[]');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            shows = Array.isArray(parsed.data) ? parsed.data : [];
          } else {
            shows = Array.isArray(parsed) ? parsed : [];
          }
        } catch (pe) {
          shows = [];
        }
      }

      const createdFolders: string[] = [];
      for (const show of shows) {
        if (show.nameShort) {
          const showFolderPath = path.join(evergreensPath, show.nameShort);
          if (!fs.existsSync(showFolderPath)) {
            fs.mkdirSync(showFolderPath, { recursive: true });
            if (!createdFolders.includes(show.nameShort)) {
              createdFolders.push(show.nameShort);
            }
          }

          const showPlaylistFolderPath = path.join(playlistsPath, show.nameShort);
          if (!fs.existsSync(showPlaylistFolderPath)) {
            fs.mkdirSync(showPlaylistFolderPath, { recursive: true });
            if (!createdFolders.includes(show.nameShort)) {
              createdFolders.push(show.nameShort);
            }
          }
        }
      }

      res.json({
        success: true,
        evergreensFolderCreated,
        playlistsFolderCreated,
        interstitialsFolderCreated,
        interstitialsReadonlyError,
        interstitialsReadonlyMessage,
        evergreensPath,
        playlistsPath,
        interstitialsPath,
        createdFolders
      });
    } catch (err: any) {
      console.error('Error in /api/shows/verify-evergreens:', err);
      res.status(500).json({ error: 'Verification failed: ' + err.message });
    }
  });

  // API - Check if Evergreen or Playlist folder exists
  app.post('/api/shows/evergreen/check-folder', (req, res) => {
    try {
      const { oldNameShort, newNameShort } = req.body;
      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(400).json({ error: 'Local Media Directory is not defined or is offline.' });
      }
      let evergreensPath = path.join(folderPath, 'Evergreens');
      if (!fs.existsSync(evergreensPath) && fs.existsSync(path.join(folderPath, 'evergreens'))) {
        evergreensPath = path.join(folderPath, 'evergreens');
      }
      let playlistsPath = path.join(folderPath, 'Playlists');
      if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, 'playlists'))) {
        playlistsPath = path.join(folderPath, 'playlists');
      }

      const oldEvergreenExists = (oldNameShort && fs.existsSync(evergreensPath)) ? fs.existsSync(path.join(evergreensPath, oldNameShort)) : false;
      const oldPlaylistExists = (oldNameShort && fs.existsSync(playlistsPath)) ? fs.existsSync(path.join(playlistsPath, oldNameShort)) : false;
      const oldExists = oldEvergreenExists || oldPlaylistExists;

      const newEvergreenExists = (newNameShort && fs.existsSync(evergreensPath)) ? fs.existsSync(path.join(evergreensPath, newNameShort)) : false;
      const newPlaylistExists = (newNameShort && fs.existsSync(playlistsPath)) ? fs.existsSync(path.join(playlistsPath, newNameShort)) : false;
      const newExists = newEvergreenExists || newPlaylistExists;

      res.json({ success: true, oldExists, newExists, oldEvergreenExists, oldPlaylistExists, newEvergreenExists, newPlaylistExists });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Timeout wrapper to prevent unhydrated/syncing cloud files (e.g. Google Drive Desktop) from freezing Node's thread
  async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        console.warn(`[I/O Timeout] Operation timed out after ${timeoutMs}ms (likely locked or syncing cloud file/folder).`);
        resolve(fallbackValue);
      }, timeoutMs);
    });
    try {
      const result = await Promise.race([promise, timeoutPromise]);
      return result;
    } finally {
      clearTimeout(timer!);
    }
  }

  // Helper for pure JS estimation of MP3 file duration in seconds (non-blocking with timeout)
  async function getMp3DurationSecondsAsync(filePath: string): Promise<number> {
    return withTimeout(
      (async () => {
        let handle: fs.promises.FileHandle | null = null;
        try {
          const stats = await fs.promises.stat(filePath);
          handle = await fs.promises.open(filePath, 'r');
          const buffer = Buffer.alloc(4096);
          const { bytesRead } = await handle.read(buffer, 0, 4096, 0);

          let offset = 0;
          if (bytesRead >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
            const id3Size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
            offset = 10 + id3Size;
          }

          const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
          const audioBuf = Buffer.alloc(2048);
          const readAudioRes = await handle.read(audioBuf, 0, 2048, Math.min(offset, Math.max(0, stats.size - 2048)));
          const readAudio = readAudioRes.bytesRead;
          await handle.close();
          handle = null;

          for (let i = 0; i < readAudio - 4; i++) {
            if (audioBuf[i] === 0xff && (audioBuf[i + 1] & 0xe0) === 0xe0) {
              const header = audioBuf.readUInt32BE(i);
              const bitrateIdx = (header >> 12) & 0x0f;
              const kbps = bitrates[bitrateIdx] || 128;
              if (kbps > 0) {
                const audioSizeBytes = Math.max(0, stats.size - offset);
                const durationSec = Math.round((audioSizeBytes * 8) / (kbps * 1000));
                if (durationSec > 0 && durationSec < 7200) {
                  return durationSec;
                }
              }
              break;
            }
          }
        } catch (e) {
          if (handle) {
            try { await handle.close(); } catch (_) {}
          }
        }
        return 180;
      })(),
      1500,
      180
    );
  }

  function getMp3DurationSeconds(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(4096);
      const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
      fs.closeSync(fd);

      let offset = 0;
      if (bytesRead >= 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
        const id3Size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
        offset = 10 + id3Size;
      }

      const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
      const audioBuf = Buffer.alloc(2048);
      const fd2 = fs.openSync(filePath, 'r');
      const readAudio = fs.readSync(fd2, audioBuf, 0, 2048, Math.min(offset, Math.max(0, stats.size - 2048)));
      fs.closeSync(fd2);

      for (let i = 0; i < readAudio - 4; i++) {
        if (audioBuf[i] === 0xff && (audioBuf[i + 1] & 0xe0) === 0xe0) {
          const header = audioBuf.readUInt32BE(i);
          const bitrateIdx = (header >> 12) & 0x0f;
          const kbps = bitrates[bitrateIdx] || 128;
          if (kbps > 0) {
            const audioSizeBytes = Math.max(0, stats.size - offset);
            const durationSec = Math.round((audioSizeBytes * 8) / (kbps * 1000));
            if (durationSec > 0 && durationSec < 7200) {
              return durationSec;
            }
          }
          break;
        }
      }
    } catch (e) {
      // Ignore and fallback
    }
    return 180;
  }

  function parseID3Buffer(bytes: Uint8Array): { title?: string; artist?: string; albumArtist?: string; album?: string } | null {
    if (!bytes || bytes.length < 10) return null;
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const majorVersion = bytes[3];
      if (majorVersion === 2 || majorVersion === 3 || majorVersion === 4) {
        const tagSize = ((bytes[6] & 0x7f) << 21) |
                        ((bytes[7] & 0x7f) << 14) |
                        ((bytes[8] & 0x7f) << 7) |
                        (bytes[9] & 0x7f);
        const limit = Math.min(bytes.length, tagSize + 10);
        let offset = 10;
        const parsed: { title?: string; artist?: string; albumArtist?: string; album?: string } = {};

        const textDecode = (data: Uint8Array): string => {
          try {
            const encoding = data[0];
            const content = data.subarray(1);
            let str = '';
            if (encoding === 0 || encoding === 3) {
              str = Buffer.from(content).toString(encoding === 3 ? 'utf-8' : 'latin1');
            } else if (encoding === 1 || encoding === 2) {
              str = Buffer.from(content).toString('utf16le');
            }
            return str.replace(/^[\s\uFEFF\0]+|[\s\uFEFF\0]+$/g, '').replace(/\0.*$/g, '').trim();
          } catch (e) {
            return '';
          }
        };

        if (majorVersion === 2) {
          while (offset + 6 < limit) {
            const frameId = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2]);
            const frameSize = (bytes[offset+3] << 16) | (bytes[offset+4] << 8) | bytes[offset+5];
            offset += 6;
            if (frameSize <= 0 || offset + frameSize > limit) break;
            const frameData = bytes.subarray(offset, offset + frameSize);
            if (frameId === "TT2" || frameId === "TP1" || frameId === "TP2" || frameId === "TAL") {
              const text = textDecode(frameData);
              if (text) {
                if (frameId === "TT2") parsed.title = text;
                if (frameId === "TP1") parsed.artist = text;
                if (frameId === "TP2") parsed.albumArtist = text;
                if (frameId === "TAL") parsed.album = text;
              }
            }
            offset += frameSize;
          }
        } else {
          while (offset + 10 < limit) {
            const frameId = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
            let frameSize = 0;
            if (majorVersion === 4) {
              frameSize = ((bytes[offset+4] & 0x7f) << 21) |
                          ((bytes[offset+5] & 0x7f) << 14) |
                          ((bytes[offset+6] & 0x7f) << 7) |
                          (bytes[offset+7] & 0x7f);
            } else {
              frameSize = (bytes[offset+4] << 24) |
                          (bytes[offset+5] << 16) |
                          (bytes[offset+6] << 8) |
                          bytes[offset+7];
            }
            offset += 10;
            if (frameSize <= 0 || offset + frameSize > limit) break;
            const frameData = bytes.subarray(offset, offset + frameSize);
            if (frameId === "TIT2" || frameId === "TPE1" || frameId === "TPE2" || frameId === "TALB") {
              const text = textDecode(frameData);
              if (text) {
                if (frameId === "TIT2") parsed.title = text;
                if (frameId === "TPE1") parsed.artist = text;
                if (frameId === "TPE2") parsed.albumArtist = text;
                if (frameId === "TALB") parsed.album = text;
              }
            }
            offset += frameSize;
          }
        }
        if (parsed.title || parsed.artist || parsed.albumArtist || parsed.album) {
          return parsed;
        }
      }
    }
    return null;
  }

  function parseID3v1Buffer(bytes: Uint8Array): { title?: string; artist?: string; albumArtist?: string; album?: string } | null {
    if (!bytes || bytes.length < 128) return null;
    const tagOffset = bytes.length - 128;
    if (bytes[tagOffset] === 0x54 && bytes[tagOffset + 1] === 0x41 && bytes[tagOffset + 2] === 0x47) { // "TAG"
      const cleanStr = (buf: Uint8Array) => {
        const decoded = Buffer.from(buf).toString('latin1');
        const nullIdx = decoded.indexOf('\0');
        const clean = nullIdx !== -1 ? decoded.substring(0, nullIdx) : decoded;
        return clean.trim();
      };
      const title = cleanStr(bytes.subarray(tagOffset + 3, tagOffset + 33));
      const artist = cleanStr(bytes.subarray(tagOffset + 33, tagOffset + 63));
      const album = cleanStr(bytes.subarray(tagOffset + 63, tagOffset + 93));
      if (title || artist || album) {
        return {
          title: title || undefined,
          artist: artist || undefined,
          albumArtist: artist || undefined,
          album: album || undefined
        };
      }
    }
    return null;
  }

  // Helper for pure JS reading of MP3 ID3 metadata on server side (non-blocking with timeout)
  async function getMp3ServerMetadata(filePath: string): Promise<{ title?: string; artist?: string; albumArtist?: string; album?: string } | null> {
    return withTimeout(
      (async () => {
        let handle: fs.promises.FileHandle | null = null;
        try {
          if (!fs.existsSync(filePath)) return null;
          const stats = await fs.promises.stat(filePath);
          handle = await fs.promises.open(filePath, 'r');
          
          // Read first 64KB for ID3v2
          const buffer = Buffer.alloc(65536);
          const { bytesRead } = await handle.read(buffer, 0, 65536, 0);
          let v2Meta: { title?: string; artist?: string; albumArtist?: string; album?: string } | null = null;
          if (bytesRead > 0) {
            v2Meta = parseID3Buffer(new Uint8Array(buffer.subarray(0, bytesRead)));
          }

          // Check ID3v1 trailing tag if file is at least 128 bytes
          let v1Meta: { title?: string; artist?: string; albumArtist?: string; album?: string } | null = null;
          if (stats.size >= 128) {
            const tailBuf = Buffer.alloc(128);
            await handle.read(tailBuf, 0, 128, stats.size - 128);
            v1Meta = parseID3v1Buffer(new Uint8Array(tailBuf));
          }

          await handle.close();
          handle = null;

          if (v2Meta || v1Meta) {
            return {
              title: v2Meta?.title || v1Meta?.title,
              artist: v2Meta?.artist || v1Meta?.artist,
              albumArtist: v2Meta?.albumArtist || v1Meta?.albumArtist || v1Meta?.artist,
              album: v2Meta?.album || v1Meta?.album
            };
          }

          return null;
        } catch (e) {
          if (handle) {
            try { await handle.close(); } catch (_) {}
          }
          return null;
        }
      })(),
      1500,
      null
    );
  }

  // Helper for flexible playlist show folder lookup
  function findShowPlaylistFolder(playlistsPath: string, showNameShort?: string, showName?: string): string | null {
    if (!playlistsPath || !fs.existsSync(playlistsPath)) return null;

    const candidates = [showNameShort, showName].filter(Boolean) as string[];
    if (candidates.length === 0) return null;

    // 1. Direct path checks
    for (const name of candidates) {
      const exactPath = path.join(playlistsPath, name);
      if (fs.existsSync(exactPath) && fs.statSync(exactPath).isDirectory()) {
        return exactPath;
      }
    }

    // 2. Case-insensitive and normalized matching
    try {
      const dirItems = fs.readdirSync(playlistsPath);
      for (const candidate of candidates) {
        const normCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const item of dirItems) {
          const itemPath = path.join(playlistsPath, item);
          if (fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()) {
            const normItem = item.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normItem === normCandidate || item.toLowerCase() === candidate.toLowerCase()) {
              return itemPath;
            }
          }
        }
      }
    } catch (e) {}

    return null;
  }

  // Helper for recursive audio and playlist file scanning (non-blocking async)
  async function getAllAudioAndPlaylistFilesAsync(dir: string): Promise<{ m3uFiles: string[]; audioFiles: Array<{ relPath: string; fullPath: string; name: string }> }> {
    return withTimeout(
      (async () => {
        const m3uFiles: string[] = [];
        const audioFiles: Array<{ relPath: string; fullPath: string; name: string }> = [];

        async function scan(currentDir: string, relPrefix: string = '', depth: number = 0) {
          if (depth > 4) return;
          if (!fs.existsSync(currentDir)) return;
          try {
            const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
              const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
              const fullPath = path.join(currentDir, entry.name);
              if (entry.isDirectory()) {
                await scan(fullPath, relPath, depth + 1);
              } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (ext === '.m3u' || ext === '.m3u8') {
                  m3uFiles.push(fullPath);
                } else if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(ext)) {
                  audioFiles.push({ relPath, fullPath, name: entry.name });
                }
              }
            }
          } catch (e) {}
        }

        await scan(dir);
        return { m3uFiles, audioFiles };
      })(),
      3000,
      { m3uFiles: [], audioFiles: [] }
    );
  }

  function getAllAudioAndPlaylistFiles(dir: string): { m3uFiles: string[]; audioFiles: Array<{ relPath: string; fullPath: string; name: string }> } {
    const m3uFiles: string[] = [];
    const audioFiles: Array<{ relPath: string; fullPath: string; name: string }> = [];

    function scan(currentDir: string, relPrefix: string = '') {
      if (!fs.existsSync(currentDir)) return;
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath, relPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === '.m3u' || ext === '.m3u8') {
              m3uFiles.push(fullPath);
            } else if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(ext)) {
              audioFiles.push({ relPath, fullPath, name: entry.name });
            }
          }
        }
      } catch (e) {}
    }

    scan(dir);
    return { m3uFiles, audioFiles };
  }

  // Helper for parsing M3U files with robust relative path resolution (non-blocking async)
  async function parseM3uFileAsync(m3uPath: string, folderPath: string) {
    return withTimeout(
      (async () => {
        const content = await fs.promises.readFile(m3uPath, 'utf8');
        const lines = content.split(/\r?\n/);
        const result: Array<{ fileName: string; title: string; durationSeconds: number }> = [];

        let pendingExtInfDuration: number | null = null;
        let pendingExtInfTitle: string | null = null;

        const m3uDir = path.dirname(m3uPath);

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('#EXTINF:')) {
            const rest = trimmed.substring(8);
            const commaIdx = rest.indexOf(',');
            if (commaIdx !== -1) {
              const durStr = rest.substring(0, commaIdx).trim();
              const dur = parseInt(durStr, 10);
              if (!isNaN(dur) && dur > 0) {
                pendingExtInfDuration = dur;
              }
              pendingExtInfTitle = rest.substring(commaIdx + 1).trim();
            }
          } else if (!trimmed.startsWith('#')) {
            const rawFileName = trimmed.replace(/\\/g, '/');
            const fileName = path.basename(rawFileName);

            let fullPath = path.isAbsolute(rawFileName) ? rawFileName : path.join(m3uDir, rawFileName);
            if (!fs.existsSync(fullPath)) {
              fullPath = path.join(folderPath, fileName);
            }

            let durationSeconds = pendingExtInfDuration;
            if (!durationSeconds || durationSeconds <= 0) {
              if (fs.existsSync(fullPath)) {
                durationSeconds = await getMp3DurationSecondsAsync(fullPath);
              } else {
                durationSeconds = 180;
              }
            }

            const title = pendingExtInfTitle || fileName.replace(/\.[^/.]+$/, '');
            result.push({
              fileName,
              title,
              durationSeconds
            });

            pendingExtInfDuration = null;
            pendingExtInfTitle = null;
          }
        }
        return result;
      })(),
      2500,
      []
    );
  }

  // Helper for parsing M3U files with robust relative path resolution
  function parseM3uFile(m3uPath: string, folderPath: string) {
    const content = fs.readFileSync(m3uPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const result: Array<{ fileName: string; title: string; durationSeconds: number }> = [];

    let pendingExtInfDuration: number | null = null;
    let pendingExtInfTitle: string | null = null;

    const m3uDir = path.dirname(m3uPath);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('#EXTINF:')) {
        const rest = trimmed.substring(8);
        const commaIdx = rest.indexOf(',');
        if (commaIdx !== -1) {
          const durStr = rest.substring(0, commaIdx).trim();
          const dur = parseInt(durStr, 10);
          if (!isNaN(dur) && dur > 0) {
            pendingExtInfDuration = dur;
          }
          pendingExtInfTitle = rest.substring(commaIdx + 1).trim();
        }
      } else if (!trimmed.startsWith('#')) {
        const rawFileName = trimmed.replace(/\\/g, '/');
        const fileName = path.basename(rawFileName);

        let fullPath = path.isAbsolute(rawFileName) ? rawFileName : path.join(m3uDir, rawFileName);
        if (!fs.existsSync(fullPath)) {
          fullPath = path.join(folderPath, fileName);
        }

        let durationSeconds = pendingExtInfDuration;
        if (!durationSeconds || durationSeconds <= 0) {
          if (fs.existsSync(fullPath)) {
            durationSeconds = getMp3DurationSeconds(fullPath);
          } else {
            durationSeconds = 180;
          }
        }

        const title = pendingExtInfTitle || fileName.replace(/\.[^/.]+$/, '');
        result.push({
          fileName,
          title,
          durationSeconds
        });

        pendingExtInfDuration = null;
        pendingExtInfTitle = null;
      }
    }

    return result;
  }

  // Types for Targeted Contextual Show Caching
  interface PreparedShowTrack {
    id: string;
    fileName: string;
    title: string;
    artist?: string;
    albumArtist?: string;
    album?: string;
    durationSeconds: number;
    durationFormatted: string;
    streamUrl: string;
    fullPath: string;
    fileSizeBytes?: number;
  }

  interface PreparedShowContext {
    showId: string;
    showName: string;
    showNameShort: string;
    context: 'Prerecord' | 'Export' | 'Playlist';
    folderType: 'Playlists' | 'Evergreens';
    preparedAt: string;
    playlistFile: string | null;
    totalTracks: number;
    totalDurationSeconds: number;
    tracks: PreparedShowTrack[];
  }

  let activeShowContext: PreparedShowContext | null = null;

  // Helper to build/prepare show track context
  async function buildShowContext(params: {
    showId: string;
    showName?: string;
    showNameShort?: string;
    context?: 'Prerecord' | 'Export' | 'Playlist';
    folderType?: 'Playlists' | 'Evergreens';
  }): Promise<PreparedShowContext> {
    const showId = params.showId || 'unknown';
    const showName = params.showName || showId;
    const showNameShort = params.showNameShort || showName;
    const context = params.context || 'Playlist';
    const folderType = params.folderType || 'Playlists';

    const folderPath = currentSettings.localPathMP3s;
    if (!folderPath || !fs.existsSync(folderPath)) {
      return {
        showId,
        showName,
        showNameShort,
        context,
        folderType,
        preparedAt: new Date().toISOString(),
        playlistFile: null,
        totalTracks: 0,
        totalDurationSeconds: 0,
        tracks: []
      };
    }

    const baseSubfolder = folderType === 'Evergreens' ? 'Evergreens' : 'Playlists';
    let playlistsPath = path.join(folderPath, baseSubfolder);
    if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, baseSubfolder.toLowerCase()))) {
      playlistsPath = path.join(folderPath, baseSubfolder.toLowerCase());
    }

    const showFolderPath = findShowPlaylistFolder(playlistsPath, showNameShort, showName);
    if (!showFolderPath) {
      return {
        showId,
        showName,
        showNameShort,
        context,
        folderType,
        preparedAt: new Date().toISOString(),
        playlistFile: null,
        totalTracks: 0,
        totalDurationSeconds: 0,
        tracks: []
      };
    }

    let { m3uFiles, audioFiles } = await getAllAudioAndPlaylistFilesAsync(showFolderPath);
    let rawTracks: Array<{ fileName: string; title: string; durationSeconds: number; fullPath?: string }> = [];
    let playlistFileName: string | null = null;

    let retryCount = 0;
    while (m3uFiles.length === 0 && audioFiles.length === 0 && retryCount < 3) {
      retryCount++;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const rescan = await getAllAudioAndPlaylistFilesAsync(showFolderPath);
      m3uFiles = rescan.m3uFiles;
      audioFiles = rescan.audioFiles;
    }

    if (m3uFiles.length > 0) {
      playlistFileName = path.basename(m3uFiles[0]);
      rawTracks = await parseM3uFileAsync(m3uFiles[0], showFolderPath);
    } else {
      audioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      rawTracks = await Promise.all(audioFiles.map(async f => {
        const durationSeconds = await getMp3DurationSecondsAsync(f.fullPath);
        return {
          fileName: f.name,
          title: f.name.replace(/\.[^/.]+$/, ''),
          durationSeconds,
          fullPath: f.fullPath
        };
      }));
    }

    const searchKey = showNameShort || showName;
    let totalDurationSeconds = 0;

    const tracks: PreparedShowTrack[] = await Promise.all(rawTracks.map(async (t, idx) => {
      const m = Math.floor(t.durationSeconds / 60);
      const s = Math.floor(t.durationSeconds % 60);
      totalDurationSeconds += (t.durationSeconds || 0);

      const filePath = t.fullPath || path.join(showFolderPath, t.fileName);
      let meta: { title?: string; artist?: string; albumArtist?: string; album?: string } | null = null;
      let fileSizeBytes = 0;

      if (fs.existsSync(filePath)) {
        try {
          const st = fs.statSync(filePath);
          fileSizeBytes = st.size;
          meta = await getMp3ServerMetadata(filePath);
        } catch (_) {}
      }

      return {
        id: `playlist-track-${idx + 1}`,
        fileName: t.fileName,
        title: meta?.title || t.title,
        artist: meta?.artist,
        albumArtist: meta?.albumArtist || meta?.artist,
        album: meta?.album,
        durationSeconds: t.durationSeconds,
        durationFormatted: `${m}:${s.toString().padStart(2, '0')}`,
        streamUrl: `/api/media/stream?path=${encodeURIComponent(path.relative(folderPath, filePath))}`,
        fullPath: filePath,
        fileSizeBytes
      };
    }));

    return {
      showId,
      showName,
      showNameShort,
      context,
      folderType,
      preparedAt: new Date().toISOString(),
      playlistFile: playlistFileName,
      totalTracks: tracks.length,
      totalDurationSeconds,
      tracks
    };
  }

  // POST /api/shows/:showId/prepare-context - On-demand targeted show preparation
  app.post('/api/shows/:showId/prepare-context', async (req, res) => {
    try {
      const showId = req.params.showId || req.body.showId;
      const { showName, showNameShort, context, folderType } = req.body;
      
      // Evict any old cached context to free memory
      activeShowContext = null;

      const prepared = await buildShowContext({
        showId,
        showName,
        showNameShort,
        context,
        folderType
      });

      activeShowContext = prepared;

      res.json({
        success: true,
        context: prepared,
        totalTracks: prepared.totalTracks,
        totalDurationSeconds: prepared.totalDurationSeconds
      });
    } catch (err: any) {
      console.error('Error preparing show context:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/shows/prepare-context (Body-based alias)
  app.post('/api/shows/prepare-context', async (req, res) => {
    try {
      const { showId, showName, showNameShort, context, folderType } = req.body;
      if (!showId && !showName && !showNameShort) {
        return res.status(400).json({ error: 'showId or showName is required' });
      }

      activeShowContext = null;

      const prepared = await buildShowContext({
        showId: showId || showNameShort || showName,
        showName,
        showNameShort,
        context,
        folderType
      });

      activeShowContext = prepared;

      res.json({
        success: true,
        context: prepared,
        totalTracks: prepared.totalTracks,
        totalDurationSeconds: prepared.totalDurationSeconds
      });
    } catch (err: any) {
      console.error('Error preparing show context:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/shows/active-context - Fetch currently prepared active show context
  app.get('/api/shows/active-context', (req, res) => {
    res.json({
      success: true,
      hasContext: !!activeShowContext,
      context: activeShowContext
    });
  });

  // POST /api/shows/clear-context - Teardown and free memory when exiting show modal/session
  app.post('/api/shows/clear-context', (req, res) => {
    activeShowContext = null;
    res.json({ success: true, message: 'Active show context cleared' });
  });

  // POST /api/shows/:showId/clear-context
  app.post('/api/shows/:showId/clear-context', (req, res) => {
    activeShowContext = null;
    res.json({ success: true, message: 'Show context cleared' });
  });

  // API - Load playlist tracks for a show
  app.post('/api/shows/playlist/load-tracks', async (req, res) => {
    try {
      const { showNameShort, showName, folderType } = req.body;
      if (!showNameShort && !showName) {
        return res.status(400).json({ error: 'showNameShort or showName is required' });
      }

      const searchKey = showNameShort || showName;
      const requestedFolderType = folderType || 'Playlists';

      // Fast-path: Return activeShowContext if already prepared
      if (
        activeShowContext &&
        (activeShowContext.showNameShort === searchKey || activeShowContext.showName === searchKey || activeShowContext.showId === searchKey) &&
        activeShowContext.folderType === requestedFolderType
      ) {
        return res.json({
          success: true,
          showNameShort: activeShowContext.showNameShort,
          playlistFile: activeShowContext.playlistFile,
          tracks: activeShowContext.tracks,
          cached: true
        });
      }

      const prepared = await buildShowContext({
        showId: searchKey,
        showName,
        showNameShort,
        context: 'Playlist',
        folderType: requestedFolderType
      });

      // Update activeShowContext
      activeShowContext = prepared;

      res.json({
        success: true,
        showNameShort: prepared.showNameShort,
        playlistFile: prepared.playlistFile,
        tracks: prepared.tracks
      });
    } catch (err: any) {
      console.error('Error in /api/shows/playlist/load-tracks:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API - Get metadata for a specific playlist MP3 file
  app.get('/api/shows/playlist/file-metadata', async (req, res) => {
    try {
      const showNameShort = req.query.showNameShort as string;
      const showName = req.query.showName as string;
      const file = req.query.file as string;

      if ((!showNameShort && !showName) || !file) {
        return res.status(400).json({ error: 'Missing parameters' });
      }

      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(404).json({ error: 'Local folder not configured' });
      }

      let playlistsPath = path.join(folderPath, 'Playlists');
      if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, 'playlists'))) {
        playlistsPath = path.join(folderPath, 'playlists');
      }

      const showFolderPath = findShowPlaylistFolder(playlistsPath, showNameShort, showName);
      if (!showFolderPath) {
        return res.status(404).json({ error: 'Show folder not found' });
      }

      const cleanFileName = path.basename(file);
      let targetFilePath = path.join(showFolderPath, cleanFileName);
      if (!fs.existsSync(targetFilePath)) {
        const { audioFiles } = getAllAudioAndPlaylistFiles(showFolderPath);
        const matched = audioFiles.find(a => a.name === cleanFileName || a.relPath === file);
        if (matched) targetFilePath = matched.fullPath;
      }

      if (fs.existsSync(targetFilePath)) {
        const meta = await getMp3ServerMetadata(targetFilePath);
        return res.json({ success: true, metadata: meta });
      }

      return res.status(404).json({ error: 'File not found' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API - Check MP3 / track count for current and next show in Playlist mode
  app.post('/api/shows/playlist/check-show-files', async (req, res) => {
    try {
      const { currentShowNameShort, currentShowName, nextShowNameShort, nextShowName } = req.body;

      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.json({ success: true, currentShowFileCount: 0, nextShowFileCount: 0 });
      }

      let playlistsPath = path.join(folderPath, 'Playlists');
      if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, 'playlists'))) {
        playlistsPath = path.join(folderPath, 'playlists');
      }

      const getShowCount = async (shortName?: string, name?: string) => {
        if (!shortName && !name) return 0;
        const showFolderPath = findShowPlaylistFolder(playlistsPath, shortName, name);
        if (!showFolderPath) return 0;

        const { m3uFiles, audioFiles } = await getAllAudioAndPlaylistFilesAsync(showFolderPath);
        if (m3uFiles.length > 0) {
          const rawTracks = await parseM3uFileAsync(m3uFiles[0], showFolderPath);
          return rawTracks.length;
        }
        return audioFiles.length;
      };

      const currentShowFileCount = await getShowCount(currentShowNameShort, currentShowName);
      const nextShowFileCount = await getShowCount(nextShowNameShort, nextShowName);

      res.json({
        success: true,
        currentShowFileCount,
        nextShowFileCount
      });
    } catch (err: any) {
      console.error('Error in /api/shows/playlist/check-show-files:', err);
      res.status(500).json({ error: err.message, currentShowFileCount: 0, nextShowFileCount: 0 });
    }
  });

  // API - Stream playlist file
  app.get('/api/shows/playlist/stream-file', (req, res) => {
    try {
      const showNameShort = req.query.showNameShort as string;
      const showName = req.query.showName as string;
      const file = req.query.file as string;
      const folderType = (req.query.folderType as string) || 'Playlists';
      if ((!showNameShort && !showName) || !file) {
        return res.status(400).send('showNameShort/showName and file are required');
      }

      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(404).send('Local source folder not defined or offline');
      }

      const baseSubfolder = folderType === 'Evergreens' ? 'Evergreens' : 'Playlists';
      let playlistsPath = path.join(folderPath, baseSubfolder);
      if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, baseSubfolder.toLowerCase()))) {
        playlistsPath = path.join(folderPath, baseSubfolder.toLowerCase());
      }

      const showFolderPath = findShowPlaylistFolder(playlistsPath, showNameShort, showName);
      if (!showFolderPath) {
        return res.status(404).send('Show folder not found in playlists directory');
      }

      const cleanFileName = path.basename(file);
      let targetFilePath = path.join(showFolderPath, cleanFileName);

      if (!fs.existsSync(targetFilePath)) {
        const { audioFiles } = getAllAudioAndPlaylistFiles(showFolderPath);
        const matched = audioFiles.find(a => a.name === cleanFileName || a.relPath === file);
        if (matched) {
          targetFilePath = matched.fullPath;
        }
      }

      if (fs.existsSync(targetFilePath) && fs.statSync(targetFilePath).isFile()) {
        res.sendFile(targetFilePath);
      } else {
        res.status(404).send('File not found in playlist directory');
      }
    } catch (e: any) {
      res.status(500).send(e.message || 'Streaming failed');
    }
  });

  // API - Apply Evergreen & Playlist folder creation or renaming
  app.post('/api/shows/evergreen/apply-change', (req, res) => {
    try {
      const { action, nameShort, oldNameShort, renameFolder } = req.body;
      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(400).json({ error: 'Local Media Directory is not defined or is offline.' });
      }
      
      let evergreensPath = path.join(folderPath, 'Evergreens');
      if (!fs.existsSync(evergreensPath) && fs.existsSync(path.join(folderPath, 'evergreens'))) {
        evergreensPath = path.join(folderPath, 'evergreens');
      }
      if (!fs.existsSync(evergreensPath)) {
        fs.mkdirSync(evergreensPath, { recursive: true });
      }

      let playlistsPath = path.join(folderPath, 'Playlists');
      if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, 'playlists'))) {
        playlistsPath = path.join(folderPath, 'playlists');
      }
      if (!fs.existsSync(playlistsPath)) {
        fs.mkdirSync(playlistsPath, { recursive: true });
      }

      let folderCreated = false;
      let folderRenamed = false;

      // 1. Evergreens folder sync
      const newEvergreenFolderPath = path.join(evergreensPath, nameShort);
      if (action === 'update' && oldNameShort && oldNameShort !== nameShort) {
        const oldFolderPath = path.join(evergreensPath, oldNameShort);
        if (fs.existsSync(oldFolderPath) && renameFolder) {
          if (!fs.existsSync(newEvergreenFolderPath)) {
            fs.renameSync(oldFolderPath, newEvergreenFolderPath);
            folderRenamed = true;
          }
        } else if (!fs.existsSync(newEvergreenFolderPath)) {
          fs.mkdirSync(newEvergreenFolderPath, { recursive: true });
          folderCreated = true;
        }
      } else if (!fs.existsSync(newEvergreenFolderPath)) {
        fs.mkdirSync(newEvergreenFolderPath, { recursive: true });
        folderCreated = true;
      }

      // 2. Playlists folder sync
      const newPlaylistFolderPath = path.join(playlistsPath, nameShort);
      if (action === 'update' && oldNameShort && oldNameShort !== nameShort) {
        const oldPlaylistFolderPath = path.join(playlistsPath, oldNameShort);
        if (fs.existsSync(oldPlaylistFolderPath) && renameFolder) {
          if (!fs.existsSync(newPlaylistFolderPath)) {
            fs.renameSync(oldPlaylistFolderPath, newPlaylistFolderPath);
            folderRenamed = true;
          }
        } else if (!fs.existsSync(newPlaylistFolderPath)) {
          fs.mkdirSync(newPlaylistFolderPath, { recursive: true });
          folderCreated = true;
        }
      } else if (!fs.existsSync(newPlaylistFolderPath)) {
        fs.mkdirSync(newPlaylistFolderPath, { recursive: true });
        folderCreated = true;
      }

      res.json({ success: true, folderCreated, folderRenamed });
    } catch (err: any) {
      console.error('Error in /api/shows/evergreen/apply-change:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // API - Logs
  app.get('/api/logs', (req, res) => {
    try {
      const filePath = getLogFilePath();
      if (!filePath || !fs.existsSync(filePath)) {
        return res.json([]);
      }
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data || '[]');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return res.json(Array.isArray(parsed.data) ? parsed.data : []);
      }
      res.json(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.error('Failed to read logs from endpoint:', e);
      res.status(500).json([]);
    }
  });

  app.post('/api/logs', (req, res) => {
    try {
      const entry: LogEntry = req.body;
      if (!entry.timestamp) entry.timestamp = new Date().toISOString();
      if (!entry.logTimeStamp) entry.logTimeStamp = entry.timestamp;
      if (!entry.status) entry.status = 'played';
      if (!entry.assetType) {
        const fn = (entry.mp3Name || '').toLowerCase();
        entry.assetType = (fn.endsWith('.txt') || fn.endsWith('.pdf') || fn.endsWith('.png') || fn.endsWith('.jpg') || fn.endsWith('.jpeg')) ? 'script' : 'audio';
      }
      const filePath = getLogFilePath();
      if (!filePath) {
        return res.status(400).json({ error: 'Logs directory is not configured' });
      }
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      let logs = [];
      let counter = 0;
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        try {
          const parsed = JSON.parse(data || '[]');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            logs = Array.isArray(parsed.data) ? parsed.data : [];
            counter = parsed.LogsBackupCounter || 0;
          } else {
            logs = Array.isArray(parsed) ? parsed : [];
          }
        } catch (pe) {
          logs = [];
        }
      }
      logs.push(entry);
      
      counter += 1; // Increment on every backup / save operation
      // Save main log as object structure
      fs.writeFileSync(filePath, JSON.stringify({ LogsBackupCounter: counter, data: logs }, null, 2));
      
      // Simple backup mechanism
      try {
        const backupPath = getLogBackupPath();
        const backupParent = path.dirname(backupPath);
        if (!fs.existsSync(backupParent)) {
          fs.mkdirSync(backupParent, { recursive: true });
        }
        fs.writeFileSync(backupPath, JSON.stringify({ LogsBackupCounter: counter, data: logs }, null, 2));
      } catch (e) {
        console.error('Backup failed:', e);
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error('Failed to save log to endpoint:', e);
      res.status(500).json({ error: 'Failed to save log: ' + e.message });
    }
  });

  // API - Dedicated Playlist Show JSON Log Save
  app.post('/api/shows/playlist/save-log-json', (req, res) => {
    try {
      const { showNameShort, showName, showStartTime, logData, folderType, logFileName: clientLogFileName } = req.body;
      if (!showNameShort && !showName) {
        return res.status(400).json({ error: 'showNameShort or showName is required' });
      }

      const folderPath = currentSettings.localPathMP3s;
      let showFolderPath: string | null = null;

      if (folderPath && fs.existsSync(folderPath)) {
        const baseSubfolder = folderType === 'Evergreens' ? 'Evergreens' : 'Playlists';
        let playlistsPath = path.join(folderPath, baseSubfolder);
        if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, baseSubfolder.toLowerCase()))) {
          playlistsPath = path.join(folderPath, baseSubfolder.toLowerCase());
        }
        if (!fs.existsSync(playlistsPath)) {
          fs.mkdirSync(playlistsPath, { recursive: true });
        }
        const searchKey = showNameShort || showName;
        showFolderPath = findShowPlaylistFolder(playlistsPath, showNameShort, showName);
        if (!showFolderPath) {
          showFolderPath = path.join(playlistsPath, String(searchKey).replace(/[\/\\?%*:|"<>]/g, '_'));
          if (!fs.existsSync(showFolderPath)) {
            fs.mkdirSync(showFolderPath, { recursive: true });
          }
        }
      }

      const dateObj = showStartTime ? new Date(showStartTime) : new Date();
      const YYYY = dateObj.getFullYear();
      const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
      const DD = String(dateObj.getDate()).padStart(2, '0');
      const HH = String(dateObj.getHours()).padStart(2, '0');
      const min = String(dateObj.getMinutes()).padStart(2, '0');
      const safeShowName = String(showNameShort || showName || 'Show').replace(/[\/\\?%*:|"<>]/g, '_');
      const fallbackFileName = `Log_${safeShowName}_${YYYY}_${MM}_${DD}_at_${HH}_${min}.json`;
      const logFileName = clientLogFileName || logData?.logFileName || fallbackFileName;

      if (showFolderPath) {
        const filePath = path.join(showFolderPath, logFileName);
        fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), 'utf-8');
      }

      // Backup to Playlists log directory
      const baseLogFilePath = getLogFilePath();
      const baseLogDir = baseLogFilePath ? path.dirname(baseLogFilePath) : (currentSettings.localPathLogs || null);
      if (baseLogDir && fs.existsSync(baseLogDir)) {
        const playlistLogsDir = path.join(baseLogDir, 'Playlists');
        if (!fs.existsSync(playlistLogsDir)) {
          fs.mkdirSync(playlistLogsDir, { recursive: true });
        }
        fs.writeFileSync(path.join(playlistLogsDir, logFileName), JSON.stringify(logData, null, 2), 'utf-8');
      }

      res.json({ success: true, logFileName });
    } catch (e: any) {
      console.error('Failed to save playlist JSON log:', e);
      res.status(500).json({ error: 'Failed to save playlist JSON log: ' + e.message });
    }
  });

  // API - Dedicated Playlist Show JSON Log Load
  app.post('/api/shows/playlist/load-log-json', (req, res) => {
    try {
      const { showNameShort, showName, showStartTime, folderType, logFileName: clientLogFileName } = req.body;
      if (!showNameShort && !showName) {
        return res.status(400).json({ error: 'showNameShort or showName is required' });
      }

      const dateObj = showStartTime ? new Date(showStartTime) : new Date();
      const YYYY = dateObj.getFullYear();
      const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
      const DD = String(dateObj.getDate()).padStart(2, '0');
      const HH = String(dateObj.getHours()).padStart(2, '0');
      const min = String(dateObj.getMinutes()).padStart(2, '0');
      const safeShowName = String(showNameShort || showName || 'Show').replace(/[\/\\?%*:|"<>]/g, '_');
      const fallbackFileName = `Log_${safeShowName}_${YYYY}_${MM}_${DD}_at_${HH}_${min}.json`;
      const logFileName = clientLogFileName || fallbackFileName;
      const datePrefix = `${YYYY}_${MM}_${DD}`;

      const findFileInDir = (dirPath: string, fileName: string): string | null => {
        if (!dirPath || !fs.existsSync(dirPath)) return null;
        const exact = path.join(dirPath, fileName);
        if (fs.existsSync(exact)) return exact;

        try {
          const files = fs.readdirSync(dirPath);
          const lowerName = fileName.toLowerCase();
          for (const f of files) {
            if (f.toLowerCase() === lowerName) {
              return path.join(dirPath, f);
            }
          }
          // Date prefix fallback
          for (const f of files) {
            if (f.startsWith('Log_') && f.includes(datePrefix) && f.endsWith('.json')) {
              return path.join(dirPath, f);
            }
          }
        } catch (e) {}
        return null;
      };

      const folderPath = currentSettings.localPathMP3s;
      let foundData: any = null;

      if (folderPath && fs.existsSync(folderPath)) {
        const baseSubfolder = folderType === 'Evergreens' ? 'Evergreens' : 'Playlists';
        let playlistsPath = path.join(folderPath, baseSubfolder);
        if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, baseSubfolder.toLowerCase()))) {
          playlistsPath = path.join(folderPath, baseSubfolder.toLowerCase());
        }
        const showFolderPath = findShowPlaylistFolder(playlistsPath, showNameShort, showName);
        if (showFolderPath) {
          const matchedFilePath = findFileInDir(showFolderPath, logFileName);
          if (matchedFilePath) {
            const raw = fs.readFileSync(matchedFilePath, 'utf-8');
            foundData = JSON.parse(raw);
          }
        }
      }

      if (!foundData) {
        const baseLogFilePath = getLogFilePath();
        const baseLogDir = baseLogFilePath ? path.dirname(baseLogFilePath) : (currentSettings.localPathLogs || null);
        if (baseLogDir && fs.existsSync(baseLogDir)) {
          const playlistLogsDir = path.join(baseLogDir, 'Playlists');
          const backupFilePath = findFileInDir(playlistLogsDir, logFileName);
          if (backupFilePath) {
            const raw = fs.readFileSync(backupFilePath, 'utf-8');
            foundData = JSON.parse(raw);
          }
        }
      }

      res.json({ success: true, logFileName, logData: foundData });
    } catch (e: any) {
      console.error('Failed to load playlist JSON log:', e);
      res.status(500).json({ error: 'Failed to load playlist JSON log: ' + e.message });
    }
  });

  // API - Open local folder in OS neutral fashion
  app.post('/api/open-local-folder', async (req, res) => {
    try {
      const { path: folderPath } = req.body;
      if (!folderPath) {
        return res.status(400).json({ error: 'Folder path is required' });
      }
      if (!fs.existsSync(folderPath)) {
        return res.status(404).json({ error: 'Folder directory does not exist' });
      }

      // Try electron shell.openPath if available
      try {
        const electron = require('electron');
        if (electron && electron.shell && electron.shell.openPath) {
          const errMsg = await electron.shell.openPath(folderPath);
          if (!errMsg) {
            return res.json({ success: true });
          }
          console.warn('electron.shell.openPath returned warning:', errMsg);
        }
      } catch (_) {
        // Fallback to child_process
      }

      const { execFile } = require('child_process');
      const startCmd = process.platform === 'win32' 
        ? 'explorer' 
        : process.platform === 'darwin' 
          ? 'open' 
          : 'xdg-open';
      
      execFile(startCmd, [folderPath], (err: any) => {
        if (err) {
          console.error('Failed to open local directory:', err);
          return res.status(500).json({ error: 'Failed to open directory natively: ' + err.message });
        }
        res.json({ success: true });
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Cannot open directory' });
    }
  });

  // API - Trigger local schedules and logs archiving/backup
  app.post('/api/trigger-backup', (req, res) => {
    try {
      const calendarPath = getCalendarFilePath();
      const logPath = getLogFilePath();
      const showsPath = getShowsFilePath();

      // If folders are not configured, skip local backup without touching disk or creating files
      if (!calendarPath && !logPath && !showsPath) {
        return res.json({ success: true, skipped: true, reason: 'Folders not configured' });
      }

      // Backup schedules
      if (calendarPath) {
        if (!fs.existsSync(calendarPath)) {
          const calendarDir = path.dirname(calendarPath);
          if (calendarDir && !fs.existsSync(calendarDir)) {
            fs.mkdirSync(calendarDir, { recursive: true });
          }
          fs.writeFileSync(calendarPath, JSON.stringify({ InterstitialsBackupCounter: 0, data: [] }, null, 2));
        }

        if (fs.existsSync(calendarPath)) {
          const data = fs.readFileSync(calendarPath, 'utf-8');
          let parsed;
          try {
            parsed = JSON.parse(data || '[]');
          } catch {
            parsed = [];
          }

          let arrayData = Array.isArray(parsed) ? parsed : (parsed.data || []);
          let currentCounter = Array.isArray(parsed) ? 1 : ((parsed.InterstitialsBackupCounter || 0) + 1);

          const updatedObj = {
            InterstitialsBackupCounter: currentCounter,
            data: arrayData
          };

          const updatedStr = JSON.stringify(updatedObj, null, 2);
          fs.writeFileSync(calendarPath, updatedStr);

          const backupFileName = generateBackupFilename('interstitials', req.body?.workstationMode);

          const calendarDir = path.dirname(calendarPath);
          const calendarBackupDir = path.join(calendarDir, 'backups');
          if (!fs.existsSync(calendarBackupDir)) {
            fs.mkdirSync(calendarBackupDir, { recursive: true });
          }
          fs.writeFileSync(path.join(calendarBackupDir, backupFileName), updatedStr);

          // Also save to schedules_backup.json
          try {
            const backupPath = getCalendarBackupPath();
            if (backupPath) {
              const backupParent = path.dirname(backupPath);
              if (!fs.existsSync(backupParent)) {
                fs.mkdirSync(backupParent, { recursive: true });
              }
              fs.writeFileSync(backupPath, updatedStr);
            }
          } catch (e) {
            console.error('Schedules trigger backup failed to copy:', e);
          }
        }
      }

      // Backup logs
      if (logPath) {
        if (!fs.existsSync(logPath)) {
          const logDir = path.dirname(logPath);
          if (logDir && !fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          fs.writeFileSync(logPath, JSON.stringify({ LogsBackupCounter: 0, data: [] }, null, 2));
        }

        if (fs.existsSync(logPath)) {
          const data = fs.readFileSync(logPath, 'utf-8');
          let parsed;
          try {
            parsed = JSON.parse(data || '[]');
          } catch (pe) {
            parsed = [];
          }

          let arrayData = Array.isArray(parsed) ? parsed : (parsed.data || []);
          let currentCounter = Array.isArray(parsed) ? 1 : ((parsed.LogsBackupCounter || 0) + 1);

          const updatedObj = {
            LogsBackupCounter: currentCounter,
            data: arrayData
          };

          const updatedStr = JSON.stringify(updatedObj, null, 2);
          fs.writeFileSync(logPath, updatedStr);

          const backupFileName = generateBackupFilename('logs', req.body?.workstationMode);

          const logDir = path.dirname(logPath);
          const logBackupDir = path.join(logDir, 'backups');
          if (!fs.existsSync(logBackupDir)) {
            fs.mkdirSync(logBackupDir, { recursive: true });
          }
          fs.writeFileSync(path.join(logBackupDir, backupFileName), updatedStr);

          // Also save to logs_backup.json
          try {
            const backupPath = getLogBackupPath();
            if (backupPath) {
              const backupParent = path.dirname(backupPath);
              if (!fs.existsSync(backupParent)) {
                fs.mkdirSync(backupParent, { recursive: true });
              }
              fs.writeFileSync(backupPath, updatedStr);
            }
          } catch (e) {
            console.error('Logs trigger backup failed to copy:', e);
          }
        }
      }

      // Backup shows
      if (showsPath) {
        if (!fs.existsSync(showsPath)) {
          const showsDir = path.dirname(showsPath);
          if (showsDir && !fs.existsSync(showsDir)) {
            fs.mkdirSync(showsDir, { recursive: true });
          }
          fs.writeFileSync(showsPath, JSON.stringify({ ShowsBackupCounter: 0, data: [] }, null, 2));
        }

        if (fs.existsSync(showsPath)) {
          const data = fs.readFileSync(showsPath, 'utf-8');
          let parsed;
          try {
            parsed = JSON.parse(data || '[]');
          } catch (pe) {
            parsed = [];
          }

          let arrayData = Array.isArray(parsed) ? parsed : (parsed.data || []);
          let currentCounter = Array.isArray(parsed) ? 1 : ((parsed.ShowsBackupCounter || 0) + 1);

          const updatedObj = {
            ShowsBackupCounter: currentCounter,
            data: arrayData
          };

          const updatedStr = JSON.stringify(updatedObj, null, 2);
          fs.writeFileSync(showsPath, updatedStr);

          const backupFileName = generateBackupFilename('shows', req.body?.workstationMode);

          const showsDir = path.dirname(showsPath);
          const showsBackupDir = path.join(showsDir, 'backups');
          if (!fs.existsSync(showsBackupDir)) {
            fs.mkdirSync(showsBackupDir, { recursive: true });
          }
          fs.writeFileSync(path.join(showsBackupDir, backupFileName), updatedStr);

          // Also save to shows_backup.json
          try {
            const backupPath = getShowsBackupPath();
            if (backupPath) {
              const backupParent = path.dirname(backupPath);
              if (!fs.existsSync(backupParent)) {
                fs.mkdirSync(backupParent, { recursive: true });
              }
              fs.writeFileSync(backupPath, updatedStr);
            }
          } catch (e) {
            console.error('Shows trigger backup failed to copy:', e);
          }
        }
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error('Local backup trigger failed:', e);
      res.status(500).json({ error: 'Archiving failed: ' + e.message });
    }
  });

  // Helper to locate Evergreen track source file strictly inside Evergreens directory
  function findEvergreenSourceFile(folderPath: string, fileName: string, showNameShort?: string, showName?: string): string | null {
    if (!fileName) return null;
    if (fs.existsSync(fileName)) return fileName;

    let cleanName = fileName;
    if (cleanName.includes('/api/media/stream')) {
      const parts = cleanName.split(/(?:file|path)=/);
      if (parts.length > 1) {
        cleanName = decodeURIComponent(parts[1].split('&')[0]);
      }
    }

    const evergreensRoot = path.join(folderPath, 'Evergreens');
    const baseName = path.basename(cleanName);

    // 1. Check inside show folder if resolved
    const showFolder = findShowPlaylistFolder(evergreensRoot, showNameShort, showName);
    if (showFolder) {
      const candidate = path.join(showFolder, baseName);
      if (fs.existsSync(candidate)) return candidate;
    }

    // 2. Search Evergreens root and subfolders inside Evergreens
    if (fs.existsSync(evergreensRoot)) {
      const candidateRoot = path.join(evergreensRoot, baseName);
      if (fs.existsSync(candidateRoot)) return candidateRoot;

      try {
        const entries = fs.readdirSync(evergreensRoot);
        for (const entry of entries) {
          const fullPath = path.join(evergreensRoot, entry);
          if (fs.statSync(fullPath).isDirectory()) {
            const candidate = path.join(fullPath, baseName);
            if (fs.existsSync(candidate)) return candidate;
          } else if (entry.toLowerCase() === baseName.toLowerCase()) {
            return fullPath;
          }
        }
      } catch (e) {}
    }

    // 3. Fallback check directly in folderPath
    const candidateDirect = path.join(folderPath, baseName);
    if (fs.existsSync(candidateDirect)) return candidateDirect;

    return null;
  }

  // Helper to locate Interstitial source file
  function findInterstitialSourceFile(folderPath: string, fileName: string): string | null {
    if (!fileName) return null;
    if (fs.existsSync(fileName)) return fileName;

    let cleanName = fileName;
    if (cleanName.includes('/api/media/stream')) {
      const parts = cleanName.split(/(?:file|path)=/);
      if (parts.length > 1) {
        cleanName = decodeURIComponent(parts[1].split('&')[0]);
      }
    }

    const baseName = path.basename(cleanName);

    // 1. Check inside Interstitials / interstitials subfolders
    const subdirs = ['Interstitials', 'interstitials'];
    for (const sub of subdirs) {
      const dirPath = path.join(folderPath, sub);
      if (fs.existsSync(dirPath)) {
        const candidate = path.join(dirPath, baseName);
        if (fs.existsSync(candidate)) return candidate;
      }
    }

    // 2. Check directly in folderPath
    const candidateDirect = path.join(folderPath, baseName);
    if (fs.existsSync(candidateDirect)) return candidateDirect;

    // 3. Search recursively inside all subdirectories of folderPath (except Evergreens and Playlists)
    try {
      const entries = fs.readdirSync(folderPath);
      for (const entry of entries) {
        if (entry === 'Evergreens' || entry === 'Playlists') continue;
        const fullPath = path.join(folderPath, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          const candidate = path.join(fullPath, baseName);
          if (fs.existsSync(candidate)) return candidate;
        } else if (entry.toLowerCase() === baseName.toLowerCase()) {
          return fullPath;
        }
      }
    } catch (e) {}

    return null;
  }

  // Security helper to protect against modifying root or system directories
  const SAFE_EXPORT_EXTENSIONS = new Set([
    '.mp3', '.txt', '.m3u', '.m3u8', '.pdf', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.log'
  ]);

  function isSystemOrRootDirectory(dirPath: string): boolean {
    if (!dirPath) return true;
    const resolved = path.resolve(dirPath);
    const root = path.parse(resolved).root;
    if (resolved === root) return true;

    const lower = resolved.toLowerCase();
    const protectedPaths = [
      'c:\\windows',
      'c:\\program files',
      'c:\\program files (x86)',
      'c:\\programdata',
      '/system',
      '/library',
      '/usr',
      '/bin',
      '/sbin',
      '/etc',
      '/var',
      '/private',
      '/dev',
      '/boot'
    ];

    for (const p of protectedPaths) {
      if (lower === p || lower.startsWith(p + path.sep)) {
        return true;
      }
    }

    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir && path.resolve(homeDir) === resolved) {
      return true;
    }

    return false;
  }

  function computeExportFolderInfo(
    destParentFolder: string,
    prerecordDate: string | Date,
    lengthMinutes: number,
    folderPrefix?: string
  ): { exportFolderName: string; exportFolderPath: string; dateStr: string; timeStr: string; durationStr: string; hours: string; minutes: string } {
    const parsedDate = new Date(prerecordDate);
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    const hours = String(parsedDate.getHours()).padStart(2, '0');
    const minutes = String(parsedDate.getMinutes()).padStart(2, '0');

    const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthShort = monthShorts[parsedDate.getMonth()] || 'JUN';

    const dateStr = `${year}-${month}(${monthShort})-${day}`;
    const timeStr = `${hours}-${minutes}`;

    const fPrefix = (folderPrefix && folderPrefix.trim()) || 'Show';
    const lengthMinutesNum = Number(lengthMinutes) || 0;
    const h = Math.floor(lengthMinutesNum / 60);
    const m = lengthMinutesNum % 60;
    const durationStr = m === 0 ? `${h} Hrs` : `${h} Hrs ${m} Min`;

    const exportFolderName = `${fPrefix} - Export - ${dateStr} at ${timeStr} - ${durationStr}`;
    const exportFolderPath = path.join(destParentFolder, exportFolderName);

    return { exportFolderName, exportFolderPath, dateStr, timeStr, durationStr, hours, minutes };
  }

  function cleanExportFolder(folderPath: string): { deletedFiles: string[]; skippedFiles: string[]; error?: string } {
    if (!fs.existsSync(folderPath)) {
      return { deletedFiles: [], skippedFiles: [] };
    }

    if (isSystemOrRootDirectory(folderPath)) {
      return { deletedFiles: [], skippedFiles: [], error: 'Folder is a protected system directory' };
    }

    const deletedFiles: string[] = [];
    const skippedFiles: string[] = [];

    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      for (const entry of entries) {
        // NEVER delete subdirectories / folders
        if (entry.isDirectory()) {
          skippedFiles.push(`${entry.name}/ (directory)`);
          continue;
        }

        const fileName = entry.name;
        const ext = path.extname(fileName).toLowerCase();

        // Check if it is an allowed export file extension
        if (!SAFE_EXPORT_EXTENSIONS.has(ext)) {
          skippedFiles.push(fileName);
          continue;
        }

        // Never delete critical system/hidden files
        if (fileName.startsWith('.') || fileName.toLowerCase() === 'desktop.ini' || fileName.toLowerCase() === 'thumbs.db') {
          skippedFiles.push(fileName);
          continue;
        }

        const fullFilePath = path.join(folderPath, fileName);
        try {
          fs.unlinkSync(fullFilePath);
          deletedFiles.push(fileName);
        } catch (err: any) {
          console.warn(`Could not delete file ${fullFilePath}:`, err);
          skippedFiles.push(fileName);
        }
      }
    } catch (err: any) {
      return { deletedFiles, skippedFiles, error: err.message };
    }

    return { deletedFiles, skippedFiles };
  }

  // API - Check if export folder already exists and has files
  app.post('/api/check-export-folder', (req, res) => {
    try {
      const { exportDestination, folderPrefix, prerecordDate, lengthMinutes } = req.body;
      if (!prerecordDate) {
        return res.status(400).json({ error: 'Prerecord date is required' });
      }

      const destParentFolder = (exportDestination && exportDestination.trim()) || currentSettings.localPathMP3s;
      if (!destParentFolder) {
        return res.status(400).json({ error: 'Export destination folder or Media folder is not defined' });
      }

      const { exportFolderName, exportFolderPath } = computeExportFolderInfo(
        destParentFolder,
        prerecordDate,
        Number(lengthMinutes) || 0,
        folderPrefix
      );

      if (!fs.existsSync(exportFolderPath)) {
        return res.json({
          exists: false,
          hasFiles: false,
          fileCount: 0,
          files: [],
          exportFolderName,
          exportFolderPath
        });
      }

      // Folder exists: inspect contents
      try {
        const entries = fs.readdirSync(exportFolderPath, { withFileTypes: true });
        const files = entries.filter(e => e.isFile()).map(e => e.name);
        const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
        const totalItems = entries.length;
        const fileCount = files.length;

        return res.json({
          exists: true,
          hasFiles: totalItems > 0,
          fileCount,
          totalItems,
          files: files.slice(0, 10),
          directories: dirs,
          exportFolderName,
          exportFolderPath
        });
      } catch (e: any) {
        return res.json({
          exists: true,
          hasFiles: false,
          fileCount: 0,
          files: [],
          exportFolderName,
          exportFolderPath
        });
      }
    } catch (e: any) {
      console.error('Failed to check export folder:', e);
      res.status(500).json({ error: 'Failed to check export folder: ' + e.message });
    }
  });

  // API - Export prerecord playlist and files
  app.post('/api/export-prerecord', async (req, res) => {
    try {
      const { prerecordDate, lengthMinutes, items, exportDestination, folderPrefix, textPrefix, playlistPrefix, overwriteMode } = req.body;
      if (!prerecordDate) {
        return res.status(400).json({ error: 'Prerecord date is required' });
      }
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Scheduled items array is required' });
      }

      const destParentFolder = (exportDestination && exportDestination.trim()) || currentSettings.localPathMP3s;
      if (!destParentFolder) {
        return res.status(400).json({ error: 'Export destination folder or Media folder is not defined' });
      }
      if (!fs.existsSync(destParentFolder)) {
        fs.mkdirSync(destParentFolder, { recursive: true });
      }

      const sourceFolder = currentSettings.localPathMP3s;
      if (!sourceFolder || !fs.existsSync(sourceFolder)) {
        return res.status(400).json({ error: 'Media source folder is not defined or accessible' });
      }

      // Format clean, file-safe folder name for the export using helper
      const { exportFolderName, exportFolderPath, dateStr, timeStr, durationStr, hours, minutes } = computeExportFolderInfo(
        destParentFolder,
        prerecordDate,
        Number(lengthMinutes) || 0,
        folderPrefix
      );

      const tPrefix = (textPrefix && textPrefix.trim()) || 'Show';
      const pPrefix = (playlistPrefix && playlistPrefix.trim()) || 'Show';

      // If user requested permanent deletion of previously exported files in this folder
      if (overwriteMode === 'clean' && fs.existsSync(exportFolderPath)) {
        cleanExportFolder(exportFolderPath);
      }

      // Create the export directory
      if (!fs.existsSync(exportFolderPath)) {
        fs.mkdirSync(exportFolderPath, { recursive: true });
      }

      let copiedCount = 0;
      let missingCount = 0;
      const fileReport: any[] = [];

      // Determine texts/lines for playlist (m3u) and summary txt
      const m3uLines: string[] = ['#EXTM3U'];
      const txtLines: string[] = [
        '========================================================================',
        '              PRERECORD BROADCAST SCHEDULE SUMMARY',
        '========================================================================',
        `Air Date: ${dateStr}`,
        `Start Time: ${hours}:${minutes}`,
        `Duration: ${lengthMinutes} minutes`,
        '========================================================================',
        '',
        'SEQUENCE OF SCHEDULED SPECIALS & BREAKS:',
        '------------------------------------------------------------------------'
      ];

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const itemIdx = idx + 1;
        const itemSlotTime = item.slotTime; // e.g. "12:00"
        const safeSlotTime = typeof itemSlotTime === 'string' ? itemSlotTime.replace(/:/g, '-') : '00-00';
        
        const isScript = item.assetType === 'script';
        const rawName = item.interstitialName || (item.isEvergreen ? 'Unnamed Evergreen Track' : (isScript ? 'Unnamed Live Read' : 'Unnamed Break'));
        const safeName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
        
        const sourceFileName = item.fileName || '';
        const ext = path.extname(sourceFileName) || (isScript ? '.txt' : '.mp3');
        
        const paddedIdx = String(itemIdx).padStart(2, '0');
        const typePrefix = item.isEvergreen ? 'Track' : 'Break';
        const targetFileName = item.targetFileName || `${paddedIdx} ${typePrefix} at ${safeSlotTime} - ${safeName}${ext}`;
        
        let sourceFilePath: string | null = null;
        if (item.isEvergreen) {
          sourceFilePath = findEvergreenSourceFile(sourceFolder, sourceFileName, item.showNameShort, item.showName);
        } else {
          sourceFilePath = findInterstitialSourceFile(sourceFolder, sourceFileName);
        }

        const destFilePath = path.join(exportFolderPath, targetFileName);

        // Determine artist/album metadata if available from item or destination MP3 tags
        let itemArtist = (item.artist && typeof item.artist === 'string' && item.artist.trim()) || '';
        let itemAlbumArtist = (item.albumArtist && typeof item.albumArtist === 'string' && item.albumArtist.trim()) || '';
        let itemAlbum = (item.album && typeof item.album === 'string' && item.album.trim()) || '';

        let status = 'Missing';
        if (sourceFilePath && fs.existsSync(sourceFilePath)) {
          try {
            const copyRes = await withTimeout(
              fs.promises.copyFile(sourceFilePath, destFilePath).then(() => true),
              10000,
              false
            );

            if (copyRes) {
              copiedCount++;
              status = 'Found & Copied';

              // Rewrite MP3 ID3 title metadata to prepend "xx Track - " or "xx Break - " as appropriate
              if (ext.toLowerCase() === '.mp3') {
                try {
                  const existingTags = NodeID3.read(destFilePath);
                  const baseTitle = (existingTags && typeof existingTags.title === 'string' && existingTags.title.trim())
                    ? existingTags.title.trim()
                    : rawName;
                  const newTitle = `${paddedIdx} ${typePrefix} - ${baseTitle}`;
                  NodeID3.update({ title: newTitle }, destFilePath);

                  if (!itemArtist && existingTags && typeof existingTags.artist === 'string' && existingTags.artist.trim()) {
                    itemArtist = existingTags.artist.trim();
                  }
                  if (!itemAlbumArtist && existingTags && typeof (existingTags as any).albumArtist === 'string' && (existingTags as any).albumArtist.trim()) {
                    itemAlbumArtist = (existingTags as any).albumArtist.trim();
                  }
                  if (!itemAlbum && existingTags && typeof existingTags.album === 'string' && existingTags.album.trim()) {
                    itemAlbum = existingTags.album.trim();
                  }
                } catch (id3Err) {
                  console.warn(`Failed to update ID3 tags for ${targetFileName}:`, id3Err);
                }
              }
            } else {
              status = 'Copy Error: Timeout (File locked or syncing in cloud)';
              missingCount++;
            }
          } catch (copyErr: any) {
            console.error(`Error copying ${sourceFileName}:`, copyErr);
            status = `Copy Error: ${copyErr.message}`;
            missingCount++;
          }
        } else {
          missingCount++;
        }

        // Handle optional backup MP3 for Live Read script breaks
        let backupStatus = '';
        let backupTargetFileName = '';
        if (isScript && item.backupMp3Url) {
          const backupExt = path.extname(item.backupMp3Url) || '.mp3';
          const dotIdx = targetFileName.lastIndexOf('.');
          const baseTargetWithoutExt = dotIdx !== -1 ? targetFileName.substring(0, dotIdx) : targetFileName;
          backupTargetFileName = `${baseTargetWithoutExt} (Backup)${backupExt}`;

          const backupSourcePath = findInterstitialSourceFile(sourceFolder, item.backupMp3Url);
          const backupDestPath = path.join(exportFolderPath, backupTargetFileName);

          if (backupSourcePath && fs.existsSync(backupSourcePath)) {
            try {
              const backupCopyRes = await withTimeout(
                fs.promises.copyFile(backupSourcePath, backupDestPath).then(() => true),
                10000,
                false
              );

              if (backupCopyRes) {
                copiedCount++;
                backupStatus = 'Found & Copied';

                // Rewrite MP3 ID3 title metadata for backup MP3
                if (backupExt.toLowerCase() === '.mp3') {
                  try {
                    const existingTags = NodeID3.read(backupDestPath);
                    const baseTitle = (existingTags && typeof existingTags.title === 'string' && existingTags.title.trim())
                      ? existingTags.title.trim()
                      : `${rawName} (Backup MP3)`;
                    const newTitle = `${paddedIdx} ${typePrefix} - ${baseTitle}`;
                    NodeID3.update({ title: newTitle }, backupDestPath);
                  } catch (id3Err) {
                    console.warn(`Failed to update ID3 tags for backup MP3 ${backupTargetFileName}:`, id3Err);
                  }
                }
              } else {
                backupStatus = 'Copy Error: Timeout (File locked or syncing in cloud)';
              }
            } catch (copyErr: any) {
              console.error(`Error copying backup MP3 ${item.backupMp3Url}:`, copyErr);
              backupStatus = `Copy Error: ${copyErr.message}`;
            }
          } else {
            backupStatus = 'Missing';
          }
        }

        fileReport.push({
          index: itemIdx,
          slotTime: itemSlotTime,
          interstitialName: rawName,
          originalFile: sourceFileName,
          exportedFile: targetFileName,
          isEvergreen: !!item.isEvergreen,
          assetType: item.assetType,
          backupMp3Url: item.backupMp3Url,
          backupExportedFile: backupTargetFileName || undefined,
          backupStatus: backupStatus || undefined,
          status
        });

        // Add to m3u playlist lines (only MP3 files go into the playlist)
        if (ext.toLowerCase() === '.mp3') {
          m3uLines.push(`#EXTINF:-1,${paddedIdx} ${typePrefix} - ${itemSlotTime} - ${rawName}`);
          m3uLines.push(targetFileName);
        } else if (isScript && backupTargetFileName && backupStatus === 'Found & Copied') {
          // Put the backup MP3 into the playlist for live read script breaks
          m3uLines.push(`#EXTINF:-1,${paddedIdx} ${typePrefix} - ${itemSlotTime} - ${rawName} (Backup MP3)`);
          m3uLines.push(backupTargetFileName);
        }

        // Add to summary text file
        const itemTypeHeader = item.isEvergreen ? 'EVERGREEN TRACK' : (isScript ? 'LIVE READ BREAK' : 'BREAK');
        if (status === 'Found & Copied') {
          txtLines.push(`${itemIdx}. [${itemTypeHeader}] Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported ${isScript ? 'Script' : 'File'}: ${targetFileName}`);
          txtLines.push(`   Title: ${rawName}`);
          if (itemArtist) {
            txtLines.push(`   Artist: ${itemArtist}`);
          }
          if (itemAlbumArtist && (!itemArtist || itemAlbumArtist.toLowerCase() !== itemArtist.toLowerCase())) {
            txtLines.push(`   Album Artist: ${itemAlbumArtist}`);
          }
          if (itemAlbum) {
            txtLines.push(`   Album: ${itemAlbum}`);
          }
          txtLines.push(`   Source ${isScript ? 'Script' : 'File'}: ${sourceFileName || ''}`);
        } else {
          txtLines.push(`${itemIdx}. [${itemTypeHeader}] MISSING FILE - THIS FILE COULD NOT BE FOUND.`);
          txtLines.push(`   Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported ${isScript ? 'Script' : 'File'}: ${targetFileName}`);
          txtLines.push(`   Title: ${rawName}`);
          if (itemArtist) {
            txtLines.push(`   Artist: ${itemArtist}`);
          }
          if (itemAlbumArtist && (!itemArtist || itemAlbumArtist.toLowerCase() !== itemArtist.toLowerCase())) {
            txtLines.push(`   Album Artist: ${itemAlbumArtist}`);
          }
          if (itemAlbum) {
            txtLines.push(`   Album: ${itemAlbum}`);
          }
          txtLines.push(`   Source ${isScript ? 'Script' : 'File'}: ${sourceFileName || ''}`);
        }

        if (isScript && item.backupMp3Url) {
          txtLines.push(`   Alternate Backup MP3: ${backupTargetFileName} (${backupStatus || 'Not Found'})`);
          txtLines.push(`   Source Backup MP3: ${item.backupMp3Url}`);
        }

        txtLines.push('------------------------------------------------------------------------');
      }

      // Names for text file and playlist
      const txtBaseFilename = `${tPrefix} - Plan - ${dateStr} at ${timeStr} - ${durationStr}`;
      const m3uBaseFilename = `${pPrefix} - Playlist - ${dateStr} at ${timeStr} - ${durationStr}`;
      const txtFilePath = path.join(exportFolderPath, `${txtBaseFilename}.txt`);
      const m3uFilePath = path.join(exportFolderPath, `${m3uBaseFilename}.m3u`);

      // Write files
      fs.writeFileSync(txtFilePath, txtLines.join('\n'), 'utf-8');
      fs.writeFileSync(m3uFilePath, m3uLines.join('\n'), 'utf-8');

      res.json({
        success: true,
        exportFolderPath,
        exportFolderName,
        copiedCount,
        missingCount,
        totalCount: items.length,
        txtFilename: `${txtBaseFilename}.txt`,
        m3uFilename: `${m3uBaseFilename}.m3u`,
        report: fileReport
      });
    } catch (e: any) {
      console.error('Failed to export prerecord:', e);
      res.status(500).json({ error: 'Failed to export prerecord: ' + e.message });
    }
  });

  // API - Write custom files on localhost (Native desktop save file helper)
  app.post('/api/write-file', (req, res) => {
    try {
      const { filePath, content, isBinary } = req.body;
      if (!filePath) {
        return res.status(400).json({ error: 'filePath is required' });
      }

      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      if (isBinary) {
        const buffer = Buffer.from(content, 'base64');
        fs.writeFileSync(filePath, buffer);
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error('Failed to write file via API:', e);
      res.status(500).json({ error: 'Failed to write file: ' + e.message });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(__dirname, 'index.html'))
      ? __dirname
      : path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
  serverInstance.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Server] Port ${PORT} already in use. Existing process or shared port active.`);
    } else {
      console.error('[Server] Express server error:', err);
    }
  });
}

startServer();
