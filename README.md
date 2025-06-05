# LLM Roleplay Main API

REST API service providing RAG (Retrieval Augmented Generation), embeddings, user waitlist management and user registration functionality. Deployed on Hetzner Cloud.

## Setup

1. Install dependencies:

```bash
bun install
```

2. Configure environment:

```bash
cp .env
# Edit .env with your values
```

3. Build:

```bash
bun run build
```

## Run

```bash
bun run start
```

## API Endpoints

All endpoints under `/rag` and `/user-management` require a valid API token passed in the `Authorization` header.

### Unauthenticated

- `GET /health` - Check service health status, including embedding pipeline.

### RAG & Embeddings (Auth Required - Base Path: `/rag`)

- `GET /rag/hybrid-rag` - Hybrid semantic/keyword search.
- `GET /rag/semantic-rag` - Pure semantic search.
- `GET /rag/semantic-rag-with-hashtags` - Semantic search with hashtag filtering.
- `GET /rag/hybrid-rag-with-hashtags` - Hybrid search with hashtag filtering.

### User & Waitlist Management (Auth Required - Base Path: `/user-management`)

- `POST /user-management/add-to-waitlist` - Add user (by username) to waitlist.
- `GET /user-management/is-on-waitlist` - Check if user (by username) is on waitlist.
- `GET /user-management/waitlist-user-can-sign-up` - Check user's (by username) waitlist status and eligibility to sign up.
- `POST /user-management/register-user` - Register a user (by username).

## Production Deployment

### Prerequisites

- Domain with access to DNS settings
- SSH access to Hetzner servers
- API servers and load balancer configured on Hetzner Cloud

### Deployment Steps

1. Add your host/server name in nginx.conf file

2. Generate a certificate first and import it on Hetzner.

3. Deploy API Files:

```bash
# Deploy code and configurations to all servers
./scripts/deploy-to-server.sh
```

4. Start API Services:

```bash
# Start Docker containers on all servers
./scripts/start-api.sh
```

5. Verify Deployment:

```bash
# Check health of all services
./scripts/manual-health-check.sh
```

### Troubleshooting

- If SSL generation fails, ensure DNS propagation is complete
- For deployment issues, check server logs with `docker-compose logs`
