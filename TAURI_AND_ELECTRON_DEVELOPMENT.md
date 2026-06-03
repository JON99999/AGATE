# Interstitial-er: Co-Development with Electron and Tauri

This document explains how to develop, test, and package both **Electron** and **Tauri** versions of Interstitial-er simultaneously using the unified codebase.

---

## 1. Directory Structure

- `/electron-main.cjs`: Boot configuration and native layer for the Electron application.
- `/src-tauri/`: Native Rust configuration and layer for the Tauri application.
  - `/src-tauri/tauri.conf.json`: Tauri build and package definitions.
  - `/src-tauri/src/main.rs`: Rust entrypoint.
- `/src/`: Unified React & Tailwind frontend shared by both platforms.
- `package.json`: Main registry of dependencies and scripts.

---

## 2. Dynamic Release Artifacts

Both frameworks are integrated into the automated release pipeline:
- **Electron Outputs**: Saved as standard desktop installers/portable files inside `/release/` (e.g., `Interstitial-er Player-0.8.11-Windows-Portable.exe`).
- **Tauri Outputs**: Saved inside a dedicated subfolder `/release/tauri/` with `-tauri` appended to their file names to avoid collisions (e.g., `Interstitial-er Player-0.8.11-Mac-Silicon-new-tauri.dmg`).

---

## 3. Co-Development Workflow

### Environment Prerequisites
To run the Tauri application natively, you must have Rust and the cargo ecosystem installed on your machine:
- **Mac**: Install Xcode Command Line Tools (`xcode-select --install`) and Rust via `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`.
- **Windows**: Install Visual Studio Build Tools with C++ workload and Rust.

### Standard Commands

#### Build the Unified Frontend & Express Server
Both frameworks compile from the unified `/dist/` folder.
```bash
npm run build
```

#### Developing under Electron
Runs the Express local server, builds the React workspace, and opens the native Electron container:
```bash
npm run desktop
```

#### Developing under Tauri
Initializes the development workspace and runs the Tauri application layout linking directly to the React live server:
```bash
npx tauri dev
```

---

## 4. Unified Dual Release Builds

To package production installers for both frameworks on your current host OS:

### Pack Electron (Admin + Player Profiles)
```bash
npm run dist
```

### Pack Tauri (Admin + Player Profiles)
```bash
npm run dist:tauri
```

Both build pipelines are also fully managed in GitHub Actions on every official tag release (e.g., push `v0.8.11`) inside the `.github/workflows/release.yml` pipeline.
