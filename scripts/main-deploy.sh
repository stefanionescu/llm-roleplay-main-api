#!/bin/bash
echo "Starting deployment..."
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml down
docker system prune -f
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml build --no-cache
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
echo "Deployment complete!"