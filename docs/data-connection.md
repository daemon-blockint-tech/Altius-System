# Data Connection — direct and agent-based source connectivity

How source systems reach the Altius ontology. Two runtimes exist per
datasource, declared in the pack connector manifest with `runtime:`; the
difference is *where the connector executes* and therefore what network
path and credentials are needed.

| Runtime | Connector runs | Reaches | Credentials live |
|---------|----------------|---------|------------------|
| `DIRECT` (default) | Inside the platform (in-process `SyncScheduler`) | Anything the cluster's egress can reach: public APIs, cloud object stores, databases with a network path | Platform environment (`${ENV_VAR}` resolved by the api-gateway) |
| `AGENT` | On a Data Connection Agent inside the customer network | Sources behind the customer firewall: on-prem databases, HDFS, shared drives | Agent host environment — they never reach the platform |

Both runtimes converge on the same intake pipeline: raw `SourceRecord`s →
`RecordMapper` (the manifest's mapping) → natural-key upsert into the
ontology under the `sync:<datasource>` actor. Mapping always happens
platform-side; an agent moves raw source records only.

---

## Topology 1 — direct connection (public internet data)

For sources the platform can reach itself (public APIs, S3/Blob/GCS-style
object stores, SaaS databases), the connector runs in-process and the
platform's own egress makes the outbound TLS connection.

```
+--------------------------------+           +----------------------------------+
|      PUBLIC INTERNET DATA      |           |         ALTIUS PLATFORM          |
|                                |   HTTPS   |  +----------------------------+  |
|  object stores    public APIs  | <-------- |  |  api-gateway               |  |
|  cloud databases  SaaS feeds   |  TLS 1.2+ |  |  SyncScheduler (DIRECT)    |  |
|                                |           |  |  connectors run here       |  |
+--------------------------------+           |  +-------------+--------------+  |
                                             |                v                 |
                                             |   RecordMapper → ontology upsert |
                                             +----------------------------------+
```

- Declared with `runtime: DIRECT` (or by omitting `runtime`).
- Driven by the in-process scheduler (`SYNC_SCHEDULER_ENABLED=true`).
- `${ENV_VAR}` placeholders in `connection.url` resolve from the
  platform's environment.
- Egress is governed by the deployment's NetworkPolicy allowlist and, at
  the metadata level, by `EgressPolicy` in the enterprise connector
  catalog (`@altius/spi` `enterprise-connectors.ts`).

## Topology 2 — agent-based connection (customer network)

For sources the platform cannot reach, a **Data Connection Agent** runs on
an isolated server/VM inside the customer network. The agent holds the
only network path to the source systems; the platform holds none.

```
+--------------------------------------+            +--------------------------------+
|           CUSTOMER NETWORK           |            |        ALTIUS PLATFORM         |
|                                      |            |                                |
|  SOURCE        +------------------+  |  outbound  |  +--------------------------+  |
|  SYSTEMS       | ISOLATED SERVER  |  |  HTTPS     |  | api-gateway              |  |
|                |                  |  |  TLS 1.2+  |  |  /api/v1/data-connection |  |
|  on-prem DB <--| DATA CONNECTION  | ---------------> |  AgentGateway            |  |
|  HDFS       <--| AGENT            |  |            |  |  (enroll / heartbeat /   |  |
|  shared     <--| connectors run   |  |  no        |  |   lease / record intake) |  |
|  drives        | HERE             |  |  inbound   |  +------------+-------------+  |
|                +------------------+  |  ports     |               v                |
|                                      |            |  RecordMapper → ontology upsert|
+--------------------------------------+            +--------------------------------+
```

Egress-only by construction:

- The agent opens **no listening socket**. Its entire network surface is
  outbound HTTPS to the platform gateway; the customer firewall needs
  nothing but outbound 443. The agent refuses an `http://` platform URL
  unless `AGENT_ALLOW_INSECURE_HTTP=true` (dev/test only).
- Lease assignments ride the **heartbeat response** — the platform never
  dials into the customer network, not even to tell the agent what to do.
- Source credentials stay in the customer network: `${ENV_VAR}`
  placeholders in an AGENT datasource's `connection.url` pass through the
  platform **unresolved** and resolve from the agent host's environment.
- Enrollment is gated by a shared secret (`X-Enrollment-Secret`); every
  later call carries a per-agent bearer token minted at enrollment and
  stored hashed platform-side.

### Protocol (all agent-initiated)

| Call | Path | Purpose |
|------|------|---------|
| Enroll | `POST /api/v1/data-connection/enroll` | Present the shared secret, register name + local connector plugins, receive `agentId` + bearer token |
| Heartbeat | `POST /api/v1/data-connection/agents/:agentId/heartbeat` | Report liveness and per-lease status; receive current lease grants (connection config, mode, interval, checkpoint, per-tick bounds) |
| Upload | `POST /api/v1/data-connection/agents/:agentId/datasources/:datasource/records` | Deliver a bounded batch of captured records; the ack carries the now-durable checkpoint the agent resumes from |

Lease rules: one agent per datasource at a time; a datasource may pin a
named agent with `agent:`; an unpinned datasource goes to any live agent
whose local registry has the connector plugin. Miss heartbeats past the
liveness timeout and the lease is reassigned; an upload against a lost
lease answers 409 and the agent re-syncs on its next heartbeat.

## Declaring an agent-based datasource

```yaml
# pack connector manifest
datasource: PAS_Patients
connector: jdbc
runtime: AGENT          # run on an enrolled agent, not in-platform
agent: trust-dc-agent   # optional pin to one agent by name
connection:
  url: "jdbc:postgresql://${PAS_DB_HOST}/pas"   # resolves on the AGENT host
  table: patients
mapping:
  objectType: Patient
  primaryKey: { source: patient_id, target: nhsNumber }
  properties:
    name: { source: name }
sync:
  mode: POLLING          # POLLING | CDC | BATCH (OVERLAY is platform-only)
  interval: PT30S
```

## Running the pieces

Platform side (api-gateway):

```bash
# Setting the secret mounts the gateway; runtime-AGENT pack datasources become leasable
DATA_CONNECTION_ENROLLMENT_SECRET=... node dist/server.js
```

Agent side (customer network):

```bash
ALTIUS_PLATFORM_URL=https://altius.example.com \
DATA_CONNECTION_ENROLLMENT_SECRET=... \
AGENT_NAME=trust-dc-agent \
PAS_DB_HOST=pas.internal:5432 \
node dist/agent/main.js        # from @altius/sync
```

Operator view: `GET /api/v1/data-connection/status` (admin-gated) lists
enrolled agents, liveness, lease assignments, per-datasource intake counts
and checkpoints. The endpoint is registered even when the gateway is off,
so "off" is reportable.

## Caveats

- **Checkpoints are process-local by default.** The gateway's default
  `CheckpointStore` is in-memory: a gateway restart re-extracts from the
  epoch. Idempotent natural-key upserts absorb the repeats; add a
  Postgres-backed store when re-extract cost matters (same ponytail as the
  in-process scheduler).
- **Enrollment state is process-local.** After a gateway restart, agents
  re-enroll automatically on their next 401'd heartbeat; multi-replica
  deployments should route `/api/v1/data-connection/*` to a single
  replica.
- **`conflictResolution` is refused**, exactly as in sync-boot: neither
  declarable strategy can be enforced without a field-provenance producer,
  and refusing loudly beats silently overwriting user edits.
- **The proxy variant is not implemented.** Foundry also offers an
  agent-proxy mode where the connector runs cloud-side and the agent only
  tunnels raw connectivity (WebSocket). Altius's agent is the
  worker-style variant: capture runs on the agent. A proxy mode would be
  additive (a new transport, same gateway).
