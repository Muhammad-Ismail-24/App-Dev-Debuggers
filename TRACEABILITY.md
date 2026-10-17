# Part I traceability and integration handoff

Baseline inspected: `986052df1daca0c1b8a0da6419f7bcc11c32a72c` on `main`.
Controlling source: NaSCon Part I specification, sections 3-5 and Appendices A-B.
The two PDFs and Sufiyan's older guide were read from the parent workspace; they
are not tracked in this repository. All implementation paths below are relative
to the repository root. No production application, database adapter or mobile
implementation was present at this baseline.

Working branch: `feature/sufiyan-algorithms-security-qa`. Sufiyan authorized
checkpoint commits and pushes on feature branches only; the existing `main`
branch is preserved. Integration into the submission branch remains a team
merge step; a feature-branch push alone does not make its code part of `main`.

## Requirement matrix

“Unit verified” means actual isolated service/router tests passed, not that the
Docker application or official autograder passed. “Live pending” means a real HTTP
test exists but was skipped without `NASCON_API_URL`. A dash means there is no
implementation/test to cite; it is not a reference to an invented file.

| ID | Requirement | Existing implementation | Actual tests | State and remaining scope |
|---|---|---|---|---|
| FR-1.1 | Configurable sports, append-only scoring and compensation | — (Ismail) | `tests/test_sports.py::test_mystery_sport_config`; `tests/test_events.py::test_data_driven_models_and_limits`; `tests/test_events.py::test_append_only_compensation_replay_and_signatures` | Live pending; authoritative scoring and HMAC service absent |
| FR-1.2 | League, season, division, hybrid configuration | — (Ismail) | `tests/test_standings.py::test_live_standings_recalculate_after_compensation` exercises league registration | Live pending; no test/implementation for divisions, promotion or hybrid administration |
| FR-1.3 | Four fixture formats | `backend/app/services/fixtures.py`; `backend/app/schemas/fixtures.py`; `backend/app/api/routes/fixtures.py` | `tests/test_fixtures.py::test_round_robin_invariants`; `test_withdrawals_preserve_fixtures`; `test_single_elimination_seeding_and_byes`; `test_advancement_and_third_place_results_unordered`; `test_swiss_optimality_against_exhaustive_oracle`; `test_http_infeasible_pairing_and_invalid_winner`; `test_double_elimination_graph`; `test_double_elimination_play_through` | Unit verified for section 5.7; production registration pending. Manual rescheduling, venue/player/rest conflicts, postponed/abandoned/cancelled workflow and realtime notifications remain unimplemented |
| FR-1.4 | Standings and qualification | `backend/app/services/standings.py`; `backend/app/schemas/standings.py`; `backend/app/api/routes/standings.py` | `tests/test_standings.py::test_three_way_mini_league`; `test_restart_after_split_uses_smaller_h2h_group`; `test_nrr_balls_all_out_and_mini_league`; `test_nrr_uses_aggregate_overs_not_average_match_rates`; `test_h2h_subset_outweighs_overall_differential`; `test_lots_exact_empty_and_no_mutation`; `test_incomplete_and_undecided_are_remaining`; `test_route_fetches_fresh_authoritative_projections`; `test_live_standings_recalculate_after_compensation` | Unit verified; real score projection adapter and correction flow live pending |
| FR-2.1 | Club profiles and tenant isolation | `backend/app/security/rbac.py` (authorization only) | `tests/test_rbac.py::test_permission_matrix`; `test_live_permission_matrix` | Policy unit verified; profile persistence, white-label UI and realtime are not implemented here |
| FR-2.2 | Roster, transfers, loans and immutable history | — (Ismail) | `tests/test_roster.py::test_last_day_transfer_and_immutable_replay`; `test_roster_rejections_leave_no_audit`; `test_loan_auto_return_once` | Live pending; no claimed backend coverage |
| FR-2.3 | Store, payments, receipts and order events | — (Ismail) | `tests/test_checkout.py::test_checkout_receipt_replay_and_duplicate`; `test_payment_failures_release_stock`; `test_checkout_validation_precedence` | Live pending; catalogue, scheduled prices, order queue and product pinning not verified |
| FR-5.1 | Five-role RBAC and ownership | `backend/app/security/jwt.py`; `backend/app/security/rbac.py`; `backend/app/schemas/rbac.py`; `backend/app/api/routes/rbac.py` | `tests/test_rbac.py::test_permission_matrix`; `test_matrix_issues_real_tokens_and_seed_context`; `test_authorization_precedes_body_and_resource_lookup` | Unit verified; seeded identity/resource adapter and shared startup configuration pending |
| NFR-3 | Twenty buyers, one final unit | — (Ismail checkout) | `tests/test_checkout.py::test_twenty_buyers_final_unit`; `tests/load/checkout_concurrency.js` | Not run against a live service; no concurrency pass claimed |
| NFR-4 | Persistent mobile queue and synchronization | — (Ismail and Zaheen) | `tests/test_offline_sync.py::test_offline_chronology_rebase_future_and_duplicates`; `test_offline_bad_envelope` | Live pending; native offline/force-close/relaunch demonstration untested |
| NFR-5 | JWT, RBAC, rate limiting, validation, body limits, secure mobile tokens | `backend/app/security/`; `backend/app/api/routes/ping.py`; strict fixture schema | `tests/test_rbac.py::test_invalid_auth`; `test_window_expiry_is_rolling_and_ip_isolation`; `test_limiter_atomic_across_threads`; `test_probe_auth_precedes_oversize_body`; `test_large_and_chunked_bodies`; `test_actual_redis_limiter_when_configured`; `test_live_rate_limit`; `tests/test_sports.py::test_sports_validation` | Local security and actual Redis Lua tests verified; production middleware integration and iOS Keychain remain unverified |
| NFR-7 | Single-command Docker startup and readiness | — (Ismail) | `tests/test_health_reset.py::test_readiness_and_repeatable_reset` | Not verified: no Compose/Dockerfile/backend entrypoint in cloned baseline; local Docker Linux engine unavailable |

## Exact handoff to Ismail

These adapters are integration proposals over your existing architecture, not a
second persistence implementation. Implement them with your repositories and
request-safe database sessions. The current routes are synchronous; the adapter
methods must be synchronous, or you must coordinate an asynchronous adapter change.

1. Register the `router` objects from `app.api.routes.fixtures`, `standings`,
   `rbac`, and `ping` in your existing `app/api/router.py`. Do not add another
   fixtures/scoring service. The fixture endpoint writes no persistent state.
2. Assign `app.state.standings_source` to the `StandingsSource` protocol in
   `app/schemas/standings.py`: `get_league(id)`, `get_sport(id)`,
   `get_score_projection(match_id)`. Return section 5.8 league JSON with defaults
   resolved, especially the **last reset's `lots_seed`**, and section 5.9 score
   JSON freshly rebuilt by your scorer. Return `None` only for an absent league.
   Use one consistent read transaction for a standings request where possible.
   Missing projections are adapter errors, not implicit 0-0 results.
3. Assign `app.state.authorization_source` to `AuthorizationSource` in
   `app/schemas/rbac.py`. Load current users/ownership from seeded persistence.
   `get_resource(kind, id)` must look up resources globally so known foreign
   resources produce **403**, not a tenant-filtered 404. It raises your shared
   not-found exception for truly absent resources. `demo_principals()` and
   `scenario_context()` supply the exact section 5.13 seed scenario. Only test
   code supplies in-memory identities. Production policies do not compare IDs
   to hard-coded `alpha`/`beta` strings.
4. Construct `JwtService(JWT_SECRET)` at startup and assign
   `app.state.jwt_service`. `JWT_SECRET` must contain at least 32 bytes and be
   separate from `DAY1_SALT`; no secret is embedded in source. Tokens use HS256,
   issuer `nascon`, audience `nascon-api`, and a two-hour default lifetime.
   Reuse the issuer for your login route; password verification remains yours.
   Only the signed subject is used to load the current trusted principal.
5. Install **one shared error-handler pair** in your `core/errors.py`/`main.py`:
   `RequestValidationError` -> 400 `VALIDATION_ERROR` with `details.fields`;
   `HTTPException` whose detail is `{code,message,details}` -> that object under
   the top-level `error` key, preserving status and headers. The routers use this
   contract. FastAPI defaults (422 and top-level `detail`) are **not compatible**.
   `tests/conftest.py::contract_test_app` demonstrates this in a unit harness;
   it is not a production app and must not replace your shared handlers.
6. Install `SecurityMiddleware` with `RedisWindowLimiter(redis_async_client)`
   once around the app. All `/api/v1/*` paths share 100 requests per rolling
   10 seconds per client IP. `/health` and `/audit/v1/*` are rate-exempt. Audit
   POST requests are capped at 1,048,576 bytes, including chunked bodies.
   The memory limiter is only for tests/single-process development. Redis Lua
   uses server time and atomic check/add across workers. Configure Uvicorn's
   trusted proxy handling deliberately; raw forwarding headers are not trusted.
7. Add runtime dependencies to your owned `backend/requirements.txt`:
   `fastapi`, `pydantic>=2,<3`, `PyJWT>=2.10,<3`, `networkx>=3.4,<4`, and
   `redis>=5,<7`. Test dependencies: `pytest`, `httpx`, `coverage`, `pypdf`.
   NetworkX is used only for **generic minimum-weight graph matching**, not
   fixture generation. All tournament-specific logic is in our service.
8. Keep host port **8080**, database readiness/seed checks, common signing,
   reset, events, checkout, roster, offline-sync and Docker files in your modules.
   Include all required variables in your `.env.example` without secrets.

## Verification and reproducibility

Run from the repository root with dependencies already installed:

```sh
./run_tests.sh -q
# These live tests reset graded data. Use a dedicated integration instance.
NASCON_API_URL=http://localhost:8080 DAY1_SALT=<matching-salt> ./run_tests.sh --require-live -q
NASCON_REDIS_URL=redis://localhost:6379/0 ./run_tests.sh --require-redis -q
# Supply DAY1_SALT through the environment to verify the live HMACs.
k6 run -e NASCON_API_URL=http://localhost:8080 tests/load/checkout_concurrency.js
```

`tests/test_checkout.py::test_twenty_buyers_final_unit` is the stronger start
synchronization check: 20 HTTP clients wait at a barrier before buying. It requires
exactly one 201 and nineteen 409 `OUT_OF_STOCK`, completion within ten seconds,
and final inventory `stock=0,reserved=0`. The k6 variant independently provides
20 concurrent VUs with one purchase each and strict count thresholds.

`run_tests.sh` propagates test failures and generates actual line coverage,
including unexecuted modules under `backend/app`. Area totals include their
service/schema/router files, and all security/ping files for RBAC. Absent
scoring/store/roster implementations report **0.0**, never fabricated coverage.
External HTTP testing alone cannot measure coverage inside a separate server.
On a clean machine with network access, `./run_tests.sh --install-deps -q`
installs the pinned test and Sufiyan-module dependencies first. For an actual
integration run, `--require-live` and `--require-redis` turn missing services
into failures; the default local run explicitly skips those external checks.

Verified local runtime: Python 3.14 (installed on this laptop), FastAPI 0.141.1,
Pydantic 2.13.4, PyJWT 2.13.0, NetworkX 3.7, pytest 9.1.1, httpx 0.28.1,
coverage 7.16.2. The complete suite also ran on Linux/Python 3.12 in the cached
`python:3.12-slim` image, with the same Redis 7 test container. Ismail's own
Docker image remains unavailable. Latest measured results and area percentages
are recorded below for Python 3.12;
skipped tests are never marked passed.

## Contract details requiring clarification

- The specification requires 404 for a nonexistent club in RBAC probes but
  Appendix B contains no `CLUB_NOT_FOUND` code. No new code is invented here;
  the shared resource adapter owns that missing-resource response. Known foreign
  clubs are unambiguously 403 and are covered by the full matrix tests.
- Section 5.7 does not define a default for `bracket_reset`; this isolated schema
  currently defaults to `true`. Explicit true/false are tested. It also does not
  specify the containing array for single-elimination `TP`; it is included in
  the final round's `matches`. A two-team field has no semifinals, so its `TP`
  stays empty if requested. Confirm these interpretations if hidden vectors rely
  on unspecified cases.
- Section 5.10 does not define a rate when completed innings have zero legal
  balls. This implementation treats that side's rate as zero; normal/all-out
  innings follow the literal formula. `resolved_by` records the separating
  criterion at each adjacent boundary inside the original points-tied group;
  its last team has `null` because no following points-tied team exists.
- `GF2` has the same participants as GF1; after GF1, its home slot receives the
  GF1 winner and away receives the loser, consistently with the declared routing
  graph. It is required only if GF1's away/LB champion wins.
- Broad FR-1.3 scheduling administration goes beyond the `/fixtures` computation
  contract. It still needs venue/player availability models and shared mutation
  interfaces; it has not been silently implemented as a second stateful service.

## Latest local verification

Executed `run_tests.sh --install-deps --require-redis -q` under Linux/Python 3.12:
**303 passed, 32 skipped, 0 failed** in 11.27 seconds. A local Python 3.14 run
also yielded 303 passed and 32 skipped in 5.51 seconds. The remaining skips are
all live HTTP tests. The unit harness
does not include a fake checkout/scoring/roster/offline backend.

| Area | Covered / executable lines | Measured line coverage |
|---|---:|---:|
| Fixtures (service, schema, router) | 281 / 282 | 99.65% |
| Standings (service, adapter protocol, router) | 117 / 118 | 99.15% |
| RBAC/security (JWT, policy, middleware, schema, routers, ping) | 204 / 211 | 96.68% |
| Scoring | No implementation present | 0.0% |
| Store | No implementation present | 0.0% |
| Roster | No implementation present | 0.0% |

Additional performance probe: six successive Swiss rounds at each of 31, 32, 63
and 64 teams with seeded mixed win/draw results completed in **1.01 seconds total**
on this laptop. This is a local timing observation, not a grading-machine promise.
Both published Appendix A hash vectors were independently matched. The actual
Redis Lua check verified 100 accepted and 50 limited concurrent calls across
two limiter instances, another IP's independent allowance, and reopening after
window expiry. The k6 checkout script parsed successfully with the official
cached k6 0.54.0 image; it was not run against a checkout service.

Remote `main` was rechecked and remains the original scaffold commit. Ismail
confirmed through Sufiyan that his backend still needs implementation; no live
service or adapters are available. A read-only request to
`http://127.0.0.1:8080/health` timed out. Live backend, checkout burst, Docker
application startup and native iOS judging flows remain **unverified**.
Production handlers/adapters/registration
remain explicit integration requirements, so these results do not establish
autograder readiness.
