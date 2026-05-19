# Minute-Sync Scheduler

A cross-platform desktop MP3 scheduler designed for professional audio orchestration.

## Primary Environment Priorities

1.  **MacOS Silicon (arm64)**: Optimized for Apple M1/M2/M3 chips.
2.  **MacOS Intel (x64)**: Fully compatible with older Intel-based Macs.
3.  **Windows 10/11 (x64)**: Native support for modern Windows environments.

---

## Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Git](https://git-scm.com/)

### 2. Setup
```bash
git clone <repository-url>
cd MinuteSync-Scheduler
npm install
```

### 3. Development
To launch the application in development mode (HMR enabled for frontend):
```bash
npm run dev
```
Note: This runs the backend and frontend in your default browser. To see it in the Electron container during development, use:
```bash
npm run desktop
```

### 4. Building for Distribution
To generate the native applications for your current platform:
```bash
npm run dist
```
The output will be located in the `release/` directory:
- **Mac**: `.dmg` and `.zip` (supporting Silicon or Intel depending on your build target).
- **Windows**: `.exe` (Installer and Portable).

---

## Environment Guidelines
- **Desktop Focus**: The web version is secondary; all development prioritizes features within the Electron desktop wrapper.
- **Platform Parity**: If a feature required for Windows or Intel Mac significantly compromises the performance or experience on Apple Silicon, users are notified for decision-making.

## Features
- **Real-time Synchronization**: Precision system clock tracking.
- **Hardware-Aware Rendering**: Optimized for low CPU usage on Silicon chips.
- **Flexible Scheduling**: Hourly, Daily, and Date-specific one-time events.
- **Audio Verification**: Pre-flight checks for MP3 accessibility and metadata.
