type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const fromEnv = import.meta.env.VITE_LOG_LEVEL;
  const fallback = import.meta.env.MODE === "production" ? "warn" : "debug";
  const raw = String(fromEnv ?? fallback)
    .toLowerCase()
    .trim();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return fallback;
}

function shouldLog(level: LogLevel) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[configuredLevel()];
}

function emit(level: LogLevel, message: string, data?: unknown) {
  if (!shouldLog(level)) return;
  const payload = data === undefined ? [message] : [message, data];
  // eslint-disable-next-line no-console -- single gated console sink
  console[level](...payload);
}

/** App-wide logger — prefer this over raw `console.*` so level/sink can change later. */
export const logger = {
  debug: (message: string, data?: unknown) => emit("debug", message, data),
  info: (message: string, data?: unknown) => emit("info", message, data),
  warn: (message: string, data?: unknown) => emit("warn", message, data),
  error: (message: string, data?: unknown) => emit("error", message, data),
};
