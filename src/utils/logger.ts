/**
 * Simple Logger Utility
 * Structured logging for relayer service
 */

export interface LogMeta {
  [key: string]: any;
}

class Logger {
  private formatMeta(meta?: LogMeta): string {
    if (!meta) return '';
    return '\n' + JSON.stringify(meta, null, 2);
  }

  info(message: string, meta?: LogMeta): void {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}${this.formatMeta(meta)}`);
  }

  error(message: string, meta?: LogMeta): void {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}${this.formatMeta(meta)}`);
  }

  warn(message: string, meta?: LogMeta): void {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}${this.formatMeta(meta)}`);
  }

  debug(message: string, meta?: LogMeta): void {
    if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}${this.formatMeta(meta)}`);
    }
  }
}

export default new Logger();
