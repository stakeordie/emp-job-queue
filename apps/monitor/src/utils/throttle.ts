/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Throttle function that limits how often a function can be called
 * @param func Function to throttle
 * @param delay Minimum time between calls in milliseconds
 * @param options Configuration options
 * @returns Throttled function with flush capability
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): ((...args: Parameters<T>) => void) & { flush: () => void } {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;

  const { leading = true, trailing = true } = options;

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    lastArgs = args;

    if (now - lastCall >= delay) {
      // Enough time has passed, execute immediately if leading is enabled
      if (leading) {
        lastCall = now;
        func(...args);
        lastArgs = null;
      } else if (trailing) {
        // Schedule for later if only trailing is enabled
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
          lastCall = Date.now();
          if (lastArgs) {
            func(...lastArgs);
            lastArgs = null;
          }
          timeoutId = null;
        }, delay);
      }
    } else if (trailing) {
      // Not enough time has passed, schedule for later
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(
        () => {
          lastCall = Date.now();
          if (lastArgs) {
            func(...lastArgs);
            lastArgs = null;
          }
          timeoutId = null;
        },
        delay - (now - lastCall)
      );
    }
  };

  throttled.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (lastArgs) {
      func(...lastArgs);
      lastArgs = null;
      lastCall = Date.now();
    }
  };

  return throttled;
}

/**
 * Batch updates to reduce the number of state changes
 * @param callback Function to call with batched updates
 * @param delay Time to wait before processing batch
 * @returns Function to add items to batch
 */
export function batchUpdates<T>(
  callback: (updates: T[]) => void,
  delay: number = 16 // ~60fps
): (update: T) => void {
  let updates: T[] = [];
  let timeoutId: NodeJS.Timeout | null = null;

  return (update: T) => {
    updates.push(update);

    if (!timeoutId) {
      timeoutId = setTimeout(() => {
        const batch = [...updates];
        updates = [];
        timeoutId = null;
        callback(batch);
      }, delay);
    }
  };
}
