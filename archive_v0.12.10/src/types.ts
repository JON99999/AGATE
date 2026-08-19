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
  duration?: string;
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
  mp3Url: string;
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
  duration?: string;
  assetType?: 'audio' | 'script';
  approximateReadTime?: string;
  backupMp3Url?: string;
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

