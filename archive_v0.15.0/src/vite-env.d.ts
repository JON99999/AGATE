/// <reference types="vite/client" />

declare module "*.png" {
  const value: string;
  export default value;
}

declare module "*.jpg" {
  const value: string;
  export default value;
}

declare module "*.jpeg" {
  const value: string;
  export default value;
}

declare module "*.svg" {
  const value: string;
  export default value;
}

interface Window {
  electronAPI?: {
    spawnLiveRead?: (data: any) => Promise<any>;
    getLiveReadData?: () => Promise<any>;
    logLiveReadCommit?: (logEntry: any) => Promise<any>;
    onLiveReadLogged?: (callback: (logEntry: any) => void) => () => void;
    onLiveReadOpened?: (callback: (data: any) => void) => () => void;
    onLiveReadClosed?: (callback: () => void) => () => void;
    focusLiveReadWindow?: () => Promise<any>;
    closeLiveReadWindow?: () => Promise<any>;
    onNavigate?: (callback: (data: { tab: string; subTab?: string }) => void) => () => void;
    setActiveTabMenu?: (tab: string, subTab?: string) => void;
    setLiveReadActive?: (active: boolean) => void;
    browseFolder?: (defaultPath?: string) => Promise<{ success: boolean; path?: string; cancelled?: boolean; error?: string }>;
    openPath?: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
  };
}

