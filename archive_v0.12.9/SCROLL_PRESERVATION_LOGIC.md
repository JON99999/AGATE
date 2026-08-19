# Scroll Position Preservation Logic & Architecture

## Overview

This document outlines the rationale, design options, and implementation logic for preserving scroll position in the **Prerecord**, **Export**, and **Playlist** views of **Interstitial-er**.

---

## User Requirements & Prompts

1. **Primary Need**:
   > *"On the Refresh of Prerecord, Export, and Playlist views on the Log, keep the focus on the same scroll position as before the refresh. Specifically, if a card was clicked to move it up or down, keep that card's position the same if scrolling hasn't occurred."*

2. **Scope Clarification**:
   > *"Reconsider and rewrite with the thought that Option 1.2 and the rest of the proposal should include any 'automated refreshes' or 'post cache' refreshes as well as the correctly stated 'Initial view load' and 'manual refreshes'."*

---

## Evaluated Options

### Option 1: Smart Scroll Position Preservation (Selected & Implemented)
* **Mechanics**:
  * **Initial Load / Mode Switch**: When the user initially loads or switches into a view mode (`Playlist`, `Prerecord`, `Export`), auto-scroll runs once (centering on the "NOW" active item indicator or top of Prerecord).
  * **Subsequent Refreshes & Card Re-orders**: Every scroll event records `userScrollTopRef.current`. When a track card is moved up/down, or when manual refreshes, background automated refreshes, or post-cache MP3 status updates occur, `useLayoutEffect` and `useEffect` restore `scrollContainerRef.current.scrollTop` to `userScrollTopRef.current`.
* **Advantages**:
  * Eliminates layout jumping and unwanted smooth-scroll resets across all update sources (re-orders, manual refreshes, automated background refreshes, post-cache updates).
  * Instant, flicker-free position restoration without heavy DOM measurements.

### Option 2: Active Card Target Pinning
* **Mechanics**: Track the DOM ID of the clicked or active track card and execute `scrollIntoView()` on that element after re-renders.
* **Limitations**: High risk of viewport jumping if surrounding elements change height; fails to maintain position during background refreshes when no specific card is selected.

### Option 3: Relative Viewport Offset Anchoring
* **Mechanics**: Measure the relative percentage offset of the top visible element in the scroll container before state updates and re-anchor after render.
* **Limitations**: Added complexity and computational overhead without measurable benefit over container `scrollTop` preservation.

---

## Historical Code Reference

* **Version 0.12.2** (archived in `archive_v0.12.2.tar.gz`) preserves the codebase prior to implementing Option 1 scroll position logic, providing an exact reference point if rollback or comparison is needed.
