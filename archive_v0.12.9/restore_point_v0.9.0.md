# Interstitial-er Restore Point v0.9.0

This document serves as the formal **Restore Point v0.9.0** record for Interstitial-er, detailing the architectural state, compilation parameters, and target configuration before implementing the refined manual & automated refresh synchronization handlers and the 30-minute inactivity sleep state.

---

## 1. Specification & Target Platforms

The application is structured as a cross-platform desktop application built with React, Vite, Express, and Electron, targeting the following priorities:
1. **MacOS Silicon (arm64)** (Primary)
2. **MacOS Intel (x64)** (Secondary)
3. **Windows 10/11 (x64)** (Tertiary)

---

## 2. Global Versioning & Distribution Setup

- The package version is set to `0.9.0` across:
  - `package.json`
  - `package-lock.json`
  - `HOW_TO_RELEASE_IN_GITHUB_ONLINE.md`
- Configured custom builder options inside `package.json` and `build-apps.cjs` to disable blockmap file writing and differential package metadatageneration when compiling Electron installer artifacts (`writeUpdateMetadata: false` and `differentialPackage: false` for Mac, Windows, and DMG profiles).

---

## 3. Architecture & Key Modules

- **Express Server (`server.ts`)**: Serves primary JSON files dynamically based on targeted system configurations, executing out of the compiled standalone CJS file `dist/server.cjs`.
- **Frontend App (`src/App.tsx`)**: The core UI layout styled using Tailwind CSS. Features absolutely centered mode/status items, folder verification configurations, and Live/Prerecord tabs.
- **Verification Engine (`driveService.ts`)**: Handles metadata and file lookups referencing local filesystem paths or authenticated Google Drive parameters.

---

## 4. Compilation & Verification Status

- **Linter Status**: Passing cleanly on dry runs.
- **Vite Build**: Successfully compiled with esbuild asset bundling.
