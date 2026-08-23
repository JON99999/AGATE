# Interstitial-er Restore Point v0.11.5

This document serves as the formal **Restore Point v0.11.5** record for Interstitial-er, capturing the codebase state, versioning updates, and key structural fixes prior to implementing upcoming audio player diagnostic and loading state enhancements.

---

## 1. Versioning Alignment Summary

The workspace has been explicitly synchronized to version **0.11.5**:
- `package.json`: updated `"version": "0.11.5"`
- `package-lock.json`: updated root and lock package version to `"0.11.5"`
- `HOW_TO_RELEASE_IN_GITHUB_ONLINE.md`: updated all release procedures, tag references (`v0.11.5`), and instructions

---

## 2. Key Features & Recent Modifications in v0.11.5

1. **Persistent Header Sync**:
   - Fixed top header show title sticky behavior during scrolling in Playlist mode so it remains pinned to the active Playlist show rather than falling back to "No Scheduled Show".

2. **Playlist Card UX Refinements**:
   - **Uniform Card Height**: Established a consistent 3-row layout area (`min-h-[3.6rem]`) for MP3 metadata rows (Title, Artist, Album, Filename) to avoid layout shifting.
   - **Play Button Alignment**: Right-aligned and converted playlist card play/pause buttons to proper circular aspect-ratio buttons (`w-5 h-5 rounded-full aspect-square`).
   - **Reordering Hierarchy**: Replaced track-only index checking with full-timeline card evaluation (`unplayedTimelineCards`), enabling users to move playlist tracks directly before or across interstitial break cards.

---

## 3. How to Create an Absolute Recovery Point on GitHub

To ensure you can restore this exact codebase state at any time in AI Studio and GitHub:

### Option A: Publish Version Tag `v0.11.5` to GitHub Releases (Recommended)
1. In AI Studio, open **Settings** (gear icon) -> **Export / Connect to GitHub** -> Push to your **`main`** branch.
2. Go to your GitHub repository: `https://github.com/JON99999/Interstitial-er`.
3. Go to **Releases** -> **Draft a new release**.
4. Choose tag: **`v0.11.5`** (create tag on publish).
5. Set title to **`v0.11.5 Release`** and click **Publish release**.
6. This creates a permanent, immutable git tag `v0.11.5` on GitHub and automatically builds desktop binary installers via GitHub Actions. You can always revert or inspect `v0.11.5` in GitHub history.

### Option B: AI Studio Export / Commit
1. Ensure the GitHub export completes in AI Studio settings.
2. This records commit history on your `main` branch containing all files included in `v0.11.5`.
