import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ListMusic, RefreshCw, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Show } from "../types";

export interface PlaylistSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  playlistShowOptions: {
    currentShow: Show | null;
    nextShow: Show | null;
    defaultShowId: string;
    currentShowFileCount: number;
    nextShowFileCount: number;
    elapsedMinutes: number;
    is15MinsOrMore: boolean;
  } | null;
  chosenPlaylistShowId: string;
  playlistModalNow: Date | null;
  syncTime: Date | null;
  onSelectAndConfirmShow: (show: Show) => void;
}

export const PlaylistSelectModal: React.FC<PlaylistSelectModalProps> = ({
  isOpen,
  onClose,
  isLoading,
  playlistShowOptions,
  chosenPlaylistShowId,
  playlistModalNow,
  syncTime,
  onSelectAndConfirmShow,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
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
                onClick={onClose}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
              {isLoading ? (
                <div className="py-8 flex flex-col items-center justify-center space-y-2 text-purple-600 dark:text-purple-400">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Checking Playlist Folders...
                  </span>
                </div>
              ) : playlistShowOptions ? (
                <div className="space-y-2.5">
                  {/* Current Show Card */}
                  {playlistShowOptions.currentShow ? (
                    (() => {
                      const daysOrder = [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ] as const;
                      const nowObj = playlistModalNow || syncTime || new Date();
                      const currentWeekMin =
                        nowObj.getDay() * 1440 +
                        nowObj.getHours() * 60 +
                        nowObj.getMinutes();
                      const showStartWeekMin =
                        daysOrder.indexOf(playlistShowOptions.currentShow.day) *
                          1440 +
                        playlistShowOptions.currentShow.startHour * 60 +
                        playlistShowOptions.currentShow.startMinute;
                      const totalShowMin =
                        playlistShowOptions.currentShow.durationHours * 60 +
                        playlistShowOptions.currentShow.durationMinutes;
                      const elapsedMin =
                        (currentWeekMin - showStartWeekMin + 10080) % 10080;
                      const remainingMin = totalShowMin - elapsedMin;

                      const formatHM = (mins: number) => {
                        const h = Math.floor(Math.max(0, mins) / 60);
                        const m = Math.floor(Math.max(0, mins) % 60);
                        return `${h}:${m.toString().padStart(2, "0")}`;
                      };

                      const timeLabel =
                        remainingMin < 30
                          ? `${formatHM(remainingMin)} remaining`
                          : `${formatHM(elapsedMin)} elapsed`;

                      return (
                        <div
                          onClick={() =>
                            onSelectAndConfirmShow(
                              playlistShowOptions.currentShow!,
                            )
                          }
                          className={cn(
                            "p-3 rounded-lg border text-left cursor-pointer transition-all relative select-none flex flex-col gap-1.5",
                            chosenPlaylistShowId ===
                              playlistShowOptions.currentShow.id
                              ? "bg-purple-50/80 dark:bg-purple-950/50 border-purple-500 ring-2 ring-purple-500/30"
                              : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md",
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
                            <span>{`${playlistShowOptions.currentShowFileCount} MP3s`}</span>
                            <span className="font-sans text-[10px] uppercase font-bold text-slate-400">
                              {timeLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="p-3 text-xs text-slate-500 italic bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                      No current show active in schedule.
                    </div>
                  )}

                  {/* Next Show Card */}
                  {playlistShowOptions.nextShow ? (
                    (() => {
                      const daysOrder = [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ] as const;
                      const nowObj = playlistModalNow || syncTime || new Date();
                      const currentWeekMin =
                        nowObj.getDay() * 1440 +
                        nowObj.getHours() * 60 +
                        nowObj.getMinutes();
                      const nextStartWeekMin =
                        daysOrder.indexOf(playlistShowOptions.nextShow.day) *
                          1440 +
                        playlistShowOptions.nextShow.startHour * 60 +
                        playlistShowOptions.nextShow.startMinute;
                      const minsUntilNextShow =
                        (nextStartWeekMin - currentWeekMin + 10080) % 10080;
                      const nextH = Math.floor(
                        Math.max(0, minsUntilNextShow) / 60,
                      );
                      const nextM = Math.floor(
                        Math.max(0, minsUntilNextShow) % 60,
                      );
                      const startsInLabel = `Starts in ${nextH}:${nextM.toString().padStart(2, "0")}`;

                      return (
                        <div
                          onClick={() =>
                            onSelectAndConfirmShow(
                              playlistShowOptions.nextShow!,
                            )
                          }
                          className={cn(
                            "p-3 rounded-lg border text-left cursor-pointer transition-all relative select-none flex flex-col gap-1.5",
                            chosenPlaylistShowId ===
                              playlistShowOptions.nextShow.id
                              ? "bg-purple-50/80 dark:bg-purple-950/50 border-purple-500 ring-2 ring-purple-500/30"
                              : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md",
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
                            <span>{`${playlistShowOptions.nextShowFileCount} MP3s`}</span>
                            <span className="font-sans text-[10px] uppercase font-bold text-slate-400">
                              {startsInLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="p-3 text-xs text-slate-500 italic bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                      No upcoming show in schedule.
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 text-xs text-slate-500 italic">
                  No show information available.
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex gap-2 justify-end shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-wider rounded border border-slate-300 dark:border-slate-700 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
