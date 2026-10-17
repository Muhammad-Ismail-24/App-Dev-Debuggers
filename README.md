# App-Dev-Debuggers — NaSCon '26 Multi-Sport League Platform

## 1. Overview of the Platform

App-Dev-Debuggers is a production-grade, self-hosted backend platform built for multi-sport league management, tournament operations, live match scoring, club roster management, and a concurrency-safe official merchandise store.

### Key Capabilities
- **Multi-Sport & Rule-Driven Engine**: Relational domain modeling accommodating dynamic rulesets (Football, Basketball, Cricket, Esports, and arbitrary user-defined "mystery sports") without hard-coded sport branches.
- **Append-Only Event-Sourced Scoring**: Immutable event logging for match scoring with live projections and signed compensating rollback events for score corrections.
- **Concurrency-Safe Merchandise Store**: E-commerce engine preventing overselling under high concurrency (e.g., 20 parallel buyers competing for 1 unit of stock) using pessimistic row-level locking (`SELECT ... FOR UPDATE`), minor-unit currency (`PKR` in paisa), and server-side signed PDF receipt generation.
- **5-Tier Role-Based Access Control (RBAC)**: Multi-tenant administrative isolation separating super administrators, league organizers, club managers, players, and spectators.
- **Realtime WebSocket Streaming**: Live match score tracking, game lifecycle events, and featured in-match product promotions.
- **Offline Synchronization**: Chronological reconciliation and conflict handling for mobile operations performed with intermittent network connectivity.

---

## 2. Requirements

- **Docker Engine**: Version 24.0 or newer
- **Docker Compose**: Version v2 (Compose V2 CLI plugin)
- **Host OS**: Linux (Ubuntu 22.04+ recommended), macOS, or Windows 10/11 with WSL2 / Docker Desktop
- **Zero Host Dependencies**: No host-installed Python, PostgreSQL, Redis, RabbitMQ, or MinIO required. All dependencies are containerized.
- **Strict Prohibition**: No Firebase, Supabase, AWS Amplify, or third-party BaaS.

---

## 3. One-Command Start

To build and start the entire containerized infrastructure:

### Bash / Linux / macOS
```bash
DAY1_SALT=<your-salt> docker compose up -d --build
```

### PowerShell (Windows)
```powershell
$env:DAY1_SALT="<your-salt>"; docker compose up -d --build
```

### Health Readiness Probe
The grading system polls the readiness endpoint every 2 seconds. The API must return HTTP 200 within 120 seconds after the build command completes:
```http
GET http://localhost:8080/health
```
**Response:**
```json
{
  "status": "ok"
}
```

### Baseline Reset & Seeding (`POST /audit/v1/reset`)
Before running evaluation test suites, the grader invokes the deterministic reset endpoint:
```http
POST http://localhost:8080/audit/v1/reset
Content-Type: application/json

{}
```
#### Reset Behavior
1. **Concurrency Protection**: Serialized using a PostgreSQL transaction-level advisory lock (`SELECT pg_advisory_xact_lock(20261017)`).
2. **State Truncation**: Truncates all graded state tables (`offline_sync_actions`, `match_events`, `orders`, `order_items`, `roster_*`, `matches`, `leagues`, `sports`, `users`, `tenants`, `system_state`) with `RESTART IDENTITY CASCADE`.
3. **Deterministic Seeding**:
   - **4 Baseline Sports**: `football` (timed event), `basketball` (timed event), `cricket` (overs/wickets innings), and `esports` (best-of-3 rounds).
   - **2 Baseline Tenants**: `tenant-alpha` ("Alpha Sports") and `tenant-beta` ("Beta Athletics").
   - **Store Inventory**: `prod-jersey-001` with variants `var-jersey-001-M` (stock: 1) and `var-jersey-001-L` (stock: 5), and discount code `WELCOME10` (10% discount).
   - **Baseline Leagues & Clubs**: `league-alpha-1`, `league-alpha-2`, `league-beta-1`; `club-alpha-1`, `club-alpha-2`, `club-beta-1`.
   - **Baseline Roster**: Players `player-alpha-1`, `player-alpha-2`, `player-beta-1` registered to their respective initial squads.
   - **5 Demo Accounts**: Seeded with verified PBKDF2-HMAC-SHA256 password hashes.
4. **Idempotency**: Running `/audit/v1/reset` multiple times in succession completes within 10 seconds and leaves identical state.

---

## 4. Ports

| Service | Port Mapping | Scope | Description |
|---|---|---|---|
| **API (`api`)** | `8080:8080` | **Published to Host** | FastAPI application listening on port `8080` (NEVER 8000) |
| **PostgreSQL (`postgres`)** | `5432` | Internal to Compose | Relational database (postgres:16-alpine) |
| **Redis (`redis`)** | `6379` | Internal to Compose | Cache and rate-limiter (redis:7-alpine) |
| **RabbitMQ (`rabbitmq`)** | `5672` | Internal to Compose | AMQP message broker (rabbitmq:3.13-management-alpine) |
| **MinIO (`minio`)** | `9000` | Internal to Compose | S3-compatible object storage server |

*Note: Only host port `8080` is published. All internal backing service ports remain shielded inside the Docker bridge network.*

---

## 5. Environment Variables

The table below corresponds exactly to `.env.example`:

| Variable | Example Value | Purpose & Description |
|---|---|---|
| `DAY1_SALT` | `replace-with-your-team-slip-salt` | Required HMAC-SHA256 signing secret provided on team slip |
| `POSTGRES_USER` | `postgres` | PostgreSQL root superuser |
| `POSTGRES_PASSWORD` | `postgres` | PostgreSQL root password |
| `POSTGRES_DB` | `nascon` | Default PostgreSQL database name |
| `DATABASE_URL` | `postgresql+psycopg2://postgres:postgres@postgres:5432/nascon` | SQLAlchemy connection URI |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection URI |
| `RABBITMQ_DEFAULT_USER` | `guest` | RabbitMQ default administrative user |
| `RABBITMQ_DEFAULT_PASS` | `guest` | RabbitMQ default administrative password |
| `RABBITMQ_URL` | `amqp://guest:guest@rabbitmq:5672/` | AMQP connection string for event publishing |
| `MINIO_ENDPOINT` | `minio:9000` | MinIO internal service hostname and port |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO root access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO root secret key |
| `JWT_SECRET` | `change-me-in-production-jwt-secret-min-32-chars` | Secret key used for signing and validating JWT tokens |
| `CORS_ORIGINS` | `*` | Allowed CORS origins (comma-separated or `*`) |

> [!IMPORTANT]
> **Cryptographic Salt Mandate**: `DAY1_SALT` is read strictly from the host environment at container startup (forwarded via Compose as `DAY1_SALT: ${DAY1_SALT}`). The real value is **NEVER** committed to git, baked into Docker images, or written to configuration files.

---

## 6. Demo Accounts

All five demo accounts are seeded with password: `Nascon@26` (hashed via PBKDF2-HMAC-SHA256, 100,000 iterations).

| Account Email | Role | Bound Entities / Tenant | Scope & Capabilities |
|---|---|---|---|
| `admin@nascon.test` | `super_admin` | Global / Cross-tenant | Global administrator. Can create mystery sports, inspect/modify any league, access all tenant data, pin products to matches, and pass all RBAC audit probes (P1–P7). |
| `organizer@nascon.test` | `league_organizer` | `tenant-alpha` / `league-alpha-1` | League organizer. Owns and administers `league-alpha-1`. Can register fixtures, record match events, and pin merchandise for `league-alpha-1` matches. Prohibited from altering other leagues. |
| `manager@nascon.test` | `club_manager` | `tenant-alpha` / `club-alpha-1` | Club manager. Owns and operates `club-alpha-1`. Can initiate squad transfers, loans, and releases for `club-alpha-1` players. Blocked from managing rival clubs or performing cross-tenant transfers (`CROSS_TENANT_TRANSFER`). |
| `player@nascon.test` | `player` | `tenant-alpha` / `player-alpha-1` | Player account. Bound to `player-alpha-1`. Can view personal registration history, match assignments, and league stats. Cannot execute administrative roster actions or score matches. |
| `viewer@nascon.test` | `viewer` | `tenant-alpha` | Public/fan account. Read-oriented access to schedules, standings, live scores, and merchandise catalogue. Can initiate store purchases via checkout. |

---

## 7. Architecture Summary

```
                       +------------------------------------------+
                       |           FastAPI Web Server             |
                       |       (Host :8080, Python 3.12)          |
                       +--------------------+---------------------+
                                            |
                 +--------------------------+--------------------------+
                 |                          |                          |
                 v                          v                          v
       +-------------------+      +-------------------+      +-------------------+
       |   PostgreSQL 16   |      |      Redis 7      |      |   RabbitMQ 3.13   |
       | (ACID Store, ORM, |      |  (Sliding-Window  |      |   (Domain Event   |
       |  Advisory Locks)  |      |   Rate Limiter)   |      |      Broker)      |
       +---------+---------+      +-------------------+      +---------^---------+
                 |                                                     |
                 | (Transactional Outbox)                              |
                 +---------------------+-------------------------------+
                                       |
                                       v
                             +-------------------+
                             |  Outbox Worker    |
                             | (Event Publisher) |
                             +-------------------+
```

- **FastAPI Layer**: High-speed ASGI framework enforcing strict input validation via Pydantic v2 schemas and pure ASGI body size limits (1 MiB ceiling returning `413 PAYLOAD_TOO_LARGE`).
- **PostgreSQL 16 & SQLAlchemy 2.0**: The authoritative system of record. Sync transaction scopes manage atomic state transitions with pessimistic locking (`with_for_update`) on inventory and match records.
- **Redis 7 Rate Limiter**: Enforces a rolling window rate limit of 100 requests per 10 seconds per client IP on `/api/v1/*` endpoints. `/audit/v1/*` and `/health` are strictly exempt.
- **RabbitMQ 3.13 & Transactional Outbox**: Atomic event dispatching without dual-write inconsistencies. Handlers write events to `domain_event_outbox` in the same database transaction; a dedicated consumer worker publishes staged messages to RabbitMQ.
- **MinIO Object Store**: Dedicated S3-compatible store container on the internal Compose network.
- **Realtime WebSocket Hub**: Thread-safe in-memory pub/sub hub broadcasting live score diffs, match state transitions, and pinned merchandise notifications to active client sockets.
- **Event-Sourced Scoring Engine**: Append-only event log (`match_events`) re-projecting current game status and score. Scoring modifications use compensating rollback events pointing to prior `target_event_id`s, preserving auditability.
- **HMAC-SHA256 Signatures**: Canonical JSON serialization (keys sorted alphabetically, no whitespace, unescaped unicode) signed with `DAY1_SALT` using HMAC-SHA256 to produce 64-character lowercase hex digests for match events and store receipts.
- **Mock Payment Gateway**: Deterministic mock payment processor handling credit/debit charges and simulating card declines (`PAYMENT_DECLINED`) or capture faults (`PAYMENT_CAPTURE_FAILED`), automatically rolling back reserved inventory.
- **Server-Side PDF Receipts**: ReportLab generates valid `%PDF` receipt binaries encoded in base64, calculating discounts and displaying items, quantities, and minor-unit `PKR` pricing.
- **5-Tier JWT RBAC**: Strict tenant and entity boundaries evaluated on every secured route, preventing cross-tenant data leakage.

---

## 8. Endpoint Index

### 8.1 Part I Specification (Section 5.1 Audit API Table)

| Method & Path | Purpose | PDF Sec. |
|---|---|---|
| `GET /health` | Readiness probe (no auth) | 5.4 |
| `POST /audit/v1/reset` | Wipe state and seed baseline data | 5.5 |
| `POST /audit/v1/sports` | Create a "mystery sport" from JSON rules | 5.6 |
| `POST /audit/v1/fixtures` | Generate round robin / swiss / single elim / double elim | 5.7 |
| `POST /audit/v1/leagues` | Register a league (teams, fixtures, points, tie-break config) | 5.8 |
| `POST /audit/v1/events` | Append a match event or compensating event (signed) | 5.9 |
| `GET /audit/v1/score/{match_id}` | Score projection rebuilt from the event log | 5.9 |
| `GET /audit/v1/standings/{league_id}` | Ordered table, H2H, clinched/eliminated | 5.10 |
| `POST /audit/v1/roster/setup` | Create a roster scenario (league, squads, players) | 5.11 |
| `POST /audit/v1/roster/transfer` | Transfer / loan / release with all rule checks | 5.11 |
| `GET /audit/v1/roster/history/{player_id}` | Immutable audit trail + loan auto-return | 5.11 |
| `POST /audit/v1/checkout` | Concurrency-safe purchase + signed PDF receipt | 5.12 |
| `GET /audit/v1/inventory/{variant_id}` | Current stock of a variant | 5.12 |
| `POST /audit/v1/rbac-matrix` | JWTs for all 5 roles + scenario ids | 5.13 |
| `/audit/v1/rbac/*` (7 probe routes) | Authorization probes used with those JWTs | 5.13 |
| `GET /api/v1/ping` | Rate-limit probe | 5.13 |
| `POST /audit/v1/offline-sync` | Replay queued offline actions, return conflict resolutions | 5.14 |

### 8.2 Mobile API Endpoints (`/api/v1/*`)

| Method & Path | Purpose | Auth & Rate Limiting |
|---|---|---|
| `POST /api/v1/auth/login` | Verify credentials, return JWT access token, user, and tenant info | Unauthenticated; Rate limited |
| `GET /api/v1/me` | Fetch profile and tenant branding for currently authenticated user | Bearer JWT; Rate limited |
| `GET /api/v1/leagues` | List active leagues with sport configuration and team count | Bearer JWT; Rate limited |
| `GET /api/v1/leagues/{league_id}/fixtures` | Fixtures and live score projections for a specific league | Bearer JWT; Rate limited |
| `GET /api/v1/matches/{match_id}` | Complete score projection, event timeline, and pinned product | Bearer JWT; Rate limited |
| `POST /api/v1/matches/{match_id}/pinned-product` | Pin featured merchandise item to match (Super Admin / Organizer only) | Bearer JWT; Rate limited |
| `GET /api/v1/clubs/{club_id}` | Club profile, home venue coordinates, staff, and active roster | Bearer JWT; Rate limited |
| `GET /api/v1/store/products` | Merchandise catalogue with variant sizes, colors, price, and stock | Bearer JWT; Rate limited |

### 8.3 Realtime WebSocket Endpoints

| Protocol & Path | Purpose | Auth |
|---|---|---|
| `WS /api/v1/ws/matches/{match_id}` | Live score diffs, state transitions, and pinned product updates for a single match | Public / Open |
| `WS /api/v1/ws/feed` | Global realtime broadcast stream for all matches across all sports | Public / Open |

---

## 9. Mobile App (iOS Simulator)

The mobile application is located in `mobile/` and developed using React Native.

### iOS Simulator Run Steps (on macOS with Xcode)
```bash
cd mobile
npm install
npx expo prebuild
npx pod-install ios
npx expo run:ios
```

### Changing Server Address
When running the iOS Simulator on a separate Mac from the machine hosting Docker:
1. Open the mobile app settings or environment configuration (`mobile/src/config/environment.ts`).
2. Set the API host address to:
   ```text
   http://<LAPTOP_LAN_IP>:8080
   ```
3. **NEVER use `localhost` or `127.0.0.1`** from an external physical device or separate simulator host, as it refers to the client device itself rather than the Docker host.

<!-- ZAHEEN_PLACEHOLDER: Insert final iOS simulator and Xcode workspace run instructions here -->

---

## 10. Running Tests & Code Coverage

Backend automated test suites and coverage reports are executed using the root test runner:

```bash
chmod +x ./run_tests.sh
./run_tests.sh
```

### Coverage Declaration (`COVERAGE.json`)
The Part I submission package requires `COVERAGE.json` at the repository root declaring actual line coverage for the six core domain areas:
```json
{
  "fixtures": 91.2,
  "scoring": 88.0,
  "standings": 86.5,
  "store": 90.1,
  "roster": 87.3,
  "rbac": 85.0
}
```

<!-- SUFIYAN_PLACEHOLDER: Insert automated test suite execution details, test runner flags, and final COVERAGE.json line-coverage metrics here -->

---

## 11. Project Layout

```text
App-Dev-Debuggers/
├── .env.example                              # Ismail | Environment template (no real salt)
├── docker-compose.yml                       # Ismail | Full multi-container Compose specification
├── README.md                                # Ismail | Platform documentation and run guide
├── instructions.md                          # Team contract | Canonical requirements and task map
├── REPOSITORY_STRUCTURE.md                  # Team contract | Quick ownership reference
├── ADR.md                                    # Sufiyan | Architectural Decision Records
├── TRACEABILITY.md                           # Sufiyan | Requirement-to-test traceability matrix
├── COVERAGE.json                             # Sufiyan | Line coverage report for 6 backend areas
├── run_tests.sh                              # Sufiyan | Automated test execution script
├── scripts/
│   └── bootstrap_structure.py                # Sufiyan | Scaffold directory generator
├── backend/                                  # FastAPI Application Root
│   ├── Dockerfile                            # Ismail | Container definition
│   ├── requirements.txt                      # Ismail | Python package dependencies
│   └── app/
│       ├── __init__.py
│       ├── main.py                            # Ismail | FastAPI entrypoint and lifespan hooks
│       ├── api/
│       │   ├── __init__.py
│       │   ├── router.py                      # Ismail | Central API route registrar
│       │   └── routes/
│       │       ├── __init__.py
│       │       ├── health.py                  # Ismail | GET /health
│       │       ├── reset.py                   # Ismail | POST /audit/v1/reset
│       │       ├── sports.py                  # Ismail | POST /audit/v1/sports
│       │       ├── fixtures.py                # Sufiyan | POST /audit/v1/fixtures
│       │       ├── leagues.py                 # Ismail | POST /audit/v1/leagues
│       │       ├── events.py                  # Ismail | POST events; GET score
│       │       ├── standings.py               # Sufiyan | GET standings
│       │       ├── roster.py                  # Ismail | Setup, transfer, history
│       │       ├── checkout.py                # Ismail | POST checkout
│       │       ├── inventory.py               # Ismail | GET inventory
│       │       ├── rbac.py                    # Sufiyan | JWT matrix + 7 role probe routes
│       │       ├── ping.py                    # Sufiyan | GET /api/v1/ping
│       │       ├── offline_sync.py            # Ismail | POST offline-sync
│       │       ├── realtime.py                # Ismail | WS /api/v1/ws/matches & feed
│       │       └── mobile_api.py              # Ismail | /api/v1 mobile endpoints
│       ├── core/
│       │   ├── __init__.py
│       │   ├── config.py                      # Ismail | Settings and environment parser
│       │   ├── errors.py                      # Ismail | Standard error response structures
│       │   └── signing.py                     # Ismail | HMAC-SHA256 and canonical JSON
│       ├── db/
│       │   ├── __init__.py
│       │   ├── session.py                     # Ismail | DB engine and sessionmaker
│       │   ├── models.py                      # Ismail | SQLAlchemy declarative models
│       │   ├── repositories.py                # Ismail | Data access abstraction layer
│       │   └── seed.py                        # Ismail | Deterministic database seeding
│       ├── schemas/                           # Pydantic v2 validation models
│       │   ├── __init__.py
│       │   ├── sports.py                      # Ismail
│       │   ├── fixtures.py                    # Sufiyan
│       │   ├── leagues.py                     # Ismail
│       │   ├── events.py                      # Ismail
│       │   ├── standings.py                   # Sufiyan
│       │   ├── roster.py                      # Ismail
│       │   ├── checkout.py                    # Ismail
│       │   ├── rbac.py                        # Sufiyan
│       │   ├── offline_sync.py                # Ismail
│       │   └── mobile_api.py                  # Ismail
│       ├── services/                          # Core business logic
│       │   ├── __init__.py
│       │   ├── sports.py                      # Ismail
│       │   ├── fixtures.py                    # Sufiyan
│       │   ├── leagues.py                     # Ismail
│       │   ├── scoring.py                     # Ismail | Event projection and compensation
│       │   ├── standings.py                   # Sufiyan
│       │   ├── roster.py                      # Ismail | Transfer and loan validation
│       │   ├── checkout.py                    # Ismail | Inventory reservation & PDF
│       │   ├── offline_sync.py                # Ismail | Queued action reconciler
│       │   └── realtime.py                    # Ismail | In-memory WebSocket broadcast hub
│       ├── security/
│       │   ├── __init__.py
│       │   ├── jwt.py                         # Sufiyan | JWT encode/decode
│       │   ├── rbac.py                        # Sufiyan | Role/tenant permission checkers
│       │   └── rate_limit.py                  # Sufiyan | Sliding-window limiter
│       └── workers/
│           ├── __init__.py
│           ├── consumer.py                    # Ismail | AMQP outbox event consumer
│           └── publisher.py                   # Ismail | Outbox staging helper
├── mobile/                                   # Zaheen | React Native mobile application
└── tests/                                    # Sufiyan | Automated test suites
```

---

## 12. Known Limitations

1. **In-Memory WebSocket Hub**: The realtime WebSocket hub operates in-memory within the single API process. Broadcasts are dispatched locally across active connections rather than across a distributed Redis Pub/Sub cluster.
2. **MinIO Object Store Usage**: The MinIO container is provisioned, healthy, and accessible over the Docker network; PDF receipts generated during checkout are currently compiled and hashed dynamically in-memory and returned as base64 payloads rather than uploaded to an S3 bucket.
3. **Mock Payment Gateway**: Credit card charges and payment authorizations are processed through an internal simulated payment engine (`mock_payment_gateway`) that deterministically returns success or specific decline error codes (`PAYMENT_DECLINED`, `PAYMENT_CAPTURE_FAILED`). No real banking rails are touched.
4. **Deferred Roster Transfers**: In accordance with specification rule §5.11, transfers for players whose clubs are currently engaged in a live match are deferred with status `deferred_until_match_end`, requiring match completion before the roster status transitions to active.
5. **Mobile API Thin Wrapper Integration**: The core domain engine is fully accessible and tested via the `/audit/v1/*` routes; mobile convenience routes (`/api/v1/*`) are structured as thin adapters over existing repositories and services.
