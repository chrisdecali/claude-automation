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

    async runPrompt(prompt: string, conversationHistory: ConversationMessage[], workingDir: string, maxRetries: number = 3): Promise<{ stream: ReadableStream<Uint8Array>; completion: Promise<PromptResult> }> {
        await mkdir(workingDir, { recursive: true });

        let formattedPrompt: string;
        if (conversationHistory.length > 0) {
            const historyText = conversationHistory
                .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                .join('\n\n');
            formattedPrompt = `Continue this conversation naturally. Here is the history:\n\n${historyText}\n\nUser: ${prompt}\n\nRespond only to the latest message. Do not repeat the conversation.`;
        } else {
            formattedPrompt = prompt;
        }

        // Try with retries for transient API errors (500, 529)
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const { stream, completion } = this.spawnClaude(formattedPrompt, workingDir);

            // For the last attempt, return as-is (let caller handle errors)
            if (attempt === maxRetries) {
                return { stream, completion };
            }

            // For earlier attempts, wait for result and check if retryable
            // We need to consume the stream to check the result
            const reader = stream.getReader();
            let output = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                output += new TextDecoder().decode(value, { stream: true });
            }

            const result = await completion;
            const isRetryable = result.exitCode !== 0 &&
                (result.stderr.includes('500') || result.stderr.includes('529') ||
                 result.stderr.includes('Internal server error') || result.stderr.includes('overloaded'));

            if (!isRetryable) {
                // Not a retryable error (or success) — return a synthetic stream with the captured output
                const encoded = new TextEncoder().encode(result.output || output);
                const syntheticStream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(encoded);
                        controller.close();
                    }
                });
                return { stream: syntheticStream, completion: Promise.resolve(result) };
            }

            // Wait before retrying (exponential backoff: 2s, 4s)
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Should never reach here, but TypeScript needs it
        return this.spawnClaude(formattedPrompt, workingDir);
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
