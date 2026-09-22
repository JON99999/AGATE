# Color Scheme & Font Definition Reference

This reference documents the default Light theme font and color definitions for Interstitial-er.

> **CRITICAL DIRECTIVE**: The Light theme font and color settings documented below represent the mandatory default baseline. Do **NOT** change these Light theme settings in code or documentation unless explicitly instructed by the user.

---

## 1. Default "Light" Font & Typography Baseline

### A. Font Families & Imports
- **Sans-Serif Font Family (`--font-sans`)**: `"Inter", ui-sans-serif, system-ui, sans-serif`
  - **Google Font Import**: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700`
  - **Weights Supported**: 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold)
- **Monospace Font Family (`--font-mono`)**: `"JetBrains Mono", ui-monospace, SFMono-Regular, monospace`
  - **Google Font Import**: `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700`
  - **Weights Supported**: 400 (Regular), 500 (Medium), 700 (Bold)

### B. Font Sizing & Utility Strategy
- **Sizing Framework**: Standard Tailwind Utility Classes (`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, etc.).
- **Global Typography Scaling**: Broad/global size adjustments must be modified via Tailwind `--font-size-*` variables under `@theme` in `src/index.css` rather than per-element custom inline pixel overrides.
- **Explicit Pixel Exemptions**: Indicator elements, clock faces, SVG labels, and arrows maintain explicit pixel sizing (`text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[17px]`).

### C. Typography Baseline Alignment Rules
- **Form Controls**: `input, button, select, textarea` set to `font-family: inherit;`.
- **Monospace Vertical Alignment**: `.font-mono`, `code`, `kbd`, `pre`, `samp` utilize:
  ```css
  line-height: inherit;
  vertical-align: baseline;
  position: relative;
  top: 0.06em;
  ```

---

## 2. Color Definition Methods (`src/index.css`)

### A. CSS Custom Properties (:root & [data-theme="light"])
Global theme variables defined in `:root` / `[data-theme="light"]` and exposed through Tailwind CSS v4 `@theme`:

```css
:root, [data-theme="light"] {
  /* Centralized base border settings */
  --grid-border-base: #000000;
  --grid-border-active-opacity: 16%;   /* slate-300 equivalent */
  --grid-border-inactive-opacity: 9%;   /* slightly lighter */

  /* Base highlight colors */
  --grid-border-onetime-color: #a855f7;  /* purple */
  --grid-border-hourly-color: #3b82f6;   /* blue */
  --grid-border-advanced-color: #f97316; /* orange */

  /* Computations for standard borders */
  --card-border-active: color-mix(in srgb, var(--grid-border-base) var(--grid-border-active-opacity), transparent);
  --card-border-inactive: color-mix(in srgb, var(--grid-border-base) var(--grid-border-inactive-opacity), transparent);

  /* Highlight borders mixed with default black shading */
  --card-border-onetime: color-mix(in srgb, var(--grid-border-onetime-color) 40%, var(--grid-border-base) 15%);
  --card-border-hourly: color-mix(in srgb, var(--grid-border-hourly-color) 40%, var(--grid-border-base) 15%);
  --card-border-advanced: color-mix(in srgb, var(--grid-border-advanced-color) 40%, var(--grid-border-base) 15%);

  /* Font / Text Colors (Single set of variables for uniformity) */
  --fg-primary: #0f172a;      /* slate-900 */
  --fg-secondary: #475569;    /* slate-600 */
  --fg-muted: #64748b;        /* slate-500 */
  --fg-dim: #94a3b8;          /* slate-400 */
  --fg-inverse: #ffffff;      /* white */

  /* Background Colors */
  --bg-app: #f1f5f9;          /* slate-100 */
  --bg-surface: #ffffff;      /* white */
  --bg-surface-elevated: #f8fafc; /* slate-50 */
  --bg-input: #ffffff;
  --bg-header: #0f172a;       /* slate-900 */
  --bg-hover: #e2e8f0;        /* slate-200 */

  /* Border Colors */
  --border-main: #cbd5e1;     /* slate-300 */
  --border-subtle: #e2e8f0;   /* slate-200 */
  --border-strong: #94a3b8;   /* slate-400 */

  /* Show Shade Colors */
  --show-shade-odd-bg: #FFE385;
  --show-shade-odd-border: #D1B443;
  --show-shade-even-bg: #FFF6BC;
  --show-shade-even-border: #EADA76;
}

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;

  --color-fg-primary: var(--fg-primary);
  --color-fg-secondary: var(--fg-secondary);
  --color-fg-muted: var(--fg-muted);
  --color-fg-dim: var(--fg-dim);
  --color-fg-inverse: var(--fg-inverse);

  --color-bg-app: var(--bg-app);
  --color-bg-surface: var(--bg-surface);
  --color-bg-surface-elevated: var(--bg-surface-elevated);
  --color-bg-input: var(--bg-input);
  --color-bg-header: var(--bg-header);
  --color-bg-hover: var(--bg-hover);

  --color-border-main: var(--border-main);
  --color-border-subtle: var(--border-subtle);
  --color-border-strong: var(--border-strong);

  --color-grid-active: var(--card-border-active);
  --color-grid-inactive: var(--card-border-inactive);
  --color-grid-onetime: var(--card-border-onetime);
  --color-grid-hourly: var(--card-border-hourly);
  --color-grid-advanced: var(--card-border-advanced);
}
```

---

## 3. Default (Light Mode) Palette & Typography Mapping

### Application Canvas & Containers
- **Main Canvas Background**: `bg-slate-100` (`#f1f5f9`) / `var(--bg-app)`
- **Card / Content Panels**: `bg-white` (`#ffffff`) / `bg-slate-50` (`#f8fafc`) / `var(--bg-surface)`
- **Main Borders**: `border-slate-200` (`#e2e8f0`) / `border-slate-300` (`#cbd5e1`) / `var(--border-main)`

### Typography / Font Colors
- **Primary Text (`--fg-primary`)**: `text-slate-900` (`#0f172a`) / `text-slate-800` (`#1e293b`)
- **Secondary / Subtitle Text (`--fg-secondary`)**: `text-slate-600` (`#475569`) / `text-slate-500` (`#64748b`)
- **Muted / Hint Text (`--fg-muted`)**: `text-slate-400` (`#94a3b8`)
- **Inverse Text (`--fg-inverse`)**: `text-white` (`#ffffff`)
- **Accent Texts**:
  - Hourly / Blue: `text-blue-600` (`#2563eb`)
  - One-time / Purple: `text-purple-600` (`#9333ea`)
  - Advanced / Orange: `text-orange-600` (`#ea580c`)
  - Live / Emerald: `text-emerald-600` (`#059669`)
  - Warning / Amber: `text-amber-500` (`#f59e0b`)
  - Error / Red: `text-rose-600` (`#e11d48`) / `text-red-600` (`#dc2626`)

### Header & Shell
- **Bar Background**: `bg-slate-900` (`#0f172a`)
- **Bar Border**: `border-slate-800` (`#1e293b`)
- **Bar Text**: `text-slate-100` (`#f1f5f9`) / `text-slate-300` (`#cbd5e1`)
- **Folders Button**: `bg-slate-800 hover:bg-slate-700`, `text-slate-300 hover:text-white`, `border-slate-700`

---

## 4. Dark Mode Benchmark ("Folders" Modal Reference Scheme)

The **Folders Modal** (Storage Locations popup) established the benchmark palette for Dark Mode across the application:

- **Modal Backdrop**: `bg-slate-950/80` (`#020617` @ 80% opacity)
- **Modal Main Container**: `bg-slate-900` (`#0f172a`), `border-slate-800` (`#1e293b`)
- **Header Section**: `bg-slate-950/40`, `border-b border-slate-800`, Title: `text-white`, Icon: `text-blue-400`
- **Input Cards / Inner Panels**: `bg-slate-950` (`#020617`), `border-slate-900` (`#0f172a`)
- **Input Text / Values**: `text-slate-100` (`#f1f5f9`)
- **Input Labels**: `text-slate-400` (`#94a3b8`)
- **Placeholders**: `text-slate-600` (`#475569`)
- **Buttons / Actions**: `bg-slate-800 hover:bg-slate-700`, `border-slate-700`, `text-slate-300 hover:text-white`
- **Active Pills / Selection**: Gradient `from-blue-500 to-blue-600`, border `border-t-blue-400 border-b-blue-800`, `text-white`

---

## 5. Tailwind CSS v4 Theme Architecture (Light / Dark / System)

Interstitial-er implements a standard Tailwind CSS v4 theme architecture supporting three primary theme modes:

1. **Light Mode (`light`)**:
   - Explicitly sets `data-theme="light"` and removes `.dark` class on `document.documentElement`.
   - Native OS / browser controls use `color-scheme: light`.
   - Maintains the mandatory Light theme baseline colors.

2. **Dark Mode (`dark`)**:
   - Explicitly sets `data-theme="dark"` and adds `.dark` class on `document.documentElement`.
   - Native OS / browser controls use `color-scheme: dark`.
   - Leverages Tailwind v4 custom `@variant dark (&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *))` for standard `dark:` class utilities.

3. **System Mode (`system`)**:
   - Dynamically evaluates `window.matchMedia('(prefers-color-scheme: dark)')` to mirror the host OS/system theme preference.
   - Listens for real-time system color scheme changes and seamlessly updates attributes, classes, and CSS custom properties without requiring app reloads.

---

## 6. Show Schedule Shade Reference (`src/lib/utils.ts`)

- **Odd Index Show Header**: Background `#FFE385`, Border `#D1B443`
- **Even Index Show Header**: Background `#FFF6BC`, Border `#EADA76`
- **Dark Mode Show Header**:
  - Odd Index: Background `#3a3212`, Border `#665821`, Title Text `#FFE385`
  - Even Index: Background `#2e2912`, Border `#524921`, Title Text `#FFF6BC`

