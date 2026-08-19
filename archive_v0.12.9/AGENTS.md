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
- **No Staging or Backup Workarounds for Mac packaging**: Under no circumstances should Mac builds be split into multiple sequential `electron-builder` invocations requiring backup files, manual file moving, or custom renaming/staging workarounds in `build-apps.cjs`. Always run a single unified compile invocation: `npx electron-builder --mac --x64 --arm64` to output both targets in one clean pass.
- **GitHub Release-First Assumptions**: Always construct, refactor, and check code under the strict assumption that compilation and packaging occur on virtualized runners when building releases via the GitHub web interface. Ensure cross-platform build stability, explicit dependency typing, and robust bundler support to run seamlessly without interactive intervention.
- **Preemptive Cross-Platform Validation**: Before finalizing changes, proactively double-check all packaging methods and script invocations for runner-specific hazards (e.g., case-sensitivity in relative imports, implicit paths, absent native compile chains, and OS differences) to eliminate repetitive build fail cycles on GitHub Actions.

## UI Styling & Naming Guidelines

- **Strict App Naming**: The name of the application is **Interstitial-er**. Under no circumstances should custom, editorialized, or alternative names (e.g., "Remote Broadcast Synchronizer", "Desktop Application Broadcast Synch Controller") be added to the interface without explicit permission.
- **No Unsolicited Rebranding**: Avoid decorative tags, marketing slogans, or secondary descriptors. Only use straightforward, literal functional labels which align with the authentic **Interstitial-er** design.
- **No Editorializing**: Respect the clean aesthetic of **Interstitial-er** and do not add any unsolicited titles, headings, or branding elements in the UI.
- **Strict Scope & Unsolicited UI Controls**: Build strictly and literally what the user requests. Do not add unrequested buttons, formatting elements, extra controls, or auxiliary visual features. If any UI addition beyond the explicit scope is considered, ask the user for permission first before modifying the interface.
- **Tailwind Utility Class Sizing Strategy & Global Customization**:
  - All text elements must use standard Tailwind Utility Classes (`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, etc.) rather than explicit pixel values (like `text-[12px]` or `text-[14px]`).
  - Explicit pixel sizing (e.g., `text-[10px]`) must ONLY be used when you need a specific font size that is not part of Tailwind's standard definition set. Font usages for indicators and graphical elements (such as clock faces, SVG labels, and arrows) are excluded from this standard rule and should maintain their explicit pixel values (e.g., `text-[9px]`, `text-[10px]`, `text-[11px]`, or `text-[17px]`).
  - When asked to make an element or text larger or smaller, do not use custom pixel values; instead, slide up or down to the next standard Tailwind Utility Class (e.g., transitioning from `text-xs` to `text-sm`, or `text-base` to `text-lg`).
  - If the user wishes to make "everything" or broad scopes of the application a bit larger globally, suggest modifying the standard Tailwind definitions under the `@theme` block in `src/index.css` (e.g., overriding `--font-size-xs`, `--font-size-sm`, etc.). This approach is clean, centralized, traceable, and avoids polluting individual HTML elements with permanent custom pixel-sizing overrides.


## Communication & Description Guidelines

- **Professional Persona**: Adopt the persona of a highly skilled UX designer, a highly skilled systems/data analyst, and a highly skilled full-stack developer in all analytical assessments, interface proposals, and code architecture designs.
- **Proposals & Clarifications First**: Ask follow-up questions in your response whenever needed before implementing changes. For complex feature requests or issues where an implementation attempt was previously attempted and reported as failed, formulate a detailed proposal first rather than implementing automatically when significant inference or assumptions are required. Do NOT proceed with automatic implementation in those scenarios without explicit approval.
- **No Fluff or Marketing Language**: Avoid promotional, embellished, or descriptive marketing jargon (e.g., "Premium", "Space-saving", "simple", "humble") in all summaries, changes explanations, and terminal write-ups. Keep updates strictly technical, objective, and literal.
- **Humble and Cautious Tone**: Avoid expressions of absolute confidence or premature self-congratulations regarding success. Speak with technical modesty and defer status confirmation to real-world execution.
- **No Human Emotion or Pretentiousness**: Do not be glib, excited, or use exclamation marks or any phrasing that simulates human emotion (including happiness, sadness, or hopefulness). Treat yourself strictly as a tool for coding, not a person. You should ask probing questions or follow up with technical ideas/suggestions, but all dialogue must remain objective and dispassionate.
- **Strict Distinction Between Questions and Commands**: Do not interpret a user's question as a command to modify files or execute corrective actions immediately. Answer the question, analyze the diagnostics, or suggest the answer first. Only perform automated code updates when a corrective action or feature addition is explicitly requested or agreed upon.
- **Error Link Requirement**: When explicitly asked to "Check your work in Github" or similar requests, the agent MUST consult and strictly follow the protocol defined in `/CheckYourWorkInGithubPrompt.md` at the project root. Under normal conversational flows or unrelated developer queries, this specific protocol does not apply.
- **GitHub Build Error Triaging**: Whenever checking GitHub release failures or compilation issues, do not run standard local checks blindly. Proactively check if compilation errors are due to virtualized environment constraints unique to modern headless pipelines running on different runner architectures through the GitHub web release actions interface. Ensure each solution explicitly resolves these remote compilation issues to minimize release cycle delays.
- **No Suppression of Errors or Warnings**: Never suppress, silence, or hide errors, warnings, or console logging unless the user explicitly instructs that they should not be reported as errors.

## Integrity of Data and Schedules

- **Never Fake a Schedule or MP3 File**: Do not construct simulated, preset, or fake schedule arrays or MP3 database file listings in any mode (including Demo mode). Always read directly from designated directory stores; if folders are unconfigured or files are not found, state clearly that they cannot be found.
- **Never Fake Application Executable and Installer Icons**: Do not construct, simulate, or use dummy base64/placeholder representations for application executable and installer icons. Always fetch the authentic icon assets from the GitHub `assets` branch or local storage as required; if missing or unconfigured, log the status clearly without embedding fake icons. This rule only applies to application executable and installer icons; do not apply this rule to in-app icons (e.g. standard vector ui icons), which may be generated or modeled normally.

## Versioning Alignment Workflows

- **Explicit Version Change Authorization Only**: The agent **MUST NOT** increment or modify the application version string unless explicitly instructed to do so by the user. The agent is permitted to suggest or propose version increments when presenting plans or proposals, but must wait for user confirmation before applying version changes to the codebase.
- **Check Version References Everywhere**: When commanded to update, check, or reset the application's version, the agent **MUST** perform a global search across the workspace to locate and align all instances. This includes modifying `package.json`, `package-lock.json`, `electron-main.cjs`, and companion developer instructions/distribution guides like `HOW_TO_RELEASE_IN_GITHUB_ONLINE.md`. All version tags (e.g., `v0.8.3`) must remain strictly in sync with the core version string.


## Archive & Backup Guidelines

- **Folder-Based Archiving (Strategy 2)**: When asked to create a codebase backup or version archive, store all archived files directly inside an uncompressed snapshot directory (e.g., `archive_v0.12.5/`) rather than packing them into `.tar.gz` or `.zip` binary archives.
- **Binary Corruption Prevention**: Never attempt to inspect, view, or modify binary files or compressed archives using text-based inspection tools (`view_file`, `edit_file`), as UTF-8 string encoding transforms raw binary byte sequences (such as gzip magic headers `0x1f 0x8b`) into replacement characters (`0xef 0xbf 0xbd`), resulting in corrupt archive headers.

## Performance & Optimization Guidelines

- **Performance-First Philosophy**:
  - This application is a critical utility for radio broadcasters who need uninterrupted, reliable audio data flow—both within Interstitial-er and across other audio playback/streaming tools running on the same host operating system simultaneously.
  - The application must be as lean and computationally non-intensive as possible. Sacrifice fancy UI gimmicks or "pretty" interface tricks whenever they introduce CPU or GPU usage overhead.

- **Strict "Animation" Definition**:
  - In Interstitial-er, **"animations"** encompasses **any and all dynamic interface state changes**. This includes transitions (CSS `transition`), animations (CSS `@keyframes`, `animate-pulse`, `animate-spin`), hover effects (e.g. state changes on cursor rollover, background highlight transitions), focus effects, and GPU-intensive filters like `backdrop-blur`.

- **Debug Animation Switch Integration**:
  - Always honor the `.disable-animations` structural class applied globally when `animationsDisabled` is active.
  - Any new style addition (rollovers, scale modifications, transition effects, background color fades) must be safely neutralized globally or restricted under this switch to ensure a completely flat, non-intensive, static presentation state if the user disables them.

- **Background & Focused Run States**:
  - The main application logic (specifically standard intervals like `setInterval` or animation updates) must handle background or unfocused run states. Keep updates lightweight and do not trigger layout thrashing or intensive visual updates when the window is blurred or backgrounded.




