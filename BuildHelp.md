# How to Build and Download the Desktop App

To get the "double-click" versions (`.exe` for Windows or `.dmg` for Mac) without building them yourself, follow these steps using GitHub:

## 1. Connect to GitHub
Use the **Share** or **Settings** menu in this interface to sync this project to your GitHub account. Ensure the repository name is what you expect (e.g., `Interstitial-er`).

## 2. Trigger an Automatic Build
I have configured a "GitHub Action" that builds the app for you whenever you create a version tag.
1. Go to your repository on GitHub.com.
2. Click on **Releases** (usually on the right side of the page).
3. Click **Create a new release** (or "Draft a new release").
4. Click **Choose a tag** and type `v0.1.0` (it must start with a `v`).
5. Click **Create new tag** when prompted.
6. Give the release a title (e.g., "Version 0.1 First Build").
7. Click **Publish release**.

## 3. Wait for the Build
1. Go to the **Actions** tab at the top of your GitHub repository.
2. You will see a workflow named "Build/Release Electron App" starting.
3. It will take about 5-10 minutes to finish building for both Windows and Mac.

## 4. Download your Files
1. Once the Action finishes (green checkmark), go back to your **Releases** page.
2. You will now see "Assets" listed at the bottom of your version `v0.1.0`.
3. Download the `Interstitial-er-0.1.0.exe` (Windows) or `.dmg` (Mac).
4. These are "Portable" and ad-hoc signed versions. Since they are built via GitHub Actions and are not signed with a paid Apple Developer certificate, modern macOS Gatekeeper may block launch or claim the app "is damaged".
5. To bypass macOS Gatekeeper:
   - Move the installed app to your **Applications** folder.
   - Right-click (or Control-click) the application icon and select **Open** from the context menu (do not just double-click). Click **Open** again on the pop-up warning.
   - Alternatively, open a terminal window and run:
     ```bash
     xattr -cr /Applications/Interstitial-er.app
     ```
     This cleans the quarantine flag and launches the app successfully.

---

### If you want to build locally instead:
If you prefer to build on your own machine:
1. Install [Node.js](https://nodejs.org/).
2. Download your code and open a terminal in that folder.
3. Run `npm install`.
4. Run `npm run dist`.
5. Your files will be in the `release/` folder.
