# Review Notes

## [review of 0.10.6] - Live Reads Alignment and Logging Robustness

This document contains the backend and functional review notes for the Interstitial-er application's Live Read ("Read") features, updated for version **0.10.6**.

---

### 1. Backend Code Review

#### A. Custom Time Parsing Utility (`src/lib/utils.ts`)
- **Assessment**: The implementation of `parseCustomTimeText` provides a unified, resilient parsing engine supporting 12-hour AM/PM formats (e.g., `"12:04 PM"`, `"03:15:30 AM"`) and 24-hour formats (e.g., `"14:05"`, `"09:45:12"`).
- **Reasoning/Why it matters**: Keeping parsing logic isolated in a central helper guarantees consistency between the Player Tab's schedule inputs and the Live Read Popout's logging inputs.
- **Recommendations for Future Improvement**:
  - *Date Boundary Handling*: When a user edits a time close to midnight (e.g. modifying a 23:55 slot to 00:05), the date object remains pinned to the slot's base date. Consider adding a subtle validation warning if a custom time shifts the execution date across the calendar boundary.

#### B. Legacy Log Inference & Compatibility (`src/components/LogTab.tsx`)
- **Assessment**: The backend legacy log fixing utilizes a file extension and text-matching heuristic (`getLogAssetType`). If a log entry lacks the explicit `assetType` property, the system inspects the filename and extension (`.txt`, `.md`, `.pdf`, `.doc`, etc.) or checks for descriptive words (like "read" or "script") to classify the item.
- **Reasoning/Why it matters**: This prevents historic log files (pre-0.10.x) from breaking the display, ensuring they are accurately categorized and decorated with the appropriate visual icons and exported tags.
- **Recommendations for Future Improvement**:
  - *Extensible Heuristic*: Maintain a configurable array of text-based document extensions to avoid hardcoding files list in the component helper in case additional file types are supported later.

---

### 2. Functional Application Behavior Review

#### A. Transient Input Validation & Reversion (`src/components/PlayerTab.tsx`)
- **Assessment**: Unlogged or uncommitted manual time adjustments cleanly revert back to the scheduled slot time if the window is closed or unchanged, preventing accidental database pollution. 
- **Reasoning/Why it matters**: If a broadcaster tests or adjusts a time temporarily, they do not expect a permanent schedule rewrite unless explicitly saved.
- **Recommendations for Future Improvement**:
  - *Clear Trigger*: Add a small "revert" or "x" icon button next to modified schedule inputs to let users immediately clear custom values back to their default scheduled times without backspacing.

#### B. Immediate Input Feedback and Button Safeguards
- **Assessment**: Invalid custom time formats trigger an instantaneous high-contrast red border around the input fields in both the Player Tab and the Live Read Popout. The "Log as Read" commit buttons are disabled on invalid entries.
- **Reasoning/Why it matters**: This prevents invalid format submissions from polluting the logging database or causing downstream CSV/Excel export parser errors.
- **Recommendations for Future Improvement**:
  - *Tooltip Helper*: Provide an overlay tooltip showing expected format options (e.g., "HH:MM or HH:MM AM/PM") when the input transitions into an invalid state, reducing user trial-and-error.

#### C. Animation Constraint Enforcement
- **Assessment**: Styling adjustments respect the global `.disable-animations` state rules, ensuring transitions do not cause rendering delays on resource-constrained broadcast host systems.
- **Reasoning/Why it matters**: Broadcast playout systems require high reliability and minimal visual overhead.
