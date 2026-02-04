# Usage Guide

This guide provides a comprehensive overview of how to use the Claude Automation Droplet, from the web interface to defining custom tasks.

## Web Interface

The web interface is available at `http://<your-server-ip>:<port>`. It is divided into two main sections: a chat/interaction panel and a dashboard.

### Chat Interface
The left panel allows for real-time interaction with a Claude session.
- **Task Selection:** Choose a predefined task from the dropdown menu. The prompt associated with that task will be loaded.
- **Prompt Input:** You can modify the loaded prompt or write a new one from scratch.
- **Run Task:** Click the "Run" button to execute the prompt. The output from the Claude CLI will be streamed in real-time into the message area.

### Dashboard
The right panel provides an overview of the system's status.
- **Active Sessions:** A list of currently running or recently completed tasks.
- **Scheduled Tasks:** A view of all tasks configured to run on a cron schedule.
- **System Logs:** Key events from the server log.

## Configuration

All configuration is done via JSON files, typically located in `/etc/claude-automation` for production deployments.

### Main Config: `config.json`
This file contains global settings for the server.

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0",
    "apiKey": "a-very-secret-key",
    "allowedIPs": ["127.0.0.1", "::1"]
  },
  "pushbullet": {
    "token": "your-pushbullet-token"
  },
  "logDir": "/var/log/claude-tasks"
}
```
- `server.apiKey`: A secret key used to authorize API requests.
- `server.allowedIPs`: A whitelist of IP addresses allowed to connect (in addition to API key).
- `pushbullet.token`: Your Pushbullet access token for notifications.

### Task Definitions: `tasks.json`
This is where you define the automations you want to run.

```json
{
  "example-task": {
    "name": "Example Task",
    "prompt": "Summarize the latest news from bbc.com.",
    "workingDir": "/root/claude-work/news-summary",
    "schedule": "0 8 * * *",
    "notifyOn": ["success", "failure"],
    "enabled": true
  }
}
```
- `name`: A human-readable name for the task.
- `prompt`: The prompt to send to the Claude CLI.
- `workingDir`: The directory where the Claude CLI process will be executed. This is important for tasks that interact with local files.
- `schedule`: (Optional) A cron string defining when the task should run automatically.
- `notifyOn`: (Optional) An array specifying when to send a Pushbullet notification. Can be `success`, `failure`, or both.
- `enabled`: If `false`, the task will not be scheduled or shown in the UI.

### API Definitions: `apis.json`
Define credentials for external REST APIs here. See the [API Integration Guide](./api-integration-guide.md) for detailed examples.

## API Usage

The server exposes a simple REST API for remote control. All requests must include the `Authorization: Bearer <your-api-key>` header.

### Trigger a Task
- **Endpoint:** `POST /api/tasks/{taskName}/run`
- **Description:** Manually triggers a named task. The `{taskName}` must match a key in `tasks.json`.
- **Response:**
  ```json
  {
    "message": "Task started.",
    "sessionId": "a-unique-session-id"
  }
  ```

### Get Session Status
- **Endpoint:** `GET /api/sessions/{sessionId}`
- **Description:** Retrieves the status and output of a specific task session.
- **Response:** A `ClaudeSession` object.
  ```json
  {
    "id": "a-unique-session-id",
    "taskName": "Example Task",
    "status": "completed",
    "startTime": "...",
    "endTime": "...",
    "output": [
      {"stream": "stdout", "content": "The summary is..."},
      {"stream": "stderr", "content": ""}
    ]
  }
  ```
