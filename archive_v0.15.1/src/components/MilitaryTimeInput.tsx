/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

export interface MilitaryTimeInputProps {
  value: string;
  onChange: (newTime: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function MilitaryTimeInput({
  value,
  onChange,
  className,
  placeholder = 'HH:mm',
  disabled,
}: MilitaryTimeInputProps) {
  const [localVal, setLocalVal] = useState(value || '');

  useEffect(() => {
    setLocalVal(value || '');
  }, [value]);

  const handleBlur = () => {
    const trimmed = localVal.trim();
    if (!trimmed) {
      onChange('');
      return;
    }
    const clean = trimmed.replace(/[^0-9:]/g, '');
    let hh = 0;
    let mm = 0;

    if (clean.includes(':')) {
      const parts = clean.split(':');
      hh = parseInt(parts[0], 10) || 0;
      mm = parseInt(parts[1], 10) || 0;
    } else if (clean.length === 3) {
      hh = parseInt(clean.substring(0, 1), 10) || 0;
      mm = parseInt(clean.substring(1, 3), 10) || 0;
    } else if (clean.length === 4) {
      hh = parseInt(clean.substring(0, 2), 10) || 0;
      mm = parseInt(clean.substring(2, 4), 10) || 0;
    } else {
      hh = parseInt(clean, 10) || 0;
      mm = 0;
    }

    hh = Math.max(0, Math.min(23, hh));
    mm = Math.max(0, Math.min(59, mm));

    const formatted = `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
    setLocalVal(formatted);
    onChange(formatted);
  };

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <input
        type="text"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        maxLength={5}
        disabled={disabled}
        className={cn(className, 'w-[44px] font-mono text-center')}
      />
      <span className="text-[10px] font-mono font-bold text-slate-400 pointer-events-none uppercase tracking-tight select-none shrink-0">
        24h
      </span>
    </div>
  );
}

export default MilitaryTimeInput;
