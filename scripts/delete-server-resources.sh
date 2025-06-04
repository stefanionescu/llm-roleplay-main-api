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
# --- Load server IPs using utility script ---
# Get the directory of the current script
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
UTIL_SCRIPT_PATH="$SCRIPT_DIR/utils/load-server-ips.sh" # Use the corrected path

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

echo "Processing servers: ${SERVERS[@]}" # Optional: Confirm servers loaded
# --- End Load server IPs ---
DEPLOY_PATH="/opt/llm-roleplay-main-api"

cleanup_server() {
    local server=$1
    echo -e "${GREEN}Cleaning up server: $server${NC}"
    
    ssh root@$server "
        # Stop and cleanup Docker services
        cd $DEPLOY_PATH || exit 0
        
        echo 'Stopping Docker services...'
        
        # Stop all compose services with their project name prefix
        COMPOSE_PROJECT_NAME=\$(basename \$PWD)
        ORPHANS=\$(docker ps --filter \"name=\${COMPOSE_PROJECT_NAME}_\" -aq)
        
        if [ -n \"\$ORPHANS\" ]; then
            echo 'Found orphaned containers, removing...'
            docker stop \$ORPHANS || true
            docker rm \$ORPHANS || true
        fi
        
        # Stop all compose services if docker-compose files exist
        if [ -f docker-compose.yml ] || [ -f docker-compose.yaml ]; then
            echo 'Stopping compose services...'
            docker-compose down --remove-orphans || true
        fi
        
        # Find and remove any leftover containers with our project name
        LEFTOVER_CONTAINERS=\$(docker ps -a --filter \"name=\${COMPOSE_PROJECT_NAME}\" -q)
        if [ -n \"\$LEFTOVER_CONTAINERS\" ]; then
            echo 'Removing leftover containers...'
            docker stop \$LEFTOVER_CONTAINERS || true
            docker rm \$LEFTOVER_CONTAINERS || true
        fi
        
        # Stop and remove all other containers if any remain
        RUNNING_CONTAINERS=\$(docker ps -q)
        if [ -n \"\$RUNNING_CONTAINERS\" ]; then
            echo 'Stopping all remaining containers...'
            docker stop \$RUNNING_CONTAINERS || true
            docker rm \$RUNNING_CONTAINERS || true
        fi

        # Remove project volume
        echo 'Removing project volume...'
        docker volume rm \${COMPOSE_PROJECT_NAME}_model_cache || true
        
        # Cleanup Docker system
        echo 'Cleaning up Docker system...'
        docker system prune -f --volumes || true
        
        # Remove project-related volumes
        PROJECT_VOLUMES=\$(docker volume ls --filter \"name=\${COMPOSE_PROJECT_NAME}\" -q)
        if [ -n \"\$PROJECT_VOLUMES\" ]; then
            echo 'Removing project volumes...'
            docker volume rm \$PROJECT_VOLUMES || true
        fi
        
        # Remove specific images
        echo 'Removing specific Docker images...'
        docker rmi nginx:alpine node:20-bullseye-slim || true
        
        # Remove all remaining volumes
        echo 'Removing remaining volumes...'
        docker volume prune -f || true
        
        # Stop and disable system nginx
        echo 'Stopping system services...'
        systemctl stop nginx || true
        systemctl disable nginx || true
        
        # Also stop the deployed nginx service if it exists
        echo 'Stopping deployed nginx service...'
        systemctl stop llm-roleplay-main-api-nginx || true
        systemctl disable llm-roleplay-main-api-nginx || true
        
        # Kill processes using ports
        echo 'Checking for processes using ports...'
        for port in 80 443 3000 3001 9090 9091 9093 9100 9113; do
            if command -v lsof > /dev/null; then
                PROCESSES=\$(lsof -ti \":\$port\" 2>/dev/null || true)
                if [ -n \"\$PROCESSES\" ]; then
                    echo \"Killing processes on port \$port...\"
                    kill -9 \$PROCESSES || true
                fi
            else
                if netstat -tuln | grep -q \":\$port \"; then
                    echo \"Killing processes on port \$port...\"
                    fuser -k \"\$port/tcp\" || true
                fi
            fi
        done
        
        # Remove application directory and related files
        echo 'Removing application directory and related files...'
        cd /opt || exit 0
        rm -rf llm-roleplay-main-api
        
        # Clean npm cache
        echo 'Cleaning npm cache...'
        npm cache clean --force || true
        
        # Final Docker cleanup
        echo 'Performing final Docker cleanup...'
        docker network prune -f
        docker system prune -af --volumes
        
        echo -e "\${GREEN}Cleanup completed on server\${NC}"
        
        # Verify cleanup
        echo 'Verifying cleanup...'
        echo 'Checking containers:'
        docker ps -a
        echo 'Checking volumes:'
        docker volume ls
        echo 'Checking images:'
        docker images
        echo 'Checking networks:'
        docker network ls
    "
}

# Main execution
for server in "${SERVERS[@]}"; do
    if ! ping -c 1 $server &> /dev/null; then
        echo -e "${RED}Error: Cannot reach server $server${NC}"
        continue
    fi
    
    if cleanup_server $server; then
        echo -e "${GREEN}Successfully cleaned up server: $server${NC}"
    else
        echo -e "${RED}Failed to clean up server: $server${NC}"
        exit 1
    fi
done

echo -e "${GREEN}All servers cleaned up successfully${NC}"

