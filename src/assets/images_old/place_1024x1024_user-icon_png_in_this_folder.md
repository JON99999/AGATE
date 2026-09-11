# Custom Launcher Icon Configuration

To customize the desktop application launcher and installer icon for Interstitial-er, place your custom application icon in this folder:

- **Path**: `src/assets/images/user-icon.png`
- **Required Size**: Exactly `1024x1024` pixels
- **Format**: PNG format only

## How it works

1. During the electron packaging phase (`npm run dist`), the build orchestrator will search for `user-icon.png` in `src/assets/images/`.
2. If `user-icon.png` is found **and** its dimensions are validated to be exactly `1024x1024` pixels:
   - It will be used as the primary desktop app and installer icon.
3. If `user-icon.png` is absent, or if its dimensions do not match exactly `1024x1024` pixels:
   - The build orchestrator will safely fall back to the preseeded 1024x1024 placeholder icon (`interstitialer_icon_1779637727966.png`).
