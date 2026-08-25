let queue: Promise<unknown> = Promise.resolve();

/**
 * Serializes exclusive operations (batch runs, council decisions) so they can
 * never interleave on the shared SQLite database, regardless of caller.
 */
export function withExclusiveLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const result = queue.then(fn);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
