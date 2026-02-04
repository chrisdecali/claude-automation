export interface SessionOptions {
  taskName: string;
  prompt: string;
  workingDir: string;
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
}
