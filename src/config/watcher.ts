import { FSWatcher, watch } from 'fs';
import { Logger } from '../logging/logger';
import { resolve } from 'path';

const DEBOUNCE_DELAY = 1000; // 1 second

export class ConfigWatcher {
    private watchers: FSWatcher[] = [];
    private logger: Logger;
    private debounceTimeout: NodeJS.Timeout | null = null;
    private callback: () => void;

    constructor(logger: Logger, callback: () => void) {
        this.logger = logger;
        this.callback = callback;
    }

    watchDirectories(dirPaths: string[]) {
        this.stop();
        this.logger.info(`Watching for changes in directories: ${dirPaths.join(', ')}`);

        for (const dirPath of dirPaths) {
            try {
                const resolvedPath = resolve(dirPath);
                const watcher = watch(resolvedPath, (event, filename) => {
                    this.logger.info(`Detected ${event} in ${resolvedPath}` + (filename ? `/${filename}`: ''));
                    if (this.debounceTimeout) {
                        clearTimeout(this.debounceTimeout);
                    }

                    this.debounceTimeout = setTimeout(() => {
                        this.logger.info('Executing hot reload due to file change.');
                        this.callback();
                    }, DEBOUNCE_DELAY);
                });

                watcher.on('error', (error) => {
                    this.logger.error(`File watcher error for ${resolvedPath}: ${error}`);
                });

                this.watchers.push(watcher);
            } catch (error) {
                this.logger.error(`Failed to set up file watcher for directory: ${dirPath}. Error: ${error}`);
            }
        }
    }

    stop() {
        if (this.watchers.length > 0) {
            this.watchers.forEach(watcher => watcher.close());
            this.watchers = [];
            this.logger.info('Stopped watching config files.');
        }
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
    }
}
