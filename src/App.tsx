/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Calendar,
  Clock,
  List,
  Settings,
  Plus,
  Play,
  Check,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Save,
  Trash2,
  History,
  Folder,
  HardDrive,
  HardDriveDownload,
  RotateCcw,
  Wifi,
  WifiOff,
  ShieldCheck,
  Mail,
  Globe,
  ExternalLink,
  Download,
  FolderOpen,
  HelpCircle,
  Sun,
  Moon,
  Laptop,
  RadioTower,
  CassetteTape,
  ListOrdered,
  ListMusic,
  AlarmClock,
  NotebookPen,
  Undo2,
  Zap,
  ZapOff,
  Square,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  format,
  addHours,
  subHours,
  isSameMinute,
  startOfHour,
  addMinutes,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  endOfDay,
} from "date-fns";
import { Interstitial, InterstitialType, LogEntry, Show } from "./types";
import PlayerTab from "./components/PlayerTab";
import CalendarTab from "./components/CalendarTab";
import LogTab from "./components/LogTab";
import LiveReadPopout from "./components/LiveReadPopout";
import GoogleAuthSection from "./components/GoogleAuthSection";
import LocalHelpModal from "./components/LocalHelpModal";
import { getInitialTheme, applyTheme, ThemeId } from "./lib/theme";
import { cn, extractFolderId, getSortedShows, getShowShade, isTimeInShow } from "./lib/utils";
import {
  initAuth,
  googleSignIn,
  handleLogout,
  getAccessToken,
  setOverrideAccessToken,
  loadCalendarFromDrive,
  saveCalendarToDrive,
  loadShowsFromDrive,
  saveShowsToDrive,
  loadLogsFromDrive,
  appendLogToDrive,
  listMP3sFromDrive,
  updateAudioCache,
  updateAudioCacheWithProgress,
  CachingProgressReport,
  DRIVE_FOLDERS,
  mp3BlobCache,
  mp3DurationCache,
  validateGoogleDriveAccess,
  getSavedSettings,
  saveSettings,
  LocationSettings,
  DEFAULT_SETTINGS,
  driveFileNameCache,
  availableFilesCache,
  triggerDriveBackup,
  checkPlaylistShowFilesOnDrive,
} from "./lib/driveService";

const getFutureDatesForShow = (
  showDay: string,
  startHour?: number,
  startMinute?: number
): Date[] => {
  const daysOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];
  const targetDayIndex = daysOfWeek.indexOf(showDay);
  if (targetDayIndex === -1) return [];

  const occurrences: Date[] = [];
  const now = new Date();
  const start = new Date();
  for (let i = 0; i < 62; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (d.getDay() === targetDayIndex) {
      if (i === 0 && startHour !== undefined && startMinute !== undefined) {
        const showStart = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          startHour,
          startMinute,
          0,
          0
        );
        if (showStart <= now) {
          continue;
        }
      }
      occurrences.push(d);
    }
  }
  return occurrences;
};

export default function App() {
  const isPopout = typeof window !== "undefined" && window.location.search.includes("popout=true");

  if (isPopout) {
    return <LiveReadPopout />;
  }

  const isPlayerMode = (import.meta as any).env?.VITE_APP_MODE === "Player";

  // Custom fetch override to support local environment ports transparently
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("/api/")) {
      const isCustomProtocol =
        typeof window !== "undefined" &&
        !window.location.protocol.startsWith("http");
      const baseUrl = isCustomProtocol ? "http://127.0.0.1:3000" : "";
      url = `${baseUrl}${url}`;
    }
    return window.fetch(url, init);
  };

  const [activeTab, setActiveTab] = useState<"player" | "calendar" | "log">(
    "player",
  );
  const [calendarSubTab, setCalendarSubTab] = useState<"calendar" | "list" | "shows">(
    "calendar",
  );

  useEffect(() => {
    if ((window as any).electronAPI?.setActiveTabMenu) {
      (window as any).electronAPI.setActiveTabMenu(activeTab, calendarSubTab);
    }
  }, [activeTab, calendarSubTab]);
  const [durationUpdates, setDurationUpdates] = useState(0);

  // Fetch folder name/descriptor helper
  const fetchDriveFolderDescriptor = async (
    folderId: string,
    currentToken: string | null,
  ): Promise<string> => {
    if (!folderId) return "Not Configured";
    let defaultName = "";
    if (folderId === "1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED")
      defaultName = "calendar";
    else if (folderId === "11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch")
      defaultName = "medialibrary";
    else if (folderId === "1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx")
      defaultName = "logs";

    if (!currentToken)
      return (
        defaultName || `Google Drive Folder [${folderId.substring(0, 6)}...]`
      );
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name,owners(displayName,emailAddress)`,
        {
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        },
      );
      if (res.ok) {
        const data = await res.json();
        const folderName = data.name || defaultName || "Unnamed Folder";
        const ownerName = data.owners?.[0]?.displayName || "";
        const ownerEmail = data.owners?.[0]?.emailAddress || "";
        const ownerStr =
          ownerName && ownerEmail
            ? ` (${ownerName}, ${ownerEmail})`
            : ownerName
              ? ` (${ownerName})`
              : ownerEmail
                ? ` (${ownerEmail})`
                : "";
        return `${folderName}${ownerStr}`;
      }
    } catch (e) {
      console.warn("Failed to fetch name for drive folder ID:", folderId, e);
    }
    return (
      defaultName || `Google Drive Folder [${folderId.substring(0, 6)}...]`
    );
  };

  // Archiving/backup implementation
  const runArchiving = async (mode: "Local" | "Drive" | "Demo") => {
    if (hasBackedUpThisSessionRef.current) {
      console.log(
        "Archiving already completed for this session of the folder. Skipping.",
      );
      return;
    }
    try {
      if (mode === "Local") {
        const res = await fetch("/api/trigger-backup", { method: "POST" });
        if (!res.ok) {
          throw new Error("Local archiving failed");
        }
      } else if (mode === "Drive" || mode === "Demo") {
        await triggerDriveBackup();
      }
      console.log("Archiving of interstitials and logs completed successfully");
      hasBackedUpThisSessionRef.current = true;
    } catch (err: any) {
      console.error("Archiving sequence failed: ", err);
      setIsDriveValidated(false);
      if (mode === "Local") {
        setLocalPathsUnavailable(true);
      } else {
        setDriveValidationError(
          err.message ||
            "Archiving failed: Google Drive connection is inaccessible or blocked.",
        );
      }
      setShowLocationsModal(true);
    }
  };

  useEffect(() => {
    const handler = () => setDurationUpdates((prev) => prev + 1);
    window.addEventListener("mp3-duration-cached", handler);
    return () => window.removeEventListener("mp3-duration-cached", handler);
  }, []);

  useEffect(() => {
    document.title = isPlayerMode
      ? "Interstitial-er Player"
      : "Interstitial-er Admin";
  }, [isPlayerMode]);
  const [isAdmin, setIsAdmin] = useState(false);

  // === DEBUG ANIMATION SWITCH START ===
  interface OptimizationConfig {
    cssAnimations: boolean;
    hoverTransitions: boolean;
    hoverTransforms: boolean;
    hoverShadowsFilters: boolean;
    backdropBlurs: boolean;
    webWorkers: boolean;
    pointerEventsNeutralization: boolean;
    gpuCompositingLayering: boolean;
  }

  const DEFAULT_OPTIMIZATIONS: OptimizationConfig = {
    cssAnimations: true,
    hoverTransitions: false,
    hoverTransforms: false,
    hoverShadowsFilters: false,
    backdropBlurs: false,
    webWorkers: false,
    pointerEventsNeutralization: false,
    gpuCompositingLayering: true,
  };

  const [animationsDisabled, setAnimationsDisabled] = useState(() => {
    return localStorage.getItem("debug_animations_disabled") === "true";
  });

  const [activeOptimizations, setActiveOptimizations] = useState<OptimizationConfig>(() => {
    try {
      const stored = localStorage.getItem("debug_active_optimizations");
      if (stored) {
        return { ...DEFAULT_OPTIMIZATIONS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error("Failed to parse active optimizations", e);
    }
    return DEFAULT_OPTIMIZATIONS;
  });

  const [isOptimizationConfigOpen, setIsOptimizationConfigOpen] = useState(false);
  const [tempOptimizations, setTempOptimizations] = useState<OptimizationConfig>(DEFAULT_OPTIMIZATIONS);

  // Caching Progress Modal State
  const [showCachingModal, setShowCachingModal] = useState(false);
  const [cachingTargetMode, setCachingTargetMode] = useState<"Live" | "Prerecord" | "Export" | "Playlist" | null>(null);
  const [currentPlaylistTrackUrls, setCurrentPlaylistTrackUrls] = useState<string[]>([]);
  const [cachingProgress, setCachingProgress] = useState<CachingProgressReport>({
    total: 0,
    completed: 0,
    failed: 0,
    errors: [],
    isComplete: false
  });

  const triggerCachingForMode = async (
    targetMode: "Live" | "Prerecord" | "Export" | "Playlist",
    additionalUrls?: string[]
  ) => {
    if (additionalUrls && additionalUrls.length > 0) {
      setCurrentPlaylistTrackUrls(additionalUrls);
    }

    const interstitialUrls = interstitials
      .filter((s) => s.enabled && s.mp3Url)
      .map((s) => s.mp3Url);

    const playlistUrls = (additionalUrls && additionalUrls.length > 0)
      ? additionalUrls
      : currentPlaylistTrackUrls;

    let activeUrls: string[] = [];
    if (targetMode === "Playlist" || (playlistUrls && playlistUrls.length > 0)) {
      activeUrls = Array.from(new Set([...interstitialUrls, ...playlistUrls]));
    } else {
      activeUrls = Array.from(new Set(interstitialUrls));
    }

    activeUrls = activeUrls.filter(Boolean);

    if (activeUrls.length === 0) {
      return;
    }

    const allAlreadyCached = activeUrls.length > 0 && activeUrls.every(url => mp3BlobCache.has(url));

    setCachingTargetMode(targetMode);
    if (!allAlreadyCached) {
      setShowCachingModal(true);
      setCachingProgress({
        total: activeUrls.length,
        completed: 0,
        failed: 0,
        errors: [],
        isComplete: false
      });
    }

    const report = await updateAudioCacheWithProgress(
      activeUrls,
      getAccessToken() || token,
      (currentReport) => {
        if (!allAlreadyCached) {
          setCachingProgress(currentReport);
        }
      }
    );

    if (report.isComplete) {
      if (report.failed === 0 && !allAlreadyCached) {
        setTimeout(() => {
          setShowCachingModal(false);
        }, 1200);
      }
    }
  };

  useEffect(() => {
    if (isOptimizationConfigOpen) {
      setTempOptimizations(activeOptimizations);
    }
  }, [isOptimizationConfigOpen, activeOptimizations]);

  const toggleAnimations = () => {
    if (animationsDisabled) {
      // If active (red), click turns optimizations OFF completely (animations ON)
      setAnimationsDisabled(false);
      localStorage.setItem("debug_animations_disabled", "false");
    } else {
      // If inactive (yellow), click opens the configuration modal to configure and turn optimizations ON
      setIsOptimizationConfigOpen(true);
    }
  };
  // === DEBUG ANIMATION SWITCH END ===

  // Audio playing navigation guard
  const [showAudioPlayingNavModal, setShowAudioPlayingNavModal] = useState(false);
  const pendingNavActionRef = useRef<(() => void) | null>(null);

  const confirmNavAction = (action: () => void) => {
    if (
      typeof (window as any).interstitialerIsAudioPlaying === "function" &&
      (window as any).interstitialerIsAudioPlaying()
    ) {
      pendingNavActionRef.current = action;
      setShowAudioPlayingNavModal(true);
    } else {
      action();
    }
  };

  const [isWindowFocused, setIsWindowFocused] = useState(true);

  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    if (typeof document !== "undefined" && document.hasFocus) {
      setIsWindowFocused(document.hasFocus());
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);
  const [interstitials, setInterstitials] = useState<Interstitial[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadShows = async () => {
    const settings = getSavedSettings();
    if (settings.mode === "Drive") {
      try {
        const currentToken = getAccessToken() || token;
        if (!currentToken) {
          throw new Error("Not connected to Google Drive.");
        }
        const driveShows = await loadShowsFromDrive();
        setShows(driveShows || []);
      } catch (e) {
        console.error("Failed to load shows from Drive:", e);
      }
      return;
    }

    try {
      const res = await fetch("/api/shows");
      if (res.ok) {
        const data = await res.json();
        setShows(data || []);
      }
    } catch (e) {
      console.error("Failed to load shows:", e);
    }
  };

  const saveShows = async (newShows: Show[]) => {
    const settings = getSavedSettings();
    if (settings.mode === "Drive") {
      try {
        const currentToken = getAccessToken() || token;
        if (!currentToken) {
          throw new Error("Not connected to Google Drive. Saving is disabled.");
        }
        await saveShowsToDrive(newShows);
        setShows(newShows);
      } catch (error) {
        console.error("Failed to save shows to Drive:", error);
      }
      return;
    }

    try {
      await fetch("/api/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newShows),
      });
      setShows(newShows);
    } catch (error) {
      console.error("Failed to save shows:", error);
    }
  };
  const [now, setNow] = useState(new Date());
  const [syncTime, setSyncTime] = useState(new Date());
  const [countdown, setCountdown] = useState(300);
  const [scrollTrigger, setScrollTrigger] = useState(0);

  // Prerecord & Playlist States
  const [playMode, setPlayMode] = useState<"Live" | "Prerecord" | "Export" | "Playlist">(
    "Live",
  );
  const [selectedPlaylistShow, setSelectedPlaylistShow] = useState<Show | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlistModalLoading, setPlaylistModalLoading] = useState(false);
  const [playlistModalNow, setPlaylistModalNow] = useState<Date>(new Date());
  const [playlistShowOptions, setPlaylistShowOptions] = useState<{
    currentShow: Show | null;
    nextShow: Show | null;
    defaultShowId: string;
    currentShowFileCount: number;
    nextShowFileCount: number;
    elapsedMinutes: number;
    is15MinsOrMore: boolean;
  } | null>(null);
  const playlistShowOptionsRef = useRef<typeof playlistShowOptions>(null);
  playlistShowOptionsRef.current = playlistShowOptions;
  const [chosenPlaylistShowId, setChosenPlaylistShowId] = useState<string>("");
  const [prerecordModalTarget, setPrerecordModalTarget] = useState<
    "Prerecord" | "Export"
  >("Prerecord");
  const [prerecordDate, setPrerecordDate] = useState<Date | null>(null);
  const [showPrerecordModal, setShowPrerecordModal] = useState(false);
  const [prerecordDateInput, setPrerecordDateInput] = useState("");
  const [prerecordTimeInput, setPrerecordTimeInput] = useState("");
  const [prerecordHoursInput, setPrerecordHoursInput] = useState("2");
  const [prerecordMinutesInput, setPrerecordMinutesInput] = useState("0");
  const [prerecordLengthMinutes, setPrerecordLengthMinutes] = useState(120);
  const [prerecordError, setPrerecordError] = useState<string | null>(null);
  const [prerecordSelectorMode, setPrerecordSelectorMode] = useState<"show-list" | "manual">("show-list");
  const [selectedPrerecordShowId, setSelectedPrerecordShowId] = useState<string>("");
  const [showFilterText, setShowFilterText] = useState("");
  const dateSelectRef = useRef<HTMLSelectElement>(null);

  const isPre = playMode === "Prerecord";

  // Export Prerecord states
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportState, setExportState] = useState<
    "idle" | "configuring" | "exporting" | "success" | "error"
  >("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<{
    exportFolder: string;
    copiedCount: number;
    missingCount: number;
    totalCount: number;
    baseFilename?: string;
    txtFilename?: string;
    m3uFilename?: string;
  } | null>(null);

  // Export configuration draft states
  const [exportDestinationInput, setExportDestinationInput] = useState("");
  const [exportFolderPrefixInput, setExportFolderPrefixInput] =
    useState("Show");
  const [exportTextPrefixInput, setExportTextPrefixInput] =
    useState("Show");
  const [exportPlaylistPrefixInput, setExportPlaylistPrefixInput] = useState(
    "Show",
  );

  // Custom Folder Location settings matching multi modes: Local, Drive, Demo
  const [locationMode, setLocationMode] = useState<"Local" | "Drive" | "Demo">(
    "Demo",
  );

  const formatVerifyAirDate = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dateStr;
  };
  const [localPathMP3s, setLocalPathMP3s] = useState("");
  const [localPathLogs, setLocalPathLogs] = useState("");
  const [localPathCalendar, setLocalPathCalendar] = useState("");

  const [driveFolderLogs, setDriveFolderLogs] = useState("");
  const [driveFolderMP3s, setDriveFolderMP3s] = useState("");
  const [driveFolderPreferences, setDriveFolderPreferences] = useState("");

  // Draft States for Folder Configuration Form inputs
  const [draftLocalPathMP3s, setDraftLocalPathMP3s] = useState("");
  const [draftLocalPathLogs, setDraftLocalPathLogs] = useState("");
  const [draftLocalPathCalendar, setDraftLocalPathCalendar] = useState("");

  const [draftDriveFolderLogs, setDraftDriveFolderLogs] = useState("");
  const [draftDriveFolderMP3s, setDraftDriveFolderMP3s] = useState("");
  const [draftDriveFolderPreferences, setDraftDriveFolderPreferences] =
    useState("");

  const [localPathsUnavailable, setLocalPathsUnavailable] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [locationsSuccess, setLocationsSuccess] = useState<string | null>(null);

  // Google Drive & Auth States
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isDriveActive, setIsDriveActive] = useState(false);
  const [isDriveValidated, setIsDriveValidated] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isAsleep, setIsAsleep] = useState(false);
  const lastActiveTimeRef = useRef<number>(Date.now());
  const [isValidatingDrive, setIsValidatingDrive] = useState(false);
  const [driveValidationError, setDriveValidationError] = useState<
    string | null
  >(null);
  const [googleClientId, setGoogleClientId] = useState(
    () =>
      localStorage.getItem("interstitialer_google_client_id") ||
      "776109899422-4ui9sqip5tvjarmcmrmnb4p3pdni0b2n.apps.googleusercontent.com",
  );
  const [isPollingExternal, setIsPollingExternal] = useState(false);
  const [showMethodB, setShowMethodB] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [driveMP3s, setDriveMP3s] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const fetchInProgressRef = useRef(false);
  const hasBackedUpThisSessionRef = useRef(false);
  const [showLocationsModal, setShowLocationsModal] = useState(false);
  const [showLocalHelp, setShowLocalHelp] = useState(false);

  // Prerecord Confirmation states
  const [showPrerecordConfirmStep, setShowPrerecordConfirmStep] =
    useState(false);
  const [prerecordConfirmDetails, setPrerecordConfirmDetails] = useState<{
    startDate: Date;
    totalMinutes: number;
  } | null>(null);

  // Google Drive folder descriptors and edit fields
  const [driveFolderDescMap, setDriveFolderDescMap] = useState<
    Record<string, string>
  >({
    "1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED": "calendar",
    "11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch": "medialibrary",
    "1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx": "logs",
  });
  const [editingDriveField, setEditingDriveField] = useState<
    "preferences" | "mp3s" | "logs" | null
  >(null);
  const [tempPasteLink, setTempPasteLink] = useState("");

  // Sync map descriptors for drive folders when authenticated
  useEffect(() => {
    const fetchNames = async () => {
      const currentToken = getAccessToken() || token;
      if (!currentToken) return;

      const idsToFetch = [
        driveFolderPreferences,
        driveFolderMP3s,
        driveFolderLogs,
        "1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED",
        "11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch",
        "1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx",
      ].filter(
        (id) =>
          id &&
          (!driveFolderDescMap[id] || !driveFolderDescMap[id].includes("(")),
      );

      if (idsToFetch.length === 0) return;

      const newMap = { ...driveFolderDescMap };
      let changed = false;
      for (const id of idsToFetch) {
        try {
          const desc = await fetchDriveFolderDescriptor(id, currentToken);
          newMap[id] = desc;
          changed = true;
        } catch (e) {}
      }
      if (changed) {
        setDriveFolderDescMap(newMap);
      }
    };
    fetchNames();
  }, [token, driveFolderPreferences, driveFolderMP3s, driveFolderLogs]);

  // Sync map descriptors for draft states as well
  useEffect(() => {
    const fetchDraftNames = async () => {
      const currentToken = getAccessToken() || token;
      if (!currentToken) return;

      const idsToFetch = [
        draftDriveFolderPreferences,
        draftDriveFolderMP3s,
        draftDriveFolderLogs,
        "1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED",
        "11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch",
        "1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx",
      ].filter(
        (id) =>
          id &&
          (!driveFolderDescMap[id] || !driveFolderDescMap[id].includes("(")),
      );

      if (idsToFetch.length === 0) return;

      const newMap = { ...driveFolderDescMap };
      let changed = false;
      for (const id of idsToFetch) {
        try {
          const desc = await fetchDriveFolderDescriptor(id, currentToken);
          newMap[id] = desc;
          changed = true;
        } catch (e) {}
      }
      if (changed) {
        setDriveFolderDescMap(newMap);
      }
    };
    fetchDraftNames();
  }, [
    token,
    draftDriveFolderPreferences,
    draftDriveFolderMP3s,
    draftDriveFolderLogs,
  ]);

  // Application Theme State
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(() => getInitialTheme());
  const [mobileThemeExpanded, setMobileThemeExpanded] = useState(false);
  const [mobileModeExpanded, setMobileModeExpanded] = useState(false);

  const getModeTextHideClass = (mode: "Live" | "Prerecord" | "Export" | "Playlist") => {
    const defaultOrder: ("Live" | "Prerecord" | "Export" | "Playlist")[] = ["Playlist", "Export", "Prerecord", "Live"];
    if (playMode === mode) {
      return "hide-mode-text-tier-4";
    }
    const unselected = defaultOrder.filter((m) => m !== playMode);
    const index = unselected.indexOf(mode);
    if (index === 0) return "hide-mode-text-tier-1";
    if (index === 1) return "hide-mode-text-tier-2";
    return "hide-mode-text-tier-3";
  };

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const handleThemeChange = (newTheme: ThemeId) => {
    setCurrentTheme(newTheme);
    applyTheme(newTheme);
  };

  // Fancy Browser folder modal states
  const [showFancyBrowser, setShowFancyBrowser] = useState(false);
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1024,
    height: typeof window !== "undefined" ? window.innerHeight : 768,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [fancyBrowserPath, setFancyBrowserPath] = useState("");
  const [fancyBrowserFolders, setFancyBrowserFolders] = useState<string[]>([]);
  const [fancyBrowserParent, setFancyBrowserParent] = useState<string | null>(
    null,
  );
  const [fancyBrowserError, setFancyBrowserError] = useState<string | null>(
    null,
  );
  const [fancyBrowserTargetField, setFancyBrowserTargetField] = useState<
    "interstitials" | "mp3s" | "logs" | null
  >(null);

  // Saving state for Folders Modal to prevent button flickering
  const [isSavingAndVerifying, setIsSavingAndVerifying] = useState(false);

  const checkLocalPathsSafely = async (
    mp3s: string,
    logs: string,
    calendar: string,
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/check-local-paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localPathMP3s: mp3s,
          localPathLogs: logs,
          localPathCalendar: calendar,
        }),
      });
      const data = await res.json();
      return !!data.exists;
    } catch {
      return false;
    }
  };

  // Synchronization hook to update editable drafts when location settings modal opens
  useEffect(() => {
    if (showLocationsModal) {
      setDraftLocalPathMP3s(localPathMP3s || "");
      setDraftLocalPathLogs(localPathLogs || "");
      setDraftLocalPathCalendar(localPathCalendar || "");
      setDraftDriveFolderLogs(driveFolderLogs || "");
      setDraftDriveFolderMP3s(driveFolderMP3s || "");
      setDraftDriveFolderPreferences(driveFolderPreferences || "");
    }
  }, [
    showLocationsModal,
    localPathMP3s,
    localPathLogs,
    localPathCalendar,
    driveFolderLogs,
    driveFolderMP3s,
    driveFolderPreferences,
  ]);

  // Google Auth initialization with Validation
  useEffect(() => {
    const settings = getSavedSettings();
    let hasPrepopulated = false;
    if (!settings.driveFolderLogs) {
      settings.driveFolderLogs = "1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx";
      hasPrepopulated = true;
    }
    if (!settings.driveFolderMP3s) {
      settings.driveFolderMP3s = "11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch";
      hasPrepopulated = true;
    }
    if (!settings.driveFolderPreferences) {
      settings.driveFolderPreferences = "1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED";
      hasPrepopulated = true;
    }

    if (hasPrepopulated) {
      localStorage.setItem(
        "interstitialer_location_settings",
        JSON.stringify(settings),
      );
    }

    setLocationMode(settings.mode);
    setLocalPathMP3s(settings.localPathMP3s || "");
    setLocalPathLogs(settings.localPathLogs || "");
    setLocalPathCalendar(settings.localPathCalendar || "");
    setDriveFolderLogs(settings.driveFolderLogs || "");
    setDriveFolderMP3s(settings.driveFolderMP3s || "");
    setDriveFolderPreferences(settings.driveFolderPreferences || "");

    // Notify backend
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    }).catch(() => {});

    if (settings.mode === "Local") {
      checkLocalPathsSafely(
        settings.localPathMP3s || "",
        settings.localPathLogs || "",
        settings.localPathCalendar || "",
      )
        .then((exists) => {
          setIsDriveActive(true);
          if (exists) {
            setIsDriveValidated(true);
            setLocalPathsUnavailable(false);
            fetchDataForMode(settings);
          } else {
            setIsDriveValidated(false);
            setLocalPathsUnavailable(true);
            setLoading(false);
            setShowLocationsModal(true);
          }
        })
        .catch(() => {
          setIsDriveActive(true);
          setIsDriveValidated(false);
          setLocalPathsUnavailable(true);
          setLoading(false);
          setShowLocationsModal(true);
        });
    } else if (settings.mode === "Demo") {
      setIsDriveActive(true);
      setIsDriveValidated(false);
      setLocalPathsUnavailable(false);
    }

    const unsubscribe = initAuth(
      async (currentUser, tokenStr) => {
        const uSettings = getSavedSettings();
        setUser(currentUser);
        setToken(tokenStr);

        if (uSettings.mode === "Drive" || uSettings.mode === "Demo") {
          setIsDriveActive(true);
          setIsValidatingDrive(true);
          setDriveValidationError(null);
          try {
            const success = await validateGoogleDriveAccess();
            if (success) {
              setIsDriveValidated(true);
              setDriveValidationError(null);
              fetchDataForMode(uSettings);
            } else {
              setIsDriveValidated(false);
              setDriveValidationError(
                "Connected Google account lacks read/write access to one or more configured shared directories.",
              );
              setLoading(false);
              setShowLocationsModal(true);
            }
          } catch (err: any) {
            setIsDriveValidated(false);
            setDriveValidationError(
              err.message || "Error occurred while validating folders.",
            );
            setLoading(false);
            setShowLocationsModal(true);
          } finally {
            setIsValidatingDrive(false);
          }
        } else {
          setIsDriveActive(true);
          setIsDriveValidated(true);
          fetchDataForMode(uSettings);
        }
      },
      () => {
        const uSettings = getSavedSettings();
        setUser(null);
        setToken(null);
        if (uSettings.mode === "Drive" || uSettings.mode === "Demo") {
          setIsDriveActive(false);
          setIsDriveValidated(false);
          setDriveMP3s([]);
          setLoading(false);
          setShowLocationsModal(true);
        } else {
          setLoading(false);
        }
      },
    );
    return () => unsubscribe();
  }, []);

  const fetchDataForMode = async (settings = getSavedSettings()) => {
    if (fetchInProgressRef.current) {
      console.log(
        "fetchDataForMode already inside concurrent cycle. De-duplicating sequence.",
      );
      return;
    }
    fetchInProgressRef.current = true;
    setIsSyncing(true);
    try {
      if (settings.mode === "Local") {
        try {
          const [localInterstitials, localLogs, localMP3s] = await Promise.all([
            fetch("/api/interstitials").then((r) => {
              if (!r.ok) throw new Error("Local interstitials failed");
              return r.json();
            }),
            fetch("/api/logs").then((r) => {
              if (!r.ok) throw new Error("Local logs failed");
              return r.json();
            }),
            fetch("/api/local-mp3s").then((r) => {
              if (!r.ok) throw new Error("Local MP3s failed");
              return r.json();
            }),
          ]);
          setInterstitials(localInterstitials || []);
          setLogs(localLogs || []);

          availableFilesCache.clear();
          const mappedMP3s = (localMP3s || []).map((file: any) => {
            if (file.path && file.name) {
              driveFileNameCache.set(file.path, file.name);
              availableFilesCache.set(file.name, {
                path: file.path,
                size: file.size,
                duration: file.duration || "",
              });
            }
            return {
              name: file.name,
              size: file.size,
              duration: file.duration || "",
              path: file.path,
            };
          });
          setDriveMP3s(mappedMP3s);
          setSyncTime(new Date());
          setScrollTrigger((prev) => prev + 1);
          setIsDriveActive(true);
          setIsDriveValidated(true);
          setConnectionError(null);
        } catch (e) {
          console.error("Local mode fetch details failed:", e);
          setIsDriveValidated(false);
          setConnectionError(
            "Failed to reach local server endpoints. Prior configuration remains active.",
          );
        }
      } else {
        // 'Drive' or 'Demo' mode: both pull from Google Drive
        const hasToken = !!(getAccessToken() || token);
        if (!hasToken) {
          setIsDriveValidated(false);
          setConnectionError(
            "Missing authentication token. Please reconnect your account.",
          );
          setIsSyncing(false);
          setLoading(false);
          return;
        }

        // Validate Google Drive (or Demo mode virtual folders) prior to any file read
        const isValid = await validateGoogleDriveAccess();
        if (!isValid) {
          setIsDriveValidated(false);
          setConnectionError(
            "Unable to access specified folders. Prior configuration remains active. Please check folder configuration or reconnect.",
          );
          setIsSyncing(false);
          setLoading(false);
          return;
        }

        setIsDriveValidated(true);

        const hasPreferencesFolder = !!DRIVE_FOLDERS.preferences;
        const hasLogsFolder = !!DRIVE_FOLDERS.logs;
        const hasMP3Folder = !!DRIVE_FOLDERS.mp3s;

        let driveInterstitials: Interstitial[] | null = null;
        let driveLogsStr: LogEntry[] | null = null;
        let mp3Files: any[] | null = null;

        let hasFetchError = false;

        if (hasPreferencesFolder) {
          try {
            driveInterstitials = await loadCalendarFromDrive();
          } catch (e) {
            console.warn("Interstitials Folder not set or inaccessible.", e);
            hasFetchError = true;
          }
        }
        if (hasLogsFolder) {
          try {
            driveLogsStr = await loadLogsFromDrive();
          } catch (e) {
            console.warn("Logs Folder not set or inaccessible.", e);
            hasFetchError = true;
          }
        }
        if (hasMP3Folder) {
          try {
            mp3Files = await listMP3sFromDrive();
          } catch (e) {
            console.warn("MP3s Folder not set or inaccessible.", e);
            hasFetchError = true;
          }
        }

        if (hasFetchError) {
          setConnectionError(
            "Failed to read files from folders. Prior configuration remains active.",
          );
        } else {
          setConnectionError(null);
        }

        if (driveInterstitials !== null) {
          setInterstitials(driveInterstitials || []);
        }
        if (driveLogsStr !== null) {
          setLogs(driveLogsStr || []);
        }

        if (mp3Files !== null) {
          availableFilesCache.clear();
          (mp3Files || []).forEach((file: any) => {
            if (file.path && file.name) {
              availableFilesCache.set(file.name, {
                path: file.path,
                size: file.size,
                duration: file.duration || "",
              });
            }
          });

          setDriveMP3s(mp3Files || []);
        }

        setSyncTime(new Date());
        setScrollTrigger((prev) => prev + 1);
        setIsDriveActive(true);
      }
      // Load shows list
      await loadShows().catch(() => {});
      // Trigger background archiving invisibly on successful fetch
      await runArchiving(settings.mode).catch(() => {});
    } catch (error) {
      console.error("Failed to fetch data for mode " + settings.mode, error);
      setConnectionError(
        "An unexpected synchronization error occurred. Prior configuration remains active.",
      );
    } finally {
      setIsSyncing(false);
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  };

  const fetchData = async () => {
    const settings = getSavedSettings();
    await fetchDataForMode(settings);
  };

  const handleRefresh = async () => {
    await fetchData();
    setCountdown(300);
  };

  const handleWakeUp = () => {
    lastActiveTimeRef.current = Date.now();
    setIsAsleep(false);
    handleRefresh();
  };

  useEffect(() => {
    const settings = getSavedSettings();
    if (settings.mode === "Drive" || settings.mode === "Demo") {
      fetchData();
    }
  }, [token]);

  // Track User Activity to prevent Sleep State (Throttled to minimize CPU overhead on frequent mouse moves)
  useEffect(() => {
    if (isAsleep) return;

    let lastActivityLogged = 0;
    const handleActivity = () => {
      const nowMs = Date.now();
      if (nowMs - lastActivityLogged >= 10000) {
        lastActivityLogged = nowMs;
        lastActiveTimeRef.current = nowMs;
      }
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("scroll", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
    };
  }, [isAsleep]);

  // Web Worker for Timer Tick (Performance Optimization to reduce main thread CPU usage)
  useEffect(() => {
    // Permanently adopted as default when starting and when yellow (!animationsDisabled)
    const useWorker = !animationsDisabled || (animationsDisabled && activeOptimizations.webWorkers);
    if (!useWorker) return;

    let worker: Worker | null = null;
    try {
      const workerCode = `
        let intervalId = null;
        self.onmessage = function(e) {
          if (e.data.action === 'start') {
            if (intervalId) clearInterval(intervalId);
            const delay = e.data.delay || 1000;
            intervalId = setInterval(() => {
              self.postMessage({ type: 'tick' });
            }, delay);
          } else if (e.data.action === 'stop') {
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);

      const isInactive = isAsleep;
      const intervalDelay = isInactive ? 10000 : 1000;

      worker.onmessage = (e) => {
        if (e.data.type === 'tick') {
          const current = new Date();
          setNow(current);

          // Check sleep timeout (30 mins)
          if (!isAsleep && Date.now() - lastActiveTimeRef.current >= 30 * 60 * 1000) {
            setIsAsleep(true);
          }

          if (playMode === "Live" && !isAsleep) {
            setCountdown((prev) => {
              const step = isInactive ? 10 : 1;
              if (prev <= step) {
                fetchData();
                return 300;
              }
              return prev - step;
            });
          }
        }
      };

      worker.postMessage({ action: 'start', delay: intervalDelay });
    } catch (err) {
      console.error("Failed to initialize Web Worker timer, falling back to main-thread", err);
    }

    return () => {
      if (worker) {
        worker.postMessage({ action: 'stop' });
        worker.terminate();
      }
    };
  }, [token, playMode, isAsleep, animationsDisabled, activeOptimizations.webWorkers]);

  // Sync Timer Logic (Fallback to Main-Thread if Worker is disabled or inactive)
  useEffect(() => {
    // Permanently adopted as default when starting and when yellow (!animationsDisabled)
    const useWorker = !animationsDisabled || (animationsDisabled && activeOptimizations.webWorkers);
    if (useWorker) return; // Managed by Web Worker effect instead

    const isInactive = isAsleep;
    const intervalDelay = isInactive ? 10000 : 1000;

    const timer = setInterval(() => {
      const current = new Date();
      setNow(current);

      // Check if inactive for 30 or more minutes (1800000 ms)
      if (
        !isAsleep &&
        Date.now() - lastActiveTimeRef.current >= 30 * 60 * 1000
      ) {
        setIsAsleep(true);
      }

      if (playMode === "Live" && !isAsleep) {
        setCountdown((prev) => {
          const step = isInactive ? 10 : 1;
          if (prev <= step) {
            fetchData();
            return 300;
          }
          return prev - step;
        });
      }
    }, intervalDelay);

    return () => clearInterval(timer);
  }, [token, playMode, isAsleep, animationsDisabled, activeOptimizations.webWorkers]);

  // Background Cache Synchronization Logic (Pre-loading Audio into memory)
  useEffect(() => {
    const syncCache = async () => {
      // Find all MP3 files used in active interstitials and loaded playlist tracks
      const interstitialUrls = interstitials
        .filter((s) => s.enabled && s.mp3Url)
        .map((s) => s.mp3Url);

      const activeUrls = Array.from(new Set([...interstitialUrls, ...currentPlaylistTrackUrls])).filter(Boolean);

      try {
        await updateAudioCache(activeUrls, getAccessToken() || token);
        // Force-refresh status representation to trigger card border transitions
        setScrollTrigger((prev) => prev + 1);
      } catch (err) {
        console.error("Failed to sync audio cache:", err);
      }
    };

    if (interstitials.length > 0 || currentPlaylistTrackUrls.length > 0) {
      syncCache();
    }
  }, [interstitials, currentPlaylistTrackUrls, token]);

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const saveInterstitials = async (newInterstitials: Interstitial[]) => {
    const settings = getSavedSettings();
    if (settings.mode === "Local") {
      try {
        await fetch("/api/interstitials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newInterstitials),
        });
        setInterstitials(newInterstitials);
      } catch (error) {
        console.error("Failed to save interstitials locally:", error);
      }
      return;
    }

    try {
      const currentToken = getAccessToken() || token;
      if (!currentToken) {
        throw new Error("Not connected to Google Drive. Saving is disabled.");
      }
      await saveCalendarToDrive(newInterstitials);
      setInterstitials(newInterstitials);
    } catch (error) {
      console.error("Failed to save interstitials:", error);
    }
  };

  const addLog = async (entry: LogEntry) => {
    const settings = getSavedSettings();

    let showId = entry.showId;
    let showName = entry.showName;
    let hostName = entry.hostName;
    let showDateTime = entry.showDateTime;

    if (!showName && selectedPlaylistShow && playMode === "Playlist") {
      showId = selectedPlaylistShow.id;
      showName = selectedPlaylistShow.name;
      hostName = selectedPlaylistShow.host;
      const sDate = new Date(syncTime || now);
      sDate.setHours(selectedPlaylistShow.startHour, selectedPlaylistShow.startMinute, 0, 0);
      showDateTime = sDate.toISOString();
    } else if (!showName && shows && shows.length > 0) {
      const targetTime = entry.interstitialTime ? new Date(entry.interstitialTime) : new Date(entry.timestamp || now);
      const activeShow = shows.find((s) => {
        const sStart = new Date(targetTime);
        sStart.setHours(s.startHour, s.startMinute, 0, 0);
        const durationMin = s.durationMinutes || (s.endHour * 60 + s.endMinute) - (s.startHour * 60 + s.startMinute);
        const sEnd = new Date(sStart.getTime() + (durationMin > 0 ? durationMin : 60) * 60000);
        return targetTime >= sStart && targetTime < sEnd;
      });
      if (activeShow) {
        showId = activeShow.id;
        showName = activeShow.name;
        hostName = activeShow.host;
        const sDate = new Date(targetTime);
        sDate.setHours(activeShow.startHour, activeShow.startMinute, 0, 0);
        showDateTime = sDate.toISOString();
      }
    }

    const enrichedEntry: LogEntry = {
      ...entry,
      showId,
      showName,
      hostName,
      showDateTime,
      playMode: entry.playMode === "Export" ? "Export" : playMode,
      logTimeStamp: entry.logTimeStamp || new Date().toISOString(),
      timestamp: entry.interstitialTime || entry.timestamp || new Date().toISOString(),
      assetType: entry.assetType || "audio",
    };

    if (settings.mode === "Local") {
      try {
        await fetch("/api/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(enrichedEntry),
        });
        // Reload logs from backend dynamic storage
        const updatedLogs = await fetch("/api/logs").then((r) => r.json());
        setLogs(updatedLogs);
      } catch (error) {
        console.error("Failed to save log locally:", error);
      }
      return;
    }

    try {
      const currentToken = getAccessToken() || token;
      if (!currentToken) {
        throw new Error(
          "Not connected to Google Drive. Saving logs is disabled.",
        );
      }

      const updatedLogs = await appendLogToDrive(enrichedEntry);
      setLogs(updatedLogs);
    } catch (error) {
      console.error("Failed to add log:", error);
    }
  };

  useEffect(() => {
    if ((window as any).electronAPI) {
      if ((window as any).electronAPI.onLiveReadLogged) {
        (window as any).electronAPI.onLiveReadLogged((logEntry: LogEntry) => {
          addLog(logEntry);
          window.dispatchEvent(new CustomEvent('live-read-logged', { detail: logEntry }));
        });
      }
      if ((window as any).electronAPI.onLiveReadClosed) {
        (window as any).electronAPI.onLiveReadClosed(() => {
          window.dispatchEvent(new CustomEvent('live-read-closed'));
        });
      }
      if ((window as any).electronAPI.onNavigate) {
        (window as any).electronAPI.onNavigate(({ tab, subTab }: { tab: string; subTab?: string }) => {
          if (tab === "folders") {
            setShowLocationsModal(true);
          } else if (tab === "help") {
            setShowLocalHelp(true);
          } else if (tab === "player" || tab === "calendar" || tab === "log") {
            setActiveTab(tab as "player" | "calendar" | "log");
            if (tab === "calendar" && subTab) {
              setCalendarSubTab(subTab as "calendar" | "list" | "shows");
            }
          }
        });
      }
    }
  }, []);

  const handleSelectPrerecordShow = (showId: string) => {
    const show = shows.find((s) => s.id === showId);
    setSelectedPrerecordShowId(showId);
    if (show) {
      const dates = getFutureDatesForShow(show.day, show.startHour, show.startMinute);
      if (dates.length > 0) {
        setPrerecordDateInput(format(dates[0], "yyyy-MM-dd"));
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setPrerecordDateInput(format(tomorrow, "yyyy-MM-dd"));
      }
      setPrerecordTimeInput(
        `${show.startHour.toString().padStart(2, "0")}:${show.startMinute.toString().padStart(2, "0")}`
      );
      setPrerecordHoursInput(show.durationHours.toString());
      setPrerecordMinutesInput(show.durationMinutes.toString());
    }
  };

  const handleToggleMode = () => {
    if (playMode === "Live") {
      const activeShows = shows.filter((s) => s.active);
      setSelectedPrerecordShowId("");
      setShowFilterText("");
      if (activeShows.length > 0) {
        setPrerecordSelectorMode("show-list");
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setPrerecordDateInput(format(tomorrow, "yyyy-MM-dd"));
        setPrerecordTimeInput("12:00");
        setPrerecordHoursInput("2");
        setPrerecordMinutesInput("0");
        setPrerecordSelectorMode("manual");
      }
      setPrerecordError(null);
      setShowPrerecordConfirmStep(false);
      setPrerecordConfirmDetails(null);
      setShowPrerecordModal(true);
    } else {
      setPlayMode("Live");
      setPrerecordDate(null);
      setCountdown(300);
      setNow(new Date());
    }
  };

  const handleOpenTimeframeModal = (target: "Prerecord" | "Export") => {
    setPrerecordModalTarget(target);
    const activeShows = shows.filter((s) => s.active);
    setSelectedPrerecordShowId("");
    setShowFilterText("");
    if (activeShows.length > 0) {
      setPrerecordSelectorMode("show-list");
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setPrerecordDateInput(format(tomorrow, "yyyy-MM-dd"));
      setPrerecordTimeInput("12:00");
      setPrerecordHoursInput("2");
      setPrerecordMinutesInput("0");
      setPrerecordSelectorMode("manual");
    }
    setPrerecordError(null);
    setShowPrerecordConfirmStep(false);
    setPrerecordConfirmDetails(null);
    setShowPrerecordModal(true);
  };

  const updatePlaylistModalData = async (isInitial: boolean = false, overrideTime?: Date) => {
    if (isInitial) {
      setPlaylistModalLoading(true);
    }

    const sorted = getSortedShows(shows);
    if (!sorted || sorted.length === 0) {
      const emptyOpts = {
        currentShow: null,
        nextShow: null,
        defaultShowId: "",
        currentShowFileCount: 0,
        nextShowFileCount: 0,
        elapsedMinutes: 0,
        is15MinsOrMore: false
      };
      setPlaylistShowOptions(emptyOpts);
      playlistShowOptionsRef.current = emptyOpts;
      if (isInitial) setPlaylistModalLoading(false);
      return;
    }

    const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
    const nowObj = overrideTime || syncTime || new Date();
    const currentDayName = daysOrder[nowObj.getDay()];
    const currentHour = nowObj.getHours();
    const currentMin = nowObj.getMinutes();
    const currentWeekMin = nowObj.getDay() * 1440 + currentHour * 60 + currentMin;

    const currentShow = (sorted.find(s => isTimeInShow(s, currentDayName, currentHour, currentMin)) as Show) || null;

    let nextShow: Show | null = null;
    let elapsedMinutes = 0;

    if (currentShow) {
      const currIdx = sorted.findIndex(s => s.id === currentShow.id);
      nextShow = (sorted[(currIdx + 1) % sorted.length] as Show) || null;

      const showStartWeekMin = daysOrder.indexOf(currentShow.day) * 1440 + currentShow.startHour * 60 + currentShow.startMinute;
      elapsedMinutes = (currentWeekMin - showStartWeekMin + 10080) % 10080;
    } else {
      const upcoming = sorted.find(s => {
        const startMin = daysOrder.indexOf(s.day) * 1440 + s.startHour * 60 + s.startMinute;
        return startMin > currentWeekMin;
      });
      nextShow = (upcoming || sorted[0]) as Show;
    }

    const is15MinsOrMore = currentShow ? elapsedMinutes >= 15 : true;
    const defaultShow = (is15MinsOrMore && nextShow) ? nextShow : (currentShow || nextShow);
    const defaultShowId = defaultShow ? defaultShow.id : "";

    const prevCurrentShowId = playlistShowOptionsRef.current?.currentShow?.id;
    const prevNextShowId = playlistShowOptionsRef.current?.nextShow?.id;
    const showsChanged = isInitial || prevCurrentShowId !== currentShow?.id || prevNextShowId !== nextShow?.id;

    if (isInitial || showsChanged) {
      setChosenPlaylistShowId((prevId) => {
        if (!isInitial && prevId && ((currentShow && prevId === currentShow.id) || (nextShow && prevId === nextShow.id))) {
          return prevId;
        }
        return defaultShowId;
      });
    }

    let currentShowFileCount = playlistShowOptionsRef.current?.currentShowFileCount || 0;
    let nextShowFileCount = playlistShowOptionsRef.current?.nextShowFileCount || 0;

    try {
      const settings = getSavedSettings();
      if (settings.mode === 'Local') {
        const resp = await fetch("/api/shows/playlist/check-show-files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentShowNameShort: currentShow?.nameShort || "",
            currentShowName: currentShow?.name || "",
            nextShowNameShort: nextShow?.nameShort || "",
            nextShowName: nextShow?.name || ""
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          currentShowFileCount = data.currentShowFileCount || 0;
          nextShowFileCount = data.nextShowFileCount || 0;
        }
      } else {
        // 'Drive' or 'Demo' mode
        const data = await checkPlaylistShowFilesOnDrive(
          currentShow?.nameShort,
          currentShow?.name,
          nextShow?.nameShort,
          nextShow?.name,
          settings.mode
        );
        currentShowFileCount = data.currentShowFileCount || 0;
        nextShowFileCount = data.nextShowFileCount || 0;
      }
    } catch (e) {
      console.error("Failed to check playlist show files:", e);
    }

    const newOptions = {
      currentShow,
      nextShow,
      defaultShowId,
      currentShowFileCount,
      nextShowFileCount,
      elapsedMinutes,
      is15MinsOrMore
    };

    playlistShowOptionsRef.current = newOptions;
    setPlaylistShowOptions(newOptions);
    if (isInitial) setPlaylistModalLoading(false);
  };

  const handleOpenPlaylistModal = async () => {
    setShowPlaylistModal(true);
    setPlaylistModalNow(new Date());
    await updatePlaylistModalData(true);
  };

  useEffect(() => {
    if (!showPlaylistModal) return;

    const timer = setInterval(() => {
      const currentNow = new Date();
      setPlaylistModalNow(currentNow);
      updatePlaylistModalData(false, currentNow);
    }, 5000);

    return () => clearInterval(timer);
  }, [showPlaylistModal, shows]);

  const handleConfirmPlaylistShow = () => {
    if (!playlistShowOptions) return;
    let targetShow: Show | null = null;
    if (chosenPlaylistShowId === playlistShowOptions.currentShow?.id) {
      targetShow = playlistShowOptions.currentShow;
    } else if (chosenPlaylistShowId === playlistShowOptions.nextShow?.id) {
      targetShow = playlistShowOptions.nextShow;
    }
    setSelectedPlaylistShow(targetShow);
    setPlayMode("Playlist");
    setShowPlaylistModal(false);
    triggerCachingForMode("Playlist");
  };

  const handleSelectAndConfirmShow = (targetShow: Show) => {
    setSelectedPlaylistShow(targetShow);
    setPlayMode("Playlist");
    setShowPlaylistModal(false);
    triggerCachingForMode("Playlist");
  };

  const handleEditTimeframeModal = () => {
    handleOpenTimeframeModal(playMode === "Export" ? "Export" : "Prerecord");
  };

  const getPrerecord12HrDisplay = (timeStr: string) => {
    if (!timeStr) return "--:-- --";
    const parts = timeStr.split(":");
    const hStr = parts[0] || "";
    const mStr = parts[1] || "";

    const h = parseInt(hStr, 10);
    if (isNaN(h) || h < 0 || h > 23) return "--:-- --";

    const m = mStr ? parseInt(mStr, 10) : 0;
    if (isNaN(m) || m < 0 || m > 59) return "--:-- --";

    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const mPad = mStr.length === 1 ? `${mStr}0` : m.toString().padStart(2, "0");
    return `${h12.toString().padStart(2, "0")}:${mPad} ${ampm}`;
  };

  const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    let val = rawVal.replace(/[^0-9]/g, "");

    if (val.length > 4) {
      val = val.substring(0, 4);
    }

    if (val.length > 2) {
      val = `${val.substring(0, 2)}:${val.substring(2)}`;
    }

    setPrerecordTimeInput(val);
  };

  const handleActivatePrerecord = (e: React.FormEvent) => {
    e.preventDefault();
    setPrerecordError(null);

    if (!prerecordDateInput || !prerecordTimeInput) {
      setPrerecordError("Both date and time inputs are required.");
      return;
    }

    // Validate 24-hour format
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(prerecordTimeInput)) {
      setPrerecordError(
        "Please enter a valid 24-hour time format: HH:mm (from 00:00 to 23:59).",
      );
      return;
    }

    const hours = parseInt(prerecordHoursInput, 10);
    const mins = parseInt(prerecordMinutesInput, 10);

    if (
      isNaN(hours) ||
      isNaN(mins) ||
      hours < 0 ||
      mins < 0 ||
      (hours === 0 && mins === 0)
    ) {
      setPrerecordError(
        "Please enter a valid show length greater than 0 minutes.",
      );
      return;
    }

    try {
      const dateStr = `${prerecordDateInput}T${prerecordTimeInput}:00`;
      const parsedDate = parseISO(dateStr);

      if (isNaN(parsedDate.getTime())) {
        setPrerecordError("Please enter a valid format for date and time.");
        return;
      }

      if (isBefore(parsedDate, new Date())) {
        setPrerecordError("The prerecord start time must be in the future.");
        return;
      }

      const totalMinutes = hours * 60 + mins;
      setPrerecordLengthMinutes(totalMinutes);
      setPrerecordDate(parsedDate);

      // Set selectedPlaylistShow if a show was selected or matched
      if (selectedPrerecordShowId) {
        const matchedShow = shows.find((s) => s.id === selectedPrerecordShowId);
        if (matchedShow) {
          setSelectedPlaylistShow(matchedShow);
        }
      } else if (shows && shows.length > 0) {
        const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
        const dayName = daysOrder[parsedDate.getDay()];
        const hour = parsedDate.getHours();
        const minute = parsedDate.getMinutes();
        const matchedShow = shows.find((s) => isTimeInShow(s, dayName, hour, minute));
        if (matchedShow) {
          setSelectedPlaylistShow(matchedShow);
        } else {
          setSelectedPlaylistShow(null);
        }
      }

      setPlayMode(prerecordModalTarget);
      setShowPrerecordConfirmStep(false);
      setShowPrerecordModal(false);
      setPrerecordConfirmDetails(null);
      handleRefresh();
      triggerCachingForMode(prerecordModalTarget);
    } catch (err: any) {
      setPrerecordError(
        err.message || "Error occurred while validating date and time.",
      );
    }
  };

  const handleFinalConfirmPrerecord = () => {
    if (prerecordConfirmDetails) {
      setPrerecordLengthMinutes(prerecordConfirmDetails.totalMinutes);
      setPrerecordDate(prerecordConfirmDetails.startDate);
      setPlayMode(prerecordModalTarget);
      setShowPrerecordConfirmStep(false);
      setShowPrerecordModal(false);
      setPrerecordConfirmDetails(null);
      handleRefresh();
    }
  };

  const getDynamicNames = () => {
    if (!prerecordDate) {
      return {
        folderName: "Show - Export - [Date] at [Time] - [Duration]",
        textFilename: "Show - Plan - [Date] at [Time] - [Duration].txt",
        playlistFilename: "Show - Playlist - [Date] at [Time] - [Duration].m3u",
        firstTrackFilename: "Break 01 at 12-00 - Hourly Interstitial.mp3"
      };
    }
    const parsedDate = new Date(prerecordDate);
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    const hours = String(parsedDate.getHours()).padStart(2, '0');
    const minutes = String(parsedDate.getMinutes()).padStart(2, '0');

    const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthShort = monthShorts[parsedDate.getMonth()] || 'JUN';

    const dateStr = `${year}-${month}(${monthShort})-${day}`;
    const timeStr = `${hours}-${minutes}`;

    const h = Math.floor(prerecordLengthMinutes / 60);
    const m = prerecordLengthMinutes % 60;
    const durationStr = m === 0 ? `${h} Hrs` : `${h} Hrs ${m} Min`;

    const fPrefix = (exportFolderPrefixInput && exportFolderPrefixInput.trim()) || 'Show';
    const tPrefix = (exportTextPrefixInput && exportTextPrefixInput.trim()) || 'Show';
    const pPrefix = (exportPlaylistPrefixInput && exportPlaylistPrefixInput.trim()) || 'Show';

    const folderName = `${fPrefix} - Export - ${dateStr} at ${timeStr} - ${durationStr}`;
    const textFilename = `${tPrefix} - Plan - ${dateStr} at ${timeStr} - ${durationStr}.txt`;
    const playlistFilename = `${pPrefix} - Playlist - ${dateStr} at ${timeStr} - ${durationStr}.m3u`;

    const activeSpecials = interstitials.filter(s => s.enabled);
    const firstScheduleName = activeSpecials.length > 0 ? activeSpecials[0].name : "Hourly Interstitial";
    const safeScheduleName = firstScheduleName.replace(/[\/\\?%*:|"<>]/g, ' ').trim();
    const safeSlotTime = "12-00";
    const firstTrackFilename = `Break 01 at ${safeSlotTime} - ${safeScheduleName}.mp3`;

    return {
      folderName,
      textFilename,
      playlistFilename,
      firstTrackFilename
    };
  };

  const handleExportPrerecord = async () => {
    if (!prerecordDate) return;
    setExportFolderPrefixInput("Show");
    setExportTextPrefixInput("Show");
    setExportPlaylistPrefixInput("Show");
    setExportState("configuring");
    setExportError(null);
    setExportResult(null);
    setShowExportModal(true);

    try {
      const res = await fetch("/api/downloads-path");
      const data = await res.json();
      if (data.success && data.path) {
        setExportDestinationInput(data.path);
      } else {
        setExportDestinationInput(localPathMP3s || "");
      }
    } catch (e) {
      setExportDestinationInput(localPathMP3s || "");
    }
  };

  const handleBrowseExportDestination = async () => {
    try {
      const res = await fetch("/api/browse-folder", { method: "POST" });
      const data = await res.json();
      if (data.success && data.path) {
        setExportDestinationInput(data.path);
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err: any) {
      alert(err.message || "Failed to open folder selection window.");
    }
  };

  const runExportPrerecord = async () => {
    if (!prerecordDate) return;

    setExportState("exporting");
    setExportError(null);
    setExportResult(null);

    try {
      // 1. Recreate timeline slots exactly like in PlayerTab
      const slots = [];
      let current = new Date(prerecordDate);
      current.setSeconds(0, 0);

      const end = new Date(
        current.getTime() + prerecordLengthMinutes * 60 * 1000,
      );

      while (current.getTime() < end.getTime()) {
        slots.push(new Date(current));
        current = new Date(current.getTime() + 60 * 1000);
      }

      // 2. Filter & map slot matching interstitials
      const itemsToExport: any[] = [];
      slots.forEach((slot) => {
        const day = slot.getDay();
        const hour = slot.getHours();
        const minute = slot.getMinutes();
        const dateStr = format(slot, "yyyy-MM-dd");

        const activeInterstitials = interstitials.filter((s) => {
          if (!s.enabled) return false;
          if (s.type === InterstitialType.ONE_TIME) {
            const hourStr = format(slot, "HH");
            return (
              s.date === dateStr && s.minute === minute && s.time === hourStr
            );
          }
          if (s.type === InterstitialType.BASIC_HOURLY) {
            const afterStart = s.startDate
              ? !isBefore(slot, parseISO(s.startDate))
              : true;
            const beforeEnd = s.endDate
              ? !isAfter(slot, parseISO(s.endDate))
              : true;
            return s.minute === minute && afterStart && beforeEnd;
          }
          if (s.type === InterstitialType.ADVANCED) {
            const afterStart = s.startDate
              ? !isBefore(slot, parseISO(s.startDate))
              : true;
            const beforeEnd = s.endDate
              ? !isAfter(slot, parseISO(s.endDate))
              : true;

            let ruleMatch = false;
            if (s.gridRules && s.gridRules.length > 0) {
              ruleMatch = s.gridRules.includes(`${day}-${hour}`);
            } else {
              const dayMatch = s.days?.includes(day);
              const hourMatch = s.hours?.includes(hour);
              ruleMatch = !!(dayMatch && hourMatch);
            }

            return s.minute === minute && ruleMatch && afterStart && beforeEnd;
          }
          return false;
        });

        activeInterstitials.forEach((s) => {
          itemsToExport.push({
            slotTime: format(slot, "HH:mm"),
            fileName: s.mp3Url,
            interstitialName: s.name,
            interstitialId: s.id,
            minute: s.minute,
          });
        });
      });

      if (itemsToExport.length === 0) {
        setExportState("error");
        setExportError(
          "No active scheduled breaks found in this prerecord timeframe.",
        );
        return;
      }

      // 3. Make post request to endpoint
      const response = await fetch("/api/export-prerecord", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prerecordDate: prerecordDate.toISOString(),
          lengthMinutes: prerecordLengthMinutes,
          items: itemsToExport,
          exportDestination: exportDestinationInput,
          folderPrefix: exportFolderPrefixInput,
          textPrefix: exportTextPrefixInput,
          playlistPrefix: exportPlaylistPrefixInput,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Server reported failure");
      }

      const data = await response.json();
      if (data.success) {
        setExportState("success");
        setExportResult({
          exportFolder: data.exportFolderPath,
          copiedCount: data.copiedCount,
          missingCount: data.missingCount,
          totalCount: data.totalCount,
          txtFilename: data.txtFilename,
          m3uFilename: data.m3uFilename,
          baseFilename: data.exportFolderName,
        });
      } else {
        throw new Error(data.error || "Export files operation failed");
      }
    } catch (err: any) {
      console.error("Export error:", err);
      setExportState("error");
      setExportError(
        err.message || "An unexpected error occurred during export.",
      );
    }
  };

  const handleOpenExportFolder = async (folderPath: string) => {
    try {
      await fetch("/api/open-local-folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: folderPath }),
      });
    } catch (e) {
      console.error("Error opening folder:", e);
    }
  };

  const handleBrowseNative = async (
    targetField: "calendar" | "mp3s" | "logs",
  ) => {
    try {
      const res = await fetch("/api/browse-folder", { method: "POST" });
      const data = await res.json();
      if (data.success && data.path) {
        if (targetField === "calendar") setDraftLocalPathCalendar(data.path);
        else if (targetField === "mp3s") setDraftLocalPathMP3s(data.path);
        else if (targetField === "logs") setDraftLocalPathLogs(data.path);
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err: any) {
      alert(err.message || "Failed to open folder selection window.");
    }
  };

  const handleOpenLocalPath = async (dirPath: string) => {
    if (!dirPath) return;

    try {
      const res = await fetch("/api/open-local-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: dirPath }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn(
          "Could not open folder natively:",
          err.error || "Server error",
        );
      }
    } catch (e) {
      console.warn("Network error opening local folder:", e);
    }
  };

  const handleOpenDriveFolder = async (folderId: string) => {
    if (!folderId) return;
    const url = `https://drive.google.com/drive/folders/${folderId}`;
    window.open(url, "_blank");
  };

  const handleAuthSignIn = async () => {
    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setIsDriveActive(true);

        // Immediate Validation after login
        const success = await validateGoogleDriveAccess();
        if (success) {
          setIsDriveValidated(true);
          setDriveValidationError(null);
          const currentSettings = getSavedSettings();
          await fetchDataForMode(currentSettings);
        } else {
          setIsDriveValidated(false);
          setDriveValidationError(
            "Connected Google account lacks read/write access to one or more configured shared directories.",
          );
        }
      }
    } catch (e: any) {
      console.error("Sign-in failed:", e);
      setDriveValidationError(
        e.message || "Verification of Google login failed.",
      );
    } finally {
      setIsValidatingDrive(false);
      setLoading(false);
    }
  };

  const handleManualTokenOverride = async (inputToken: string) => {
    if (!inputToken.trim()) return;
    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);

      // Inject token
      setOverrideAccessToken(inputToken.trim());
      setToken(inputToken.trim());
      setUser({
        email: "manual-developer@interstitialer.local",
        displayName: "Developer Override Session",
      } as any);
      setIsDriveActive(true);

      // Verify Google Drive directories using the token
      const success = await validateGoogleDriveAccess();
      if (success) {
        setIsDriveValidated(true);
        setDriveValidationError(null);
        const currentSettings = getSavedSettings();
        await fetchDataForMode(currentSettings);
      } else {
        setIsDriveValidated(false);
        setDriveValidationError(
          "The manually provided token succeeded validation in Firebase, but Google API rejected access. Check if the token is active, expired, or has correct drive permissions.",
        );
      }
    } catch (e: any) {
      console.error("Manual drive token injection failed:", e);
      setDriveValidationError(
        e.message || "Verification of manual token override failed.",
      );
    } finally {
      setIsValidatingDrive(false);
      setLoading(false);
    }
  };

  const handleExternalBrowserSignIn = async () => {
    if (!googleClientId.trim()) {
      setDriveValidationError(
        "Google OAuth Client ID is required for Method B External Browser login.",
      );
      return;
    }

    // Save Client ID for convenience
    localStorage.setItem(
      "interstitialer_google_client_id",
      googleClientId.trim(),
    );

    try {
      setLoading(true);
      setDriveValidationError(null);
      setIsValidatingDrive(true);
      setIsPollingExternal(true);

      const redirectUri = `http://127.0.0.1:${window.location.port || "3000"}/api/oauth-callback`;
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(googleClientId.trim())}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=https://www.googleapis.com/auth/drive`;

      console.log(
        "Launching external browser for Google OAuth Method B:",
        authUrl,
      );
      window.open(authUrl, "_blank");

      // Start Polling for Registered Token
      let pollCount = 0;
      const intervalId = setInterval(async () => {
        pollCount++;
        // Timeout after 5 minutes
        if (pollCount > 300) {
          clearInterval(intervalId);
          setIsPollingExternal(false);
          setIsValidatingDrive(false);
          setLoading(false);
          setDriveValidationError(
            "Method B browser authentication timed out. Please try again.",
          );
          return;
        }

        try {
          const isCustomProtocol =
            typeof window !== "undefined" &&
            !window.location.protocol.startsWith("http");
          const baseUrl = isCustomProtocol ? "http://127.0.0.1:3000" : "";
          const res = await fetch(`${baseUrl}/api/check-registered-token`);
          if (!res.ok) throw new Error("Failed to query local loopback status");
          const data = await res.json();
          if (data.token) {
            clearInterval(intervalId);
            setIsPollingExternal(false);

            // Set token and authenticate session
            setOverrideAccessToken(data.token);
            setToken(data.token);
            setUser({
              email: "authorized-device@interstitialer.local",
              displayName: "Loopback Verified Session",
            } as any);
            setIsDriveActive(true);

            // Validate Google Drive access
            const success = await validateGoogleDriveAccess();
            if (success) {
              setIsDriveValidated(true);
              setDriveValidationError(null);
              const currentSettings = getSavedSettings();
              await fetchDataForMode(currentSettings);
            } else {
              setIsDriveValidated(false);
              setDriveValidationError(
                "OAuth Token verified by loopback, but Google API rejected access to the specified folders. Ensure folders are shared/accessible.",
              );
            }
            setIsValidatingDrive(false);
            setLoading(false);
          }
        } catch (err: any) {
          console.warn("Error polling loopback token:", err);
        }
      }, 1000);
    } catch (e: any) {
      console.error("Method B OAuth launch failed:", e);
      setDriveValidationError(
        e.message || "Failed to initialize external browser flow.",
      );
      setIsValidatingDrive(false);
      setIsPollingExternal(false);
      setLoading(false);
    }
  };

  const handleAuthSignOut = async () => {
    try {
      setLoading(true);
      await handleLogout();
      setUser(null);
      setToken(null);
      setIsDriveActive(false);
      setIsDriveValidated(false);
      setDriveValidationError(null);
      setInterstitials([]);
      setLogs([]);
      setDriveMP3s([]);
    } catch (e) {
      console.error("Sign-out failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLocations = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocationsError(null);
    setLocationsSuccess(null);
    setIsSavingAndVerifying(true);
    try {
      const current = getSavedSettings();
      let updatedSettings = { ...current, mode: locationMode };

      if (locationMode === "Local") {
        updatedSettings = {
          ...updatedSettings,
          localPathMP3s: draftLocalPathMP3s,
          localPathLogs: draftLocalPathLogs,
          localPathCalendar: draftLocalPathCalendar,
        };
      } else if (locationMode === "Drive") {
        updatedSettings = {
          ...updatedSettings,
          driveFolderLogs: draftDriveFolderLogs,
          driveFolderMP3s: draftDriveFolderMP3s,
          driveFolderPreferences: draftDriveFolderPreferences,
        };
      }

      // Detect mode or log/schedule folder mapping changes to reset backup flag
      const modeChanged = current.mode !== updatedSettings.mode;
      const interstitialsChanged =
        updatedSettings.mode === "Local"
          ? current.localPathCalendar !== updatedSettings.localPathCalendar
          : updatedSettings.mode === "Drive"
            ? current.driveFolderPreferences !==
              updatedSettings.driveFolderPreferences
            : false;
      const logsChanged =
        updatedSettings.mode === "Local"
          ? current.localPathLogs !== updatedSettings.localPathLogs
          : updatedSettings.mode === "Drive"
            ? current.driveFolderLogs !== updatedSettings.driveFolderLogs
            : false;

      if (modeChanged || interstitialsChanged || logsChanged) {
        console.log(
          "Resetting backup flag due to updated folder mode or mapping",
        );
        hasBackedUpThisSessionRef.current = false;
      }

      // Save locally (localStorage)
      saveSettings(updatedSettings);

      // Save variables to main state
      if (locationMode === "Local") {
        setLocalPathMP3s(draftLocalPathMP3s);
        setLocalPathLogs(draftLocalPathLogs);
        setLocalPathCalendar(draftLocalPathCalendar);
      } else if (locationMode === "Drive") {
        setDriveFolderLogs(draftDriveFolderLogs);
        setDriveFolderMP3s(draftDriveFolderMP3s);
        setDriveFolderPreferences(draftDriveFolderPreferences);
      }

      // Notify server
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      }).catch(() => {});

      // For Local mode, run the verify API on back-end
      if (locationMode === "Local") {
        const exists = await checkLocalPathsSafely(
          draftLocalPathMP3s,
          draftLocalPathLogs,
          draftLocalPathCalendar,
        );

        setLocalPathsUnavailable(!exists);
        await fetchDataForMode(updatedSettings);
        setLocationsSuccess("Local storage configurations updated.");
      } else if (locationMode === "Drive") {
        setIsValidatingDrive(true);
        // Is there any folder setting change?
        const hasFolderChanges =
          draftDriveFolderLogs !== driveFolderLogs ||
          draftDriveFolderMP3s !== driveFolderMP3s ||
          draftDriveFolderPreferences !== driveFolderPreferences;

        let success = true;
        if (hasFolderChanges) {
          // Always request a new authentication after change to a folder type setting
          try {
            const res = await googleSignIn();
            if (res) {
              setUser(res.user);
              setToken(res.accessToken);
            } else {
              success = false;
            }
          } catch (authErr: any) {
            success = false;
            setLocationsError(
              "Authentication is required when changing folder settings.",
            );
          }
        }

        if (success) {
          const authSuccess = await validateGoogleDriveAccess();
          if (authSuccess) {
            setIsDriveValidated(true);
            setDriveValidationError(null);
            await fetchDataForMode(updatedSettings);
            setLocationsSuccess(
              "Google Drive directory IDs updated and validated.",
            );
          } else {
            setIsDriveValidated(false);
            setDriveValidationError(
              "Associated account does not have authorization/access on newly specified directory folder IDs.",
            );
            setLocationsError(
              "Verification of IDs failed. Please confirm correct and accessible folder resource permissions.",
            );
          }
        }
        setIsValidatingDrive(false);
      } else if (locationMode === "Demo") {
        setIsDriveValidated(true);
        setDriveValidationError(null);
        await fetchDataForMode(updatedSettings);
        setLocationsSuccess("Workspace mode switched to Demo.");
      }

      setTimeout(() => {
        setLocationsSuccess(null);
        setShowLocationsModal(false);
        setIsSavingAndVerifying(false);
      }, 1500);
    } catch (err: any) {
      setLocationsError(err.message || "Failed to save configure locations.");
      setIsSavingAndVerifying(false);
    }
  };

  const handleSelectMode = async (mode: "Local" | "Drive" | "Demo") => {
    try {
      const current = getSavedSettings();
      if (current.mode !== mode) {
        console.log(`Resetting backup flag: Mode changed to ${mode}`);
        hasBackedUpThisSessionRef.current = false;
      }
      const updatedSettings = {
        ...current,
        mode,
      };
      saveSettings(updatedSettings);
      setLocationMode(mode);

      // Notify backend
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSettings),
      }).catch(() => {});

      if (mode === "Local") {
        const exists = await checkLocalPathsSafely(
          updatedSettings.localPathMP3s || "",
          updatedSettings.localPathLogs || "",
          updatedSettings.localPathCalendar || "",
        );

        setIsDriveActive(true);
        setIsDriveValidated(true);
        setLocalPathsUnavailable(!exists);
        await fetchDataForMode(updatedSettings);

        // Open location selector for Local Mode
        setShowLocationsModal(true);
      } else if (mode === "Drive") {
        setIsDriveActive(true);
        setIsDriveValidated(true);
        setDriveValidationError(null);
        await fetchDataForMode(updatedSettings);

        // Open location selector for Drive Mode
        setShowLocationsModal(true);
      } else if (mode === "Demo") {
        setIsDriveActive(true);
        setIsDriveValidated(true);
        setDriveValidationError(null);
        await fetchDataForMode(updatedSettings);
      }
    } catch (err) {
      console.error("Failed to select mode:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
        <RefreshCw
          className={cn(
            "w-8 h-8 animate-spin",
            isPre ? "text-purple-600" : "text-blue-500",
          )}
        />
        <p className="text-xs font-bold text-slate-500 tracking-wider animate-pulse select-none">
          Connecting to Google Drive (Check for pop-up window)
        </p>
      </div>
    );
  }

  // Strict CSS animations is permanently adopted as default in ON position (under disable-animations and opt-css-animations)
  // when starting and when yellow (!animationsDisabled). Other overrides are only applied in red state or asleep/unfocused.
  const showCssAnimOverride = isAsleep || !isWindowFocused || !animationsDisabled || (animationsDisabled && activeOptimizations.cssAnimations);
  const showHoverTransOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.hoverTransitions);
  const showHoverTransfOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.hoverTransforms);
  const showHoverShadowOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.hoverShadowsFilters);
  const showBackdropOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.backdropBlurs);
  const showPointerEventsOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.pointerEventsNeutralization);
  const showGpuLayeringOverride = isAsleep || !isWindowFocused || (animationsDisabled && activeOptimizations.gpuCompositingLayering);
  
  const anyOverrideActive = showCssAnimOverride || showHoverTransOverride || showHoverTransfOverride || showHoverShadowOverride || showBackdropOverride || showPointerEventsOverride || showGpuLayeringOverride;

  return (
    <div className={cn(
      "flex flex-col h-screen bg-[#F8FAFC] font-sans overflow-hidden layout-wrapper",
      anyOverrideActive && "disable-animations",
      showCssAnimOverride && "opt-css-animations",
      showHoverTransOverride && "opt-hover-transitions",
      showHoverTransfOverride && "opt-hover-transforms",
      showHoverShadowOverride && "opt-hover-shadows-filters",
      showBackdropOverride && "opt-backdrop-blurs",
      showPointerEventsOverride && "opt-pointer-events-neutralization",
      showGpuLayeringOverride && "opt-gpu-compositing-layering"
    )}>
      {/* Top Header - Branding & Nav */}
      <header className="bg-[#0F172A] px-3 py-2 shrink-0 z-20">
        <div className="flex items-center justify-between gap-3 w-full mx-auto">
          <div className="flex items-center gap-2 text-white">
            <div
              className={cn(
                "w-6 h-6 rounded flex items-center justify-center",
                playMode === "Live"
                  ? "bg-purple-600"
                  : playMode === "Prerecord"
                    ? "bg-emerald-600"
                    : "bg-blue-600",
              )}
            >
              <Clock className="w-4 h-4" />
            </div>
            <span className="font-bold text-xs tracking-tight hide-app-name">
              Interstitial-er
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => confirmNavAction(() => setActiveTab("player"))}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
                activeTab === "player"
                  ? playMode === "Live"
                    ? "bg-purple-600 text-white"
                    : playMode === "Prerecord"
                      ? "bg-emerald-600 text-white"
                      : "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white",
              )}
            >
              <Play className="w-3.5 h-3.5" />
              <span className="text-xs font-bold uppercase tracking-tighter hide-player-name">
                Player
              </span>
            </button>
            {!isPlayerMode && (
              <button
                onClick={() => confirmNavAction(() => setActiveTab("calendar"))}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
                  activeTab === "calendar"
                    ? playMode === "Live"
                      ? "bg-purple-600 text-white"
                      : playMode === "Prerecord"
                        ? "bg-emerald-600 text-white"
                        : "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white",
                )}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span className="text-xs font-bold uppercase tracking-tighter hide-calendar-name">
                  Calendar
                </span>
              </button>
            )}
            <button
              onClick={() => confirmNavAction(() => setActiveTab("log"))}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer",
                activeTab === "log"
                  ? playMode === "Live"
                    ? "bg-purple-600 text-white"
                    : playMode === "Prerecord"
                      ? "bg-emerald-600 text-white"
                      : "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white",
              )}
            >
              <History className="w-3.5 h-3.5" />
              <span className="text-xs font-bold uppercase tracking-tighter hide-log-name">
                Log
              </span>
            </button>

          </div>
        </div>
      </header>

      {/* Control Strip - Time & Refresh (Collapsed) */}
      {activeTab === "player" && (
        <div className="bg-white border-b border-slate-200 py-1.5 px-2 shrink-0 shadow-sm z-10">
          <div className="max-w-[400px] mx-auto flex items-center justify-between gap-4">
            {playMode === "Export" ? (
              <div className="flex flex-col py-0.5">
                <p className="text-xs uppercase text-blue-600 font-black tracking-widest leading-none flex items-center gap-1.5">
                  <ListOrdered className="w-3.5 h-3.5" />
                  Playlist Export
                </p>
                <p className="text-xs font-mono font-black text-slate-900 tabular-nums mt-1 leading-none">
                  {prerecordDate
                    ? `${format(prerecordDate, "MM/dd/yyyy HH:mm")} to ${format(
                        addMinutes(prerecordDate, prerecordLengthMinutes),
                        "HH:mm",
                      )}`
                    : ""}
                </p>
              </div>
            ) : isPre ? (
              <div className="flex flex-col py-0.5">
                <p className="text-xs uppercase text-emerald-600 font-black tracking-widest leading-none flex items-center gap-1.5">
                  <CassetteTape className="w-3.5 h-3.5" />
                  Prerecord time and date
                </p>
                <p className="text-xs font-mono font-black text-slate-900 tabular-nums mt-1 leading-none">
                  {prerecordDate
                    ? `${format(prerecordDate, "MM/dd/yyyy HH:mm")} to ${format(
                        addMinutes(prerecordDate, prerecordLengthMinutes),
                        "HH:mm",
                      )}`
                    : ""}
                </p>
              </div>
            ) : (
              <div className="flex flex-col py-0.5">
                <p className="text-xs uppercase text-purple-600 font-black tracking-widest leading-none flex items-center gap-1.5 mb-1">
                  <RadioTower className="w-3.5 h-3.5 animate-pulse" />
                  Live Broadcast
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs uppercase text-slate-400 font-black tracking-tighter leading-none">
                    Time
                  </p>
                  <p className="text-xs font-mono font-black text-slate-900 tabular-nums leading-none">
                    {format(now, "HH:mm:ss")}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 font-sans">

              {playMode === "Live" && (
                <>
                  <p className="text-xs uppercase text-purple-600 font-black tracking-tight leading-none whitespace-nowrap">
                    Refresh: {formatCountdown(countdown)}
                  </p>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors group cursor-pointer"
                    title="Reload Status"
                  >
                    <RefreshCw className="w-3 h-3 font-bold transition-transform duration-500 group-hover:rotate-180" />
                    <span className="text-xs font-black uppercase tracking-tighter">
                      Now
                    </span>
                  </button>
                </>
              )}
              {(isPre || playMode === "Export") && (
                <button
                  type="button"
                  onClick={handleEditTimeframeModal}
                  className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors group cursor-pointer active:translate-y-px"
                  title="Edit Air Date and timeframe settings"
                >
                  <NotebookPen className="w-3 h-3 font-bold shrink-0 text-slate-500" />
                  <span className="text-xs font-black uppercase tracking-tighter">
                    Edit
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main
        className={cn(
          "flex-1 bg-[#F8FAFC] pb-2 flex flex-col min-h-0",
          activeTab === "player" ? "overflow-y-auto" : "overflow-hidden",
        )}
      >
        {/* Connection Error Warning Banner */}
        {connectionError && (
          <div
            className={cn(
              "mx-auto px-4 mt-3 transition-all shrink-0",
              activeTab === "player"
                ? "max-w-[400px]"
                : "max-w-full md:px-6 lg:px-8",
            )}
          >
            <div className="bg-red-950/60 border border-red-500/40 text-red-200 rounded-xl p-3 flex flex-col gap-1.5 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-red-400">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                Connection Warning
              </div>
              <p className="text-xs font-bold leading-relaxed text-red-100">
                Can't access folders. Please retry.
              </p>
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => setShowLocationsModal(true)}
                  className="flex items-center gap-1.5 py-1 px-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded border border-red-500 transition cursor-pointer active:translate-y-px"
                >
                  <Folder className="w-3 h-3 shrink-0" />
                  <span>Configure folders</span>
                </button>
                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-1.5 py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-black text-xs uppercase tracking-wider rounded border border-slate-700 transition cursor-pointer active:translate-y-px shadow-sm"
                >
                  <RefreshCw className="w-3 h-3 shrink-0 text-slate-100" />
                  <span>Retry Sync</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Missing Files Warning Banner */}
        {(() => {
          if (connectionError) return null;

          const isMissingInterstitials = interstitials.length === 0;
          const isMissingMP3s = driveMP3s.length === 0;
          const isMissingLogs = logs.length === 0;

          if (isMissingInterstitials || isMissingMP3s || isMissingLogs) {
            const missingItems: string[] = [];
            if (isMissingInterstitials) missingItems.push("Interstitials.json");
            if (isMissingMP3s) missingItems.push("mp3's");
            if (isMissingLogs) missingItems.push("Logs.json");

            let missingText = "";
            if (missingItems.length === 1) {
              missingText = `Can't find ${missingItems[0]}.`;
            } else if (missingItems.length === 2) {
              const item1 = missingItems[0] === "Interstitials.json" ? "interstitials.json" : missingItems[0];
              const item2 = missingItems[1] === "Interstitials.json" ? "interstitials.json" : missingItems[1];
              missingText = `Can't find ${item1} or ${item2}.`;
            } else {
              missingText = "Can't find interstitials.json, mp3's, or Logs.json.";
            }

            missingText += " (May not exist on first run.)";

            return (
              <div
                className={cn(
                  "mx-auto px-4 mt-3 transition-all shrink-0",
                  activeTab === "player"
                    ? "max-w-[400px]"
                    : "max-w-full md:px-6 lg:px-8",
                )}
              >
                <div className="bg-amber-950/60 border border-amber-500/40 text-amber-200 rounded-xl p-3 flex flex-col gap-1.5 shadow-sm">
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    Resource Warning
                  </div>
                  <p className="text-xs font-bold leading-relaxed text-amber-100">
                    {missingText}
                  </p>
                  <div className="mt-1">
                    <button
                      onClick={() => setShowLocationsModal(true)}
                      className="flex items-center gap-1.5 py-1 px-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider rounded border border-amber-400 transition cursor-pointer active:translate-y-px"
                    >
                      <Folder className="w-3 h-3 shrink-0" />
                      <span>Configure folders</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}

        <div
          className={cn(
            "w-full mx-auto pt-3 h-full transition-all flex flex-col min-h-0 pb-1",
            activeTab === "player"
              ? "max-w-[200px] px-1"
              : "max-w-full px-4 md:px-6 lg:px-8 flex-1",
          )}
        >
          <AnimatePresence mode="wait">
            {activeTab === "player" ? (
              <motion.div
                key="player"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full"
              >
                <PlayerTab
                  interstitials={interstitials}
                  logs={logs}
                  onLog={addLog}
                  now={now}
                  syncTime={syncTime}
                  scrollTrigger={scrollTrigger}
                  playMode={playMode}
                  playlistShow={selectedPlaylistShow}
                  prerecordDate={prerecordDate}
                  prerecordLengthMinutes={prerecordLengthMinutes}
                  onConfigureTimeframe={() =>
                    handleOpenTimeframeModal("Export")
                  }
                  onExecuteExport={handleExportPrerecord}
                  isAdmin={isAdmin}
                  onRefresh={handleRefresh}
                  shows={shows}
                  onTriggerCaching={(mode, urls) => triggerCachingForMode(mode, urls)}
                />
              </motion.div>
            ) : activeTab === "calendar" ? (
              <motion.div
                key="calendar"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full flex flex-col min-h-0 flex-1"
              >
                <CalendarTab
                  interstitials={interstitials}
                  onSave={saveInterstitials}
                  shows={shows}
                  onSaveShows={saveShows}
                  isAdmin={isAdmin}
                  onAdminToggle={setIsAdmin}
                  now={now}
                  driveMP3s={driveMP3s}
                  isDriveActive={isDriveActive}
                  onRefresh={handleRefresh}
                  currentViewMode={calendarSubTab}
                  onViewModeChange={(mode) => setCalendarSubTab(mode)}
                />
              </motion.div>
            ) : (
              <motion.div
                key="log"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full flex flex-col min-h-0 flex-1"
              >
                <LogTab logs={logs} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Bottom Footer - Default Locations Menu */}
      <footer
        className={cn(
          "px-4 py-2 shrink-0 border-t transition-all",
          locationMode === "Demo"
            ? "bg-amber-950/20 border-amber-900/40 text-amber-100"
            : "bg-slate-900 border-slate-800 text-slate-100",
        )}
      >
        <div className="flex justify-between items-center gap-2 w-full mx-auto min-h-[32px]">
          <div className="flex items-center shrink-0 gap-2">
            <div className="bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] flex items-center">
              <button
                type="button"
                onClick={() => setShowLocationsModal(true)}
                className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-all cursor-pointer shadow-sm text-xs font-black uppercase tracking-wider"
                title="Manage Storage Folders"
              >
                <Folder className="w-3.5 h-3.5 shrink-0" />
                <span className="hide-folders-text">Folders</span>
              </button>
            </div>

            {/* Light/Dark/System Theme Selector Pill Group next to standard Folders icon */}
            {/* Expanded view for wide screens */}
            <div className="hidden sm:flex bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] items-center gap-0.5">
              <button
                type="button"
                onClick={() => handleThemeChange("light")}
                title="Light Mode"
                aria-label="Light Mode"
                className={cn(
                  "px-2 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center justify-center relative",
                  currentTheme === "light"
                    ? "bg-slate-800 border-slate-700 text-white shadow-sm"
                    : "bg-slate-950/40 border-slate-900/40 text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"
                )}
              >
                <Sun className="w-3.5 h-3.5 shrink-0" />
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all duration-300 absolute -top-0.5 -right-0.5",
                    currentTheme === "light"
                      ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                      : "bg-slate-800 opacity-0"
                  )}
                />
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange("dark")}
                title="Dark Mode"
                aria-label="Dark Mode"
                className={cn(
                  "px-2 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center justify-center relative",
                  currentTheme === "dark"
                    ? "bg-slate-800 border-slate-700 text-white shadow-sm"
                    : "bg-slate-950/40 border-slate-900/40 text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"
                )}
              >
                <Moon className="w-3.5 h-3.5 shrink-0" />
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all duration-300 absolute -top-0.5 -right-0.5",
                    currentTheme === "dark"
                      ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                      : "bg-slate-800 opacity-0"
                  )}
                />
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange("system")}
                title="System Theme"
                aria-label="System Theme"
                className={cn(
                  "px-2 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center justify-center relative",
                  currentTheme === "system"
                    ? "bg-slate-800 border-slate-700 text-white shadow-sm"
                    : "bg-slate-950/40 border-slate-900/40 text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"
                )}
              >
                <Laptop className="w-3.5 h-3.5 shrink-0" />
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all duration-300 absolute -top-0.5 -right-0.5",
                    currentTheme === "system"
                      ? "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                      : "bg-slate-800 opacity-0"
                  )}
                />
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange("dark-test")}
                title="Dark Test Theme"
                aria-label="Dark Test Theme"
                className={cn(
                  "px-2 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center justify-center relative",
                  currentTheme === "dark-test"
                    ? "bg-slate-800 border-slate-700 text-amber-400 shadow-sm"
                    : "bg-slate-950/40 border-slate-900/40 text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"
                )}
              >
                <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all duration-300 absolute -top-0.5 -right-0.5",
                    currentTheme === "dark-test"
                      ? "bg-amber-500 shadow-[0_0_8px_#F59E0B,0_0_3px_#F59E0B]"
                      : "bg-slate-800 opacity-0"
                  )}
                />
              </button>
            </div>

            {/* Collapsed view for smaller screens: active theme control itself expands vertically into choices on hover or click */}
            <div
              className="sm:hidden relative group shrink-0"
              onMouseEnter={() => setMobileThemeExpanded(true)}
              onMouseLeave={() => setMobileThemeExpanded(false)}
            >
              {/* Expanding control container overlaying the reserved button slot */}
              <div
                className={cn(
                  "absolute bottom-0 right-0 bg-slate-950 p-0.5 rounded border border-slate-900 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] flex flex-col items-center gap-0.5 transition-all duration-150 z-50",
                  mobileThemeExpanded ? "shadow-2xl ring-1 ring-slate-800" : ""
                )}
              >
                {[
                  { id: "light" as const, label: "Light Mode", Icon: Sun },
                  { id: "dark" as const, label: "Dark Mode", Icon: Moon },
                  { id: "system" as const, label: "System Theme", Icon: Laptop },
                  { id: "dark-test" as const, label: "Dark Test Theme", Icon: HelpCircle },
                ].map((item) => {
                  const isActive = currentTheme === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => {
                        handleThemeChange(item.id);
                        (e.currentTarget as HTMLElement).blur();
                      }}
                      title={item.label}
                      aria-label={item.label}
                      className={cn(
                        "px-2 py-1 rounded transition-all cursor-pointer border flex items-center justify-center relative shrink-0 w-full",
                        !isActive && !mobileThemeExpanded && "hidden group-hover:flex",
                        isActive
                          ? item.id === "dark-test"
                            ? "bg-slate-800 border-slate-700 text-amber-400 shadow-sm"
                            : "bg-slate-800 border-slate-700 text-white shadow-sm"
                          : "bg-slate-950/40 border-slate-900/40 text-slate-500 hover:text-slate-300 hover:bg-slate-900/60"
                      )}
                    >
                      <item.Icon className="w-3.5 h-3.5 shrink-0" />
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all duration-300 absolute -top-0.5 -right-0.5",
                          isActive
                            ? item.id === "dark-test"
                              ? "bg-amber-500 shadow-[0_0_8px_#F59E0B,0_0_3px_#F59E0B]"
                              : "bg-red-500 shadow-[0_0_8px_#EF4444,0_0_3px_#EF4444]"
                            : "bg-slate-800 opacity-0"
                        )}
                      />
                    </button>
                  );
                })}
              </div>
              {/* Dummy spacer to maintain exact header element footprint */}
              <div className="w-[31px] h-[30px] pointer-events-none" />
            </div>

            {/* DEMO Indicator displayed only in Demo storage Mode - aligned next to the Folders button */}
            {locationMode === "Demo" && (
              <span className="text-xs font-black tracking-widest text-[#F59E0B] animate-pulse bg-amber-950/40 px-2.5 py-1 rounded border border-amber-500/20 leading-none">
                DEMO
              </span>
            )}
          </div>

          <div className="flex items-center shrink-0 ml-auto">
            {/* Mode Controls - only shown on Player tab */}
            {activeTab === "player" && (
              <>
                {/* Horizontal Mode Pill Group (Wide / Medium screens) */}
                <div className="mode-horizontal-group flex bg-slate-950 p-0.5 rounded border border-slate-900 shrink-0 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.8)] items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      confirmNavAction(() => {
                        if (playMode !== "Live") {
                          setPlayMode("Live");
                          setPrerecordDate(null);
                          handleRefresh();
                          triggerCachingForMode("Live");
                        }
                      });
                    }}
                    title="Live Mode"
                    aria-label="Live Mode"
                    className={cn(
                      "px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5",
                      playMode === "Live"
                        ? "bg-gradient-to-b from-purple-500 to-purple-600 border-t-purple-400 border-b-purple-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)]"
                        : "bg-purple-950/30 border-purple-900/30 text-purple-500/60 hover:text-purple-400/80 hover:bg-purple-950/45",
                    )}
                  >
                    <RadioTower
                      className={cn(
                        "w-3.5 h-3.5 transition-all duration-300 shrink-0",
                        playMode === "Live"
                          ? "text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)]"
                          : "text-slate-500",
                      )}
                    />
                    <span className={getModeTextHideClass("Live")}>Live</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      confirmNavAction(() => {
                        if (playMode !== "Prerecord") {
                          handleOpenTimeframeModal("Prerecord");
                        }
                      });
                    }}
                    title="Prerecord Mode"
                    aria-label="Prerecord Mode"
                    className={cn(
                      "px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5",
                      playMode === "Prerecord"
                        ? "bg-gradient-to-b from-emerald-500 to-emerald-600 border-t-emerald-400 border-b-emerald-800 text-white shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.4)]"
                        : "bg-emerald-950/30 border-emerald-900/30 text-emerald-500/60 hover:text-emerald-400/80 hover:bg-emerald-950/45",
                    )}
                  >
                    <CassetteTape
                      className={cn(
                        "w-3.5 h-3.5 transition-all duration-300 shrink-0",
                        playMode === "Prerecord"
                          ? "text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)]"
                          : "text-slate-500",
                      )}
                    />
                    <span className={getModeTextHideClass("Prerecord")}>Prerecord</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      confirmNavAction(() => {
                        if (playMode !== "Export") {
                          handleOpenTimeframeModal("Export");
                        }
                      });
                    }}
                    title="Export Mode"
                    aria-label="Export Mode"
                    className={cn(
                      "px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5",
                      playMode === "Export"
                        ? "bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.4)]"
                        : "bg-blue-950/30 border-blue-900/30 text-blue-500/60 hover:text-blue-400/80 hover:bg-blue-950/45",
                    )}
                  >
                    <ListOrdered
                      className={cn(
                        "w-3.5 h-3.5 transition-all duration-300 shrink-0",
                        playMode === "Export"
                          ? "text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)]"
                          : "text-slate-500",
                      )}
                    />
                    <span className={getModeTextHideClass("Export")}>Export</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      confirmNavAction(() => {
                        handleOpenPlaylistModal();
                      });
                    }}
                    title="Playlist Mode"
                    aria-label="Playlist Mode"
                    className={cn(
                      "px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer border flex items-center gap-1.5",
                      playMode === "Playlist"
                        ? "bg-gradient-to-b from-purple-600 to-purple-700 border-t-purple-400 border-b-purple-900 text-white shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.4)]"
                        : "bg-purple-950/30 border-purple-900/30 text-purple-400/70 hover:text-purple-300 hover:bg-purple-950/45",
                    )}
                  >
                    <ListMusic
                      className={cn(
                        "w-3.5 h-3.5 transition-all duration-300 shrink-0",
                        playMode === "Playlist"
                          ? "text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)]"
                          : "text-slate-500",
                      )}
                    />
                    <span className={getModeTextHideClass("Playlist")}>Playlist</span>
                  </button>
                </div>

                {/* Collapsed view for smaller screens: active mode control itself expands vertically into choices on hover or click */}
                <div
                  className="mode-vertical-group relative group shrink-0"
                  onMouseEnter={() => setMobileModeExpanded(true)}
                  onMouseLeave={() => setMobileModeExpanded(false)}
                >
                  <div
                    className={cn(
                      "absolute bottom-0 right-0 flex flex-col bg-slate-950 p-0.5 rounded border border-slate-900 z-50 gap-0.5 transition-all duration-200 shadow-xl",
                      mobileModeExpanded ? "shadow-2xl ring-1 ring-slate-800" : ""
                    )}
                  >
                    {[
                      {
                        id: "Live" as const,
                        label: "Live Mode",
                        Icon: RadioTower,
                        onClick: () => {
                          confirmNavAction(() => {
                            if (playMode !== "Live") {
                              setPlayMode("Live");
                              setPrerecordDate(null);
                              handleRefresh();
                            }
                          });
                        },
                        activeClass: "bg-gradient-to-b from-purple-500 to-purple-600 border-t-purple-400 border-b-purple-800 text-white shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.4)]",
                        inactiveClass: "bg-purple-950/30 border-purple-900/30 text-purple-500/60 hover:text-purple-400/80 hover:bg-purple-950/45",
                      },
                      {
                        id: "Prerecord" as const,
                        label: "Prerecord Mode",
                        Icon: CassetteTape,
                        onClick: () => {
                          confirmNavAction(() => {
                            if (playMode !== "Prerecord") {
                              handleOpenTimeframeModal("Prerecord");
                            }
                          });
                        },
                        activeClass: "bg-gradient-to-b from-emerald-500 to-emerald-600 border-t-emerald-400 border-b-emerald-800 text-white shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.4)]",
                        inactiveClass: "bg-emerald-950/30 border-emerald-900/30 text-emerald-500/60 hover:text-emerald-400/80 hover:bg-emerald-950/45",
                      },
                      {
                        id: "Export" as const,
                        label: "Export Mode",
                        Icon: ListOrdered,
                        onClick: () => {
                          confirmNavAction(() => {
                            if (playMode !== "Export") {
                              handleOpenTimeframeModal("Export");
                            }
                          });
                        },
                        activeClass: "bg-gradient-to-b from-blue-500 to-blue-600 border-t-blue-400 border-b-blue-800 text-white shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.4)]",
                        inactiveClass: "bg-blue-950/30 border-blue-900/30 text-blue-500/60 hover:text-blue-400/80 hover:bg-blue-950/45",
                      },
                      {
                        id: "Playlist" as const,
                        label: "Playlist Mode",
                        Icon: ListMusic,
                        onClick: () => {
                          confirmNavAction(() => {
                            handleOpenPlaylistModal();
                          });
                        },
                        activeClass: "bg-gradient-to-b from-purple-600 to-purple-700 border-t-purple-400 border-b-purple-900 text-white shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.4)]",
                        inactiveClass: "bg-purple-950/30 border-purple-900/30 text-purple-400/70 hover:text-purple-300 hover:bg-purple-950/45",
                      },
                    ].map((item) => {
                      const isActive = playMode === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={(e) => {
                            item.onClick();
                            (e.currentTarget as HTMLElement).blur();
                            setMobileModeExpanded(false);
                          }}
                          title={item.label}
                          aria-label={item.label}
                          className={cn(
                            "px-2 py-1 rounded transition-all cursor-pointer border flex items-center justify-start relative shrink-0 w-full gap-1.5",
                            !isActive && !mobileModeExpanded && "hidden group-hover:flex",
                            isActive ? item.activeClass : item.inactiveClass
                          )}
                        >
                          <item.Icon
                            className={cn(
                              "w-3.5 h-3.5 transition-all duration-300 shrink-0",
                              isActive
                                ? "text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.85)]"
                                : "text-slate-500"
                            )}
                          />
                          <span className="mode-vertical-text text-xs font-black uppercase tracking-wider whitespace-nowrap">
                            {item.id}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Dummy spacer to maintain exact element footprint */}
                  <div className="mode-vertical-spacer h-[30px] pointer-events-none" />
                </div>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* Prerecord Activation Modal */}
      <AnimatePresence>
        {showPrerecordModal &&
          (() => {
            const isExportTarget = prerecordModalTarget === "Export";
            const colors = {
              accentText: isExportTarget
                ? "text-blue-700"
                : "text-emerald-700",
              focusRing: isExportTarget
                ? "focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                : "focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500",
              buttonBg: isExportTarget
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
              border: isExportTarget
                ? "border-blue-300"
                : "border-emerald-300",
            };
            const ModeIcon = isExportTarget ? ListOrdered : CassetteTape;

            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-900/40 backdrop-blur-xs">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "bg-white border rounded-xl shadow-2xl w-[255px] max-w-[95vw] text-slate-800 flex flex-col font-sans min-h-0",
                    prerecordSelectorMode === "show-list" && !showPrerecordConfirmStep ? "h-[80vh] max-h-[80vh]" : "max-h-[80vh]",
                    colors.border,
                  )}
                >
                  {showPrerecordConfirmStep && prerecordConfirmDetails ? (
                    <div className="flex flex-col flex-1 min-h-0">
                      {/* Confirmation Header */}
                      <div className="px-3.5 py-2.5 border-b border-slate-200 flex items-center bg-slate-50 shrink-0">
                        <div className="flex items-center gap-2">
                          <span className={colors.accentText}>
                            <ModeIcon className="w-4 h-4 shrink-0" />
                          </span>
                          <h3 className={cn("text-xs font-black uppercase tracking-wider", colors.accentText)}>
                            Verify Air Date
                          </h3>
                        </div>
                      </div>

                      {/* Confirmation Content */}
                      <div className="p-3 space-y-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        <p className="text-xs leading-relaxed text-slate-600 font-medium">
                          Is this ok?
                        </p>

                        <div className="space-y-2.5">
                          {/* Air Date */}
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-500 pr-2 shrink-0 select-none">
                              Air Date
                            </label>
                            <span
                              className={cn(
                                "w-[150px] px-2.5 py-1 bg-slate-100 border border-slate-300 rounded text-xs font-mono font-bold text-slate-800 text-left select-none cursor-default",
                              )}
                            >
                              {formatVerifyAirDate(prerecordDateInput)}
                            </span>
                          </div>

                          {/* Start Time */}
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-500 pr-2 shrink-0 select-none">
                              Start Time
                            </label>
                            <div className="flex items-center gap-1.5 w-[150px]">
                              <span
                                className={cn(
                                  "px-1 py-0.5 bg-transparent rounded text-xs font-mono font-bold text-left select-none cursor-default",
                                  colors.accentText,
                                )}
                              >
                                {prerecordTimeInput}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 select-none uppercase font-sans">
                                HH:MM (24 hr)
                              </span>
                            </div>
                          </div>

                          {/* Start (12HR) */}
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-black uppercase text-slate-500 pr-2 shrink-0 select-none italic">
                              Start (12HR)
                            </label>
                            <div className="flex items-center gap-1.5 border border-transparent px-1 py-0.5 h-6 shrink-0 w-[150px]">
                              <span
                                className={cn(
                                  "text-xs font-black font-mono italic opacity-90",
                                  colors.accentText,
                                )}
                              >
                                {getPrerecord12HrDisplay(prerecordTimeInput)}
                              </span>
                            </div>
                          </div>

                          {/* Length */}
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-500 pr-2 shrink-0 select-none">
                              Length
                            </label>
                            <div className="flex items-center gap-2 w-[150px]">
                              <div className="flex items-center gap-1">
                                <span
                                  className={cn(
                                    "px-1 py-0.5 bg-transparent rounded text-xs font-mono font-bold text-left select-none cursor-default",
                                    colors.accentText,
                                  )}
                                >
                                  {prerecordHoursInput}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 select-none uppercase font-sans">
                                  Hrs
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span
                                  className={cn(
                                    "px-1 py-0.5 bg-transparent rounded text-xs font-mono font-bold text-left select-none cursor-default",
                                    colors.accentText,
                                  )}
                                >
                                  {prerecordMinutesInput}
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 select-none uppercase font-sans">
                                  Min
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Confirmation Actions */}
                      <div className="px-3 py-2.5 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end rounded-b-xl">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPrerecordConfirmStep(false);
                            setPrerecordConfirmDetails(null);
                          }}
                          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider rounded border border-slate-300 transition cursor-pointer active:translate-y-px flex items-center gap-1.5"
                        >
                          <NotebookPen className="w-3 h-3 font-bold shrink-0 text-slate-500" />
                          <span className="text-xs font-black uppercase tracking-tighter">
                            Edit
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={handleFinalConfirmPrerecord}
                          className={cn(
                            "px-3.5 py-1.5 text-white text-xs font-black uppercase tracking-wider rounded shadow-md transition cursor-pointer active:translate-y-px flex items-center gap-1.5",
                            colors.buttonBg,
                          )}
                        >
                          <ModeIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>OK</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form
                      onSubmit={handleActivatePrerecord}
                      className="flex flex-col flex-1 min-h-0"
                    >
                      {/* Modal Header */}
                      <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className={colors.accentText}>
                            <ModeIcon className="w-4 h-4 shrink-0" />
                          </span>
                          <h3 className={cn("text-xs font-black uppercase tracking-wider truncate", colors.accentText)}>
                            {prerecordSelectorMode === "show-list"
                              ? (isExportTarget ? "Choose Show to export" : "Choose Show to prerecord")
                              : "Set Air Date"}
                          </h3>
                        </div>
                      </div>

                      {/* Modal Content */}
                      <div className="p-2.5 space-y-2.5 flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
                        {prerecordSelectorMode === "manual" && (
                          <p className="text-xs leading-relaxed text-slate-600 font-medium shrink-0">
                            When will the show air?
                          </p>
                        )}

                        {prerecordSelectorMode === "show-list" ? (
                          <div className="space-y-2 flex-1 flex flex-col min-h-0">
                            {/* Filter Box Stacked Vertically */}
                            <div className="relative w-full shrink-0">
                              <input
                                type="text"
                                placeholder="Filter shows..."
                                value={showFilterText}
                                onChange={(e) => setShowFilterText(e.target.value)}
                                className={cn(
                                  "w-full px-2 py-1 pr-6 bg-white border border-slate-300 rounded text-xs text-slate-800 placeholder-slate-400 outline-none font-sans shadow-xs",
                                  colors.focusRing,
                                )}
                              />
                              {showFilterText && (
                                <button
                                  type="button"
                                  onClick={() => setShowFilterText("")}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs px-0.5"
                                >
                                  ✕
                                </button>
                              )}
                            </div>

                            {/* Condensed Listbox of Shows - Dynamic vertical expansion with min height */}
                            <div className="flex flex-col text-left flex-1 min-h-[68px]">
                              <div className="h-full min-h-[68px] overflow-y-auto border border-slate-300 rounded-lg divide-y divide-slate-200/80 bg-white shadow-inner custom-scrollbar">
                                {(() => {
                                  const activeShows = getSortedShows(shows.filter((s) => s.active));
                                  const filtered = activeShows.filter(
                                    (s) =>
                                      s.name.toLowerCase().includes(showFilterText.toLowerCase()) ||
                                      s.day.toLowerCase().includes(showFilterText.toLowerCase()),
                                  );

                                  if (filtered.length === 0) {
                                    return (
                                      <div className="p-2.5 text-center text-xs text-slate-500 italic">
                                        No matching active shows
                                      </div>
                                    );
                                  }

                                  return filtered.map((show) => {
                                    const shade = getShowShade(show, getSortedShows(shows));
                                    const isSelected = selectedPrerecordShowId === show.id;
                                    return (
                                      <div
                                        key={show.id}
                                        onClick={() => handleSelectPrerecordShow(show.id)}
                                        style={{
                                          backgroundColor: shade.bg,
                                          borderLeft: `3px solid ${shade.border}`,
                                        }}
                                        className={cn(
                                          "flex flex-col gap-0.5 px-2 py-1.5 cursor-pointer text-xs transition-all hover:brightness-95 select-none",
                                          isSelected && cn("ring-2 ring-inset z-10 font-bold", isExportTarget ? "ring-blue-600" : "ring-emerald-600"),
                                        )}
                                      >
                                        <div className="flex items-center justify-between gap-1 w-full min-w-0">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="px-1 py-0.2 bg-blue-50 text-blue-700 border border-blue-150 rounded text-[9px] font-black uppercase tracking-tight shrink-0">
                                              {show.day}
                                            </span>
                                            <span className="text-[10px] font-mono font-bold text-slate-700 truncate">
                                              {show.startHour.toString().padStart(2, "0")}:{show.startMinute.toString().padStart(2, "0")} ({show.durationHours}h{show.durationMinutes ? `${show.durationMinutes}m` : ""})
                                            </span>
                                          </div>
                                          {isSelected && (
                                            <Check className={cn("w-3.5 h-3.5 font-bold shrink-0 ml-auto", isExportTarget ? "text-blue-700" : "text-emerald-700")} />
                                          )}
                                        </div>
                                        <div className="font-bold text-slate-900 truncate w-full text-[11px] leading-tight">
                                          {show.name}
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>

                            {/* Future Dates Dropdown - always rendered so layout space is static */}
                            {selectedPrerecordShowId ? (
                              (() => {
                                const show = shows.find((s) => s.id === selectedPrerecordShowId);
                                if (!show) return null;
                                const occurrences = getFutureDatesForShow(show.day, show.startHour, show.startMinute);
                                return (
                                  <div className="flex flex-col space-y-1 text-left pt-0.5 shrink-0">
                                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 select-none">
                                      Choose Air Date
                                    </label>
                                    <select
                                      ref={dateSelectRef}
                                      value={prerecordDateInput}
                                      onChange={(e) => setPrerecordDateInput(e.target.value)}
                                      className={cn(
                                        "w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-slate-800 outline-none transition-all cursor-pointer shadow-xs",
                                        colors.focusRing,
                                      )}
                                    >
                                      {occurrences.map((date, index) => {
                                        const dateStr = format(date, "yyyy-MM-dd");
                                        const friendlyStr = format(date, "EEEE, MMM d, yyyy");
                                        const isNextDate = index === 0;
                                        return (
                                          <option
                                            key={dateStr}
                                            value={dateStr}
                                            className={cn(
                                              isNextDate
                                                ? "font-bold text-slate-900 bg-white"
                                                : "font-normal text-slate-400 bg-slate-50",
                                            )}
                                          >
                                            {friendlyStr}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>
                                );
                              })()
                            ) : (
                              <div className="flex flex-col space-y-1 text-left pt-0.5 shrink-0">
                                <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 select-none">
                                  Choose Air Date
                                </label>
                                <select
                                  disabled
                                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-mono font-medium text-slate-400 outline-none cursor-not-allowed opacity-60"
                                >
                                  <option value="">Select a show above...</option>
                                </select>
                              </div>
                            )}

                            {/* Select Manually option */}
                            <div className="flex justify-start pt-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setPrerecordSelectorMode("manual")}
                                className="text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 outline-none"
                              >
                                <NotebookPen className="w-3 h-3 shrink-0 text-slate-500" />
                                Set manually
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {/* Date picker */}
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-black uppercase tracking-wider text-slate-600 pr-2 shrink-0 select-none">
                                Air Date
                              </label>
                              <input
                                type="date"
                                required
                                value={prerecordDateInput}
                                onChange={(e) =>
                                  setPrerecordDateInput(e.target.value)
                                }
                                className={cn(
                                  "w-[140px] px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-slate-800 outline-none transition-all cursor-pointer shadow-xs",
                                  colors.focusRing,
                                )}
                              />
                            </div>

                            {/* Time picker (24h input mask) */}
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-black uppercase tracking-wider text-slate-600 pr-2 shrink-0 select-none">
                                Start Time
                              </label>
                              <div className="flex items-center gap-1.5 w-[140px]">
                                <input
                                  type="text"
                                  required
                                  placeholder="HH:mm"
                                  maxLength={5}
                                  value={prerecordTimeInput}
                                  onChange={handleTimeInputChange}
                                  className={cn(
                                    "w-[50px] px-1 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-slate-800 outline-none transition-all text-left cursor-pointer shadow-xs",
                                    colors.focusRing,
                                  )}
                                />
                                <span className="text-[9px] font-bold text-slate-500 select-none uppercase font-sans">
                                  HH:MM (24h)
                                </span>
                              </div>
                            </div>

                            {/* Start (12HR) */}
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-black uppercase text-slate-500 pr-2 shrink-0 select-none italic">
                                Start (12HR)
                              </label>
                              <div className="flex items-center gap-1.5 border border-transparent px-1 py-0.5 h-6 shrink-0 w-[140px]">
                                <span
                                  className={cn(
                                    "text-xs font-black font-mono italic opacity-90",
                                    colors.accentText,
                                  )}
                                >
                                  {getPrerecord12HrDisplay(prerecordTimeInput)}
                                </span>
                              </div>
                            </div>

                            {/* Show Length pickers */}
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-black uppercase tracking-wider text-slate-600 pr-2 shrink-0 select-none">
                                Length
                              </label>
                              <div className="flex items-center gap-2 w-[140px]">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    required
                                    min={0}
                                    max={999}
                                    value={prerecordHoursInput}
                                    onChange={(e) =>
                                      setPrerecordHoursInput(e.target.value)
                                    }
                                    className={cn(
                                      "w-[45px] px-1 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-slate-800 outline-none transition-all shadow-xs",
                                      colors.focusRing,
                                    )}
                                  />
                                  <span className="text-[9px] font-bold text-slate-500 select-none uppercase font-sans">
                                    Hrs
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    required
                                    min={0}
                                    max={59}
                                    value={prerecordMinutesInput}
                                    onChange={(e) =>
                                      setPrerecordMinutesInput(e.target.value)
                                    }
                                    className={cn(
                                      "w-[45px] px-1 py-1 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-slate-800 outline-none transition-all shadow-xs",
                                      colors.focusRing,
                                    )}
                                  />
                                  <span className="text-[9px] font-bold text-slate-500 select-none uppercase font-sans">
                                    Min
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Select from schedule option if there are active shows */}
                            {shows.some((s) => s.active) && (
                              <div className="flex justify-start pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPrerecordShowId("");
                                    setShowFilterText("");
                                    setPrerecordSelectorMode("show-list");
                                  }}
                                  className="text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 outline-none"
                                >
                                  <List className="w-3 h-3 shrink-0 text-slate-500" />
                                  Select from schedule
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {prerecordError && (
                          <div className="bg-red-50 border border-red-200 rounded p-2 flex items-start gap-1.5 text-red-700">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
                            <span className="text-[11px] leading-tight font-medium">
                              {prerecordError}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Modal Actions */}
                      <div className="px-3 py-2 border-t border-slate-200 bg-slate-50 flex gap-1.5 justify-end rounded-b-xl shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowPrerecordModal(false)}
                          className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider rounded border border-slate-300 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                        {(prerecordSelectorMode === "manual" || selectedPrerecordShowId) && (
                          <button
                            type="submit"
                            className={cn(
                              "px-3.5 py-1 text-white text-xs font-black uppercase tracking-wider rounded shadow-md transition flex items-center gap-1.5 cursor-pointer",
                              colors.buttonBg,
                            )}
                          >
                            <ModeIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{isExportTarget ? "Export" : "Prerecord"}</span>
                          </button>
                        )}
                      </div>
                    </form>
                  )}
                </motion.div>
              </div>
            );
          })()}
      </AnimatePresence>

      {/* Playlist Mode Selection Modal */}
      <AnimatePresence>
        {showPlaylistModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-xl shadow-2xl w-[420px] max-w-[95vw] text-slate-800 dark:text-slate-100 flex flex-col font-sans overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-purple-50 dark:bg-purple-950/40 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-purple-600 dark:text-purple-400">
                    <ListMusic className="w-5 h-5 shrink-0" />
                  </span>
                  <h3 className="text-xs font-black uppercase tracking-wider text-purple-900 dark:text-purple-200">
                    Playlist Mode - Select Show
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlaylistModal(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
                {playlistModalLoading ? (
                  <div className="py-8 flex flex-col items-center justify-center space-y-2 text-purple-600 dark:text-purple-400">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                    <span className="text-xs font-bold uppercase tracking-wider">Checking Playlist Folders...</span>
                  </div>
                ) : playlistShowOptions ? (
                  <div className="space-y-2.5">
                    {/* Current Show Card */}
                    {playlistShowOptions.currentShow ? (() => {
                      const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
                      const nowObj = playlistModalNow || syncTime || new Date();
                      const currentWeekMin = nowObj.getDay() * 1440 + nowObj.getHours() * 60 + nowObj.getMinutes();
                      const showStartWeekMin = daysOrder.indexOf(playlistShowOptions.currentShow.day) * 1440 + playlistShowOptions.currentShow.startHour * 60 + playlistShowOptions.currentShow.startMinute;
                      const totalShowMin = (playlistShowOptions.currentShow.durationHours * 60) + playlistShowOptions.currentShow.durationMinutes;
                      const elapsedMin = (currentWeekMin - showStartWeekMin + 10080) % 10080;
                      const remainingMin = totalShowMin - elapsedMin;
                      
                      const formatHM = (mins: number) => {
                        const h = Math.floor(Math.max(0, mins) / 60);
                        const m = Math.floor(Math.max(0, mins) % 60);
                        return `${h}:${m.toString().padStart(2, '0')}`;
                      };

                      const timeLabel = remainingMin < 30 
                        ? `${formatHM(remainingMin)} remaining`
                        : `${formatHM(elapsedMin)} elapsed`;

                      return (
                        <div
                          onClick={() => handleSelectAndConfirmShow(playlistShowOptions.currentShow!)}
                          className={cn(
                            "p-3 rounded-lg border text-left cursor-pointer transition-all relative select-none flex flex-col gap-1.5",
                            chosenPlaylistShowId === playlistShowOptions.currentShow.id
                              ? "bg-purple-50/80 dark:bg-purple-950/50 border-purple-500 ring-2 ring-purple-500/30"
                              : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                                Current Show
                              </span>
                              <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 mt-1">
                                {playlistShowOptions.currentShow.name}
                              </h4>
                            </div>
                          </div>

                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                            <span>
                              {`${playlistShowOptions.currentShowFileCount} MP3s`}
                            </span>
                            <span className="font-sans text-[10px] uppercase font-bold text-slate-400">
                              {timeLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="p-3 text-xs text-slate-500 italic bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                        No current show active in schedule.
                      </div>
                    )}

                    {/* Next Show Card */}
                    {playlistShowOptions.nextShow ? (() => {
                      const daysOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
                      const nowObj = playlistModalNow || syncTime || new Date();
                      const currentWeekMin = nowObj.getDay() * 1440 + nowObj.getHours() * 60 + nowObj.getMinutes();
                      const nextStartWeekMin = daysOrder.indexOf(playlistShowOptions.nextShow.day) * 1440 + playlistShowOptions.nextShow.startHour * 60 + playlistShowOptions.nextShow.startMinute;
                      const minsUntilNextShow = (nextStartWeekMin - currentWeekMin + 10080) % 10080;
                      const nextH = Math.floor(Math.max(0, minsUntilNextShow) / 60);
                      const nextM = Math.floor(Math.max(0, minsUntilNextShow) % 60);
                      const startsInLabel = `Starts in ${nextH}:${nextM.toString().padStart(2, '0')}`;

                      return (
                        <div
                          onClick={() => handleSelectAndConfirmShow(playlistShowOptions.nextShow!)}
                          className={cn(
                            "p-3 rounded-lg border text-left cursor-pointer transition-all relative select-none flex flex-col gap-1.5",
                            chosenPlaylistShowId === playlistShowOptions.nextShow.id
                              ? "bg-purple-50/80 dark:bg-purple-950/50 border-purple-500 ring-2 ring-purple-500/30"
                              : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                                Next Show
                              </span>
                              <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 mt-1">
                                {playlistShowOptions.nextShow.name}
                              </h4>
                            </div>
                          </div>

                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                            <span>
                              {`${playlistShowOptions.nextShowFileCount} MP3s`}
                            </span>
                            <span className="font-sans text-[10px] uppercase font-bold text-slate-400">
                              {startsInLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="p-3 text-xs text-slate-500 italic bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                        No upcoming show in schedule.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 text-xs text-slate-500 italic">No show information available.</div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex gap-2 justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPlaylistModal(false)}
                  className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-wider rounded border border-slate-300 dark:border-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLocationsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-slate-900 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2 text-blue-600">
                  <Folder className="w-5 h-5" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">
                    Storage Folders
                  </h3>
                </div>
              </div>

              {/* Modal Core Form */}
              <form
                onSubmit={handleSaveLocations}
                className="flex flex-col flex-1 overflow-hidden"
              >
                {/* Modal Content */}
                <div className="p-3.5 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
                  {/* Mode Selector Row */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-black uppercase text-slate-600 tracking-widest leading-none">
                      Select Mode
                    </p>
                    <div className="p-1 bg-slate-100 border border-slate-200 rounded-lg flex gap-1 items-center shadow-inner">
                      <button
                        type="button"
                        onClick={() => setLocationMode("Demo")}
                        className={cn(
                          "flex-1 py-1 text-xs font-black uppercase tracking-wider rounded border transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5",
                          locationMode === "Demo"
                            ? "bg-gradient-to-b from-amber-500 to-amber-600 border-[#F59E0B] text-white font-black shadow-sm"
                            : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100",
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full transition-all duration-300",
                            locationMode === "Demo"
                              ? "bg-red-500 shadow-[0_0_8px_#EF4444]"
                              : "bg-slate-300",
                          )}
                        />
                        Demo
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationMode("Drive")}
                        className={cn(
                          "flex-1 py-1 text-xs font-black uppercase tracking-wider rounded border transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5",
                          locationMode === "Drive"
                            ? "bg-gradient-to-b from-blue-500 to-blue-600 border-[#3B82F6] text-white font-black shadow-sm"
                            : "bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100",
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full transition-all duration-300",
                            locationMode === "Drive"
                              ? "bg-red-500 shadow-[0_0_8px_#EF4444]"
                              : "bg-slate-300",
                          )}
                        />
                        Google Drive
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationMode("Local")}
                        className={cn(
                          "flex-1 py-1 text-xs font-black uppercase tracking-wider rounded border transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5",
                          locationMode === "Local"
                            ? "bg-gradient-to-b from-purple-500 to-purple-600 border-[#8B5CF6] text-white font-black shadow-sm"
                            : "bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100",
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full transition-all duration-300",
                            locationMode === "Local"
                              ? "bg-red-500 shadow-[0_0_8px_#EF4444]"
                              : "bg-slate-300",
                          )}
                        />
                        Local Folder
                      </button>
                    </div>
                  </div>

                  {/* Directories List Depending on Mode */}
                  {locationMode === "Local" && (
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            Local Calendar Path
                          </label>
                          {!draftLocalPathCalendar ? (
                            <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-bold uppercase">
                              To be set
                            </span>
                          ) : (
                            <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-bold uppercase">
                              Configured
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. /Users/name/data/calendar"
                          value={draftLocalPathCalendar}
                          onChange={(e) =>
                            setDraftLocalPathCalendar(e.target.value)
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => handleBrowseNative("calendar")}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Edit
                          </button>
                          {draftLocalPathCalendar && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenLocalPath(draftLocalPathCalendar)
                              }
                              className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                            >
                              Open
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Directory where Interstitial-er saves the interstitials
                          configuration.
                        </p>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            Local Media & Script Directory Path
                          </label>
                          {!draftLocalPathMP3s ? (
                            <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-bold uppercase">
                              To be set
                            </span>
                          ) : (
                            <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-bold uppercase">
                              Configured
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. /Users/name/Music/MediaAndScripts"
                          value={draftLocalPathMP3s}
                          onChange={(e) =>
                            setDraftLocalPathMP3s(e.target.value)
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => handleBrowseNative("mp3s")}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Edit
                          </button>
                          {draftLocalPathMP3s && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenLocalPath(draftLocalPathMP3s)
                              }
                              className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                            >
                              Open
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Absolute path containing your secondary .mp3 playback audio, script, and image files.
                        </p>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            Local Play Log Records Path
                          </label>
                          {!draftLocalPathLogs ? (
                            <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-bold uppercase">
                              To be set
                            </span>
                          ) : (
                            <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-bold uppercase">
                              Configured
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. /Users/name/logs"
                          value={draftLocalPathLogs}
                          onChange={(e) =>
                            setDraftLocalPathLogs(e.target.value)
                          }
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => handleBrowseNative("logs")}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Edit
                          </button>
                          {draftLocalPathLogs && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenLocalPath(draftLocalPathLogs)
                              }
                              className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                            >
                              Open
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Directory location where logs are stored sequentially.
                        </p>
                      </div>

                      {localPathsUnavailable && (
                        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded text-xs leading-relaxed font-medium">
                          ⚠️ One or more specified local directories are missing
                          or inaccessible. Please verify paths are correct and
                          physically exist on host desktop folders.
                        </div>
                      )}
                    </div>
                  )}

                  {locationMode === "Drive" && (
                    <div className="space-y-3">
                      {/* Preferences/Interstitials Container */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            Interstitial
                          </span>
                          {draftDriveFolderPreferences ? (
                            <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                              Configured
                            </span>
                          ) : (
                            <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                              To be set
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-sans text-slate-800 select-all truncate leading-relaxed">
                          {driveFolderDescMap[draftDriveFolderPreferences] ||
                            "No directory folder configured yet"}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDriveField("preferences");
                              setTempPasteLink(draftDriveFolderPreferences);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          {draftDriveFolderPreferences && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenDriveFolder(
                                  draftDriveFolderPreferences,
                                )
                              }
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Open
                            </button>
                          )}
                        </div>
                      </div>

                      {/* MP3s Folder Container */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            media & scripts
                          </span>
                          {draftDriveFolderMP3s ? (
                            <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                              Configured
                            </span>
                          ) : (
                            <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                              To be set
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-sans text-slate-800 select-all truncate leading-relaxed">
                          {driveFolderDescMap[draftDriveFolderMP3s] ||
                            "No directory folder configured yet"}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDriveField("mp3s");
                              setTempPasteLink(draftDriveFolderMP3s);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          {draftDriveFolderMP3s && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenDriveFolder(draftDriveFolderMP3s)
                              }
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Open
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Logs Folder Container */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            Play Logs
                          </span>
                          {draftDriveFolderLogs ? (
                            <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                              Configured
                            </span>
                          ) : (
                            <span className="text-xs bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                              To be set
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-sans text-slate-800 select-all truncate leading-relaxed">
                          {driveFolderDescMap[draftDriveFolderLogs] ||
                            "No directory folder configured yet"}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDriveField("logs");
                              setTempPasteLink(draftDriveFolderLogs);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          {draftDriveFolderLogs && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenDriveFolder(draftDriveFolderLogs)
                              }
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Open
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Google Account Connection Status inside modal */}
                      <GoogleAuthSection
                        user={user}
                        token={token}
                        setToken={setToken}
                        setUser={setUser}
                        googleClientId={googleClientId}
                        setGoogleClientId={setGoogleClientId}
                        isPollingExternal={isPollingExternal}
                        setIsPollingExternal={setIsPollingExternal}
                        setIsValidatingDrive={setIsValidatingDrive}
                        setLoading={setLoading}
                        setDriveValidationError={setDriveValidationError}
                        driveValidationError={driveValidationError}
                        validateGoogleDriveAccess={validateGoogleDriveAccess}
                        fetchDataForMode={fetchDataForMode}
                        handleAuthSignOut={handleAuthSignOut}
                        setOverrideAccessToken={setOverrideAccessToken}
                      />
                    </div>
                  )}

                  {locationMode === "Demo" && (
                    <div className="space-y-3">
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg whitespace-pre-line text-xs leading-relaxed text-amber-800 font-medium">
                        Demo for crstl.fm testing/learning. The data is shared,
                        but not for production. Change, modify, etc everything.
                      </div>

                      {/* Demo Interstitials Container */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            Demo Interstitial
                          </span>
                          <span className="text-xs bg-slate-100 border border-slate-300 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                            Demo
                          </span>
                        </div>
                        <p className="text-xs font-sans text-slate-800 select-all truncate leading-relaxed">
                          {driveFolderDescMap[
                            "1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED"
                          ] || "calendar"}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenDriveFolder(
                                "1EkEdj1gvA0_MtMNfnj5KNCPdxcRFO_ED",
                              )
                            }
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Open
                          </button>
                        </div>
                      </div>

                      {/* Demo MP3s Folder Container */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            Demo media & scripts
                          </span>
                          <span className="text-xs bg-slate-100 border border-slate-300 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                            Demo
                          </span>
                        </div>
                        <p className="text-xs font-sans text-slate-800 select-all truncate leading-relaxed">
                          {driveFolderDescMap[
                            "11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch"
                          ] || "medialibrary"}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenDriveFolder(
                                "11Ii8Wf_mjeysdIsQxeBd4iA3aNHqt9Ch",
                              )
                            }
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Open
                          </button>
                        </div>
                      </div>

                      {/* Demo Logs Folder Container */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            Demo Play Logs
                          </span>
                          <span className="text-xs bg-slate-100 border border-slate-300 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                            Demo
                          </span>
                        </div>
                        <p className="text-xs font-sans text-slate-800 select-all truncate leading-relaxed">
                          {driveFolderDescMap[
                            "1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx"
                          ] || "logs"}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenDriveFolder(
                                "1pvc7gdLktrqbZ4A9X6OT_CkasSLbembx",
                              )
                            }
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Open
                          </button>
                        </div>
                      </div>

                      {/* Google Account Connection Status inside modal for Demo mode as well */}
                      <GoogleAuthSection
                        user={user}
                        token={token}
                        setToken={setToken}
                        setUser={setUser}
                        googleClientId={googleClientId}
                        setGoogleClientId={setGoogleClientId}
                        isPollingExternal={isPollingExternal}
                        setIsPollingExternal={setIsPollingExternal}
                        setIsValidatingDrive={setIsValidatingDrive}
                        setLoading={setLoading}
                        setDriveValidationError={setDriveValidationError}
                        driveValidationError={driveValidationError}
                        validateGoogleDriveAccess={validateGoogleDriveAccess}
                        fetchDataForMode={fetchDataForMode}
                        handleAuthSignOut={handleAuthSignOut}
                        setOverrideAccessToken={setOverrideAccessToken}
                      />
                    </div>
                  )}

                  {/* Feedback Status */}
                  {locationsError && (
                    <div className="bg-red-50 border border-red-200 rounded p-2.5 flex items-start gap-2 text-red-700">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
                      <span className="text-xs leading-normal font-bold">
                        {locationsError}
                      </span>
                    </div>
                  )}

                  {locationsSuccess && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 flex items-start gap-2 text-emerald-800">
                      <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
                      <span className="text-xs leading-normal font-bold">
                        {locationsSuccess}
                      </span>
                    </div>
                  )}
                </div>

                {/* Submit Actions */}
                <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end items-center font-sans">
                  <button
                    type="button"
                    onClick={() => setShowLocalHelp(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold uppercase rounded border border-slate-300 transition cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-purple-600" />
                    <span>Help</span>
                  </button>
                  {/* === DEBUG ANIMATION SWITCH START === */}
                  <button
                    type="button"
                    onClick={toggleAnimations}
                    title={animationsDisabled ? "Performance Overrides: ACTIVE. Click to configure or disable" : "Performance Overrides: INACTIVE. Click to configure & enable"}
                    className={cn(
                      "flex items-center justify-center p-1.5 rounded transition-all cursor-pointer mr-auto border border-transparent",
                      animationsDisabled
                        ? "bg-red-100 text-red-700 border-red-300 hover:bg-red-200"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                    )}
                  >
                    {animationsDisabled ? (
                      <ZapOff className="w-3.5 h-3.5 text-red-600" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                    )}
                  </button>
                  {/* === DEBUG ANIMATION SWITCH END === */}
                  <button
                    type="button"
                    onClick={() => setShowLocationsModal(false)}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold uppercase rounded border border-slate-300 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSyncing || isValidatingDrive}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded shadow transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSyncing || isValidatingDrive
                      ? "Verifying..."
                      : "Save and Close"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editingDriveField && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-xl max-w-sm w-full overflow-hidden text-slate-900 flex flex-col shadow-2xl p-5 space-y-4"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <h3 className="text-xs font-black uppercase text-blue-600 tracking-wider">
                  {editingDriveField === "preferences"
                    ? "Interstitials & Preferences folder"
                    : editingDriveField === "mp3s"
                      ? "MP3s Audio folder"
                      : "Logs folder"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDriveField(null);
                    setTempPasteLink("");
                  }}
                  className="text-slate-500 hover:text-slate-900 font-bold text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-600 block">
                  Paste Google Drive Share Link or ID
                </span>
                <textarea
                  rows={3}
                  value={tempPasteLink}
                  onChange={(e) => setTempPasteLink(e.target.value)}
                  placeholder="Paste folders/ browser URL (e.g. https://drive.google.com/drive/folders/...) or raw folder ID here..."
                  className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-400 resize-none"
                />
                <p className="text-xs leading-normal text-slate-500">
                  Simply paste the raw share URL or standard folder ID. It will
                  extract the ID key automatically.
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-1 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setEditingDriveField(null);
                    setTempPasteLink("");
                  }}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold uppercase rounded border border-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const rawId = extractFolderId(tempPasteLink);
                    if (editingDriveField === "preferences") {
                      setDraftDriveFolderPreferences(rawId);
                    } else if (editingDriveField === "mp3s") {
                      setDraftDriveFolderMP3s(rawId);
                    } else if (editingDriveField === "logs") {
                      setDraftDriveFolderLogs(rawId);
                    }
                    setEditingDriveField(null);
                    setTempPasteLink("");
                    // Fetch descriptor block immediately
                    if (rawId && user && token) {
                      try {
                        const descriptor = await fetchDriveFolderDescriptor(
                          rawId,
                          token,
                        );
                        setDriveFolderDescMap((prev) => ({
                          ...prev,
                          [rawId]: descriptor,
                        }));
                      } catch (err) {}
                    }
                  }}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded shadow cursor-pointer active:translate-y-px"
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <LocalHelpModal
        isOpen={showLocalHelp}
        onClose={() => setShowLocalHelp(false)}
      />
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm pt-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-emerald-500/40 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 flex flex-col p-5 space-y-3 font-sans shadow-emerald-950/10"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center pb-2 border-b border-slate-800/60 shrink-0">
                <div className="flex items-center gap-2 text-emerald-400">
                  <Download className="w-5 h-5" />
                  <h3 className="text-sm font-black uppercase tracking-widest text-white leading-none">
                    Playlist Export
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="text-slate-550 hover:text-slate-350 font-bold text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Modal Content depending on state */}
              {exportState === "configuring" && (() => {
                const h = windowSize.height;
                const w = windowSize.width;

                const isNarrow = w < 540;

                // Adjust vertical height calculations if horizontal narrow rearrangement occurs
                const eh = isNarrow ? (h - 130) : h;

                const reducePlaylistAndPlanText = eh < 640;
                const showPlanRow = eh >= 580;
                const showPlaylistRow = eh >= 530;
                const showMp3ExampleRow = eh >= 480;
                const reduceFolderText = eh < 430;
                const showFolderRow = eh >= 400;
                const showPathLabel = eh >= 360;
                const showNameLabel = eh >= 320;

                const truncateMiddle = (str: string, maxLength: number) => {
                  if (!str) return "";
                  if (str.length <= maxLength) return str;
                  const half = Math.floor((maxLength - 3) / 2);
                  return str.substring(0, half) + "..." + str.substring(str.length - half);
                };

                return (
                  <div className="space-y-4 flex flex-col pt-1">
                    {isNarrow ? (
                      <div className="space-y-3.5 text-left">
                        {/* i. move the Path label and browse button to be on a row above the Path data field */}
                        <div className="flex flex-col space-y-1.5">
                          <div className="flex justify-between items-center text-xs">
                            {showPathLabel ? (
                              <label className="font-black uppercase tracking-wider text-slate-400 select-none">
                                path
                              </label>
                            ) : <div />}
                            <button
                              type="button"
                              onClick={handleBrowseExportDestination}
                              className="px-3 py-1 bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded cursor-pointer flex items-center justify-center min-w-[36px] h-8 active:translate-y-px shadow-sm"
                              title="Browse"
                            >
                              {/* iv. Change the "Browse" description on the "Browse" button to a folder icon. */}
                              <Folder className="w-4 h-4 text-emerald-400" />
                            </button>
                          </div>
                          {/* ii. Allow the path data field to expand to 2 rows */}
                          <textarea
                            rows={2}
                            value={exportDestinationInput}
                            onChange={(e) => setExportDestinationInput(e.target.value)}
                            placeholder="Select export folder pathway..."
                            className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-202 focus:outline-none focus:border-emerald-600 font-mono resize-none leading-normal"
                          />
                        </div>

                        {/* iii. Move the Name data field to below the Name label */}
                        <div className="flex flex-col space-y-1.5">
                          {showNameLabel && (
                            <label className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                              name
                            </label>
                          )}
                          <input
                            type="text"
                            value={exportFolderPrefixInput}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExportFolderPrefixInput(val);
                              setExportTextPrefixInput(val);
                              setExportPlaylistPrefixInput(val);
                            }}
                            placeholder="Show"
                            className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-205 focus:outline-none focus:border-emerald-500 font-mono"
                          />
                        </div>

                        {/* Closed distance data displays next to labels */}
                        <div className="space-y-2 border-t border-slate-800/40 pt-3 flex flex-col items-start">
                          {showFolderRow && (
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                                Folder:
                              </span>
                              <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                                {reduceFolderText ? truncateMiddle(getDynamicNames().folderName, 22) : getDynamicNames().folderName}
                              </span>
                            </div>
                          )}

                          {showPlanRow && (
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                                Plan:
                              </span>
                              <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                                {reducePlaylistAndPlanText ? truncateMiddle(getDynamicNames().textFilename, 22) : getDynamicNames().textFilename}
                              </span>
                            </div>
                          )}

                          {showPlaylistRow && (
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                                Playlist:
                              </span>
                              <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                                {reducePlaylistAndPlanText ? truncateMiddle(getDynamicNames().playlistFilename, 22) : getDynamicNames().playlistFilename}
                              </span>
                            </div>
                          )}

                          {showMp3ExampleRow && (
                            <div className="flex items-baseline gap-2 flex-wrap border-t border-slate-800/20 pt-1.5 w-full">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                                mp3 Name example:
                              </span>
                              <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                                {getDynamicNames().firstTrackFilename}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3.5 text-left">
                        {/* Path Row */}
                        {showPathLabel ? (
                          <div className="grid grid-cols-[60px_1fr] items-center gap-3">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                              path
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={exportDestinationInput}
                                onChange={(e) => setExportDestinationInput(e.target.value)}
                                placeholder="Select export folder pathway..."
                                className="flex-1 bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-202 focus:outline-none focus:border-emerald-600 font-mono"
                              />
                              <button
                                type="button"
                                onClick={handleBrowseExportDestination}
                                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-black uppercase rounded cursor-pointer whitespace-nowrap active:translate-y-px animate-none duration-100 ease-in-out shadow-sm"
                              >
                                Browse
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={exportDestinationInput}
                              onChange={(e) => setExportDestinationInput(e.target.value)}
                              placeholder="Select export folder pathway..."
                              className="flex-1 bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-202 focus:outline-none focus:border-emerald-600 font-mono"
                            />
                            <button
                              type="button"
                              onClick={handleBrowseExportDestination}
                              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-black uppercase rounded cursor-pointer whitespace-nowrap active:translate-y-px animate-none duration-100 ease-in-out shadow-sm"
                            >
                              Browse
                            </button>
                          </div>
                        )}

                        {/* Name Row */}
                        {showNameLabel ? (
                          <div className="grid grid-cols-[60px_1fr] items-center gap-3">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                              name
                            </label>
                            <input
                              type="text"
                              value={exportFolderPrefixInput}
                              onChange={(e) => {
                                const val = e.target.value;
                                setExportFolderPrefixInput(val);
                                setExportTextPrefixInput(val);
                                setExportPlaylistPrefixInput(val);
                              }}
                              placeholder="Show"
                              className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-205 focus:outline-none focus:border-emerald-500 font-mono"
                            />
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={exportFolderPrefixInput}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExportFolderPrefixInput(val);
                              setExportTextPrefixInput(val);
                              setExportPlaylistPrefixInput(val);
                            }}
                            placeholder="Show"
                            className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-205 focus:outline-none focus:border-emerald-500 font-mono"
                          />
                        )}

                        {/* Closed distance data displays next to labels */}
                        <div className="space-y-2 border-t border-slate-800/40 pt-3.5 flex flex-col items-start w-full">
                          {showFolderRow && (
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                                Folder:
                              </span>
                              <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                                {reduceFolderText ? truncateMiddle(getDynamicNames().folderName, 22) : getDynamicNames().folderName}
                              </span>
                            </div>
                          )}

                          {showPlanRow && (
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                                Plan:
                              </span>
                              <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                                {reducePlaylistAndPlanText ? truncateMiddle(getDynamicNames().textFilename, 22) : getDynamicNames().textFilename}
                              </span>
                            </div>
                          )}

                          {showPlaylistRow && (
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                                Playlist:
                              </span>
                              <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                                {reducePlaylistAndPlanText ? truncateMiddle(getDynamicNames().playlistFilename, 22) : getDynamicNames().playlistFilename}
                              </span>
                            </div>
                          )}

                          {showMp3ExampleRow && (
                            <div className="flex items-baseline gap-2 flex-wrap border-t border-slate-800/20 pt-1.5 w-full">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                                mp3 Name example:
                              </span>
                              <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                                {getDynamicNames().firstTrackFilename}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Footer Buttons with beautiful 3D styling */}
                    {(() => {
                      const useCompactButtons = w < 440;
                      const useStackedButtons = w < 360;

                      if (useStackedButtons) {
                        return (
                          <div className="flex flex-col gap-0 pt-3 border-t border-slate-800/40 w-full">
                            <button
                              type="button"
                              onClick={runExportPrerecord}
                              className="flex items-center justify-center gap-1.5 p-[2px] bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded border-b-[3px] border-emerald-800 hover:brightness-110 active:border-b-0 active:translate-y-[3px] transition-all cursor-pointer shadow w-full"
                            >
                              <Download className="w-4 h-4 shrink-0" />
                              <span>Export</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowExportModal(false)}
                              className="w-full p-[2px] bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider rounded border-b-[3px] border-slate-950 hover:brightness-110 active:border-b-0 active:translate-y-[3px] transition-all cursor-pointer text-center"
                            >
                              Cancel
                            </button>
                          </div>
                        );
                      }

                      if (useCompactButtons) {
                        return (
                          <div className="flex gap-[2px] justify-between pt-3 border-t border-slate-800/40 w-full">
                            <button
                              type="button"
                              onClick={() => setShowExportModal(false)}
                              className="flex-1 px-[2px] py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider rounded border-b-[3px] border-slate-950 hover:brightness-110 active:border-b-0 active:translate-y-[3px] transition-all cursor-pointer text-center"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={runExportPrerecord}
                              className="flex-1 flex items-center justify-center gap-1 px-[2px] py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded border-b-[3px] border-emerald-800 hover:brightness-110 active:border-b-0 active:translate-y-[3px] transition-all cursor-pointer shadow"
                            >
                              <Download className="w-3.5 h-3.5 shrink-0" />
                              <span>Export</span>
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div className="flex gap-2 justify-end pt-3 border-t border-slate-800/40">
                          <button
                            type="button"
                            onClick={() => setShowExportModal(false)}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider rounded border-b-[3px] border-slate-950 hover:brightness-110 active:border-b-0 active:translate-y-[3px] transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={runExportPrerecord}
                            className="flex items-center gap-1.5 px-4.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded border-b-[3px] border-emerald-800 hover:brightness-110 active:border-b-0 active:translate-y-[3px] transition-all cursor-pointer shadow"
                          >
                            <Download className="w-4 h-4 shrink-0" />
                            <span>Export</span>
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {exportState === "exporting" && (
                <div className="py-8 flex flex-col items-center justify-center space-y-4">
                  <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                  <p className="text-sm font-bold text-slate-300">
                    Assembling playlist and copying MP3s...
                  </p>
                  <p className="text-xs text-slate-500">
                    Please do not close this window
                  </p>
                </div>
              )}

              {exportState === "error" && (
                <div className="space-y-4 pt-1">
                  <div className="bg-red-500/10 border border-red-500/20 rounded p-3.5 flex items-start gap-2.5 text-red-500">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold">Export Failed</p>
                      <p className="text-xs leading-relaxed mt-1 text-red-400">
                        {exportError}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setShowExportModal(false)}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 text-xs font-bold uppercase rounded border border-slate-700 transition cursor-pointer active:translate-y-px"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={runExportPrerecord}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded shadow cursor-pointer shadow-emerald-950/20 active:translate-y-px"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {exportState === "success" && exportResult && (
                <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-3.5 flex items-start gap-2.5 text-emerald-500">
                    <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-emerald-400">
                        Export Completed Successfully
                      </p>
                      <p className="text-xs leading-relaxed mt-1 text-emerald-300">
                        Broadcasting package compiled into local folder:
                      </p>
                      <p className="text-xs font-mono select-all bg-slate-950 p-2 rounded text-emerald-200 break-all mt-1.5 border border-emerald-900/30">
                        {exportResult.exportFolder}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 bg-slate-950/40 rounded border border-slate-800 text-center">
                      <span className="block text-base font-black font-mono text-emerald-400">
                        {exportResult.totalCount}
                      </span>
                      <span className="text-xs font-black uppercase text-slate-500 tracking-wider">
                        Scheduled
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-950/40 rounded border border-slate-800 text-center">
                      <span className="block text-base font-black font-mono text-emerald-400">
                        {exportResult.copiedCount}
                      </span>
                      <span className="text-xs font-black uppercase text-slate-500 tracking-wider">
                        Copied
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-950/40 rounded border border-slate-800 text-center">
                      <span className="block text-base font-black font-mono text-amber-500">
                        {exportResult.missingCount}
                      </span>
                      <span className="text-xs font-black uppercase text-slate-500 tracking-wider">
                        Missing
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 bg-slate-950/30 p-2.5 rounded border border-slate-850 text-slate-300 font-sans">
                    <p className="text-xs font-bold text-slate-200">
                      Created Package Files:
                    </p>
                    <ul className="text-xs font-mono space-y-1.5 pl-3 list-disc text-slate-400">
                      <li>
                        {exportResult.txtFilename ||
                          `${exportResult.baseFilename}.txt`}{" "}
                        <span className="text-xs text-slate-550 font-sans font-medium">
                          (Summary Interstitial)
                        </span>
                      </li>
                      <li>
                        {exportResult.m3uFilename ||
                          `${exportResult.baseFilename}.m3u`}{" "}
                        <span className="text-xs text-slate-550 font-sans font-medium">
                          (M3U Playlist File)
                        </span>
                      </li>
                      <li>
                        MP3 Files{" "}
                        <span className="text-xs text-slate-550 font-sans font-medium">
                          (Break 1, Break 2...)
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div className="flex gap-2 justify-end pt-2 border-t border-slate-800/40">
                    <button
                      type="button"
                      onClick={() => setShowExportModal(false)}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 text-xs font-bold uppercase rounded border border-slate-700 transition cursor-pointer active:translate-y-px"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenExportFolder(exportResult.exportFolder)
                      }
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded shadow-md transition cursor-pointer active:translate-y-px"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Open Folder</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Performance & CPU Overrides Configuration Modal */}
      <AnimatePresence>
        {isOptimizationConfigOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden text-slate-100 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                <div className="flex items-center gap-2 text-yellow-400">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-white">
                    Performance Overrides
                  </h3>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                <p className="text-sm text-slate-300 leading-relaxed font-sans">
                  Choose which performance optimizations and CPU overrides to apply. 
                  These features are surgically designed for radio broadcast hardware to maintain low overhead.
                </p>

                <div className="space-y-2.5">
                  <p className="text-xs font-black uppercase text-slate-400 tracking-widest leading-none">
                    Select Optimizations to Turn Off/Disable:
                  </p>

                  <div className="space-y-2">
                    {/* CSS Animations */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.cssAnimations}
                        onChange={(e) => setTempOptimizations(prev => ({ ...prev, cssAnimations: e.target.checked }))}
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">Strict CSS Keyframes & Animations</p>
                        <p className="text-xs text-slate-400">Stops continuous animate-pulse, animate-spin, and dynamic background animations.</p>
                      </div>
                    </label>

                    {/* CSS Hover Transitions */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.hoverTransitions}
                        onChange={(e) => setTempOptimizations(prev => ({ ...prev, hoverTransitions: e.target.checked }))}
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">Purge Hover Transitions</p>
                        <p className="text-xs text-slate-400">Instantly applies colors and layouts upon hover instead of using heavy transition effects.</p>
                      </div>
                    </label>

                    {/* Hover Transforms */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.hoverTransforms}
                        onChange={(e) => setTempOptimizations(prev => ({ ...prev, hoverTransforms: e.target.checked }))}
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">Throttle Hover Transforms</p>
                        <p className="text-xs text-slate-400">Suppresses scaling and moving on cursor roll-over to stop continuous layout recalculations.</p>
                      </div>
                    </label>

                    {/* Hover Shadows & Filters */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.hoverShadowsFilters}
                        onChange={(e) => setTempOptimizations(prev => ({ ...prev, hoverShadowsFilters: e.target.checked }))}
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">Remove Hover Shadows & Filters</p>
                        <p className="text-xs text-slate-400">Avoids expensive shadow casting and brightness/hue-rotation on list cards.</p>
                      </div>
                    </label>

                    {/* Backdrop Blurs */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.backdropBlurs}
                        onChange={(e) => setTempOptimizations(prev => ({ ...prev, backdropBlurs: e.target.checked }))}
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">Disable Backdrop Blurs</p>
                        <p className="text-xs text-slate-400">Forces flat, opaque backgrounds on modals to avoid costly GPU pixel shader blurring.</p>
                      </div>
                    </label>

                    {/* Web Workers */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.webWorkers}
                        onChange={(e) => setTempOptimizations(prev => ({ ...prev, webWorkers: e.target.checked }))}
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">Isolate Processing into Web Workers</p>
                        <p className="text-xs text-slate-400">Offloads periodic clock ticks, date calculations, and scheduling timeouts to background threads.</p>
                      </div>
                    </label>

                    {/* Option A: Pointer Events Neutralization */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.pointerEventsNeutralization}
                        onChange={(e) => setTempOptimizations(prev => ({ ...prev, pointerEventsNeutralization: e.target.checked }))}
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">Option A: Pointer Events Neutralization</p>
                        <p className="text-xs text-slate-400">Neutralizes pointer-events on background areas to prevent heavy browser mouse movement hit-testing traversal.</p>
                      </div>
                    </label>

                    {/* Option B: GPU Compositing Layering */}
                    <label className="flex items-start gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-lg hover:bg-slate-950/80 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tempOptimizations.gpuCompositingLayering}
                        onChange={(e) => setTempOptimizations(prev => ({ ...prev, gpuCompositingLayering: e.target.checked }))}
                        className="mt-1 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-200">Option B: GPU Compositing Layering</p>
                        <p className="text-xs text-slate-400">Forces separate GPU compositor layers for lists and buttons to completely isolate repaint boundaries.</p>
                      </div>
                    </label>

                    {/* Note about unutilized options */}
                    <div className="p-3 bg-slate-950/20 border border-dashed border-slate-800 rounded-lg text-slate-300 space-y-1.5">
                      <p className="text-xs font-bold text-slate-200">⚠️ Note on CPU Optimizations (Options 1-3)</p>
                      <p className="text-xs leading-relaxed text-slate-400">
                        Intel Mac desktop optimizations (Option 1: Modern Electron runtime, Option 2: Disable Hardware Acceleration, and Option 3: Disable Window Shadows) exist as configurable definitions inside the Electron main process layer (<code className="text-blue-400 font-mono text-xs">electron-main.cjs</code>). They are currently not active. To experiment with or enable them, you must configure their active flags directly in the source file.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>Current State:</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded font-bold uppercase",
                    animationsDisabled 
                      ? "bg-red-950/30 text-red-400 border border-red-500/20" 
                      : "bg-emerald-950/30 text-emerald-400 border border-emerald-500/20"
                  )}>
                    {animationsDisabled ? "Optimizations Active (Flat State)" : "Optimizations Inactive (Normal)"}
                  </span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsOptimizationConfigOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded border border-slate-700 transition cursor-pointer active:translate-y-px"
                >
                  Cancel
                </button>
                {animationsDisabled && (
                  <button
                    type="button"
                    onClick={() => {
                      setAnimationsDisabled(false);
                      localStorage.setItem("debug_animations_disabled", "false");
                      setIsOptimizationConfigOpen(false);
                    }}
                    className="px-3.5 py-1.5 bg-red-950/40 text-red-400 hover:bg-red-900/30 text-xs font-bold uppercase rounded border border-red-500/20 transition cursor-pointer active:translate-y-px"
                  >
                    Restore Normal Playback
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setActiveOptimizations(tempOptimizations);
                    localStorage.setItem("debug_active_optimizations", JSON.stringify(tempOptimizations));
                    setAnimationsDisabled(true);
                    localStorage.setItem("debug_animations_disabled", "true");
                    setIsOptimizationConfigOpen(false);
                  }}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded shadow-md transition cursor-pointer active:translate-y-px"
                >
                  Apply Selected Overrides
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Caching Progress Modal */}
      <AnimatePresence>
        {showCachingModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 flex flex-col"
            >
              {/* Modal Header */}
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                <div className="flex items-center gap-2 text-purple-400">
                  <HardDriveDownload className={`w-5 h-5 ${!cachingProgress.isComplete ? 'animate-bounce text-purple-400' : 'text-purple-400'}`} />
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Caching {cachingTargetMode} Audio Assets
                  </h3>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-300">
                      {cachingProgress.isComplete 
                        ? (cachingProgress.failed > 0 ? 'Caching Completed with Errors' : 'Caching Complete!') 
                        : `Caching audio files (${cachingProgress.completed + cachingProgress.failed} / ${cachingProgress.total})`}
                    </span>
                    <span className="text-purple-400 font-mono">
                      {cachingProgress.total > 0 
                        ? `${Math.round(((cachingProgress.completed + cachingProgress.failed) / cachingProgress.total) * 100)}%`
                        : '0%'}
                    </span>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div 
                      className={`h-full transition-all duration-200 ${cachingProgress.failed > 0 ? 'bg-amber-500' : 'bg-purple-500'}`}
                      style={{ 
                        width: cachingProgress.total > 0 
                          ? `${Math.round(((cachingProgress.completed + cachingProgress.failed) / cachingProgress.total) * 100)}%` 
                          : '0%' 
                      }}
                    />
                  </div>
                </div>

                {/* 2.b. Errors List if any */}
                {cachingProgress.errors.length > 0 && (
                  <div className="space-y-2 bg-red-950/40 border border-red-800/60 rounded-lg p-3 max-h-36 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{cachingProgress.errors.length} Caching Error{cachingProgress.errors.length > 1 ? 's' : ''} Detected</span>
                    </div>
                    <ul className="space-y-1 text-xs text-red-300/90 font-mono">
                      {cachingProgress.errors.map((err, idx) => (
                        <li key={idx} className="flex flex-col border-b border-red-900/30 pb-1 last:border-b-0">
                          <span className="font-semibold text-slate-200">{err.fileName}</span>
                          <span className="text-[10px] text-red-400">{err.error}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Modal Footer Controls */}
              <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-end gap-2">
                {!cachingProgress.isComplete ? (
                  /* 2.a. Allow user to click "View while Caching" to close the in progress view */
                  <button
                    type="button"
                    onClick={() => setShowCachingModal(false)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase rounded border border-slate-700 transition cursor-pointer"
                  >
                    View while Caching
                  </button>
                ) : cachingProgress.failed > 0 ? (
                  /* 2.d. If errors still exist: "View as-is" or "Try Again" */
                  <>
                    <button
                      type="button"
                      onClick={() => setShowCachingModal(false)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase rounded border border-slate-700 transition cursor-pointer"
                    >
                      View as-is
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (cachingTargetMode) {
                          triggerCachingForMode(cachingTargetMode);
                        }
                      }}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase rounded shadow transition cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Try Again</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCachingModal(false)}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase rounded shadow transition cursor-pointer"
                  >
                    Close
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Audio Playing Navigation Confirmation Modal */}
      <AnimatePresence>
        {showAudioPlayingNavModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-4"
            >
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-400">
                <Square className="w-4 h-4 fill-current" />
                <span className="text-xs font-black uppercase tracking-wider text-purple-300">Stop?</span>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  Audio is currently playing. Do you want to stop playback before switching views, or leave it playing?
                </p>
              </div>

              <div className="flex flex-col gap-2 w-full pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof (window as any).interstitialerStopAllAudio === "function") {
                      (window as any).interstitialerStopAllAudio();
                    }
                    setShowAudioPlayingNavModal(false);
                    if (pendingNavActionRef.current) {
                      pendingNavActionRef.current();
                      pendingNavActionRef.current = null;
                    }
                  }}
                  className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-wider rounded-xl border border-purple-500 shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop and Switch</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAudioPlayingNavModal(false);
                    pendingNavActionRef.current = null;
                  }}
                  className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-700 transition cursor-pointer"
                >
                  Stay and Play
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sleep Mode Overlay Modal */}
      <AnimatePresence>
        {isAsleep && (
          <div 
            onClick={handleWakeUp}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4 cursor-pointer"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                <Moon className="w-6 h-6 animate-pulse" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed font-sans font-medium">
                Shhh... Interstitial-er is sleeping.
              </p>
              <button
                type="button"
                onClick={handleWakeUp}
                className="w-full mt-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm uppercase tracking-wider rounded-xl border border-blue-500 shadow-md transition cursor-pointer flex items-center justify-center gap-2 "
              >
                <AlarmClock className="w-4 h-4 shrink-0" />
                <span>Wakey Wakey!</span>
                <AlarmClock className="w-4 h-4 shrink-0" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
