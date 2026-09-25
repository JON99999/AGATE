import React, { useState } from 'react';
import { ShieldAlert, Database, ArrowRight, FolderOpen, X } from 'lucide-react';

interface DataUpgradeRequiredModalProps {
  isOpen: boolean;
  onConfirmUpgrade: () => void;
  onCancelOrChangeFolder: () => void;
  schemaVersion?: number;
}

export const DataUpgradeRequiredModal: React.FC<DataUpgradeRequiredModalProps> = ({
  isOpen,
  onConfirmUpgrade,
  onCancelOrChangeFolder,
  schemaVersion = 0
}) => {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border-2 border-amber-500/80 rounded-2xl shadow-2xl shadow-amber-950/40 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-950/80 to-slate-900 border-b border-amber-500/30 px-6 py-5 flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Data Upgrade Required</h2>
            <p className="text-xs font-medium text-amber-400/90 uppercase tracking-wider mt-0.5">
              AMP Station Data Schema v{schemaVersion} Detected
            </p>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5 text-slate-200">
          <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4 text-sm leading-relaxed text-amber-200 font-medium">
            The data in your chosen folder is for an older version of AMP. By continuing, the data will updated to the current version. Any OTHER users of AMP for the same data will need to update to a more modern version. Please see your AMP Admin for additional help.
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-2 text-xs text-slate-300">
            <div className="font-semibold text-slate-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              Automatic Pre-Upgrade Backup:
            </div>
            <p className="text-slate-400 pl-6">
              A timestamped pre-upgrade backup of all announcements and shows will be generated automatically before updating.
            </p>
          </div>

          {/* Explicit Confirmation Checkbox */}
          <label className="flex items-start gap-3 p-3.5 bg-slate-800/80 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors select-none">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-600 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900 bg-slate-700 cursor-pointer"
            />
            <span className="text-xs text-slate-200 font-medium leading-snug">
              I understand that continuing updates this shared station library to the current AMP version.
            </span>
          </label>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-950/80 border-t border-slate-800 px-6 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancelOrChangeFolder}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors flex items-center gap-2"
          >
            <FolderOpen className="w-4 h-4 text-slate-400" />
            Cancel & Choose Different Folder
          </button>

          <button
            type="button"
            disabled={!acknowledged}
            onClick={onConfirmUpgrade}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg ${
              acknowledged
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            <span>Upgrade & Backup Data</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
