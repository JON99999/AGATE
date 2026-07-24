/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum InterstitialType {
  ONE_TIME = 'one-time',
  BASIC_HOURLY = 'basic-hourly',
  ADVANCED = 'advanced',
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
  metadata: InterstitialMetadata;
  duration?: string;
  assetType?: 'audio' | 'script';
  approximateReadTime?: string;
}

export interface LogEntry {
  timestamp: string;
  interstitialTime?: string;
  mp3Name: string;
  interstitialName: string;
  interstitialId: string;
  status: 'played' | 'skipped' | 'failed';
  playMode?: 'Live' | 'Prerecord' | 'Export';
  logTimeStamp?: string;
  assetType?: 'audio' | 'script';
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

