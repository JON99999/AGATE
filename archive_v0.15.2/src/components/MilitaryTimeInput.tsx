/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { cn, formatTime12, parseTo24HourTime } from '../lib/utils';

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
  placeholder = 'hh:mm AM',
  disabled,
}: MilitaryTimeInputProps) {
  const [localVal, setLocalVal] = useState(value ? formatTime12(value) : '');

  useEffect(() => {
    setLocalVal(value ? formatTime12(value) : '');
  }, [value]);

  const commitValue = () => {
    const trimmed = localVal.trim();
    if (!trimmed) {
      setLocalVal('');
      onChange('');
      return;
    }

    const parsed24 = parseTo24HourTime(trimmed);
    if (parsed24) {
      const formatted12 = formatTime12(parsed24);
      setLocalVal(formatted12);
      onChange(parsed24);
    } else {
      // If invalid, revert back to previous formatted value or clear
      if (value) {
        setLocalVal(formatTime12(value));
      } else {
        setLocalVal('');
        onChange('');
      }
    }
  };

  const handleBlur = () => {
    commitValue();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="flex items-center shrink-0">
      <input
        type="text"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={10}
        disabled={disabled}
        className={cn(
          'w-[84px] font-mono text-center text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded px-1 py-0.5 outline-none shadow-none focus:ring-0 focus:border-b-2 focus:border-blue-500',
          className
        )}
      />
    </div>
  );
}

export const TimeInput = MilitaryTimeInput;
export default MilitaryTimeInput;
