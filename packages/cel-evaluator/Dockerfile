# Build stage
FROM golang:1.25.12-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /cel-evaluator .

# grpc-health-probe in isolation to control transitive gRPC version
RUN mkdir -p /tools && cd /tools && \
    go mod init tools && \
    GOFLAGS=-mod=mod go get github.com/grpc-ecosystem/grpc-health-probe@v0.4.53 google.golang.org/grpc@v1.82.1 golang.org/x/text@v0.39.0 && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /usr/local/bin/grpc-health-probe github.com/grpc-ecosystem/grpc-health-probe

# Runtime stage
FROM alpine:3.20

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
