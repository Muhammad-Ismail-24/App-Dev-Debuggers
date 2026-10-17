# Logic tests (no device needed)

Run from `mobile/` with Node ≥ 24 (uses built-in `node:sqlite` and TypeScript transform):

    for t in logic data store order queue flow; do node --experimental-transform-types --import ./tests/register.mjs tests/$t.test.mts; done

Covers: dev auth + role actions, fixtures integrity, cart math, dev order flow, the SQLite offline queue
(persistence across close/reopen, ordering, dedupe, single-flight sync, partial answers, 100-action batching),
roster validation order, online/offline submit decision, error-code copy. They do **not** exercise React
Native UI, expo-sqlite itself, or a real backend.
