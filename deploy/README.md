# Deployment Guide

This guide provides instructions for deploying the Claude Automation service on a Linux system using systemd.

## Prerequisites

- A Linux server (tested on Debian/Ubuntu).
- `bun` installed globally (`npm install -g bun`).
- `rsync` and `git`.

## Installation

The provided `install.sh` script automates the setup process.

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Run the installation script:**
    From the root of the project directory, run the script with `sudo`:
    ```bash
    sudo bash deploy/install.sh
    ```

### What the script does:

-   **Creates a dedicated user and group `claude`** to run the application securely.
-   **Creates directories:**
    -   `/opt/claude-automation`: For application files.
    -   `/etc/claude-automation`: For configuration files.
    -   `/var/log/claude-tasks`: For logs.
-   **Copies application files** to `/opt/claude-automation`.
-   **Sets appropriate permissions** for the created directories.
-   **Installs production Node.js dependencies** using `bun install --production`.
-   **Copies example configuration files** to `/etc/claude-automation`. You will need to rename and edit these.
-   **Installs and enables the `claude-automation.service` systemd unit.**

## Post-Installation Configuration

1.  **Navigate to the configuration directory:**
    ```bash
    cd /etc/claude-automation
    ```

2.  **Create your configuration files from the examples:**
    ```bash
    sudo cp config.json.example config.json
    sudo cp tasks.json.example tasks.json
    sudo cp apis.json.example apis.json
    ```

3.  **Edit the configuration files** with your settings (e.g., API keys, ports, task definitions):
    ```bash
    sudo nano config.json
    sudo nano tasks.json
    sudo nano apis.json
    ```
    Ensure you set the correct ownership if you created the files manually:
    ```bash
    sudo chown claude:claude /etc/claude-automation/*
    ```

## Managing the Service

Once configured, you can manage the service using `systemctl`:

-   **Start the service:**
    ```bash
    sudo systemctl start claude-automation.service
    ```

-   **Stop the service:**
    ```bash
    sudo systemctl stop claude-automation.service
    ```

-   **Restart the service:**
    ```bash
    sudo systemctl restart claude-automation.service
    ```

-   **Check the service status:**
    ```bash
    sudo systemctl status claude-automation.service
    ```

-   **View logs:**
    ```bash
    sudo journalctl -u claude-automation.service -f
    ```

## Uninstallation

To remove the service and application files:

```bash
sudo systemctl stop claude-automation.service
sudo systemctl disable claude-automation.service
sudo rm /etc/systemd/system/claude-automation.service
sudo systemctl daemon-reload
sudo userdel claude
sudo groupdel claude
sudo rm -rf /opt/claude-automation
sudo rm -rf /etc/claude-automation
sudo rm -rf /var/log/claude-tasks
```
