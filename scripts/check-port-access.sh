#!/bin/bash

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

# Check UFW status on both servers
for server in "${SERVERS[@]}"; do
    echo "=== Checking UFW on $server ==="
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "ufw status" || echo "Warning: Failed to connect or run command on $server"
done

# Check docker containers on both servers
for server in "${SERVERS[@]}"; do
    echo "=== Checking Docker containers on $server ==="
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "docker ps" || echo "Warning: Failed to connect or run command on $server"
done

# Check Nginx config on both servers
for server in "${SERVERS[@]}"; do
    echo "=== Checking Nginx config on $server ==="
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "docker exec llm-roleplay-main-api_nginx_1 cat /etc/nginx/conf.d/default.conf" || echo "Warning: Failed to connect or run command on $server"
done

# Check Nginx logs on both servers
for server in "${SERVERS[@]}"; do
    echo "=== Checking Nginx logs on $server ==="
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "docker logs llm-roleplay-main-api_nginx_1" || echo "Warning: Failed to connect or run command on $server"
done

# Check Nginx runtime config on both servers
for server in "${SERVERS[@]}"; do
    echo "=== Checking Nginx runtime config on $server ==="
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server "docker exec llm-roleplay-main-api_nginx_1 nginx -T" || echo "Warning: Failed to connect or run command on $server"
done

echo "Port access check complete."
