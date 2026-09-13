import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import NodeID3 from 'node-id3';
import { Announcement, LogEntry, Show } from './src/types';

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

// Global shared settings directory across all modes and version upgrades
const SETTINGS_DIR = IS_PORTABLE
  ? BASE_DIR
  : (process.env.APP_SETTINGS_DIR_PATH || BASE_DIR);

// Persist settings in the launch directory (portable) or application shared settings directory (installed/dev)
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'amp_settings.json');

// Guaranteed synchronous directory verification for fresh installations
try {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true, mode: 0o755 });
    console.log(`[Init] Successfully initialized base storage directory: ${BASE_DIR}`);
  }
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true, mode: 0o755 });
    console.log(`[Init] Successfully initialized shared settings directory: ${SETTINGS_DIR}`);
  }
} catch (dirInitErr) {
  console.error(`[Init Error] Failed to create storage directories:`, dirInitErr);
}

// Global server-side locations configuration
export interface LocationPathsOverride {
  logs?: string | null;
  loghistory?: string | null;
  settings?: string | null;
  media_announcements?: string | null;
  media_evergreens?: string | null;
  media_shows?: string | null;
  logsFile?: string | null;
  announcementsFile?: string | null;
  showsFile?: string | null;
}

interface ServerSettings {
  mode: 'Local' | 'Drive' | 'Demo';
  localPathAmp: string;
  driveFolderAmp?: string;
  paths?: LocationPathsOverride;
  localPathMP3s: string;
  localPathMediaAnnouncements?: string;
  localPathMediaEvergreens?: string;
  localPathMediaShows?: string;
  localPathLogs: string;
  localPathCalendar: string;
  driveFolderLogs: string;
  driveFolderMP3s: string;
  driveFolderPreferences: string;
  driveFolderAnnouncements?: string;
  driveFolderEvergreens?: string;
  driveFolderShows?: string;
}

let currentSettings: ServerSettings = {
  mode: 'Demo',
  localPathAmp: '',
  driveFolderAmp: '',
  paths: {
    logs: null,
    loghistory: null,
    settings: null,
    media_announcements: null,
    media_evergreens: null,
    media_shows: null,
    logsFile: null,
    announcementsFile: null,
    showsFile: null,
  },
  localPathMP3s: '',
  localPathLogs: '',
  localPathCalendar: '',
  driveFolderLogs: '',
  driveFolderMP3s: '',
  driveFolderPreferences: '',
  driveFolderAnnouncements: '',
  driveFolderEvergreens: '',
  driveFolderShows: '',
};

// Load settings from file on launch if available
try {
  if (fs.existsSync(SETTINGS_FILE)) {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    currentSettings = { ...currentSettings, ...JSON.parse(raw) };
    console.log('Loaded application folder settings from shared settings path:', currentSettings);
  }
} catch (e) {
  console.log('Started with default settings configuration');
}

// Unified path resolution helpers for strict 5-folder AMP structure:
// Logs, Settings, MediaAnnouncements, MediaEvergreens, MediaShows
function getAmpLogsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.logs && fs.existsSync(settings.paths.logs)) {
    return settings.paths.logs;
  }
  if (settings.localPathLogs && fs.existsSync(settings.localPathLogs)) {
    return settings.localPathLogs;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'logs');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'Logs');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  return null;
}

function getAmpLogHistoryDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.loghistory && fs.existsSync(settings.paths.loghistory)) {
    return settings.paths.loghistory;
  }
  const logsDir = getAmpLogsDir(settings);
  if (logsDir && fs.existsSync(logsDir)) {
    const p1 = path.join(logsDir, 'loghistory');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(logsDir, 'LogHistory');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'LogHistory');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'loghistory');
    if (fs.existsSync(p2)) return p2;
  }
  return null;
}

function getAmpSettingsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.settings && fs.existsSync(settings.paths.settings)) {
    return settings.paths.settings;
  }
  if (settings.localPathCalendar && fs.existsSync(settings.localPathCalendar)) {
    return settings.localPathCalendar;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'settings');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'Settings');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  return null;
}

function getAmpMediaAnnouncementsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.media_announcements && fs.existsSync(settings.paths.media_announcements)) {
    return settings.paths.media_announcements;
  }
  const announceOverride = settings.localPathMediaAnnouncements || settings.localPathMP3s;
  if (announceOverride && fs.existsSync(announceOverride)) {
    return announceOverride;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'media_announcements');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'MediaAnnouncements');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  return null;
}

function getAmpMediaEvergreensDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.media_evergreens && fs.existsSync(settings.paths.media_evergreens)) {
    return settings.paths.media_evergreens;
  }
  if (settings.localPathMediaEvergreens && fs.existsSync(settings.localPathMediaEvergreens)) {
    return settings.localPathMediaEvergreens;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'media_evergreens');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'MediaEvergreens');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  return null;
}

function getAmpMediaShowsDir(settings: ServerSettings = currentSettings): string | null {
  if (settings.paths?.media_shows && fs.existsSync(settings.paths.media_shows)) {
    return settings.paths.media_shows;
  }
  if (settings.localPathMediaShows && fs.existsSync(settings.localPathMediaShows)) {
    return settings.localPathMediaShows;
  }
  if (settings.localPathAmp && fs.existsSync(settings.localPathAmp)) {
    const p1 = path.join(settings.localPathAmp, 'media_shows');
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(settings.localPathAmp, 'MediaShows');
    if (fs.existsSync(p2)) return p2;
    return p1;
  }
  return null;
}

function getCalendarFilePath(): string | null {
  // 1. Explicit file override
  if (currentSettings.paths?.announcementsFile && fs.existsSync(currentSettings.paths.announcementsFile)) {
    return currentSettings.paths.announcementsFile;
  }
  // 2. Settings directory (unified localPathAmp or legacy localPathCalendar)
  const settingsDir = getAmpSettingsDir();
  if (settingsDir && fs.existsSync(settingsDir)) {
    let targetFile = path.join(settingsDir, 'announcements.json');
    if (!fs.existsSync(targetFile)) {
      const capFile = path.join(settingsDir, 'Announcements.json');
      if (fs.existsSync(capFile)) {
        return capFile;
      }
      // Check potential migration locations
      const subFolderFile = path.join(settingsDir, 'Announcements', 'announcements.json');
      const mediaDir = getAmpMediaAnnouncementsDir();
      const mediaSubFolderFile = mediaDir && fs.existsSync(mediaDir)
        ? path.join(mediaDir, 'announcements.json')
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
  if (currentSettings.paths?.logsFile && fs.existsSync(currentSettings.paths.logsFile)) {
    return currentSettings.paths.logsFile;
  }
  const logsDir = getAmpLogsDir();
  if (logsDir && fs.existsSync(logsDir)) {
    const defaultPath = path.join(logsDir, 'logs.json');
    if (fs.existsSync(defaultPath)) return defaultPath;
    const capPath = path.join(logsDir, 'Logs.json');
    if (fs.existsSync(capPath)) return capPath;
    return defaultPath;
  }
  return null;
}

function getLogBackupPath(): string | null {
  const logsDir = getAmpLogsDir();
  if (logsDir && fs.existsSync(logsDir)) {
    const historyPath = path.join(logsDir, 'loghistory', 'logs_backup.json');
    if (fs.existsSync(historyPath)) return historyPath;
    const backupPath = path.join(logsDir, 'backups', 'logs_backup.json');
    if (fs.existsSync(backupPath)) return backupPath;
    return historyPath;
  }
  return null;
}

function getCalendarBackupPath(): string | null {
  const settingsDir = getAmpSettingsDir();
  if (settingsDir && fs.existsSync(settingsDir)) {
    return path.join(settingsDir, 'backups', 'announcements_backup.json');
  }
  return null;
}

function getShowsFilePath(): string | null {
  if (currentSettings.paths?.showsFile && fs.existsSync(currentSettings.paths.showsFile)) {
    return currentSettings.paths.showsFile;
  }
  const settingsDir = getAmpSettingsDir();
  if (settingsDir && fs.existsSync(settingsDir)) {
    const defaultPath = path.join(settingsDir, 'shows.json');
    if (fs.existsSync(defaultPath)) return defaultPath;
    const capPath = path.join(settingsDir, 'Shows.json');
    if (fs.existsSync(capPath)) return capPath;
    return defaultPath;
  }
  return null;
}

function getShowsBackupPath(): string | null {
  const settingsDir = getAmpSettingsDir();
  if (settingsDir && fs.existsSync(settingsDir)) {
    return path.join(settingsDir, 'backups', 'shows_backup.json');
  }
  return null;
}

/**
 * Generates a collision-resistant, lexicographically sortable backup filename:
 * [type]_backup_[YYYYMMDD]_[HHmmss]_[MODE]_[salt].json
 * where [MODE] is 'LIVE', 'STUDIO', or 'ADMIN'
 */
function generateBackupFilename(type: 'logs' | 'announcements' | 'shows', workstationMode?: string): string {
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

// Detect if running inside actual Electron main/renderer process
let electronDialog: any = null;
if (process.versions && process.versions.electron) {
  try {
    const electron = require('electron');
    if (electron && electron.dialog) {
      electronDialog = electron.dialog;
    }
  } catch (e) {
    // Graceful fallback outside Electron desktop application environment
  }
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

  // Consolidated Startup Verification & Path Auto-Provisioning Gate
  const handleStartupVerify = (req: express.Request, res: express.Response) => {
    try {
      const settings = { ...currentSettings, ...(req.body || {}) };
      const effectiveMode = settings.mode || 'Local';

      // Cloud / Demo modes bypass local path validation
      if (effectiveMode === 'Drive' || effectiveMode === 'Demo') {
        return res.json({ ready: true, status: 'READY', mode: effectiveMode });
      }

      // --- STRATEGY 1: Unified AMP Station Location ---
      const ampRoot = settings.localPathAmp || '';
      if (ampRoot) {
        if (!fs.existsSync(ampRoot)) {
          return res.json({
            ready: false,
            status: 'INACCESSIBLE',
            message: `AMP Station Location folder could not be accessed at: ${ampRoot}`,
            missingFolders: {
              amp: true
            }
          });
        }

        // Standard 5-folder subdirectories
        const logsDir = getAmpLogsDir(settings) || path.join(ampRoot, 'logs');
        const logHistoryDir = getAmpLogHistoryDir(settings) || path.join(logsDir, 'loghistory');
        const settingsDir = getAmpSettingsDir(settings) || path.join(ampRoot, 'settings');
        const settingsBackupsDir = path.join(settingsDir, 'backups');
        const mediaAnnounceDir = getAmpMediaAnnouncementsDir(settings) || path.join(ampRoot, 'media_announcements');
        const mediaEvergreensDir = getAmpMediaEvergreensDir(settings) || path.join(ampRoot, 'media_evergreens');
        const mediaShowsDir = getAmpMediaShowsDir(settings) || path.join(ampRoot, 'media_shows');

        const dirsToEnsure = [
          logsDir,
          logHistoryDir,
          settingsDir,
          settingsBackupsDir,
          mediaAnnounceDir,
          mediaEvergreensDir,
          mediaShowsDir
        ];

        const createMissing = req.body?.createMissing === true || req.path === '/api/create-local-paths';

        if (createMissing) {
          // Auto-create missing subdirectories
          dirsToEnsure.forEach(dir => {
            if (!fs.existsSync(dir)) {
              try {
                fs.mkdirSync(dir, { recursive: true });
              } catch (err) {
                console.error(`Error ensuring directory ${dir}:`, err);
              }
            }
          });

          // Atomic auto-seeding of missing database stores
          const logsFile = settings.paths?.logsFile || path.join(logsDir, 'logs.json');
          const announcementsFile = settings.paths?.announcementsFile || path.join(settingsDir, 'announcements.json');
          const showsFile = settings.paths?.showsFile || path.join(settingsDir, 'shows.json');

          if (!fs.existsSync(logsFile)) {
            atomicWriteFileSync(logsFile, JSON.stringify({ LogsBackupCounter: 0, data: [] }, null, 2));
          }

          if (!fs.existsSync(announcementsFile)) {
            atomicWriteFileSync(announcementsFile, JSON.stringify({ AnnouncementsBackupCounter: 0, data: [] }, null, 2));
          }

          if (!fs.existsSync(showsFile)) {
            atomicWriteFileSync(showsFile, JSON.stringify({ ShowsBackupCounter: 0, data: [] }, null, 2));
          }
        }

        return res.json({
          ready: true,
          status: 'READY',
          message: 'AMP Station Location and 5-folder structure verified successfully.'
        });
      }

      // --- STRATEGY 2: Individual 5-Folder Path Overrides ---
      const settingsDir = getAmpSettingsDir(settings);
      const logsDir = getAmpLogsDir(settings);
      const mediaAnnounceDir = getAmpMediaAnnouncementsDir(settings);
      const mediaEvergreensDir = getAmpMediaEvergreensDir(settings);
      const mediaShowsDir = getAmpMediaShowsDir(settings);

      if (!settingsDir && !logsDir && !mediaAnnounceDir && !mediaEvergreensDir && !mediaShowsDir) {
        return res.json({
          ready: false,
          status: 'NOT_DEFINED',
          message: 'AMP Station Location or folder definitions are missing.',
          missingDefinitions: {
            amp: true,
            settings: !settingsDir,
            logs: !logsDir,
            media_announcements: !mediaAnnounceDir,
            media_evergreens: !mediaEvergreensDir,
            media_shows: !mediaShowsDir
          }
        });
      }

      const missingFolders: Record<string, boolean> = {};
      if (settingsDir && !fs.existsSync(settingsDir)) missingFolders.settings = true;
      if (logsDir && !fs.existsSync(logsDir)) missingFolders.logs = true;
      if (mediaAnnounceDir && !fs.existsSync(mediaAnnounceDir)) missingFolders.media_announcements = true;
      if (mediaEvergreensDir && !fs.existsSync(mediaEvergreensDir)) missingFolders.media_evergreens = true;
      if (mediaShowsDir && !fs.existsSync(mediaShowsDir)) missingFolders.media_shows = true;

      const createMissing = req.body?.createMissing === true || req.path === '/api/create-local-paths';

      if (Object.keys(missingFolders).length > 0) {
        if (createMissing) {
          if (settingsDir && !fs.existsSync(settingsDir)) {
            try { fs.mkdirSync(settingsDir, { recursive: true }); } catch (e) {}
          }
          if (logsDir && !fs.existsSync(logsDir)) {
            try { fs.mkdirSync(logsDir, { recursive: true }); } catch (e) {}
          }
          if (mediaAnnounceDir && !fs.existsSync(mediaAnnounceDir)) {
            try { fs.mkdirSync(mediaAnnounceDir, { recursive: true }); } catch (e) {}
          }
          if (mediaEvergreensDir && !fs.existsSync(mediaEvergreensDir)) {
            try { fs.mkdirSync(mediaEvergreensDir, { recursive: true }); } catch (e) {}
          }
          if (mediaShowsDir && !fs.existsSync(mediaShowsDir)) {
            try { fs.mkdirSync(mediaShowsDir, { recursive: true }); } catch (e) {}
          }
        } else {
          return res.json({
            ready: false,
            status: 'INACCESSIBLE',
            message: 'Configured folders could not be accessed on the local filesystem.',
            missingFolders
          });
        }
      }

      // Ensure backup directories and data stores in configured locations if createMissing is true
      if (createMissing) {
        if (settingsDir && fs.existsSync(settingsDir)) {
          const backupsDir = path.join(settingsDir, 'backups');
          if (!fs.existsSync(backupsDir)) {
            try { fs.mkdirSync(backupsDir, { recursive: true }); } catch (e) {}
          }
          const announcementsFile = settings.paths?.announcementsFile || path.join(settingsDir, 'announcements.json');
          if (!fs.existsSync(announcementsFile)) {
            atomicWriteFileSync(announcementsFile, JSON.stringify({ AnnouncementsBackupCounter: 0, data: [] }, null, 2));
          }
          const showsFile = settings.paths?.showsFile || path.join(settingsDir, 'shows.json');
          if (!fs.existsSync(showsFile)) {
            atomicWriteFileSync(showsFile, JSON.stringify({ ShowsBackupCounter: 0, data: [] }, null, 2));
          }
        }

        if (logsDir && fs.existsSync(logsDir)) {
          const logHistoryDir = getAmpLogHistoryDir(settings) || path.join(logsDir, 'loghistory');
          if (!fs.existsSync(logHistoryDir)) {
            try { fs.mkdirSync(logHistoryDir, { recursive: true }); } catch (e) {}
          }
          const logsFile = settings.paths?.logsFile || path.join(logsDir, 'logs.json');
          if (!fs.existsSync(logsFile)) {
            atomicWriteFileSync(logsFile, JSON.stringify({ LogsBackupCounter: 0, data: [] }, null, 2));
          }
        }
      }

      return res.json({
        ready: true,
        status: 'READY',
        message: 'Configured 5-folder AMP structure verified successfully.'
      });
    } catch (e: any) {
      console.error('Verify startup check failed:', e);
      return res.status(500).json({ ready: false, status: 'ERROR', message: e?.message || 'Verification error' });
    }
  };

  app.post('/api/startup/verify', handleStartupVerify);
  app.post('/api/check-local-paths', handleStartupVerify);
  app.post('/api/create-local-paths', handleStartupVerify);

  // Pre-flight check for missing folders/files before saving
  app.post('/api/check-missing-items', (req, res) => {
    try {
      const settings = { ...currentSettings, ...(req.body || {}) };
      const missingItems: string[] = [];

      const ampRoot = settings.localPathAmp || '';
      const targetFolderDesc = ampRoot || 'configured folder locations';

      const logsDir = settings.localPathLogs || (ampRoot ? path.join(ampRoot, 'logs') : '');
      const settingsDir = settings.localPathCalendar || (ampRoot ? path.join(ampRoot, 'settings') : '');
      const mediaAnnounceDir = settings.localPathMediaAnnouncements || settings.localPathMP3s || (ampRoot ? path.join(ampRoot, 'media_announcements') : '');
      const mediaEvergreensDir = settings.localPathMediaEvergreens || (ampRoot ? path.join(ampRoot, 'media_evergreens') : '');
      const mediaShowsDir = settings.localPathMediaShows || (ampRoot ? path.join(ampRoot, 'media_shows') : '');

      if (ampRoot && !fs.existsSync(ampRoot)) {
        missingItems.push('AMP folder');
      }

      if (settingsDir) {
        if (!fs.existsSync(settingsDir)) {
          missingItems.push('settings folder');
        } else {
          const announcementsFile = settings.paths?.announcementsFile || path.join(settingsDir, 'announcements.json');
          if (!fs.existsSync(announcementsFile)) {
            missingItems.push('announcements.json');
          }
          const showsFile = settings.paths?.showsFile || path.join(settingsDir, 'shows.json');
          if (!fs.existsSync(showsFile)) {
            missingItems.push('shows.json');
          }
        }
      }

      if (logsDir) {
        if (!fs.existsSync(logsDir)) {
          missingItems.push('logs folder');
        } else {
          const logsFile = settings.paths?.logsFile || path.join(logsDir, 'logs.json');
          if (!fs.existsSync(logsFile)) {
            missingItems.push('logs.json');
          }
        }
      }

      if (mediaAnnounceDir && !fs.existsSync(mediaAnnounceDir)) {
        missingItems.push('media_announcements folder');
      }
      if (mediaEvergreensDir && !fs.existsSync(mediaEvergreensDir)) {
        missingItems.push('media_evergreens folder');
      }
      if (mediaShowsDir && !fs.existsSync(mediaShowsDir)) {
        missingItems.push('media_shows folder');
      }

      return res.json({
        hasMissing: missingItems.length > 0,
        missingItems,
        targetFolderDesc
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
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
      const targetDir = getAmpMediaAnnouncementsDir(currentSettings);
      if (!targetDir || !fs.existsSync(targetDir)) {
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
      console.error('Failed to read local announcements directory:', e);
      res.status(500).json([]);
    }
  });

  // Universal Media File Path Resolution Engine
  function resolveMediaFilePath(query: any): string | null {
    const file = (query.path || query.file) as string;
    const showNameShort = (query.showNameShort || '') as string;
    const showName = (query.showName || '') as string;
    const folderType = (query.folderType || 'Playlists') as string;

    if (!file && !showNameShort && !showName) return null;

    // 1. Direct absolute path check
    if (file && path.isAbsolute(file) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return file;
    }

    // 2. Specific show playlist or evergreen subfolder lookup
    if (showNameShort || showName) {
      const primaryDir = folderType === 'Evergreens'
        ? getAmpMediaEvergreensDir(currentSettings)
        : getAmpMediaShowsDir(currentSettings);
      const secondaryDir = folderType === 'Evergreens'
        ? getAmpMediaShowsDir(currentSettings)
        : getAmpMediaEvergreensDir(currentSettings);

      for (const baseDir of [primaryDir, secondaryDir]) {
        if (baseDir && fs.existsSync(baseDir)) {
          const showFolderPath = findShowPlaylistFolder(baseDir, showNameShort, showName);
          if (showFolderPath && fs.existsSync(showFolderPath)) {
            if (file) {
              const cleanFileName = path.basename(file);
              const directTarget = path.join(showFolderPath, cleanFileName);
              if (fs.existsSync(directTarget) && fs.statSync(directTarget).isFile()) {
                return directTarget;
              }
              const { audioFiles } = getAllAudioAndPlaylistFiles(showFolderPath);
              const matched = audioFiles.find(a => a.name === cleanFileName || a.relPath === file);
              if (matched && fs.existsSync(matched.fullPath) && fs.statSync(matched.fullPath).isFile()) {
                return matched.fullPath;
              }
            }
          }
        }
      }
    }

    // 3. Check Media Announcements (media_announcements)
    const mediaAnnounce = getAmpMediaAnnouncementsDir(currentSettings);
    if (mediaAnnounce && fs.existsSync(mediaAnnounce) && file) {
      const p = path.join(mediaAnnounce, path.basename(file));
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      const resolved = findAnnouncementSourceFile(mediaAnnounce, file);
      if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    }

    // 4. Check Media Evergreens (media_evergreens)
    const mediaEvergreens = getAmpMediaEvergreensDir(currentSettings);
    if (mediaEvergreens && fs.existsSync(mediaEvergreens) && file) {
      const p = path.join(mediaEvergreens, file);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      const resolved = findEvergreenSourceFile(mediaEvergreens, file, showNameShort, showName);
      if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    }

    // 5. Check Media Shows (media_shows)
    const mediaShows = getAmpMediaShowsDir(currentSettings);
    if (mediaShows && fs.existsSync(mediaShows) && file) {
      const p = path.join(mediaShows, file);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      const resolved = findShowSourceFile(mediaShows, file, showNameShort, showName) || findAnnouncementSourceFile(mediaShows, file);
      if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    }

    // 6. Check relative to unified AMP station root
    if (currentSettings.localPathAmp && fs.existsSync(currentSettings.localPathAmp) && file) {
      const directAmpRel = path.join(currentSettings.localPathAmp, file);
      if (fs.existsSync(directAmpRel) && fs.statSync(directAmpRel).isFile()) {
        return directAmpRel;
      }
    }

    return null;
  }

  // Universal HTTP 206 Partial Content Streaming Engine
  function streamMediaFile(req: express.Request, res: express.Response) {
    try {
      const targetFilePath = resolveMediaFilePath(req.query);
      if (!targetFilePath || !fs.existsSync(targetFilePath) || !fs.statSync(targetFilePath).isFile()) {
        return res.status(404).send('Media file not found');
      }

      const stat = fs.statSync(targetFilePath);
      const fileSize = stat.size;
      const ext = path.extname(targetFilePath).toLowerCase();

      const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
        '.txt': 'text/plain; charset=utf-8',
        '.pdf': 'application/pdf',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      const range = req.headers.range;
      if (range) {
        // Parse byte range (e.g. "bytes=1048576-2097151")
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
          res.status(416).set({
            'Content-Range': `bytes */${fileSize}`,
            'Accept-Ranges': 'bytes'
          }).end();
          return;
        }

        const chunkSize = (end - start) + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
        });

        const fileStream = fs.createReadStream(targetFilePath, { start, end });
        fileStream.on('error', (err) => {
          if (!res.headersSent) {
            res.status(500).send('Streaming error');
          }
        });
        res.on('close', () => {
          fileStream.destroy();
        });
        fileStream.pipe(res);
      } else {
        // Standard HTTP 200 full stream
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
        });

        const fileStream = fs.createReadStream(targetFilePath);
        fileStream.on('error', (err) => {
          if (!res.headersSent) {
            res.status(500).send('Streaming error');
          }
        });
        res.on('close', () => {
          fileStream.destroy();
        });
        fileStream.pipe(res);
      }
    } catch (e: any) {
      if (!res.headersSent) {
        res.status(500).send(e.message || 'Streaming failed');
      }
    }
  }

  // Unified route registrations
  app.get('/api/media/stream', streamMediaFile);
  app.get('/api/shows/playlist/stream-file', streamMediaFile);

  // API - Get live-read script/image content
  app.get('/api/live-read/content', (req, res) => {
    try {
      const file = req.query.file as string;
      if (!file) return res.status(400).json({ error: 'Filename required' });

      const announcementsDir = getAmpMediaAnnouncementsDir(currentSettings);

      let targetFilePath = file;
      if (!fs.existsSync(targetFilePath)) {
        if (!announcementsDir || !fs.existsSync(announcementsDir)) {
          return res.status(404).json({ error: 'Media Announcements folder not defined or offline' });
        }
        targetFilePath = path.join(announcementsDir, path.basename(file));
        if (!fs.existsSync(targetFilePath)) {
          const resolved = findAnnouncementSourceFile(announcementsDir, file);
          if (resolved && fs.existsSync(resolved)) {
            targetFilePath = resolved;
          }
        }
      }

      if (!fs.existsSync(targetFilePath)) {
        return res.status(404).json({ error: 'File not found in Media Announcements directory' });
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

  // API - Announcement
  app.get('/api/announcements', (req, res) => {
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

  app.post('/api/announcements', (req, res) => {
    try {
      const filePath = getCalendarFilePath();
      if (!filePath) {
        return res.status(400).json({ success: false, error: 'Calendar directory is not configured' });
      }
      const schedules: Announcement[] = req.body;
      let counter = 0;
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        try {
          const parsed = JSON.parse(data || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            counter = parsed.AnnouncementsBackupCounter || 0;
          }
        } catch (pe) {}
      }
      counter += 1; // Increment on every backup / save operation
      const updatedObj = { AnnouncementsBackupCounter: counter, data: schedules };
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

  // API - Verify Evergreen, Show Playlist, and Announcement folders
  app.post('/api/shows/verify-evergreens', (req, res) => {
    try {
      let evergreensPath = getAmpMediaEvergreensDir(currentSettings);
      let playlistsPath = getAmpMediaShowsDir(currentSettings);
      let announcementsPath = getAmpMediaAnnouncementsDir(currentSettings);

      if (!evergreensPath && currentSettings.localPathAmp) {
        evergreensPath = path.join(currentSettings.localPathAmp, 'media_evergreens');
      }
      if (!playlistsPath && currentSettings.localPathAmp) {
        playlistsPath = path.join(currentSettings.localPathAmp, 'media_shows');
      }
      if (!announcementsPath && currentSettings.localPathAmp) {
        announcementsPath = path.join(currentSettings.localPathAmp, 'media_announcements');
      }

      if (!evergreensPath || !playlistsPath || !announcementsPath) {
        return res.status(400).json({ error: 'Media directories are not defined or offline. Please configure AMP Station Location or Media paths in Settings.' });
      }

      let evergreensFolderCreated = false;
      if (!fs.existsSync(evergreensPath)) {
        fs.mkdirSync(evergreensPath, { recursive: true });
        evergreensFolderCreated = true;
      }

      let playlistsFolderCreated = false;
      if (!fs.existsSync(playlistsPath)) {
        fs.mkdirSync(playlistsPath, { recursive: true });
        playlistsFolderCreated = true;
      }

      let announcementsFolderCreated = false;
      let announcementsReadonlyError = false;
      let announcementsReadonlyMessage = '';

      if (!fs.existsSync(announcementsPath)) {
        try {
          fs.mkdirSync(announcementsPath, { recursive: true });
          announcementsFolderCreated = true;
        } catch (mkErr: any) {
          console.error('Failed to create media_announcements folder in media directory:', mkErr);
          announcementsReadonlyError = true;
          announcementsReadonlyMessage = "The 'media_announcements' folder does not exist in your Media folder and could not be created because the directory is read-only. Administrator assistance is required to set folder permissions or create the 'media_announcements' folder manually.";
        }
      }

      const showsFilePath = getShowsFilePath();
      let shows: any[] = [];
      if (showsFilePath && fs.existsSync(showsFilePath)) {
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
        announcementsFolderCreated,
        announcementsReadonlyError,
        announcementsReadonlyMessage,
        evergreensPath,
        playlistsPath,
        announcementsPath,
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
      const evergreensPath = getAmpMediaEvergreensDir(currentSettings);
      const playlistsPath = getAmpMediaShowsDir(currentSettings);

      if (!evergreensPath && !playlistsPath) {
        return res.status(400).json({ error: 'Media Directories are not defined or are offline.' });
      }

      const oldEvergreenExists = (oldNameShort && evergreensPath && fs.existsSync(evergreensPath)) ? fs.existsSync(path.join(evergreensPath, oldNameShort)) : false;
      const oldPlaylistExists = (oldNameShort && playlistsPath && fs.existsSync(playlistsPath)) ? fs.existsSync(path.join(playlistsPath, oldNameShort)) : false;
      const oldExists = oldEvergreenExists || oldPlaylistExists;

      const newEvergreenExists = (newNameShort && evergreensPath && fs.existsSync(evergreensPath)) ? fs.existsSync(path.join(evergreensPath, newNameShort)) : false;
      const newPlaylistExists = (newNameShort && playlistsPath && fs.existsSync(playlistsPath)) ? fs.existsSync(path.join(playlistsPath, newNameShort)) : false;
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

    const baseDir = folderType === 'Evergreens'
      ? getAmpMediaEvergreensDir(currentSettings)
      : getAmpMediaShowsDir(currentSettings);
    const secondaryDir = folderType === 'Evergreens'
      ? getAmpMediaShowsDir(currentSettings)
      : getAmpMediaEvergreensDir(currentSettings);

    let showFolderPath = baseDir ? findShowPlaylistFolder(baseDir, showNameShort, showName) : null;
    if (!showFolderPath && secondaryDir) {
      showFolderPath = findShowPlaylistFolder(secondaryDir, showNameShort, showName);
    }

    if (!showFolderPath || !fs.existsSync(showFolderPath)) {
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
        streamUrl: `/api/media/stream?file=${encodeURIComponent(t.fileName)}&showNameShort=${encodeURIComponent(showNameShort)}&showName=${encodeURIComponent(showName)}&folderType=${folderType}&path=${encodeURIComponent(filePath)}`,
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
      const file = (req.query.file || req.query.path) as string;

      if (!showNameShort && !showName && !file) {
        return res.status(400).json({ error: 'Missing parameters' });
      }

      const targetFilePath = resolveMediaFilePath(req.query);

      if (targetFilePath && fs.existsSync(targetFilePath) && fs.statSync(targetFilePath).isFile()) {
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

      const showsPath = getAmpMediaShowsDir(currentSettings);
      const evergreensPath = getAmpMediaEvergreensDir(currentSettings);
      if (!showsPath && !evergreensPath) {
        return res.json({ success: true, currentShowFileCount: 0, nextShowFileCount: 0 });
      }

      const getShowCount = async (shortName?: string, name?: string) => {
        if (!shortName && !name) return 0;
        let showFolderPath = showsPath ? findShowPlaylistFolder(showsPath, shortName, name) : null;
        if (!showFolderPath && evergreensPath) {
          showFolderPath = findShowPlaylistFolder(evergreensPath, shortName, name);
        }
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

  // API - Apply Evergreen & Playlist folder creation or renaming
  app.post('/api/shows/evergreen/apply-change', (req, res) => {
    try {
      const { action, nameShort, oldNameShort, renameFolder } = req.body;
      let evergreensPath = getAmpMediaEvergreensDir(currentSettings);
      let playlistsPath = getAmpMediaShowsDir(currentSettings);

      if (!evergreensPath && currentSettings.localPathAmp) {
        evergreensPath = path.join(currentSettings.localPathAmp, 'media_evergreens');
      }
      if (!playlistsPath && currentSettings.localPathAmp) {
        playlistsPath = path.join(currentSettings.localPathAmp, 'media_shows');
      }

      if (!evergreensPath || !playlistsPath) {
        return res.status(400).json({ error: 'Media directories are not defined or are offline.' });
      }

      if (!fs.existsSync(evergreensPath)) {
        fs.mkdirSync(evergreensPath, { recursive: true });
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

      let showFolderPath: string | null = null;
      const mediaDir = folderType === 'Evergreens'
        ? getAmpMediaEvergreensDir(currentSettings)
        : getAmpMediaShowsDir(currentSettings);

      if (mediaDir && fs.existsSync(mediaDir)) {
        const searchKey = showNameShort || showName;
        showFolderPath = findShowPlaylistFolder(mediaDir, showNameShort, showName);
        if (!showFolderPath) {
          showFolderPath = path.join(mediaDir, String(searchKey).replace(/[\/\\?%*:|"<>]/g, '_'));
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

      // Backup to LogHistory directory
      const logHistoryDir = getAmpLogHistoryDir(currentSettings);
      if (logHistoryDir && fs.existsSync(logHistoryDir)) {
        fs.writeFileSync(path.join(logHistoryDir, logFileName), JSON.stringify(logData, null, 2), 'utf-8');
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

      let foundData: any = null;
      const mediaDir = folderType === 'Evergreens'
        ? getAmpMediaEvergreensDir(currentSettings)
        : getAmpMediaShowsDir(currentSettings);
      const fallbackMediaDir = folderType === 'Evergreens'
        ? getAmpMediaShowsDir(currentSettings)
        : getAmpMediaEvergreensDir(currentSettings);

      for (const mDir of [mediaDir, fallbackMediaDir]) {
        if (mDir && fs.existsSync(mDir)) {
          const showFolderPath = findShowPlaylistFolder(mDir, showNameShort, showName);
          if (showFolderPath) {
            const matchedFilePath = findFileInDir(showFolderPath, logFileName);
            if (matchedFilePath) {
              const raw = fs.readFileSync(matchedFilePath, 'utf-8');
              foundData = JSON.parse(raw);
              break;
            }
          }
        }
      }

      if (!foundData) {
        const logHistoryDir = getAmpLogHistoryDir(currentSettings);
        if (logHistoryDir && fs.existsSync(logHistoryDir)) {
          const backupFilePath = findFileInDir(logHistoryDir, logFileName);
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

      // Try electron shell.openPath if running in Electron environment
      if (process.versions && process.versions.electron) {
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
          fs.writeFileSync(calendarPath, JSON.stringify({ AnnouncementsBackupCounter: 0, data: [] }, null, 2));
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
          let currentCounter = Array.isArray(parsed) ? 1 : ((parsed.AnnouncementsBackupCounter || 0) + 1);

          const updatedObj = {
            AnnouncementsBackupCounter: currentCounter,
            data: arrayData
          };

          const updatedStr = JSON.stringify(updatedObj, null, 2);
          fs.writeFileSync(calendarPath, updatedStr);

          const backupFileName = generateBackupFilename('announcements', req.body?.workstationMode);

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

  // Helper to locate Evergreen track source file strictly inside Media Evergreens directory
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

    const evergreensRoot = fs.existsSync(path.join(folderPath, 'media_evergreens'))
      ? path.join(folderPath, 'media_evergreens')
      : (fs.existsSync(path.join(folderPath, 'MediaEvergreens')) ? path.join(folderPath, 'MediaEvergreens') : folderPath);
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

  // Helper to locate Show track / playlist source file strictly inside Media Shows directory
  function findShowSourceFile(folderPath: string, fileName: string, showNameShort?: string, showName?: string): string | null {
    if (!fileName) return null;
    if (fs.existsSync(fileName)) return fileName;

    let cleanName = fileName;
    if (cleanName.includes('/api/media/stream')) {
      const parts = cleanName.split(/(?:file|path)=/);
      if (parts.length > 1) {
        cleanName = decodeURIComponent(parts[1].split('&')[0]);
      }
    }

    const showsRoot = fs.existsSync(path.join(folderPath, 'media_shows'))
      ? path.join(folderPath, 'media_shows')
      : (fs.existsSync(path.join(folderPath, 'MediaShows')) ? path.join(folderPath, 'MediaShows') : folderPath);
    const baseName = path.basename(cleanName);

    // 1. Check inside show folder if resolved
    const showFolder = findShowPlaylistFolder(showsRoot, showNameShort, showName);
    if (showFolder) {
      const candidate = path.join(showFolder, baseName);
      if (fs.existsSync(candidate)) return candidate;
    }

    // 2. Search Shows root and subfolders inside Shows
    if (fs.existsSync(showsRoot)) {
      const candidateRoot = path.join(showsRoot, baseName);
      if (fs.existsSync(candidateRoot)) return candidateRoot;

      try {
        const entries = fs.readdirSync(showsRoot);
        for (const entry of entries) {
          const fullPath = path.join(showsRoot, entry);
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

  // Helper to locate Announcement / Announcement source file strictly inside Media Announcements
  function findAnnouncementSourceFile(folderPath: string, fileName: string): string | null {
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
    const announcementsRoot = fs.existsSync(path.join(folderPath, 'media_announcements'))
      ? path.join(folderPath, 'media_announcements')
      : (fs.existsSync(path.join(folderPath, 'MediaAnnouncements')) ? path.join(folderPath, 'MediaAnnouncements') : folderPath);

    // 1. Check directly in announcementsRoot
    const candidateDirect = path.join(announcementsRoot, baseName);
    if (fs.existsSync(candidateDirect)) return candidateDirect;

    // 2. Search recursively inside all subdirectories of announcementsRoot
    try {
      if (fs.existsSync(announcementsRoot)) {
        const entries = fs.readdirSync(announcementsRoot);
        for (const entry of entries) {
          const fullPath = path.join(announcementsRoot, entry);
          if (fs.statSync(fullPath).isDirectory()) {
            const candidate = path.join(fullPath, baseName);
            if (fs.existsSync(candidate)) return candidate;
          } else if (entry.toLowerCase() === baseName.toLowerCase()) {
            return fullPath;
          }
        }
      }
    } catch (e) {}

    // 3. Fallback check directly in folderPath
    const candidateOrig = path.join(folderPath, baseName);
    if (fs.existsSync(candidateOrig)) return candidateOrig;

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

  function formatExportTimeAmPm(hoursInput: number | string, minutesInput: number | string = 0): string {
    let h = typeof hoursInput === 'string' ? parseInt(hoursInput, 10) : Math.floor(hoursInput);
    let m = typeof minutesInput === 'string' ? parseInt(minutesInput, 10) : Math.floor(minutesInput);
    if (isNaN(h)) h = 0;
    if (isNaN(m)) m = 0;
    h = Math.max(0, Math.min(23, h));
    m = Math.max(0, Math.min(59, m));

    const ampm = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;

    const hStr = h12.toString().padStart(2, '0');
    const mStr = m.toString().padStart(2, '0');
    return `${hStr}-${mStr} ${ampm}`;
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
    const timeStr = formatExportTimeAmPm(parsedDate.getHours(), parsedDate.getMinutes());

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

      const defaultDest = getAmpMediaShowsDir(currentSettings) || (currentSettings.localPathAmp ? path.join(currentSettings.localPathAmp, 'media_shows') : null);
      const destParentFolder = (exportDestination && exportDestination.trim()) || defaultDest;
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

      const defaultDest = getAmpMediaShowsDir(currentSettings) || (currentSettings.localPathAmp ? path.join(currentSettings.localPathAmp, 'media_shows') : null);
      const destParentFolder = (exportDestination && exportDestination.trim()) || defaultDest;
      if (!destParentFolder) {
        return res.status(400).json({ error: 'Export destination folder or Media folder is not defined' });
      }
      if (!fs.existsSync(destParentFolder)) {
        fs.mkdirSync(destParentFolder, { recursive: true });
      }

      const evergreensFolder = getAmpMediaEvergreensDir(currentSettings);
      const announcementsFolder = getAmpMediaAnnouncementsDir(currentSettings);
      const showsFolder = getAmpMediaShowsDir(currentSettings);

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
        let safeSlotTime = '00-00 AM';
        if (typeof itemSlotTime === 'string') {
          const parts = itemSlotTime.split(':');
          if (parts.length >= 2) {
            safeSlotTime = formatExportTimeAmPm(parts[0], parts[1]);
          } else {
            safeSlotTime = itemSlotTime.replace(/:/g, '-');
          }
        }
        
        const isScript = item.assetType === 'script';
        const rawName = item.announcementName || (item.isEvergreen ? 'Unnamed Evergreen Track' : (isScript ? 'Unnamed Live Read' : 'Unnamed Break'));
        const safeName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
        
        const sourceFileName = item.fileName || '';
        const ext = path.extname(sourceFileName) || (isScript ? '.txt' : '.mp3');
        
        const paddedIdx = String(itemIdx).padStart(2, '0');
        const typePrefix = item.isEvergreen ? 'Track' : 'Break';
        const fallbackShowPrefix = (item.showNameShort || item.showName || folderPrefix || textPrefix || playlistPrefix || 'Show').trim();
        const targetFileName = item.targetFileName || `${fallbackShowPrefix} ${paddedIdx} ${typePrefix} at ${safeSlotTime} - ${safeName}${ext}`;
        
        let sourceFilePath: string | null = null;
        if (item.isEvergreen) {
          if (evergreensFolder) {
            sourceFilePath = findEvergreenSourceFile(evergreensFolder, sourceFileName, item.showNameShort, item.showName);
          }
          if (!sourceFilePath && showsFolder) {
            sourceFilePath = findEvergreenSourceFile(showsFolder, sourceFileName, item.showNameShort, item.showName);
          }
        } else {
          if (announcementsFolder) {
            sourceFilePath = findAnnouncementSourceFile(announcementsFolder, sourceFileName);
          }
          if (!sourceFilePath && showsFolder) {
            sourceFilePath = findAnnouncementSourceFile(showsFolder, sourceFileName);
          }
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

          const backupSourcePath = announcementsFolder ? findAnnouncementSourceFile(announcementsFolder, item.backupMp3Url) : null;
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
          announcementName: rawName,
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
