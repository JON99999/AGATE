import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createServer as createViteServer } from 'vite';
import { Schedule, LogEntry } from './src/types';

// Path helper for preferences
function getPreferencesPath() {
  try {
    const { app } = require('electron');
    if (app) {
      return path.join(app.getPath('userData'), 'preferences.json');
    }
  } catch (e) {
    // Fail-safe if electron isn't available
  }
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Interstitial-er', 'preferences.json');
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Interstitial-er', 'preferences.json');
  }
  return path.join(process.cwd(), 'data', 'preferences.json');
}

const PREF_FILE = getPreferencesPath();
const prefDir = path.dirname(PREF_FILE);
if (!fs.existsSync(prefDir)) {
  fs.mkdirSync(prefDir, { recursive: true });
}

// Initial default configuration
const DEFAULT_PREFERENCES = {
  storageMode: 'demo',
  localPaths: {
    schedules: '',
    mp3s: '',
    logs: ''
  },
  driveFolders: {
    schedules: '1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED',
    mp3s: '11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch',
    logs: '1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx'
  }
};

let activePreferences = { ...DEFAULT_PREFERENCES };

try {
  if (fs.existsSync(PREF_FILE)) {
    const raw = fs.readFileSync(PREF_FILE, 'utf-8');
    activePreferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } else {
    fs.writeFileSync(PREF_FILE, JSON.stringify(DEFAULT_PREFERENCES, null, 2));
  }
} catch (e) {
  console.error('Failed to load preferences on startup, using defaults:', e);
}

const DATA_DIR = path.join(process.cwd(), 'data');
const LOG_DIR = path.join(process.cwd(), 'Scheduler Logs');
const MP3_SANDBOX_DIR = path.join(process.cwd(), 'mp3s');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedules.json');
const LOG_FILE = path.join(LOG_DIR, 'logs.json');
const LOG_BACKUP = path.join(LOG_DIR, 'logs_backup.json');

// Ensure directories exist
[DATA_DIR, LOG_DIR, MP3_SANDBOX_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!fs.existsSync(SCHEDULE_FILE)) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify([]));
}
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, JSON.stringify([]));
}

function resolveFilePath(type: 'schedules' | 'logs') {
  if (activePreferences.storageMode === 'local') {
    const dir = type === 'schedules' ? activePreferences.localPaths.schedules : activePreferences.localPaths.logs;
    if (dir && fs.existsSync(dir)) {
      return path.join(dir, type === 'schedules' ? 'schedules.json' : 'logs.json');
    }
  }
  return type === 'schedules' ? SCHEDULE_FILE : LOG_FILE;
}

function writeLocalFile(type: 'schedules' | 'logs', data: string) {
  const file = resolveFilePath(type);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file, data);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Preferences endpoints
  app.get('/api/preferences', (req, res) => {
    res.json(activePreferences);
  });

  app.post('/api/preferences', (req, res) => {
    try {
      activePreferences = { ...activePreferences, ...req.body };
      fs.writeFileSync(PREF_FILE, JSON.stringify(activePreferences, null, 2));
      res.json(activePreferences);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to save preferences' });
    }
  });

  // Local folders selection dialog
  app.post('/api/local/select-directory', (req, res) => {
    try {
      let selectedPath = null;
      try {
        const { dialog, BrowserWindow } = require('electron');
        const focusedWindow = BrowserWindow.getFocusedWindow();
        const result = dialog.showOpenDialogSync(focusedWindow, {
          title: 'Select Folder',
          properties: ['openDirectory', 'createDirectory']
        });
        if (result && result.length > 0) {
          selectedPath = result[0];
        }
      } catch (electronError) {
        // Safe fallback if not in Electron context
      }

      if (selectedPath) {
        res.json({ selectedPath });
      } else {
        res.json({ useFallback: true });
      }
    } catch (err: any) {
      console.error('Select folder error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Local folders browser fallback for AI Studio testing
  app.get('/api/local/list-directories', (req, res) => {
    try {
      const queryPath = (req.query.path as string) || process.cwd();
      const resolvedPath = path.resolve(queryPath);
      
      const items = fs.readdirSync(resolvedPath, { withFileTypes: true });
      const dirs = items
        .filter(item => item.isDirectory())
        .map(item => ({
          name: item.name,
          path: path.join(resolvedPath, item.name)
        }));
      
      res.json({
        currentPath: resolvedPath,
        parentPath: path.dirname(resolvedPath),
        directories: dirs
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Check local volumes availability
  app.post('/api/local/validate', (req, res) => {
    try {
      const { schedules, mp3s, logs } = req.body;
      
      const schedulesDirExists = schedules && fs.existsSync(schedules);
      const mp3sDirExists = mp3s && fs.existsSync(mp3s);
      const logsDirExists = logs && fs.existsSync(logs);

      const isValid = schedulesDirExists && mp3sDirExists && logsDirExists;

      if (isValid) {
        // Bootstrap missing database logs/schedules files if needed
        const schedulesFile = path.join(schedules, 'schedules.json');
        if (!fs.existsSync(schedulesFile)) {
          fs.writeFileSync(schedulesFile, JSON.stringify([]));
        }

        const logsFile = path.join(logs, 'logs.json');
        if (!fs.existsSync(logsFile)) {
          fs.writeFileSync(logsFile, JSON.stringify([]));
        }
      }

      res.json({
        valid: isValid,
        details: {
          schedules: schedulesDirExists,
          mp3s: mp3sDirExists,
          logs: logsDirExists
        }
      });
    } catch (e: any) {
      res.json({ valid: false, error: e.message });
    }
  });

  // List local MP3 files
  app.get('/api/local/mp3s', (req, res) => {
    try {
      const mp3Dir = activePreferences.storageMode === 'local' ? activePreferences.localPaths.mp3s : '';
      if (!mp3Dir || !fs.existsSync(mp3Dir)) {
        return res.json([]);
      }

      const files = fs.readdirSync(mp3Dir);
      const mp3Files = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ext === '.mp3' || ext === '.wav';
        })
        .map(file => {
          const filePath = path.join(mp3Dir, file);
          let sizeStr = '0.1 MB';
          try {
            const stats = fs.statSync(filePath);
            sizeStr = `${(stats.size / (1024 * 1024)).toFixed(1)} MB`;
          } catch (e) {}

          return {
            name: file,
            size: sizeStr,
            duration: '0:15',
            path: `/api/local/play-mp3?file=${encodeURIComponent(file)}`
          };
        });

      res.json(mp3Files);
    } catch (e: any) {
      console.error('Failed to list local MP3s:', e);
      res.status(500).json({ error: 'Failed to list local MP3s' });
    }
  });

  // Play/Stream local MP3
  app.get('/api/local/play-mp3', (req, res) => {
    try {
      const filename = req.query.file as string;
      const mp3Dir = activePreferences.storageMode === 'local' ? activePreferences.localPaths.mp3s : '';
      
      if (!mp3Dir || !filename) {
        return res.status(400).send('Invalid file request');
      }

      const filePath = path.join(mp3Dir, filename);

      // Simple safety check to prevent directory traversal
      if (!filePath.startsWith(path.resolve(mp3Dir))) {
        return res.status(403).send('Forbidden');
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
      }

      const stat = fs.statSync(filePath);
      const total = stat.size;

      if (req.headers.range) {
        const range = req.headers.range;
        const parts = range.replace(/bytes=/, "").split("-");
        const partialstart = parts[0];
        const partialend = parts[1];

        const start = parseInt(partialstart, 10);
        const end = partialend ? parseInt(partialend, 10) : total - 1;
        const chunksize = (end - start) + 1;

        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'audio/mpeg'
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': total,
          'Content-Type': 'audio/mpeg'
        });
        fs.createReadStream(filePath).pipe(res);
      }
    } catch (e) {
      console.error('Failed to stream MP3:', e);
      res.status(500).send('Streaming error');
    }
  });

  // API - Schedule
  app.get('/api/schedules', (req, res) => {
    try {
      const filePath = resolveFilePath('schedules');
      if (!fs.existsSync(filePath)) {
        return res.json([]);
      }
      const data = fs.readFileSync(filePath, 'utf-8');
      res.json(JSON.parse(data || '[]'));
    } catch (e) {
      console.error('Failed to read schedules:', e);
      res.status(500).json({ error: 'Failed to load schedules' });
    }
  });

  app.post('/api/schedules', (req, res) => {
    try {
      const schedules: Schedule[] = req.body;
      writeLocalFile('schedules', JSON.stringify(schedules, null, 2));
      res.json({ success: true });
    } catch (e) {
      console.error('Failed to save schedules:', e);
      res.status(500).json({ error: 'Failed to save schedules' });
    }
  });

  // API - Logs
  app.get('/api/logs', (req, res) => {
    try {
      const filePath = resolveFilePath('logs');
      if (!fs.existsSync(filePath)) {
        return res.json([]);
      }
      const data = fs.readFileSync(filePath, 'utf-8');
      res.json(JSON.parse(data || '[]'));
    } catch (e) {
      console.error('Failed to read logs:', e);
      res.status(500).json({ error: 'Failed to load logs' });
    }
  });

  app.post('/api/logs', (req, res) => {
    try {
      const entry: LogEntry = req.body;
      let logs = [];
      const filePath = resolveFilePath('logs');
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        logs = JSON.parse(data || '[]');
      }
      logs.push(entry);
      
      // Save main log
      writeLocalFile('logs', JSON.stringify(logs, null, 2));
      
      try {
        const backupFile = path.join(path.dirname(filePath), 'logs_backup.json');
        fs.copyFileSync(filePath, backupFile);
      } catch (e) {
        console.error('Backup failed:', e);
      }

      res.json({ success: true });
    } catch (e) {
      console.error('Failed to save log:', e);
      res.status(500).json({ error: 'Failed to save log' });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
