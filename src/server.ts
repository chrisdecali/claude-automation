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

            if (url.pathname === '/ws') {
                mainLogger.info('WebSocket upgrade attempt from ' + req.headers.get('x-forwarded-for') || req.url);
                const upgraded = server.upgrade(req);
                if (!upgraded) {
                    mainLogger.error('WebSocket upgrade failed');
                    return new Response("WebSocket upgrade failed", { status: 400 });
                }
                mainLogger.info('WebSocket upgrade successful');
                return undefined; // response is sent by the websocket
            }

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
        websocket: {
            async message(ws, message) {
                try {
                    const data = JSON.parse(message.toString());
                    if (data.type === 'chat') {
                        const prompt = data.payload;
                        const session = await sessionManager.startSession({
                            taskName: 'live-chat',
                            prompt: prompt,
                            workingDir: `/tmp/claude-sessions/${Date.now()}`
                        });

                        ws.send(JSON.stringify({ type: 'status', payload: `Session ${session.id} started.` }));

                        // Stream output
                        const stream = session.outputStream;
                        if (stream) {
                            const reader = stream.getReader();
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                const chunk = new TextDecoder().decode(value);
                                ws.send(JSON.stringify({ type: 'stream', payload: chunk }));
                            }
                        }

                        // Wait for completion and send final status
                        const finalSession = await session.completion;
                        ws.send(JSON.stringify({ type: 'status', payload: `Session ${finalSession.id} ${finalSession.status}.` }));

                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const errorStack = error instanceof Error ? error.stack : '';
                    mainLogger.error(`WebSocket message error: ${errorMessage}`);
                    mainLogger.error(`Stack trace: ${errorStack}`);
                    console.error('WebSocket error:', error);
                    ws.send(JSON.stringify({ type: 'error', payload: `Error: ${errorMessage}` }));
                }
            },
            open(ws) {
                mainLogger.info('WebSocket connection opened.');
                ws.send(JSON.stringify({ type: 'status', payload: 'Connection established.' }));
            },
            close(ws, code, reason) {
                mainLogger.info(`WebSocket connection closed: ${code} ${reason}`);
            }
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



