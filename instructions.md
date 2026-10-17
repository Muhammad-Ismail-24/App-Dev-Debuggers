# NaSCon '26 App Dev — Part I Implementation Instructions

**Team:** App-Dev-Debuggers — **Ismail (backend/infrastructure/Git), Sufiyan (backend algorithms/security/QA), Zaheen (mobile frontend/iOS integration)**  
**Repository:** https://github.com/Muhammad-Ismail-24/App-Dev-Debuggers.git  
**Primary, controlling source:** `NaSCon 26 App Dev Part 1-1.pdf` (NaSCon '26 Part I Specification, 22 pages).  
**Sprint:** Saturday, **17 October 2026**, 10:45–15:00 PKT; final GitHub push accepted until **15:05:00 PKT**.  
**Document purpose:** Shared instructions for all teammates and their AI coding assistants. This file is a *work plan*, not a replacement for the exact API schemas in Section 5 of the PDF.

> **SOURCE PRIORITY (NON-NEGOTIABLE):** When the Part I PDF disagrees with the earlier `Official_Participant_Rules_Booklet.pdf` or the three personalized guides, **follow the Part I PDF for Part I**. In particular: **host API port 8080 (not 8000); Part I score 50; GitHub repository must be public and registered with venue volunteer before 11:15; deadline 15:05 for last accepted push.** Follow the PDF's exact request/response fields, error codes, algorithms, and test vectors. For unresolved administrative contradictions, request a *written* ruling from organizers before 13:00; do not silently change the API contract.

## 1. Objective and scoring priorities

Build one multi-tenant, **configurable multi-sport league and club-operations platform** with:

1. A self-hosted backend: REST API, WebSocket or SSE realtime feed, append-only match scoring, configurable sports/leagues, fixtures, standings, club rosters, simulated merchandise checkout, queue/worker, role-based access control, and offline synchronization.
2. An iOS application installed and demonstrated through **Xcode's iOS Simulator on Zaheen's Mac**. The user-facing screens include login, fixtures, match detail, standings, club profiles, store/checkout/receipt, roster changes, scoring entry/correction, and offline/sync status.
3. The exact autograder wrapper on `http://localhost:8080` with the `GET /health` and `/audit/v1/*` endpoints. **JSON field names, statuses, errors and signatures are binding.**

**50 Phase I points:** backend **36**, mobile offline queue/sync **4**, mobile UI/HCI **10** (PDF §9.1). Hidden vectors determine backend scoring; a pretty frontend cannot replace correct backend behavior. Correct subsets can earn vector-based partial credit. Prioritize a booting, testable implementation over unfinished extras.

**Forbidden:** Firebase, Supabase, AWS Amplify or other prohibited managed BaaS for graded functionality; third-party fixture-generation libraries; hard-coded branches on individual sport names or scoring-event names; real payment processors. AI coding assistants ARE allowed under the older rules booklet, but source work must be generated during permitted sprint time and comply with submission rules.

## 2. Architecture and platform decisions

### 2.1 Backend architecture — Ismail owns deployment

- **API:** Python 3.12 + FastAPI/Uvicorn, with clean service modules and Pydantic validation.
- **Database:** PostgreSQL 16 for durable sports, tenants, leagues, teams, match events, player registrations, orders, inventory, device sync records and audit logs.
- **Cache + rate limiting + realtime backing:** Redis 7 (optional pub/sub for realtime fan-out).
- **Internal queue:** RabbitMQ 3.13 **or** Redis Streams, with a self-hosted worker. Choose one early; RabbitMQ is the explicit default in the proposed Compose layout below. Order status transitions must emit structured domain events.
- **Object storage:** self-hosted MinIO. Receipt PDF generation occurs on the backend; PDFs may also be stored there.
- **Authentication:** signed JWT and an explicit policy matrix implementing the five roles. No external managed auth.
- **Realtime:** WebSocket or SSE, broadcasting match status, score updates and pinned-product changes. Persist authoritative state in PostgreSQL, not websocket memory.
- **App integration:** the mobile app calls the API from the simulator. When Ismail's backend is on a separate laptop, use `http://<ISMAIL_LAN_IP>:8080`, **not `localhost` on Zaheen's Mac**. The address must be configurable in mobile settings or build configuration (PDF §8.1).

### 2.2 iOS development and final build — Zaheen owns it

- **Frontend framework:** React Native + TypeScript, retaining the team's existing React Native/Expo-based plan **but using a native iOS Simulator build through Xcode — NOT Expo Go**. If retaining Expo tooling, use an Xcode-compatible native development build (`npx expo run:ios`) and installed native dependencies; do not assume Expo Go-only limitations apply.
- **Machine:** Zaheen's Apple Silicon MacBook Air with Xcode, matching iOS Simulator runtime, Node, project dependencies and required CocoaPods/native build tooling installed.
- **Final deliverable:** iOS app **installed and ready on Zaheen's simulator/device for the judge** (PDF §8.1). **The APK path requirement applies to Android teams, not to this iOS submission.** Commit all mobile source and native configuration to `mobile/`; do not depend on the grader having Xcode or compiling iOS code in Docker.
- **Local persistence:** SQLite on iOS (e.g. `expo-sqlite` with native build), not memory-only state or AsyncStorage as the sole authoritative offline cache.
- **Token protection:** iOS Keychain (e.g. `expo-secure-store` or a native Keychain-backed alternative); never store JWT in plain SQLite.
- **Connectivity:** actual iOS simulator/physical device network tests. For development over local HTTP, use narrowly scoped iOS App Transport Security configuration if needed, and document it. Do not disable transport security broadly without reason.
- **UI automation:** Selenium on React Native Web is **supplementary**, not a substitute for the required native simulator/device demonstration. Prioritize manual/native simulator check and backend API tests; optional iOS XCUITest/Appium if already available.

### 2.3 Required ports and environments

| Surface | Binding / address | Mandatory? | Notes |
|---|---|---|---|
| Backend API on grading machine | `http://localhost:8080` (host port **8080**) | **YES** | Compose must publish host `8080` to API service; `/health`, `/audit/v1/*`, `/api/v1/ping` reachable here. |
| Ismail's backend from Sufiyan/Zaheen | `http://<ISMAIL_LAN_IP>:8080` | For local integration | FastAPI bind `0.0.0.0`; Docker `8080:8080`; local firewall must permit TCP 8080. |
| PostgreSQL | container `postgres:5432` | YES, internal | No host exposure required by grader. |
| Redis | container `redis:6379` | YES, internal | Cache, rate-limit state and optionally pub/sub. |
| RabbitMQ | container `rabbitmq:5672` | If chosen | Internal message queue; do not publish public management UI unnecessarily. |
| MinIO | container `minio:9000` | YES in planned stack | Internal storage; credentials from environment, not committed secrets. |
| Mobile Metro/dev tooling | Dev port selected by React Native/Expo | Local only | **Not** an autograder port; do not confuse with API `8080`. |

**Single-command grader startup:** from repository root, `DAY1_SALT=<team-slip-salt> docker compose up -d --build`. Compose must pass `DAY1_SALT: ${DAY1_SALT}` to the API (and any signing workers). The grader uses Ubuntu 22.04 / Docker Compose v2, 4 vCPU, 8 GB RAM; build/pulls must finish within **10 minutes**, then `GET /health` must become HTTP 200 within **120 seconds**. No manual migrations, pre-created volumes or post-build Internet requirements (PDF §5.2).

**Secrets:** never commit the real `DAY1_SALT`, passwords beyond the mandated *demo* accounts, private keys or `.env`. Commit `.env.example` with variable names and safe placeholders. The salt is read **only** from the environment; it must never be hard-coded.

## 3. Team ownership — no conflicting edits

### Ismail — Backend architecture, stateful services, Git master

**Own:** `backend/app/main.py`, `backend/app/core/`, `backend/app/db/`, `backend/app/models/`, `backend/app/services/sports.py`, `leagues.py`, `scoring.py`, `roster.py`, `checkout.py`, `offline_sync.py`, `backend/app/routes/` integration, `backend/Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`, GitHub submission administration.

**Deliver in this order:**

1. **Foundation:** after sprint start, initialize/push repo; Dockerfile + Compose + Postgres + Redis + queue + MinIO + worker; `GET /health` returns **exactly** `{"status":"ok"}` *only once DB is reachable and baseline data is seeded*; `POST /audit/v1/reset` resets ALL graded state deterministically (default seed 42, specific variants and tenants, four sports, clubs, leagues and demo users).
2. **Sport and league data:** `POST /audit/v1/sports` supports arbitrary JSON-defined event/innings/round scoring models; `POST /audit/v1/leagues` saves fixture/standings configuration. Reuse the *same schema* for seeded and mystery sports; zero branches on specific sport/event names.
3. **Append-only scoring engine:** `POST /audit/v1/events`, `GET /audit/v1/score/{match_id}`; support `match_init`, `match_start`, `score`, `discipline`, `tiebreak_winner`, `match_end`, `compensation`, valid state transitions, idempotency, and signed events. Rebuild scores from the full event stream, ignoring compensated contributions but retaining every event row. Expose read-only projection interface to Sufiyan's standings code.
4. **Merchandise backend:** `POST /audit/v1/checkout`, `GET /audit/v1/inventory/{variant_id}`; atomic variant reservations with no overselling; discount code `WELCOME10`; mock tokens `tok_success`, `tok_declined`, `tok_capture_fail`; rollback reservations on payment failure; PDF receipt with exact signed payload and base64 output.
5. **Roster backend:** `POST /audit/v1/roster/setup`, `POST /audit/v1/roster/transfer`, `GET /audit/v1/roster/history/{player_id}`; tenant checks, transfer windows, max-squad and required-position checks, loans/auto-return, immutable audit history, deferred in-progress-match moves and idempotency. **Validate in the exact order specified in §5.11.**
6. **Offline-sync backend:** `POST /audit/v1/offline-sync`; replay queued score/roster actions chronologically; return per-action status/resolution/error and version, dedupe by `(device_id, action_id)`, and apply the correct version-conflict rules (§5.14). Expose a stable interface for Zaheen's queue.
7. **Realtime + demo:** websocket/SSE notifications; simple production endpoints for mobile browsing, authentication and store catalogue where audit endpoints alone are insufficient. Share route docs with Zaheen. Maintain a working, startup-safe Compose, not just a locally runnable Uvicorn app.

**Integration duty:** merge/wire Sufiyan's `fixtures.py`, `standings.py`, and `rbac.py` into FastAPI routing **without rewriting their business rules**. Communicate the data models and entrypoint contracts before parallel implementation.

### Sufiyan — Backend algorithms, RBAC/security, automated QA and viva docs

**Own:** `backend/app/services/fixtures.py`, `backend/app/services/standings.py`, `backend/app/security/rbac.py` (or `services/rbac.py`), `tests/`, `run_tests.sh`, `COVERAGE.json`, `TRACEABILITY.md`, `ADR.md`. Share API route declarations with Ismail or provide an isolated router for inclusion.

**Deliver in this order:**

1. **Algorithm #1 /fixtures (pure function):** `POST /audit/v1/fixtures` with strict schema; round-robin (circle method, home/away balance, odd-team byes, withdrawals with `forfeit_remaining` or `void_all`), single elimination (exact seed order, byes, winner routing), Swiss rounds (Buchholz, no rematches, globally minimal score gaps via backtracking/matching), double elimination (winners/losers bracket routing, grand-final reset). The endpoint **must not persist** a schedule (PDF §5.7).
2. **Algorithm #2 standings:** `GET /audit/v1/standings/{league_id}` recomputed from Ismail's event log; ordered points table, H2H matrices, three-way mini-leagues, restart-on-split tie-break recursion, score/run-rate/map differentials, seeded SHA256 lots, clinched/eliminated/still_possible calculations (PDF §5.10). Do not keep mutable counters as the source of truth.
3. **RBAC & API security:** `POST /audit/v1/rbac-matrix`; 7 `/audit/v1/rbac/*` probe routes; five tier permissions with both ownership and cross-tenant boundaries; validate signed, nonexpired JWT and reject tampered/`alg:none`; `GET /api/v1/ping` rate limit 100 requests per rolling 10s/client IP (audit and health endpoints **exempt**). Coordinate shared JWT middleware and request validation with Ismail (PDF §5.13).
4. **API contract tests:** pytest for each endpoint, happy path, idempotent replays, invalid schema, exact HTTP/error codes, nonhardcoded mystery sports, event compensation/signatures, 3-way standings tie, transfers, and offline sync. Keep tests in `tests/` and runnable by `./run_tests.sh` from a clean repo.
5. **Concurrency/security probes:** k6 or pytest-thread tests: 20 concurrent orders of the only stocked medium jersey must yield **exactly 1 × HTTP 201 and 19 × HTTP 409**; inventory ends `stock:0`, `reserved:0`. Test 150 calls to `/api/v1/ping` within 5 s and invalid tokens/tenant probes.
6. **Docs and quality:** `TRACEABILITY.md` mapping **every FR/NFR ID** to real source and tests; 8 concise `ADR.md` entries (context/decision/consequences) for Day 2 viva; `COVERAGE.json` with honest line coverage figures for `fixtures`, `scoring`, `standings`, `store`, `roster`, `rbac`. Target ≥85% per area for bonus but **never fabricate coverage**. Coordinate test IDs for UI with Zaheen and run smoke tests of the native simulator app.

**Priority rule:** backend feature implementations and a thin runnable automated contract test suite come before elaborate Selenium infrastructure/report polish. Share bugs promptly with code owner; don't silently duplicate Ismail's modules.

### Zaheen — 100% of mobile frontend and final iOS build

**Own:** **all** code in `mobile/`, including React Native screens, components, theme, navigation, hooks, mobile API client, local SQLite persistence, offline queue, Keychain token storage, iOS app config/native project and Xcode Simulator compilation. Ismail and Sufiyan are **not** expected to build frontend screens.

**Deliver in this order:**

1. Install/verify Xcode + simulator. Create a TypeScript React Native app inside `mobile/` and run a native iOS simulator build immediately. **Do not use Expo Go.** Verify it can call Ismail's `/health` on `<ISMAIL_LAN_IP>:8080` over the team LAN/hotspot. Make API URL configurable from settings/build config.
2. Build a role-aware app shell: login (email/password), accessible navigation, design system (consistent colors, typography, 48dp-like hit targets), loading/error/empty states, online/offline/syncing indicator and persistent auth through iOS Keychain.
3. Implement required screens from PDF §8.2: **Fixtures** (status/time), **Match detail** (live score, event timeline, pinned merch), **Standings** (rank + qualification), **Club profile** (roster/staff/venue), **Store** (products, variants, cart, mock checkout, receipt), **Roster management** (Manager: add/transfer/loan/release), **Scoring entry** (Organizer: score and compensate), **Sync status** (persistent queue and per-action outcomes). Use real API responses, not static mock screens for the final demo.
4. SQLite cache of fixtures, standings and club profiles. Offline access works after **force-closing and reopening** the app. Offline score and roster actions queue persistently in the **exact §5.14 envelope** (`action_id`, `type`, `queued_at`, `base_version`, `payload`). On reconnection (or explicit Sync), POST `/audit/v1/offline-sync`; show `applied`/`rejected` explanations; clear resolved items only after response is durably handled.
5. Verify role-based navigation: super-admin, organizer, club manager, player, viewer. The app should hide actions a role cannot perform, but trust backend enforcement for security.
6. Final build: iOS Simulator application **installed and openable on Zaheen's Mac** before 15:15 judging. Run the judge flow end-to-end: (A) standings → match, (B) merchandise purchase → PDF receipt, (C) club manager roster action → repeat offline → sync. Recheck 360×640-equivalent layout and rotation where practical.

**Mobile integration contract:** Ismail publishes the backend endpoints and response examples early. Sufiyan gives stable UI `testID` recommendations if web/UI automation is attempted. Put all backend URLs behind one configurable client, never scatter `localhost:8000` across screens.

## 4. Exact mandatory API interface / ownership

Every endpoint is hosted under **`http://localhost:8080`** for the grader. Preserve the contract in PDF §5; owner means implementation, not exclusive access to that code.

| Method/path | Owner | PDF |
|---|---|---|
| `GET /health` | Ismail | §5.4 |
| `POST /audit/v1/reset` | Ismail | §5.5 |
| `POST /audit/v1/sports` | Ismail | §5.6 |
| `POST /audit/v1/fixtures` | **Sufiyan** | §5.7 |
| `POST /audit/v1/leagues` | Ismail | §5.8 |
| `POST /audit/v1/events` | Ismail | §5.9 |
| `GET /audit/v1/score/{match_id}` | Ismail | §5.9 |
| `GET /audit/v1/standings/{league_id}` | **Sufiyan** | §5.10 |
| `POST /audit/v1/roster/setup` | Ismail | §5.11 |
| `POST /audit/v1/roster/transfer` | Ismail | §5.11 |
| `GET /audit/v1/roster/history/{player_id}` | Ismail | §5.11 |
| `POST /audit/v1/checkout` | Ismail | §5.12 |
| `GET /audit/v1/inventory/{variant_id}` | Ismail | §5.12 |
| `POST /audit/v1/rbac-matrix` | **Sufiyan** | §5.13 |
| 7 role probe routes under `/audit/v1/rbac/*` | **Sufiyan** | §5.13 |
| `GET /api/v1/ping` | **Sufiyan** | §5.13 |
| `POST /audit/v1/offline-sync` | Ismail | §5.14 |

**Common HTTP/JSON semantics (§5.2):**

- JSON UTF-8; `Content-Type: application/json`; identifiers are 1–64 chars from `[A-Za-z0-9_.:-]` (never `|`), timestamps ISO 8601 UTC with `Z`; currency `PKR` and **integer paisa** (`450000` for PKR 4500.00).
- Missing required/wrongly typed fields → `400`; unknown referenced ID → `404`; business conflict → `409`; payment declined/capture failure → `402`; invalid auth → `401`; authorized-but-forbidden → `403`; oversized (>1 MB) POST payload → `413`. Follow each endpoint's **exact validation precedence**.
- Response status `201` on first created/applied resource, `200` for reads and identical idempotent replays. Reuse identifiers exactly as sent. Every error response has `{"error":{"code":"UPPER_SNAKE_CASE","message":"...","details":{...}}}` with codes from Appendix B; `VALIDATION_ERROR` includes `details.fields` array.
- Identical `event_id` / `order_id` / `request_id` / action replay returns the stored/idempotent result and changes nothing. Same ID with different body produces the contract-specific conflict.
- `/audit/v1/*` except RBAC probes needs **no bearer token**; seven role probes require JWT. `/health` exempt from auth. Grader may send **200 req/s** to audit endpoints—**never rate-limit them**. `/api/v1/*` is rate-limited per the specified sliding window.
- Each request should finish ≤5 s (`/reset` ≤10 s), and the 20-checkout concurrent burst ≤10 s. Test these limits.

### 4.1 Cryptographic signing: identical everywhere

Events and checkout receipts have `signature = HMAC_SHA256(DAY1_SALT, id + "|" + canonical_json(payload))` as **64 lowercase hex chars**. UTF-8 encode both salt and message. Canonical JSON uses recursively sorted keys, no whitespace, lower-case booleans/null, non-ASCII characters unescaped and array order preserved. Event `id` = `event_id`; receipt `id` = `order_id`. **Do not sign the entire response or pretty-printed JSON.** Validate against the precise Appendix A test vector before integrating.

### 4.2 Seed data and five demo accounts

Every startup and `/audit/v1/reset` must recreate the PDF §5.5 baseline IDs: `tenant-alpha`, `tenant-beta`; four sports (`football`, `basketball`, `cricket`, `esports`); `prod-jersey-001`; variants `var-jersey-001-M` (default stock 1) and `var-jersey-001-L` (default stock 5); discount code `WELCOME10`; the baseline leagues/clubs/players listed in §5.5. Reset must be deterministic and safe to call repeatedly.

| Role | Login email | Password |
|---|---|---|
| Platform Super-Admin | `admin@nascon.test` | `Nascon@26` |
| League Organizer | `organizer@nascon.test` | `Nascon@26` |
| Club Manager | `manager@nascon.test` | `Nascon@26` |
| Player | `player@nascon.test` | `Nascon@26` |
| General Viewer | `viewer@nascon.test` | `Nascon@26` |

These are mandated *demo* credentials; do not use them for production credentials or treat them as a substitute for properly verified JWTs.

## 5. Interfaces teammates must agree on by 11:00

To avoid stepping on each other's code, Ismail creates typed interfaces/stubs for:

- `SportConfigRepository.get(sport_id)` returning the full arbitrary JSON configuration; no sport-name assumptions.
- `LeagueRepository.get(league_id)` returning teams, fixtures, points, tie-break order, qualification spots and lot seed.
- `MatchEventRepository.list(match_id)` returning the complete immutable log; `get_score_projection(match_id)` or a pure scorer to be reused by standings and offline sync.
- `RosterService.transfer(request)` and `ScoreService.append_event(request)` reusable by both ordinary audit routes and `/offline-sync` (one authoritative validation implementation).
- `get_current_version(match_or_player_id)` for offline conflict checking.
- JWT issuer/validator/role-policy interfaces so Sufiyan's RBAC routes use Ismail's baseline demo users and tenant assignments.

**All three** agree: backend base URL `http://<ISMAIL_LAN_IP>:8080` for local device/simulator; `http://localhost:8080` only from the same computer. Ismail shares a short OpenAPI/JSON sample; Zaheen's API client follows those fields; Sufiyan tests the same contract.

## 6. EXACT repository structure, naming contract, and file ownership

> **Binding distinction:** These **paths and naming conventions are the team's chosen implementation contract**; the PDF does not prescribe internal filenames. The *external API routes, request/response JSON keys, status codes, seed IDs, signatures, root deliverable filenames and host port 8080* **are prescribed by the Part I PDF**. Where they differ, the PDF always takes precedence. Do **not** independently rename a path or invent synonyms. **This section replaces the earlier suggested folder tree.**

### 6.1 Canonical repository tree (case-sensitive; no alternatives)

Use this **exact** hierarchy; files marked `planned` must be implemented by the named owner. A scaffold may contain directory markers and package initializers before code is written; an empty scaffold is **not** a working submission.

```text
App-Dev-Debuggers/                            # Git repository root; GitHub name exact
├── .gitignore                                # Ismail
├── .env.example                              # Ismail | REQUIRED exact root filename
├── docker-compose.yml                       # Ismail | REQUIRED exact root filename
├── README.md                                # Ismail | REQUIRED exact root filename
├── instructions.md                          # Team contract | THIS file
├── REPOSITORY_STRUCTURE.md                  # Team contract | Quick file ownership map
├── ADR.md                                    # Sufiyan | Eight actual architectural decisions
├── TRACEABILITY.md                           # Sufiyan | REQUIRED exact root filename
├── COVERAGE.json                             # Sufiyan | REQUIRED exact root filename
├── run_tests.sh                              # Sufiyan | REQUIRED exact root filename
├── scripts/
│   └── bootstrap_structure.py                # Sufiyan | Non-destructive folder scaffolding
├── backend/                                  # Server code (Python/FastAPI)
│   ├── Dockerfile                            # Ismail
│   ├── requirements.txt                      # Ismail
│   └── app/
│       ├── __init__.py
│       ├── main.py                            # Ismail | Create FastAPI and include routers
│       ├── api/
│       │   ├── __init__.py
│       │   ├── router.py                      # Ismail | Register ALL endpoint routers
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
│       │       └── offline_sync.py            # Ismail | POST offline-sync
│       ├── core/
│       │   ├── __init__.py
│       │   ├── config.py                      # Ismail | Environment/config
│       │   ├── errors.py                      # Ismail | Exact common error schema
│       │   └── signing.py                     # Ismail | HMAC + canonical JSON
│       ├── db/
│       │   ├── __init__.py
│       │   ├── session.py                     # Ismail | DB connection + transactions
│       │   ├── models.py                      # Ismail | SQLAlchemy ORM models
│       │   └── seed.py                        # Ismail | Deterministic reset + baseline IDs
│       ├── schemas/                           # Pydantic request/response structures
│       │   ├── __init__.py
│       │   ├── sports.py                      # Ismail
│       │   ├── fixtures.py                    # Sufiyan
│       │   ├── leagues.py                     # Ismail
│       │   ├── events.py                      # Ismail
│       │   ├── standings.py                   # Sufiyan
│       │   ├── roster.py                      # Ismail
│       │   ├── checkout.py                    # Ismail
│       │   ├── rbac.py                        # Sufiyan
│       │   └── offline_sync.py                # Ismail
│       ├── services/
│       │   ├── __init__.py
│       │   ├── sports.py                      # Ismail
│       │   ├── fixtures.py                    # Sufiyan | Four scheduling algorithms
│       │   ├── leagues.py                     # Ismail
│       │   ├── scoring.py                     # Ismail | Immutable event projections
│       │   ├── standings.py                   # Sufiyan | Tables/H2H/qualification
│       │   ├── roster.py                      # Ismail | Transfer/loan/audit rules
│       │   ├── checkout.py                    # Ismail | Atomic stock and receipt
│       │   └── offline_sync.py                # Ismail | Queued action reconciliation
│       ├── security/
│       │   ├── __init__.py
│       │   ├── jwt.py                         # Sufiyan | JWT signing/validation
│       │   ├── rbac.py                        # Sufiyan | Ownership + tenant policy
│       │   └── rate_limit.py                  # Sufiyan | /api/v1/* only
│       └── workers/
│           ├── __init__.py
│           └── consumer.py                    # Ismail | Internal event consumer
├── mobile/                                   # Zaheen EXCLUSIVELY | React Native + iOS
│   ├── App.tsx                               # Zaheen | App entrypoint
│   ├── app.json                              # Zaheen | Expo/native project config
│   ├── package.json                          # Zaheen | Package name and scripts
│   ├── tsconfig.json                         # Zaheen
│   ├── ios/                                  # Zaheen | Xcode project generated by native prebuild
│   └── src/
│       ├── api/
│       │   ├── client.ts                     # Single HTTP client + configurable base URL
│       │   ├── endpoints.ts                  # Wire-exact backend path constants
│       │   └── types.ts                      # Wire-exact API JSON TypeScript types
│       ├── config/
│       │   └── environment.ts                # Simulator/LAN host API base URL
│       ├── navigation/
│       │   └── AppNavigator.tsx
│       ├── screens/
│       │   ├── LoginScreen.tsx
│       │   ├── FixturesScreen.tsx
│       │   ├── MatchDetailScreen.tsx
│       │   ├── StandingsScreen.tsx
│       │   ├── ClubProfileScreen.tsx
│       │   ├── StoreScreen.tsx
│       │   ├── CheckoutScreen.tsx
│       │   ├── ReceiptScreen.tsx
│       │   ├── RosterManagementScreen.tsx
│       │   ├── ScoringEntryScreen.tsx
│       │   ├── SyncStatusScreen.tsx
│       │   └── SettingsScreen.tsx
│       ├── components/                       # PascalCase.tsx reusable UI elements
│       ├── storage/
│       │   ├── database.ts                  # Native SQLite initialization
│       │   ├── cacheRepository.ts           # Cached fixtures/standings/profiles
│       │   └── offlineQueueRepository.ts    # Persistent offline action queue
│       ├── sync/
│       │   ├── connectivity.ts              # Network state
│       │   └── syncManager.ts               # /audit/v1/offline-sync protocol
│       ├── security/
│       │   └── tokenStorage.ts              # iOS Keychain token storage
│       ├── theme/
│       │   ├── colors.ts
│       │   ├── spacing.ts
│       │   └── typography.ts
│       └── types/
│           └── models.ts                    # Domain/UI types, NOT renamed API keys
└── tests/                                    # Sufiyan (test code, actual results)
    ├── conftest.py
    ├── test_health_reset.py
    ├── test_sports.py
    ├── test_fixtures.py
    ├── test_events.py
    ├── test_standings.py
    ├── test_roster.py
    ├── test_checkout.py
    ├── test_rbac.py
    ├── test_offline_sync.py
    ├── load/
    │   └── checkout_concurrency.js           # 20 simultaneous buyers
    └── ui/
        └── test_navigation.py               # Supplemental Expo web Selenium
```

**Root deliverable filenames are case sensitive.** `TRACEABILITY.md`, `COVERAGE.json`, `.env.example` and `run_tests.sh` must not be renamed to other casing or put inside `docs/`. Do not change the repository's *existing* default branch merely to follow an example. Every `.py` package directory (`app`, `api`, `routes`, `core`, `db`, `schemas`, `services`, `security`, `workers`) contains `__init__.py`.

**Avoid duplicate implementations:** `backend/app/api/routes/*` translates HTTP requests; `backend/app/services/*` contains business logic; `backend/app/schemas/*` holds external validation/types; `backend/app/db/*` owns persistence; `backend/app/security/*` owns authentication/permissions. Both `routes/rbac.py` and `security/rbac.py` intentionally exist, with different responsibilities. There is only **one** `/audit/v1/fixtures` router, **one** scoring service, **one** error response handler, and **one** canonical signing helper.

### 6.2 Exact naming conventions — mandatory team agreement

| Type | Exact convention | Good example | Avoid |
|---|---|---|---|
| Repository path | GitHub `Muhammad-Ismail-24/App-Dev-Debuggers` | `App-Dev-Debuggers` | `nascon26-appdev` |
| Python filename/module | `lower_snake_case.py` | `offline_sync.py` | `OfflineSync.py`, `offline-sync.py` |
| Python function/variable | `lower_snake_case` | `calculate_standings` | `calculateStandings` |
| Python class / Pydantic model | `PascalCase` | `CheckoutRequest` | `checkout_request` |
| Constant / env variable | `UPPER_SNAKE_CASE` | `DAY1_SALT`, `DATABASE_URL` | `day1Salt` |
| React component and screen file | `PascalCase.tsx` | `FixturesScreen.tsx` | `fixturesScreen.tsx` |
| React component / TS type | `PascalCase` | `MatchDetailScreen`, `MatchEvent` | `match_detail_screen` |
| Other TypeScript file | `camelCase.ts` | `syncManager.ts` | `Sync_manager.ts` |
| TS functions / properties | `camelCase` locally | `syncPendingActions` | `SyncPendingActions` |
| UI test IDs | `kebab-case` | `checkout-submit-button` | `checkoutSubmitButton` |
| Database tables and columns | plural `snake_case` tables, `snake_case` columns | `match_events`, `event_id` | `MatchEvents` |
| JSON fields on wire | **PDF's exact snake_case** | `base_version`, `team_id` | `baseVersion`, `teamId` |
| HTTP method, path, parameter | **PDF exactly, case-sensitive** | `POST /audit/v1/offline-sync` | `/api/sync`, `/audit/v1/offlineSync` |
| Error codes | **PDF exact UPPER_SNAKE_CASE** | `OUT_OF_STOCK` | `outOfStock` |
| Git commit subject | `type(scope): summary` | `feat(fixtures): add round robin` | `stuff done` |

- Approved commit types for this team: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`. Use scopes such as `fixtures`, `scoring`, `roster`, `rbac`, `mobile`, `infra`.
- React/TypeScript can use camelCase **internally**, but **never convert the keys of external grader JSON**. In particular, `/audit/v1/offline-sync` actions must use `action_id`, `queued_at`, `base_version`, and `payload` unchanged.
- API identifiers sent by the grader (`sport_id`, `event_id`, `order_id`, etc.) remain exactly as provided, including case; never generate a substitute ID on their behalf. Timestamps use UTC ISO 8601 `YYYY-MM-DDTHH:MM:SSZ`; money uses integer **paisa**; signing output uses exactly 64 lowercase hex characters.
- Python import root inside the backend container is `app` (example: `from app.services.fixtures import generate_fixtures`). Use absolute imports from `app`, not a second competing `backend.app` namespace.
- Consistent Docker Compose service names: `api`, `postgres`, `redis`, `rabbitmq`, `minio`, `worker` (replace `rabbitmq` with `redis`-based queue only after a documented shared decision). Publish **only `api` host port 8080** unless a specific development need is documented. Internal service ports remain standard: Postgres 5432, Redis 6379, RabbitMQ 5672, MinIO 9000.
- Common backend variables: `DAY1_SALT`, `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `JWT_SECRET`, `CORS_ORIGINS`. **These are team configuration names, not PDF-required names except `DAY1_SALT`.** All used variables must be listed in `.env.example`; no real secrets in git.
- Mobile configuration: `EXPO_PUBLIC_API_BASE_URL` is an optional development default in `mobile/src/config/environment.ts`. Make the URL overrideable in-app. For the grader host use `localhost:8080` **only on that host**; from Xcode Simulator on Zaheen's separate Mac connect to `http://<ISMAIL_LAN_IP>:8080`.
- Any new file requires updating **both this tree and `REPOSITORY_STRUCTURE.md`** and notifying its owner. Never create `frontend/`, `server/`, `api/` at root, `src/backend/`, or a second `mobile-app/` hierarchy.

### 6.3 Ownership, creation, and conflict-prevention policy

- **Ismail exclusively edits:** `docker-compose.yml`, `.env.example`, `README.md`, `backend/Dockerfile`, `backend/requirements.txt`, and the backend's `main.py`, `api/router.py`, `core/`, `db/`, `workers/`, plus `sports`, `leagues`, `events`, `roster`, `checkout`, `inventory`, `offline_sync`, `health` and `reset` route/schema/service files.
- **Sufiyan exclusively edits:** `tests/`, `run_tests.sh`, `COVERAGE.json`, `TRACEABILITY.md`, `ADR.md`, plus backend `fixtures`, `standings`, `rbac`, `ping`, `security/jwt.py`, `security/rbac.py`, `security/rate_limit.py` (and relevant schemas/services). He owns `scripts/bootstrap_structure.py` and updates `REPOSITORY_STRUCTURE.md` when agreed.
- **Zaheen exclusively edits:** **everything inside `mobile/`**, including the generated `mobile/ios/` Xcode project. Neither Ismail nor Sufiyan should rewrite `mobile/` without coordinating.
- **Shared document:** `instructions.md` only changes following agreement. If team members need another developer's module changed, communicate the interface/request rather than overwrite it.
- Ismail registers all routers in **`backend/app/api/router.py`**. Owners author their own route files; shared imports/registrations are Ismail's responsibility. Public endpoints and their HTTP status/body contracts are specified in §4 above and in Part I PDF §5.
- **Bootstrap sequence:** create project directories with the included non-destructive scaffold script after 10:45, but do not commit nonexistent feature implementations as if complete. If `mobile/` directories already exist, Zaheen must generate the native React Native/Expo project **in a temporary directory and merge its files into `mobile/`**, then run native prebuild and Xcode Simulator compilation; he must not replace the team's repository or import a nested `.git` directory.
- Tests must make assertions against **real response content**; don't fabricate coverage numbers or pass fake data to simulate backend functionality. Commit file names are fixed, but contents must be accurate.

### 6.4 Explicit API → code mapping

| Endpoint(s) | HTTP router file | Business/service module |
|---|---|---|
| `/health` | `api/routes/health.py` | `db/seed.py` + `db/session.py` |
| `/audit/v1/reset` | `api/routes/reset.py` | `db/seed.py` |
| `/audit/v1/sports` | `api/routes/sports.py` | `services/sports.py` |
| `/audit/v1/fixtures` | `api/routes/fixtures.py` | `services/fixtures.py` |
| `/audit/v1/leagues` | `api/routes/leagues.py` | `services/leagues.py` |
| `/audit/v1/events`, `/audit/v1/score/{match_id}` | `api/routes/events.py` | `services/scoring.py` |
| `/audit/v1/standings/{league_id}` | `api/routes/standings.py` | `services/standings.py` |
| `/audit/v1/roster/*` | `api/routes/roster.py` | `services/roster.py` |
| `/audit/v1/checkout` | `api/routes/checkout.py` | `services/checkout.py` |
| `/audit/v1/inventory/{variant_id}` | `api/routes/inventory.py` | `services/checkout.py` |
| `/audit/v1/rbac-matrix`, `/audit/v1/rbac/*` | `api/routes/rbac.py` | `security/jwt.py` + `security/rbac.py` |
| `/api/v1/ping` | `api/routes/ping.py` | `security/rate_limit.py` |
| `/audit/v1/offline-sync` | `api/routes/offline_sync.py` | `services/offline_sync.py` |

## 7. Sprint plan — parallel workstreams

| Time (PKT) | Ismail — backend & deployment | Sufiyan — algorithms/security/QA | Zaheen — frontend/Xcode |
|---|---|---|---|
| **10:45–11:15** | Git init/scaffold; Compose + `/health` + `/reset` + interfaces; share IP/ports | pytest scaffold; signatures reference test; fixtures round-robin | native iOS simulator build; app shell; connect to `:8080` |
| **11:15–12:15** | sports, leagues and events/score projection | round-robin + single-elim + start Swiss; start RBAC | login + role navigation; fixtures, standings and match screens |
| **12:15–13:15** | checkout & atomic inventory; receipt signing | complete Swiss/double-elim; standings and H2H | store + checkout/receipt; club profile and roster screens |
| **13:15–14:15** | roster and loans; offline-sync endpoint | RBAC matrix/security/rate limit; tests including 20-buyer burst | scoring and roster actions; SQLite offline cache and action queue |
| **14:15–14:45** | integrate fixes; validate clean Compose and seeded data | run full contract suite; repair bugs, coverage/traceability/ADRs | offline force-close/relaunch/resync; role/navigation judge rehearsals |
| **14:45–15:00** | final integration, stable push before lock | final regression and honest test reports | final simulator install; prepare 15:15 demo |

**Push policy from the controlling PDF:** at least one GitHub-pushed commit inside **each** window: `10:45–11:45`, `11:45–12:45`, `12:45–13:45`, `13:45–14:45` PKT. Missing a window costs **−2 points**, maximum **−8**. Ismail tracks checkpoints, but **each person pushes their own work**. Push meaningful work before 14:45 and a stable verified final revision before 15:05 (ideally before 15:00). Late commits after 15:05 are ignored. **Register the public repo URL before 11:15**. Never commit the salt. Do not force-push or rewrite history during the sprint.

**Collaboration commands (check current branch first):**

```bash
git pull --rebase origin main
# edit your OWN assigned files and run your focused tests
git add <your-paths>
git commit -m "feat: concise description"
git push origin main
```

If the repository's default branch is not `main`, substitute its actual name. **Do not use `git add .` indiscriminately** when others are collaborating in a shared checkout. Do not commit `.env`, node modules, build caches or local runtime artifacts. Keep iOS native configuration/source required for reproducibility.

## 8. Test matrix & hidden edge cases

Tests must target exact API fields, status/error bodies, algorithm invariants and security; use **the PDF** rather than guessed outputs:

- **Fixtures (§5.7):** exact round-robin match IDs and home-away balance, odd-team byes, withdrawals, Swiss first-round exact seeding plus backtracking/no-rematch/minimal score gap and valid bye selection, non-power-of-two seeded single-elimination bracket, double-elimination loser routes and optional GF2 reset.
- **Score (§5.9):** arbitrary mystery sport configurations; all three scoring models; legal cricket balls/wickets, esports best-of-N; state machine; a compensated score after match completion; original log unchanged; regenerated projection; HMAC canonicalization; duplicate event id cases.
- **Standings (§5.10):** three-way H2H mini-league and recursive tie splits, deterministic SHA256 lots, cricket net run rate rounded to 3 decimals, clinched/eliminated status derived from points/remaining fixtures, standings recomputed after compensation.
- **Roster (§5.11):** exact ordered rule checks (cross-tenant, wrong squad, closed window, loaned player, squad full, minimum positions), transfer on last allowed day while a match is in progress (`deferred_until_match_end`), loan auto-return and once-only audit entry, immutable history/idempotency.
- **Store (§5.12):** 20 simultaneous buyers of one jersey (one success only); no negative inventory; mock gateway payment decline/capture failure releases reservation; repeat order idempotency; `WELCOME10` integer-paisa discount; signed PDF must decode to `%PDF` and include order ID and formatted `PKR 4500.00` when applicable.
- **Security (§5.13):** all five roles against P1–P7 routes and own/other/foreign entities; cross-tenant denial 403; tampered JWT `401`; /api/v1/ping rolling rate window; audit endpoints exempt; SQL/script-like strings handled as plain data or rejected by schema, never 5xx; payload >1 MB gives 413.
- **Offline (§5.14 and §8.4):** chronological queued replay, stale base version `rebased_append`, future version rejected `INVALID_BASE_VERSION`, duplicate action skipped, individual errors with always-200 valid envelope; persisted client queue after force-close, accurate online/offline indicator and visible per-action results after reconnect.
- **Mobile judge (§8.6):** (A) find standings/open match, (B) buy merch/open receipt, (C) perform club roster action and repeat in airplane mode then sync. No dead ends; clear errors; consistent tenant styling; readable touch targets and role-specific screens.

**Coverage bonus:** §9.2 awards the final 10% of each backend area's allocated score only with ≥85% unit-test coverage for that area. `COVERAGE.json` must show genuine percentages as numbers for **`fixtures`, `scoring`, `standings`, `store`, `roster`, `rbac`**. Graders may run `./run_tests.sh` and void bonuses when claims exceed actual coverage by more than 2 percentage points.

## 9. Required documentation, grading, and penalty gates

**Required at repo root before final push:**

- [ ] `docker-compose.yml` boots API on host **8080**, database, cache, queue, object store and worker in a clean environment, with `DAY1_SALT: ${DAY1_SALT}`.
- [ ] `.env.example` lists all env vars; actual salt and secrets excluded from git.
- [ ] `README.md` documents exact Docker run steps, iOS simulator run/demo steps, configurable LAN address, and five demo accounts.
- [ ] `TRACEABILITY.md` lists each FR/NFR requirement ID with source code and an actual automated test/reference.
- [ ] `tests/`, executable `run_tests.sh`, and honest `COVERAGE.json` are committed.
- [ ] `mobile/` includes all iOS mobile source/native configuration and Zaheen's simulator has the app installed for judging.
- [ ] `GET /health` works only after full seed, and resetting twice reproduces identical base IDs/state.
- [ ] All audit routes, error codes, status codes and JSON response keys match PDF §5 **literally**.
- [ ] Appendix A signature reference test passes; no salt leaked into git.
- [ ] 20-checkout concurrency test passes; rate limiting affects only `/api/v1/*`.
- [ ] At least one pushed commit in every required checkpoint window; latest eligible commit pushed by **15:05:00 PKT**.

**Automatic deductions (§9.4):** **−10** non-reproducible Docker stack; **−8** hard-coded sport/event logic; **−10** prohibited managed BaaS; **−2** per missed push window. Avoid these before adding optional polish.

## 10. Day 2 continuity and viva readiness

Part II is confidential until Sunday **18 October 2026 at 10:15 PKT**; do **not** invent or implement requirements for it now. Day 1 is locked; preserve the final eligible commit SHA. The earlier rulebook specifies no overnight commits and a Top-8 viva with live code mutation and eight ADRs. Prepare the architecture explanation and traceability during Part I but keep this document focused on the **Part I PDF** when contracts disagree.

## 11. Done means independently verifiable

- **Ismail done:** one-command startup; seed/health; domain APIs wired; exact signatures and payment/roster/sync behavior; Sufiyan modules registered; no debug-only workaround needed.
- **Sufiyan done:** fixtures/standings/RBAC callable from Ismail's API; automated tests reveal exact contract failures; checkout concurrency and JWT probes verified; traceability/ADRs reflect the *actual* implementation.
- **Zaheen done:** native iOS simulator build runs on Mac; role-appropriate screens call real `:8080` backend; persistent SQLite offline data/action queue survives relaunch; complete judge flow is executable without developer intervention.

**Decision rule for every teammate and coding assistant:** implement the official PDF literally where it is specific; ask Ismail to confirm shared data contracts; never silently alter a route, port, error code, field name, signing recipe or evaluation rule to suit a convenient implementation.
