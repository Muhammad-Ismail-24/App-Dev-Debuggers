# DESIGN_SYSTEM.md — NaSCon "Floodlight" design system (derived from MLS iOS)

Values marked † were **pixel-sampled** from the reference. All other values are estimated from the screenshots and tuned for our HCI rubric. Files map 1:1 to `src/theme/` (existing `colors.ts`, `spacing.ts`, `typography.ts` get **replaced**, plus new `radii.ts`, `motion.ts`, `tenant.ts`).

## 1. Color

### 1.1 Neutral foundation (dark-only; recommend `app.json` → `"userInterfaceStyle": "dark"`)

| Token | Hex | Use |
|---|---|---|
| `bg.base` | `#191B1F` † | Screen background |
| `bg.sunken` | `#08070C` † | Tab dock, input wells |
| `bg.raised` | `#232529` | Cards on base (subtle lift; MLS uses base + stroke) |
| `bg.selected` | `#2B2C30` † | Selected chip / row |
| `stroke.hairline` | `#36383C` † | 1px card / chip borders, dividers |
| `text.primary` | `#FFFFFF` | Titles, scores, values |
| `text.secondary` | `#9A9FA6` † | Metadata (≈6.4:1 on base ✓) |
| `text.tertiary` | `#858A93` | Inactive tabs, captions. MLS uses `#5A5C69` † (≈2.6:1 ✗), raised to ≈5.0:1 |
| `glass.fill` | `rgba(255,255,255,0.14)` | Glass buttons over gradients (with `expo-blur` intensity 30, tint `dark`) |
| `glass.fillPressed` | `rgba(255,255,255,0.24)` | |
| `cta.bg` / `cta.fg` | `#FFFDFE` † / `#111214` | Primary pill (Buy, Continue, Pay, Sync now) |
| `scrim.text` | `rgba(0,0,0,0.35)` | Under any text sitting on a club gradient |

### 1.2 Accent & semantic (never color-only: always paired with icon + label)

| Token | Hex | Use |
|---|---|---|
| `accent` | `#4FAEFF` † | Center tab, links, focused inputs |
| `accent.indicator` | `#65B0F9` † | Tab underline |
| `status.online` | `#3DD68C` | Online pill (+ "Online" text, dot) |
| `status.offline` | `#F5B544` | Offline pill (+ slashed-cloud icon) |
| `status.syncing` | `#4FAEFF` | Syncing pill (+ rotating arrows) |
| `status.success` | `#3DD68C` | Applied / paid / qualified |
| `status.danger` | `#FF6B6B` | Rejected / errors / out of stock |
| `status.live` | `#FF3B5C` | LIVE badge (dot + "LIVE") |

### 1.3 Tenant & club color system (core idea taken from the reference)
- `tenant.primary` / `tenant.secondary` / `tenant.logoUri`: tenant brand. Drives the **header gradient** (MLS Home: blue → purple → maroon → base).
- `club.color`: per club (home/away). Drives the **Match hero diagonal gradient** and the **Club Profile spotlight**.
- Source: backend league/club data if provided; otherwise a deterministic fallback palette hashed from `club_id` (12 hues, chosen to stay readable with white text plus the scrim). **No hard-coded sport or club names.**
- Gradient recipe (Match hero): `LinearGradient` start `{x:0,y:0}` end `{x:1,y:0.6}`, colors `[home @ 85%, mix(home, away, 0.5) @ 30% darkened, away @ 85%]`, then a second vertical gradient `transparent → bg.base` over the bottom 45%.
- Header recipe (tab roots): vertical `[tenant.primary @ 70%, tenant.secondary @ 45%, bg.base]` locations `[0, 0.45, 1]`, height = safe-area + 120.
- Spotlight recipe (Club/Store): radial-look via `expo-linear-gradient` layered ellipse, or `@shopify/react-native-skia` `RadialGradient` (Skia is optional, see `IMPLEMENTATION_PLAN.md`).

## 2. Typography
The MLS display face is a proprietary bold, slightly wide geometric sans, **not identifiable** from frames. We use **SF Pro (system font)**: zero bundle cost, best iOS legibility, Dynamic Type support.

| Token | Size / line | Weight | Notes |
|---|---|---|---|
| `display.score` | 48 / 52 | 800 | `fontVariant: ['tabular-nums']`, so scores don't jitter |
| `title.large` | 30 / 36 | 800 | Tab-root large titles ("Fixtures"), letterSpacing −0.4 |
| `title` | 22 / 28 | 700 | Screen/section heroes |
| `headline` | 17 / 22 | 700 | Section headers ("Highlights", "Sun, Mar 30") |
| `body` | 16 / 22 | 400 | Default (≥16 for readability) |
| `body.strong` | 16 / 22 | 600 | Team abbreviations, buttons |
| `callout` | 15 / 20 | 500 | Status pill text, venue |
| `caption` | 13 / 18 | 500 | Metadata. **Minimum size on any screen.** |
| `tab` | 11 / 13 | 600 | Tab dock labels (only exception < 13; uppercase off) |

`allowFontScaling` stays on. Cap with `maxFontSizeMultiplier={1.4}` on dense rails (ticker, standings table).

## 3. Spacing, sizing, radii
- Spacing scale (4-pt grid): `xxs 2, xs 4, sm 8, md 12, lg 16, xl 20, xxl 24, xxxl 32`. Screen gutter **16** (MLS ~16–20).
- `minTouchTarget = 48` (rubric). Small glyph buttons (back, share) are 24pt icons in 48pt boxes.
- Radii: `chip 10`, `card 14`, `button 16`, `sheet 24`, `hero 28`, `dock 28`, `pill 999`.
- Card padding 12. Rail item gap 10. Section vertical gap 28.

## 4. Elevation & effects
- Depth = **light, not shadow.** No shadows on cards. Only exceptions: the tab dock (`shadowColor #000, opacity 0.5, radius 24, y 8`) and the center button glow (`shadowColor accent, opacity 0.6, radius 12`).
- Blur: `expo-blur` `BlurView` for glass buttons, the dock background, and sheet backdrops. iOS 26 (Xcode 26 SDK): `expo-glass-effect` (`GlassView`) can give native Liquid Glass. Use it on the tab dock with a `BlurView` fallback (`isLiquidGlassAvailable()`).

## 5. Iconography
- **SF Symbols via `expo-symbols`** (`SymbolView`), native and crisp, matching the reference's thin outline style. Fallback glyphs: `@expo/vector-icons` (Ionicons) for non-iOS/web.
- Weight `regular`, size 22 (tabs) / 20 (inline) / 17 (metadata). Every icon-only control gets `accessibilityLabel`.

## 6. Component inventory (to build in `src/components/`, PascalCase)

| Component | Derived from | Key specs |
|---|---|---|
| `ScreenBackground` | All | `bg.base` + optional tenant header gradient |
| `GradientHeader` | Home header | Large title + logo + `ConnectivityPill` + menu; collapses (MOTION S10) |
| `ConnectivityPill` | **New** (rubric) | Always visible; Online / Offline / Syncing (n); taps → Sync Status |
| `FloatingTabBar` | Tab dock | 5 items, center raised button, glass/blur, inset 10, radius 28 |
| `MatchCard` | Home match card | 1px hairline, status/time row, 2 team rows, footer meta; ≥ 48pt tall rows |
| `ScoreTickerRail` | Match ticker | Compact chips, selected = `bg.selected` + "Viewing" a11y state |
| `MatchHero` | Match hero | Club gradient, crests, `display.score`, `StatusPill`, venue |
| `StatusPill` | "Full-time" pill | Text + optional dot/icon: Scheduled / LIVE / HT / FT |
| `UnderlineTabs` | Overview/Videos tabs | Scrollable, animated indicator (MOTION M6) |
| `TimelineRow` | Scorers list | Minute, icon, actor, team side, "Corrected" variant |
| `SectionHeader` | "Your Next Watch / All Videos ›" | Title + optional action link |
| `PrimaryButton` | White "Continue" pill | 52pt, radius 16, loading + disabled states |
| `GlassButton` | "Watch on TV" | Blur + glass fill |
| `TextField` | MLS ID form (re-skinned dark) | Label, inline live validation list, eye toggle |
| `ProductCarousel` | Jersey carousel | Depth scale/blur (MOTION S5) |
| `ChoiceStrip` | Crest picker | Variant/size picker with glowing underline (MOTION S7) |
| `SheetContainer` | iOS sheet | For cart, confirmation, sync details |
| `StandingsTable` | **No reference** (paywalled) | Sticky header, tabular nums, qualification badge **with text** |
| `EmptyState` / `ErrorState` / `Skeleton` | **New** (rubric) | Plain-language copy, retry action |
| `QueueItemRow` | **New** | Pending / Applied / Rejected + reason |
