import { AppConfig, loadConfig, reloadConfig } from './config/config';
import { Logger } from './logging/logger';
import { TaskLogger } from './logging/task-logger';
import { SessionManager } from './claude/session-manager';
import { PushbulletService } from './notifications/pushbullet';
import { CronScheduler } from './scheduler/cron-scheduler';
import { ConfigWatcher } from './config/watcher';
import { Server } from 'bun';

let config = await loadConfig();
const mainLogger = new Logger(config.logDir);
const sessionManager = new SessionManager();
let pushbulletService = new PushbulletService(config.pushbullet.token);

let server: Server;
let cronScheduler: CronScheduler;
let configWatcher: ConfigWatcher;

// Auth middleware function
function requireAuth(req: Request): Response | null {
  // ... (same as before)
}

// IP whitelist check
function checkIP(req: Request): Response | null {
    // ... (same as before)
}

async function runTask(taskName: string) {
    // ... (same as before)
}

function startServer() {
    server = Bun.serve({
        port: config.server.port,
        hostname: config.server.host,
        
        async fetch(req, server) {
            const url = new URL(req.url);
            let filePath = `./public${url.pathname}`;
            if (url.pathname === '/') {
                filePath = './public/index.html';
            }

            const file = Bun.file(filePath);
            const fileExists = await file.exists();

            if (fileExists) {
                return new Response(file);
            }
            
            // Health check (no auth)
            if (url.pathname === '/health') {
                return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // API routes
            if (url.pathname.startsWith('/api/')) {
                 const ipError = checkIP(req, server);
                 if (ipError) return ipError;

                // Protected routes
                if (url.pathname.startsWith('/api/tasks/')) {
                    const authError = requireAuth(req);
                    if (authError) return authError;

                    const taskName = url.pathname.split('/')[3];
                    if (url.pathname.endsWith('/run')) {
                        if (!config.tasks[taskName]) {
                            return new Response(JSON.stringify({ error: `Task '${taskName}' not found` }), {
                                status: 404,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }
                        
                        runTask(taskName);

                        return new Response(JSON.stringify({ message: `Task '${taskName}' started.` }), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }
                
                if (url.pathname.startsWith('/api/sessions/')) {
                     const authError = requireAuth(req);
                     if (authError) return authError;
                    
                    const sessionId = url.pathname.split('/')[3];
                    const session = sessionManager.getSession(sessionId);

                    if (!session) {
                        return new Response(JSON.stringify({ error: 'Session not found' }), {
                            status: 404,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                    return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
                }
            }

            return new Response('Not Found', { status: 404 });
        },
        error(error) {
            mainLogger.error(`Server error: ${error}`);
            return new Response("Internal Server Error", { status: 500 });
        },
    });

    mainLogger.info(`Server listening on ${server.hostname}:${server.port}`);
    
    cronScheduler = new CronScheduler(mainLogger, runTask);
    cronScheduler.scheduleTasks(config);

    configWatcher = new ConfigWatcher(mainLogger, hotReload);
    configWatcher.watchDirectories(['/etc/claude-automation', './config']);
}

async function hotReload() {
    mainLogger.info('Hot reloading configuration...');
    
    cronScheduler.stopAll();
    server.stop(true); 

    try {
        const newConfig = await reloadConfig();
        config = newConfig;
        
        mainLogger.reopen(config.logDir);
        pushbulletService = new PushbulletService(config.pushbullet.token);
        
        startServer();
        mainLogger.info('Hot reload complete.');
    } catch (error) {
        mainLogger.error(`Failed to hot reload config: ${error}. The application may be in an unstable state.`);
    }
}

function gracefulShutdown(signal: string) {
    mainLogger.info(`Received ${signal}. Shutting down gracefully...`);
    configWatcher.stop();
    cronScheduler.stopAll();
    server.stop(true);
    mainLogger.info("Shutdown complete. Exiting.");
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();



