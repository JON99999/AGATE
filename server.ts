import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { Interstitial, LogEntry, Show } from './src/types';

// Detect safe persistent directory for packaged desktop apps
const BASE_DIR = process.env.APP_USER_DATA_PATH || process.cwd();
const DATA_DIR = path.join(BASE_DIR, 'data');
const LOG_DIR = path.join(BASE_DIR, 'Calendar Logs');
const SCHEDULE_FILE_DEFAULT = path.join(DATA_DIR, 'interstitials.json');
const LOG_FILE_DEFAULT = path.join(LOG_DIR, 'logs.json');
const LOG_BACKUP_DEFAULT = path.join(LOG_DIR, 'logs_backup.json');
const SCHEDULE_BACKUP_DEFAULT = path.join(DATA_DIR, 'interstitials_backup.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure base directories exist
[DATA_DIR, LOG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!fs.existsSync(SCHEDULE_FILE_DEFAULT)) {
  fs.writeFileSync(SCHEDULE_FILE_DEFAULT, JSON.stringify([]));
}
if (!fs.existsSync(LOG_FILE_DEFAULT)) {
  fs.writeFileSync(LOG_FILE_DEFAULT, JSON.stringify([]));
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

// Dynamic Path Resolutions
function getCalendarFilePath() {
  if (currentSettings.mode === 'Local' && currentSettings.localPathCalendar) {
    if (!fs.existsSync(currentSettings.localPathCalendar)) {
      try {
        fs.mkdirSync(currentSettings.localPathCalendar, { recursive: true });
      } catch (e) {}
    }
    return path.join(currentSettings.localPathCalendar, 'interstitials.json');
  }
  return SCHEDULE_FILE_DEFAULT;
}

function getLogFilePath() {
  if (currentSettings.mode === 'Local' && currentSettings.localPathLogs) {
    if (!fs.existsSync(currentSettings.localPathLogs)) {
      try {
        fs.mkdirSync(currentSettings.localPathLogs, { recursive: true });
      } catch (e) {}
    }
    return path.join(currentSettings.localPathLogs, 'logs.json');
  }
  return LOG_FILE_DEFAULT;
}

function getLogBackupPath() {
  if (currentSettings.mode === 'Local' && currentSettings.localPathLogs) {
    return path.join(currentSettings.localPathLogs, 'backups', 'logs_backup.json');
  }
  return path.join(LOG_DIR, 'backups', 'logs_backup.json');
}

function getCalendarBackupPath() {
  if (currentSettings.mode === 'Local' && currentSettings.localPathCalendar) {
    return path.join(currentSettings.localPathCalendar, 'backups', 'interstitials_backup.json');
  }
  return path.join(DATA_DIR, 'backups', 'interstitials_backup.json');
}

function getShowsFilePath() {
  const calendarPath = getCalendarFilePath();
  return path.join(path.dirname(calendarPath), 'shows.json');
}

function getShowsBackupPath() {
  const showsPath = getShowsFilePath();
  return path.join(path.dirname(showsPath), 'backups', 'shows_backup.json');
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
  <title>Interstitial-er Sign-In Success</title>
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
    <div class="title">Interstitial-er OAuth</div>
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

    <div class="brand">Interstitial-er</div>
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
        document.getElementById('message').innerText = 'Please copy the secure access token below and paste it into the Interstitial-er Option: Copy-Paste input field.';
        
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
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2), 'utf-8');
      res.json({ success: true, settings: currentSettings });
    } catch (e) {
      console.error('Failed to write settings:', e);
      res.status(500).json({ error: 'Failed to write settings' });
    }
  });

  // API - Check if local computer directories exist safely on system
  app.post('/api/check-local-paths', (req, res) => {
    try {
      const { localPathMP3s, localPathLogs, localPathCalendar } = req.body;
      
      const mp3Exists = localPathMP3s ? fs.existsSync(localPathMP3s) : true;
      const logsExists = localPathLogs ? fs.existsSync(localPathLogs) : true;
      const schedExists = localPathCalendar ? fs.existsSync(localPathCalendar) : true;

      res.json({
        exists: mp3Exists && logsExists && schedExists,
        mp3Exists,
        logsExists,
        schedExists
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

      [localPathMP3s, localPathLogs, localPathCalendar].forEach(dirPath => {
        if (dirPath && !fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
          createdCount++;
        }
      });

      res.json({ success: true, createdCount });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to auto-create paths' });
    }
  });

  // API - Standard Native selection dialogue via Electron Process
  app.post('/api/browse-folder', (req, res) => {
    try {
      if (electronDialog) {
        const result = electronDialog.showOpenDialogSync({
          title: 'Select Folder Dest',
          properties: ['openDirectory', 'createDirectory']
        });
        if (result && result.length > 0) {
          res.json({ success: true, path: result[0] });
        } else {
          res.json({ success: true, cancelled: true });
        }
      } else {
        res.json({ success: false, error: 'Standard Browse standard dialog is only available when running inside Desktop App frame.' });
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
        try {
          const os = require('os');
          targetPath = os.homedir() || process.cwd();
        } catch {
          targetPath = process.cwd();
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
      const files = fs.readdirSync(folderPath);
      const allowedExtensions = ['.mp3', '.txt', '.pdf', '.png', '.jpg', '.jpeg'];
      const mp3List = files
        .filter(f => {
          const ext = path.extname(f).toLowerCase();
          return allowedExtensions.includes(ext);
        })
        .map(f => {
          const fullPath = path.join(folderPath, f);
          const stats = fs.statSync(fullPath);
          const ext = path.extname(f).toLowerCase();
          const isScript = ['.txt', '.pdf', '.png', '.jpg', '.jpeg'].includes(ext);
          return {
            name: f,
            size: `${(stats.size / (1024 * 1024)).toFixed(1)} MB`,
            duration: isScript ? '—' : '0:15', // Default starting duration for audio, placeholder for scripts
            path: `/api/stream-local?file=${encodeURIComponent(f)}`
          };
        });
      res.json(mp3List);
    } catch (e: any) {
      console.error('Failed to read local MP3 directory:', e);
      res.status(500).json([]);
    }
  });

  // API - Stream local MP3 files
  app.get('/api/stream-local', (req, res) => {
    try {
      const file = req.query.file as string;
      if (!file) return res.status(400).send('Filename required');
      
      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(404).send('Local source folder not defined or offline');
      }

      // Safe basename resolve prevents directory escapes
      const targetFilePath = path.join(folderPath, path.basename(file));
      if (fs.existsSync(targetFilePath)) {
        res.sendFile(targetFilePath);
      } else {
        res.status(404).send('File not found in local directory');
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
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(404).json({ error: 'Media & Scripts folder not defined or offline' });
      }

      const targetFilePath = path.join(folderPath, path.basename(file));
      if (!fs.existsSync(targetFilePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      const ext = path.extname(file).toLowerCase();
      const isText = ext === '.txt';

      const responseData: any = {
        name: file,
        path: targetFilePath,
        extension: ext,
        url: `/api/stream-local?file=${encodeURIComponent(file)}`
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
      if (!fs.existsSync(filePath)) {
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
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
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
      fs.writeFileSync(filePath, JSON.stringify(updatedObj, null, 2));

      // Simple backup mechanism for schedules to match conventions of logs
      try {
        const backupPath = getCalendarBackupPath();
        if (backupPath) {
          const backupParent = path.dirname(backupPath);
          if (!fs.existsSync(backupParent)) {
            fs.mkdirSync(backupParent, { recursive: true });
          }
          fs.writeFileSync(backupPath, JSON.stringify(updatedObj, null, 2));
        }
      } catch (e) {
        console.error('Schedules backup copy failed:', e);
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error('Failed to save schedules:', e);
      res.status(500).json({ error: 'Failed to write schedules data: ' + e.message });
    }
  });

  // API - Shows
  app.get('/api/shows', (req, res) => {
    try {
      const filePath = getShowsFilePath();
      if (!fs.existsSync(filePath)) {
        const defaultShows = [
          {
            "id": "1",
            "day": "Sunday",
            "startHour": 10,
            "startMinute": 0,
            "durationHours": 2,
            "durationMinutes": 0,
            "name": "Soul Sunday & Eclectic Beats",
            "nameShort": "Soul_Sunday_Ecle",
            "host": "DJ Skeet",
            "description": "Deep cuts of St. Louis soul, vintage jazz, and eclectic instrumental beats to smooth out your Sunday.",
            "active": true
          },
          {
            "id": "2",
            "day": "Monday",
            "startHour": 12,
            "startMinute": 0,
            "durationHours": 1,
            "durationMinutes": 30,
            "name": "indie/STL Showcase",
            "nameShort": "indie_STL_Showca",
            "host": "Alek",
            "description": "Highlighting local St. Louis indie rock, post-punk, and alternative artists.",
            "active": true
          },
          {
            "id": "3",
            "day": "Tuesday",
            "startHour": 14,
            "startMinute": 0,
            "durationHours": 2,
            "durationMinutes": 0,
            "name": "Electronic Exploration",
            "nameShort": "Electronic_Explo",
            "host": "Sarah G.",
            "description": "Ambient soundscapes, techno, and experimental electronic music from across the Midwest.",
            "active": true
          },
          {
            "id": "4",
            "day": "Wednesday",
            "startHour": 16,
            "startMinute": 0,
            "durationHours": 2,
            "durationMinutes": 0,
            "name": "Dub-Plate Special",
            "nameShort": "Dub_Plate_Specia",
            "host": "Dubman",
            "description": "Classic Jamaican reggae, modern dubwise, and deep low-frequency bass selections.",
            "active": true
          },
          {
            "id": "5",
            "day": "Thursday",
            "startHour": 9,
            "startMinute": 0,
            "durationHours": 1,
            "durationMinutes": 30,
            "name": "Morning Coffee Jazz",
            "nameShort": "Morning_Coffee_J",
            "host": "Jazzcat",
            "description": "Cool jazz, classic bop, and warm conversation to kickstart your Thursday morning.",
            "active": true
          },
          {
            "id": "6",
            "day": "Friday",
            "startHour": 20,
            "startMinute": 0,
            "durationHours": 2,
            "durationMinutes": 0,
            "name": "Friday Night Fever",
            "nameShort": "Friday_Night_Fev",
            "host": "DJ Fever",
            "description": "High-energy disco, house, and classic dance grooves to kick off the weekend.",
            "active": true
          },
          {
            "id": "7",
            "day": "Saturday",
            "startHour": 18,
            "startMinute": 0,
            "durationHours": 3,
            "durationMinutes": 0,
            "name": "The STL Soundclash",
            "nameShort": "The_STL_Soundcla",
            "host": "Resident DJs",
            "description": "A collaborative showcase of St. Louis hip-hop, experimental beats, and electronic mixes clashing live.",
            "active": true
          }
        ];
        const parentDir = path.dirname(filePath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        const wrappedObj = { ShowsBackupCounter: 0, data: defaultShows };
        fs.writeFileSync(filePath, JSON.stringify(wrappedObj, null, 2));
        return res.json(defaultShows);
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
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
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
      fs.writeFileSync(filePath, JSON.stringify(updatedObj, null, 2));

      // Simple backup mechanism for shows to match conventions of schedules/logs
      try {
        const backupPath = getShowsBackupPath();
        if (backupPath) {
          const backupParent = path.dirname(backupPath);
          if (!fs.existsSync(backupParent)) {
            fs.mkdirSync(backupParent, { recursive: true });
          }
          fs.writeFileSync(backupPath, JSON.stringify(updatedObj, null, 2));
        }
      } catch (e) {
        console.error('Shows backup copy failed:', e);
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error('Failed to save shows:', e);
      res.status(500).json({ error: 'Failed to write shows data: ' + e.message });
    }
  });

  // API - Verify Evergreen & Playlist folders
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
        evergreensPath,
        playlistsPath,
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

  // API - Check playlist files for current and next show
  app.post('/api/shows/playlist/check-show-files', (req, res) => {
    try {
      const { currentShowNameShort, nextShowNameShort } = req.body;
      const folderPath = currentSettings.localPathMP3s;
      
      let currentShowFileCount = 0;
      let nextShowFileCount = 0;
      let currentShowFiles: string[] = [];
      let nextShowFiles: string[] = [];

      if (folderPath && fs.existsSync(folderPath)) {
        let playlistsPath = path.join(folderPath, 'Playlists');
        if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, 'playlists'))) {
          playlistsPath = path.join(folderPath, 'playlists');
        }

        if (fs.existsSync(playlistsPath)) {
          if (currentShowNameShort) {
            const currFolderPath = path.join(playlistsPath, currentShowNameShort);
            if (fs.existsSync(currFolderPath)) {
              const files = fs.readdirSync(currFolderPath);
              currentShowFiles = files.filter(f => {
                const ext = path.extname(f).toLowerCase();
                return ['.mp3', '.m3u'].includes(ext);
              });
              currentShowFileCount = currentShowFiles.length;
            }
          }

          if (nextShowNameShort) {
            const nextFolderPath = path.join(playlistsPath, nextShowNameShort);
            if (fs.existsSync(nextFolderPath)) {
              const files = fs.readdirSync(nextFolderPath);
              nextShowFiles = files.filter(f => {
                const ext = path.extname(f).toLowerCase();
                return ['.mp3', '.m3u'].includes(ext);
              });
              nextShowFileCount = nextShowFiles.length;
            }
          }
        }
      }

      res.json({
        success: true,
        currentShowFileCount,
        nextShowFileCount,
        currentShowFiles,
        nextShowFiles
      });
    } catch (err: any) {
      console.error('Error in /api/shows/playlist/check-show-files:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Helper for pure JS estimation of MP3 file duration in seconds
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

  // Helper for pure JS reading of MP3 ID3 metadata on server side
  async function getMp3ServerMetadata(filePath: string): Promise<{ title?: string; artist?: string; albumArtist?: string; album?: string } | null> {
    try {
      if (!fs.existsSync(filePath)) return null;
      const stats = fs.statSync(filePath);
      const fd = fs.openSync(filePath, 'r');
      
      // Read first 64KB for ID3v2
      const buffer = Buffer.alloc(65536);
      const bytesRead = fs.readSync(fd, buffer, 0, 65536, 0);
      let v2Meta: { title?: string; artist?: string; albumArtist?: string; album?: string } | null = null;
      if (bytesRead > 0) {
        v2Meta = parseID3Buffer(new Uint8Array(buffer.subarray(0, bytesRead)));
      }

      // Check ID3v1 trailing tag if file is at least 128 bytes
      let v1Meta: { title?: string; artist?: string; albumArtist?: string; album?: string } | null = null;
      if (stats.size >= 128) {
        const tailBuf = Buffer.alloc(128);
        fs.readSync(fd, tailBuf, 0, 128, stats.size - 128);
        v1Meta = parseID3v1Buffer(new Uint8Array(tailBuf));
      }

      fs.closeSync(fd);

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
      return null;
    }
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

  // Helper for recursive audio and playlist file scanning
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

  // API - Load playlist tracks for a show
  app.post('/api/shows/playlist/load-tracks', async (req, res) => {
    try {
      const { showNameShort, showName } = req.body;
      if (!showNameShort && !showName) {
        return res.status(400).json({ error: 'showNameShort or showName is required' });
      }

      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.json({ success: true, tracks: [], playlistFile: null });
      }

      let playlistsPath = path.join(folderPath, 'Playlists');
      if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, 'playlists'))) {
        playlistsPath = path.join(folderPath, 'playlists');
      }

      const showFolderPath = findShowPlaylistFolder(playlistsPath, showNameShort, showName);
      if (!showFolderPath) {
        return res.json({ success: true, tracks: [], playlistFile: null });
      }

      const { m3uFiles, audioFiles } = getAllAudioAndPlaylistFiles(showFolderPath);
      let rawTracks: Array<{ fileName: string; title: string; durationSeconds: number }> = [];
      let playlistFileName: string | null = null;

      if (m3uFiles.length > 0) {
        playlistFileName = path.basename(m3uFiles[0]);
        rawTracks = parseM3uFile(m3uFiles[0], showFolderPath);
      } else {
        audioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        rawTracks = audioFiles.map(f => {
          const durationSeconds = getMp3DurationSeconds(f.fullPath);
          return {
            fileName: f.name,
            title: f.name.replace(/\.[^/.]+$/, ''),
            durationSeconds
          };
        });
      }

      const searchKey = showNameShort || showName;
      const tracks = await Promise.all(rawTracks.map(async (t, idx) => {
        const m = Math.floor(t.durationSeconds / 60);
        const s = Math.floor(t.durationSeconds % 60);

        // Try reading ID3 metadata from local file if it exists
        let meta: { title?: string; artist?: string; albumArtist?: string; album?: string } | null = null;
        const filePath = path.join(showFolderPath, t.fileName);
        if (fs.existsSync(filePath)) {
          meta = await getMp3ServerMetadata(filePath);
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
          streamUrl: `/api/shows/playlist/stream-file?showNameShort=${encodeURIComponent(searchKey)}&showName=${encodeURIComponent(showName || '')}&file=${encodeURIComponent(t.fileName)}`
        };
      }));

      res.json({
        success: true,
        showNameShort: searchKey,
        playlistFile: playlistFileName,
        tracks
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
  app.post('/api/shows/playlist/check-show-files', (req, res) => {
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

      const getShowCount = (shortName?: string, name?: string) => {
        if (!shortName && !name) return 0;
        const showFolderPath = findShowPlaylistFolder(playlistsPath, shortName, name);
        if (!showFolderPath) return 0;

        const { m3uFiles, audioFiles } = getAllAudioAndPlaylistFiles(showFolderPath);
        if (m3uFiles.length > 0) {
          const rawTracks = parseM3uFile(m3uFiles[0], showFolderPath);
          return rawTracks.length;
        }
        return audioFiles.length;
      };

      const currentShowFileCount = getShowCount(currentShowNameShort, currentShowName);
      const nextShowFileCount = getShowCount(nextShowNameShort, nextShowName);

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
      if ((!showNameShort && !showName) || !file) {
        return res.status(400).send('showNameShort/showName and file are required');
      }

      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(404).send('Local source folder not defined or offline');
      }

      let playlistsPath = path.join(folderPath, 'Playlists');
      if (!fs.existsSync(playlistsPath) && fs.existsSync(path.join(folderPath, 'playlists'))) {
        playlistsPath = path.join(folderPath, 'playlists');
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
      if (!fs.existsSync(filePath)) {
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
      const filePath = getLogFilePath();
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

  // API - Dedicated Playlist Show Log Entry
  app.post('/api/shows/playlist/log-entry', (req, res) => {
    try {
      const { showNameShort, showStartTime, entry } = req.body;
      if (!showNameShort) {
        return res.status(400).json({ error: 'showNameShort is required' });
      }

      const baseLogFilePath = getLogFilePath();
      const baseLogDir = baseLogFilePath ? path.dirname(baseLogFilePath) : LOG_DIR;
      const playlistLogsDir = path.join(baseLogDir, 'Playlists');
      if (!fs.existsSync(playlistLogsDir)) {
        fs.mkdirSync(playlistLogsDir, { recursive: true });
      }

      // File name: <ShortShowName>_<Date>_<Time>_playlist.log
      const startDate = showStartTime ? new Date(showStartTime) : new Date();
      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, '0');
      const day = String(startDate.getDate()).padStart(2, '0');
      const hours = String(startDate.getHours()).padStart(2, '0');
      const minutes = String(startDate.getMinutes()).padStart(2, '0');

      const dateStr = `${year}-${month}-${day}`;
      const timeStr = `${hours}-${minutes}`;

      const safeShowName = String(showNameShort).replace(/[\/\\?%*:|"<>]/g, '_');
      const logFileName = `${safeShowName}_${dateStr}_${timeStr}_playlist.log`;
      const logFilePath = path.join(playlistLogsDir, logFileName);

      const timestamp = entry?.timestamp || new Date().toISOString();
      const type = entry?.type || 'track';
      const name = entry?.name || entry?.fileName || 'Unknown Item';
      const status = entry?.status || 'played';
      const duration = entry?.durationFormatted || (entry?.durationSeconds ? `${entry.durationSeconds}s` : '');

      const logLine = `[${timestamp}] [${type.toUpperCase()}] ${name}${duration ? ` (${duration})` : ''} - ${status.toUpperCase()}\n`;

      fs.appendFileSync(logFilePath, logLine, 'utf-8');

      res.json({ success: true, logFileName, logFilePath });
    } catch (e: any) {
      console.error('Failed to save playlist show log entry:', e);
      res.status(500).json({ error: 'Failed to save playlist log: ' + e.message });
    }
  });

  // API - Open local folder in OS neutral fashion
  app.post('/api/open-local-folder', (req, res) => {
    try {
      const { path: folderPath } = req.body;
      if (!folderPath) {
        return res.status(400).json({ error: 'Folder path is required' });
      }
      if (!fs.existsSync(folderPath)) {
        return res.status(404).json({ error: 'Folder directory does not exist' });
      }

      const { exec } = require('child_process');
      const startCmd = process.platform === 'win32' 
        ? 'explorer' 
        : process.platform === 'darwin' 
          ? 'open' 
          : 'xdg-open';
      
      exec(`${startCmd} "${folderPath}"`, (err: any) => {
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

      // Backup schedules
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

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}_${mm}_${dd}`;
        const padCounter = String(currentCounter).padStart(8, '0');
        const backupFileName = `interstitials_Backup_${formattedDate}_${padCounter}.json`;

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

      // Backup logs
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

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}_${mm}_${dd}`;
        const padCounter = String(currentCounter).padStart(8, '0');
        const backupFileName = `logs_Backup_${formattedDate}_${padCounter}.json`;

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

      // Backup shows
      const showsPath = getShowsFilePath();
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

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}_${mm}_${dd}`;
        const padCounter = String(currentCounter).padStart(8, '0');
        const backupFileName = `shows_Backup_${formattedDate}_${padCounter}.json`;

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

      res.json({ success: true });
    } catch (e: any) {
      console.error('Local backup trigger failed:', e);
      res.status(500).json({ error: 'Archiving failed: ' + e.message });
    }
  });

  // API - Export prerecord playlist and files
  app.post('/api/export-prerecord', (req, res) => {
    try {
      const { prerecordDate, lengthMinutes, items, exportDestination, folderPrefix, textPrefix, playlistPrefix } = req.body;
      if (!prerecordDate) {
        return res.status(400).json({ error: 'Prerecord date is required' });
      }
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Scheduled items array is required' });
      }

      const destParentFolder = (exportDestination && exportDestination.trim()) || currentSettings.localPathMP3s || DATA_DIR;
      if (!fs.existsSync(destParentFolder)) {
        fs.mkdirSync(destParentFolder, { recursive: true });
      }

      const sourceFolder = currentSettings.localPathMP3s || DATA_DIR;

      // Format clean, file-safe folder name for the export
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
      const tPrefix = (textPrefix && textPrefix.trim()) || 'Show';
      const pPrefix = (playlistPrefix && playlistPrefix.trim()) || 'Show';

      const lengthMinutesNum = Number(lengthMinutes) || 0;
      const h = Math.floor(lengthMinutesNum / 60);
      const m = lengthMinutesNum % 60;
      const durationStr = m === 0 ? `${h} Hrs` : `${h} Hrs ${m} Min`;

      const exportFolderName = `${fPrefix} - Export - ${dateStr} at ${timeStr} - ${durationStr}`;
      const exportFolderPath = path.join(destParentFolder, exportFolderName);

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

      items.forEach((item: any, idx: number) => {
        const itemIdx = idx + 1;
        const itemSlotTime = item.slotTime; // e.g. "12:00"
        const safeSlotTime = typeof itemSlotTime === 'string' ? itemSlotTime.replace(/:/g, '-') : '00-00';
        
        // Remove prohibited file characters in scheduleName
        const rawName = item.interstitialName || 'Unnamed Break';
        const safeInterstitialName = rawName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
        
        const sourceFileName = item.fileName || '';
        const ext = path.extname(sourceFileName) || '.mp3';
        
        // Construct sequential file name as requested
        const paddedIdx = String(itemIdx).padStart(2, '0');
        const targetFileName = `Break ${paddedIdx} at ${safeSlotTime} - ${safeInterstitialName}${ext}`;
        
        const sourceFilePath = path.join(sourceFolder, path.basename(sourceFileName));
        const destFilePath = path.join(exportFolderPath, targetFileName);

        let status = 'Missing';
        if (sourceFileName && fs.existsSync(sourceFilePath)) {
          try {
            fs.copyFileSync(sourceFilePath, destFilePath);
            copiedCount++;
            status = 'Found & Copied';
          } catch (copyErr: any) {
            console.error(`Error copying ${sourceFileName}:`, copyErr);
            status = `Copy Error: ${copyErr.message}`;
            missingCount++;
          }
        } else {
          missingCount++;
        }

        fileReport.push({
          index: itemIdx,
          slotTime: itemSlotTime,
          interstitialName: rawName,
          originalFile: sourceFileName,
          exportedFile: targetFileName,
          status
        });

        // Add to m3u playlist lines if it's an MP3 (referencing only the local target name in export folder)
        if (ext.toLowerCase() === '.mp3') {
          m3uLines.push(`#EXTINF:-1,Break ${itemIdx} - ${itemSlotTime} - ${rawName}`);
          m3uLines.push(targetFileName);
        }

        // Add to summary text file
        if (status === 'Found & Copied') {
          txtLines.push(`${itemIdx}. Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported File: ${targetFileName}`);
          txtLines.push(`   Title: ${rawName}`);
          txtLines.push(`   Source File: ${sourceFileName || ''}`);
        } else {
          txtLines.push(`${itemIdx}. MISSING FILE - THIS FILE COULD NOT BE FOUND.  PLEASE REVERIFY AND EXPORT.`);
          txtLines.push(`   Slot: ${itemSlotTime}`);
          txtLines.push(`   Exported File: ${targetFileName}`);
          txtLines.push(`   Title: ${rawName}`);
          txtLines.push(`   Source File: ${sourceFileName || ''}`);
        }
        txtLines.push('------------------------------------------------------------------------');
      });

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
