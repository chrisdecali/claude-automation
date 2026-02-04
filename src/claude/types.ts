export interface SessionOptions {
  taskName: string;
  prompt: string;
  workingDir: string;
}

export interface SessionCompletionStatus {
    status: 'completed' | 'failed';
    exitCode: number;
    error?: string;
}

export interface ClaudeSession {
  id: string;
  taskName: string;
  prompt: string;
  workingDir: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed';
  output: { stream: 'stdout' | 'stderr'; data: string }[];
  exitCode?: number;
  completion: Promise<SessionCompletionStatus>;
}
