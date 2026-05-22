# Interstitial-er Restore Point v0.4

This document serves as the formal **Restore Point v0.4** record for Interstitial-er, detailing the architectural state, compilation parameters, and target configuration.

## 1. Specification & Target Platforms

The application is structured as a cross-platform desktop application built with React, Vite, Express, and Electron, targeting the following priorities:
1. **MacOS Silicon (arm64)** (Primary)
2. **MacOS Intel (x64)** (Secondary)
3. **Windows 10/11 (x64)** (Tertiary)

---

## 2. Architecture & Key Modules

- **Main Process (`electron-main.cjs`)**: Initializes the native shell, resolves a free local port, binds standard user data pathways (`userData`), boots the wrapped Express backend, and configures primary multi-mode view geometry (Player mode utilizes a compact 200px sidebar overlay; Admin mode boots as a standard desktop window).
- **Backend Service (`server.ts`)**: Serves primary API routes (`schedules`, `logs`, `settings`, `check-local-paths`, `browse-folder`). It dynamically utilizes the Electron `userData` folder path via the inherited environment configuration to ensure localized, persistent storage for packed executables. It compiles into a self-contained ES-bundled file (`dist/server.cjs`) to avoid path resolution runtime errors.
- **Frontend App (`src/App.tsx`)**: The UI interface, built with React and Tailwind CSS. Supports three main tab frames: Player, Scheduler, and Log.
- **Distribution Builder (`build-apps.cjs`)**: Compiles specific package bundles for both "Admin" and "Player" modes, applying correct productName metadata and unique ID definitions, then triggers `electron-builder`.

---

## 3. Codebase State & Resolutions at v0.4

- **Persistent Directories**: Dynamic path binding updated to map relative files into the user's localized platform application directories, preventing runtime errors in read-only sandboxed locations.
- **Host Platform targeting**: Modified the builder to execute locally-targeted platform flags, bypassing cross-compilation errors on secondary platforms during isolated CI runners.
- **App Launcher Configuration**: Registered initial build asset configurations, including launcher icon definitions (`src/assets/icon.png`) and MacOS signing bypass filters (`"identity": null`).

---

## 4. Compilation & Verification Status

- **Linter (`tsc --noEmit`)**: Passing without warnings or errors.
- **Build (`npm run build`)**: Vite assets and backend bundle built successfully into the `dist/` directory.
