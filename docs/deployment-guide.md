# Pact Production Deployment Guide

This guide covers deploying Pact in production environments using various deployment strategies.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Production Deployment with Docker Compose](#production-deployment-with-docker-compose)
3. [Manual Deployment (No Docker)](#manual-deployment-no-docker)
4. [Cloud Platform Deployments](#cloud-platform-deployments)
5. [Health Checks & Monitoring](#health-checks--monitoring)
6. [Backup & Recovery](#backup--recovery)
7. [Security Considerations](#security-considerations)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Docker** 24.0+ and **Docker Compose** 2.20+ (for Docker-based deployment)
- **Node.js** 24+ (for manual deployment)
- **PostgreSQL** 18+ (or compatible managed database)
- **Redis** 7+ (for LLM caching and session storage)

### Required API Keys

- **OpenAI API Key** (if using OpenAI as LLM provider)
- **Anthropic API Key** (if using Claude as LLM provider)
- **LangSmith API Key** (optional, for tracing and debugging)

### System Requirements

**Minimum (Development/Testing)**:
- 2 CPU cores
- 4GB RAM
- 20GB disk space

**Recommended (Production)**:
- 4+ CPU cores
- 8GB+ RAM
- 50GB+ disk space (depends on database size)

---

## Production Deployment with Docker Compose

### Step 1: Clone Repository

```bash
git clone https://github.com/your-org/pact.git
cd pact
git checkout v0.1.0  # Or latest release tag
```

### Step 2: Configure Environment

```bash
# Copy production environment template
cp .env.production.example .env.production

# Edit with your production values
nano .env.production
```

**Critical environment variables**:

```bash
# Database credentials (use strong passwords!)
DATABASE_USER=pact
DATABASE_PASSWORD=your-strong-password-here
DATABASE_NAME=pact_production

# LLM Provider (choose one)
LLM_DEFAULT_PROVIDER=openai  # or 'anthropic'
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Application URLs
NEXT_PUBLIC_API_URL=https://pact.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://pact.yourdomain.com
```

### Step 3: Start Services

```bash
# Start all services in detached mode
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f app
```

### Step 4: Run Database Migrations

```bash
# Execute migrations inside the app container
docker-compose -f docker-compose.prod.yml exec app npm run migration:run

# Verify migrations
docker-compose -f docker-compose.prod.yml exec app npm run migration:show
```

### Step 5: Verify Deployment

```bash
# Check application health
curl https://your-domain.com/health

# Expected response:
# {"status":"ok","database":"connected","redis":"connected","timestamp":"..."}
```

### SSL/TLS Configuration

Pact's Docker deployment serves HTTP on port 3000. For production, use a reverse proxy (nginx, Caddy, Traefik) for SSL/TLS termination:

**Example nginx configuration**:

```nginx
server {
    listen 443 ssl http2;
    server_name pact.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/pact.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pact.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for real-time features
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Manual Deployment (No Docker)

### Step 1: Install Dependencies

```bash
# Install Node.js 24+ (using nvm)
nvm install 24
nvm use 24

# Install PostgreSQL 18
# (Platform-specific - see PostgreSQL docs)

# Install Redis 7
# (Platform-specific - see Redis docs)
```

### Step 2: Setup Database

```bash
# Create PostgreSQL database and user
sudo -u postgres psql

CREATE DATABASE pact_production;
CREATE USER pact WITH ENCRYPTED PASSWORD 'your-strong-password';
GRANT ALL PRIVILEGES ON DATABASE pact_production TO pact;
\q
```

### Step 3: Clone and Build

```bash
git clone https://github.com/your-org/pact.git
cd pact
git checkout v0.1.0

# Install production dependencies
npm ci --only=production

# Build application
npm run build

# Build MCP server
npm run build:mcp
```

### Step 4: Configure Environment

```bash
cp .env.production.example .env.production
nano .env.production

# Set database connection
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=pact
DATABASE_PASSWORD=your-strong-password
DATABASE_NAME=pact_production

# Set Redis connection
REDIS_HOST=localhost
REDIS_PORT=6379

# Set LLM provider
OPENAI_API_KEY=sk-...
LLM_DEFAULT_PROVIDER=openai
```

### Step 5: Run Migrations

```bash
npm run migration:run
```

### Step 6: Start Application

```bash
# Using PM2 (recommended)
npm install -g pm2
pm2 start dist/main.js --name pact-app

# Or using systemd (create /etc/systemd/system/pact.service)
```

**Example PM2 ecosystem file** (`ecosystem.config.js`):

```javascript
module.exports = {
  apps: [{
    name: 'pact-app',
    script: './dist/main.js',
    instances: 2,
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

```bash
# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

---

## Cloud Platform Deployments

### AWS Deployment (ECS + RDS)

**Architecture**: ECS Fargate + RDS PostgreSQL + ElastiCache Redis

1. **Push Docker image to ECR**:

```bash
# Authenticate to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and tag image
docker build -t pact:0.1.0 .
docker tag pact:0.1.0 <account-id>.dkr.ecr.us-east-1.amazonaws.com/pact:0.1.0

# Push to ECR
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/pact:0.1.0
```

2. **Create RDS PostgreSQL instance**:
   - Engine: PostgreSQL 18
   - Instance class: db.t4g.medium (or larger for production)
   - Storage: 50GB gp3
   - Enable automated backups

3. **Create ElastiCache Redis cluster**:
   - Engine: Redis 7.x
   - Node type: cache.t4g.micro (or larger)

4. **Create ECS Task Definition**:
   - Use image from ECR
   - Set environment variables (DATABASE_HOST, REDIS_HOST, API keys)
   - Configure CloudWatch logging

5. **Create ECS Service**:
   - Launch type: Fargate
   - Desired tasks: 2+ (for high availability)
   - Load balancer: Application Load Balancer (ALB)
   - Health check: `/health` endpoint

### Google Cloud Platform (Cloud Run + Cloud SQL)

```bash
# Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/PROJECT-ID/pact:0.1.0

# Deploy to Cloud Run
gcloud run deploy pact \
  --image gcr.io/PROJECT-ID/pact:0.1.0 \
  --platform managed \
  --region us-central1 \
  --set-env-vars DATABASE_HOST=/cloudsql/PROJECT-ID:REGION:INSTANCE-NAME \
  --set-env-vars OPENAI_API_KEY=sk-... \
  --add-cloudsql-instances PROJECT-ID:REGION:INSTANCE-NAME \
  --allow-unauthenticated
```

### Heroku Deployment

```bash
# Login to Heroku
heroku login

# Create Heroku app
heroku create pact-production

# Add PostgreSQL and Redis addons
heroku addons:create heroku-postgresql:standard-0
heroku addons:create heroku-redis:premium-0

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set OPENAI_API_KEY=sk-...
heroku config:set LLM_DEFAULT_PROVIDER=openai

# Deploy
git push heroku main

# Run migrations
heroku run npm run migration:run

# Check logs
heroku logs --tail
```

### Render Deployment

1. Connect GitHub repository to Render
2. Create new **Web Service**:
   - Build command: `npm install && npm run build`
   - Start command: `node dist/main`
3. Create **PostgreSQL** database
4. Create **Redis** instance
5. Set environment variables in Render dashboard
6. Deploy

---

## Health Checks & Monitoring

### Health Check Endpoint

Pact exposes a `/health` endpoint that returns:

```json
{
  "status": "ok",
  "timestamp": "2026-02-06T12:00:00.000Z",
  "uptime": 3600,
  "database": {
    "status": "connected",
    "latency_ms": 5
  },
  "redis": {
    "status": "connected",
    "latency_ms": 2
  },
  "llm": {
    "provider": "openai",
    "status": "available"
  }
}
```

### Monitoring Recommendations

**Application Performance Monitoring (APM)**:
- **Datadog APM** - Distributed tracing for LLM calls
- **New Relic** - Application performance and error tracking
- **Sentry** - Error tracking and alerting

**Infrastructure Monitoring**:
- **Prometheus + Grafana** - Metrics and dashboards
- **CloudWatch** (AWS) - Logs and metrics
- **Stackdriver** (GCP) - Logs and metrics

**Key Metrics to Track**:
- API response times (p50, p95, p99)
- Database query performance
- LLM API call latency and cost
- Error rates by endpoint
- Memory and CPU usage
- Active WebSocket connections

### LangSmith Tracing

Enable LangSmith for LLM observability:

```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-langsmith-key
LANGCHAIN_PROJECT=pact-production
```

Access traces at: https://smith.langchain.com

---

## Backup & Recovery

### Database Backups

**Automated Backups (Recommended)**:

```bash
# PostgreSQL automated backup script
# /usr/local/bin/pact-backup.sh

#!/bin/bash
BACKUP_DIR="/var/backups/pact"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="pact_backup_${DATE}.sql.gz"

pg_dump -h localhost -U pact pact_production | gzip > "${BACKUP_DIR}/${FILENAME}"

# Keep only last 30 days of backups
find "${BACKUP_DIR}" -name "pact_backup_*.sql.gz" -mtime +30 -delete
```

**Cron schedule**:

```cron
# Daily backup at 2 AM
0 2 * * * /usr/local/bin/pact-backup.sh
```

**Cloud-Managed Backups**:
- **AWS RDS**: Automated daily snapshots (retention: 7-35 days)
- **GCP Cloud SQL**: Automated daily backups (retention: configurable)
- **Heroku Postgres**: Continuous protection with PGBackups addon

### Volume Backups

For Docker deployments, backup volumes:

```bash
# Backup PostgreSQL volume
docker run --rm \
  -v pact_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres_data_backup.tar.gz /data

# Backup Redis volume
docker run --rm \
  -v pact_redis_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/redis_data_backup.tar.gz /data
```

### Disaster Recovery

**Recovery Time Objective (RTO)**: Target < 1 hour
**Recovery Point Objective (RPO)**: Target < 24 hours (daily backups)

**Recovery Steps**:

1. **Restore Database**:

```bash
# From SQL dump
gunzip -c pact_backup_20260206_020000.sql.gz | psql -h localhost -U pact pact_production

# From Docker volume backup
docker volume create pact_postgres_data_restored
docker run --rm \
  -v pact_postgres_data_restored:/data \
  -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/postgres_data_backup.tar.gz --strip 1"
```

2. **Start Services**: Follow deployment steps with restored volumes

3. **Verify Data Integrity**: Check critical records and run health checks

---

## Security Considerations

### Environment Variables

**Never commit secrets to version control**:

```bash
# .gitignore should include:
.env
.env.production
.env.local
*.pem
*.key
```

**Use secret management services**:
- **AWS Secrets Manager** / **AWS Systems Manager Parameter Store**
- **GCP Secret Manager**
- **HashiCorp Vault**
- **Doppler** / **Infisical**

### Database Security

1. **Strong passwords**: Use 32+ character random passwords
2. **Network isolation**: Database accessible only from app servers (VPC/private network)
3. **SSL/TLS connections**: Enable `DATABASE_SSL=true` for encrypted connections
4. **Least privilege**: Database user should only have necessary permissions

### API Key Security

1. **Rotate keys regularly**: Rotate LLM API keys every 90 days
2. **Use separate keys per environment**: Development, staging, production
3. **Monitor usage**: Set up billing alerts for LLM API usage
4. **Rate limiting**: Configure rate limits on LLM provider dashboards

### Application Security

1. **HTTPS only**: Redirect all HTTP traffic to HTTPS
2. **Content Security Policy**: Configure CSP headers
3. **CORS**: Restrict origins in production
4. **Rate limiting**: Apply rate limiting to API endpoints
5. **Input validation**: All user inputs validated with class-validator

### Firewall Rules

**Recommended port restrictions**:
- **Port 443**: HTTPS (public)
- **Port 80**: HTTP → HTTPS redirect (public)
- **Port 3000**: Application (internal only, behind reverse proxy)
- **Port 5432**: PostgreSQL (internal only, VPC/localhost)
- **Port 6379**: Redis (internal only, VPC/localhost)

---

## Troubleshooting

### Application Won't Start

**Check logs**:

```bash
# Docker Compose
docker-compose -f docker-compose.prod.yml logs app

# PM2
pm2 logs pact-app

# Systemd
journalctl -u pact -f
```

**Common issues**:

1. **Database connection failed**:
   - Verify `DATABASE_HOST`, `DATABASE_PORT`, credentials
   - Check PostgreSQL is running: `pg_isready -h localhost`
   - Check network connectivity

2. **Redis connection failed**:
   - Verify `REDIS_HOST`, `REDIS_PORT`
   - Check Redis is running: `redis-cli ping`

3. **Port already in use**:
   - Check what's using port 3000: `lsof -i :3000`
   - Change `PORT` in `.env.production` or stop conflicting service

### Database Migration Errors

**"Migration already exists"**:

```bash
# Check migration status
npm run migration:show

# Revert last migration (if safe)
npm run migration:revert
```

**"Connection timeout"**:
- Increase `connectTimeout` in database configuration
- Check database server load

### High Memory Usage

**Identify cause**:

```bash
# Check Node.js heap usage
docker exec pact-app node -e "console.log(process.memoryUsage())"

# Check container stats
docker stats pact-app
```

**Solutions**:
- Increase container memory limit
- Optimize LLM prompt sizes (reduce context length)
- Enable Redis caching for LLM responses
- Review database query performance

### LLM API Errors

**Rate limit exceeded**:
- Reduce request frequency
- Implement exponential backoff (already in `LlmService`)
- Upgrade LLM provider tier

**API key invalid**:
- Verify `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- Check key hasn't been rotated/revoked
- Verify billing account is active

### Performance Issues

**Slow API responses**:

```bash
# Check database query performance
docker exec pact-postgres psql -U pact pact_production -c "SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Check Redis latency
docker exec pact-redis redis-cli --latency
```

**Solutions**:
- Add database indexes (check missing indexes)
- Enable query result caching
- Increase database connection pool size
- Scale horizontally (add more app instances)

### WebSocket Connection Issues

**"WebSocket connection failed"**:
- Verify reverse proxy supports WebSocket upgrades (nginx: `proxy_set_header Upgrade`)
- Check firewall allows WebSocket connections
- Verify `NEXT_PUBLIC_WS_URL` is correct

---

## Support

For additional help:

- **Documentation**: [docs/index.md](./index.md)
- **GitHub Issues**: https://github.com/your-org/pact/issues
- **Email Support**: support@yourdomain.com

---

**Document Version**: 0.1.0
**Last Updated**: 2026-02-06
