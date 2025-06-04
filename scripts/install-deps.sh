#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if ssh-agent is running and keys are added
if ! ssh-add -l &>/dev/null; then
    echo -e "${RED}No SSH keys found in ssh-agent. Please run:${NC}"
    echo "eval \$(ssh-agent -s)"
    echo "ssh-add ~/.ssh/your_private_key"
    exit 1
fi

# Configuration
NODE_VERSION="20"
DEPLOY_PATH="/opt/llm-roleplay-main-api"

# Get the directory of the current script
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
UTIL_SCRIPT_PATH="$SCRIPT_DIR/utils/load-server-ips.sh"

# Check if the utility script exists
if [ ! -f "$UTIL_SCRIPT_PATH" ]; then
  echo "Error: Utility script load-server-ips.sh not found at $UTIL_SCRIPT_PATH" >&2
  exit 1
fi

# Execute the utility script and capture its output (the server IPs)
SERVER_IPS_STR=$("$UTIL_SCRIPT_PATH")
UTIL_EXIT_CODE=$?

# Check if the utility script executed successfully
if [ $UTIL_EXIT_CODE -ne 0 ]; then
  # Error message was already printed by the utility script to stderr
  exit 1
fi

# Convert the space-separated string into an array
IFS=' ' read -r -a SERVERS <<< "$SERVER_IPS_STR"

# Check if the array is empty
if [ ${#SERVERS[@]} -eq 0 ]; then
    echo "Error: Failed to parse server IPs." >&2
    exit 1
fi

echo "Found servers: ${SERVERS[@]}"

# Local logging functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Function to check if server is reachable
check_server() {
    local server=$1
    if ! ping -c 1 -W 1 $server &> /dev/null; then # Added timeout -W 1
        log_error "Server $server is not reachable"
        return 1
    fi
    return 0
}

# Function to install Node.js
install_node() {
    local server=$1
    log_info "Installing Node.js ${NODE_VERSION} on $server..."

    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "
        set -e # Exit immediately if a command exits with a non-zero status.
        if ! command -v node &> /dev/null; then
            echo 'Installing Node.js...'
            curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -e || { echo 'NodeSource setup script failed'; exit 1; }
            apt-get update
            apt-get install -y nodejs || { echo 'Node.js installation failed'; exit 1; }
            echo 'Node.js installed successfully: ' \$(node -v)
        else
            current_version=\$(node -v)
            if [[ \$current_version == *\"${NODE_VERSION}\"* ]]; then
                echo 'Node.js \${current_version} is already installed'
            else
                echo 'Updating Node.js from \${current_version}'
                curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -e || { echo 'NodeSource setup script failed'; exit 1; }
                apt-get update
                apt-get install -y nodejs || { echo 'Node.js update failed'; exit 1; }
                echo 'Node.js updated to ' \$(node -v)
            fi
        fi
    " || {
        log_error "Failed to install/update Node.js on $server"
        return 1 # Indicate failure
    }
}

# Function to install and configure Docker
install_docker() {
    local server=$1
    log_info "Installing Docker and dependencies on $server..."

    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "
        set -e # Exit on error
        echo 'Updating package lists...'
        apt-get update

        echo 'Installing dependencies...'
        apt-get install -y \
            apt-transport-https \
            ca-certificates \
            curl \
            gnupg \
            lsb-release \
            software-properties-common || { echo 'Failed to install dependencies'; exit 1; }

        if ! command -v docker &> /dev/null; then
            echo 'Installing Docker...'
            apt-get install -y docker.io || { echo 'Docker installation failed'; exit 1; }
            systemctl enable docker || echo 'Warning: Failed to enable docker service'
            systemctl start docker || echo 'Warning: Failed to start docker service'
            echo 'Docker installed successfully'
        else
            echo 'Docker is already installed'
        fi

        if ! command -v docker-compose &> /dev/null; then
            echo 'Installing Docker Compose...'
            apt-get install -y docker-compose || { echo 'Docker Compose installation failed'; exit 1; }
            echo 'Docker Compose installed successfully'
        else
            echo 'Docker Compose is already installed'
        fi

        docker --version
        docker-compose --version
    " || {
        log_error "Failed to install Docker/Compose on $server"
        return 1
    }
}

# Function to install and configure Nginx and Certbot
install_nginx() {
    local server=$1
    log_info "Installing Nginx and Certbot on $server..."

    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "
        set -e
        echo 'Installing Nginx and Certbot...'
        apt-get install -y nginx certbot python3-certbot-nginx || { echo 'Nginx/Certbot installation failed'; exit 1; }

        systemctl enable nginx || echo 'Warning: Failed to enable nginx service'
        systemctl start nginx || echo 'Warning: Failed to start nginx service'

        mkdir -p /etc/letsencrypt
        mkdir -p /var/lib/letsencrypt
        mkdir -p /var/log/letsencrypt

        nginx -t || { echo 'Nginx configuration test failed'; exit 1; }

        echo 'Nginx and Certbot installed successfully'
    " || {
        log_error "Failed to install Nginx/Certbot on $server"
        return 1
    }
}

# Function to setup deployment directory
setup_deploy_dir() {
    local server=$1
    log_info "Setting up deployment directory on $server..."

    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "
        set -e
        echo 'Creating deployment directories...'
        mkdir -p ${DEPLOY_PATH}
        chmod 755 ${DEPLOY_PATH}

        mkdir -p ${DEPLOY_PATH}/certbot/conf
        mkdir -p ${DEPLOY_PATH}/certbot/www

        echo 'Deployment directory setup completed'
    " || {
        log_error "Failed to setup deployment directory on $server"
        return 1
    }
}

# Function to setup system configurations
setup_system() {
    local server=$1
    log_info "Configuring system settings on $server..."

    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "
        set -e
        echo 'Setting up system limits...'
        cat > /etc/security/limits.d/custom.conf <<EOL
*         soft    nofile      65535
*         hard    nofile      65535
root      soft    nofile      65535
root      hard    nofile      65535
EOL

        echo 'Setting up sysctl configurations...'
        cat > /etc/sysctl.d/99-custom.conf <<EOL
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_keepalive_intvl = 15
EOL

        echo 'Applying sysctl settings...'
        sysctl -p /etc/sysctl.d/99-custom.conf

        echo 'System configurations applied'
    " || {
        log_error "Failed to apply system configurations on $server"
        return 1
    }
}

# Main execution
failed_servers=()
for server in "${SERVERS[@]}"; do
    log_info "Initializing server: $server"

    if ! check_server $server; then
        failed_servers+=("$server (connectivity)")
        continue
    fi

    # Run setup steps, continue to next server on failure
    if ! install_node $server; then failed_servers+=("$server (node)"); continue; fi
    if ! install_docker $server; then failed_servers+=("$server (docker)"); continue; fi
    if ! install_nginx $server; then failed_servers+=("$server (nginx)"); continue; fi
    if ! setup_deploy_dir $server; then failed_servers+=("$server (deploy_dir)"); continue; fi
    if ! setup_system $server; then failed_servers+=("$server (system)"); continue; fi

    log_info "Server $server initialization completed successfully"
done

if [ ${#failed_servers[@]} -eq 0 ]; then
    log_info "All servers initialized successfully"
    exit 0
else
    log_error "Initialization failed for the following servers: ${failed_servers[*]}"
    exit 1
fi