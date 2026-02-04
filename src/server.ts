import { AppConfig, loadConfig, reloadConfig } from './config/config';
import { Logger } from './logging/logger';
import { TaskLogger } from './logging/task-logger';
import { SessionManager } from './claude/session-manager';
import { PushbulletService } from './notifications/pushbullet';
import { CronScheduler } from './scheduler/cron-scheduler';
import { Server } from 'bun';

let config = await loadConfig();
const mainLogger = new Logger(config.logDir);
const sessionManager = new SessionManager();
let pushbulletService = new PushbulletService(config.pushbullet.token);


let server: Server;
let cronScheduler: CronScheduler;

// Auth middleware function
function requireAuth(req: Request): Response | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  const token = authHeader.substring(7);
  if (token !== config.server.apiKey) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}

// IP whitelist check
function checkIP(req: Request): Response | null {
    if (config.server.allowedIPs && config.server.allowedIPs.length > 0) {
        const clientIP = server.requestIP(req)?.address;
        if (!clientIP || !config.server.allowedIPs.includes(clientIP)) {
            mainLogger.warn(`Blocked request from unauthorized IP: ${clientIP}`);
            return new Response(JSON.stringify({ error: 'IP address not allowed' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    return null;
}

async function runTask(taskName: string) {
    const taskConfig = config.tasks[taskName];
    if (!taskConfig || !taskConfig.enabled) {
        mainLogger.warn(`Attempted to run disabled or non-existent task: ${taskName}`);
        return;
    }

    const taskLogger = new TaskLogger(config.logDir, taskName);
    taskLogger.info(`Starting task: ${taskName}`);

    try {
        const session = await sessionManager.startSession({
            taskName,
            prompt: taskConfig.prompt,
            workingDir: taskConfig.workingDir,
        });

        // This will now wait for the session to complete
        const finalStatus = await session.completion; 
        taskLogger.info(`Task ${taskName} completed with status: ${finalStatus.status}`);

        if (finalStatus.status === 'completed' && taskConfig.notifyOn.includes('success')) {
            await pushbulletService.sendNotification({
                title: `Task Succeeded: ${taskName}`,
                body: `The task finished successfully. Exit code: ${finalStatus.exitCode}`,
            });
        } else if (finalStatus.status === 'failed' && taskConfig.notifyOn.includes('failure')) {
            await pushbulletService.sendNotification({
                title: `Task Failed: ${taskName}`,
                body: `The task failed with exit code: ${finalStatus.exitCode}.\nError: ${finalStatus.error}`,
            });
        }
        return session;
    } catch (error) {
        taskLogger.error(`An error occurred while running task ${taskName}: ${error}`);
        if (taskConfig.notifyOn.includes('failure')) {
            await pushbulletService.sendNotification({
                title: `Task Failed: ${taskName}`,
                body: `An unexpected error occurred: ${error}`,
            });
        }
        return null;
    }
}


function startServer() {
    server = Bun.serve({
        port: config.server.port,
        hostname: config.server.host,
        
        async fetch(req, server) {
            const url = new URL(req.url);

            if (url.pathname !== '/health') {
                const ipError = checkIP(req);
                if (ipError) return ipError;
            }
            
            if (url.pathname === '/health') {
                return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            if (url.pathname.startsWith('/api')) {
                const authError = requireAuth(req);
                if (authError) return authError;

                if (url.pathname === '/api/tasks' && req.method === 'GET') {
                    return new Response(JSON.stringify(sessionManager.getActiveSessions()), { headers: { 'Content-Type': 'application/json' } });
                }

                const taskRunMatch = url.pathname.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)\/run$/);
                if (taskRunMatch && req.method === 'POST') {
                    const taskName = taskRunMatch[1];
                    const task = config.tasks[taskName];
                    if (task) {
                        mainLogger.info(`Received request to run task: ${taskName}`);
                        // Do not wait for runTask to complete
                        runTask(taskName); 
                        return new Response(JSON.stringify({ message: `Task '${taskName}' started.` }), { status: 202, headers: { 'Content-Type': 'application/json' }});
                    }
                    return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
                }

                const sessionMatch = url.pathname.match(/^\/api\/sessions\/([a-zA-Z0-9-]+)$/);
                if (sessionMatch && req.method === 'GET') {
                    const sessionId = sessionMatch[1];
                    const session = sessionManager.getSession(sessionId);
                    if (session) {
                        return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
                    }
                    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
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
    
    // Initialize and start cron scheduler
    cronScheduler = new CronScheduler(mainLogger, runTask);
    cronScheduler.scheduleTasks(config);
}

async function hotReload() {
    mainLogger.info('Hot reloading configuration...');
    
    // Stop existing services
    cronScheduler.stopAll();
    server.stop(true); // true for graceful shutdown

    // Reload config
    const newConfig = await reloadConfig();
    config = newConfig;

    // Re-initialize services with new config
    pushbulletService = new PushbulletService(config.pushbullet.token);
    
    // Restart server and scheduler
    startServer();
    mainLogger.info('Hot reload complete.');
}


startServer();


