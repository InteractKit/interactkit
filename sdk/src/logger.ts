/**
 * Structured logger for InteractKit.
 *
 * Outputs JSON lines in production, colored human-readable in development.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',  // gray
  info: '\x1b[36m',   // cyan
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
};
const RESET = '\x1b[0m';

export function createLogger(opts?: { level?: LogLevel; json?: boolean }): Logger {
  const minLevel = LEVELS[opts?.level ?? 'info'];
  const json = opts?.json ?? (process.env.NODE_ENV === 'production');

  function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
    if (LEVELS[level] < minLevel) return;

    if (json) {
      const entry: LogEntry = { level, msg, ts: new Date().toISOString(), ...data };
      process.stderr.write(JSON.stringify(entry) + '\n');
    } else {
      const color = COLORS[level];
      const prefix = `${color}[${level.toUpperCase().padEnd(5)}]${RESET}`;
      const extra = data && Object.keys(data).length > 0
        ? ` ${Object.entries(data).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}`
        : '';
      process.stderr.write(`${prefix} ${msg}${extra}\n`);
    }
  }

  return {
    debug: (msg, data) => log('debug', msg, data),
    info: (msg, data) => log('info', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
  };
}

/** Default logger instance */
export const logger = createLogger();
