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

// Resolve the persistent config directory once
// Prefer /opt (writable by claude user) over /etc (read-only for claude user)
const configDir = await (async () => {
    if (await Bun.file('/opt/claude-automation/config/apis.json').exists()) return '/opt/claude-automation/config';
    if (await Bun.file('/etc/claude-automation/apis.json').exists()) return '/etc/claude-automation';
    return `${process.cwd()}/config`;
})();

async function loadApisJson(): Promise<Record<string, any>> {
    try {
        return await Bun.file(`${configDir}/apis.json`).json();
    } catch { return {}; }
}

async function loadTasksJson(): Promise<Record<string, any>> {
    try {
        return await Bun.file(`${configDir}/tasks.json`).json();
    } catch { return {}; }
}

async function writeSessionContext(workingDir: string): Promise<void> {
    const { mkdir, writeFile } = await import('fs/promises');
    await mkdir(workingDir, { recursive: true });

    const apis = await loadApisJson();
    const tasks = await loadTasksJson();

    const lines: string[] = [];
    lines.push('# Claude Automation - Session Context');
    lines.push('');
    lines.push('You are Claude, running inside the claude-automation server on a DigitalOcean droplet.');
    lines.push('');
    lines.push('## Important');
    lines.push('- All API credentials are listed below with full tokens — use them directly in curl/fetch calls.');
    lines.push('- When the user asks you to add or update an API, edit `./apis.json` in this directory. Changes persist across sessions.');
    lines.push('- When the user asks you to add or update a task, edit `./tasks.json` in this directory. Changes persist across sessions.');
    lines.push('');

    // Inline full API details with credentials
    if (Object.keys(apis).length > 0) {
        lines.push('## Available APIs');
        lines.push('');
        for (const [key, api] of Object.entries(apis) as [string, any][]) {
            lines.push(`### ${api.name || key}`);
            if (api.baseUrl) lines.push(`- **Base URL:** \`${api.baseUrl}\``);
            if (api.type) lines.push(`- **Type:** ${api.type}`);

            // Inline auth details with actual credentials
            if (api.auth) {
                const auth = api.auth;
                if (auth.type === 'bearer' && auth.token) {
                    lines.push(`- **Auth:** Bearer token`);
                    lines.push(`- **Token:** \`${auth.token}\``);
                    lines.push(`- **Usage:** \`Authorization: Bearer ${auth.token}\``);
                } else if (auth.type === 'token' && auth.token) {
                    lines.push(`- **Auth:** Token via \`${auth.header || 'X-Token'}\` header`);
                    lines.push(`- **Token:** \`${auth.token}\``);
                    lines.push(`- **Usage:** \`${auth.header || 'X-Token'}: ${auth.token}\``);
                } else if (auth.type === 'apikey' && auth.key) {
                    lines.push(`- **Auth:** API key via \`${auth.header || 'X-Api-Key'}\` header`);
                    lines.push(`- **Key:** \`${auth.key}\``);
                    lines.push(`- **Usage:** \`${auth.header || 'X-Api-Key'}: ${auth.key}\``);
                } else if (auth.type === 'header' && auth.headers) {
                    lines.push(`- **Auth:** Custom headers`);
                    for (const [hk, hv] of Object.entries(auth.headers)) {
                        lines.push(`  - \`${hk}: ${hv}\``);
                    }
                } else if (auth.type === 'header' && auth.token) {
                    lines.push(`- **Auth:** \`${auth.header || 'Authorization'}: ${auth.token}\``);
                } else if (auth.type === 'oauth') {
                    lines.push(`- **Auth:** OAuth`);
                    if (auth.clientId) lines.push(`- **Client ID:** \`${auth.clientId}\``);
                    if (auth.accessToken) lines.push(`- **Access Token:** \`${auth.accessToken}\``);
                    lines.push(`- **Usage headers:** \`trakt-api-key: ${auth.clientId}\`, \`Authorization: Bearer ${auth.accessToken}\`, \`trakt-api-version: 2\``);
                } else if (auth.type === 'none') {
                    lines.push(`- **Auth:** None required`);
                }
            }

            // Endpoints
            if (api.endpoints) {
                lines.push(`- **Endpoints:**`);
                for (const [ek, ev] of Object.entries(api.endpoints)) {
                    lines.push(`  - ${ek}: \`${ev}\``);
                }
            }

            // Extra metadata
            if (api.username) lines.push(`- **Username:** ${api.username}`);
            if (api.userId) lines.push(`- **User ID:** ${api.userId}`);
            if (api.note) lines.push(`- **Note:** ${api.note}`);
            if (api.shelves) lines.push(`- **Shelves:** ${api.shelves.join(', ')}`);
            lines.push('');
        }
    }

    // Tasks
    if (Object.keys(tasks).length > 0) {
        lines.push('## Scheduled Tasks');
        lines.push('');
        for (const [key, task] of Object.entries(tasks) as [string, any][]) {
            const t = task as any;
            lines.push(`- **${t.name || key}** (\`${key}\`): schedule \`${t.schedule || 'manual'}\`, ${t.enabled ? 'enabled' : 'disabled'}`);
            if (t.prompt) lines.push(`  - Prompt: ${t.prompt.substring(0, 100)}${t.prompt.length > 100 ? '...' : ''}`);
        }
        lines.push('');
    }

    // API usage tips
    lines.push('## API Usage Tips');
    lines.push('');
    lines.push('### Plex');
    lines.push('- Plex returns XML. Use `curl -s` and parse with grep/awk, or add `Accept: application/json` header (not always supported).');
    lines.push('- Get library sections: `curl -s "BASE_URL/library/sections?X-Plex-Token=TOKEN"`');
    lines.push('- Get all movies in a section: `curl -s "BASE_URL/library/sections/SECTION_KEY/all?X-Plex-Token=TOKEN"`');
    lines.push('- Movie ratings are in the `audienceRating` or `rating` XML attributes.');
    lines.push('- For large libraries, paginate: `?X-Plex-Container-Start=0&X-Plex-Container-Size=100`');
    lines.push('');
    lines.push('### Hardcover (GraphQL)');
    lines.push('- Endpoint: POST to `https://api.hardcover.app/v1/graphql`');
    lines.push('- Example: Currently reading:');
    lines.push('```');
    lines.push('curl -s -X POST https://api.hardcover.app/v1/graphql \\');
    lines.push('  -H "Authorization: Bearer TOKEN" \\');
    lines.push('  -H "Content-Type: application/json" \\');
    lines.push('  -d \'{"query":"{ me { user_books(where: {status_id: {_eq: 2}}) { book { title author { name } } } } }"}\'');
    lines.push('```');
    lines.push('- Status IDs: 1=Want to Read, 2=Currently Reading, 3=Read, 4=Did Not Finish');
    lines.push('');
    lines.push('### Radarr / Sonarr');
    lines.push('- Search: `GET /movie/lookup?term=QUERY`');
    lines.push('- Add: `POST /movie` with `{tmdbId, title, qualityProfileId: 4, rootFolderPath: "/media/movies", monitored: true, addOptions: {searchForMovie: true}}`');
    lines.push('');
    lines.push('### Trakt');
    lines.push('- Always send headers: `Content-Type: application/json`, `trakt-api-version: 2`, `trakt-api-key: CLIENT_ID`, `Authorization: Bearer ACCESS_TOKEN`');
    lines.push('');
    lines.push('### Perplexity');
    lines.push('- POST to `https://api.perplexity.ai/chat/completions` with `{"model":"sonar-pro","messages":[{"role":"user","content":"query"}]}`');
    lines.push('');

    await writeFile(`${workingDir}/CLAUDE.md`, lines.join('\n'));

    // Write apis.json and tasks.json as real files (not symlinks) that we sync back on change
    await writeFile(`${workingDir}/apis.json`, JSON.stringify(apis, null, 2));
    await writeFile(`${workingDir}/tasks.json`, JSON.stringify(tasks, null, 2));
}

// Watch for config changes in session directories and sync back to main config
async function syncSessionConfig(workingDir: string): Promise<void> {
    const { writeFile } = await import('fs/promises');
    // Sync apis.json
    try {
        const sessionApis = await Bun.file(`${workingDir}/apis.json`).json();
        const mainApis = await loadApisJson();
        const sessionStr = JSON.stringify(sessionApis, null, 2);
        const mainStr = JSON.stringify(mainApis, null, 2);
        if (sessionStr !== mainStr) {
            await writeFile(`${configDir}/apis.json`, sessionStr);
            mainLogger.info(`Session updated apis.json — synced to ${configDir}/apis.json`);
        }
    } catch (e) {
        mainLogger.error(`Failed to sync apis.json: ${e}`);
    }
    // Sync tasks.json
    try {
        const sessionTasks = await Bun.file(`${workingDir}/tasks.json`).json();
        const mainTasks = await loadTasksJson();
        const sessionStr = JSON.stringify(sessionTasks, null, 2);
        const mainStr = JSON.stringify(mainTasks, null, 2);
        if (sessionStr !== mainStr) {
            await writeFile(`${configDir}/tasks.json`, sessionStr);
            mainLogger.info(`Session updated tasks.json — synced to ${configDir}/tasks.json`);
        }
    } catch (e) {
        mainLogger.error(`Failed to sync tasks.json: ${e}`);
    }
}

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
                        await writeSessionContext(chatState.workingDir);
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
                            await writeSessionContext(chatState.workingDir);
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

                        if (result.exitCode !== 0) {
                            const errMsg = result.stderr || result.output || 'Claude process exited unexpectedly.';
                            mainLogger.error(`claude -p exited with code ${result.exitCode}: ${errMsg}`);
                            ws.send(JSON.stringify({ type: 'error', payload: errMsg.trim() }));
                        } else {
                            chatState.messages.push({ role: 'user', content: prompt });
                            chatState.messages.push({ role: 'assistant', content: result.output });

                            // Sync any config changes back to main config
                            await syncSessionConfig(chatState.workingDir);

                            ws.send(JSON.stringify({ type: 'stream-end' }));
                        }
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

    // Clean up old session directories every hour
    setInterval(async () => {
        try {
            const { readdir, stat, rm } = await import('fs/promises');
            const sessionDir = '/tmp/claude-chat';
            const entries = await readdir(sessionDir).catch(() => [] as string[]);
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            for (const entry of entries) {
                const fullPath = `${sessionDir}/${entry}`;
                const info = await stat(fullPath).catch(() => null);
                if (info && Date.now() - info.mtimeMs > maxAge) {
                    await rm(fullPath, { recursive: true });
                    mainLogger.info(`Cleaned up old session dir: ${entry}`);
                }
            }
        } catch (e) {
            mainLogger.error(`Session cleanup error: ${e}`);
        }
    }, 60 * 60 * 1000);
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



