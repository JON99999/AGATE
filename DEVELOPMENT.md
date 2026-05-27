# Interstitial-er Developer Guide

A cross-platform desktop MP3 scheduler designed for professional audio orchestration.

## Setup & Running Locally

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Git](https://git-scm.com/)

### 2. Setup
```bash
git clone <repository-url>
cd Interstitial-er
npm install
```

### 3. Development
To launch the application in development mode:
```bash
npm run dev
```

Note: To run the application inside the Electron container during development:
```bash
npm run desktop
```

### 4. Building for Distribution
To generate the native applications for your current platform:
```bash
npm run dist
```

The output will be located in the `release/` directory:
- **Mac**: `.dmg` and `.zip`
- **Windows**: `.exe` (Installer and Portable)
