#!/bin/bash
set -e

APP_DIR="/opt/claude-automation"
CONFIG_DIR="/etc/claude-automation"
LOG_DIR="/var/log/claude-tasks"
USER="claude"

echo "Starting Claude Automation installation..."

# 1. Create user and group
if ! getent group $USER >/dev/null; then
    echo "Creating group '$USER'..."
    groupadd --system $USER
else
    echo "Group '$USER' already exists."
fi

if ! id -u $USER >/dev/null 2>&1; then
    echo "Creating user '$USER'..."
    useradd --system --gid $USER --shell /bin/false --home-dir $APP_DIR $USER
else
    echo "User '$USER' already exists."
fi

# 2. Create directories
echo "Creating directories..."
mkdir -p $APP_DIR
mkdir -p $CONFIG_DIR
mkdir -p $LOG_DIR

# 3. Copy application files
echo "Copying application files to $APP_DIR..."
# This assumes the script is run from the project root
rsync -a --exclude 'deploy' --exclude '.git' --exclude '.worktrees' ./ $APP_DIR/

# 4. Set permissions
echo "Setting permissions..."
chown -R $USER:$USER $APP_DIR
chown -R $USER:$USER $CONFIG_DIR
chown -R $USER:$USER $LOG_DIR
chmod -R 750 $APP_DIR
chmod -R 750 $CONFIG_DIR
chmod -R 750 $LOG_DIR

# 5. Ensure bun is available system-wide
if ! command -v bun &> /dev/null; then
    echo "Installing bun system-wide..."
    if [ -f "/root/.bun/bin/bun" ]; then
        cp /root/.bun/bin/bun /usr/local/bin/bun
        chmod +x /usr/local/bin/bun
        echo "Bun installed to /usr/local/bin/bun"
    else
        echo "ERROR: Bun not found at /root/.bun/bin/bun"
        echo "Please install bun first: curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi
else
    echo "Bun already available at $(which bun)"
fi

# 6. Install dependencies
echo "Installing dependencies..."
cd $APP_DIR
sudo -u $USER bun install --production

# 7. Setup configuration
if [ ! -f "$CONFIG_DIR/config.json" ]; then
    echo "Copying example config.json..."
    cp $APP_DIR/config/config.json $CONFIG_DIR/config.json.example
    chown $USER:$USER $CONFIG_DIR/config.json.example
fi
if [ ! -f "$CONFIG_DIR/tasks.json" ]; then
    echo "Copying example tasks.json..."
    cp $APP_DIR/config/tasks.json $CONFIG_DIR/tasks.json.example
    chown $USER:$USER $CONFIG_DIR/tasks.json.example
fi
if [ ! -f "$CONFIG_DIR/apis.json" ]; then
    echo "Copying example apis.json..."
    cp $APP_DIR/config/apis.json $CONFIG_DIR/apis.json.example
    chown $USER:$USER $CONFIG_DIR/apis.json.example
fi
echo "NOTE: Example configs copied to $CONFIG_DIR. Please rename and configure them."

# 8. Install and enable systemd service
echo "Installing systemd service..."
# Copy from source location (where this script is) since deploy dir is excluded from rsync
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cp "$SCRIPT_DIR/claude-automation.service" /etc/systemd/system/claude-automation.service
systemctl daemon-reload
systemctl enable claude-automation.service

echo "Installation complete!"
echo "Please configure your files in $CONFIG_DIR"
echo "You can start the service with: sudo systemctl start claude-automation.service"
echo "Check status with: sudo systemctl status claude-automation.service"
