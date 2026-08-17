# Release & Deployment Workflow

## Creating a New Release

### 1. Prepare Code on Main

Ensure all changes are merged to `main` and tests pass:

```bash
# Pull latest
git checkout main
git pull origin main

# Verify CI passes on main
# → Check GitHub Actions: https://github.com/daemon-blockint-tech/Altius-System/actions
```

### 2. Create a Version Tag

```bash
# Determine version (semantic versioning: MAJOR.MINOR.PATCH)
# Examples: v0.2.1, v1.0.0, v0.3.0-rc.1

VERSION=v0.2.1

# Create annotated tag with a message
git tag -a $VERSION -m "Release $VERSION

- Docker optimization: 70MB Node images, 14MB Go image
- Production deployment support via docker-compose.prod.yaml
- CI/CD workflow: auto-build and push to GHCR
- See DEPLOYMENT.md for details"

# Push tag to origin (triggers CI workflow)
git push origin $VERSION
```

### 3. CI Workflow Auto-Runs

The `.github/workflows/docker-publish.yml` workflow is triggered:

1. **Builds all 4 services in parallel:**
   - api-gateway
   - action-executor
   - security-service
   - cel-evaluator

2. **Pushes images to GHCR with tags:**
   - `ghcr.io/daemon-blockint-tech/altius-system/{service}:{VERSION}`
   - `ghcr.io/daemon-blockint-tech/altius-system/{service}:sha-{short-sha}`

3. **Runs Trivy security scan** (HIGH/CRITICAL, non-blocking)

4. **Caches layers** for next build

### 4. Monitor the Workflow

```bash
# Check workflow status
gh run list --workflow=docker-publish.yml --limit 1

# View detailed logs
gh run view {run-id} --log | tail -100
```

**Expected output:**
```
completed	success	Release v0.2.1	Build and Push Docker Images	v0.2.1	push	XXXXX	1m48s
```

### 5. Verify Images in Registry

```bash
# List newly pushed images (must be on linux/amd64 to pull successfully)
docker search ghcr.io/daemon-blockint-tech/altius-system/api-gateway

# Inspect image metadata
docker inspect ghcr.io/daemon-blockint-tech/altius-system/api-gateway:v0.2.1
```

---

## Deploying to Production

### Prerequisites

- `.env` file with required secrets:
  ```bash
  POSTGRES_PASSWORD=<your-secure-password>
  KEYCLOAK_ADMIN_PASSWORD=<your-secure-password>
  ```
- Docker login (if pulling from private registry):
  ```bash
  docker login ghcr.io -u <username> -p <github-token>
  ```

### Deploy a Released Version

```bash
cd Orion

# Copy environment template
cp .env.example .env

# Edit .env with your secrets and desired tag
cat >> .env << EOF

# Use the released version
REGISTRY_PREFIX=ghcr.io/daemon-blockint-tech/altius-system
IMAGE_TAG=v0.2.1
NODE_ENV=production
EOF

# Start infrastructure layer (no app services yet)
docker compose up -d postgresql openfga keycloak redis redpanda

# Initialize database, AGE, OpenFGA
./init-services.sh

# Deploy app services (pulls images from GHCR)
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

# Verify
docker compose ps
docker compose logs -f api-gateway
```

### Verify Deployment

```bash
# Check all services are healthy
docker compose ps
# Expected: all services with status "Up"

# View logs
docker compose logs api-gateway   # GraphQL API
docker compose logs action-executor
docker compose logs security-service

# Test API health
curl http://localhost:4000/.well-known/apollo/server-health

# Test GraphQL
open http://localhost:4000/graphql
```

---

## Rolling Back to a Previous Version

No rebuild needed — just change the `IMAGE_TAG`:

```bash
cd Orion

# Roll back to previous release
IMAGE_TAG=v0.2.0 docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

# Or use latest (always pulls fresh)
IMAGE_TAG=latest docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d
```

---

## CI Behavior by Event Type

### Push to Main

```
Code → Git push main
  ↓
Workflow: Build + Push (::latest, ::sha-{commit})
  ↓
Images ready for testing/staging deployment
```

**Tags:**
- `ghcr.io/daemon-blockint-tech/altius-system/{service}:latest`
- `ghcr.io/daemon-blockint-tech/altius-system/{service}:sha-a1b2c3d`

### Pull Request

```
Feature branch → GitHub PR
  ↓
Workflow: Build only (no push)
  ↓
Status check: ✓ or ✗
  ↓
PR mergeable when: all checks pass + approved
```

### Version Tag Push

```
Git tag v0.2.1 → git push origin v0.2.1
  ↓
Workflow: Build + Push (::v0.2.1)
  ↓
Images pinned to release version
  ↓
Production deployment via IMAGE_TAG=v0.2.1
```

**Tags:**
- `ghcr.io/daemon-blockint-tech/altius-system/{service}:v0.2.1`
- `ghcr.io/daemon-blockint-tech/altius-system/{service}:sha-commit`

---

## Branch Protection (After Manual Configuration)

Once branch protection is configured on `main`:

```
Feature branch → PR
  ↓
Workflow runs (build all 4 images, no push)
  ↓
Status checks required:
  • Build and Push Docker Images (api-gateway)
  • Build and Push Docker Images (action-executor)
  • Build and Push Docker Images (security-service)
  • Build and Push Docker Images (cel-evaluator)
  ↓
All checks must pass ✓
  ↓
Approvals required: 1
  ↓
Can now: squash & merge / merge / rebase & merge
  ↓
Code → main → Workflow builds + pushes images to GHCR
```

---

## Troubleshooting

### Workflow Failed to Build

1. Check the logs:
   ```bash
   gh run view {run-id} --log | grep -E "error|Error|failed"
   ```

2. Common issues:
   - **Dependency resolution failed:** Check `pnpm-lock.yaml` is committed
   - **Dockerfile syntax error:** Review the modified Dockerfile
   - **Base image unavailable:** Check image registry (docker.io, ghcr.io, etc.)

3. Fix and retry:
   ```bash
   # Commit fix to a branch and push
   git push origin my-fix-branch
   
   # Create PR to trigger workflow again
   # Once workflow passes, merge to main
   ```

### Image Not Found in Registry

1. Verify the workflow succeeded:
   ```bash
   gh run list --workflow=docker-publish.yml
   # Status should be "completed	success"
   ```

2. Check image exists:
   ```bash
   # Browse GHCR packages
   # https://github.com/daemon-blockint-tech/altius-system/pkgs/container
   ```

3. If private, authenticate:
   ```bash
   docker login ghcr.io -u {username} -p {token}
   ```

### Deployment Won't Start

1. Check environment variables:
   ```bash
   cd Orion && docker compose config | grep -E "image:|REGISTRY|IMAGE_TAG"
   ```

2. Verify credentials:
   ```bash
   docker login ghcr.io
   docker pull {image-url}:{tag}
   ```

3. Check logs:
   ```bash
   docker compose logs --tail=50
   ```

### Rollback Failed

If a version doesn't start correctly:

```bash
# List available tags
gh run list --workflow=docker-publish.yml

# Redeploy with previous working version
IMAGE_TAG=v0.2.0 docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d
```

---

## Monitoring Post-Deployment

### GitHub Actions Dashboard

https://github.com/daemon-blockint-tech/Altius-System/actions

- Monitor workflow runs
- Check Trivy scan results
- Review build logs

### Container Logs

```bash
docker compose logs -f api-gateway
docker compose logs -f action-executor
docker compose logs -f security-service
```

### System Health

```bash
# Service status
docker compose ps

# Resource usage
docker stats

# Check healthchecks
docker compose ps | grep -E "healthy|unhealthy"
```

### API Testing

```bash
# GraphQL
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'

# Health check
curl http://localhost:4000/.well-known/apollo/server-health
```
