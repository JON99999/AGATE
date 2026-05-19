import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { Schedule, LogEntry } from './src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const LOG_DIR = path.join(process.cwd(), 'Scheduler Logs');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedules.json');
const LOG_FILE = path.join(LOG_DIR, 'logs.json');
const LOG_BACKUP = path.join(LOG_DIR, 'logs_backup.json');

// Ensure directories exist
[DATA_DIR, LOG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!fs.existsSync(SCHEDULE_FILE)) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify([]));
}
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, JSON.stringify([]));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API - Schedule
  app.get('/api/schedules', (req, res) => {
    const data = fs.readFileSync(SCHEDULE_FILE, 'utf-8');
    res.json(JSON.parse(data));
  });

  app.post('/api/schedules', (req, res) => {
    const schedules: Schedule[] = req.body;
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedules, null, 2));
    res.json({ success: true });
  });

  // API - Logs
  app.get('/api/logs', (req, res) => {
    const data = fs.readFileSync(LOG_FILE, 'utf-8');
    res.json(JSON.parse(data));
  });

  app.post('/api/logs', (req, res) => {
    const entry: LogEntry = req.body;
    const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    logs.push(entry);
    
    // Save main log
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
    
    // Simple backup mechanism: copy main log to backup file
    // In a real app, this might be a rotating backup
    try {
      fs.copyFileSync(LOG_FILE, LOG_BACKUP);
    } catch (e) {
      console.error('Backup failed:', e);
    }

    res.json({ success: true });
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
