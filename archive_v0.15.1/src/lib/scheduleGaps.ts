import { Interstitial, Show } from '../types';
import {
  formatToDatetimeLocal,
  sortMp3sByStartDate,
  validateTimeGatedMp3s,
  getActiveMp3ForSlot,
  getMP3Status,
  isContiguousMidnightTransition,
} from './utils';

const daysOrderList = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface InterstitialGap {
  interstitialId: string;
  interstitialName: string;
  type: 'leading_gap' | 'coverage_gap' | 'trailing_gap' | 'overlap' | 'missing_media' | 'missing_file';
  typeLabel: string;
  message: string;
  shortNotice: string;
  severity: 'critical' | 'warning';
}

export function getInterstitialGaps(interstitialsList: Interstitial[], now: Date = new Date()): InterstitialGap[] {
  const active = interstitialsList.filter(s => s.enabled !== false);
  const gaps: InterstitialGap[] = [];
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  const nowIso = `${year}-${month}-${day}T${hours}:${mins}`;

  for (const s of active) {
    const timeGated = s.timeGatedMp3s || [];

    if (timeGated.length > 0) {
      const validation = validateTimeGatedMp3s(timeGated, nowIso, s.endDate);
      const sorted = validation.sorted || sortMp3sByStartDate(timeGated);

      // 1. Leading Gap: first item starts in future
      if (sorted.length > 0 && sorted[0].startDate) {
        const firstStart = formatToDatetimeLocal(sorted[0].startDate);
        if (firstStart && firstStart > nowIso) {
          const formattedDate = firstStart.replace('T', ' ');
          gaps.push({
            interstitialId: s.id,
            interstitialName: s.name,
            type: 'leading_gap',
            typeLabel: 'Leading Gap',
            message: `"${s.name}" has no media scheduled until ${formattedDate}`,
            shortNotice: `Leading Gap (starts ${formattedDate})`,
            severity: 'warning'
          });
        }
      }

      // 2. Schedule Gaps between adjacent items
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        const aEnd = a.endDate ? formatToDatetimeLocal(a.endDate) : null;
        const bStart = b.startDate ? formatToDatetimeLocal(b.startDate) : null;

        if (aEnd && bStart && aEnd < bStart && !isContiguousMidnightTransition(aEnd, bStart)) {
          const startFormatted = aEnd.replace('T', ' ');
          const endFormatted = bStart.replace('T', ' ');
          gaps.push({
            interstitialId: s.id,
            interstitialName: s.name,
            type: 'coverage_gap',
            typeLabel: 'Schedule Gap',
            message: `"${s.name}" has a gap between ${startFormatted} and ${endFormatted}`,
            shortNotice: `Schedule Gap (${startFormatted} to ${endFormatted})`,
            severity: 'critical'
          });
        }
      }

      // 3. Trailing Gap: last item has an endDate, but schedule is open-ended or extends beyond
      if (sorted.length > 0) {
        const lastItem = sorted[sorted.length - 1];
        if (lastItem.endDate && lastItem.endDate.trim()) {
          const lastEnd = formatToDatetimeLocal(lastItem.endDate);
          const parentEnd = s.endDate ? formatToDatetimeLocal(s.endDate) : null;
          if (!parentEnd || (parentEnd > lastEnd && !isContiguousMidnightTransition(lastEnd, parentEnd))) {
            const endFormatted = lastEnd.replace('T', ' ');
            gaps.push({
              interstitialId: s.id,
              interstitialName: s.name,
              type: 'trailing_gap',
              typeLabel: 'Trailing Gap',
              message: `"${s.name}" has no media scheduled after ${endFormatted}`,
              shortNotice: `Trailing Gap (ends ${endFormatted})`,
              severity: 'warning'
            });
          }
        }
      }

      // 4. Overlaps
      if (validation.overlapStartIds && validation.overlapStartIds.size > 0) {
        gaps.push({
          interstitialId: s.id,
          interstitialName: s.name,
          type: 'overlap',
          typeLabel: 'Media Overlap',
          message: `"${s.name}" has overlapping media time ranges`,
          shortNotice: 'Media Overlap',
          severity: 'critical'
        });
      }

      // 5. Missing Attachment on a time-gated item
      if (validation.missingFileIds && validation.missingFileIds.size > 0) {
        gaps.push({
          interstitialId: s.id,
          interstitialName: s.name,
          type: 'missing_media',
          typeLabel: 'Missing Media',
          message: `"${s.name}" has time-gated entries without attached files`,
          shortNotice: 'Attachment Missing',
          severity: 'critical'
        });
      }
    } else {
      gaps.push({
        interstitialId: s.id,
        interstitialName: s.name,
        type: 'missing_media',
        typeLabel: 'Missing Media',
        message: `"${s.name}" has no media assigned`,
        shortNotice: 'No Media Assigned',
        severity: 'critical'
      });
    }

    // 6. Active file missing check
    const activeMp3 = getActiveMp3ForSlot(s, now);
    const activeUrl = activeMp3?.mp3Url || '';
    if (activeUrl && activeUrl.trim() !== '') {
      const status = getMP3Status(activeUrl);
      if (!status.exists) {
        gaps.push({
          interstitialId: s.id,
          interstitialName: s.name,
          type: 'missing_file',
          typeLabel: 'Missing File',
          message: `"${s.name}" file "${status.filename || activeUrl}" not found in storage`,
          shortNotice: `File Not Found: ${status.filename || activeUrl}`,
          severity: 'critical'
        });
      }
    }
  }

  return gaps;
}

export interface ShowGap {
  message: string;
}

export function getShowGaps(showsList: Show[]): ShowGap[] {
  const active = showsList.filter(s => s.active !== false);
  if (active.length === 0) {
    return [{ message: 'No active shows scheduled for the entire week' }];
  }

  const intervals: { s: number; e: number }[] = [];
  for (const show of active) {
    const dayIdx = daysOrderList.indexOf(show.day as any);
    if (dayIdx === -1) continue;

    const start = dayIdx * 1440 + (show.startHour || 0) * 60 + (show.startMinute || 0);
    const dur = (show.durationHours || 0) * 60 + (show.durationMinutes || 0);
    if (dur <= 0) continue;

    const end = start + dur;
    if (end <= 10080) {
      intervals.push({ s: start, e: end });
    } else {
      intervals.push({ s: start, e: 10080 });
      intervals.push({ s: 0, e: end - 10080 });
    }
  }

  if (intervals.length === 0) {
    return [{ message: 'No active shows scheduled for the entire week' }];
  }

  intervals.sort((a, b) => a.s - b.s);

  const merged: { s: number; e: number }[] = [];
  for (const interval of intervals) {
    if (merged.length === 0) {
      merged.push({ ...interval });
    } else {
      const last = merged[merged.length - 1];
      if (interval.s <= last.e) {
        last.e = Math.max(last.e, interval.e);
      } else {
        merged.push({ ...interval });
      }
    }
  }

  const formatWeekMin = (min: number) => {
    const norm = (min % 10080 + 10080) % 10080;
    const dIdx = Math.floor(norm / 1440);
    const h = Math.floor((norm % 1440) / 60).toString().padStart(2, '0');
    const m = (norm % 60).toString().padStart(2, '0');
    return { dayName: daysOrderList[dIdx], timeStr: `${h}:${m}`, dIdx };
  };

  const formatGapMessage = (gapStart: number, gapEnd: number) => {
    const startInfo = formatWeekMin(gapStart);
    const endInfo = formatWeekMin(gapEnd);

    if (startInfo.dIdx === endInfo.dIdx && gapStart < gapEnd && (gapEnd - gapStart) < 1440) {
      return `No show scheduled on ${startInfo.dayName} ${startInfo.timeStr}–${endInfo.timeStr}`;
    }
    return `No show scheduled from ${startInfo.dayName} ${startInfo.timeStr} to ${endInfo.dayName} ${endInfo.timeStr}`;
  };

  const gaps: ShowGap[] = [];

  for (let i = 0; i < merged.length - 1; i++) {
    const gStart = merged[i].e;
    const gEnd = merged[i + 1].s;
    if (gEnd > gStart) {
      gaps.push({ message: formatGapMessage(gStart, gEnd) });
    }
  }

  const lastEnd = merged[merged.length - 1].e;
  const firstStart = merged[0].s;

  if (lastEnd < 10080 || firstStart > 0) {
    const totalUncovered = (10080 - lastEnd) + firstStart;
    if (totalUncovered >= 10080) {
      gaps.push({ message: 'No active shows scheduled for the entire week' });
    } else if (totalUncovered > 0) {
      gaps.push({ message: formatGapMessage(lastEnd, firstStart) });
    }
  }

  return gaps;
}
