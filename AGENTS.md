# Environment Guidelines

This application is primarily a **Desktop Application** built with Electron and Express. 

## Target Platforms (Priority)

1. **MacOS Silicon (arm64)**: Primary target. All features must be optimized for Apple Silicon performance and power efficiency.
2. **MacOS Intel (x64)**: Secondary target. Ensure compatibility for older Mac hardware without sacrificing Silicon performance.
3. **Windows 10/11 (x64)**: Tertiary target. Ensure full functionality on Windows systems.

## Development Principles

- **Desktop First**: Do not prioritize web deployment. The app is intended to be run as a standalone local executable.
- **Cross-Platform Compatibility**:
    - When 2 or 3 (Intel/Windows) cause performance Or binary size issues for 1 (Silicon), notify the user and ask for preference.
    - Avoid platform-specific paths unless handled by `path.join` or similar utilities.
    - Test interactions with localized file systems (e.g., standard library folders on Mac vs Windows).
- **Backend**: The Express server (`server.ts`) is bundled into the desktop app. Always maintain the `dist/server.cjs` build pipeline for the Electron entry point.
- **Native Modules**: Be cautious when adding dependencies with native code. Ensure they can be cross-compiled for `arm64` and `x64`.

## Build Configuration

- Use `electron-builder` for distribution.
- Configurations for all three priorities must be maintained in `package.json`.
- Distribution should focus on `dmg` and `zip` for Mac, and `nsis` (installer) or `portable` for Windows.

## UI Styling & Naming Guidelines

- **Strict App Naming**: The name of the application is **Interstitial-er**. Under no circumstances should custom, editorialized, or alternative names (e.g., "Remote Broadcast Synchronizer", "Desktop Application Broadcast Synch Controller") be added to the interface without explicit permission.
- **No Unsolicited Rebranding**: Avoid decorative tags, marketing slogans, or secondary descriptors. Only use straightforward, literal functional labels which align with the authentic **Interstitial-er** design.
- **No Editorializing**: Respect the clean aesthetic of **Interstitial-er** and do not add any unsolicited titles, headings, or branding elements in the UI.

## Communication & Description Guidelines

- **No Fluff or Marketing Language**: Avoid promotional, embellished, or descriptive marketing jargon (e.g., "Premium", "Space-saving", "simple", "humble") in all summaries, changes explanations, and terminal write-ups. Keep updates strictly technical, objective, and literal.

