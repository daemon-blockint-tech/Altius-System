# Running Altius, and demoing it

A cold start and a five-minute demo script. Everything here was executed against
this stack on 15 Aug 2026, HEAD `ce7ae32`.

Altius is a backend platform — there is no UI package. The interface you demo is
**Apollo Sandbox** at `/graphql`, which is generated from the ODL schema, plus the
REST/FHIR surfaces.

---

## 1. Prerequisites

- Docker Desktop **running** (the stack is 14 services; give it ~6 GB)
- Node 20+, pnpm 9.15+
- Ports free: `4000`, `5432`, `6379`, `8180`, `8280`, `8083`, `4317`, `50051`, `19092`

Check ports before you start — a clash fails the whole `up`:

```bash
for p in 4000 5432 6379 8180 8280 8083 4317 50051 19092; do
  netstat -ano | grep -q "0.0.0.0:$p " && echo "BUSY $p" || echo "free $p"
done
```

If `19092` is taken by another Redpanda, set `REDPANDA_PORT=19192` in `Orion/.env`.
Nothing in the stack uses that external listener — services talk to `redpanda:9092`
internally — so remapping is free.

---

## 2. Cold start

```bash
pnpm install --frozen-lockfile
pnpm run build                       # 16 packages

cd Orion
cp .env.example .env
# .env requires two values with no defaults — compose fails loudly without them:
#   POSTGRES_PASSWORD=<something>
#   KEYCLOAK_ADMIN_PASSWORD=<something>
# and set this or seeded data is invisible to API reads:
#   SEED_TENANT=default
cd ..

docker compose -p altius -f Orion/docker-compose.yaml up -d --wait --wait-timeout 900
cd Orion && COMPOSE_PROJECT_NAME=altius bash init-services.sh
```

**Use `-p altius`.** Compose names the project after the directory (`Orion`), which
collides with any other `orion` project on the machine — and `down -v` would then
delete *its* volumes. The explicit name isolates you.

`init-services.sh` creates the Apache AGE extension and the `altius` graph, waits on
Postgres, provisions the OpenFGA store, and writes `OPENFGA_STORE_ID` back into `.env`.

Confirm:

```bash
docker ps --filter "label=com.docker.compose.project=altius" --format '{{.Names}} | {{.Status}}'
curl -s http://localhost:4000/health
```

Healthy looks like:

```json
{"status":"ok","service":"api-gateway",
 "checks":{"storage":{"healthy":true},"cel":{"healthy":true},
           "redis":{"healthy":true},"eventBus":{"healthy":true}}}
```

Those are live probes — `cel` is a gRPC round-trip to the Go sidecar, `eventBus` is the
Kafka connection state.

---

## 3. What is actually running

| Service | Port | Role |
| --- | --- | --- |
| postgresql (Apache AGE) | 5432 | Object/link store, history, audit, consent |
| api-gateway | 4000 | GraphQL, REST, FHIR, MCP, WebSocket subscriptions |
| cel-evaluator | 50051 | Go gRPC sidecar — all CEL evaluation |
| openfga | 8280 | ReBAC authorization |
| keycloak | 8180 | OIDC (realm `altius` auto-imported) |
| redpanda | 19092 | CloudEvents bus |
| redis | 6379 | Distributed rate limiting |
| debezium | 8083 | CDC |
| otel-collector | 4317 | Traces |
| ontology-engine, action-executor, security-service, sync-engine | — | Service entrypoints |

---

## 4. Demo script (~5 minutes)

### Seed reference data

The NHS pack ships governed actions for **patient flow only** — there is no
`CreateWard` action, so wards/beds/consultants are reference data:

```bash
docker exec altius-postgresql-1 psql -U altius -d altius -q -c "
INSERT INTO ward (_tenant_id,_id,_type,_version,_created_at,_updated_at,name,specialty,capacity)
VALUES ('default','ward-cardio','Ward',1,NOW(),NOW(),'Cardiology Ward','Cardiology',24) ON CONFLICT DO NOTHING;
INSERT INTO bed (_tenant_id,_id,_type,_version,_created_at,_updated_at,number,type,status)
VALUES ('default','bed-c12','Bed',1,NOW(),NOW(),'C-12','STANDARD','AVAILABLE') ON CONFLICT DO NOTHING;
INSERT INTO consultant (_tenant_id,_id,_type,_version,_created_at,_updated_at,gmc_number,name,specialty)
VALUES ('default','con-patel','Consultant',1,NOW(),NOW(),'GMC7654321','Dr Anita Patel','Cardiology') ON CONFLICT DO NOTHING;"
```

### Beat 1 — the schema is generated, not written

Open **http://localhost:4000/graphql** → **Schema** in the left rail.

Every type, filter, mutation and subscription came from the `.odl` files in
`domain-packs/*/schema/`. Nobody wrote this GraphQL API. The same schema also
generated the REST routes (`/api/v1/openapi.json`) and the OpenFGA model.

### Beat 2 — register a patient (governed action)

```graphql
mutation Register {
  registerPatient(input: {
    name: "Alice Smithson"
    dateOfBirth: "1980-04-02"
    nhsNumber: "9434765919"
    triageCategory: P2_URGENT
    presentingComplaint: "chest pain"
  }) { success actionId affectedObjects { typeName id changeType } }
}
```

Not a generic insert. It ran validate → authorise → consent → CEL preconditions →
effects → side-effects → audit → emit. The manifest is
`domain-packs/nhs-acute/actions/register-patient.yaml` — readable YAML, no code.
It also records DIRECT_CARE consent as a terminal effect.

Copy the returned `id`.

### Beat 3 — admit them (five effects, one transaction)

```graphql
mutation Admit {
  admitPatient(input: {
    patient: "<PASTE_ID>", ward: "ward-cardio",
    bed: "bed-c12", consultant: "con-patel",
    reason: "Chest pain, telemetry required"
  }) { success actionId affectedObjects { typeName id changeType } }
}
```

```
Patient      UPDATED   → ACTIVE
AdmittedTo   CREATED
UnderCareOf  CREATED
Bed          UPDATED   → OCCUPIED
OccupiesBed  CREATED
```

One Postgres transaction. Preconditions were evaluated by the Go CEL sidecar
(`patient.status != 'ACTIVE'`, `bed.status == 'AVAILABLE'`, role checks). If any
effect had failed, all five roll back.

### Beat 4 — the ontology resolves

```graphql
query LiveOntology {
  patients(first: 10) {
    totalCount
    edges { node {
      id name status triageCategory
      currentWard { name specialty capacity currentOccupancy }
      currentBed { number status }
      consultant { name gmcNumber }
    } }
  }
}
```

**This is the point of the platform.** None of `currentWard`, `currentBed` or
`consultant` is a column on the patient row — they are resolved by walking link
tables. `currentOccupancy` is a `@computed` field that counts live `AdmittedTo`
links at read time, so it moves as patients come and go.

### Beat 5 — same data, other shapes

```bash
curl -s "http://localhost:4000/api/v1/patients"                     # REST
curl -s "http://localhost:4000/api/v1/patients/search?q=Smithson"   # full-text
curl -s "http://localhost:4000/fhir/Encounter?patient=<PASTE_ID>"   # FHIR R4
curl -s "http://localhost:4000/fhir/metadata"                       # CapabilityStatement
```

The FHIR Encounter is worth showing: there is **no Encounter table**. It is
synthesised from the `AdmittedTo` link, returned as a proper searchset Bundle with
`status: "in-progress"` and the NHS Digital profile.

### Beat 6 — discharge, and watch occupancy fall

```graphql
mutation Discharge {
  dischargePatient(input: {
    patient: "<PASTE_ID>", destination: HOME, notes: "Stable"
  }) { success affectedObjects { typeName id changeType } }
}
```

Re-run the Beat 4 query: status `DISCHARGED`, `currentWard` null, `currentOccupancy`
back to 0, bed → `CLEANING`. Then `curl` the FHIR Encounter again — now `finished`,
because the soft-deleted link is still projected as a completed encounter.

---

## 5. Other consoles

| What | URL | Notes |
| --- | --- | --- |
| Apollo Sandbox | http://localhost:4000/graphql | needs a browser; `curl` gets 400 without `Accept: text/html` |
| Keycloak Admin | http://localhost:8180/auth/admin | `admin` / your `KEYCLOAK_ADMIN_PASSWORD` |
| OpenFGA API | http://localhost:8280/stores | no playground path in v1.8.2 |
| Debezium | http://localhost:8083/ | CDC connectors |
| OpenAPI | http://localhost:4000/api/v1/openapi.json | generated REST contract |

`/metrics` and `/admin/packs` are pod-internal — they 404 through ingress by design.

---

## 6. Teardown

```bash
docker compose -p altius -f Orion/docker-compose.yaml down          # keep data
docker compose -p altius -f Orion/docker-compose.yaml down -v       # wipe volumes
```

Never add `--remove-orphans` unless you are certain no other project shares the name.

---

## 7. Known issues (as of this run)

- **Dev auth.** The default compose runs the gateway with `NODE_ENV=development`:
  allow-all authz and CEL stubs. Real infrastructure, but not enforced security. For
  real OIDC + ReBAC use `docker-compose.prod-test.yaml`, which needs an OIDC client
  and `OIDC_DEFAULT_TENANT`, and then every request carries a bearer token.
- **`createdAt`/`createdBy` read back `null`** in GraphQL even though Postgres stores
  them. Write path fixed; the read path for `@readonly` interface fields is not.
- **No `CreateWard`-style actions** in the NHS pack, hence the SQL seed above.
- **Docker DNS.** If image pulls fail with `lookup registry-1.docker.io: no such host`,
  the host resolver is the problem. Add to `~/.docker/daemon.json` and restart Docker:
  ```json
  { "dns": ["8.8.8.8", "1.1.1.1"] }
  ```
- **Image names follow the project name.** Building under one `-p` and running under
  another makes compose rebuild. Either keep `-p altius` throughout, or retag:
  `docker tag orion-api-gateway altius-api-gateway`.
