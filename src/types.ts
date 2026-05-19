/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ScheduleType {
  ONE_TIME = 'one-time',
  BASIC_HOURLY = 'basic-hourly',
  ADVANCED = 'advanced',
}

export interface ScheduleMetadata {
  createdBy: string;
  createdDate: string;
  lastModifiedBy: string;
  lastModifiedDate: string;
}

export interface Schedule {
  id: string;
  name: string;
  type: ScheduleType;
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
  metadata: ScheduleMetadata;
  duration?: string;
}

export interface LogEntry {
  timestamp: string;
  scheduledTime?: string;
  mp3Name: string;
  scheduleName: string;
  scheduleId: string;
  status: 'played' | 'skipped' | 'failed';
}
