export interface ServerConfig {
  port: number;
  host: string;
  apiKey: string;
  allowedIPs: string[];
}

export interface TaskConfig {
  name: string;
  prompt: string;
  workingDir: string;
  schedule?: string;
  notifyOn: ('success' | 'failure')[];
  enabled: boolean;
}

export interface APIConfig {
  name: string;
  type: 'rest' | 'mcp';
  baseUrl?: string;
  auth?: {
    type: 'header' | 'bearer';
    header?: string;
    token: string;
  };
}

export interface AppConfig {
  server: ServerConfig;
  tasks: Record<string, TaskConfig>;
  apis: Record<string, APIConfig>;
  pushbullet: {
    token: string;
  };
  logDir: string;
}
