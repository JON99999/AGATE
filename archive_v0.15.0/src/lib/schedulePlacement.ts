/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeGatedMp3 } from '../types';
import {
  formatToDatetimeLocal,
  getCurrentDatetimeLocal,
  getDatePart,
  getTimePart,
  sortMp3sByStartDate,
  getFilenameFromUrlOrPath,
  isContiguousMidnightTransition,
  computeBackfilledEndTime,
  getNextGapAutoFillStart,
} from './utils';

export interface SchedulePresetOption {
  id: string;
  label: string;
  subLabel?: string;
  displayStartDate?: string;
  displayStartTime?: string;
  displayEndDate?: string;
  displayEndTime?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  suggestedStartDate?: string;
  suggestedStartTime?: string;
  transitionMp3Id?: string;
  transitionMp3Index?: number;
  referenceStartDate?: string;
  isLeadingGap?: boolean;
}

export interface InterstitialPlacementModalState {
  pendingFile?: { name: string; duration?: string | number; path?: string };
  inferredAssetType?: 'audio' | 'script';
  nextIndex: number;
  presets: SchedulePresetOption[];
  selectedPresetId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  transitionMp3Id?: string;
  transitionMp3Index?: number;
}

export function computeSchedulePlacementOptions(
  current: TimeGatedMp3[],
  profileStartDate?: string,
  profileEndDate?: string,
  nowIso: string = getCurrentDatetimeLocal()
): { presets: SchedulePresetOption[]; sorted: TimeGatedMp3[]; hasLeadingGap: boolean } {
  const sorted = sortMp3sByStartDate(current);
  const presets: SchedulePresetOption[] = [];

  const nowDate = getDatePart(nowIso);
  const nowTime = getTimePart(nowIso) || '00:00';

  const getItemTitle = (m?: TimeGatedMp3) => {
    if (!m) return 'File';
    if (m.mp3Url) return getFilenameFromUrlOrPath(m.mp3Url);
    return 'File';
  };

  // 1. Check for leading gap from now() to first forward-looking startDate
  const firstForwardItem = sorted.find(m => m.startDate && formatToDatetimeLocal(m.startDate) > nowIso);
  const activeCurrentItem = sorted.find(m => {
    const s = m.startDate ? formatToDatetimeLocal(m.startDate) : '';
    const e = m.endDate ? formatToDatetimeLocal(m.endDate) : '';
    if (s && s <= nowIso) {
      if (!e || e > nowIso) return true;
    }
    return false;
  });

  let hasLeadingGap = false;
  if (firstForwardItem && (!activeCurrentItem || sorted.indexOf(firstForwardItem) === 0)) {
    const fIdx = sorted.indexOf(firstForwardItem) + 1;
    const fTitle = getItemTitle(firstForwardItem);
    const fStart = formatToDatetimeLocal(firstForwardItem.startDate);
    const backfillEnd = computeBackfilledEndTime(fStart);
    const fEndDate = getDatePart(backfillEnd);
    const fEndTime = getTimePart(backfillEnd) || '00:00';

    hasLeadingGap = true;

    presets.push({
      id: 'leading-gap',
      label: `Before #${fIdx} ${fTitle}`,
      displayStartDate: nowDate,
      displayStartTime: nowTime,
      displayEndDate: fEndDate,
      displayEndTime: fEndTime,
      startDate: nowDate,
      startTime: nowTime,
      endDate: fEndDate,
      endTime: fEndTime,
      isLeadingGap: true,
    });
  }

  // 2. Any subsequent gaps between interstitials
  for (let i = 0; i < sorted.length - 1; i++) {
    const item = sorted[i];
    const nextItem = sorted[i + 1];
    if (item.endDate && item.endDate.trim() && nextItem.startDate && nextItem.startDate.trim()) {
      const itemEnd = formatToDatetimeLocal(item.endDate);
      const nextStart = formatToDatetimeLocal(nextItem.startDate);
      if (itemEnd < nextStart && !isContiguousMidnightTransition(itemEnd, nextStart)) {
        const titleA = getItemTitle(item);
        const titleB = getItemTitle(nextItem);
        const autoFillStart = getNextGapAutoFillStart(itemEnd);
        const autoFillEnd = computeBackfilledEndTime(nextStart);
        presets.push({
          id: `gap-${i}`,
          label: `Between #${i + 1} ${titleA} and #${i + 2} ${titleB}`,
          displayStartDate: autoFillStart.startDate,
          displayStartTime: autoFillStart.startTime,
          displayEndDate: getDatePart(autoFillEnd),
          displayEndTime: getTimePart(autoFillEnd) || '00:00',
          startDate: autoFillStart.startDate,
          startTime: autoFillStart.startTime,
          endDate: getDatePart(autoFillEnd),
          endTime: getTimePart(autoFillEnd) || '00:00',
        });
      }
    }
  }

  // 3. Trailing Option (after the last item)
  const lastItem = sorted[sorted.length - 1];
  if (lastItem) {
    const lastIdx = sorted.length;
    const lastTitle = getItemTitle(lastItem);
    if (lastItem.endDate && lastItem.endDate.trim()) {
      const lastEnd = formatToDatetimeLocal(lastItem.endDate);
      const autoFillStart = getNextGapAutoFillStart(lastEnd);
      const profEnd = profileEndDate ? formatToDatetimeLocal(profileEndDate) : '';
      const autoFillProfEnd = profEnd ? computeBackfilledEndTime(profEnd) : '';
      presets.push({
        id: 'trailing-end',
        label: `After #${lastIdx} ${lastTitle}`,
        displayStartDate: autoFillStart.startDate,
        displayStartTime: autoFillStart.startTime,
        displayEndDate: autoFillProfEnd ? getDatePart(autoFillProfEnd) : '',
        displayEndTime: autoFillProfEnd ? (getTimePart(autoFillProfEnd) || '00:00') : '',
        startDate: autoFillStart.startDate,
        startTime: autoFillStart.startTime,
        endDate: autoFillProfEnd ? getDatePart(autoFillProfEnd) : '',
        endTime: autoFillProfEnd ? (getTimePart(autoFillProfEnd) || '00:00') : '',
      });
    } else {
      // Open-ended last item -> 1 week forward transition option
      const lastFormatted = lastItem.startDate
        ? formatToDatetimeLocal(lastItem.startDate)
        : (profileStartDate ? formatToDatetimeLocal(profileStartDate) : '');
      const lastSetTime = lastFormatted ? (getTimePart(lastFormatted) || '00:00') : '00:00';
      const lastSetDate = lastFormatted ? getDatePart(lastFormatted) : nowDate;

      const pad = (n: number) => String(n).padStart(2, '0');
      let suggestedDate = nowDate;
      if (lastSetDate) {
        const [y, m, d] = lastSetDate.split('-').map(Number);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          const baseDate = new Date(y, m - 1, d);
          baseDate.setDate(baseDate.getDate() + 7);
          suggestedDate = `${baseDate.getFullYear()}-${pad(baseDate.getMonth() + 1)}-${pad(baseDate.getDate())}`;
        }
      }
      const suggestedTime = lastSetTime;

      presets.push({
        id: 'trailing-1week',
        label: `After #${lastIdx} ${lastTitle}`,
        displayStartDate: lastSetDate,
        displayStartTime: lastSetTime,
        startDate: suggestedDate,
        startTime: suggestedTime,
        suggestedStartDate: suggestedDate,
        suggestedStartTime: suggestedTime,
        endDate: '',
        endTime: '',
        transitionMp3Id: lastItem.id,
        transitionMp3Index: lastIdx,
        referenceStartDate: lastFormatted || `${nowDate}T${nowTime}`,
      });
    }
  }

  // 4. "Enter My Own" option
  presets.push({
    id: 'custom',
    label: 'Enter My Own',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
  });

  return { presets, sorted, hasLeadingGap };
}

export function cleanNameShort(val: string): string {
  let cleaned = val.replace(/[^a-zA-Z0-9_]/g, '_');
  cleaned = cleaned.replace(/_+/g, '_');
  cleaned = cleaned.replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 24);
}

export function addSoftHyphensForFirstLine(text: string, maxCharIndex: number = 15): string {
  if (!text) return '';
  let count = 0;
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    result += char;
    if (char !== ' ') {
      count++;
      if (count < maxCharIndex && i < text.length - 1 && text[i + 1] !== ' ') {
        result += '\u00AD';
      }
    }
  }
  return result;
}
