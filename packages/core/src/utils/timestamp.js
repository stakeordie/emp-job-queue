/**
 * Timestamp utilities for consistent time handling across the application
 *
 * All timestamps are stored internally as numbers (milliseconds since epoch)
 * Conversion to/from ISO strings only happens at API boundaries
 */
/**
 * Timestamp utility functions
 */
export const TimestampUtil = {
    // Creation
    now: () => Date.now(),
    fromDate: (date) => date.getTime(),
    fromISO: (iso) => new Date(iso).getTime(),
    fromSeconds: (seconds) => seconds * 1000,
    // Conversion (only for external APIs/display)
    toISO: (ts) => new Date(ts).toISOString(),
    toDate: (ts) => new Date(ts),
    toSeconds: (ts) => Math.floor(ts / 1000),
    // Comparison (simple number comparison!)
    isBefore: (a, b) => a < b,
    isAfter: (a, b) => a > b,
    isEqual: (a, b) => a === b,
    isBetween: (ts, start, end) => ts >= start && ts <= end,
    // Math operations (simple arithmetic!)
    addMilliseconds: (ts, ms) => ts + ms,
    addSeconds: (ts, seconds) => ts + seconds * 1000,
    addMinutes: (ts, minutes) => ts + minutes * 60 * 1000,
    addHours: (ts, hours) => ts + hours * 60 * 60 * 1000,
    addDays: (ts, days) => ts + days * 24 * 60 * 60 * 1000,
    // Differences
    diffMilliseconds: (a, b) => a - b,
    diffSeconds: (a, b) => Math.floor((a - b) / 1000),
    diffMinutes: (a, b) => Math.floor((a - b) / (60 * 1000)),
    diffHours: (a, b) => Math.floor((a - b) / (60 * 60 * 1000)),
    diffDays: (a, b) => Math.floor((a - b) / (24 * 60 * 60 * 1000)),
    // Validation
    isValid: (value) => typeof value === 'number' && value > 0 && value < 253402300800000, // Max date
    // Parsing with validation
    parse: (value) => {
        if (typeof value === 'number' && TimestampUtil.isValid(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const ts = new Date(value).getTime();
            if (!isNaN(ts))
                return ts;
        }
        if (value instanceof Date) {
            return value.getTime();
        }
        throw new Error(`Cannot parse timestamp from ${typeof value}: ${value}`);
    },
    // Formatting for display (only at UI boundary)
    format: (ts, locale = 'en-US') => new Date(ts).toLocaleString(locale),
    formatRelative: (ts) => {
        const diff = Date.now() - ts;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0)
            return `${days}d ago`;
        if (hours > 0)
            return `${hours}h ago`;
        if (minutes > 0)
            return `${minutes}m ago`;
        if (seconds > 0)
            return `${seconds}s ago`;
        return 'just now';
    },
};
//# sourceMappingURL=timestamp.js.map