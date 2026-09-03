import { Interstitial, InterstitialType, Show, TimeGatedMp3 } from '../types';
import {
  formatToDatetimeLocal,
  getCurrentDatetimeLocal,
  getFilenameFromUrlOrPath,
  getMP3Status,
  formatDuration,
  validateTimeGatedMp3s
} from './utils';
import { driveFileNameCache, availableFilesCache, mp3DurationCache } from './driveService';

export type ScheduleIssueType = 'missing_media' | 'overlap' | 'gap';
export type ScheduleIssueSeverity = 'critical' | 'warning' | 'info';

export interface ScheduleIssue {
  id: string;                      // Unique identifier for this diagnosed issue
  type: ScheduleIssueType;
  severity: ScheduleIssueSeverity;
  timestamp: string;               // ISO 8601 string of the occurrence
  timeLabel: string;               // e.g. "Thu, Aug 20 14:15"
  slotId: string;                  // Composite slot ID: `${interstitialId}_${dayKey}_${hour}`
  dayKey: string;                  // YYYY-MM-DD
  hour: number;                    // 0-23
  minute: number;                  // 0-59
  interstitialId: string;
  interstitialName: string;
  interstitialType: InterstitialType;
  fileName?: string;
  fileStatus?: { exists: boolean; valid: boolean; filename: string };
  durationSeconds?: number;
  offsetSeconds?: number;          // Overlap excess or gap duration in seconds
  description: string;
  suggestedAction?: string;
}

export interface ScheduleDiagnosticsSummary {
  total: number;
  missingMediaCount: number;
  overlapCount: number;
  gapCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

export interface ScheduleDiagnosticsResult {
  scopeStartDate: string;          // ISO string of window start
  scopeEndDate: string;            // ISO string of window end (14 days forward)
  evaluatedAt: string;             // ISO timestamp of evaluation run
  issues: ScheduleIssue[];         // Chronologically ordered list of all detected issues
  issuesBySlotId: Record<string, ScheduleIssue[]>; // O(1) row access by slotId, interstitialId, and composite key
  issuesByDayKey: Record<string, ScheduleIssue[]>; // Grouped by day key "YYYY-MM-DD"
  issuesByHourKey: Record<string, ScheduleIssue[]>; // Grouped by "YYYY-MM-DD_HH"
  summary: ScheduleDiagnosticsSummary;
}

/**
 * Parses duration string (e.g. "01:30", "00:45", "90", "1:15:30") or number into seconds.
 */
export function parseDurationToSeconds(duration?: string | number): number {
  if (duration === undefined || duration === null || duration === '') return 0;
  if (typeof duration === 'number') {
    return isNaN(duration) || duration < 0 ? 0 : duration;
  }
  const clean = String(duration).trim();
  if (!clean) return 0;

  if (clean.includes(':')) {
    const parts = clean.split(':').map(p => parseFloat(p));
    if (parts.some(p => isNaN(p))) return 0;
    if (parts.length === 2) {
      return (parts[0] * 60) + parts[1];
    }
    if (parts.length === 3) {
      return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    }
  }

  const num = parseFloat(clean);
  return isNaN(num) || num < 0 ? 0 : num;
}

/**
 * Resolves effective duration in seconds for an interstitial or specific timeGatedMp3 entry.
 */
export function resolveEffectiveDurationSeconds(
  interstitial: Interstitial,
  activeMp3?: TimeGatedMp3 | null
): number {
  // 1. Check active timeGatedMp3 duration
  if (activeMp3?.duration) {
    const d = parseDurationToSeconds(activeMp3.duration);
    if (d > 0) return d;
  }

  // 2. Check read time if script
  if (activeMp3?.approximateReadTime) {
    const d = parseDurationToSeconds(activeMp3.approximateReadTime);
    if (d > 0) return d;
  }

  // 3. Check cached duration from driveService duration cache or availableFilesCache
  const candidateUrl = activeMp3?.mp3Url;
  if (candidateUrl) {
    const cachedStr = mp3DurationCache.get(candidateUrl);
    if (cachedStr) {
      const d = parseDurationToSeconds(cachedStr);
      if (d > 0) return d;
    }

    const fname = getFilenameFromUrlOrPath(candidateUrl).toLowerCase();
    const driveFile = availableFilesCache.get(fname);
    if (driveFile?.duration) {
      const d = parseDurationToSeconds(driveFile.duration);
      if (d > 0) return d;
    }
  }

  return 0;
}

/**
 * Resolves all TimeGatedMp3 entries that match a specific timestamp for a given interstitial.
 * Returns an array of matching active entries.
 * - If 0 entries match -> returns empty array [] (indicates a schedule gap or no media).
 * - If 1 entry matches -> returns [entry] (normal valid state).
 * - If >1 entries match -> returns [entry1, entry2, ...] (indicates dual-media collision).
 */
export function getMatchingMp3sForSlot(
  interstitial: Interstitial,
  slotDateMs: number,
  localIsoStr: string
): TimeGatedMp3[] {
  const timeGated = interstitial.timeGatedMp3s || [];
  if (timeGated.length === 0) {
    return [];
  }

  const matching: TimeGatedMp3[] = [];

  for (const item of timeGated) {
    const itemStartMs = item.startDate ? new Date(formatToDatetimeLocal(item.startDate)).getTime() : NaN;
    const itemEndMs = item.endDate ? new Date(formatToDatetimeLocal(item.endDate)).getTime() : NaN;

    // Check if slot falls within this card's active window
    const afterStart = isNaN(itemStartMs) || slotDateMs >= itemStartMs;
    const beforeEnd = isNaN(itemEndMs) || slotDateMs <= itemEndMs;

    if (afterStart && beforeEnd) {
      matching.push(item);
    }
  }

  return matching;
}

/**
 * Evaluates whether an interstitial is scheduled on a given Date and Hour.
 */
export function isInterstitialActiveInHour(
  s: Interstitial,
  date: Date,
  hour: number,
  localDateStr: string,
  dayOfWeek: number
): boolean {
  if (s.enabled === false) return false;

  // Check overall date range bounds
  if (s.startDate) {
    const startLocal = formatToDatetimeLocal(s.startDate);
    const slotLocal = `${localDateStr}T${hour.toString().padStart(2, '0')}:${(s.minute || 0).toString().padStart(2, '0')}`;
    if (slotLocal < startLocal) return false;
  }
  if (s.endDate) {
    const endLocal = formatToDatetimeLocal(s.endDate);
    const slotLocal = `${localDateStr}T${hour.toString().padStart(2, '0')}:${(s.minute || 0).toString().padStart(2, '0')}`;
    if (slotLocal > endLocal) return false;
  }

  if (s.type === InterstitialType.ONE_TIME) {
    if (!s.date || !s.time) return false;
    const sHour = parseInt(s.time, 10);
    return s.date === localDateStr && sHour === hour;
  }

  if (s.type === InterstitialType.BASIC_HOURLY) {
    return true;
  }

  if (s.type === InterstitialType.ADVANCED) {
    if (!s.gridRules || s.gridRules.length === 0) return false;
    return s.gridRules.includes(`${dayOfWeek}-${hour}`);
  }

  return false;
}

export interface EvaluateScheduleDiagnosticsParams {
  interstitials: Interstitial[];
  shows?: Show[];
  now?: Date;
  startDate?: Date;
  endDate?: Date;
  lookaheadDays?: number;
  includePastHours?: boolean;
  mediaFiles?: Array<{ name: string; path?: string; size?: string; duration?: string } | any>;
}

/**
 * Pure calculation engine for evaluating schedule anomalies across a date window or visible calendar cells.
 * Iterates through each realized calendar occurrence and audits its exact state.
 */
export function evaluateScheduleDiagnostics({
  interstitials,
  shows = [],
  now = new Date(),
  startDate,
  endDate,
  lookaheadDays = 14,
  includePastHours = false,
  mediaFiles
}: EvaluateScheduleDiagnosticsParams): ScheduleDiagnosticsResult {
  // Synchronously seed file caches if mediaFiles were provided
  if (mediaFiles && mediaFiles.length > 0) {
    mediaFiles.forEach(f => {
      if (f && f.name) {
        availableFilesCache.set(f.name, {
          path: f.path || f.name,
          size: f.size || '0.1 MB',
          duration: f.duration || ''
        });
        if (f.path) {
          driveFileNameCache.set(f.path, f.name);
        }
      }
    });
  }

  const issues: ScheduleIssue[] = [];
  const issuesBySlotId: Record<string, ScheduleIssue[]> = {};
  const issuesByDayKey: Record<string, ScheduleIssue[]> = {};
  const issuesByHourKey: Record<string, ScheduleIssue[]> = {};

  const summary: ScheduleDiagnosticsSummary = {
    total: 0,
    missingMediaCount: 0,
    overlapCount: 0,
    gapCount: 0,
    criticalCount: 0,
    warningCount: 0,
    infoCount: 0
  };

  const addIssue = (issue: ScheduleIssue) => {
    issues.push(issue);

    // Index by unique slotId, interstitialId, and composite keys
    const slotKeys = Array.from(new Set([
      issue.slotId,
      issue.interstitialId,
      `${issue.interstitialId}_${issue.dayKey}`,
      `${issue.interstitialId}_${issue.dayKey}_${issue.hour}`,
      `${issue.dayKey}_${issue.hour}_${issue.minute}`
    ].filter(Boolean)));

    for (const key of slotKeys) {
      if (!issuesBySlotId[key]) {
        issuesBySlotId[key] = [];
      }
      if (!issuesBySlotId[key].some(existing => existing.id === issue.id)) {
        issuesBySlotId[key].push(issue);
      }
    }

    if (!issuesByDayKey[issue.dayKey]) {
      issuesByDayKey[issue.dayKey] = [];
    }
    if (!issuesByDayKey[issue.dayKey].some(existing => existing.id === issue.id)) {
      issuesByDayKey[issue.dayKey].push(issue);
    }

    const hourKey = `${issue.dayKey}_${issue.hour.toString().padStart(2, '0')}`;
    if (!issuesByHourKey[hourKey]) {
      issuesByHourKey[hourKey] = [];
    }
    if (!issuesByHourKey[hourKey].some(existing => existing.id === issue.id)) {
      issuesByHourKey[hourKey].push(issue);
    }

    // Tally summary counts
    summary.total++;
    if (issue.type === 'missing_media') summary.missingMediaCount++;
    else if (issue.type === 'overlap') summary.overlapCount++;
    else if (issue.type === 'gap') summary.gapCount++;

    if (issue.severity === 'critical') summary.criticalCount++;
    else if (issue.severity === 'warning') summary.warningCount++;
    else if (issue.severity === 'info') summary.infoCount++;
  };

  let startDay: Date;
  let totalDays: number;
  let scopeStartIso: string;
  let scopeEndIso: string;

  if (startDate && endDate) {
    startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0);
    const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
    const diffMs = endDay.getTime() - startDay.getTime();
    totalDays = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    scopeStartIso = startDay.toISOString();
    scopeEndIso = endDay.toISOString();
  } else if (startDate) {
    startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0);
    totalDays = lookaheadDays || 14;
    const endDay = new Date(startDay.getTime() + totalDays * 24 * 60 * 60 * 1000);
    scopeStartIso = startDay.toISOString();
    scopeEndIso = endDay.toISOString();
  } else {
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    startDay = defaultStart;
    totalDays = lookaheadDays || 14;
    const endDay = new Date(startDay.getTime() + totalDays * 24 * 60 * 60 * 1000);
    scopeStartIso = startDay.toISOString();
    scopeEndIso = endDay.toISOString();
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const activeInterstitials = interstitials.filter(s => s.enabled !== false);

  // Timeline Slot Analysis: Evaluate each realized instance of an interstitial in the calendar
  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const currentDayDate = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + dayOffset);
    const yyyy = currentDayDate.getFullYear();
    const mm = (currentDayDate.getMonth() + 1).toString().padStart(2, '0');
    const dd = currentDayDate.getDate().toString().padStart(2, '0');
    const dayKey = `${yyyy}-${mm}-${dd}`;
    const dayOfWeek = currentDayDate.getDay();

    const isToday = currentDayDate.getFullYear() === now.getFullYear() &&
                    currentDayDate.getMonth() === now.getMonth() &&
                    currentDayDate.getDate() === now.getDate();

    const startHour = (!includePastHours && isToday && !startDate) ? now.getHours() : 0;

    for (let hour = startHour; hour < 24; hour++) {
      // Find all interstitials scheduled to broadcast in this specific realized calendar slot
      const hourInterstitials = activeInterstitials.filter(s =>
        isInterstitialActiveInHour(s, currentDayDate, hour, dayKey, dayOfWeek)
      ).sort((a, b) => (a.minute || 0) - (b.minute || 0));

      for (const s of hourInterstitials) {
        const minute = s.minute || 0;
        const slotDateTime = new Date(yyyy, currentDayDate.getMonth(), currentDayDate.getDate(), hour, minute, 0, 0);
        const slotMs = slotDateTime.getTime();
        const slotIso = `${dayKey}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const timeLabel = `${dayNames[dayOfWeek]}, ${monthNames[currentDayDate.getMonth()]} ${currentDayDate.getDate()} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const slotId = `${s.id}_${dayKey}_${hour}`;

        const timeGated = s.timeGatedMp3s || [];

        // Check 1: Realized instance has 0 timeGated entries
        if (timeGated.length === 0) {
          addIssue({
            id: `missing_media_${s.id}_${dayKey}_${hour}_${minute}`,
            type: 'missing_media',
            severity: 'critical',
            timestamp: slotDateTime.toISOString(),
            timeLabel,
            slotId,
            dayKey,
            hour,
            minute,
            interstitialId: s.id,
            interstitialName: s.name,
            interstitialType: s.type,
            description: `"${s.name}" has no media assigned at this time.`,
            suggestedAction: 'Edit the interstitial and click "Add Interstitial" to assign an audio or script file.'
          });
          continue;
        }

        // Check 2: Evaluate matching time-gated files specifically for this realized slot instance
        const matchingEntries = getMatchingMp3sForSlot(s, slotMs, slotIso);

        // Case A: Schedule Gap / No file covers this realized slot
        if (matchingEntries.length === 0) {
          // Check if slot is after the last scheduled time-gated item ended
          const sortedEntries = [...timeGated].filter(t => t.endDate).sort((a, b) => {
            const aEnd = a.endDate ? new Date(formatToDatetimeLocal(a.endDate)).getTime() : 0;
            const bEnd = b.endDate ? new Date(formatToDatetimeLocal(b.endDate)).getTime() : 0;
            return bEnd - aEnd;
          });
          const lastEndedItem = sortedEntries[0];
          const lastEndMs = lastEndedItem?.endDate ? new Date(formatToDatetimeLocal(lastEndedItem.endDate)).getTime() : NaN;
          const isPostExpiration = !isNaN(lastEndMs) && slotMs > lastEndMs;

          addIssue({
            id: `gap_${s.id}_${dayKey}_${hour}_${minute}`,
            type: 'gap',
            severity: 'critical',
            timestamp: slotDateTime.toISOString(),
            timeLabel,
            slotId,
            dayKey,
            hour,
            minute,
            interstitialId: s.id,
            interstitialName: s.name,
            interstitialType: s.type,
            description: isPostExpiration
              ? `"${s.name}" has no interstitials scheduled after the last scheduled interstitial.`
              : `"${s.name}" has a gap with no interstitials scheduled at this time.`,
            suggestedAction: isPostExpiration
              ? 'Add a new time-gated item or extend the end date of the last active item to maintain continuous coverage.'
              : 'Add or adjust time-gated start/end dates so this time window is covered.'
          });
          continue;
        }

        // Case B: Dual Media Collision (More than one file is scheduled to play simultaneously for this single interstitial)
        if (matchingEntries.length > 1) {
          const fileNames = matchingEntries.map(m => m.mp3Url ? getFilenameFromUrlOrPath(m.mp3Url) : '(no file)').join(' AND ');
          addIssue({
            id: `overlap_${s.id}_${dayKey}_${hour}_${minute}`,
            type: 'overlap',
            severity: 'critical',
            timestamp: slotDateTime.toISOString(),
            timeLabel,
            slotId,
            dayKey,
            hour,
            minute,
            interstitialId: s.id,
            interstitialName: s.name,
            interstitialType: s.type,
            fileName: matchingEntries[0]?.mp3Url,
            description: `"${s.name}" has an overlap with ${fileNames}.`,
            suggestedAction: 'Adjust transition dates/times so only one file is active at this slot.'
          });
        }

        // Case C: For each active matching file in this slot, verify that the media file is valid and present on disk/Drive
        for (const entry of matchingEntries) {
          if (!entry.mp3Url || entry.mp3Url.trim() === '') {
            addIssue({
              id: `empty_file_${s.id}_${entry.id}_${dayKey}_${hour}_${minute}`,
              type: 'missing_media',
              severity: 'critical',
              timestamp: slotDateTime.toISOString(),
              timeLabel,
              slotId,
              dayKey,
              hour,
              minute,
              interstitialId: s.id,
              interstitialName: s.name,
              interstitialType: s.type,
              description: `"${s.name}" has no media assigned at this time.`,
              suggestedAction: 'Click "Choose" to select an audio or script file.'
            });
            continue;
          }

          const status = getMP3Status(entry.mp3Url);
          const entryIsScript = entry.assetType === 'script' || (entry.mp3Url.toLowerCase().endsWith('.txt') || entry.mp3Url.toLowerCase().endsWith('.pdf'));

          if (!status.exists) {
            addIssue({
              id: `missing_file_${s.id}_${entry.id}_${dayKey}_${hour}_${minute}`,
              type: 'missing_media',
              severity: 'critical',
              timestamp: slotDateTime.toISOString(),
              timeLabel,
              slotId,
              dayKey,
              hour,
              minute,
              interstitialId: s.id,
              interstitialName: s.name,
              interstitialType: s.type,
              fileName: entry.mp3Url,
              fileStatus: status,
              description: `Missing File: "${status.filename || entry.mp3Url}" scheduled for "${s.name}" was not found in storage or media cache.`,
              suggestedAction: 'Upload the missing audio file to your media folder or select an available track.'
            });
          } else if (!entryIsScript && !status.valid) {
            addIssue({
              id: `invalid_file_${s.id}_${entry.id}_${dayKey}_${hour}_${minute}`,
              type: 'missing_media',
              severity: 'warning',
              timestamp: slotDateTime.toISOString(),
              timeLabel,
              slotId,
              dayKey,
              hour,
              minute,
              interstitialId: s.id,
              interstitialName: s.name,
              interstitialType: s.type,
              fileName: entry.mp3Url,
              fileStatus: status,
              description: `File format warning: "${status.filename}" may not be a valid audio file.`,
              suggestedAction: 'Verify audio encoding or re-upload as a standard MP3.'
            });
          }

          // Check backup audio file if script mode
          if (entryIsScript && entry.backupMp3Url) {
            const bUrl = entry.backupMp3Url;
            if (bUrl) {
              const bStatus = getMP3Status(bUrl);
              if (!bStatus.exists) {
                addIssue({
                  id: `missing_backup_${s.id}_${entry.id}_${dayKey}_${hour}_${minute}`,
                  type: 'missing_media',
                  severity: 'warning',
                  timestamp: slotDateTime.toISOString(),
                  timeLabel,
                  slotId,
                  dayKey,
                  hour,
                  minute,
                  interstitialId: s.id,
                  interstitialName: s.name,
                  interstitialType: s.type,
                  fileName: bUrl,
                  fileStatus: bStatus,
                  description: `Missing Backup Audio: "${bStatus.filename || bUrl}" attached to script was not found.`,
                  suggestedAction: 'Upload the backup audio track or clear backup URL if not needed.'
                });
              }
            }
          }
        }
      }
    }
  }

  // Sort flat list chronologically
  issues.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    scopeStartDate: scopeStartIso,
    scopeEndDate: scopeEndIso,
    evaluatedAt: new Date().toISOString(),
    issues,
    issuesBySlotId,
    issuesByDayKey,
    issuesByHourKey,
    summary
  };
}
