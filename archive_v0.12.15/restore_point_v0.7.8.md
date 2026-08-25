# Interstitial-er Restore Point v0.7.8

This document serves as the formal **Restore Point v0.7.8** record for Interstitial-er, detailing the architectural state, compilation parameters, and target configuration before implementing the Path B (Browser Verification with Copy-Paste) Google Drive authentication method.

---

## 1. Specification & Target Platforms

The application is structured as a cross-platform desktop application built with React, Vite, Express, and Electron, targeting the following priorities:
1. **MacOS Silicon (arm64)** (Primary)
2. **MacOS Intel (x64)** (Secondary)
3. **Windows 10/11 (x64)** (Tertiary)

---

## 2. Recent Housekeeping & Asset Clean-up

- Removed redundant image assets and pre-generated launcher icon bundles from the build folder in the codebase to align with distribution targets, and cleaned up unused placeholder files under the `src/assets/` tree.
- Updated core package version to `0.7.8` synchronously across:
  - `package.json`
  - `package-lock.json`
  - `HOW_TO_RELEASE_IN_GITHUB_ONLINE.md`
  - `AGENTS.md`

---

## 3. Architecture & Key Modules

- **Main Process (`electron-main.cjs`)**: Initializes the native shell, resolves the first free local port starting from 3000, boots the wrapped Express backend, and configures primary view configurations. It implements an active polling loop to verify backend server readiness before loading the application URL.
- **Backend Service (`server.ts`)**: Serves API endpoints, receives dynamic PORT mappings via standard container environment settings (`process.env.PORT`), and persists app states safely to local platforms' writable user pathways (`userData`). It is built using the bundled single-file `dist/server.cjs` structure for ES Module resilience.
- **Frontend App (`src/App.tsx`)**: The visual interface developed in React & Tailwind CSS. Integrates a smart sub-session backup caching rule limiting backups to once-per-folder-configuration with automatic resets upon location toggles. Contains a manual option bypass for Google Drive access token injection.
- **Auth Configuration (`src/components/GoogleAuthSection.tsx`)**: Controls advanced OAuth connections. Features automatic detection of AI Studio/preview environments to auto-expand diagnostic manual tools.

---

## 4. Compilation & Verification Status

- **Linter Status**: Passing cleanly.
- **Build (`npm run build`)**: Vite assets and backend bundle are fully operational.
- **Dynamic Port Selection**: Port-conflict resolved dynamically beginning at port 3000.
