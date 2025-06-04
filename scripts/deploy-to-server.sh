#!/bin/bash
set -euo pipefail

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if ssh-agent is running and keys are added
if ! ssh-add -l &>/dev/null; then
    echo -e "${RED}No SSH keys found in ssh-agent. Please run:${NC}"
    echo "eval \$(ssh-agent -s)"
    echo "ssh-add ~/.ssh/your_private_key"
    exit 1
fi

# Configuration
DEPLOY_PATH="/opt/llm-roleplay-main-api"
FILES_TO_COPY=(
    "src"
    ".env"
    "package.json"
    "tsconfig.json"
    "Dockerfile"
    "docker-compose.yml"
    "nginx.conf"
    ".dockerignore"
    "ssl"
)

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

# Function to get file permissions (cross-platform)
get_permissions() {
    local file=$1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        stat -f "%Lp" "$file"
    else
        # Linux
        stat -c "%a" "$file"
    fi
}

# Function to check if server is reachable
check_server() {
    local server=$1
    if ! ping -c 1 -W 1 $server &> /dev/null; then # Added timeout -W 1
        echo -e "${RED}Error: Server $server is not reachable${NC}"
        return 1
    fi
}

# Function to verify environment variables
verify_env_file() {
    local required_vars=(
        "API_TOKEN"
        "SUPABASE_URL"
        "SUPABASE_SERVICE_ROLE_KEY"
    )

    if [ ! -f "../.env" ]; then
        echo -e "${RED}.env file missing${NC}"
        return 1
    fi

    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "../.env"; then
            echo -e "${RED}Missing required env variable: ${var}${NC}"
            return 1
        fi
    done
}

# Function to cleanup old deployments
cleanup_old_deployments() {
    local server=$1
    local keep_builds=5

    echo -e "${GREEN}Cleaning up old deployments on $server...${NC}"
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "cd /opt && ls -t llm-roleplay-main-api.backup.* 2>/dev/null | 
        tail -n +$((keep_builds + 1)) | xargs -r rm -rf" || echo -e "${YELLOW}Warning: Failed to cleanup old deployments on $server${NC}"
}

# Function to verify SSL files
verify_ssl_files() {
    if [ ! -d "../ssl" ] || [ ! -f "../ssl/server.key" ] || [ ! -f "../ssl/server.crt" ]; then
        echo -e "${RED}SSL certificates not found${NC}"
        return 1
    fi

    # Verify SSL certificate permissions
    local key_perms=$(get_permissions "../ssl/server.key")
    local cert_perms=$(get_permissions "../ssl/server.crt")

    if [ "$key_perms" != "600" ]; then
        chmod 600 "../ssl/server.key"
    fi
    if [ "$cert_perms" != "644" ]; then
        chmod 644 "../ssl/server.crt"
    fi
}

# Function to verify SSL on server
verify_ssl_on_server() {
    local server=$1
    echo -e "${GREEN}Verifying SSL configuration on $server...${NC}"
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "cd $DEPLOY_PATH && {
        if [ ! -d 'ssl' ] || [ ! -f 'ssl/server.key' ] || [ ! -f 'ssl/server.crt' ]; then
            echo -e '${RED}SSL certificates missing on server${NC}'
            exit 1
        fi
        # Set permissions (Linux server)
        chmod 600 ssl/server.key
        chmod 644 ssl/server.crt
    }" || {
        echo -e "${RED}Failed to verify SSL on server $server${NC}"
        return 1
    }
}

# Function to verify critical files
verify_critical_files() {
    local critical_files=(
        "package.json"
        "Dockerfile"
        "docker-compose.yml"
    )
    local missing_files=()

    for file in "${critical_files[@]}"; do
        if [ ! -e "../$file" ]; then
            missing_files+=($file)
        fi
    done

    if [ ${#missing_files[@]} -ne 0 ]; then
        echo -e "${RED}Error: Critical files missing: ${missing_files[*]}${NC}"
        return 1
    fi
}

# Function to copy files
copy_files() {
    local server=$1
    echo -e "${GREEN}Copying files to $server...${NC}"

    # Create directory with proper permissions
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "mkdir -p $DEPLOY_PATH && chmod 755 $DEPLOY_PATH" || {
        echo -e "${RED}Failed to create directory on $server${NC}"
        return 1
    }

    # Create backup of current deployment if it exists
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "if [ -d $DEPLOY_PATH ]; then 
        timestamp=\$(date +%Y%m%d_%H%M%S)
        cp -r $DEPLOY_PATH ${DEPLOY_PATH}.backup.\$timestamp
    fi" || echo -e "${YELLOW}Warning: Failed to create backup on $server${NC}"

    # Copy project files
    for file in "${FILES_TO_COPY[@]}"; do
        if [ -e "../$file" ]; then
            echo "Copying $file..."
            scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no -r "../$file" "root@$server:$DEPLOY_PATH/" || {
                echo -e "${RED}Failed to copy $file to $server${NC}"
                return 1
            }
        else
            echo -e "${YELLOW}Warning: $file not found, skipping...${NC}"
        fi
    done

    # Copy deployment script
    echo "Copying deployment script..."
    scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no -r "main-deploy.sh" "root@$server:$DEPLOY_PATH/" || {
        echo -e "${RED}Failed to copy main-deploy.sh to $server${NC}"
        return 1
    }

    # Set permissions
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "cd $DEPLOY_PATH && chmod +x main-deploy.sh" || {
        echo -e "${RED}Failed to set permissions on main-deploy.sh on $server${NC}"
        return 1
    }

    # Verify copied files
    echo "Verifying copied files..."
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "cd $DEPLOY_PATH && {
        if [ ! -f package.json ] || [ ! -f Dockerfile ]; then
            echo 'Critical files missing after copy'
            exit 1
        fi
    }" || {
        echo -e "${RED}File verification failed on $server${NC}"
        return 1
    }
}

# Main execution
echo -e "${GREEN}Starting deployment process${NC}"

# Verify critical files, SSL, and environment variables before starting
if ! verify_critical_files; then
    echo -e "${RED}Critical files verification failed${NC}"
    exit 1
fi

if ! verify_ssl_files; then
    echo -e "${RED}SSL verification failed${NC}"
    exit 1
fi

if ! verify_env_file; then
    echo -e "${RED}Environment file verification failed${NC}"
    exit 1
fi

for server in "${SERVERS[@]}"; do
    echo -e "${GREEN}Processing server: $server${NC}"
    if check_server $server; then
        # Clean up old deployments first
        cleanup_old_deployments "$server"

        if copy_files $server; then
            if verify_ssl_on_server $server; then
                echo -e "${GREEN}Successfully deployed to $server${NC}"
            else
                echo -e "${RED}Failed to verify SSL on $server${NC}"
                # Decide if this should halt the entire deployment
                # exit 1
            fi
        else
            echo -e "${RED}Failed to deploy to $server${NC}"
            # Decide if this should halt the entire deployment
            # exit 1
        fi
    else
        echo -e "${YELLOW}Skipping server $server due to connectivity issues${NC}"
    fi
done

echo -e "${GREEN}Deployment process finished.${NC}"

