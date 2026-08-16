# Altius — Dev to Prod Deployment Workflow

## Overview

This document walks through the complete flow from source code to production deployment using optimized Docker images and GitHub Actions CI/CD.

## 1. Development: Local Builds

Developers iterate locally with the default `docker-compose.yaml` (dev mode):

```bash
cd Orion

# Copy environment and set local secrets
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, KEYCLOAK_ADMIN_PASSWORD

# Build and start everything locally
GIT_REVISION=$(git rev-parse HEAD) docker compose up -d --build

# Initialize DB, AGE, OpenFGA
./init-services.sh

# Open GraphQL
open http://localhost:4000/graphql
```

**Dev mode characteristics:**
- Services build from source on every `--build` flag
- `NODE_ENV=development` (allow-all governance stubs — no FGA/CEL enforcement)
- Fast local iteration: change code → rebuild one service → test

## 2. CI: Automated Image Builds & Push

On every push to `main` and every version tag (`v*`), the `.github/workflows/docker-publish.yml` workflow:

1. **Checks out** the source
2. **Builds** all four service images (cel-evaluator, api-gateway, actions, security) using multi-stage Dockerfiles
3. **Pushes** to GitHub Container Registry (`ghcr.io/nhs-eng/altius-system/{service}:{tag}`)
4. **Scans** for HIGH/CRITICAL CVEs with Trivy
5. **Caches** layer cache in GitHub Actions backend (`type=gha`) for fast rebuilds

**Push conditions:**
- `main` → `:latest`, `:sha-<short-sha>`
- `v1.2.3` tag → `:v1.2.3`, `:latest`
- Pull request → build only (no push)

**Example tags pushed:**
```
ghcr.io/nhs-eng/altius-system/api-gateway:latest
ghcr.io/nhs-eng/altius-system/api-gateway:sha-a1b2c3d4e5f6
ghcr.io/nhs-eng/altius-system/api-gateway:v0.2.0
```

## 3. Testing: CI Integration Suite

After images build, existing CI jobs run:

- **Build + unit tests** (`build-test`): pnpm install, build, typecheck, vitest
- **PostgreSQL integration** (`postgres-integration`): storage-postgres + SPI conformance
- **Docker-stack integration** (`docker-stack-integration`): full 14-service compose stack
- **Enforcement E2E** (`enforcement-e2e`): production mode security/capability gating
- **Helm lint** (`helm-lint`): chart validation
- **Image scan** (`image-scan`): Trivy HIGH/CRITICAL check

All pass before merge to `main`.

## 4. Staging/Production: Pre-built Registry Pull

For any non-dev environment (staging, production), use the production compose override:

```bash
cd Orion

# Copy environment
cp .env.example .env

# Edit .env with deployment secrets:
POSTGRES_PASSWORD=<production-password>
KEYCLOAK_ADMIN_PASSWORD=<production-password>
REGISTRY_PREFIX=ghcr.io/nhs-eng/altius-system
IMAGE_TAG=v0.2.0  # Pin to release version (or latest)

# Authenticate to GHCR (if private)
docker login ghcr.io -u <username> -p <github-token>

# Start infrastructure layer
docker compose up -d postgresql openfga keycloak redis redpanda

# Initialize schema, AGE, OpenFGA store
./init-services.sh

# Start app services (pull pre-built images from registry)
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

# Verify
docker compose ps
docker compose logs api-gateway
```

**Prod characteristics:**
- Services pulled from GHCR (no build)
- `NODE_ENV=production` (real OIDC, OpenFGA enforcement, consent gating)
- Deterministic: same image tag always pulls the same artifact
- No source code needed: registry image is self-contained

## 5. Rollback / Version Pinning

Instantly switch between versions:

```bash
# Staging: test the new v0.2.1 release
IMAGE_TAG=v0.2.1 docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

# Prod: revert to stable v0.2.0 if issues found
IMAGE_TAG=v0.2.0 docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

# Both: pull the exact same bytecode, every time
```

## 6. Custom Registries

For internal mirrors or forks:

```bash
# Your org's private registry
REGISTRY_PREFIX=ghcr.io/your-org/altius-system
IMAGE_TAG=v0.2.0

# Authenticate
docker login ghcr.io -u <your-username> -p <your-token>

# Deploy
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d
```

## 7. Hybrid Dev + Prod (for local testing)

If you want to run the prod stack locally but rebuild one service for testing:

```bash
# Start prod stack (pulls all images from GHCR)
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d

# Rebuild and restart just the api-gateway from local source
docker compose up -d --build api-gateway

# Local api-gateway (dev mode) runs against prod infrastructure
# Monitor both for env differences if needed
```

## 8. Dockerfile Optimizations (What's in the images)

All images use production-ready optimizations:

### Node.js Services (api-gateway, security-service, actions, ontology-engine, sync-engine)

- **Multi-stage builds**: builder stage (TypeScript → JavaScript) + runtime stage (prod deps only)
- **Layer caching**: lockfile copied first; dependencies cached; source changes don't invalidate dep layer
- **Minimal runtime**: only production dependencies, no dev tools
- **Cleanup**: removed npm/npx, pnpm cache metadata, turbo cache
- **Alpine base**: ~70MB compressed image per service

### Go Service (cel-evaluator)

- **Single-stage build**: all compilation in builder image, static binaries only copied to scratch-like alpine
- **Binary stripping**: `-ldflags="-s -w"` removes debug symbols (~30-40% smaller binary)
- **gRPC health probe**: built separately to control transitive gRPC version
- **Alpine base**: ~14MB compressed image

## 9. CI/CD Outputs

The `.github/workflows/docker-publish.yml` workflow produces:

- **Image tags**: pushed to GHCR with automated semver/sha/latest tagging
- **Security scanning**: Trivy report (HIGH/CRITICAL only; exit code 0 to not fail the workflow)
- **Build cache**: GitHub Actions backend cache scoped per-service (re-used on next build)
- **Provenance/SBOM** (optional future): Docker Scout integration for dependency tracking

## 10. Environment Reference

Key `.env` variables for prod deployments:

```bash
# Infrastructure secrets
POSTGRES_PASSWORD=<required>
KEYCLOAK_ADMIN_PASSWORD=<required>

# Registry & versioning
REGISTRY_PREFIX=ghcr.io/nhs-eng/altius-system  (default)
IMAGE_TAG=latest  (or v1.2.3, sha-abc123, etc.)

# App config
NODE_ENV=production  (prod-compose sets this)
OIDC_DEFAULT_TENANT=default  (single-tenant fallback, optional)
RELATIONSHIP_GRANTER_ROLES=admin
CONSENT_RECORDER_ROLES=admin

# Domain packs (optional)
DOMAIN_PACKS=core,nhs-acute
DOMAIN_PACKS_HOST_DIR=./external-packs
SEED_TENANT=default
```

See `Orion/.env.example` for full list.

## 11. Troubleshooting

### Images not found / 404 from GHCR

```bash
# Verify image exists and is accessible
docker pull ghcr.io/nhs-eng/altius-system/api-gateway:v0.2.0

# If private, authenticate
docker login ghcr.io -u <username> -p <token>
```

### Pull always fails with "pull_policy: always"

Temporarily edit `docker-compose.prod.yaml` and set `pull_policy: if_not_present` to use local cache while debugging:

```yaml
api-gateway:
  image: ${REGISTRY_PREFIX}/api-gateway:${IMAGE_TAG}
  pull_policy: if_not_present  # DEBUG: use local cache
```

### Services won't start after rebuilding locally

Ensure `NODE_ENV` is set correctly. If you built locally (dev mode, `NODE_ENV=development`) and then try prod compose, the old container might still be running. Stop and restart:

```bash
docker compose down
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d
```

### Compose file validation

```bash
docker compose -f docker-compose.yaml -f docker-compose.prod.yaml config --quiet
```

## Summary

| Phase | Action | Timing | Output |
|-------|--------|--------|--------|
| **Dev** | Code change → `docker compose up --build` | Seconds | Local stack, dev mode |
| **CI** | Push to main / tag v* → `.github/workflows/docker-publish.yml` | ~5-10min | Images in GHCR, scanned |
| **Staging** | `docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d` | Seconds | Full stack, prod mode, images pulled from GHCR |
| **Prod** | Pin `IMAGE_TAG=v0.2.0` | Seconds | Deterministic deployment, same image every time |
| **Rollback** | Set `IMAGE_TAG=v0.2.0` (old) or `IMAGE_TAG=v0.2.1` (new) | <1min | No rebuild, instant switch |
