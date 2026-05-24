# Interstitial-er Restore Point v0.5

This document serves as the formal **Restore Point v0.5** record for Interstitial-er, detailing the architectural state, compilation parameters, and target configuration.

---

## 1. Specification & Target Platforms

The application is structured as a cross-platform desktop application built with React, Vite, Express, and Electron, targeting the following priorities:
1. **MacOS Silicon (arm64)** (Primary)
2. **MacOS Intel (x64)** (Secondary)
3. **Windows 10/11 (x64)** (Tertiary)

---

## 2. Architecture & Key Modules

- **Main Process (`electron-main.cjs`)**: Initializes the native shell, resolves the first free local port starting from 3000, boots the wrapped Express backend, and configures primary view configurations. It implements an active polling loop to verify backend server readiness before loading the application URL.
- **Backend Service (`server.ts`)**: Serves API endpoints, receives dynamic PORT mappings via standard container environment settings (`process.env.PORT`), and persists app states safely to local platforms' writable user pathways (`userData`). It is built using the bundled single-file `dist/server.cjs` structure for ES Module resilience.
- **Frontend App (`src/App.tsx`)**: The visual interface developed in React & Tailwind CSS. Integrates a smart sub-session backup caching rule limiting backups to once-per-folder-configuration with automatic resets upon location toggles.
- **Backups & Path Integrity**: Local backups are stored under relative `/backups` subfolders within both folders (`Schedules` and `Logs`), auto-generating parents and children cleanly.

---

## 3. Compilation & Verification Status

- **Linter (`tsc --noEmit`)**: Passing without issues.
- **Build (`npm run build`)**: Vite assets and backend bundle are fully operational.
