import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Folder,
  Check,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Zap,
  ZapOff,
  Ruler,
} from "lucide-react";
import GoogleAuthSection from "./GoogleAuthSection";
import { cn, extractFolderId } from "../lib/utils";
import { checkMissingDriveItems } from "../lib/driveService";

export interface LocationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  locationMode: "Local" | "Drive" | "Demo";
  setLocationMode: (mode: "Local" | "Drive" | "Demo") => void;
  isAiStudio: boolean;
  windowSize?: { width: number; height: number };
  // Local draft paths
  draftLocalPathAmp?: string;
  setDraftLocalPathAmp?: (path: string) => void;
  draftLocalPathCalendar: string;
  setDraftLocalPathCalendar: (path: string) => void;
  draftLocalPathMP3s: string;
  setDraftLocalPathMP3s: (path: string) => void;
  draftLocalPathMediaAnnouncements?: string;
  setDraftLocalPathMediaAnnouncements?: (path: string) => void;
  draftLocalPathMediaEvergreens?: string;
  setDraftLocalPathMediaEvergreens?: (path: string) => void;
  draftLocalPathMediaShows?: string;
  setDraftLocalPathMediaShows?: (path: string) => void;
  draftLocalPathLogs: string;
  setDraftLocalPathLogs: (path: string) => void;
  onBrowseNative: (type: "amp" | "calendar" | "mp3s" | "announcements" | "evergreens" | "shows" | "logs") => Promise<string | null | void> | void;
  onOpenLocalPath: (path: string) => void;
  announcementsReadOnlyError: string | null;
  localPathsUnavailable: boolean;
  // Drive draft IDs
  draftDriveFolderAmp?: string;
  setDraftDriveFolderAmp?: (id: string) => void;
  draftDriveFolderPreferences: string;
  setDraftDriveFolderPreferences: (id: string) => void;
  draftDriveFolderMP3s: string;
  setDraftDriveFolderMP3s: (id: string) => void;
  draftDriveFolderAnnouncements?: string;
  setDraftDriveFolderAnnouncements?: (id: string) => void;
  draftDriveFolderEvergreens?: string;
  setDraftDriveFolderEvergreens?: (id: string) => void;
  draftDriveFolderShows?: string;
  setDraftDriveFolderShows?: (id: string) => void;
  draftDriveFolderLogs: string;
  setDraftDriveFolderLogs: (id: string) => void;
  driveFolderDescMap: Record<string, string>;
  setDriveFolderDescMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onOpenDriveFolder: (folderId: string) => void;
  fetchDriveFolderDescriptor: (folderId: string, token: string) => Promise<string>;
  editingDriveField: "amp" | "preferences" | "mp3s" | "announcements" | "evergreens" | "shows" | "logs" | null;
  setEditingDriveField: (field: "amp" | "preferences" | "mp3s" | "announcements" | "evergreens" | "shows" | "logs" | null) => void;
  tempPasteLink: string;
  setTempPasteLink: (link: string) => void;
  // Google Auth props
  user: any;
  token: string | null;
  setToken: (token: string | null) => void;
  setUser: (user: any) => void;
  googleClientId: string;
  setGoogleClientId: (id: string) => void;
  isPollingExternal: boolean;
  setIsPollingExternal: (val: boolean) => void;
  setIsValidatingDrive: (val: boolean) => void;
  setLoading: (val: boolean) => void;
  setDriveValidationError: (err: string | null) => void;
  driveValidationError: string | null;
  validateGoogleDriveAccess: (token: string) => Promise<boolean>;
  fetchDataForMode: (mode: "Local" | "Drive" | "Demo", tokenOverride?: string) => Promise<void>;
  handleAuthSignOut: () => Promise<void>;
  setOverrideAccessToken: (token: string | null) => void;
  // Feedback status
  locationsError: string | null;
  locationsSuccess: string | null;
  isSyncing: boolean;
  isValidatingDrive: boolean;
  onShowLocalHelp: (show: boolean) => void;
  animationsDisabled: boolean;
  toggleAnimations: () => void;
  showPixelRuler: boolean;
  togglePixelRuler: () => void;
  onSaveLocations: (e?: React.FormEvent, options?: { createMissing?: boolean }) => void | Promise<void>;
}

function formatMissingList(items: string[]): string {
  if (!items || items.length === 0) return "required files or folders";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export const LocationsModal: React.FC<LocationsModalProps> = ({
  isOpen,
  onClose,
  locationMode,
  setLocationMode,
  isAiStudio,
  draftLocalPathAmp,
  setDraftLocalPathAmp,
  draftLocalPathCalendar,
  setDraftLocalPathCalendar,
  draftLocalPathMP3s,
  setDraftLocalPathMP3s,
  draftLocalPathMediaAnnouncements,
  setDraftLocalPathMediaAnnouncements,
  draftLocalPathMediaEvergreens,
  setDraftLocalPathMediaEvergreens,
  draftLocalPathMediaShows,
  setDraftLocalPathMediaShows,
  draftLocalPathLogs,
  setDraftLocalPathLogs,
  onBrowseNative,
  onOpenLocalPath,
  announcementsReadOnlyError,
  localPathsUnavailable,
  draftDriveFolderAmp,
  setDraftDriveFolderAmp,
  draftDriveFolderPreferences,
  setDraftDriveFolderPreferences,
  draftDriveFolderMP3s,
  setDraftDriveFolderMP3s,
  draftDriveFolderAnnouncements,
  setDraftDriveFolderAnnouncements,
  draftDriveFolderEvergreens,
  setDraftDriveFolderEvergreens,
  draftDriveFolderShows,
  setDraftDriveFolderShows,
  draftDriveFolderLogs,
  setDraftDriveFolderLogs,
  driveFolderDescMap,
  setDriveFolderDescMap,
  onOpenDriveFolder,
  fetchDriveFolderDescriptor,
  editingDriveField,
  setEditingDriveField,
  tempPasteLink,
  setTempPasteLink,
  user,
  token,
  setToken,
  setUser,
  googleClientId,
  setGoogleClientId,
  isPollingExternal,
  setIsPollingExternal,
  setIsValidatingDrive,
  setLoading,
  setDriveValidationError,
  driveValidationError,
  validateGoogleDriveAccess,
  fetchDataForMode,
  handleAuthSignOut,
  setOverrideAccessToken,
  locationsError,
  locationsSuccess,
  isSyncing,
  isValidatingDrive,
  onShowLocalHelp,
  animationsDisabled,
  toggleAnimations,
  showPixelRuler,
  togglePixelRuler,
  onSaveLocations,
  windowSize,
}) => {
  const isNarrow = (windowSize?.width ?? (typeof window !== "undefined" ? window.innerWidth : 1024)) < 540;
  const isMacOS = typeof navigator !== "undefined" && /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent || navigator.platform || "");
  const trimmedAmpPath = (draftLocalPathAmp || "").trim().replace(/[/\\]+$/, "");
  const ampFolderName = trimmedAmpPath ? trimmedAmpPath.split(/[/\\]/).pop() || "foldername" : "foldername";
  const showMacNoIndexTip = isMacOS && trimmedAmpPath.length > 0 && !trimmedAmpPath.toLowerCase().endsWith(".noindex");

  const [showClearOverridesModal, setShowClearOverridesModal] = useState(false);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [missingCheckData, setMissingCheckData] = useState<{ missingItems: string[]; targetFolderDesc: string } | null>(null);
  const [isCheckingMissing, setIsCheckingMissing] = useState(false);

  const handleBrowseAmp = async () => {
    const selected = await onBrowseNative("amp");
    const hasOverrides = !!(
      draftLocalPathCalendar ||
      draftLocalPathMediaAnnouncements ||
      draftLocalPathMP3s ||
      draftLocalPathMediaEvergreens ||
      draftLocalPathMediaShows ||
      draftLocalPathLogs
    );
    if (selected && hasOverrides) {
      setShowClearOverridesModal(true);
    }
  };

  const handleClearAdvanced = () => {
    if (locationMode === "Local") {
      setDraftLocalPathCalendar("");
      if (setDraftLocalPathMediaAnnouncements) setDraftLocalPathMediaAnnouncements("");
      setDraftLocalPathMP3s("");
      if (setDraftLocalPathMediaEvergreens) setDraftLocalPathMediaEvergreens("");
      if (setDraftLocalPathMediaShows) setDraftLocalPathMediaShows("");
      setDraftLocalPathLogs("");
    } else if (locationMode === "Drive") {
      setDraftDriveFolderPreferences("");
      if (setDraftDriveFolderAnnouncements) setDraftDriveFolderAnnouncements("");
      setDraftDriveFolderMP3s("");
      if (setDraftDriveFolderEvergreens) setDraftDriveFolderEvergreens("");
      if (setDraftDriveFolderShows) setDraftDriveFolderShows("");
      setDraftDriveFolderLogs("");
    }
    setShowClearOverridesModal(false);
  };

  const handleKeepAdvanced = () => {
    setShowClearOverridesModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locationMode === "Local") {
      setIsCheckingMissing(true);
      try {
        const res = await fetch("/api/check-missing-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            localPathAmp: draftLocalPathAmp,
            localPathCalendar: draftLocalPathCalendar,
            localPathMP3s: draftLocalPathMediaAnnouncements || draftLocalPathMP3s,
            localPathMediaAnnouncements: draftLocalPathMediaAnnouncements,
            localPathMediaEvergreens: draftLocalPathMediaEvergreens,
            localPathMediaShows: draftLocalPathMediaShows,
            localPathLogs: draftLocalPathLogs,
          }),
        });
        const data = await res.json();
        setIsCheckingMissing(false);
        if (data.hasMissing) {
          setMissingCheckData({
            missingItems: data.missingItems || [],
            targetFolderDesc: data.targetFolderDesc || (draftLocalPathAmp || "target folder"),
          });
          setShowMissingModal(true);
          return;
        }
      } catch (err) {
        setIsCheckingMissing(false);
      }
    } else if (locationMode === "Drive") {
      setIsCheckingMissing(true);
      try {
        const driveMissing = await checkMissingDriveItems({
          driveFolderAmp: draftDriveFolderAmp,
          driveFolderPreferences: draftDriveFolderPreferences,
          driveFolderAnnouncements: draftDriveFolderAnnouncements || draftDriveFolderMP3s,
          driveFolderMP3s: draftDriveFolderAnnouncements || draftDriveFolderMP3s,
          driveFolderEvergreens: draftDriveFolderEvergreens,
          driveFolderShows: draftDriveFolderShows,
          driveFolderLogs: draftDriveFolderLogs,
        });
        setIsCheckingMissing(false);
        if (driveMissing.hasMissing) {
          setMissingCheckData({
            missingItems: driveMissing.missingItems,
            targetFolderDesc: driveMissing.targetFolderDesc,
          });
          setShowMissingModal(true);
          return;
        }
      } catch (err) {
        setIsCheckingMissing(false);
      }
    }

    onSaveLocations(e, { createMissing: false });
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
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
                onSubmit={handleSubmit}
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
                      {/* Demo mode is hidden across all desktop apps and AIStudio per user requirements */}
                      {false && (
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
                      )}
                      {isAiStudio && (
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
                      )}
                      {!isAiStudio && (
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
                      )}
                    </div>
                  </div>

                  {/* Directories List Depending on Mode */}
                  {locationMode === "Local" && (
                    <div className="space-y-3">
                      <div>
                        <div className={cn("mb-1", isNarrow ? "flex flex-col items-start gap-1" : "flex justify-between items-center")}>
                          <label className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            AMP FOLDER
                          </label>
                          {!draftLocalPathAmp ? (
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
                          placeholder="e.g. /Users/name/AMP or C:\AMP"
                          value={draftLocalPathAmp || ""}
                          onChange={(e) => {
                            if (setDraftLocalPathAmp) {
                              setDraftLocalPathAmp(e.target.value);
                            }
                          }}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={handleBrowseAmp}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                          >
                            Browse
                          </button>
                          {draftLocalPathAmp && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenLocalPath(draftLocalPathAmp)
                              }
                              className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1 cursor-pointer active:translate-y-px"
                            >
                              Open
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Root directory that stores logs, settings, and media.
                        </p>
                        {showMacNoIndexTip && (
                          <div className="mt-2 p-2 bg-blue-50/80 border border-blue-200 rounded text-xs text-blue-900 leading-snug flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                            <span>
                              <strong>Tip (macOS):</strong> To keep settings and logs out of Finder Recents, add .noindex to the folder name (e.g., <span className="font-mono font-semibold">{ampFolderName}.noindex</span>).
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Optional Advanced Overrides Details */}
                      <details
                        open={Boolean(
                          draftLocalPathCalendar ||
                          draftLocalPathMediaAnnouncements ||
                          draftLocalPathMP3s ||
                          draftLocalPathMediaEvergreens ||
                          draftLocalPathMediaShows ||
                          draftLocalPathLogs
                        )}
                        className="text-xs border border-slate-200 rounded p-2 bg-slate-50/50"
                      >
                        <summary className="cursor-pointer font-bold text-slate-700 select-none">
                          Advanced - Folder Overrides
                        </summary>
                        <div className="mt-2.5 space-y-3 pt-2 border-t border-slate-200">
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[11px] font-bold uppercase text-slate-600">
                                Settings Folder
                              </label>
                            </div>
                            <input
                              type="text"
                              placeholder="Default: [AMP]/settings"
                              value={draftLocalPathCalendar}
                              onChange={(e) => setDraftLocalPathCalendar(e.target.value)}
                              className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <div className="flex gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => onBrowseNative("calendar")}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-[11px] font-bold uppercase"
                              >
                                Browse
                              </button>
                              {draftLocalPathCalendar && (
                                <button
                                  type="button"
                                  onClick={() => onOpenLocalPath(draftLocalPathCalendar)}
                                  className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-[11px] font-bold uppercase"
                                >
                                  Open
                                </button>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[11px] font-bold uppercase text-slate-600">
                                Media_Announcements Folder
                              </label>
                            </div>
                            <input
                              type="text"
                              placeholder="Default: [AMP]/media_announcements"
                              value={draftLocalPathMediaAnnouncements || draftLocalPathMP3s}
                              onChange={(e) => {
                                if (setDraftLocalPathMediaAnnouncements) {
                                  setDraftLocalPathMediaAnnouncements(e.target.value);
                                }
                                setDraftLocalPathMP3s(e.target.value);
                              }}
                              className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <div className="flex gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => onBrowseNative("announcements")}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-[11px] font-bold uppercase"
                              >
                                Browse
                              </button>
                              {(draftLocalPathMediaAnnouncements || draftLocalPathMP3s) && (
                                <button
                                  type="button"
                                  onClick={() => onOpenLocalPath(draftLocalPathMediaAnnouncements || draftLocalPathMP3s)}
                                  className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-[11px] font-bold uppercase"
                                >
                                  Open
                                </button>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[11px] font-bold uppercase text-slate-600">
                                Media_Evergreens Folder
                              </label>
                            </div>
                            <input
                              type="text"
                              placeholder="Default: [AMP]/media_evergreens"
                              value={draftLocalPathMediaEvergreens || ""}
                              onChange={(e) => {
                                if (setDraftLocalPathMediaEvergreens) {
                                  setDraftLocalPathMediaEvergreens(e.target.value);
                                }
                              }}
                              className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <div className="flex gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => onBrowseNative("evergreens")}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-[11px] font-bold uppercase"
                              >
                                Browse
                              </button>
                              {draftLocalPathMediaEvergreens && (
                                <button
                                  type="button"
                                  onClick={() => onOpenLocalPath(draftLocalPathMediaEvergreens)}
                                  className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-[11px] font-bold uppercase"
                                >
                                  Open
                                </button>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[11px] font-bold uppercase text-slate-600">
                                Media_Shows Folder
                              </label>
                            </div>
                            <input
                              type="text"
                              placeholder="Default: [AMP]/media_shows"
                              value={draftLocalPathMediaShows || ""}
                              onChange={(e) => {
                                if (setDraftLocalPathMediaShows) {
                                  setDraftLocalPathMediaShows(e.target.value);
                                }
                              }}
                              className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <div className="flex gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => onBrowseNative("shows")}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-[11px] font-bold uppercase"
                              >
                                Browse
                              </button>
                              {draftLocalPathMediaShows && (
                                <button
                                  type="button"
                                  onClick={() => onOpenLocalPath(draftLocalPathMediaShows)}
                                  className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-[11px] font-bold uppercase"
                                >
                                  Open
                                </button>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[11px] font-bold uppercase text-slate-600">
                                Logs Folder
                              </label>
                            </div>
                            <input
                              type="text"
                              placeholder="Default: [AMP]/logs"
                              value={draftLocalPathLogs}
                              onChange={(e) => setDraftLocalPathLogs(e.target.value)}
                              className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-900 outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <div className="flex gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => onBrowseNative("logs")}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-[11px] font-bold uppercase"
                              >
                                Browse
                              </button>
                              {draftLocalPathLogs && (
                                <button
                                  type="button"
                                  onClick={() => onOpenLocalPath(draftLocalPathLogs)}
                                  className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded text-[11px] font-bold uppercase"
                                >
                                  Open
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </details>

                      {announcementsReadOnlyError && (
                        <div className="p-3 bg-amber-950/20 border border-amber-500/50 text-amber-900 rounded text-xs leading-relaxed font-bold">
                          ⚠️ {announcementsReadOnlyError}
                        </div>
                      )}

                      {localPathsUnavailable && (
                        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded text-xs leading-relaxed font-medium">
                          ⚠️ The specified AMP location or directories are missing
                          or inaccessible. Please verify the path is correct and
                          physically exists on the host system.
                        </div>
                      )}
                    </div>
                  )}

                  {locationMode === "Drive" && (
                    <div className="space-y-3">
                      {/* AMP Station Location Container (Unified Root) */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                        <div className={cn("mb-1", isNarrow ? "flex flex-col items-start gap-1" : "flex justify-between items-center")}>
                          <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            AMP FOLDER
                          </span>
                          {draftDriveFolderAmp ? (
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
                          {(draftDriveFolderAmp && driveFolderDescMap[draftDriveFolderAmp]) ||
                            draftDriveFolderAmp ||
                            "No directory folder configured yet"}
                        </p>
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDriveField("amp");
                              setTempPasteLink(draftDriveFolderAmp || "");
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Browse
                          </button>
                          {draftDriveFolderAmp && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenDriveFolder(draftDriveFolderAmp)
                              }
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Open
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Root directory that stores logs, settings, and media.
                        </p>
                      </div>

                      {/* Advanced - Folder Overrides */}
                      <details
                        open={Boolean(
                          draftDriveFolderPreferences ||
                          draftDriveFolderAnnouncements ||
                          draftDriveFolderMP3s ||
                          draftDriveFolderEvergreens ||
                          draftDriveFolderShows ||
                          draftDriveFolderLogs
                        )}
                        className="text-xs border border-slate-200 rounded p-2 bg-slate-50/50"
                      >
                        <summary className="cursor-pointer font-bold text-slate-700 select-none">
                          Advanced - Folder Overrides
                        </summary>
                        <div className="mt-2.5 space-y-3 pt-2 border-t border-slate-200">
                          {/* Settings Folder Container */}
                          <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                            <div className={cn("mb-1", isNarrow ? "flex flex-col items-start gap-1" : "flex justify-between items-center")}>
                              <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                                Settings Folder
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
                                Browse
                              </button>
                              {draftDriveFolderPreferences && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenDriveFolder(
                                        draftDriveFolderPreferences,
                                      )
                                    }
                                    className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDraftDriveFolderPreferences("")}
                                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Clear
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Announcements Media Folder Container */}
                          <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                            <div className={cn("mb-1", isNarrow ? "flex flex-col items-start gap-1" : "flex justify-between items-center")}>
                              <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                                Media_Announcements Folder
                              </span>
                              {(draftDriveFolderAnnouncements || draftDriveFolderMP3s) ? (
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
                              {driveFolderDescMap[draftDriveFolderAnnouncements || draftDriveFolderMP3s] ||
                                "No directory folder configured yet"}
                            </p>
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDriveField("announcements");
                                  setTempPasteLink(draftDriveFolderAnnouncements || draftDriveFolderMP3s);
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Browse
                              </button>
                              {(draftDriveFolderAnnouncements || draftDriveFolderMP3s) && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenDriveFolder(draftDriveFolderAnnouncements || draftDriveFolderMP3s)
                                    }
                                    className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (setDraftDriveFolderAnnouncements) setDraftDriveFolderAnnouncements("");
                                      setDraftDriveFolderMP3s("");
                                    }}
                                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Clear
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Evergreens Media Folder Container */}
                          <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                            <div className={cn("mb-1", isNarrow ? "flex flex-col items-start gap-1" : "flex justify-between items-center")}>
                              <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                                Media_Evergreens Folder
                              </span>
                              {draftDriveFolderEvergreens ? (
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
                              {(draftDriveFolderEvergreens && driveFolderDescMap[draftDriveFolderEvergreens]) ||
                                "No directory folder configured yet"}
                            </p>
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDriveField("evergreens");
                                  setTempPasteLink(draftDriveFolderEvergreens || "");
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Browse
                              </button>
                              {draftDriveFolderEvergreens && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenDriveFolder(draftDriveFolderEvergreens)
                                    }
                                    className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (setDraftDriveFolderEvergreens) setDraftDriveFolderEvergreens("");
                                    }}
                                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Clear
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Shows & Playlists Media Folder Container */}
                          <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                            <div className={cn("mb-1", isNarrow ? "flex flex-col items-start gap-1" : "flex justify-between items-center")}>
                              <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                                Media_Shows Folder
                              </span>
                              {draftDriveFolderShows ? (
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
                              {(draftDriveFolderShows && driveFolderDescMap[draftDriveFolderShows]) ||
                                "No directory folder configured yet"}
                            </p>
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDriveField("shows");
                                  setTempPasteLink(draftDriveFolderShows || "");
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Browse
                              </button>
                              {draftDriveFolderShows && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenDriveFolder(draftDriveFolderShows)
                                    }
                                    className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (setDraftDriveFolderShows) setDraftDriveFolderShows("");
                                    }}
                                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Clear
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Logs Folder Container */}
                          <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1">
                            <div className={cn("mb-1", isNarrow ? "flex flex-col items-start gap-1" : "flex justify-between items-center")}>
                              <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                                Logs Folder
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
                                Browse
                              </button>
                              {draftDriveFolderLogs && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenDriveFolder(draftDriveFolderLogs)
                                    }
                                    className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Open
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDraftDriveFolderLogs("")}
                                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Clear
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </details>

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
                        draftDriveFolders={{
                          driveFolderAmp: draftDriveFolderAmp,
                          driveFolderPreferences: draftDriveFolderPreferences,
                          driveFolderAnnouncements: draftDriveFolderAnnouncements || draftDriveFolderMP3s,
                          driveFolderEvergreens: draftDriveFolderEvergreens,
                          driveFolderShows: draftDriveFolderShows,
                          driveFolderLogs: draftDriveFolderLogs,
                        }}
                      />
                    </div>
                  )}

                  {locationMode === "Demo" && (
                    <div className="space-y-3">
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg whitespace-pre-line text-xs leading-relaxed text-amber-800 font-medium">
                        Demo mode for testing and learning. Data is stored in the cloud demo workspace.
                      </div>

                      {/* Demo Announcements Container */}
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                        <div className={cn("mb-1", isNarrow ? "flex flex-col items-start gap-1" : "flex justify-between items-center")}>
                          <span className="text-xs font-black uppercase text-blue-600 tracking-wider">
                            Demo Announcement
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
                              onOpenDriveFolder(
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
                        <div className={cn("mb-1", isNarrow ? "flex flex-col items-start gap-1" : "flex justify-between items-center")}>
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
                              onOpenDriveFolder(
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
                        <div className={cn("mb-1", isNarrow ? "flex flex-col items-start gap-1" : "flex justify-between items-center")}>
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
                              onOpenDriveFolder(
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
                        draftDriveFolders={{
                          driveFolderAmp: draftDriveFolderAmp,
                          driveFolderPreferences: draftDriveFolderPreferences,
                          driveFolderAnnouncements: draftDriveFolderAnnouncements || draftDriveFolderMP3s,
                          driveFolderEvergreens: draftDriveFolderEvergreens,
                          driveFolderShows: draftDriveFolderShows,
                          driveFolderLogs: draftDriveFolderLogs,
                        }}
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
                <div className={cn("px-4 py-2.5 border-t border-slate-200 bg-slate-50 font-sans", isNarrow ? "flex flex-col gap-2" : "flex gap-2 justify-end items-center")}>
                  {isNarrow ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onShowLocalHelp(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold uppercase rounded border border-slate-300 transition cursor-pointer"
                        >
                          <HelpCircle className="w-3.5 h-3.5 text-purple-600" />
                          <span>Help</span>
                        </button>
                        {isAiStudio && (
                          <button
                            type="button"
                            onClick={toggleAnimations}
                            title={
                              animationsDisabled
                                ? "Performance Overrides: ACTIVE. Click to configure or disable"
                                : "Performance Overrides: INACTIVE. Click to configure & enable"
                            }
                            className={cn(
                              "flex items-center justify-center p-1.5 rounded transition-all cursor-pointer border border-transparent",
                              animationsDisabled
                                ? "bg-red-100 text-red-700 border-red-300 hover:bg-red-200"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200",
                            )}
                          >
                            {animationsDisabled ? (
                              <ZapOff className="w-3.5 h-3.5 text-red-600" />
                            ) : (
                              <Zap className="w-3.5 h-3.5 text-amber-500" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold uppercase rounded border border-slate-300 transition cursor-pointer ml-auto"
                        >
                          Cancel
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={isSyncing || isValidatingDrive}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded shadow transition disabled:opacity-50 cursor-pointer flex justify-center items-center"
                      >
                        {isSyncing || isValidatingDrive
                          ? "Verifying..."
                          : "Save and Close"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onShowLocalHelp(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold uppercase rounded border border-slate-300 transition cursor-pointer"
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-purple-600" />
                        <span>Help</span>
                      </button>
                      {/* === DEBUG ANIMATION SWITCH & PIXEL RULER (AI Studio Only) === */}
                      {isAiStudio && (
                        <button
                          type="button"
                          onClick={toggleAnimations}
                          title={
                            animationsDisabled
                              ? "Performance Overrides: ACTIVE. Click to configure or disable"
                              : "Performance Overrides: INACTIVE. Click to configure & enable"
                          }
                          className={cn(
                            "flex items-center justify-center p-1.5 rounded transition-all cursor-pointer mr-auto border border-transparent",
                            animationsDisabled
                              ? "bg-red-100 text-red-700 border-red-300 hover:bg-red-200"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200",
                          )}
                        >
                          {animationsDisabled ? (
                            <ZapOff className="w-3.5 h-3.5 text-red-600" />
                          ) : (
                            <Zap className="w-3.5 h-3.5 text-amber-500" />
                          )}
                        </button>
                      )}
                      {!isAiStudio && <div className="mr-auto" />}
                      <button
                        type="button"
                        onClick={onClose}
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
                    </>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Drive Field Editor Modal */}
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
                  {editingDriveField === "amp"
                    ? "AMP Station Location folder"
                    : editingDriveField === "preferences"
                      ? "Announcements & Preferences folder"
                      : editingDriveField === "announcements" || editingDriveField === "mp3s"
                        ? "Announcements Media folder"
                        : editingDriveField === "evergreens"
                          ? "Evergreens Media folder"
                          : editingDriveField === "shows"
                            ? "Shows & Playlists Media folder"
                            : "Play Logs folder"}
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
                    if (editingDriveField === "amp") {
                      if (setDraftDriveFolderAmp) setDraftDriveFolderAmp("");
                    } else if (editingDriveField === "preferences") {
                      setDraftDriveFolderPreferences("");
                    } else if (editingDriveField === "announcements" || editingDriveField === "mp3s") {
                      if (setDraftDriveFolderAnnouncements) setDraftDriveFolderAnnouncements("");
                      setDraftDriveFolderMP3s("");
                    } else if (editingDriveField === "evergreens") {
                      if (setDraftDriveFolderEvergreens) setDraftDriveFolderEvergreens("");
                    } else if (editingDriveField === "shows") {
                      if (setDraftDriveFolderShows) setDraftDriveFolderShows("");
                    } else if (editingDriveField === "logs") {
                      setDraftDriveFolderLogs("");
                    }
                    setEditingDriveField(null);
                    setTempPasteLink("");
                  }}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold uppercase rounded border border-rose-200 transition cursor-pointer"
                >
                  Clear Field
                </button>
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
                    if (editingDriveField === "amp") {
                      if (setDraftDriveFolderAmp) setDraftDriveFolderAmp(rawId);
                    } else if (editingDriveField === "preferences") {
                      setDraftDriveFolderPreferences(rawId);
                    } else if (editingDriveField === "announcements" || editingDriveField === "mp3s") {
                      if (setDraftDriveFolderAnnouncements) setDraftDriveFolderAnnouncements(rawId);
                      setDraftDriveFolderMP3s(rawId);
                    } else if (editingDriveField === "evergreens") {
                      if (setDraftDriveFolderEvergreens) setDraftDriveFolderEvergreens(rawId);
                    } else if (editingDriveField === "shows") {
                      if (setDraftDriveFolderShows) setDraftDriveFolderShows(rawId);
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
      {/* Modal to Ask User if they Want to Clear Advanced Overrides */}
      <AnimatePresence>
        {showClearOverridesModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-xl max-w-sm w-full overflow-hidden text-slate-900 flex flex-col shadow-2xl p-5 space-y-4"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider">
                  Clear Advanced Settings?
                </h3>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                Advanced folder overrides have been previously specified. Would you like to clear the advanced settings so default subfolders under the selected AMP folder are used?
              </p>
              <div className="flex gap-2 justify-end pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleKeepAdvanced}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold uppercase rounded border border-slate-300 transition cursor-pointer"
                >
                  Keep Advanced
                </button>
                <button
                  type="button"
                  onClick={handleClearAdvanced}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded shadow transition cursor-pointer"
                >
                  Clear Advanced
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for Missing Folders / Files Confirmation */}
      <AnimatePresence>
        {showMissingModal && missingCheckData && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden text-slate-900 flex flex-col shadow-2xl p-5 space-y-4"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <h3 className="text-xs font-black uppercase text-amber-700 tracking-wider">
                  Missing Folders / Files Detected
                </h3>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed font-medium">
                Did not find {formatMissingList(missingCheckData.missingItems)} in folders {missingCheckData.targetFolderDesc}. Please pick or browse for a valid existing folder location.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowMissingModal(false)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded shadow transition cursor-pointer"
                >
                  Pick / Edit Folders
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
