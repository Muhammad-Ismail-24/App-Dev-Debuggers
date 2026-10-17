# SCREEN_MAP.md — MLS reference → NaSCon screens

Legend: **Direct** = adapted from an observed MLS screen · **Partial** = borrows observed components, layout invented · **None** = no accessible reference; built from the design system only.

## 1. Navigation map

```
RootStack (native-stack)
├── Login                                   (no tabs)
└── Main (FloatingTabBar, 5 items)
    ├── Fixtures      ── stack: Fixtures → MatchDetail → ScoringEntry*  (*Organizer, Super-Admin)
    ├── Standings     ── stack: Standings → MatchDetail
    ├── Store (center raised button) ── stack: Store → ProductDetail(sheet) → Cart(sheet) → Checkout → Receipt
    ├── Clubs         ── stack: Clubs → ClubProfile → RosterManagement*  (*Club Manager, Super-Admin)
    └── Profile       ── stack: Profile → Settings, SyncStatus, MyOrders/Receipt
Global: ConnectivityPill in every header → SyncStatus (sheet).  Sidekick-style FAB → NOT adopted (no NaSCon need).
```

- The MLS dock's tabs are Home · Matches · ⦿ · News · Standings. We swap News for Store/Clubs and **make the raised center button Store**: the rubric says the "Buy button stands out", and the Store is one of four things a new user must find unaided.
- MatchDetail hides the tab dock (as observed in MLS S12). Role actions are **contextual**, not tabs: the "Enter score" button on MatchDetail, "Manage roster" on ClubProfile. Roles without permission never see them (rubric area 5).
- Back always works: native stack + edge swipe. Sheets dismiss by swipe and by an explicit "Close".

## 2. Screen-by-screen mapping

| NaSCon screen | Reference basis | Fidelity | Adaptation |
|---|---|---|---|
| **Login** | S2 Welcome + S3–S6 form | Partial | Full-bleed dark stage with tenant gradient wash (S2 bottom blue/red → tenant colors), tenant logo top, headline. **Native** dark form (email, password + eye toggle, inline validation like S5). Primary white pill "Sign in". **Collapsible "Server address" row** (PDF §8.1 requires a changeable API URL) under the button. Demo-account chips (Organizer / Manager / Player / Viewer / Admin) fill the email field for the judges' speed; the password is not autofilled. Errors in plain language ("Email or password is incorrect"). |
| **Fixtures** | S11 Home | Partial→Direct | GradientHeader "Fixtures" + ConnectivityPill. Date-grouped sections ("Sat, Oct 17") of **vertical** `MatchCard`s (Home uses a horizontal rail; vertical is easier to scan and works at 360pt width). Card: status pill (Scheduled/LIVE/FT, **text + dot**), time, two team rows with crest/initial badge + score. Optional horizontal "Live now" rail at top (exact Home pattern). Pull-to-refresh, skeleton, empty state "No matches yet". |
| **Match Detail** | **S12 Match Detail** | **Direct** | Score ticker rail (other matches of the round) → `MatchHero` with **home/away club-color diagonal gradient**, crests, big tabular score, StatusPill, venue. Below: `UnderlineTabs` **Timeline · Pinned Store · Info**. Timeline = event rows (S12 scorer style, plus compensating events struck through). Pinned product showcase = `ProductCard` with white "Buy" pill (replaces "Watch on TV" glass button: pinned product appears in the hero as a glass card if pinned). Live updates over WS/SSE (MOTION S2). Organizer: "Enter score" white pill → ScoringEntry. |
| **Standings** | None (paywalled flow "Standings") | None | Tenant header, league picker pill (S9 dropdown-pill style), `StandingsTable` rows: rank, crest, team, P, W, D, L, GD, Pts (tabular). Qualification: left color bar **+ text badge** ("Q", "PO", "Out") + legend. Row tap → club; matches section → MatchDetail (judge task A: standings → match in ≤ 3 taps). |
| **Club Profile** | S9/S10 spotlight + Clubs flow (unseen) | Partial | Spotlight hero tinted by `club.color` (S9 radial glow), large crest/initial, name, **home venue**, staff list, roster grouped by position with role chips (Captain/Vice/Starter/Sub). Manager sees "Manage roster" pill. |
| **Store** | **S9/S10 Select Favorite Club** | **Direct** (repurposed) | Product carousel with depth/blur neighbors + club-color spotlight. Product name pill (dropdown-style) for category; price; `ChoiceStrip` for **variants (sizes)** with glow underline; stock state with text ("Only 1 left", "Out of stock"); white "Add to cart" pill. Below the hero: grid of other products. Cart badge in header. |
| **Checkout** | None (Buy tickets flow unseen) | None | Sheet → full screen. Order summary rows, total in PKR (**paisa → formatted**), mock gateway card ("Mock payment, no real charge"), white "Pay Rs 2,500" pill with MOTION N6. 409 → plain error "Someone just bought the last one. Pick another size." |
| **Receipt** | None | None | Success ✓ animation, order id, items, total, signature snippet (monospace, truncated, "Verified receipt"), buttons "Open PDF" (decoded `pdf_base64`) and "Share / Save". |
| **Roster Management** | Clubs → Roster flow (unseen) | None | List of players with role chips; row actions as **iOS action sheet**: Transfer · Loan · Release (+ Add player button). Transfer/Loan form sheet: target squad, dates (loan end), validation inline. Release = destructive confirm. Offline → queued with "Pending" chip. |
| **Scoring Entry** | S12 hero (compressed) | Partial | Compact MatchHero (live score) + **event-type grid generated from the sport config** (never hard-coded event names), team segmented control (home/away club colors **+ names**), optional player/minute. "Add event" white pill. Timeline below with "Correct" swipe action → compensating event with confirm. Offline → queued. |
| **Offline Sync Status** | None | None | Sheet from ConnectivityPill + Profile row. Header state (Online/Offline/Syncing + last sync time), **"Sync now"** white pill, queue list (`QueueItemRow`: type icon, human summary "Goal for Team A · queued 11:02", status chip), results with plain-language reasons mapped from `error_code` (e.g. `SQUAD_FULL` → "That squad is already full."). Clear resolved. |
| **Settings** | Profile/Account flows (unseen) | None | Grouped inset list (iOS): Account (email, role badge), **Server address** (editable + "Test connection" → `/health`), Device ID, cache info, Clear cache, About, **Sign out** (confirm). |

## 3. Role visibility matrix (UI only; the backend enforces)

| Screen / action | Super-Admin | Organizer | Club Manager | Player | Viewer |
|---|---|---|---|---|---|
| Fixtures, Match, Standings, Clubs, Store, Profile | ✓ | ✓ | ✓ | ✓ | ✓ |
| Scoring Entry (button on MatchDetail) | ✓ | ✓ (own league) | – | – | – |
| Roster Management (button on ClubProfile) | ✓ | – | ✓ (own club) | – | – |
| Sync Status | ✓ | ✓ | ✓ | ✓ (read) | ✓ (read) |

## 4. Missing reference material (exactly what to send)

Screenshots (PNG, any device) unless marked 🎥 (screen recording):
1. **Matches** tab root + date filter + competition filter (🎥 for the filter interaction).
2. **Standings** tab root, scrolled, plus any conference/league switcher.
3. **Clubs** list → **View club** (Latest + **Roster** + Schedule tabs).
4. **Profile** → Account → **Logging in** and **Logging out** screens.
5. **Buy tickets** flow (closest analogue to Checkout/Receipt). Every step.
6. 🎥 Home → Match Detail → tab switching → back (see `MOTION_SPEC.md` §4 for the full recording list).
7. Any **empty, loading or error** state in the MLS app (e.g. airplane mode on Matches).
8. **Match Detail of a LIVE or upcoming match** (we only have Full-time).
