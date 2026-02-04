import { loadConfig } from './config/config';
import { Logger } from './logging/logger';
import { SessionManager } from './claude/session-manager';

const config = await loadConfig();
const logger = new Logger(config.logDir);
const sessionManager = new SessionManager();

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
function checkIP(server: any, req: Request): Response | null {
    if (config.server.allowedIPs && config.server.allowedIPs.length > 0) {
        const clientIP = server.requestIP(req)?.address;
        if (!clientIP || !config.server.allowedIPs.includes(clientIP)) {
            logger.warn(`Blocked request from unauthorized IP: ${clientIP}`);
            return new Response(JSON.stringify({ error: 'IP address not allowed' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    return null;
}

const server = Bun.serve({
  port: config.server.port,
  hostname: config.server.host,
  
  async fetch(req, server) {
    const url = new URL(req.url);

    // IP Whitelist Check for all routes except health check
    if (url.pathname !== '/health') {
        const ipError = checkIP(server, req);
        if (ipError) return ipError;
    }
    
    // Health check (no auth)
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // API routes that require auth
    if (url.pathname.startsWith('/api')) {
        const authError = requireAuth(req);
        if (authError) return authError;

        if (url.pathname === '/api/tasks' && req.method === 'GET') {
            const activeSessions = sessionManager.getActiveSessions();
            return new Response(JSON.stringify(activeSessions), { headers: { 'Content-Type': 'application/json' } });
        }

        if (url.pathname.startsWith('/api/tasks/') && req.method === 'GET') {
            const taskId = url.pathname.split('/')[3];
            const session = sessionManager.getSession(taskId);
            if (session) {
                return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }
    }

    // Task execution - placeholder for now
    if (url.pathname.startsWith('/tasks')) {
      return new Response(JSON.stringify({ message: 'Task execution not yet implemented' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  },
  error(error) {
    logger.error(`Server error: ${error}`);
    return new Response("Internal Server Error", { status: 500 });
  },
});

logger.info(`Server listening on ${server.hostname}:${server.port}`);
