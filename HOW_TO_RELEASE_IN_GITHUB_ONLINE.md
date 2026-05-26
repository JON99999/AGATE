# Step-by-Step GitHub Web-Only Release Guide

This guide describes how to trigger an automated production compile and upload desktop application installers (`.exe`, `.dmg`, `.zip`) directly to a release page on GitHub using **only** your web browser. This procedure avoids OAuth permission issues or missing file additions by creating a draft release on the web first.

---

## Step 1: Export Current App Code from AI Studio to GitHub

Make sure all changes made inside the AI Studio sandbox are synchronized to your repository.

1. Locate and click on the **Settings** gear icon in the workspace sidebar of AI Studio.
2. Select the **Export / Connect to GitHub** option from the panels.
3. Authenticate with your GitHub credentials if prompted.
4. Select your repository: `JON99999/Interstitial-er`.
5. Click the button to export the files to your **`main`** branch. This updates `package.json` to version `0.5.6` in your remote repository.

---

## Step 2: Create a Draft Release on GitHub Web (Pre-Registration)

Creating a draft release first tells `electron-builder` where to upload compile artifacts without attempting to auto-generate a release itself (which can result in authentication errors or missing assets).

1. In your browser, navigate to: `https://github.com/JON99999/Interstitial-er`
2. Scroll down on the right sidebar and click on **Releases**, then click the **Draft a new release** button.
3. In the box labeled **Choose a tag**:
   - Type in the new tag name: **`v0.5.6`** (Ensure it starts with `v` and matches your `package.json` version).
   - Click the blue dropdown option below it: **Create new tag: v0.5.6 on publish**.
4. Set the **Target** dropdown to **`main`**.
5. Give the release a Title (e.g., `v0.5.6 Release`).
6. Scroll to the bottom of the page.
   - **CRITICAL**: Do **NOT** click the green "Publish release" button yet.
   - Click the grey **Save draft** button instead.

---

## Step 3: Trigger the GitHub Actions Build

Now that the draft release is registered, pushing the `v0.5.6` tag triggers the compile runner. On the browser:

1. Click on the **Code** tab at the top left of your repository menu.
2. Select the **Tags** menu or create the tag via the github interface.
   - *Note*: If the tag `v0.5.6` is not created automatically by the draft step, you can publish the tag or trigger it through a workflow manually.
   - Alternatively, when you save the draft release with tag `v0.5.6`, go to **Actions** at `https://github.com/JON99999/Interstitial-er/actions` to verify if the runner is running.
3. To manually push the tag via the browser if GitHub Actions does not trigger automatically on draft save:
   - Go to your main repository page.
   - Click the branch dropdown (currently says `main`), type **`v0.5.6`**, and press enter to create the tag directly from the current commit, or proceed with the tag creation during step 4.

---

## Step 4: Verify and Publish

1. Open `https://github.com/JON99999/Interstitial-er/actions` to monitor progress.
2. Verify that two build environments (`windows-latest` and `macos-latest`) load, install the node dependencies, and run `npm run dist` packages.
3. When the compilation completes, return to the **Releases** section on your browser.
4. Locate the **v0.5.6 Draft Release**, click **Edit**, and verify that the installer files (`Interstitial-er Admin 0.5.6` and `Interstitial-er Player 0.5.6`) are attached in the downloads matrix at the bottom.
5. Once you confirm the assets are uploaded, click the **Publish release** button to make it public.
