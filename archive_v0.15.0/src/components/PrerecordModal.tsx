import React, { useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ListOrdered,
  CassetteTape,
  NotebookPen,
  Check,
  List,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { Show } from "../types";

export interface PrerecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  prerecordModalTarget: "Prerecord" | "Export";
  prerecordSelectorMode: "manual" | "show-list";
  setPrerecordSelectorMode: (mode: "manual" | "show-list") => void;
  showPrerecordConfirmStep: boolean;
  setShowPrerecordConfirmStep: (show: boolean) => void;
  prerecordConfirmDetails: any;
  setPrerecordConfirmDetails: (details: any) => void;
  shows: Show[];
  showFilterText: string;
  setShowFilterText: (text: string) => void;
  selectedPrerecordShowId: string;
  setSelectedPrerecordShowId: (id: string) => void;
  prerecordDateInput: string;
  setPrerecordDateInput: (date: string) => void;
  prerecordTimeInput: string;
  handleTimeInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  prerecordHoursInput: string;
  setPrerecordHoursInput: (hours: string) => void;
  prerecordMinutesInput: string;
  setPrerecordMinutesInput: (minutes: string) => void;
  prerecordError: string | null;
  onSelectPrerecordShow: (showId: string) => void;
  onActivatePrerecord: (e: React.FormEvent) => void;
  onFinalConfirmPrerecord: () => void;
  getSortedShows: (showList: Show[]) => Show[];
  getShowShade: (show: Show, allSorted: Show[]) => { bg: string; border: string };
  getFutureDatesForShow: (showDay: string, showHour: number, showMinute: number) => Date[];
  formatVerifyAirDate: (dateStr: string) => string;
  getPrerecord12HrDisplay: (timeStr: string) => string;
}

export const PrerecordModal: React.FC<PrerecordModalProps> = ({
  isOpen,
  onClose,
  prerecordModalTarget,
  prerecordSelectorMode,
  setPrerecordSelectorMode,
  showPrerecordConfirmStep,
  setShowPrerecordConfirmStep,
  prerecordConfirmDetails,
  setPrerecordConfirmDetails,
  shows,
  showFilterText,
  setShowFilterText,
  selectedPrerecordShowId,
  setSelectedPrerecordShowId,
  prerecordDateInput,
  setPrerecordDateInput,
  prerecordTimeInput,
  handleTimeInputChange,
  prerecordHoursInput,
  setPrerecordHoursInput,
  prerecordMinutesInput,
  setPrerecordMinutesInput,
  prerecordError,
  onSelectPrerecordShow,
  onActivatePrerecord,
  onFinalConfirmPrerecord,
  getSortedShows,
  getShowShade,
  getFutureDatesForShow,
  formatVerifyAirDate,
  getPrerecord12HrDisplay,
}) => {
  const dateSelectRef = useRef<HTMLSelectElement>(null);
  const isExportTarget = prerecordModalTarget === "Export";
  const colors = {
    accentText: isExportTarget ? "text-blue-700" : "text-emerald-700",
    focusRing: isExportTarget
      ? "focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      : "focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500",
    buttonBg: isExportTarget
      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
    border: isExportTarget ? "border-blue-300" : "border-emerald-300",
  };
  const ModeIcon = isExportTarget ? ListOrdered : CassetteTape;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-900/40 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={cn(
              "bg-white border rounded-xl shadow-2xl w-[255px] max-w-[95vw] text-slate-800 flex flex-col font-sans min-h-0",
              prerecordSelectorMode === "show-list" && !showPrerecordConfirmStep
                ? "h-[80vh] max-h-[80vh]"
                : "max-h-[80vh]",
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
                    <h3
                      className={cn(
                        "text-xs font-black uppercase tracking-wider",
                        colors.accentText,
                      )}
                    >
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
                    onClick={onFinalConfirmPrerecord}
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
                onSubmit={onActivatePrerecord}
                className="flex flex-col flex-1 min-h-0"
              >
                {/* Modal Header */}
                <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className={colors.accentText}>
                      <ModeIcon className="w-4 h-4 shrink-0" />
                    </span>
                    <h3
                      className={cn(
                        "text-xs font-black uppercase tracking-wider truncate",
                        colors.accentText,
                      )}
                    >
                      {prerecordSelectorMode === "show-list"
                        ? isExportTarget
                          ? "Choose Show to export"
                          : "Choose Show to prerecord"
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

                      {/* Condensed Listbox of Shows */}
                      <div className="flex flex-col text-left flex-1 min-h-[68px]">
                        <div className="h-full min-h-[68px] overflow-y-auto border border-slate-300 rounded-lg divide-y divide-slate-200/80 bg-white shadow-inner custom-scrollbar">
                          {(() => {
                            const activeShows = getSortedShows(
                              shows.filter((s) => s.active),
                            );
                            const filtered = activeShows.filter(
                              (s) =>
                                s.name
                                  .toLowerCase()
                                  .includes(showFilterText.toLowerCase()) ||
                                s.day
                                  .toLowerCase()
                                  .includes(showFilterText.toLowerCase()),
                            );

                            if (filtered.length === 0) {
                              return (
                                <div className="p-2.5 text-center text-xs text-slate-500 italic">
                                  No matching active shows
                                </div>
                              );
                            }

                            return filtered.map((show) => {
                              const shade = getShowShade(
                                show,
                                getSortedShows(shows),
                              );
                              const isSelected =
                                selectedPrerecordShowId === show.id;
                              return (
                                <div
                                  key={show.id}
                                  onClick={() =>
                                    onSelectPrerecordShow(show.id)
                                  }
                                  style={{
                                    backgroundColor: shade.bg,
                                    borderLeft: `3px solid ${shade.border}`,
                                  }}
                                  className={cn(
                                    "flex flex-col gap-0.5 px-2 py-1.5 cursor-pointer text-xs transition-all hover:brightness-95 select-none",
                                    isSelected &&
                                      cn(
                                        "ring-2 ring-inset z-10 font-bold",
                                        isExportTarget
                                          ? "ring-blue-600"
                                          : "ring-emerald-600",
                                      ),
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-1 w-full min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="px-1 py-0.2 bg-blue-50 text-blue-700 border border-blue-150 rounded text-[9px] font-black uppercase tracking-tight shrink-0">
                                        {show.day}
                                      </span>
                                      <span className="text-[10px] font-mono font-bold text-slate-700 truncate">
                                        {show.startHour
                                          .toString()
                                          .padStart(2, "0")}
                                        :
                                        {show.startMinute
                                          .toString()
                                          .padStart(2, "0")}{" "}
                                        ({show.durationHours}h
                                        {show.durationMinutes
                                          ? `${show.durationMinutes}m`
                                          : ""}
                                        )
                                      </span>
                                    </div>
                                    {isSelected && (
                                      <Check
                                        className={cn(
                                          "w-3.5 h-3.5 font-bold shrink-0 ml-auto",
                                          isExportTarget
                                            ? "text-blue-700"
                                            : "text-emerald-700",
                                        )}
                                      />
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

                      {/* Future Dates Dropdown */}
                      {selectedPrerecordShowId ? (
                        (() => {
                          const show = shows.find(
                            (s) => s.id === selectedPrerecordShowId,
                          );
                          if (!show) return null;
                          const occurrences = getFutureDatesForShow(
                            show.day,
                            show.startHour,
                            show.startMinute,
                          );
                          return (
                            <div className="flex flex-col space-y-1 text-left pt-0.5 shrink-0">
                              <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 select-none">
                                Choose Air Date
                              </label>
                              <select
                                ref={dateSelectRef}
                                value={prerecordDateInput}
                                onChange={(e) =>
                                  setPrerecordDateInput(e.target.value)
                                }
                                className={cn(
                                  "w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold text-slate-800 outline-none transition-all cursor-pointer shadow-xs",
                                  colors.focusRing,
                                )}
                              >
                                {occurrences.map((date, index) => {
                                  const dateStr = format(date, "yyyy-MM-dd");
                                  const friendlyStr = format(
                                    date,
                                    "EEEE, MMM d, yyyy",
                                  );
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

                      {/* Select from schedule option */}
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
                    onClick={onClose}
                    className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider rounded border border-slate-300 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  {(prerecordSelectorMode === "manual" ||
                    selectedPrerecordShowId) && (
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
      )}
    </AnimatePresence>
  );
};
