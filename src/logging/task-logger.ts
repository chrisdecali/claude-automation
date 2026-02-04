import { Logger } from './logger';
import path from 'path';

export class TaskLogger {
  private taskName: string;
  private logger: Logger;

  constructor(taskName: string, logDir: string) {
    this.taskName = taskName;
    const logFileName = `${taskName}.log`;
    const logFilePath = path.join(logDir, logFileName);
    this.logger = new Logger(logFilePath);
  }

  async info(message: string): Promise<void> {
    await this.logger.info(`[${this.taskName}] ${message}`);
  }

  async warn(message: string): Promise<void> {
    await this.logger.warn(`[${this.taskName}] ${message}`);
  }

  async error(message: string): Promise<void> {
    await this.logger.error(`[${this.taskName}] ${message}`);
  }

  async debug(message: string): Promise<void> {
    await this.logger.debug(`[${this.taskName}] ${message}`);
  }

  async clearTaskLog(): Promise<void> {
    await this.logger.clearLog();
  }
}
