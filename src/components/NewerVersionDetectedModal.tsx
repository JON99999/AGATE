import React from 'react';
import { AlertTriangle, Lock, ArrowRight } from 'lucide-react';

interface NewerVersionDetectedModalProps {
  isOpen: boolean;
  minVersion: string;
  onAcknowledge: () => void;
}

export const NewerVersionDetectedModal: React.FC<NewerVersionDetectedModalProps> = ({
  isOpen,
  minVersion,
  onAcknowledge
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-red-500/80 rounded-2xl shadow-2xl shadow-red-950/40 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-950/80 to-slate-900 border-b border-red-500/30 px-6 py-5 flex items-center gap-3">
          <div className="p-2.5 bg-red-500/20 border border-red-500/40 rounded-xl text-red-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Newer Data Version Detected</h2>
            <p className="text-xs font-medium text-red-400/90 uppercase tracking-wider mt-0.5">
              Requires AMP v{minVersion || '0.16.0'}+
            </p>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5 text-slate-200">
          <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 text-sm leading-relaxed text-red-200 font-medium">
            The data in your chosen folder is for a newer version of AMP. Please upgrade to at least v{minVersion || '0.16.0'}. We will attempt to read the old data and run in Read-Only Mode. No logs or updates will be saved in this session.
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex items-center gap-3 text-xs text-slate-300">
            <Lock className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              All scheduled announcements and shows will remain playable, but writing updates to disk or Google Drive is temporarily disabled.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-950/80 border-t border-slate-800 px-6 py-4 flex items-center justify-end">
          <button
            type="button"
            onClick={onAcknowledge}
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <span>Acknowledge & Continue in Read-Only Mode</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
