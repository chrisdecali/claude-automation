# Claude Automation Droplet

Claude Automation Droplet is a lightweight, self-hosted automation server designed to run tasks using a headless Claude CLI. It provides a simple web interface for real-time interaction, cron-based scheduling, and a secure API for remote execution. Built with Bun, it's fast, efficient, and easy to deploy.

![Web Interface Screenshot](docs/screenshot.png) <!--- Placeholder for a screenshot -->

## Features

- **Claude Integration:** Executes prompts via a headless Claude CLI, enabling complex, language-model-driven automation.
- **Real-time Web UI:** A simple chat-like interface to interact with your tasks and see live output streams.
- **Scheduled Tasks:** Uses cron syntax to schedule recurring tasks.
- **Remote Execution:** Secure API endpoint to trigger tasks remotely.
- **Hot Reloading:** Automatically reloads configuration and restarts the server on-the-fly when config files change.
- **Notifications:** Integrated with Pushbullet to notify you of task success or failure.
- **Extensible:** Easily define new tasks, APIs, and prompts through simple JSON configuration.
- **Lightweight:** Built on Bun, offering a minimal footprint and excellent performance.

## Quick Start

### 1. Prerequisites
- [Bun](https://bun.sh/) (v1.0 or later)
- `git`

### 2. Installation & Deployment
For production deployment on a Linux server, a `systemd` service is recommended. An installation script is provided to automate this process.

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <repository-name>
   ```
2. Run the installation script:
   ```bash
   sudo bash deploy/install.sh
   ```
This will set up the application in `/opt/claude-automation`, create a dedicated `claude` user, and install a `systemd` service.

For detailed instructions, see the [Deployment Guide](./deploy/README.md).

### 3. Configuration
Configuration files are located in `/etc/claude-automation`.
- `config.json`: Main server settings (port, API key, etc.).
- `tasks.json`: Definitions for all your automation tasks.
- `apis.json`: Credentials and base URLs for third-party APIs.

You must configure these files before starting the service. See the [Usage Guide](./docs/usage-guide.md) for more details.

### 4. Running the Service
```bash
# Start the service
sudo systemctl start claude-automation.service

# Check its status
sudo systemctl status claude-automation.service

# View live logs
sudo journalctl -u claude-automation.service -f
```

### 5. Development
To run in development mode:
1. Clone the repository.
2. Install dependencies: `bun install`.
3. Create local config files in the `config/` directory.
4. Start the server: `bun src/server.ts`.

## Usage
For detailed information on how to use the web interface, define tasks, and integrate with other APIs, please read the [Usage Guide](./docs/usage-guide.md).

## API Integration
Learn how to connect the automation service with external APIs like Radarr, Sonarr, Trakt, and more in our [API Integration Guide](./docs/api-integration-guide.md).