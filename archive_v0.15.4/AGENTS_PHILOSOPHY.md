# Senior Engineering & Architecture Principles: Lean Desktop Core

## 1. Prime Directive: Simplicity & Functional Truth
- **Single Source of Truth**: Data flows unidirectionally from the local filesystem (`Media/`, `Calendar/`, `Logs/`) into local memory. Never create secondary mirrors, ghost cache objects, or redundant state layers.
- **Strict Verification Gates Before UI Mount**: The application must never render an interactive state or attempt background file operations with incomplete or unvalidated data. A strict, sequential gate (`INIT -> VERIFY_PATHS -> VERIFY_FILES -> READY`) blocks UI interactions until prerequisites are satisfied.
- **Immediate Predictability**: The user experience should feel like a sharp, dependable broadcast tool—fast file resolution, instant audio streaming, and zero background magic.

## 2. Anti-Patterns & Banned Over-Engineering
- **No Duplicate API Surfaces**: Do not create specialized endpoints for identical operations (e.g., three separate audio streaming routes for interstitials, evergreens, and playlists). One robust, range-supporting audio endpoint `/api/media/stream` serves all local audio.
- **No Parallel Uncoordinated Sync Loops**: Eliminate competing timers, polling intervals, and auto-fetch triggers. Data fetches occur upon explicit user actions, scheduled time-boundary events, or file system change notifications.
- **No Monolithic Source Files**: No single component or module should exceed 500 lines. Separate audio playback logic, schedule calculations, file operations, and UI views into modular, decoupled units.
- **No Phantom Features**: Remove half-implemented abstractions, dead configuration keys, unused UI debug toggles (rulers, artificial latency simulators), and unrequested scaffolding.

## 3. Desktop-First Performance
- **Local Filesystem as Database**: Simple, well-formatted JSON files (`interstitials.json`, `shows.json`, `logs.json`) are read on boot and written atomically on mutation.
- **Context-Driven On-Demand Caching**: Never scan or cache multi-gigabyte media directories globally at startup. Baseline startup remains lightweight and only verifies paths and schedule metadata. Large Evergreen and Playlist audio collections are indexed and cached in memory strictly when the user opens a specific show in the Prerecord, Export, or Playlist editing context (via the popup window), and released when that modal/session closes.
- **Reliable Audio Streaming**: Native HTML5 `<audio>` elements or standard Web Audio API buffers hooked into local byte-range Express routes.
