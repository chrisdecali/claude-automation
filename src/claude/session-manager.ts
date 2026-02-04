import { spawn, Subprocess } from "bun";
import { randomUUID } from "crypto";
import { ClaudeSession, SessionOptions } from './types';
import { mkdir } from 'fs/promises';

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface PromptResult {
    output: string;
    stderr: string;
    exitCode: number;
}

export class SessionManager {
    private activeSessions: Map<string, ClaudeSession> = new Map();

    private spawnClaude(formattedPrompt: string, workingDir: string): { stream: ReadableStream<Uint8Array>; completion: Promise<PromptResult> } {
        const proc = spawn({
            cmd: ["claude", "-p", "--dangerously-skip-permissions", formattedPrompt],
            cwd: workingDir,
            stdout: "pipe",
            stderr: "pipe",
        });

        let resolveCompletion: (result: PromptResult) => void;
        const completion = new Promise<PromptResult>((resolve) => {
            resolveCompletion = resolve;
        });

        let fullOutput = '';
        let stderrOutput = '';
        const outputStream = proc.stdout;

        const [streamForConsumer, streamForCapture] = outputStream.tee();

        const captureReader = streamForCapture.getReader();
        const decoder = new TextDecoder();
        (async () => {
            while (true) {
                const { done, value } = await captureReader.read();
                if (done) break;
                fullOutput += decoder.decode(value, { stream: true });
            }
        })();

        const stderrReader = proc.stderr.getReader();
        const stderrDecoder = new TextDecoder();
        (async () => {
            while (true) {
                const { done, value } = await stderrReader.read();
                if (done) break;
                stderrOutput += stderrDecoder.decode(value, { stream: true });
            }
        })();

        proc.exited.then(exitCode => {
            resolveCompletion({ output: fullOutput, stderr: stderrOutput, exitCode });
        });

        return { stream: streamForConsumer, completion };
    }

    formatPrompt(prompt: string, conversationHistory: ConversationMessage[]): string {
        if (conversationHistory.length > 0) {
            const historyText = conversationHistory
                .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                .join('\n\n');
            return `Continue this conversation naturally. Here is the history:\n\n${historyText}\n\nUser: ${prompt}\n\nRespond only to the latest message. Do not repeat the conversation.`;
        }
        return prompt;
    }

    async runPrompt(prompt: string, conversationHistory: ConversationMessage[], workingDir: string): Promise<{ stream: ReadableStream<Uint8Array>; completion: Promise<PromptResult> }> {
        await mkdir(workingDir, { recursive: true });
        const formattedPrompt = this.formatPrompt(prompt, conversationHistory);
        return this.spawnClaude(formattedPrompt, workingDir);
    }

    isRetryableError(result: PromptResult): boolean {
        return result.exitCode !== 0 &&
            (result.stderr.includes('500') || result.stderr.includes('529') ||
             result.stderr.includes('Internal server error') || result.stderr.includes('overloaded'));
    }

    async startSession(options: SessionOptions): Promise<ClaudeSession> {
        let resolveCompletion: (session: ClaudeSession) => void;
        const completionPromise = new Promise<ClaudeSession>((resolve) => {
            resolveCompletion = resolve;
        });

        const proc = spawn({
            cmd: ["claude", "-p", options.prompt],
            cwd: options.workingDir,
            stdout: "pipe",
            stderr: "pipe",
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

        await mkdir(options.workingDir, { recursive: true });

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
            
            // To ensure the full stdout is captured if not consumed elsewhere
            const stdoutReader = session.outputStream?.getReader();
            if (stdoutReader) {
                const readAll = async () => {
                    while(true) {
                        const {done, value} = await stdoutReader.read();
                        if (done) break;
                        session.output.push({ stream: 'stdout', data: decoder.decode(value) });
                    }
                }
                readAll();
            }

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
