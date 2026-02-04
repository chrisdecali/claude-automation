import { open, unlink } from 'fs/promises';

export class Logger {
  private logFilePath: string;

  constructor(logFilePath: string) {
    this.logFilePath = logFilePath;
  }

  private async writeLog(level: string, message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    try {
      // Use Bun.write for appending
      await Bun.write(this.logFilePath, logEntry, {
        create: true, // Create the file if it doesn't exist
        append: true, // Append to the file
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
      // Bun.file(this.logFilePath).exists() can be used to check existence
      if (await Bun.file(this.logFilePath).exists()) {
        await Bun.write(this.logFilePath, ""); // Overwrite with empty string to clear
      }
    } catch (error) {
      console.error(`Failed to clear log file ${this.logFilePath}:`, error);
    }
  }
}
