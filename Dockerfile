FROM node:20-bullseye-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    curl \
    libstdc++6 \
    libc6 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/.cache \
    && chmod 777 /app/.cache

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for TypeScript)
RUN npm install

# Copy application files
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN npm run build

# Remove source and dev dependencies
RUN npm prune --production \
    && rm -rf src tsconfig.json

# Add environment variables for better performance
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=10240"
ENV UV_THREADPOOL_SIZE=32
ENV ONNX_BACKEND=cpu
ENV TRANSFORMERS_CACHE="/app/.cache"
ENV TOKENIZERS_PARALLELISM=true

EXPOSE 3000

CMD ["node", "dist/server.js"]
