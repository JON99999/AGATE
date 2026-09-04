/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum InterstitialType {
  ONE_TIME = 'one-time',
  BASIC_HOURLY = 'basic-hourly',
  ADVANCED = 'advanced',
}

export interface TimeGatedMp3 {
  id: string;
  mp3Url: string;
  startDate: string;
  endDate?: string;
  assetType?: 'audio' | 'script';
  duration?: string;
  fileSize?: string;
  backupMp3Url?: string;
  approximateReadTime?: string;
}

export interface InterstitialMetadata {
  createdBy: string;
  createdDate: string;
  lastModifiedBy: string;
  lastModifiedDate: string;
}

export interface Interstitial {
  id: string;
  name: string;
  type: InterstitialType;
  enabled: boolean;
  minute: number; // 0-59
  // For ONE_TIME
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm (24h)
  // For ADVANCED
  days?: number[]; // 0-6 (Sunday-Saturday)
  hours?: number[]; // 0-23
  gridRules?: string[]; // Array of "day-hour" strings, e.g., ["1-10", "1-11"] for Monday 10am and 11am
  // General restrictions
  startDate?: string;
  endDate?: string;
  timeGatedMp3s?: TimeGatedMp3[];
  metadata: InterstitialMetadata;
}

export interface LogEntry {
  timestamp: string;
  interstitialTime?: string;
  mp3Name: string;
  interstitialName: string;
  interstitialId: string;
  status: 'played' | 'skipped' | 'failed' | 'backup play';
  playMode?: 'Live' | 'Prerecord' | 'Export' | 'Playlist';
  logTimeStamp?: string;
  assetType?: 'audio' | 'script';
  showId?: string;
  showName?: string;
  hostName?: string;
  showDateTime?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  durationSeconds?: number;
  durationFormatted?: string;
}

export interface ShowPlaylistLogTrackItem {
  id: string;
  fileName: string;
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  durationSeconds?: number;
  durationFormatted?: string;
  playedAt: string;
  isInterstitial?: boolean;
}

export interface ShowPlaylistLog {
  showId: string;
  showName: string;
  hostName: string;
  showDateTime: string;
  logFileName: string;
  playedTracks: ShowPlaylistLogTrackItem[];
  cancelledTrackIds: string[];
  unplayedTrackIds: string[];
  breakPositions?: Record<string, number>;
  trackMetadata?: Record<string, {
    id: string;
    fileName: string;
    title?: string;
    durationSeconds?: number;
    artist?: string;
    album?: string;
  }>;
}

export interface Show {
  id: string;
  day: 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  startHour: number;
  startMinute: number;
  durationHours: number;
  durationMinutes: number;
  name: string;
  nameShort: string;
  host: string;
  description: string;
  active: boolean;
}

export type ScheduleIssueType = 'missing_media' | 'overlap' | 'gap';
export type ScheduleIssueSeverity = 'critical' | 'warning' | 'info';

export interface ScheduleIssue {
  id: string;
  type: ScheduleIssueType;
  severity: ScheduleIssueSeverity;
  timestamp: string;
  timeLabel: string;
  slotId: string;
  dayKey: string;
  hour: number;
  minute: number;
  interstitialId: string;
  interstitialName: string;
  interstitialType: InterstitialType;
  fileName?: string;
  fileStatus?: { exists: boolean; valid: boolean; filename: string };
  durationSeconds?: number;
  offsetSeconds?: number;
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
  scopeStartDate: string;
  scopeEndDate: string;
  evaluatedAt: string;
  issues: ScheduleIssue[];
  issuesBySlotId: Record<string, ScheduleIssue[]>;
  issuesByDayKey: Record<string, ScheduleIssue[]>;
  issuesByHourKey: Record<string, ScheduleIssue[]>;
  summary: ScheduleDiagnosticsSummary;
}

export interface LocationPathsOverride {
  logs?: string | null;
  loghistory?: string | null;
  settings?: string | null;
  media_announcements?: string | null;
  media_evergreens?: string | null;
  media_shows?: string | null;
  logsFile?: string | null;
  interstitialsFile?: string | null;
  showsFile?: string | null;
}

