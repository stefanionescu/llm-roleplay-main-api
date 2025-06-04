#!/bin/bash

# Determine the script's directory and the project root directory
UTIL_SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
PROJECT_ROOT="$UTIL_SCRIPT_DIR/../.."
ENV_FILE="$PROJECT_ROOT/.env"

# Check if the .env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE" >&2
  exit 1
fi

# Find the SERVER_IPS line, remove comments, and extract the value
SERVER_IPS_VALUE=$(grep '^SERVER_IPS=' "$ENV_FILE" | sed 's/^SERVER_IPS=//' | sed 's/"//g' | sed 's/\s*$//' ) # Remove quotes and trailing whitespace

# Check if SERVER_IPS was found and is not empty
if [ -z "$SERVER_IPS_VALUE" ]; then
  echo "Error: SERVER_IPS is not defined or is empty in $ENV_FILE" >&2
  exit 1
fi

# Output the validated server IPs to stdout
echo "$SERVER_IPS_VALUE"

exit 0 