#!/bin/bash
set -euo pipefail

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load environment variables
if [ -f ../.env ]; then
    source ../.env
elif [ -f .env ]; then
    source .env
else
    echo -e "${RED}Error: .env file not found in parent or current directory${NC}"
    exit 1
fi

# Verify API_TOKEN is set
if [ -z "${API_TOKEN:-}" ]; then
    echo -e "${RED}Error: API_TOKEN is not set in .env file${NC}"
    exit 1
fi

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

echo "Processing servers: ${SERVERS[@]}" # Optional: Confirm servers loaded
# --- End Load server IPs ---
DEPLOY_PATH="/opt/llm-roleplay-main-api"

# Function to check if docker is running
check_docker() {
    local server=$1
    if ! ssh root@$server "systemctl is-active --quiet docker"; then
        echo -e "${YELLOW}Docker is not running on $server, attempting to start...${NC}"
        ssh root@$server "systemctl start docker"
        sleep 5
    fi
}

# Function to deploy
deploy() {
    local server=$1
    echo -e "${GREEN}Deploying to $server...${NC}"
    ssh root@$server "cd $DEPLOY_PATH && {
        # Stop all existing services gracefully
        echo 'Stopping all services...'
        docker-compose down --remove-orphans || true
        
        # Cleanup
        echo 'Cleaning up Docker system...'
        docker system prune -f
        
        # Build and start services
        echo 'Building and starting services...'
        docker-compose build --no-cache
        docker-compose up -d
        
        # Wait for services to initialize
        echo 'Waiting for services to initialize...'
        sleep 30
        
        # Service health checks
        echo 'Performing health checks...'
        
        # Check API with retries and longer timeout
        echo 'Checking API health...'
        for i in {1..10}; do
            if curl -f \
                    --connect-timeout 10 \
                    --max-time 30 \
                    http://localhost:3000/health &>/dev/null; then
                echo 'API is healthy'
                break
            fi
            if [ \$i -eq 10 ]; then
                echo -e \"${RED}API health check failed${NC}\"
                docker-compose logs api
                echo -e \"${YELLOW}Warning: API health check failed but continuing deployment${NC}\"
            fi
            echo \"Waiting for API... (attempt \$i/10)\"
            sleep 15
        done
        
        echo -e \"${GREEN}Deployment completed${NC}\"
    }"
}

# Main execution
for server in "${SERVERS[@]}"; do
    echo -e "${GREEN}Processing server: $server${NC}"
    if ! ping -c 1 $server &> /dev/null; then
        echo -e "${RED}Error: Server $server is not reachable${NC}"
        continue
    fi
    # Check and ensure docker is running
    check_docker $server
    # Perform deployment
    if deploy $server; then
        echo -e "${GREEN}Successfully deployed to $server${NC}"
    else
        echo -e "${RED}Failed to deploy to $server${NC}"
        exit 1
    fi
done

echo -e "${GREEN}All deployments completed successfully${NC}"