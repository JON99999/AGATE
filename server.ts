import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Schedule, LogEntry } from './src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const LOG_DIR = path.join(process.cwd(), 'Scheduler Logs');
const SCHEDULE_FILE_DEFAULT = path.join(DATA_DIR, 'schedules.json');
const LOG_FILE_DEFAULT = path.join(LOG_DIR, 'logs.json');
const LOG_BACKUP_DEFAULT = path.join(LOG_DIR, 'logs_backup.json');
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
  localPathSchedules: '',
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
function getScheduleFilePath() {
  if (currentSettings.mode === 'Local') {
    if (!currentSettings.localPathSchedules) {
      return '';
    }
    if (!fs.existsSync(currentSettings.localPathSchedules)) {
      try {
        fs.mkdirSync(currentSettings.localPathSchedules, { recursive: true });
      } catch (e) {}
    }
    return path.join(currentSettings.localPathSchedules, 'schedules.json');
  }
  return SCHEDULE_FILE_DEFAULT;
}

function getLogFilePath() {
  if (currentSettings.mode === 'Local') {
    if (!currentSettings.localPathLogs) {
      return '';
    }
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
  if (currentSettings.mode === 'Local') {
    if (!currentSettings.localPathLogs) {
      return '';
    }
    return path.join(currentSettings.localPathLogs, 'logs_backup.json');
  }
  return LOG_BACKUP_DEFAULT;
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
      const { localPathMP3s, localPathLogs, localPathSchedules } = req.body;
      
      const mp3Exists = localPathMP3s ? fs.existsSync(localPathMP3s) : true;
      const logsExists = localPathLogs ? fs.existsSync(localPathLogs) : true;
      const schedExists = localPathSchedules ? fs.existsSync(localPathSchedules) : true;

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
      const { localPathMP3s, localPathLogs, localPathSchedules } = req.body;
      let createdCount = 0;

      [localPathMP3s, localPathLogs, localPathSchedules].forEach(dirPath => {
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

  // API - List local MP3 files
  app.get('/api/local-mp3s', (req, res) => {
    try {
      const folderPath = currentSettings.localPathMP3s;
      if (!folderPath || !fs.existsSync(folderPath)) {
        return res.json([]);
      }
      const files = fs.readdirSync(folderPath);
      const mp3List = files
        .filter(f => f.toLowerCase().endsWith('.mp3'))
        .map(f => {
          const fullPath = path.join(folderPath, f);
          const stats = fs.statSync(fullPath);
          return {
            name: f,
            size: `${(stats.size / (1024 * 1024)).toFixed(1)} MB`,
            duration: '0:15', // Default starting duration
            path: `http://localhost:3000/api/stream-local?file=${encodeURIComponent(f)}`
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

  // API - Schedule
  app.get('/api/schedules', (req, res) => {
    try {
      const filePath = getScheduleFilePath();
      if (!fs.existsSync(filePath)) {
        return res.json([]);
      }
      const data = fs.readFileSync(filePath, 'utf-8');
      res.json(JSON.parse(data || '[]'));
    } catch (e) {
      console.error('Failed to read schedules:', e);
      res.status(300).json([]);
    }
  });

  app.post('/api/schedules', (req, res) => {
    try {
      const filePath = getScheduleFilePath();
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      
      const schedules: Schedule[] = req.body;
      fs.writeFileSync(filePath, JSON.stringify(schedules, null, 2));
      res.json({ success: true });
    } catch (e: any) {
      console.error('Failed to save schedules:', e);
      res.status(500).json({ error: 'Failed to write schedules data: ' + e.message });
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
      res.json(JSON.parse(data || '[]'));
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
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        try {
          logs = JSON.parse(data || '[]');
        } catch (pe) {
          logs = [];
        }
      }
      logs.push(entry);
      
      // Save main log
      fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
      
      // Simple backup mechanism
      try {
        const backupPath = getLogBackupPath();
        const backupParent = path.dirname(backupPath);
        if (!fs.existsSync(backupParent)) {
          fs.mkdirSync(backupParent, { recursive: true });
        }
        fs.writeFileSync(backupPath, JSON.stringify(logs, null, 2));
      } catch (e) {
        console.error('Backup failed:', e);
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error('Failed to save log to endpoint:', e);
      res.status(500).json({ error: 'Failed to save log: ' + e.message });
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
