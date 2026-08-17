# syntax=docker/dockerfile:1
# Build stage
# Pinned to a patch release so the baked Go stdlib stays ahead of known CVEs
# (>=1.25.11 fixes CVE-2026-42504; >=1.25.12 fixes CVE-2026-39822, the os.Root
# symlink-following flaw); bump deliberately, not via a floating tag.
FROM golang:1.25.13-alpine AS builder

WORKDIR /app

# Cache dependency downloads
COPY go.mod go.sum ./
RUN --mount=type=cache,id=gomod,target=/go/pkg/mod \
    go mod download

# Copy source and build the server + the gRPC health probe. Both are compiled
# in the builder (which has the Go toolchain); only the resulting static
# binaries are copied into the runtime image — never the toolchain itself
# (copying /usr/local/go added ~400MB to the final image as a permanent layer).
COPY . .
RUN --mount=type=cache,id=gomod,target=/go/pkg/mod \
    --mount=type=cache,id=gobuild,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -o /cel-evaluator .

# grpc-health-probe is built from a throwaway module rather than
# `go install pkg@version`, which would resolve the TOOL's own go.mod and bake
# its pinned transitive deps (v0.4.53 still ships grpc 1.81.1 —
# GHSA-hrxh-6v49-42gf) with no way for us to override them. Inside a module we
# can require the patched grpc explicitly; MVS then selects it for the build.
#
# Every dependency that needs a floor has to be named HERE as well as in
# go.mod — this module resolves independently, so a bump on the main module
# does not reach it. x/net is the proof: go.mod moved to v0.56.0 for
# CVE-2026-46600 and the scan still reported v0.55.0, because it was reading
# this binary, not the server. Keep these in step with go.mod.
#
# One `go get` for all of them, not one per line. The module has no source, so
# there is no import graph for `go get` to compute build sums from: a later
# call bumps a transitive dep in go.mod and leaves its go.sum entry unwritten,
# and the build then dies on `missing go.sum entry for golang.org/x/sys/unix`.
# Four sequential calls did exactly that; a single resolution pass writes a
# consistent go.sum. Reproduced and fixed against go1.25.13 specifically —
# go1.26 tolerates the sequential form, so a newer local toolchain will not
# show the failure.
RUN --mount=type=cache,id=gomod,target=/go/pkg/mod \
    --mount=type=cache,id=gobuild,target=/root/.cache/go-build \
    mkdir -p /tools && cd /tools \
    && go mod init tools \
    && GOFLAGS=-mod=mod go get \
         github.com/grpc-ecosystem/grpc-health-probe@v0.4.53 \
         google.golang.org/grpc@v1.82.1 \
         golang.org/x/text@v0.39.0 \
         golang.org/x/net@v0.56.0 \
    && CGO_ENABLED=0 GOOS=linux go build -o /usr/local/bin/grpc-health-probe \
       github.com/grpc-ecosystem/grpc-health-probe

# Runtime stage
FROM alpine:3.23

ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision="${GIT_REVISION}"
ENV GIT_REVISION="${GIT_REVISION}"

RUN apk --no-cache add ca-certificates \
    && adduser -D -u 1000 cel

COPY --from=builder /usr/local/bin/grpc-health-probe /usr/local/bin/grpc-health-probe
COPY --from=builder /cel-evaluator /usr/local/bin/cel-evaluator

USER cel

EXPOSE 50051

ENTRYPOINT ["cel-evaluator"]
