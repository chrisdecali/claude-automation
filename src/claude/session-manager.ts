import { spawn, Subprocess } from "bun";
import { randomUUID } from "crypto";
import { ClaudeSession, SessionOptions } from './types';
import { mkdir } from 'fs/promises';

export class SessionManager {
    private activeSessions: Map<string, ClaudeSession> = new Map();

    async startSession(options: SessionOptions): Promise<ClaudeSession> {
        let resolveCompletion: (session: ClaudeSession) => void;
        const completionPromise = new Promise<ClaudeSession>((resolve) => {
            resolveCompletion = resolve;
        });

        // Create working directory BEFORE spawning the process
        await mkdir(options.workingDir, { recursive: true });

        const proc = spawn({
            cmd: ["/usr/bin/claude", "-p", options.prompt],
            cwd: options.workingDir,
            stdout: "pipe",
            stderr: "pipe",
            env: {
                ...process.env,
                HOME: "/home/claude",
            },
        });

        const session: ClaudeSession = {
            id: randomUUID(),
            taskName: options.taskName,
            prompt: options.prompt,
            workingDir: options.workingDir,
            startTime: new Date(),
            status: 'running',
            output: [],
            outputStream: proc.stdout,
            completion: completionPromise,
        };

        this.activeSessions.set(session.id, session);

        let stderrOutput = '';
        const reader = proc.stderr.getReader();
        const decoder = new TextDecoder();
        reader.read().then(async function processText({ done, value }): Promise<void> {
            if (done) {
                return;
            }
            const chunk = decoder.decode(value, { stream: true });
            stderrOutput += chunk;
            session.output.push({ stream: 'stderr', data: chunk });
            return reader.read().then(processText);
        });

        proc.exited.then(exitCode => {
            session.endTime = new Date();
            session.exitCode = exitCode;
            session.status = exitCode === 0 ? 'completed' : 'failed';
            resolveCompletion(session);
        });

        return session;
    }

    getSession(id: string): ClaudeSession | undefined {
        return this.activeSessions.get(id);
    }

    getActiveSessions(): ClaudeSession[] {
        return Array.from(this.activeSessions.values());
    }
}
