# syntax note: HCL, not JSON.
#
# Wires the shared install stages in Dockerfile.deps into every service
# target via named build contexts (`contexts = { deps-full = "target:..." }`),
# so `pnpm install` for the six Node services resolves ONCE per unique
# dependency set (deps-full / deps-app) instead of once per service image —
# see Dockerfile.deps for why. Also the single source of truth for GHA cache
# scoping: `docker compose build` picks this file up automatically when
# COMPOSE_BAKE=true (see Orion/docker-compose.yaml `x-bake` blocks), and CI
# invokes it directly with `docker buildx bake`.

variable "GIT_REVISION" {
  default = "unknown"
}

variable "REGISTRY" {
  default = ""
}

variable "IMAGE_PREFIX" {
  default = "altius"
}

function "tag" {
  params = [service]
  result = ["${REGISTRY}${IMAGE_PREFIX}/${service}:${GIT_REVISION}", "${REGISTRY}${IMAGE_PREFIX}/${service}:latest"]
}

group "default" {
  targets = ["security", "sync", "engine", "web", "api", "actions", "cel-evaluator"]
}

# ─── Shared dependency-install stages ───────────────────────────────
# Not part of the default group: nothing consumes their image output
# directly, only their build-cache. Bake still builds them (as dependencies)
# whenever a target below references them via `target:`.

target "deps-full" {
  dockerfile = "Dockerfile.deps"
  target     = "deps-full"
  context    = "."
  cache-from = ["type=gha,scope=deps-full"]
  cache-to   = ["type=gha,mode=max,scope=deps-full"]
}

target "deps-app" {
  dockerfile = "Dockerfile.deps"
  target     = "deps-app"
  context    = "."
  cache-from = ["type=gha,scope=deps-app"]
  cache-to   = ["type=gha,mode=max,scope=deps-app"]
}

# ─── Service targets ─────────────────────────────────────────────────

target "_node_full_base" {
  context = "."
  args = {
    GIT_REVISION = "${GIT_REVISION}"
  }
  contexts = {
    "deps-full" = "target:deps-full"
  }
}

target "_node_app_base" {
  context = "."
  args = {
    GIT_REVISION = "${GIT_REVISION}"
  }
  contexts = {
    "deps-app" = "target:deps-app"
  }
}

target "security" {
  inherits   = ["_node_full_base"]
  dockerfile = "packages/security/Dockerfile"
  tags       = tag("security-service")
  cache-from = ["type=gha,scope=security"]
  cache-to   = ["type=gha,mode=max,scope=security"]
}

target "sync" {
  inherits   = ["_node_full_base"]
  dockerfile = "packages/sync/Dockerfile"
  tags       = tag("sync-engine")
  cache-from = ["type=gha,scope=sync"]
  cache-to   = ["type=gha,mode=max,scope=sync"]
}

target "engine" {
  inherits   = ["_node_full_base"]
  dockerfile = "packages/engine/Dockerfile"
  tags       = tag("ontology-engine")
  cache-from = ["type=gha,scope=engine"]
  cache-to   = ["type=gha,mode=max,scope=engine"]
}

target "web" {
  inherits   = ["_node_full_base"]
  dockerfile = "packages/web/Dockerfile"
  tags       = tag("web")
  cache-from = ["type=gha,scope=web"]
  cache-to   = ["type=gha,mode=max,scope=web"]
}

target "api" {
  inherits   = ["_node_app_base"]
  dockerfile = "packages/api/Dockerfile"
  tags       = tag("api-gateway")
  cache-from = ["type=gha,scope=api"]
  cache-to   = ["type=gha,mode=max,scope=api"]
}

target "actions" {
  inherits   = ["_node_app_base"]
  dockerfile = "packages/actions/Dockerfile"
  tags       = tag("action-executor")
  cache-from = ["type=gha,scope=actions"]
  cache-to   = ["type=gha,mode=max,scope=actions"]
}

# Standalone Go module — its own build context, no shared deps stage.
target "cel-evaluator" {
  context    = "packages/cel-evaluator"
  dockerfile = "Dockerfile"
  args = {
    GIT_REVISION = "${GIT_REVISION}"
  }
  tags       = tag("cel-evaluator")
  cache-from = ["type=gha,scope=cel-evaluator"]
  cache-to   = ["type=gha,mode=max,scope=cel-evaluator"]
}
