# Playlists Feature Implementation Specification & Prompts

This document contains the original feature prompt provided for the **Playlist** mode in **Interstitial-er**, followed by a structured 5-phase breakdown designed for sequential implementation and verification.

---

## Original Proposed Prompt

```text
1. Add a completely new functionality for a "Playlist" mode to go alongside Live, Prerecord, and Export.  Eventually, this may be rolled into the functionality of Live, Prerecord, and Export.  But for now, 
   1.a. duplicate the current Live mode to start the work on it.  
   1.b. Make that a 4th Player option next to Live, Prerecord, and Export.  
   1.c. When opening the "Playlist" mode, check for available mp3's in the current show and the next show's "Playlist" folder.  Offer the user the chance to pick from the current or the next show.  By default, if the time is 15 minutes or more into the current show, then offer the next show as the Default that is highlighted, and offer the current show as a selectable option.

2. Add the ability for the "Playlist" window to add customer songs along with the interstitials.  Do this by adding the following features.

3. First, extend the concept of "evergreen" folders by creating a duplicate set of folders for "playlists".  
   3.a. The "playlists" folder should be in the same default media folder as the evergreen folder.  
   3.b. And the rules for maintaining sub folders for each show's playlist should be the same as the sub folders for each evergreen.  
   3.c. In the "check evergreen folders" functionality, add the Playlist folders to the scope of the audit in the same manner as the Evergreen audit.  It should have the same safeguards against folder renaming and creation.  

4. In the playlist view, based on the show chosen, add the playlist mp3's to the proper spot on the live schedule by calculating their accumulated times, and putting them before and after interstitials in a way that gets the interstitial closest to the assigned time.  
   4.a. If a .m3u playlist exists in the folder, use that for the ordering of the mp3's.  If there are only files, then use the alphabetical order of the files.  
   4.b. When an Playlist song's play time would overlap an interstitial's scheduled start time, do the following:
      4.b.i. If the interstitial comes in the first half of the song, then place the song's card after the interstitial.  
      4.b.ii If the interstitial is scheduled in the second half of the song, then place the song's card before the interstitial.  
   4.c. For songs that were played:
      4.c.i Do not log them with the regular log.  Create an additional log, named for the short show name, date, and time, that includes the regular log info for that show, plus the info for each played playlist song.  
      4.c.ii Leave played playlist songs on the Player view at the timestamp when they were played, 
      4.c.iii and update the card's wording similar to how you do mp3 interstitial cards.   
   4.d. If songs go unplayed, assume something else was happening and that they still need to be played, and move the first unplayed card up to "now" position, and recalculate the start time of the first unplayed mp3 to be the current time.  
      4.d.i. Use the rules established above for reordering the unplayed mp3's throughout the remaining playlist.   
      4.d.ii Do this refresh check every 1 minute in the Playlist view when it is active... whenever nothing is playing and the live read popup is not open.
   4.e. Add 3 icons to each unplayed playlist song's mp3 card.  An up, a down, and an x.
   4.f. The "up" and "down" icons should shuffle the song one higher or one lower in the default order of the playlist songs.  
      4.f.i After clicking, the view should be refreshed to reflect the new order.  
      4.f.ii If the card is the first card, hide the up icon.  If the card is the last card, hide the down icon. 
      4.f.iii The "x" functionality should be to move the song from the playlist.  
   4.g Songs that have been "x"'d should be moved to the bottom of the show, just before the next show's title card.  
      4.g.i If any other songs have been x'd, put the new song at the bottom of the list.  
      4.g.ii x'd icons appearance should be grayed out with a flag of "cancelled" rather than "to be played".  
      4.g.iii The "x" icon should be replaced with an icon to indicate it can be reactivated.   
      4.g.iiii the reactivate icon should reverse the icons and formatting, and move the card to the last active playlist slot.
```

---

## Modular 5-Phase Implementation Breakdown

Use the following prompts individually in sequence to implement the Playlist feature step-by-step.

---

### Phase 1: Core Navigation & Player Tab Extension
**Objective**: Establish "Playlist" mode as a 4th mode in the Player interface and handle show selection logic.

**Prompt to copy/paste**:
> **Phase 1: Playlist Mode & Show Selector UI**
> Please implement Phase 1 of the Playlist feature in Interstitial-er:
> 1. Add `playlist` as a 4th Player mode alongside `live`, `prerecord`, and `export`.
> 2. Duplicate the core layout and behavior of Live mode to serve as the foundation for Playlist mode.
> 3. When entering Playlist mode, display a show selector dialog/dropdown checking available MP3 files in the current show and next show's playlist folders.
> 4. Default Selection Logic:
>    - If current time is ≥ 15 minutes into the current show's hour, default highlighted choice to the **Next Show** (with Current Show selectable).
>    - Otherwise, default to the **Current Show**.

---

### Phase 2: Folder Architecture & Storage Audit Extension
**Objective**: Create and audit parallel `playlists` folder structures alongside `evergreen` folders.

**Prompt to copy/paste**:
> **Phase 2: Playlists Folder Structure & Storage Audit**
> Please implement Phase 2 of the Playlist feature in Interstitial-er:
> 1. Extend media folder management by adding a top-level `playlists` directory alongside `evergreen`.
> 2. Ensure per-show subfolder rules for `playlists` match the existing `evergreen` subfolder conventions exactly.
> 3. Update the storage/evergreen audit functionality to include `playlists` folders in the health check and auto-maintenance scan, preserving all existing safeguards against accidental renaming or deletion.

---

### Phase 3: Timeline Assembly & Interstitial Alignment
**Objective**: Load playlist tracks (`.m3u` or alphabetical MP3s) and interleave them with scheduled interstitials based on duration calculations.

**Prompt to copy/paste**:
> **Phase 3: Playlist Track Assembly & Interstitial Alignment**
> Please implement Phase 3 of the Playlist feature in Interstitial-er:
> 1. In Playlist mode for the chosen show, load track ordering from a `.m3u` playlist file if present; otherwise, sort MP3 files alphabetically.
> 2. Calculate cumulative playback timestamps for all playlist tracks and interleave them with scheduled show interstitials.
> 3. Interstitial Overlap Alignment Rules:
>    - If a scheduled interstitial falls within the **first half** of a song's duration, place the song card **after** the interstitial.
>    - If a scheduled interstitial falls within the **second half** of a song's duration, place the song card **before** the interstitial.

---

### Phase 4: Dynamic Minute Refresh & Custom Playlist Logging
**Objective**: Maintain an active timeline for unplayed tracks and generate dedicated playlist log files.

**Prompt to copy/paste**:
> **Phase 4: Dynamic Timeline Refresh & Show Playlist Log Generation**
> Please implement Phase 4 of the Playlist feature in Interstitial-er:
> 1. Add a 1-minute periodic refresh timer when Playlist mode is active (and no audio is playing and live read popup is closed):
>    - If songs remain unplayed behind schedule, move the first unplayed track to "now" (current timestamp) and recalculate remaining playlist track start times.
> 2. Played Song Display:
>    - Retain played playlist song cards on the Player view at their exact play timestamp with updated completion state typography matching MP3 interstitials.
> 3. Logging Separation:
>    - Do not write playlist songs to the primary log file.
>    - Create a dedicated playlist log file named after the short show name, date, and time (`<ShortShowName>_<Date>_<Time>_playlist.log`), containing regular interstitial events plus played playlist track metadata.

---

### Phase 5: Reordering Controls & Cancel/Reactivate Workflow
**Objective**: Provide interactive Up/Down reordering and Cancel (X) / Reactivate controls on playlist song cards.

**Prompt to copy/paste**:
> **Phase 5: Interactive Queue Controls (Up, Down, Cancel, Reactivate)**
> Please implement Phase 5 of the Playlist feature in Interstitial-er:
> 1. Add 3 action icons to each unplayed playlist song card: **Up**, **Down**, and **Cancel (X)**.
> 2. Reordering Logic:
>    - Clicking **Up** or **Down** shifts the song position in the active playlist queue and triggers an instant view recalculation.
>    - Hide the **Up** icon on the top active card; hide the **Down** icon on the bottom active card.
> 3. Cancelation (X) Workflow:
>    - Clicking **Cancel (X)** moves the song to the bottom of the show list, directly above the next show's title card.
>    - Format cancelled song cards with grayed-out styling and a "Cancelled" badge instead of "To Be Played".
>    - Replace the **Cancel (X)** icon on cancelled cards with a **Reactivate** icon.
> 4. Reactivation Workflow:
>    - Clicking **Reactivate** restores normal active card formatting and moves the song card back to the last active slot in the playlist queue.
