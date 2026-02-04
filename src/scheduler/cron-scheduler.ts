import { AppConfig } from '../config/types';
import { Logger } from '../logging/logger';

type CronJob = () => void;

export class CronScheduler {
    private jobs: Map<string, NodeJS.Timeout> = new Map();
    private logger: Logger;
    private runTask: (taskName: string) => Promise<any>;

    constructor(logger: Logger, runTask: (taskName: string) => Promise<any>) {
        this.logger = logger;
        this.runTask = runTask;
    }

    scheduleTasks(config: AppConfig) {
        this.stopAll();
        this.logger.info('Scheduling tasks from config...');
        for (const taskName in config.tasks) {
            const task = config.tasks[taskName];
            if (task.enabled && task.schedule) {
                this.schedule(taskName, task.schedule);
            }
        }
    }

    schedule(taskName: string, cronTime: string) {
        if (this.jobs.has(taskName)) {
            this.stop(taskName);
        }

        const job = () => {
            this.logger.info(`Cron job triggered for task: ${taskName}`);
            this.runTask(taskName);
        };

        try {
            const interval = this.parseCron(cronTime);
            if (interval > 0) {
                const timeout = setInterval(job, interval);
                this.jobs.set(taskName, timeout);
                this.logger.info(`Scheduled task '${taskName}' with schedule: ${cronTime}`);
            }
        } catch (error) {
            this.logger.error(`Invalid cron string for task '${taskName}': ${cronTime}. ${error}`);
        }
    }

    stop(taskName: string) {
        const job = this.jobs.get(taskName);
        if (job) {
            clearInterval(job);
            this.jobs.delete(taskName);
            this.logger.info(`Unscheduled task: ${taskName}`);
        }
    }

    stopAll() {
        this.logger.info('Stopping all scheduled tasks.');
        for (const taskName of this.jobs.keys()) {
            this.stop(taskName);
        }
    }

    // This is a very basic cron parser that only supports intervals in minutes.
    // e.g. "*/5 * * * *" means every 5 minutes.
    private parseCron(cronTime: string): number {
        const parts = cronTime.split(' ');
        if (parts.length !== 5) {
            throw new Error('Invalid cron string format. Expected 5 parts.');
        }

        const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

        if (minute.startsWith('*/')) {
            const interval = parseInt(minute.substring(2));
            if (isNaN(interval) || interval <= 0) {
                throw new Error('Invalid minute interval');
            }
            if (hour !== '*' || dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') {
                this.logger.warn(`Cron parser only supports minute intervals. Other fields are ignored for ${cronTime}`);
            }
            return interval * 60 * 1000;
        }
        
        if( minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
            return 60 * 1000; // every minute
        }

        throw new Error('Unsupported cron format. Only "*/N * * * *" and "* * * * *" are supported.');
    }
}
