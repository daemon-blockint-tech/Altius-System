{{/*
Expand the name of the chart.
*/}}
{{- define "altius.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "altius.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "altius.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "altius.labels" -}}
helm.sh/chart: {{ include "altius.chart" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: altius
{{- end }}

{{/*
Selector labels for a specific component.
*/}}
{{- define "altius.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .release }}
{{- end }}

{{/*
PostgreSQL connection URL.

`parsePostgresUrl` in the gateway already honours ?sslmode=, so TLS was purely
a missing chart knob rather than an application limitation. Without it every
chart-deployed pod spoke cleartext to the database and no values path could
change that.
*/}}
{{- define "altius.postgresUrl" -}}
postgresql://$(POSTGRES_USERNAME):$(POSTGRES_PASSWORD)@{{ .Values.storage.postgres.host }}:{{ .Values.storage.postgres.port }}/{{ .Values.storage.postgres.database }}
{{- with .Values.storage.postgres.sslmode }}?sslmode={{ . }}{{ end }}
{{- end }}

{{/*
Replicas the api-gateway will actually run.

The HPA owns the count when autoscaling is on, so replicaCount is not the
number to reason about — minReplicas is the floor the deployment never drops
below.
*/}}
{{- define "altius.effectiveReplicas" -}}
{{- if .Values.apiGateway.autoscaling.enabled -}}
{{- .Values.apiGateway.autoscaling.minReplicas -}}
{{- else -}}
{{- .Values.apiGateway.replicaCount -}}
{{- end -}}
{{- end }}

{{/*
Refuse to render a deployment whose replica count contradicts its own
dependencies.

The shipped defaults were 2 replicas (HPA 2-5) with `eventBus.redpanda.
bootstrapServers` and `redis.url` both empty — and values.yaml documents the
empty event bus as "single-pod only" three lines above. Nothing failed at
install time: subscribers simply saw only the events produced by whichever pod
they were balanced onto, and each pod counted rate limits in its own memory, so
the effective limit was the configured one times the replica count. Both are
silent at runtime and neither is visible in a log.

Failing here converts that into an install-time error naming the exact knob,
which is the same trade the chart already makes for ingress TLS.
*/}}
{{- define "altius.assertMultiPodSafe" -}}
{{- $replicas := int (include "altius.effectiveReplicas" .) -}}
{{- if gt $replicas 1 -}}
  {{- if not .Values.eventBus.redpanda.bootstrapServers -}}
    {{- fail (printf "apiGateway runs %d replicas but eventBus.redpanda.bootstrapServers is empty. In-memory events are single-pod only: a subscriber would receive only the changes produced by the pod it happens to be connected to. Set eventBus.redpanda.bootstrapServers, or pin a single pod (apiGateway.replicaCount=1, apiGateway.autoscaling.enabled=false)." $replicas) -}}
  {{- end -}}
  {{- if not .Values.redis.url -}}
    {{- fail (printf "apiGateway runs %d replicas but redis.url is empty. Each pod would count rate limits in its own memory, making the effective limit %d times the configured one. Set redis.url, or pin a single pod." $replicas $replicas) -}}
  {{- end -}}
  {{- if or .Values.singleInstance.automation .Values.singleInstance.syncScheduler -}}
    {{- fail (printf "apiGateway runs %d replicas but singleInstance.automation/syncScheduler is enabled. A Deployment cannot elect a leader, so every pod would fire every trigger. Pin a single pod (apiGateway.replicaCount=1, apiGateway.autoscaling.enabled=false) or run these on their own single-replica release." $replicas) -}}
  {{- end -}}
{{- end -}}
{{- end }}

{{/*
Service account name.
HELM-14: Explicit service account for all deployments.
Falls back to release-scoped name (not cluster default) when no override is set.
*/}}
{{- define "altius.serviceAccountName" -}}
{{- if and .Values.serviceAccount .Values.serviceAccount.name -}}
{{- .Values.serviceAccount.name }}
{{- else -}}
{{- include "altius.fullname" . }}
{{- end -}}
{{- end }}

{{/*
Image reference for a service.
*/}}
{{- define "altius.image" -}}
{{- $tag := default .global.tag .svc.tag -}}
{{- if .svc.repository -}}
{{ .svc.repository }}:{{ $tag }}
{{- else -}}
{{ .global.registry }}/{{ .name }}:{{ $tag }}
{{- end -}}
{{- end }}
