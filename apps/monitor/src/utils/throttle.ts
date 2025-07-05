/**
 * Throttle function that limits how often a function can be called
 * @param func Function to throttle
 * @param delay Minimum time between calls in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    
    if (now - lastCall >= delay) {
      // Enough time has passed, execute immediately
      lastCall = now;
      func(...args);
    } else {
      // Not enough time has passed, schedule for later
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func(...args);
        timeoutId = null;
      }, delay - (now - lastCall));
    }
  };
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