export type ThemeId = 'light' | 'dark' | 'dark-test' | 'system' | string;

export interface ThemeColors {
  fgPrimary: string;
  fgSecondary: string;
  fgMuted: string;
  fgDim: string;
  fgInverse: string;

  bgApp: string;
  bgSurface: string;
  bgSurfaceElevated: string;
  bgInput: string;
  bgHeader: string;
  bgHover: string;

  borderMain: string;
  borderSubtle: string;
  borderStrong: string;

  showShadeOddBg: string;
  showShadeOddBorder: string;
  showShadeEvenBg: string;
  showShadeEvenBorder: string;

  underglowEmerald: string;
  underglowPurple: string;
  underglowBlue: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  colors: ThemeColors;
}

export const THEMES: Record<string, ThemeDefinition> = {
  light: {
    id: 'light',
    name: 'Light',
    colors: {
      fgPrimary: '#0f172a',      // slate-900
      fgSecondary: '#475569',    // slate-600
      fgMuted: '#64748b',        // slate-500
      fgDim: '#94a3b8',          // slate-400
      fgInverse: '#ffffff',      // white

      bgApp: '#f1f5f9',          // slate-100
      bgSurface: '#ffffff',      // white
      bgSurfaceElevated: '#f8fafc', // slate-50
      bgInput: '#ffffff',
      bgHeader: '#0f172a',       // slate-900
      bgHover: '#e2e8f0',        // slate-200

      borderMain: '#cbd5e1',     // slate-300
      borderSubtle: '#e2e8f0',   // slate-200
      borderStrong: '#94a3b8',   // slate-400

      showShadeOddBg: '#FFE385',
      showShadeOddBorder: '#D1B443',
      showShadeEvenBg: '#FFF6BC',
      showShadeEvenBorder: '#EADA76',

      underglowEmerald: '#a7f3d0',
      underglowPurple: '#e9d5ff',
      underglowBlue: '#dbeafe',
    },
  },
  dark: {
    id: 'dark',
    name: 'Dark',
    colors: {
      fgPrimary: '#f8fafc',      // slate-50
      fgSecondary: '#cbd5e1',    // slate-300
      fgMuted: '#94a3b8',        // slate-400
      fgDim: '#64748b',          // slate-500
      fgInverse: '#0f172a',      // slate-900

      bgApp: '#020617',          // slate-950 deep canvas background
      bgSurface: '#0f172a',      // slate-900 card surface
      bgSurfaceElevated: '#1e293b', // slate-800 elevated modals/popups
      bgInput: '#0f172a',
      bgHeader: '#020617',       // slate-950
      bgHover: '#1e293b',        // slate-800

      borderMain: '#334155',     // slate-700 crisp card borders
      borderSubtle: '#1e293b',   // slate-800 subtle dividers
      borderStrong: '#475569',   // slate-600 prominent borders

      showShadeOddBg: '#383a56',
      showShadeOddBorder: '#685315',
      showShadeEvenBg: '#222325',
      showShadeEvenBorder: '#524011',

      underglowEmerald: '#064e3b',
      underglowPurple: '#581c87',
      underglowBlue: '#1e3a8a',
    },
  },
  'dark-test': {
    id: 'dark-test',
    name: 'Dark Test',
    colors: {
      fgPrimary: '#f8fafc',      // slate-50
      fgSecondary: '#cbd5e1',    // slate-300
      fgMuted: '#94a3b8',        // slate-400
      fgDim: '#64748b',          // slate-500
      fgInverse: '#0f172a',      // slate-900

      bgApp: '#020617',          // slate-950 deep canvas background
      bgSurface: '#0f172a',      // slate-900 card surface
      bgSurfaceElevated: '#1e293b', // slate-800 elevated modals/popups
      bgInput: '#0f172a',
      bgHeader: '#020617',       // slate-950
      bgHover: '#1e293b',        // slate-800

      borderMain: '#334155',     // slate-700 crisp card borders
      borderSubtle: '#1e293b',   // slate-800 subtle dividers
      borderStrong: '#475569',   // slate-600 prominent borders

      showShadeOddBg: '#2C2C2B',
      showShadeOddBorder: '#404033',
      showShadeEvenBg: '#373B12',
      showShadeEvenBorder: '#52581B',

      underglowEmerald: '#064e3b',
      underglowPurple: '#581c87',
      underglowBlue: '#1e3a8a',
    },
  },
  system: {
    id: 'system',
    name: 'System',
    colors: {
      fgPrimary: '#0f172a',
      fgSecondary: '#475569',
      fgMuted: '#64748b',
      fgDim: '#94a3b8',
      fgInverse: '#ffffff',
      bgApp: '#f1f5f9',
      bgSurface: '#ffffff',
      bgSurfaceElevated: '#f8fafc',
      bgInput: '#ffffff',
      bgHeader: '#0f172a',
      bgHover: '#e2e8f0',
      borderMain: '#cbd5e1',
      borderSubtle: '#e2e8f0',
      borderStrong: '#94a3b8',
      showShadeOddBg: '#FFE385',
      showShadeOddBorder: '#D1B443',
      showShadeEvenBg: '#FFF6BC',
      showShadeEvenBorder: '#EADA76',
      underglowEmerald: '#a7f3d0',
      underglowPurple: '#e9d5ff',
      underglowBlue: '#dbeafe',
    },
  },
};

/**
 * Resolves effective theme ('light', 'dark', or 'dark-test') based on requested ThemeId and OS preferences
 */
export function getResolvedTheme(themeId: ThemeId): 'light' | 'dark' | 'dark-test' {
  if (themeId === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  if (themeId === 'dark-test') {
    return 'dark-test';
  }
  return themeId === 'dark' ? 'dark' : 'light';
}

let activeThemeId: ThemeId = 'light';
let mediaQueryListenerAttached = false;

function setupSystemThemeListener() {
  if (typeof window === 'undefined' || !window.matchMedia || mediaQueryListenerAttached) return;

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    if (activeThemeId === 'system') {
      applyTheme('system');
    }
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handleChange);
  } else if ('addListener' in mediaQuery) {
    (mediaQuery as any).addListener(handleChange);
  }

  mediaQueryListenerAttached = true;
}

export function applyTheme(themeId: ThemeId): ThemeDefinition {
  activeThemeId = themeId;
  setupSystemThemeListener();

  const root = document.documentElement;
  const resolved = getResolvedTheme(themeId);
  const theme = THEMES[resolved] || THEMES.dark;

  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-mode', themeId);

  if (resolved === 'dark' || resolved === 'dark-test') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }

  // Set CSS custom properties dynamically on documentElement
  Object.entries(theme.colors).forEach(([key, val]) => {
    const cssVarName = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
    root.style.setProperty(cssVarName, val);
  });

  try {
    localStorage.setItem('interstitialer_theme', themeId);
  } catch (e) {
    // Local storage unavailable or restricted
  }

  return THEMES[themeId] || theme;
}

export function getInitialTheme(): ThemeId {
  try {
    const saved = localStorage.getItem('interstitialer_theme');
    if (saved && (saved === 'system' || THEMES[saved])) {
      return saved as ThemeId;
    }
  } catch (e) {}
  return 'light';
}

