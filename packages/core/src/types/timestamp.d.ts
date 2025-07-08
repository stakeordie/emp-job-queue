/**
 * Single timestamp type used throughout the application
 * Always stored as milliseconds since Unix epoch (number)
 * Only converted to ISO strings at API boundaries
 *
 * Benefits:
 * - Direct comparisons: if (a < b) works
 * - Simple math: age = now - created_at
 * - Redis compatible: stores as numbers
 * - No parsing overhead internally
 */
export type Timestamp = number;
//# sourceMappingURL=timestamp.d.ts.map