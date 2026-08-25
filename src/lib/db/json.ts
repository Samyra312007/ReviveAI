export function safeJsonParse<T = unknown>(
  text: string | null | undefined,
  fallback: T,
): T {
  if (text === null || text === undefined || text === "") return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
