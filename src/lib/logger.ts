import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  transport: isDev ? { target: "pino/file", options: { destination: 1 } } : undefined,
  base: { service: "reviveai" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with a module tag.
 *
 * @example
 * const log = childLogger("batch/service");
 * log.info({ recordCount: 150 }, "Batch processing started");
 */
export function childLogger(module: string) {
  return logger.child({ module });
}
