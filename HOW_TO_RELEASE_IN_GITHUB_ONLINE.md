# Step-by-Step GitHub Web-Only Release Guide

This guide outlines how to trigger the automated build of desktop installer binaries (`.exe`, `.dmg`, `.zip`) and attach them to a release on GitHub—**using only your web browser**.

By drafting the release page on the website first, you register the version and title in a draft state, making sure everything is perfectly staged before triggers run.

*(Note: We have updated the workspace configuration to explicitly set `"releaseType": "release"` under the GitHub provider settings in `package.json`. This ensures that when GitHub Actions compiles your code, `electron-builder` will successfully upload the compiled binaries directly to your published live release—completely avoiding the common collision errors like `existing type not compatible with publishing type`).*

---

## Step 1: Export Current App Code from AI Studio to GitHub

Make sure all changes made inside the AI Studio sandbox (including our update to version `0.7.8` in `package.json`) are exported to your GitHub repository.

1. Locate and click on the **Settings** gear icon in the AI Studio workspace sidebar.
2. Select the **Export / Connect to GitHub** option from the panels.
3. Authenticate with your GitHub credentials if prompted.
4. Select your repository: `JON99999/Interstitial-er`.
5. Click the button to export/push files to your **`main`** branch. This updates the remote repository to version `0.7.8`.

**⚠️ Final Reminder**: Manually upload your local high-resolution application icon files directly to <a href="https://github.com/JON99999/Interstitial-er/upload/main/src/assets/images" target="_blank" rel="noopener noreferrer">the GitHub images folder</a> if you have made offline modifications to the launcher icons.

---

## Step 2: Create and Stage the Draft Release on GitHub Web

Creating a draft release prepares the target version tag and coordinates ahead of time.

1. Open your web browser and navigate to <a href="https://github.com/JON99999/Interstitial-er" target="_blank" rel="noopener noreferrer">your GitHub repository (JON99999/Interstitial-er)</a>.
2. In the right sidebar, click on **Releases** (or click the **Draft a new release** button if visible).
3. Click the **Draft a new release** button.
4. Click the box labeled **Choose a tag**:
   - Type in **`v0.7.8`** *(make sure it starts with a lowercase "v" and matches the exact version in `package.json`)*.
   - Click the blue option that appears below it: **Create new tag: v0.7.8 on publish**.
5. Keep the **Target** dropdown set to **`main`**.
6. Enter a Title (e.g., `v0.7.8 Release`) and write any high-level notes in the description area.
7. Scroll to the bottom of the page:
   - **CRITICAL**: Do **NOT** select the checkbox "Set as a pre-release". 
   - **CRITICAL**: Do **NOT** click the green "Publish release" button yet.
   - Instead, click the grey button labeled **Save draft**.

---

## Step 3: Trigger the Build by Publishing the Release

Now you will publish the release, which instantly instructs GitHub to create the `v0.7.8` tag on your repository. This tag push is what triggers GitHub Actions to compile the applications.

1. While still on your Draft Release page, click the **Edit** button (or <a href="https://github.com/JON99999/Interstitial-er/releases" target="_blank" rel="noopener noreferrer">go to your Releases page on GitHub</a>, find your draft, and click edit).
2. Scroll to the bottom of the page and click the green **Publish release** button.
3. This creates the official tag on GitHub and fires up the compile machinery!

---

## Step 4: Monitor and Confirm the Installer Files

1. Go immediately to the <a href="https://github.com/JON99999/Interstitial-er/actions" target="_blank" rel="noopener noreferrer">GitHub Actions Dashboard</a> to watch your workflow progress.
2. You will see a newly running workflow called **Build/Release Electron App** triggered by your new tag `v0.7.8`.
3. Wait for the two runner environments (`windows-latest` and `macos-latest`) to complete compiling both the **Player** and **Admin** packages (usually takes 3–5 minutes).
4. Once completed, <a href="https://github.com/JON99999/Interstitial-er/releases" target="_blank" rel="noopener noreferrer">return to your live Releases page on GitHub</a>. The packaged installer files (`.dmg`, `.exe`, `.zip`) will now be neatly listed as download attachments under the `v0.7.8` assets foldout list!
