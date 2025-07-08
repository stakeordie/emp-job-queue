/**
 * Timestamp utilities for consistent time handling across the application
 *
 * All timestamps are stored internally as numbers (milliseconds since epoch)
 * Conversion to/from ISO strings only happens at API boundaries
 */

import { Timestamp } from '../types/timestamp';

/**
 * Timestamp utility functions
 */
export const TimestampUtil = {
  // Creation
  now: (): Timestamp => Date.now(),
  fromDate: (date: Date): Timestamp => date.getTime(),
  fromISO: (iso: string): Timestamp => new Date(iso).getTime(),
  fromSeconds: (seconds: number): Timestamp => seconds * 1000,

  // Conversion (only for external APIs/display)
  toISO: (ts: Timestamp): string => new Date(ts).toISOString(),
  toDate: (ts: Timestamp): Date => new Date(ts),
  toSeconds: (ts: Timestamp): number => Math.floor(ts / 1000),

  // Comparison (simple number comparison!)
  isBefore: (a: Timestamp, b: Timestamp): boolean => a < b,
  isAfter: (a: Timestamp, b: Timestamp): boolean => a > b,
  isEqual: (a: Timestamp, b: Timestamp): boolean => a === b,
  isBetween: (ts: Timestamp, start: Timestamp, end: Timestamp): boolean => ts >= start && ts <= end,

  // Math operations (simple arithmetic!)
  addMilliseconds: (ts: Timestamp, ms: number): Timestamp => ts + ms,
  addSeconds: (ts: Timestamp, seconds: number): Timestamp => ts + seconds * 1000,
  addMinutes: (ts: Timestamp, minutes: number): Timestamp => ts + minutes * 60 * 1000,
  addHours: (ts: Timestamp, hours: number): Timestamp => ts + hours * 60 * 60 * 1000,
  addDays: (ts: Timestamp, days: number): Timestamp => ts + days * 24 * 60 * 60 * 1000,

  // Differences
  diffMilliseconds: (a: Timestamp, b: Timestamp): number => a - b,
  diffSeconds: (a: Timestamp, b: Timestamp): number => Math.floor((a - b) / 1000),
  diffMinutes: (a: Timestamp, b: Timestamp): number => Math.floor((a - b) / (60 * 1000)),
  diffHours: (a: Timestamp, b: Timestamp): number => Math.floor((a - b) / (60 * 60 * 1000)),
  diffDays: (a: Timestamp, b: Timestamp): number => Math.floor((a - b) / (24 * 60 * 60 * 1000)),

  // Validation
  isValid: (value: unknown): value is Timestamp =>
    typeof value === 'number' && value > 0 && value < 253402300800000, // Max date

  // Parsing with validation
  parse: (value: unknown): Timestamp => {
    if (typeof value === 'number' && TimestampUtil.isValid(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const ts = new Date(value).getTime();
      if (!isNaN(ts)) return ts;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    throw new Error(`Cannot parse timestamp from ${typeof value}: ${value}`);
  },

  // Formatting for display (only at UI boundary)
  format: (ts: Timestamp, locale = 'en-US'): string => new Date(ts).toLocaleString(locale),
  formatRelative: (ts: Timestamp): string => {
    const diff = Date.now() - ts;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (seconds > 0) return `${seconds}s ago`;
    return 'just now';
  },
} as const;

// Re-export type for convenience
export type { Timestamp } from '../types/timestamp';
