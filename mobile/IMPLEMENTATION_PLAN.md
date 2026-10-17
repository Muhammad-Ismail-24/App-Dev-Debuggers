# IMPLEMENTATION_PLAN.md — React Native architecture & build sequence

**Status: BLUEPRINT ONLY. No UI code until Zaheen approves.**
Baseline verified on disk: `expo 58.0.14`, `react-native 0.88.0`, `react 19.3.0`, TypeScript ~6.0.3, `expo-dev-client`, generated `ios/` (NaSCon26.xcodeproj, Pods present), entry `index.ts → App.tsx`. Existing `src/api/client.ts` (configurable base URL, `ApiError`, timeout) and `src/config/environment.ts` are kept and extended.

## 1. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Navigation | **React Navigation 7** (`@react-navigation/native`, `native-stack`, `bottom-tabs`) in `src/navigation/AppNavigator.tsx` | Matches the team's mandated tree (`App.tsx` + `navigation/AppNavigator.tsx`). Native-stack = real UIKit push/sheets/edge-swipe. *Note:* the separate `warm_up` repo's AGENTS.md says Expo Router, but **this** project's `REPOSITORY_STRUCTURE.md` is authoritative for `mobile/`. |
| Tab bar | Custom `tabBar` render prop → `FloatingTabBar` | The MLS floating dock + raised center button can't be done with the default bar. |
| Animation | Reanimated 4 + worklets | UI-thread animations; layout animations for timeline/queue |
| Gestures | Gesture Handler 3 | Carousel, swipe-to-correct |
| Theme | Static tokens + `TenantThemeProvider` (React context) for tenant/club colors | Tenant colors are data-driven |
| Server state | Thin hooks over `request()` + SQLite read-through cache (no extra query lib) | Fewer deps; the offline cache **is** SQLite as the PDF requires |
| Appearance | Dark only → `app.json` `"userInterfaceStyle": "dark"` | **Needs approval** (currently `"light"`) |
| Orientation | Keep `portrait` on iPhone; layouts still flex (rubric "after rotating"; iPad rotates since `supportsTablet: true`) | **Needs approval** |

## 2. Dependencies (versions = SDK 58 `bundledNativeModules.json`, read from local `node_modules/expo`)

Install with **`npx expo install <pkg…>`** (npm project, `package-lock.json`). **Not before CocoaPods finishes.** Native modules need `cd ios && pod install` (or `npx expo run:ios`, which runs it). Do **not** `prebuild --clean`.

| Package | Version | Native? | Purpose |
|---|---|---|---|
| `react-native-reanimated` | 4.7.1 | yes | Motion |
| `react-native-worklets` | 0.13.0 | yes | Reanimated 4 peer |
| `react-native-gesture-handler` | ~3.3.0 | yes | Gestures |
| `react-native-screens` | ~4.30.0 | yes | Native stack |
| `react-native-safe-area-context` | ~5.10.1 | yes | Insets (also replaces deprecated RN `SafeAreaView` in `App.tsx`) |
| `@react-navigation/native`, `/native-stack`, `/bottom-tabs` | 7.x (latest 7.21.0; peers: screens ≥4, safe-area ≥4) | JS | Navigation. **Verify with `npx expo-doctor` after install** (not in Expo's bundled list) |
| `expo-linear-gradient` | ~58.0.3 | yes | Club/tenant gradients |
| `expo-blur` | ~58.0.4 | yes | Glass |
| `expo-glass-effect` | ~58.0.4 | yes | Optional iOS 26 Liquid Glass dock |
| `expo-symbols` | ~58.0.4 | yes | SF Symbols |
| `expo-haptics` | ~58.0.7 | yes | Haptic feedback |
| `expo-image` | ~58.0.15 | yes | Crest/product images, caching |
| `react-native-svg` | 15.16.0 | yes | Radial spotlight, checkmark draw, initials crests |
| `expo-sqlite` | ~58.0.13 | yes | Offline cache + queue (**required by PDF**) |
| `expo-secure-store` | ~58.0.2 | yes | JWT in Keychain (**required by PDF**) |
| `@react-native-community/netinfo` | 12.0.1 | yes | Online/offline detection |
| `expo-crypto` | ~58.0.7 | yes | `randomUUID()` for `action_id` / `device_id` |
| `expo-file-system` + `expo-sharing` | ~58.0.9 / ~58.0.19 | yes | Write `pdf_base64` → share sheet / Quick Look |

**Not recommended:** Skia (SVG covers it), Lottie, Moti, any UI kit, React Query (time budget), Expo Router (conflicts with the mandated structure). Firebase/Supabase are forbidden.

## 3. Folder architecture (within the mandated tree; additions marked ➕, must also be added to `REPOSITORY_STRUCTURE.md`)

```
mobile/src/
  api/          client.ts (extend: auth header, 401 → logout), endpoints.ts, types.ts (wire-exact snake_case)
  config/       environment.ts (+ runtime override persisted in SQLite settings)
  navigation/   AppNavigator.tsx, ➕types.ts (param lists), ➕FloatingTabBar.tsx
  screens/      12 required *Screen.tsx files exactly as named in REPOSITORY_STRUCTURE.md
  components/   PascalCase components from DESIGN_SYSTEM.md §6
  theme/        colors.ts, typography.ts, spacing.ts (replace), ➕radii.ts, ➕motion.ts, ➕TenantThemeProvider.tsx
  storage/      database.ts, ➕cacheRepository.ts, offlineQueueRepository.ts
  sync/         connectivity.ts, syncManager.ts, ➕errorMessages.ts (error_code → plain language)
  security/     tokenStorage.ts (Keychain)
  ➕hooks/       useSession, useConnectivity, useCachedQuery, useRealtime
```

## 4. Offline & sync (4 graded points; desk check §8.4)
- `cache(key TEXT PK, json TEXT, updated_at TEXT)` for fixtures, standings and club profiles. Screens render cache first, then refresh.
- `offline_queue(action_id PK, type, queued_at, base_version, payload_json, status, result_json)`: envelope **exactly** `{action_id, type, queued_at, base_version, payload}` (§5.14). Keys are never camelCased.
- `syncManager`: on reconnect (NetInfo) or "Sync now" → POST `/audit/v1/offline-sync` `{device_id, actions}` (≤100, sorted by queued_at) → store each result → UI shows applied/rejected + reason → delete resolved rows **only after** results are committed in a transaction.
- `device_id` generated once, persisted in SQLite.

## 5. Implementation sequence (after approval)

Ordered by judging value. Each step ends with `npx tsc --noEmit` and a simulator run.

1. **Foundation (≈25 min).** Install deps (§2), pod install, rebuild the dev client. Tokens (`theme/*`), `TenantThemeProvider`, motion presets, base components: `PrimaryButton`, `GlassButton`, `ConnectivityPill`, `StatusPill`, `EmptyState`/`ErrorState`/`Skeleton`.
2. **Shell (≈25 min).** `AppNavigator` (Root stack + 5-tab `FloatingTabBar` + nested stacks), Keychain session, **Login** (+ server address), role context, **Settings**. Push a commit.
3. **Judge task A (≈40 min).** **Fixtures → Match Detail** (hero gradient, timeline, realtime), **Standings**, **Clubs/Club Profile**. SQLite read-through cache.
4. **Judge task B (≈40 min).** **Store** (carousel + variant strip), cart sheet, **Checkout**, **Receipt** (PDF open/share).
5. **Judge task C + offline (≈45 min).** **Roster Management**, **Scoring Entry**, offline queue, **Sync Status**, error-code copy. Force-close/relaunch test in airplane-mode-equivalent (Simulator: disable the Mac's network or stop the backend).
6. **Polish (remaining time).** Signature motion (S1–S10), haptics, Reduce Motion, 360×640 check (iPhone SE simulator), VoiceOver labels pass, `testID`s in kebab-case.

**Cut order if time runs short:** Liquid Glass → carousel blur depth → header collapse → number-roll score → (never cut) offline queue, connectivity pill, plain-language errors, role gating.

## 6. Open decisions for Zaheen
1. Approve **dark-only** (`userInterfaceStyle: "dark"`).
2. Approve **Store as the raised center tab** (vs MLS's brand button).
3. Approve the dependency list (§2), and confirm CocoaPods has finished before install.
4. Confirm backend provides per-club/tenant colors + logo URLs (ask Ismail); otherwise the hashed fallback palette is used.
5. Rotation: portrait-lock iPhone (recommended) or support landscape.

---

## 7. Phase 2 status (updated 2026-10-17) — Login + Home UI written, NOT yet run

| Item | Status |
|---|---|
| Login screen, Home dashboard, match/standings/club components, dev auth + fixtures | **Written** (new files only; see `PHASE2_INTEGRATION.md`) |
| `tsc --noEmit` | No errors in Phase 2 logic. Type resolution for reanimated / expo-* / react-navigation is **unverified** because those packages are not installed (47 TS2307 "cannot find module" errors, shared with Phase 1 files). |
| Pure-logic checks (dev auth, role actions, date/color helpers) | Pass under Node (ad-hoc script; no test runner in the project) |
| Expo Doctor, native build, simulator run, visual comparison with Mobbin | **Not done** — blocked on Phase 1 install and the iOS runtime download |
| Wiring into `App.tsx` / `AppNavigator.tsx` | **Not done** (Phase 1 was still editing; Home tab placement needs a decision) |

## 8. Phase 2.5 status (2026-10-17) — integrated in source, NOT built or run

| Item | Status |
|---|---|
| Tabs Home/Fixtures/Store/Standings/Profile; Home default; Store raised center | Source done (`navigation/*`) |
| Login ↔ app gate via `SessionProvider` + `AppNavigator`; dev adapter only in `__DEV__` | Source done |
| Home cards → MatchDetail / Fixtures / Standings / Clubs (placeholder) / Profile / Store | Source done |
| Login server-address row (shared `api/client`, `api/connectionMessages.ts`) | Source done |
| `AuthField` merged into `TextField` | Done |
| `tsc --noEmit` | Only TS2307/TS7006 caused by uninstalled packages remain |
| Expo Doctor, `pod install`, native build, simulator tests (login→home, 5 tabs, match push, role actions) | **Blocked**: package.json still lacks reanimated, react-navigation, etc.; Phase 1 `pod install` and iOS runtime download were still running |

## 9. Phase 3 status (2026-10-17) — sports browsing written, NOT built or run

| Item | Status |
|---|---|
| Fixtures (competition/status/date filters, grouped cards, refresh, states), Match Detail (ticker, club-color hero, rolling score, Timeline/Store/Info tabs, corrected events, pinned product), Standings (picker, table, legend, club + match links), Club Profile (hero, venue, roster, staff, fixtures, role-gated "Manage roster"), Clubs directory | Source done |
| Data | `SportsRepository` interface + dev fixtures (`dev/sportsFixtures.ts`, `data/devSportsRepository.ts`); scenario switch `EXPO_PUBLIC_DEV_SPORTS_SCENARIO`; no new endpoints, `api/client.ts` untouched |
| Navigation | `ClubProfile` root route added; Standings rows → ClubProfile / MatchDetail, Home club cards → ClubProfile, Clubs list → ClubProfile |
| `tsc --noEmit` | Only errors from uninstalled packages remain |
| Data-layer checks (Node) | Pass: every fixture id resolves, standings teams have profiles, not-found handling |
| Native build, simulator, gestures, animation feel, small-screen layout | **Not run** (dependencies still not installed; Phase 1 pod install running) |
| Not built (inferred motion not implemented) | Swipe-between-tabs pager (tabs are tap-only), header collapse on detail screens, live WebSocket/SSE score updates (no documented realtime route), "Enter score" / "Manage roster" destinations (alerts until Phase 4) |

## 10. Phase 4 status (2026-10-17) — Store → Product → Cart → Checkout → Receipt written, NOT built or run

| Item | Status |
|---|---|
| Store grid + category filter, Product Detail (image carousel, size picker, quantity, add-to-cart feedback), Cart (modal sheet, steppers, remove, breakdown, empty state), Checkout (summary, validated customer form, discount code, mock-payment notice, submit states), Receipt (id, lines, totals, status, back to store) | Source done |
| Routes | `ProductDetail`, `Cart` (modal), `Checkout`, `Receipt` registered once in `AppNavigator`; Store-tab badge shows cart count; Match Detail's pinned "View in store" now opens `ProductDetail` |
| Data | `StoreRepository` interface (`data/storeRepository.ts`) + dev-only simulation (`data/devStoreRepository.ts`, `dev/storeFixtures.ts`). Money is integer paisa. Order ids are client-generated, stable per cart, so a retry is idempotent |
| **Wire contract** | The exact `POST /audit/v1/checkout` / `GET /audit/v1/inventory/{variant_id}` bodies live in the PDF (§5.12), which is not in the repo, so **no backend adapter was written**. Needs: request/response fields, the catalogue route, and the 409 / payment-failure error codes |
| Simulated purchases | Receipts from the dev repo have `source: 'dev-simulated'`, show a warning banner and status "Simulated"; no card data is collected (mock tokens only) |
| Checks run (Node) | Pass: money formatting, add/quantity-cap/remove/clear reducer, subtotal and count, order fingerprint, checkout validation, order-id format; dev order flow: decline and capture-failure leave stock untouched, success decrements, replay returns the same receipt, same id + different body is rejected, sold-out → out-of-stock error, `WELCOME10` arithmetic, invalid code |
| `tsc --noEmit` | Only errors from uninstalled packages remain |
| Not done | Native build / simulator, Expo Doctor; PDF open/share (needs `expo-file-system` + `expo-sharing`, not installed); cart persistence across launches; offline behaviour; backend adapter; real product photography; discount amount preview (backend computes it) |

## 11. Phase 5 status (2026-10-17) — roster, scoring, persistent offline queue, sync status written; NOT built or run

Contract source: `NaSCon 26 App Dev Part 1-1.pdf` (found in `~/Downloads`, not in the repo; read in full for §5.2, 5.9, 5.11, 5.12, 5.14, 8.2–8.6, Appendix B).

| Area | Status |
|---|---|
| Persistence | SQLite (`storage/`): `offline_queue`, `kv`, `cache` tables, versioned migrations, `expo-sqlite` driver (API checked against the SDK 58 docs). **`expo-sqlite` is not in package.json yet** — must be installed by the Phase 1 session |
| Queue | Exact §5.14 envelope; client order = send order; `queued_at` never goes backwards; dedupe on `event_id`/`request_id`; statuses pending / syncing / synced / rejected / failed; interrupted `syncing` rows return to pending on launch (server dedupes on `device_id`+`action_id`) |
| Sync | Single-flight `SyncManager` → `POST /audit/v1/offline-sync`, ≤100 per request, triggered on reconnect, foreground, 30 s tick and the Sync button. "Synced" is written only from a server result row inside a committed transaction; unanswered actions stay "Will retry" |
| Screens | Scoring Entry (event grid from sport config, team pick, start/end match, history, corrections via compensation events, pending/rejected overlay, stale-cache banner), Roster Management (+ native action sheet), Roster Action modal (transfer / loan / release, local pre-checks in §5.11 order), Sync Status modal (connection, last confirmed sync, queue, retry, clear resolved), connectivity pill shows `Offline · n` and opens Sync Status |
| Role gating | Visibility only (`canScoreMatches`, `canManageRoster`); no frontend check is treated as authorization |
| Tests (Node, `mobile/tests/`) | 6 suites pass, incl. real SQLite file close/reopen, ordering, dedupe, partial server answers, 130-action batching |
| `tsc` | Only errors from uninstalled packages |

### Contracts used
`POST /audit/v1/events`, `GET /audit/v1/score/{match_id}`, `POST /audit/v1/roster/transfer`, `POST /audit/v1/offline-sync` (typed in `api/audit.ts`). `GET /audit/v1/roster/history/{player_id}` is typed but not yet called.

### Backend / spec gaps that block a real end-to-end demo
1. **No read route for a sport's scoring-event list** — `/sports` is create-only. The scoring grid uses dev configs (event ids other than `goal` assumed); unknown sports fall back to a free-text event-type field.
2. **No documented list routes** for fixtures, standings (only per-league computation), clubs, rosters or catalogue. Browsing screens, club ids, squad ids and player ids are still dev fixtures, so scoring/roster actions only succeed against the backend for ids that exist there (e.g. `club-alpha-1`, `player-alpha-1`, league ids from the seed).
3. **No "add player" route** — the contract offers transfer, loan, release only; "add" is not implemented.
4. **No login route documented**; actions send `requested_by` = the dev session's id.
5. Realtime feed (WebSocket/SSE) route is undocumented; scores refresh on pull-to-refresh / after submit only.

### Phase 4 mismatch found in the spec (§5.12) — needs a follow-up
`POST /audit/v1/checkout` takes `{order_id, customer_id, items:[{variant_id, quantity}], discount_code, payment:{token}}`; no name/email/phone, no client prices. Responses: 201/200 `paid` order with `receipt.payload`, `signature`, `pdf_base64`; errors 400 INVALID_DISCOUNT_CODE, 404 VARIANT_NOT_FOUND, 409 OUT_OF_STOCK / DUPLICATE_ORDER_ID, 402 PAYMENT_DECLINED / PAYMENT_CAPTURE_FAILED. Discount is `floor(subtotal*10/100)` (matches the dev simulation). The Phase 4 checkout form and `OrderDraft` still need to be reshaped and a backend adapter written; no catalogue route is documented.

### Not verified
Native build, simulator, expo-sqlite on device, airplane-mode desk check (8.4), force-quit persistence on device, UI layouts and animations.

## 12. Phase 5.5 status (2026-10-17) — checkout contract corrected, integration audited

- **Checkout** now sends exactly the §5.12 body (`order_id`, `customer_id`, `items`, `discount_code`, `payment.token`); name/email/phone/prices removed; typed adapter `data/backendStoreRepository.ts` over `api/commerce.ts`; `order_id` is stable for identical retries (`resolveOrderId`) and renewed when the body changes; documented 400/402/404/409 codes mapped; dev simulation mirrors the same rules and is labelled. Cart reducer and receipt UI unchanged except for server-shaped lines/signature.
- **Data source switch**: `EXPO_PUBLIC_DATA_SOURCE=backend|dev` (`data/index.ts`); only the Store has a backend adapter.
- **Audit fixes**: `useHomeData` now wraps `useLoad` (was a copy); one id generator; sign-out clears the cart and warns about unsynced changes; simulated sign-in is an explicit opt-in for release builds; stale comments removed. Routes: all 13 declared stack routes are registered and every `navigate`/`replace` target exists (scripted check).
- **Tests**: 7 Node suites pass (`mobile/tests/`). `tsc --noEmit`: only missing-package errors. Expo Doctor, native build: **not run** (see blockers). Full handoff: `BACKEND_READINESS.md`.

## 13. Build recovery (2026-10-17 13:40) — dependencies installed, JS compiles, native build BLOCKED on the iOS platform download

- Installed (`npx expo install`): react-native-reanimated 4.7.1, react-native-worklets 0.13.0, react-native-gesture-handler ~3.3.0, react-native-safe-area-context ~5.10.1, react-native-screens ~4.30.0, expo-haptics, expo-linear-gradient, expo-symbols, expo-blur, expo-sqlite, expo-font (peer of expo-symbols, flagged by expo-doctor), @react-native-community/netinfo 12.0.1, @react-navigation/{native,native-stack,bottom-tabs} 7.x. Not installed because nothing imports them: expo-secure-store, expo-file-system (as a direct dep), expo-sharing.
- `tsc --noEmit`: 0 errors. `expo-doctor`: 19/20 (remaining item is informational: native folders + app.json prebuild-only fields). 7 Node suites pass. `expo export --platform ios`: bundles 1546 modules to Hermes bytecode with no unresolved imports. `pod install`: success (116 pods).
- **Blocker**: `xcodebuild` refuses every iOS build ("iOS 26.5 is not installed") until the platform download (PID 6039, 89.7% of 8.52 GB, ~100–200 KB/s) finishes. No simulator exists, so nothing was launched; the smoke test has NOT been run.
- Next, once `xcrun simctl list runtimes` shows iOS 26.5: `cd mobile && npx expo run:ios`, then the smoke list in the handoff.
