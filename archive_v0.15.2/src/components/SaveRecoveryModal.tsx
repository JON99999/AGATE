import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, RotateCcw, FolderCog, ArrowLeft, CheckCircle2, Loader2, HardDrive } from 'lucide-react';
import { cn } from '../lib/utils';

export interface SaveRecoveryInfo {
  title: string;
  targetName: string;
  filePath?: string;
  error: string;
  code?: string;
  retryAction: () => Promise<void>;
  onFixFolder?: () => void;
  onDismiss?: () => void;
}

interface SaveRecoveryModalProps {
  recoveryInfo: SaveRecoveryInfo | null;
  onClose: () => void;
}

export function SaveRecoveryModal({ recoveryInfo, onClose }: SaveRecoveryModalProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retrySuccess, setRetrySuccess] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (!recoveryInfo) return null;

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryError(null);
    try {
      await recoveryInfo.retryAction();
      setRetrySuccess(true);
      setTimeout(() => {
        setIsRetrying(false);
        setRetrySuccess(false);
        onClose();
      }, 1000);
    } catch (err: any) {
      setIsRetrying(false);
      setRetryError(err.message || 'Retry attempt failed.');
    }
  };

  const handleFixFolder = () => {
    if (recoveryInfo.onFixFolder) {
      recoveryInfo.onFixFolder();
    }
    onClose();
  };

  const handleDismiss = () => {
    if (recoveryInfo.onDismiss) {
      recoveryInfo.onDismiss();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white border border-red-200 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-4 bg-red-50 border-b border-red-100 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  {recoveryInfo.title || 'File Save Error'}
                </h3>
                <span className="px-2 py-0.5 bg-red-200/70 text-red-800 text-[10px] font-mono font-bold rounded">
                  {recoveryInfo.targetName}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                The atomic file write operation could not complete. Your in-memory modifications are intact and have not been discarded.
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 text-xs text-slate-700">
            {/* Error detail */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                System Error Message
              </span>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-red-700 break-words leading-relaxed">
                {retryError || recoveryInfo.error}
              </div>
            </div>

            {/* Target Path */}
            {recoveryInfo.filePath && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider block flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                  <span>Target Destination</span>
                </span>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700 truncate">
                  {recoveryInfo.filePath}
                </div>
              </div>
            )}

            {/* Explanation / Suggestions */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-800 space-y-1">
              <span className="font-bold text-amber-900 block">Suggested Recovery Options:</span>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                <li>Click <strong>Retry Save</strong> if the destination disk or network location was temporarily busy.</li>
                <li>Click <strong>Storage Settings</strong> to verify folder paths or repair permissions.</li>
                <li>Click <strong>Return to Editor</strong> to continue editing without losing memory state.</li>
              </ul>
            </div>

            {retrySuccess && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold">File write completed successfully!</span>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              disabled={isRetrying}
              className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Editor</span>
            </button>

            <div className="flex items-center gap-2">
              {recoveryInfo.onFixFolder && (
                <button
                  type="button"
                  onClick={handleFixFolder}
                  disabled={isRetrying}
                  className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 border border-slate-300 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <FolderCog className="w-3.5 h-3.5" />
                  <span>Storage Settings</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className={cn(
                  "px-4 py-2 text-white rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer disabled:opacity-50",
                  retrySuccess
                    ? "bg-emerald-600 border border-emerald-700"
                    : "bg-blue-600 hover:bg-blue-700 border border-blue-700"
                )}
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Writing...</span>
                  </>
                ) : retrySuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
