import { AppConfig, loadConfig, reloadConfig } from './config/config';
import { Logger } from './logging/logger';
import { TaskLogger } from './logging/task-logger';
import { SessionManager, ConversationMessage } from './claude/session-manager';
import { PushbulletService } from './notifications/pushbullet';
import { CronScheduler } from './scheduler/cron-scheduler';
import { ConfigWatcher } from './config/watcher';
import { Server, ServerWebSocket } from 'bun';

interface ChatSessionState {
    active: boolean;
    messages: ConversationMessage[];
    workingDir: string;
}

const chatSessions = new WeakMap<ServerWebSocket<unknown>, ChatSessionState>();

function getOrCreateSession(ws: ServerWebSocket<unknown>): ChatSessionState {
    let session = chatSessions.get(ws);
    if (!session) {
        session = { active: false, messages: [], workingDir: `/tmp/claude-chat/${Date.now()}` };
        chatSessions.set(ws, session);
    }
    return session;
}

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
                const upgraded = server.upgrade(req);
                if (!upgraded) {
                    return new Response("WebSocket upgrade failed", { status: 400 });
                }
                return; // response is sent by the websocket
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
                    const chatState = getOrCreateSession(ws);

                    if (data.type === 'start') {
                        chatState.active = true;
                        chatState.messages = [];
                        chatState.workingDir = `/tmp/claude-chat/${Date.now()}`;
                        ws.send(JSON.stringify({ type: 'session-started', payload: 'Session started. You can now chat with Claude.' }));
                        return;
                    }

                    if (data.type === 'close-session') {
                        const msgCount = chatState.messages.length;
                        chatState.active = false;
                        chatState.messages = [];
                        ws.send(JSON.stringify({ type: 'session-closed', payload: `Session closed. ${msgCount} messages cleared.` }));
                        return;
                    }

                    if (data.type === 'chat') {
                        const prompt = data.payload;

                        // Auto-start session if not active
                        if (!chatState.active) {
                            chatState.active = true;
                            chatState.messages = [];
                            chatState.workingDir = `/tmp/claude-chat/${Date.now()}`;
                            ws.send(JSON.stringify({ type: 'session-started', payload: 'Session auto-started.' }));
                        }

                        ws.send(JSON.stringify({ type: 'stream-start' }));

                        const { stream, completion } = await sessionManager.runPrompt(
                            prompt,
                            chatState.messages,
                            chatState.workingDir
                        );

                        // Stream output to client
                        const reader = stream.getReader();
                        const decoder = new TextDecoder();
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            const chunk = decoder.decode(value, { stream: true });
                            ws.send(JSON.stringify({ type: 'stream', payload: chunk }));
                        }

                        // Wait for completion, store in history
                        const result = await completion;
                        chatState.messages.push({ role: 'user', content: prompt });
                        chatState.messages.push({ role: 'assistant', content: result.output });

                        ws.send(JSON.stringify({ type: 'stream-end' }));
                    }
                } catch (error) {
                    mainLogger.error(`WebSocket message error: ${error}`);
                    ws.send(JSON.stringify({ type: 'error', payload: 'Invalid message format or internal error.' }));
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



