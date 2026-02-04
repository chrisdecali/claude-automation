import { open, unlink } from 'fs/promises';

export class Logger {
  private logFilePath: string;

  constructor(logDir: string, fileName: string = 'app.log') {
    this.logFilePath = `${logDir}/${fileName}`;
  }

  reopen(logDir: string) {
    this.logFilePath = `${logDir}/app.log`;
  }

  private async writeLog(level: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    try {
      await Bun.write(this.logFilePath, logEntry, {
        create: true,
        append: true,
      });
    } catch (error) {
      console.error(`Failed to write to log file ${this.logFilePath}:`, error);
    }
  }

  info(message: string): Promise<void> {
    return this.writeLog('INFO', message);
  }

  warn(message: string): Promise<void> {
    return this.writeLog('WARN', message);
  }

  error(message: string): Promise<void> {
    return this.writeLog('ERROR', message);
  }

  debug(message: string): Promise<void> {
    return this.writeLog('DEBUG', message);
  }

  async clearLog(): Promise<void> {
    try {
      if (await Bun.file(this.logFilePath).exists()) {
        await Bun.write(this.logFilePath, "");
      }
    } catch (error) {
      console.error(`Failed to clear log file ${this.logFilePath}:`, error);
    }
  }
}

