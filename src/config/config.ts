import { AppConfig } from './types';

const CONFIG_PATH = '/etc/claude-automation/config.json';
const TASKS_PATH = '/etc/claude-automation/tasks.json';
const APIS_PATH = '/etc/claude-automation/apis.json';

export async function loadConfig(): Promise<AppConfig> {
  // For development, use local config if /etc path doesn't exist
  const configPath = await Bun.file(CONFIG_PATH).exists() ? CONFIG_PATH : './config/config.json';
  const tasksPath = await Bun.file(TASKS_PATH).exists() ? TASKS_PATH : './config/tasks.json';
  const apisPath = await Bun.file(APIS_PATH).exists() ? APIS_PATH : './config/apis.json';

  const config = await Bun.file(configPath).json();
  const tasks = await Bun.file(tasksPath).json();
  const apis = await Bun.file(apisPath).json();

  return {
    server: config.server,
    tasks: tasks,
    apis: apis,
    pushbullet: config.pushbullet,
    logDir: config.logDir || '/var/log/claude-tasks'
  };
}

export async function reloadConfig(): Promise<AppConfig> {
  return loadConfig();
}
