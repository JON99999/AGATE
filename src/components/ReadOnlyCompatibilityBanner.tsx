import React from 'react';
import { Lock, AlertCircle } from 'lucide-react';

interface ReadOnlyCompatibilityBannerProps {
  isVisible: boolean;
  reason?: string;
}

export const ReadOnlyCompatibilityBanner: React.FC<ReadOnlyCompatibilityBannerProps> = ({
  isVisible,
  reason
}) => {
  if (!isVisible) return null;

  return (
    <div className="w-full bg-amber-500/15 border-b border-amber-500/40 px-4 py-2 flex items-center justify-between text-xs text-amber-200 z-40 transition-all">
      <div className="flex items-center gap-2.5 mx-auto text-center font-medium">
        <span className="inline-flex items-center gap-1 bg-amber-500 text-slate-950 font-black px-2 py-0.5 rounded text-[10px] tracking-wide uppercase">
          <Lock className="w-3 h-3" />
          READ-ONLY MODE
        </span>
        <span className="text-amber-100">
          Station data is locked. No changes or play logs will be saved in this session.  Please see the Admin to upgrade AMP.
        </span>
      </div>
    </div>
  );
};
