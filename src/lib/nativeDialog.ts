/**
 * Universal folder selector for Interstitial-er.
 * Uses Electron native openDirectory dialog when running in desktop app,
 * with a fallback prompt/picker when in browser mode.
 */

export async function selectFolder(defaultPath?: string): Promise<{
  success: boolean;
  path?: string;
  cancelled?: boolean;
  error?: string;
}> {
  if (typeof window !== 'undefined' && (window as any).electronAPI) {
    const api = (window as any).electronAPI;
    if (typeof api.selectFolder === 'function') {
      return await api.selectFolder(defaultPath);
    }
    if (typeof api.browseFolder === 'function') {
      return await api.browseFolder(defaultPath);
    }
  }

  // Web Browser fallback
  return new Promise((resolve) => {
    try {
      const userInput = window.prompt(
        'Enter full folder path on your computer or external drive:',
        defaultPath || ''
      );
      if (userInput === null) {
        resolve({ success: true, cancelled: true });
      } else if (userInput.trim() === '') {
        resolve({ success: true, cancelled: true });
      } else {
        resolve({ success: true, path: userInput.trim() });
      }
    } catch (err: any) {
      resolve({ success: false, error: err?.message || 'Failed to select folder' });
    }
  });
}
