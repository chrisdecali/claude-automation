import { spawn, Subprocess } from "bun";
import { randomUUID } from "crypto";
import { ClaudeSession, SessionOptions, SessionCompletionStatus } from './types';
import { mkdir } from 'fs/promises';

export class SessionManager {
    private activeSessions: Map<string, ClaudeSession> = new Map();

    async startSession(options: SessionOptions): Promise<ClaudeSession> {
        let resolveCompletion: (status: SessionCompletionStatus) => void;
        const completionPromise = new Promise<SessionCompletionStatus>((resolve) => {
            resolveCompletion = resolve;
        });

        const session: ClaudeSession = {
            id: randomUUID(),
            taskName: options.taskName,
            prompt: options.prompt,
            workingDir: options.workingDir,
            startTime: new Date(),
            status: 'running',
            output: [],
            completion: completionPromise,
        };

        this.activeSessions.set(session.id, session);

        await mkdir(options.workingDir, { recursive: true });

        const proc = spawn({
            cmd: ["claude", options.prompt],
            cwd: options.workingDir,
            stdout: "pipe",
            stderr: "pipe",
        });

        let stderrOutput = '';
        const handleOutput = async (stream: ReadableStream<Uint8Array>, type: 'stdout' | 'stderr') => {
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const data = decoder.decode(value);
                if (type === 'stderr') {
                    stderrOutput += data;
                }
                session.output.push({ stream: type, data });
            }
        };

        handleOutput(proc.stdout, 'stdout');
        handleOutput(proc.stderr, 'stderr');

        proc.exited.then(exitCode => {
            session.endTime = new Date();
            session.exitCode = exitCode;
            session.status = exitCode === 0 ? 'completed' : 'failed';
            
            const completionStatus: SessionCompletionStatus = {
                status: session.status,
                exitCode: exitCode,
                error: exitCode !== 0 ? stderrOutput : undefined,
            };
            
            resolveCompletion(completionStatus);
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
