import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Download,
  Folder,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  FolderOpen,
  AlertTriangle,
  Trash2,
  FileCheck,
} from "lucide-react";
import { cn } from "../lib/utils";

export interface ExportResult {
  exportFolder: string;
  totalCount: number;
  copiedCount: number;
  missingCount: number;
  txtFilename?: string;
  m3uFilename?: string;
  baseFilename?: string;
}

export interface DynamicNames {
  folderName: string;
  textFilename: string;
  playlistFilename: string;
  firstTrackFilename: string;
}

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportState: "configuring" | "exporting" | "success" | "error";
  windowSize: { width: number; height: number };
  exportDestinationInput: string;
  setExportDestinationInput: (val: string) => void;
  exportFolderPrefixInput: string;
  setExportFolderPrefixInput: (val: string) => void;
  setExportTextPrefixInput: (val: string) => void;
  setExportPlaylistPrefixInput: (val: string) => void;
  exportError: string | null;
  exportResult: ExportResult | null;
  handleBrowseExportDestination: () => void;
  runExportPrerecord: (overwriteMode?: "normal" | "overwrite" | "clean") => void;
  handleOpenExportFolder: (folderPath: string) => void;
  getDynamicNames: () => DynamicNames;
  prerecordDate?: Date | null;
  prerecordLengthMinutes?: number;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  exportState,
  windowSize,
  exportDestinationInput,
  setExportDestinationInput,
  exportFolderPrefixInput,
  setExportFolderPrefixInput,
  setExportTextPrefixInput,
  setExportPlaylistPrefixInput,
  exportError,
  exportResult,
  handleBrowseExportDestination,
  runExportPrerecord,
  handleOpenExportFolder,
  getDynamicNames,
  prerecordDate,
  prerecordLengthMinutes = 60,
}) => {
  const [conflictStep, setConflictStep] = useState<
    "none" | "checking" | "conflict" | "confirm_overwrite" | "confirm_delete"
  >("none");
  const [conflictInfo, setConflictInfo] = useState<{
    exportFolderPath: string;
    fileCount: number;
    files: string[];
  } | null>(null);

  // Reset internal conflict step whenever modal closes or export completes
  useEffect(() => {
    if (!isOpen || exportState !== "configuring") {
      setConflictStep("none");
      setConflictInfo(null);
    }
  }, [isOpen, exportState]);

  const handleExportClick = async () => {
    if (!prerecordDate) {
      runExportPrerecord("normal");
      return;
    }

    setConflictStep("checking");

    try {
      const res = await fetch("/api/check-export-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exportDestination: exportDestinationInput,
          folderPrefix: exportFolderPrefixInput,
          prerecordDate: prerecordDate.toISOString(),
          lengthMinutes: prerecordLengthMinutes,
        }),
      });

      if (!res.ok) {
        // If check endpoint fails, proceed with default flow
        setConflictStep("none");
        runExportPrerecord("normal");
        return;
      }

      const data = await res.json();
      if (data.exists && data.hasFiles && data.fileCount > 0) {
        setConflictInfo({
          exportFolderPath: data.exportFolderPath,
          fileCount: data.fileCount,
          files: data.files || [],
        });
        setConflictStep("conflict");
      } else {
        setConflictStep("none");
        runExportPrerecord("normal");
      }
    } catch (e) {
      console.warn("Folder check error, proceeding with standard export:", e);
      setConflictStep("none");
      runExportPrerecord("normal");
    }
  };

  const h = windowSize.height;
  const w = windowSize.width;
  const isNarrow = w < 540;

  return (
    <AnimatePresence>
      {isOpen && (
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
                onClick={onClose}
                className="text-slate-500 hover:text-slate-300 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Checking state */}
            {conflictStep === "checking" && (
              <div className="py-8 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="w-6 h-6 text-emerald-500 animate-spin" />
                <p className="text-xs font-bold text-slate-300">
                  Checking destination directory...
                </p>
              </div>
            )}

            {/* Conflict Prompt: Files Already Exist */}
            {conflictStep === "conflict" && conflictInfo && (
              <div className="space-y-3.5 pt-1 text-left">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 flex flex-col gap-2 text-amber-400">
                  <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Files Already Exist in Export Folder</span>
                  </div>
                  <p className="text-xs leading-relaxed text-amber-200/90">
                    This folder already exists and contains{" "}
                    <span className="font-bold font-mono text-white">
                      {conflictInfo.fileCount}
                    </span>{" "}
                    {conflictInfo.fileCount === 1 ? "file" : "files"}.
                  </p>
                  <p className="text-xs font-mono select-all bg-slate-950 p-2 rounded text-amber-200 break-all border border-amber-900/30">
                    {conflictInfo.exportFolderPath}
                  </p>
                  <div className="flex justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenExportFolder(conflictInfo.exportFolderPath)
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold uppercase rounded transition cursor-pointer active:translate-y-px"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      <span>View Folder</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-black uppercase text-slate-400 tracking-wider">
                    Choose an export option:
                  </p>

                  <button
                    type="button"
                    onClick={() => setConflictStep("none")}
                    className="w-full text-left p-2.5 bg-slate-850 hover:bg-slate-800 border border-slate-700/80 rounded-lg flex items-start gap-2.5 cursor-pointer transition active:translate-y-px"
                  >
                    <Folder className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-200">
                        Cancel and choose a different folder
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Return to settings to pick another folder path or name prefix
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConflictStep("confirm_overwrite")}
                    className="w-full text-left p-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 rounded-lg flex items-start gap-2.5 cursor-pointer transition active:translate-y-px"
                  >
                    <FileCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-amber-300">
                        Export and overwrite matching files
                      </p>
                      <p className="text-xs text-amber-400/80 mt-0.5">
                        Replace files with matching names while preserving other items
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConflictStep("confirm_delete")}
                    className="w-full text-left p-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 rounded-lg flex items-start gap-2.5 cursor-pointer transition active:translate-y-px"
                  >
                    <Trash2 className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-red-300">
                        Export and permanently delete all previously exported files in folder
                      </p>
                      <p className="text-xs text-red-400/80 mt-0.5">
                        Clean out previously exported audio and playlist files before exporting
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Challenge: Confirm Overwrite */}
            {conflictStep === "confirm_overwrite" && conflictInfo && (
              <div className="space-y-3.5 pt-1 text-left">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3.5 flex flex-col gap-2 text-amber-400">
                  <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Are you sure?</span>
                  </div>
                  <p className="text-xs leading-relaxed text-amber-200">
                    This will potentially overwrite matching files in the directory:
                  </p>
                  <p className="text-xs font-mono select-all bg-slate-950 p-2 rounded text-amber-200 break-all border border-amber-900/30">
                    {conflictInfo.exportFolderPath}
                  </p>
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-slate-800/40">
                  <button
                    type="button"
                    onClick={() => setConflictStep("conflict")}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded border border-slate-700 cursor-pointer active:translate-y-px"
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConflictStep("none");
                      runExportPrerecord("overwrite");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase rounded shadow cursor-pointer active:translate-y-px"
                  >
                    <Download className="w-4 h-4" />
                    <span>Yes, Overwrite Matching Files</span>
                  </button>
                </div>
              </div>
            )}

            {/* Challenge: Confirm Permanent Delete */}
            {conflictStep === "confirm_delete" && conflictInfo && (
              <div className="space-y-3.5 pt-1 text-left">
                <div className="bg-red-500/10 border border-red-500/30 rounded p-3.5 flex flex-col gap-2 text-red-400">
                  <div className="flex items-center gap-2 text-sm font-bold text-red-300">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>Are you sure?</span>
                  </div>
                  <p className="text-xs leading-relaxed text-red-200">
                    This will permanently delete all previously exported audio (.mp3), playlist (.m3u), text summary (.txt), and script files in:
                  </p>
                  <p className="text-xs font-mono select-all bg-slate-950 p-2 rounded text-red-200 break-all border border-red-900/30">
                    {conflictInfo.exportFolderPath}
                  </p>
                  <p className="text-xs text-slate-400">
                    Note: Subdirectories and non-export system files will not be touched.
                  </p>
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-slate-800/40">
                  <button
                    type="button"
                    onClick={() => setConflictStep("conflict")}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded border border-slate-700 cursor-pointer active:translate-y-px"
                  >
                    Go Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConflictStep("none");
                      runExportPrerecord("clean");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase rounded shadow cursor-pointer active:translate-y-px"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Yes, Permanently Delete &amp; Export</span>
                  </button>
                </div>
              </div>
            )}

            {/* Standard Configuring Screen */}
            {exportState === "configuring" && conflictStep === "none" && (() => {
              // Adjust vertical height calculations if horizontal narrow rearrangement occurs
              const eh = isNarrow ? h - 130 : h;

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
                return (
                  str.substring(0, half) +
                  "..." +
                  str.substring(str.length - half)
                );
              };

              return (
                <div className="space-y-4 flex flex-col pt-1">
                  {isNarrow ? (
                    <div className="space-y-3.5 text-left">
                      {/* Move the Path label and browse button to be on a row above the Path data field */}
                      <div className="flex flex-col space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          {showPathLabel ? (
                            <label className="font-black uppercase tracking-wider text-slate-400 select-none">
                              path
                            </label>
                          ) : (
                            <div />
                          )}
                          <button
                            type="button"
                            onClick={handleBrowseExportDestination}
                            className="px-3 py-1 bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded cursor-pointer flex items-center justify-center min-w-[36px] h-8 active:translate-y-px shadow-sm"
                            title="Browse"
                          >
                            <Folder className="w-4 h-4 text-emerald-400" />
                          </button>
                        </div>
                        <textarea
                          rows={2}
                          value={exportDestinationInput}
                          onChange={(e) =>
                            setExportDestinationInput(e.target.value)
                          }
                          placeholder="Select export folder pathway..."
                          className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-600 font-mono resize-none leading-normal"
                        />
                      </div>

                      {/* Move the Name data field to below the Name label */}
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
                          className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
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
                              {reduceFolderText
                                ? truncateMiddle(
                                    getDynamicNames().folderName,
                                    22,
                                  )
                                : getDynamicNames().folderName}
                            </span>
                          </div>
                        )}

                        {showPlanRow && (
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                              Plan:
                            </span>
                            <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                              {reducePlaylistAndPlanText
                                ? truncateMiddle(
                                    getDynamicNames().textFilename,
                                    22,
                                  )
                                : getDynamicNames().textFilename}
                            </span>
                          </div>
                        )}

                        {showPlaylistRow && (
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                              Playlist:
                            </span>
                            <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                              {reducePlaylistAndPlanText
                                ? truncateMiddle(
                                    getDynamicNames().playlistFilename,
                                    22,
                                  )
                                : getDynamicNames().playlistFilename}
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
                              onChange={(e) =>
                                setExportDestinationInput(e.target.value)
                              }
                              placeholder="Select export folder pathway..."
                              className="flex-1 bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-600 font-mono"
                            />
                            <button
                              type="button"
                              onClick={handleBrowseExportDestination}
                              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-black uppercase rounded cursor-pointer whitespace-nowrap active:translate-y-px shadow-sm"
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
                            onChange={(e) =>
                              setExportDestinationInput(e.target.value)
                            }
                            placeholder="Select export folder pathway..."
                            className="flex-1 bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-600 font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleBrowseExportDestination}
                            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-black uppercase rounded cursor-pointer whitespace-nowrap active:translate-y-px shadow-sm"
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
                            className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
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
                          className="w-full bg-slate-950 border border-slate-850 rounded px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
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
                              {reduceFolderText
                                ? truncateMiddle(
                                    getDynamicNames().folderName,
                                    22,
                                  )
                                : getDynamicNames().folderName}
                            </span>
                          </div>
                        )}

                        {showPlanRow && (
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                              Plan:
                            </span>
                            <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                              {reducePlaylistAndPlanText
                                ? truncateMiddle(
                                    getDynamicNames().textFilename,
                                    22,
                                  )
                                : getDynamicNames().textFilename}
                            </span>
                          </div>
                        )}

                        {showPlaylistRow && (
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-400 select-none">
                              Playlist:
                            </span>
                            <span className="text-xs font-mono select-all break-all text-emerald-400 font-bold leading-normal">
                              {reducePlaylistAndPlanText
                                ? truncateMiddle(
                                    getDynamicNames().playlistFilename,
                                    22,
                                  )
                                : getDynamicNames().playlistFilename}
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

                  {/* Footer Buttons */}
                  {(() => {
                    const useCompactButtons = w < 440;
                    const useStackedButtons = w < 360;

                    if (useStackedButtons) {
                      return (
                        <div className="flex flex-col gap-0 pt-3 border-t border-slate-800/40 w-full">
                          <button
                            type="button"
                            onClick={handleExportClick}
                            className="flex items-center justify-center gap-1.5 p-[2px] bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded border-b-[3px] border-emerald-800 hover:brightness-110 active:border-b-0 active:translate-y-[3px] transition-all cursor-pointer shadow w-full"
                          >
                            <Download className="w-4 h-4 shrink-0" />
                            <span>Export</span>
                          </button>
                          <button
                            type="button"
                            onClick={onClose}
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
                            onClick={onClose}
                            className="flex-1 px-[2px] py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider rounded border-b-[3px] border-slate-950 hover:brightness-110 active:border-b-0 active:translate-y-[3px] transition-all cursor-pointer text-center"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleExportClick}
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
                          onClick={onClose}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider rounded border-b-[3px] border-slate-950 hover:brightness-110 active:border-b-0 active:translate-y-[3px] transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleExportClick}
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
              <div className="space-y-4 pt-1 text-left">
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
                    onClick={onClose}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded border border-slate-700 transition cursor-pointer active:translate-y-px"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleExportClick}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded shadow cursor-pointer shadow-emerald-950/20 active:translate-y-px"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {exportState === "success" && exportResult && (
              <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto custom-scrollbar text-left">
                {/* Check box icon inline before Export Completed Successfully & Open Folder directly underneath description */}
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-3.5 flex flex-col gap-1.5 text-emerald-500">
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>Export Completed Successfully</span>
                  </div>
                  <p className="text-xs leading-relaxed text-emerald-300">
                    Broadcasting package compiled into local folder:
                  </p>
                  <p className="text-xs font-mono select-all bg-slate-950 p-2 rounded text-emerald-200 break-all border border-emerald-900/30">
                    {exportResult.exportFolder}
                  </p>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenExportFolder(exportResult.exportFolder)
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded shadow cursor-pointer active:translate-y-px"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Open Folder</span>
                    </button>
                  </div>
                </div>

                {/* Stack Scheduled, Copied, and Missing stats vertically on narrow window */}
                {isNarrow ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/40 rounded border border-slate-800">
                      <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                        Scheduled
                      </span>
                      <span className="text-sm font-black font-mono text-emerald-400">
                        {exportResult.totalCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/40 rounded border border-slate-800">
                      <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                        Copied
                      </span>
                      <span className="text-sm font-black font-mono text-emerald-400">
                        {exportResult.copiedCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/40 rounded border border-slate-800">
                      <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                        Missing
                      </span>
                      <span className="text-sm font-black font-mono text-amber-500">
                        {exportResult.missingCount}
                      </span>
                    </div>
                  </div>
                ) : (
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
                )}

                <div className="space-y-1.5 bg-slate-950/30 p-2.5 rounded border border-slate-850 text-slate-300 font-sans">
                  <p className="text-xs font-bold text-slate-200">
                    Created Package Files:
                  </p>
                  <ul className="text-xs font-mono space-y-1.5 pl-3 list-disc text-slate-400">
                    <li>
                      {exportResult.txtFilename ||
                        `${exportResult.baseFilename}.txt`}{" "}
                      <span className="text-xs text-slate-500 font-sans font-medium">
                        (Summary Interstitial)
                      </span>
                    </li>
                    <li>
                      {exportResult.m3uFilename ||
                        `${exportResult.baseFilename}.m3u`}{" "}
                      <span className="text-xs text-slate-500 font-sans font-medium">
                        (M3U Playlist File)
                      </span>
                    </li>
                    <li>
                      MP3 Files{" "}
                      <span className="text-xs text-slate-500 font-sans font-medium">
                        (Break 1, Break 2...)
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-800/40">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded border border-slate-700 transition cursor-pointer active:translate-y-px"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
