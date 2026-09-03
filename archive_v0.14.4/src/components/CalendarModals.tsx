import React from 'react';
import { Trash2, AlertCircle, RefreshCw, Calendar, User, FileText } from 'lucide-react';
import { Show, Interstitial } from '../types';
import { cn } from '../lib/utils';
import { InterstitialConflict, ShowConflict } from './CalendarTab';

interface DeleteInterstitialModalProps {
  isOpen: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteInterstitialModal({
  isOpen,
  isSaving,
  onCancel,
  onConfirm,
}: DeleteInterstitialModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
        <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-3">
          <div className="bg-red-600 p-2 rounded">
            <Trash2 className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-xs font-black text-red-800 uppercase tracking-widest">
            Delete Interstitial?
          </h3>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-650 font-bold leading-relaxed">
            This will permanently remove the interstitial. If you want to keep it, but suspend it, cancel the delete and instead choose "suspend".
          </p>
        </div>
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onCancel}
            className="px-4 py-2 border border-slate-200 rounded text-xs font-black text-slate-500 hover:bg-slate-100 uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-red-100 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSaving && <RefreshCw className="w-3 h-3 animate-spin" />}
            <span>{isSaving ? "Deleting..." : "I understand, delete"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface CancelUnsavedModalProps {
  isOpen: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}

export function CancelUnsavedModal({
  isOpen,
  onKeepEditing,
  onDiscard,
}: CancelUnsavedModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
        <div className="p-4 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
          <div className="bg-amber-600 p-2 rounded shrink-0">
            <AlertCircle className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-xs font-black text-amber-900 uppercase tracking-widest leading-none">
              Discard Unsaved Changes?
            </h3>
            <p className="text-[10px] font-bold text-amber-700 mt-1 uppercase tracking-tight">
              Unsaved modifications detected
            </p>
          </div>
        </div>
        <div className="p-5 space-y-3 text-xs font-bold text-slate-600">
          <p className="leading-relaxed">
            You have unsaved changes in this interstitial window.
          </p>
          <p className="text-[11px] text-slate-500 font-medium leading-normal bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            Canceling now will discard all your changes, including any modified dates, scheduling rules, and newly configured time-gated MP3 items.
          </p>
        </div>
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onKeepEditing}
            className="px-4 py-2 border border-slate-300 rounded text-xs font-black text-slate-600 hover:bg-slate-100 uppercase tracking-widest transition-all cursor-pointer bg-white"
          >
            Keep Editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-amber-100 cursor-pointer"
          >
            Discard & Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface InterstitialConflictModalProps {
  pendingSaveInterstitial: { updatedList: Interstitial[]; conflicts: InterstitialConflict[] } | null;
  isSaving: boolean;
  onContinueEditing: () => void;
  onSaveAnyway: () => void;
}

export function InterstitialConflictModal({
  pendingSaveInterstitial,
  isSaving,
  onContinueEditing,
  onSaveAnyway,
}: InterstitialConflictModalProps) {
  if (!pendingSaveInterstitial) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[110] animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 border border-slate-200 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 text-amber-700 rounded-full shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Interstitial Conflict Detected</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              The changes you are saving introduce the following start-time conflict(s):
            </p>
          </div>
        </div>

        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs italic text-amber-900 space-y-1.5 max-h-40 overflow-y-auto">
          {pendingSaveInterstitial.conflicts.map((c, idx) => (
            <div key={idx} className="flex items-start gap-1.5">
              <span className="shrink-0 font-bold not-italic">•</span>
              <span>{c.message}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-600 font-medium">
          Are you sure you want to save this interstitial with the conflict?
        </p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={isSaving}
            onClick={onContinueEditing}
            className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            Continue Editing
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onSaveAnyway}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSaving && <RefreshCw className="w-3 h-3 animate-spin" />}
            <span>{isSaving ? "Saving..." : "Save Anyway"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface ShowOverlapModalProps {
  pendingSaveShow: { updatedList: Show[]; conflicts: ShowConflict[] } | null;
  isSaving: boolean;
  onContinueEditing: () => void;
  onSaveAnyway: () => void;
}

export function ShowOverlapModal({
  pendingSaveShow,
  isSaving,
  onContinueEditing,
  onSaveAnyway,
}: ShowOverlapModalProps) {
  if (!pendingSaveShow) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[110] animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 border border-slate-200 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 text-amber-700 rounded-full shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Show Overlap Detected</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              The show you are saving overlaps with existing show(s):
            </p>
          </div>
        </div>

        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs italic text-amber-900 space-y-1.5 max-h-40 overflow-y-auto">
          {pendingSaveShow.conflicts.map((c, idx) => (
            <div key={idx} className="flex items-start gap-1.5">
              <span className="shrink-0 font-bold not-italic">•</span>
              <span>{c.message}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-600 font-medium">
          Are you sure you want to save this show with the overlap?
        </p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={isSaving}
            onClick={onContinueEditing}
            className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            Continue Editing
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onSaveAnyway}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSaving && <RefreshCw className="w-3 h-3 animate-spin" />}
            <span>{isSaving ? "Saving..." : "Save Anyway"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface ShowDetailsModalProps {
  show: Show | null;
  onClose: () => void;
  onEditShow: (show: Show) => void;
}

export function ShowDetailsModal({
  show,
  onClose,
  onEditShow,
}: ShowDetailsModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[90]">
      <div className="bg-white rounded-xl border border-slate-250 shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
        <div className="p-4 bg-slate-50 border-b border-slate-155 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-tighter">Show Details</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold text-base leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <span className="text-xs font-black font-mono text-slate-350 uppercase block tracking-widest leading-none mb-1">ID: {show.id}</span>
            <p className="text-base font-black text-slate-800 leading-tight tracking-tight">{show.name}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3 text-xs">
            <div>
              <span className="text-slate-400 uppercase font-bold block mb-0.5 text-xs">Short Name</span>
              <span className="font-bold text-slate-700 uppercase font-mono">
                {show.nameShort}
              </span>
            </div>
            <div>
              <span className="text-slate-400 uppercase font-bold block mb-0.5 text-xs">Status</span>
              <span className={cn("font-bold", show.active ? "text-green-600" : "text-slate-400")}>
                {show.active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="col-span-2 border-t border-slate-200/50 pt-2">
              <span className="text-slate-400 uppercase font-bold block mb-0.5 text-xs">Interstitial Timing</span>
              <span className="font-bold text-slate-755 block font-mono">
                {show.day} at {show.startHour.toString().padStart(2, '0')}:{show.startMinute?.toString().padStart(2, '0') || '00'}
              </span>
            </div>
            <div className="col-span-2 border-t border-slate-200/50 pt-2">
              <span className="text-slate-400 uppercase font-bold block mb-0.5 text-xs">Duration</span>
              <span className="font-bold text-slate-755 block">
                {show.durationHours}h {show.durationMinutes}m
              </span>
            </div>
          </div>

          {show.host && (
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase font-bold block">Host</span>
              <div className="p-2 border border-slate-200 rounded flex items-center gap-2 bg-slate-50/50 text-xs">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-bold text-slate-650">{show.host}</span>
              </div>
            </div>
          )}

          {show.description && (
            <div className="space-y-1">
              <span className="text-xs text-slate-400 uppercase font-bold block">Description</span>
              <div className="p-2 border border-slate-200 rounded bg-slate-50/50 text-xs text-slate-650 font-medium leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                {show.description}
              </div>
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-150 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 text-xs font-black uppercase tracking-tighter cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              const s = show;
              onClose();
              onEditShow(s);
            }}
            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-tighter flex items-center gap-1 cursor-pointer"
          >
            <FileText className="w-3 h-3" />
            <span>Edit Show</span>
          </button>
        </div>
      </div>
    </div>
  );
}
