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
export declare const TimestampUtil: {
    readonly now: () => Timestamp;
    readonly fromDate: (date: Date) => Timestamp;
    readonly fromISO: (iso: string) => Timestamp;
    readonly fromSeconds: (seconds: number) => Timestamp;
    readonly toISO: (ts: Timestamp) => string;
    readonly toDate: (ts: Timestamp) => Date;
    readonly toSeconds: (ts: Timestamp) => number;
    readonly isBefore: (a: Timestamp, b: Timestamp) => boolean;
    readonly isAfter: (a: Timestamp, b: Timestamp) => boolean;
    readonly isEqual: (a: Timestamp, b: Timestamp) => boolean;
    readonly isBetween: (ts: Timestamp, start: Timestamp, end: Timestamp) => boolean;
    readonly addMilliseconds: (ts: Timestamp, ms: number) => Timestamp;
    readonly addSeconds: (ts: Timestamp, seconds: number) => Timestamp;
    readonly addMinutes: (ts: Timestamp, minutes: number) => Timestamp;
    readonly addHours: (ts: Timestamp, hours: number) => Timestamp;
    readonly addDays: (ts: Timestamp, days: number) => Timestamp;
    readonly diffMilliseconds: (a: Timestamp, b: Timestamp) => number;
    readonly diffSeconds: (a: Timestamp, b: Timestamp) => number;
    readonly diffMinutes: (a: Timestamp, b: Timestamp) => number;
    readonly diffHours: (a: Timestamp, b: Timestamp) => number;
    readonly diffDays: (a: Timestamp, b: Timestamp) => number;
    readonly isValid: (value: unknown) => value is Timestamp;
    readonly parse: (value: unknown) => Timestamp;
    readonly format: (ts: Timestamp, locale?: string) => string;
    readonly formatRelative: (ts: Timestamp) => string;
};
export type { Timestamp } from '../types/timestamp';
//# sourceMappingURL=timestamp.d.ts.map