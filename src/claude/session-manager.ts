import { spawn } from "bun";
import { randomUUID } from "crypto";
import { ClaudeSession, SessionOptions } from './types';
import { mkdir } from 'fs/promises';

export class SessionManager {
  private activeSessions: Map<string, ClaudeSession> = new Map();

  async startSession(options: SessionOptions): Promise<ClaudeSession> {
    const session: ClaudeSession = {
      id: randomUUID(),
      taskName: options.taskName,
      prompt: options.prompt,
      workingDir: options.workingDir,
      startTime: new Date(),
      status: 'running',
      output: []
    };

    this.activeSessions.set(session.id, session);

    // Ensure working directory exists
    await mkdir(options.workingDir, { recursive: true });
    
    // Spawn Claude Code CLI process using Bun
    const proc = spawn({
      cmd: ["claude", options.prompt],
      cwd: options.workingDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    // Capture output
    const handleOutput = async (stream: ReadableStream<Uint8Array>, type: 'stdout' | 'stderr') => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const data = decoder.decode(value);
            session.output.push({ stream: type, data });
        }
    };

    handleOutput(proc.stdout, 'stdout');
    handleOutput(proc.stderr, 'stderr');

    proc.exited.then(exitCode => {
        session.endTime = new Date();
        session.exitCode = exitCode;
        session.status = exitCode === 0 ? 'completed' : 'failed';
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
