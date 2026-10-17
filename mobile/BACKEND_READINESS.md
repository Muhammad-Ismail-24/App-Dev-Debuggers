# BACKEND_READINESS.md — what the mobile app needs from the backend (Part I PDF = source of truth)

Updated after Phase 5.5. Nothing below was run against a live backend: none was reachable from this session.

## 1. Endpoints implemented in `mobile/`
| Endpoint | PDF | Mobile code | Notes |
|---|---|---|---|
| `POST /audit/v1/checkout` | §5.12 | `api/commerce.ts` → `data/backendStoreRepository.ts` | Body is exactly `{order_id, customer_id, items[{variant_id, quantity}], discount_code, payment{token}}`; covered by `tests/checkout-contract.test.mts` against the PDF's example response |
| `GET /audit/v1/inventory/{variant_id}` | §5.12 | same | Used to show live stock for the seeded jersey |
| `POST /audit/v1/events` | §5.9 | `api/audit.ts` → `hooks/useSync.tsx` | start / score / end / compensation; queued offline when unreachable |
| `GET /audit/v1/score/{match_id}` | §5.9 | `services/scoring.ts` | Cached in SQLite for offline viewing |
| `POST /audit/v1/roster/transfer` | §5.11 | `api/audit.ts` → Roster Action screen | transfer / loan / release |
| `POST /audit/v1/offline-sync` | §5.14 | `sync/syncManager.ts` | Exact envelope; ≤100 per request |
| `GET /health` | §5.4 | `api/client.ts` | "Test connection" on Login and Profile |

## 2. Documented but not used yet
- `GET /audit/v1/standings/{league_id}` (§5.10): usable for the Standings screen, but rows carry `team_id` only (no team names or crests) and the league must have been registered via `POST /audit/v1/leagues`. Needs a name source.
- `GET /audit/v1/roster/history/{player_id}` (§5.11): typed in `api/audit.ts`, no screen calls it. It is the only documented source for a player's audit-entry count (`base_version` for roster actions); the app currently keeps that count locally (starts at 0, so a stale device is "rebased", never "invalid").

## 3. Missing documented read endpoints (so these screens stay development fixtures)
No list/read route is documented for: fixtures list, club list / club profile (staff, venue), squad rosters, product catalogue, a sport's scoring-event list, and the notion of "which matches are live". Consequences: Home, Fixtures, Match Detail header/timeline/pinned product, Club Profile and Roster Management read **`dev/*` fixtures**; Store shows only the §5.5 seeded jersey in `backend` mode (`data/seededCatalogue.ts`). Ask the backend owner for these routes (the instructions mention "simple production endpoints… share route docs with Zaheen") — until then the final demo cannot show "real API responses" on those screens.

## 4. Authentication
- Demo accounts (§8.3): admin / organizer / manager / player / viewer `@nascon.test`, password `Nascon@26`.
- **No login route is documented.** `POST /audit/v1/rbac-matrix` returns opaque JWTs for the five roles but no email/password exchange. Sign-in is therefore simulated (`auth/devAuthAdapter.ts`): on in Debug builds; in Release it is off unless built with `EXPO_PUBLIC_ALLOW_SIMULATED_AUTH=1`. Sessions are tagged `dev-simulated` and the UI says so.
- `/audit/v1/*` needs no bearer token, so nothing is sent; a real adapter must also store the JWT in the Keychain (`expo-secure-store`, not installed).
- Role ids: the spec's token keys are `super_admin`, `league_organizer`, `club_manager`, `player`, `viewer`; the app uses `organizer` for the second. Map when the real login arrives.
- `customer_id` currently = the session's `userId` (`dev-<role>` when simulated). Confirm with the backend what a valid customer id is.

## 5. Fixture ids that must exist on the backend (never assumed present)
From §5.5 (after `POST /audit/v1/reset`): tenants `tenant-alpha`, `tenant-beta`; product `prod-jersey-001`; variants `var-jersey-001-M` (stock 1), `var-jersey-001-L` (stock 5); discount `WELCOME10`; leagues `league-alpha-1`, `league-alpha-2`, `league-beta-1`; clubs `club-alpha-1`, `club-alpha-2`, `club-beta-1`; players `player-alpha-1`, `player-alpha-2`, `player-beta-1`.
**Dev fixture ids do not exist on the backend**: matches `m-1…m-9`, clubs `c-lions…`, players `c-xxx-pN`, league `lg-dev`, products other than the jersey. Scoring against `m-1` returns `MATCH_NOT_FOUND`; roster actions from the dev Club Profile return `LEAGUE_NOT_FOUND`/`SQUAD_NOT_FOUND`. To demo scoring: create a match via `POST /audit/v1/events` (`match_init`) or `/leagues`, then open it by that id (the Scoring screen needs a way to enter a match id — not built). To demo roster: `POST /audit/v1/roster/setup` a league, and the roster screens need those ids.

## 6. Response shapes still needing verification against a live server
Checkout `201` vs replay `200` bodies and the 402/409 error bodies (`details.variant_id` is dropped by the shared `ApiError`; the app recovers the variant from the message); `receipt.payload.paid_at` format; `/score` fields `overs`/`wickets` for innings sports; `/events` response; `transfer` response `state` / `blocking_match_id`; `/offline-sync` result `status` values (`applied` / `rejected` / `duplicate`) and `resolution` values — implemented from the PDF table, untested live; and whether `/inventory` returns 404 `VARIANT_NOT_FOUND` for unknown ids (treated as stock 0).

## 7. Known contract gaps in the app
- Receipt PDF (`receipt.pdf_base64`) is stored in the receipt model but **cannot be opened or shared yet**: needs `expo-file-system` + `expo-sharing` (not installed). §8.2 requires "receipt view/download".
- No "add player" route exists, so none is offered.
- No realtime (WebSocket/SSE) route is documented; §8.2 asks for a live-updating score.
- Receipt signatures cannot be verified on-device (the salt is server-only); the UI shows the signature, never "verified".
