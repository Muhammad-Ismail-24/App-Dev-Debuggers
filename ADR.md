# Architecture decisions — Sufiyan's Part I modules

These records describe implemented choices and explicit integration boundaries.
They do not claim Ismail's infrastructure or Zaheen's mobile app is complete.

## ADR-001: Pure fixture computation

**Context:** Section 5.7 requires `/fixtures` to store nothing and supports teams
unrelated to seeded leagues. **Decision:** A strict request schema feeds one pure
dispatcher in `backend/app/services/fixtures.py`; HTTP translation stays in its
router. **Consequences:** All formats can be tested without a database; Ismail
only registers the router and common error handlers.

## ADR-002: Circle schedule with balanced orientation

**Context:** Odd/even fields, reverse legs, byes and withdrawals must retain all
fixtures. **Decision:** Generate pair membership by rotating the circle; orient
edges cyclically on odd fields and alternate the extra team's edges on even
fields. Reverse every pair in leg two. Apply withdrawal status after generation.
**Consequences:** Balance is at most one within each leg, and forfeits/voids
cannot remove fixtures or change byes. Tests cover every supported team count.

## ADR-003: Globally optimal Swiss matching

**Context:** Greedy pairing fails on rematch constraints and global score-gap
minimization; exponential enumeration risks the five-second limit at 64 teams.
**Decision:** Implement all Swiss history/Buchholz/bye/seed rules locally. Encode
legal pairs in a graph with integer half-point gap costs and use NetworkX's
general weighted blossom solver for minimum-weight maximum-cardinality matching.
**Consequences:** No third-party fixture-generation library is used. A perfect
matching is explicitly required; eligible bye candidates are tried in mandated
order. Exhaustive small-field oracles independently check optimality. NetworkX
must be included in Ismail's image.

## ADR-004: Explicit elimination routing graph

**Context:** Byes, unordered result submissions, WB/LB drops and GF2 resets need
consistent propagation. **Decision:** Build exact seeded match IDs and routes,
then propagate only when both input slots are resolved. Distinguish unresolved
slots from known missing participants. **Consequences:** Byes propagate through
the losers bracket, impossible results are rejected, and GF2 is conditional.
Graph and complete tournament simulations verify routing and terminal behavior.

## ADR-005: Fresh standings over one authoritative scorer

**Context:** Compensation can change a completed match and playoff status.
**Decision:** Read every fixture's fresh score projection through `StandingsSource`;
rebuild all totals/H2H/qualification each request. Restart tie criteria after each
split and use SHA256 lots. **Consequences:** No second event engine or mutable
standings counters exist. Ismail must provide defaults, snapshot-consistent reads,
and projection callbacks. Zero-ball and `resolved_by` interpretations are exposed
in `TRACEABILITY.md` rather than hidden.

## ADR-006: Signed identity and repository-backed authorization

**Context:** Five roles have different tenant, league, club and self boundaries.
**Decision:** PyJWT verifies a fixed HS256 algorithm, issuer, audience, expiry and
required claims. The signed subject resolves to the current trusted principal;
policy functions use that principal and globally resolved resource ownership.
**Consequences:** Tampered/unsigned/expired tokens return 401, foreign resources
return 403, and revoked ownership takes effect without waiting for token expiry.
No demo-ID authorization shortcuts or default production secret are present.

## ADR-007: Shared rolling-window limiter and bounded audit bodies

**Context:** A fixed-window counter permits bursts across a boundary; per-worker
memory fails across API workers. **Decision:** Provide atomic Redis sorted-set
check/add using Redis time, applied only to `/api/v1/*`; retain a lock-protected
memory implementation for isolated tests. Enforce audit POST body size while
reading chunks. **Consequences:** Ismail must inject the async Redis connection
and install middleware once. Redis failures are not silently bypassed. The Lua
path still needs an actual Redis run; memory tests do not prove it.

## ADR-008: Honest layered verification and unchanged team ownership

**Context:** The cloned repository is a scaffold; fake stateful replacements would
mask integration defects. **Decision:** Test pure logic and the actual isolated
routers locally; keep stateful contract tests pointed at `NASCON_API_URL` and
skip explicitly when absent. Use a 20-thread barrier plus a k6 variant for checkout.
Generate coverage from measured executed lines, report absent areas as zero.
**Consequences:** Unit success is distinct from a competition-ready backend.
Ismail retains all infrastructure/stateful modules; Zaheen retains native iOS,
SQLite queue and Keychain implementation. No mobile, database, Docker or shared
configuration files are overwritten. Per Sufiyan's explicit instruction,
verified checkpoints are committed and pushed only to feature branches;
`main` is never pushed directly by this workflow.
