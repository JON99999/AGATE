import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Folder,
  FolderCheck,
  FolderX,
  HardDrive,
  ListMusic,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Ban,
  CornerDownRight,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Show, DiscoveredFolderItem, DiscoverFoldersResponse } from "../types";
import { selectFolder } from "../lib/nativeDialog";
import { getSavedSettings } from "../lib/driveService";

export interface FolderChooserModalProps {
  isOpen: boolean;
  onClose: () => void;
  show: Show | null;
  folderType: "Playlists" | "Evergreens" | "show" | "evergreen";
  currentSelectedFolderPath: string;
  isExternalFolder: boolean;
  externalAbsolutePath: string | null;
  onOpenLocalPath?: (path: string) => void | Promise<void>;
  onSelectFolder: (params: {
    selectedFolderPath: string;
    isExternalFolder: boolean;
    externalAbsolutePath: string | null;
  }) => void | Promise<void>;
}

export const FolderChooserModal: React.FC<FolderChooserModalProps> = ({
  isOpen,
  onClose,
  show,
  folderType,
  currentSelectedFolderPath,
  isExternalFolder,
  externalAbsolutePath,
  onOpenLocalPath,
  onSelectFolder,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveredFolders, setDiscoveredFolders] = useState<DiscoveredFolderItem[]>([]);
  const [defaultFolderName, setDefaultFolderName] = useState<string>("");
  const [defaultFolderPath, setDefaultFolderPath] = useState<string>("");

  // Custom directory scanning state
  const [customDiscoveredFolders, setCustomDiscoveredFolders] = useState<DiscoveredFolderItem[]>([]);
  const [customLoading, setCustomLoading] = useState<boolean>(false);

  // Selection state
  const [selectedRelPath, setSelectedRelPath] = useState<string>(".");
  const [isExternal, setIsExternal] = useState<boolean>(false);
  const [externalPath, setExternalPath] = useState<string | null>(null);
  const [isNoPlaylist, setIsNoPlaylist] = useState<boolean>(false);
  const [customBrowsePath, setCustomBrowsePath] = useState<string | null>(null);

  const isEvergreenMode = folderType && folderType.toLowerCase().startsWith("evergreen");
  const mediaFlavorFolder = isEvergreenMode ? "media_evergreens" : "media_shows";

  // Initialize selection state from current props
  useEffect(() => {
    if (isOpen) {
      if (currentSelectedFolderPath === "__no_playlist__") {
        setIsNoPlaylist(true);
        setIsExternal(false);
        setExternalPath(null);
        setSelectedRelPath("__no_playlist__");
      } else if (isExternalFolder && externalAbsolutePath) {
        setIsExternal(true);
        setExternalPath(externalAbsolutePath);
        setCustomBrowsePath(externalAbsolutePath);
        setIsNoPlaylist(false);
        setSelectedRelPath(currentSelectedFolderPath || ".");
        fetchCustomFolders(externalAbsolutePath);
      } else {
        setIsExternal(false);
        setExternalPath(null);
        setIsNoPlaylist(false);
        setSelectedRelPath(currentSelectedFolderPath || ".");
      }
      fetchFolders();
    }
  }, [isOpen, show, folderType, currentSelectedFolderPath, isExternalFolder, externalAbsolutePath]);

  const fetchFolders = async () => {
    if (!show) return;
    setLoading(true);
    setError(null);

    try {
      const settings = getSavedSettings();
      if (settings.mode === "Local") {
        const queryParams = new URLSearchParams({
          folderType,
          showName: show.name || "",
          showNameShort: show.nameShort || "",
          showId: show.id || "",
        });
        const res = await fetch(`/api/shows/discover-folders?${queryParams.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to discover show folders");
        }
        const data: DiscoverFoldersResponse = await res.json();
        setDiscoveredFolders(data.folders || []);
        setDefaultFolderName(data.defaultFolderName || mediaFlavorFolder);
        if (data.defaultFolderPath) {
          setDefaultFolderPath(data.defaultFolderPath);
        }
      } else {
        // Fallback for Drive / Demo mode: represent default root folder
        setDiscoveredFolders([
          {
            id: "root",
            name: "Top Level (Root)",
            relPath: ".",
            fileCount: 0,
            isRoot: true,
            hasM3u: false,
            depth: 0,
          },
        ]);
        setDefaultFolderName(mediaFlavorFolder);
      }
    } catch (err: any) {
      console.error("Error discovering folders:", err);
      setError(err?.message || "Failed to scan folder structure.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomFolders = async (targetPath: string) => {
    if (!targetPath) return;
    setCustomLoading(true);
    try {
      const queryParams = new URLSearchParams({
        customPath: targetPath,
        folderType,
      });
      const res = await fetch(`/api/shows/discover-folders?${queryParams.toString()}`);
      if (res.ok) {
        const data: DiscoverFoldersResponse = await res.json();
        setCustomDiscoveredFolders(data.folders || []);
      }
    } catch (err) {
      console.error("Error scanning custom folder:", err);
    } finally {
      setCustomLoading(false);
    }
  };

  const handleOpenPath = (pathVal?: string | null) => {
    if (!pathVal) return;
    if (onOpenLocalPath) {
      onOpenLocalPath(pathVal);
    } else {
      fetch("/api/open-local-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathVal }),
      }).catch((e) => console.error("Error opening path:", e));
    }
  };

  const handleBrowseCustomFolder = async () => {
    try {
      const result = await selectFolder(customBrowsePath || externalPath || undefined);
      if (result.success && result.path) {
        setCustomBrowsePath(result.path);
        setExternalPath(result.path);
        setIsExternal(true);
        setIsNoPlaylist(false);
        setSelectedRelPath(".");
        await fetchCustomFolders(result.path);
      }
    } catch (err: any) {
      console.error("Error browsing folder:", err);
    }
  };

  const handleSelectDiscovered = (relPath: string) => {
    setSelectedRelPath(relPath);
    setIsExternal(false);
    setExternalPath(null);
    setIsNoPlaylist(false);
  };

  const handleSelectCustomItem = (relPath: string) => {
    setSelectedRelPath(relPath);
    setIsExternal(true);
    setIsNoPlaylist(false);
  };

  const handleSelectNoPlaylist = () => {
    setIsNoPlaylist(true);
    setIsExternal(false);
    setExternalPath(null);
    setSelectedRelPath("__no_playlist__");
  };

  const handleApply = async () => {
    if (isNoPlaylist) {
      await onSelectFolder({
        selectedFolderPath: "__no_playlist__",
        isExternalFolder: false,
        externalAbsolutePath: null,
      });
    } else if (isExternal && externalPath) {
      await onSelectFolder({
        selectedFolderPath: selectedRelPath && selectedRelPath !== "." ? selectedRelPath : externalPath,
        isExternalFolder: true,
        externalAbsolutePath: externalPath,
      });
    } else {
      await onSelectFolder({
        selectedFolderPath: selectedRelPath || ".",
        isExternalFolder: false,
        externalAbsolutePath: null,
      });
    }
    onClose();
  };

  // Check if current active folder is missing from discovered list
  const isCurrentActiveMissing =
    !isExternalFolder &&
    currentSelectedFolderPath &&
    currentSelectedFolderPath !== "." &&
    currentSelectedFolderPath !== "__no_playlist__" &&
    !discoveredFolders.some((f) => f.relPath === currentSelectedFolderPath);

  const resolvedDefaultFolderName = defaultFolderName || mediaFlavorFolder;
  const customFolderIdentifier = externalPath
    ? externalPath.split(/[\\/]/).filter(Boolean).pop() || externalPath
    : "";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-xl shadow-2xl w-[480px] max-w-[95vw] text-slate-800 dark:text-slate-100 flex flex-col font-sans max-h-[85vh] overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-purple-50 dark:bg-purple-950/40 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-purple-600 dark:text-purple-400 shrink-0">
                  <ListMusic className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-xs font-black uppercase tracking-wider text-purple-900 dark:text-purple-200 truncate">
                    {isEvergreenMode ? "Pick Evergreen Folder" : "Pick Playlist Folder"}
                  </h3>
                  {show && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold truncate">
                      {show.name}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="py-8 flex flex-col items-center justify-center space-y-2 text-purple-600 dark:text-purple-400">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Scanning {isEvergreenMode ? "Evergreen" : "Show"} Folders...
                  </span>
                </div>
              ) : error ? (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Error scanning folders</p>
                    <p className="mt-0.5">{error}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Default Folder section */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                        Default Folder: {resolvedDefaultFolderName}
                      </span>
                      {defaultFolderPath && (
                        <button
                          type="button"
                          onClick={() => handleOpenPath(defaultFolderPath)}
                          className="px-2 py-0.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 rounded text-[11px] font-bold uppercase shrink-0 transition cursor-pointer"
                        >
                          Open
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {discoveredFolders.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500 italic bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-slate-700">
                          No media files found in standard {isEvergreenMode ? "evergreen" : "show"} folders.
                        </div>
                      ) : (
                        discoveredFolders.map((item) => {
                          const isCurrentActive =
                            !isExternalFolder &&
                            (currentSelectedFolderPath === item.relPath ||
                              (item.isRoot && (!currentSelectedFolderPath || currentSelectedFolderPath === ".")));
                          const isSelected =
                            !isExternal && !isNoPlaylist && selectedRelPath === item.relPath;
                          const depth = item.depth || 0;
                          const isPlaylistItem = item.itemType === "playlist";

                          let fileCountLabel = `${item.fileCount} ${item.fileCount === 1 ? "file" : "files"}`;
                          if (isPlaylistItem) {
                            const total = item.totalTracks || item.fileCount;
                            const missing = item.missingCount || 0;
                            if (missing > 0) {
                              fileCountLabel = `${total} tracks, ${missing} missing`;
                            } else {
                              fileCountLabel = `${total} ${total === 1 ? "track" : "tracks"}`;
                            }
                          }

                          return (
                            <div
                              key={item.id}
                              onClick={() => handleSelectDiscovered(item.relPath)}
                              style={{ marginLeft: `${depth * 16}px` }}
                              className={cn(
                                "p-2 rounded-lg border text-left cursor-pointer transition-all flex items-center justify-between gap-2 select-none",
                                isSelected
                                  ? "bg-purple-50/90 dark:bg-purple-950/60 border-purple-500 ring-2 ring-purple-500/30 font-bold"
                                  : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {depth > 0 && (
                                  <CornerDownRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                )}
                                <span
                                  className={cn(
                                    "p-1.5 rounded-md shrink-0",
                                    isPlaylistItem
                                      ? "bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300"
                                      : item.isRoot
                                        ? "bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300"
                                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                  )}
                                >
                                  {isPlaylistItem ? (
                                    <ListMusic className="w-4 h-4" />
                                  ) : (
                                    <Folder className="w-4 h-4" />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                      {item.name}
                                    </span>
                                    {isCurrentActive && (
                                      <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 rounded text-[9px] font-black uppercase tracking-tight">
                                        Current
                                      </span>
                                    )}
                                    {item.hasM3u && !isPlaylistItem && (
                                      <span className="px-1.5 py-0.2 bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 rounded text-[9px] font-black uppercase tracking-tight">
                                        M3U
                                      </span>
                                    )}
                                  </div>
                                  <span
                                    className={cn(
                                      "text-[11px] font-mono",
                                      isPlaylistItem && (item.missingCount || 0) > 0
                                        ? "text-amber-600 dark:text-amber-400 font-bold"
                                        : "text-slate-500 dark:text-slate-400"
                                    )}
                                  >
                                    {fileCountLabel}
                                  </span>
                                </div>
                              </div>

                              {isSelected && (
                                <Check className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 font-bold" />
                              )}
                            </div>
                          );
                        })
                      )}

                      {/* Missing Folder indicator if previously selected subfolder no longer exists */}
                      {isCurrentActiveMissing && (
                        <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 text-left flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0">
                              <FolderX className="w-4 h-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 truncate">
                                  {currentSelectedFolderPath}
                                </span>
                                <span className="px-1.5 py-0.2 bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 rounded text-[9px] font-black uppercase tracking-tight">
                                  Missing
                                </span>
                              </div>
                              <span className="text-[11px] text-amber-700 dark:text-amber-300">
                                Previously saved folder was not found on disk.
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bring your own folder / External USB */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                        Custom Folder/USB: {customFolderIdentifier || "None Selected"}
                      </span>
                    </div>

                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={handleBrowseCustomFolder}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded text-xs font-bold uppercase transition cursor-pointer"
                      >
                        Browse
                      </button>
                      {externalPath && (
                        <button
                          type="button"
                          onClick={() => handleOpenPath(externalPath)}
                          className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 rounded text-xs font-bold uppercase transition cursor-pointer"
                        >
                          Open
                        </button>
                      )}
                    </div>

                    {customLoading ? (
                      <div className="py-3 flex items-center justify-center space-x-2 text-purple-600 dark:text-purple-400 text-xs">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Scanning Custom Folder...</span>
                      </div>
                    ) : customDiscoveredFolders.length > 0 ? (
                      <div className="space-y-1.5">
                        {customDiscoveredFolders.map((item) => {
                          const isCurrentActive =
                            isExternalFolder &&
                            externalAbsolutePath === externalPath &&
                            (selectedRelPath === item.relPath ||
                              (item.isRoot && (!selectedRelPath || selectedRelPath === ".")));
                          const isSelected =
                            isExternal && !isNoPlaylist && selectedRelPath === item.relPath;
                          const depth = item.depth || 0;
                          const isPlaylistItem = item.itemType === "playlist";

                          let fileCountLabel = `${item.fileCount} ${item.fileCount === 1 ? "file" : "files"}`;
                          if (isPlaylistItem) {
                            const total = item.totalTracks || item.fileCount;
                            const missing = item.missingCount || 0;
                            if (missing > 0) {
                              fileCountLabel = `${total} tracks, ${missing} missing`;
                            } else {
                              fileCountLabel = `${total} ${total === 1 ? "track" : "tracks"}`;
                            }
                          }

                          return (
                            <div
                              key={item.id}
                              onClick={() => handleSelectCustomItem(item.relPath)}
                              style={{ marginLeft: `${depth * 16}px` }}
                              className={cn(
                                "p-2 rounded-lg border text-left cursor-pointer transition-all flex items-center justify-between gap-2 select-none",
                                isSelected
                                  ? "bg-purple-50/90 dark:bg-purple-950/60 border-purple-500 ring-2 ring-purple-500/30 font-bold"
                                  : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {depth > 0 && (
                                  <CornerDownRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                )}
                                <span
                                  className={cn(
                                    "p-1.5 rounded-md shrink-0",
                                    isPlaylistItem
                                      ? "bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300"
                                      : item.isRoot
                                        ? "bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300"
                                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                  )}
                                >
                                  {isPlaylistItem ? (
                                    <ListMusic className="w-4 h-4" />
                                  ) : (
                                    <Folder className="w-4 h-4" />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                      {item.name}
                                    </span>
                                    {isCurrentActive && (
                                      <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 rounded text-[9px] font-black uppercase tracking-tight">
                                        Current
                                      </span>
                                    )}
                                    {item.hasM3u && !isPlaylistItem && (
                                      <span className="px-1.5 py-0.2 bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 rounded text-[9px] font-black uppercase tracking-tight">
                                        M3U
                                      </span>
                                    )}
                                  </div>
                                  <span
                                    className={cn(
                                      "text-[11px] font-mono",
                                      isPlaylistItem && (item.missingCount || 0) > 0
                                        ? "text-amber-600 dark:text-amber-400 font-bold"
                                        : "text-slate-500 dark:text-slate-400"
                                    )}
                                  >
                                    {fileCountLabel}
                                  </span>
                                </div>
                              </div>

                              {isSelected && (
                                <Check className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 font-bold" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        onClick={handleBrowseCustomFolder}
                        className={cn(
                          "p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-center justify-between gap-2 select-none",
                          isExternal
                            ? "bg-purple-50/90 dark:bg-purple-950/60 border-purple-500 ring-2 ring-purple-500/30 font-bold"
                            : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="p-1.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0">
                            <HardDrive className="w-4 h-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                {externalPath ? externalPath : "Browse Folder (USB / Custom)..."}
                              </span>
                              {isExternalFolder && isExternal && (
                                <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 rounded text-[9px] font-black uppercase tracking-tight">
                                  Current
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {externalPath
                                ? "Custom external folder selected"
                                : "Click to select a folder outside media structure"}
                            </span>
                          </div>
                        </div>

                        {isExternal && (
                          <Check className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 font-bold" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* No Playlist option */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
                      No Playlist
                    </span>
                    <div
                      onClick={handleSelectNoPlaylist}
                      className={cn(
                        "p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-center justify-between gap-2 select-none",
                        isNoPlaylist
                          ? "bg-purple-50/90 dark:bg-purple-950/60 border-purple-500 ring-2 ring-purple-500/30 font-bold"
                          : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-1.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0">
                          <Ban className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {isEvergreenMode ? "No Evergreen" : "No Playlist"}
                            </span>
                            {currentSelectedFolderPath === "__no_playlist__" && (
                              <span className="px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 rounded text-[9px] font-black uppercase tracking-tight">
                                Current
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {isEvergreenMode
                              ? "Only display Announcements"
                              : "Only display Announcements"}
                          </span>
                        </div>
                      </div>

                      {isNoPlaylist && (
                        <Check className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 font-bold" />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition cursor-pointer border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleApply}
                disabled={loading}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <FolderCheck className="w-3.5 h-3.5 font-bold" />
                <span>{isEvergreenMode ? "Load Evergreen" : "Load Playlist"}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default FolderChooserModal;
