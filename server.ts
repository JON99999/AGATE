import express from 'express';
import path from 'path';
import fs from 'fs';
import { Schedule, LogEntry } from './src/types';

// Detect safe persistent directory for packaged desktop apps
const BASE_DIR = process.env.APP_USER_DATA_PATH || process.cwd();
const DATA_DIR = path.join(BASE_DIR, 'data');
const LOG_DIR = path.join(BASE_DIR, 'Scheduler Logs');
const SCHEDULE_FILE_DEFAULT = path.join(DATA_DIR, 'schedules.json');
const LOG_FILE_DEFAULT = path.join(LOG_DIR, 'logs.json');
const LOG_BACKUP_DEFAULT = path.join(LOG_DIR, 'logs_backup.json');
const SCHEDULE_BACKUP_DEFAULT = path.join(DATA_DIR, 'schedules_backup.json');
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
  if (currentSettings.mode === 'Local' && currentSettings.localPathSchedules) {
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

function getScheduleBackupPath() {
  if (currentSettings.mode === 'Local' && currentSettings.localPathSchedules) {
    return path.join(currentSettings.localPathSchedules, 'backups', 'schedules_backup.json');
  }
  return path.join(DATA_DIR, 'backups', 'schedules_backup.json');
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
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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
      const mp3List = files
        .filter(f => f.toLowerCase().endsWith('.mp3'))
        .map(f => {
          const fullPath = path.join(folderPath, f);
          const stats = fs.statSync(fullPath);
          return {
            name: f,
            size: `${(stats.size / (1024 * 1024)).toFixed(1)} MB`,
            duration: '0:15', // Default starting duration
            path: `http://localhost:${PORT}/api/stream-local?file=${encodeURIComponent(f)}`
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

  app.post('/api/schedules', (req, res) => {
    try {
      const filePath = getScheduleFilePath();
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      
      const schedules: Schedule[] = req.body;
      let counter = 0;
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        try {
          const parsed = JSON.parse(data || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            counter = parsed.ScheduleBackupCounter || 0;
          }
        } catch (pe) {}
      }
      counter += 1; // Increment on every backup / save operation
      const updatedObj = { ScheduleBackupCounter: counter, data: schedules };
      fs.writeFileSync(filePath, JSON.stringify(updatedObj, null, 2));

      // Simple backup mechanism for schedules to match conventions of logs
      try {
        const backupPath = getScheduleBackupPath();
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
        ? `start ""` 
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
      const schedulePath = getScheduleFilePath();
      const logPath = getLogFilePath();

      // Backup schedules
      if (!fs.existsSync(schedulePath)) {
        const scheduleDir = path.dirname(schedulePath);
        if (scheduleDir && !fs.existsSync(scheduleDir)) {
          fs.mkdirSync(scheduleDir, { recursive: true });
        }
        fs.writeFileSync(schedulePath, JSON.stringify({ ScheduleBackupCounter: 0, data: [] }, null, 2));
      }

      if (fs.existsSync(schedulePath)) {
        const data = fs.readFileSync(schedulePath, 'utf-8');
        let parsed;
        try {
          parsed = JSON.parse(data || '[]');
        } catch {
          parsed = [];
        }

        let arrayData = Array.isArray(parsed) ? parsed : (parsed.data || []);
        let currentCounter = Array.isArray(parsed) ? 1 : ((parsed.ScheduleBackupCounter || 0) + 1);

        const updatedObj = {
          ScheduleBackupCounter: currentCounter,
          data: arrayData
        };

        const updatedStr = JSON.stringify(updatedObj, null, 2);
        fs.writeFileSync(schedulePath, updatedStr);

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}_${mm}_${dd}`;
        const padCounter = String(currentCounter).padStart(8, '0');
        const backupFileName = `schedules_Backup_${formattedDate}_${padCounter}.json`;

        const scheduleDir = path.dirname(schedulePath);
        const scheduleBackupDir = path.join(scheduleDir, 'backups');
        if (!fs.existsSync(scheduleBackupDir)) {
          fs.mkdirSync(scheduleBackupDir, { recursive: true });
        }
        fs.writeFileSync(path.join(scheduleBackupDir, backupFileName), updatedStr);

        // Also save to schedules_backup.json
        try {
          const backupPath = getScheduleBackupPath();
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

      res.json({ success: true });
    } catch (e: any) {
      console.error('Local backup trigger failed:', e);
      res.status(500).json({ error: 'Archiving failed: ' + e.message });
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
    const distPath = __dirname;
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
