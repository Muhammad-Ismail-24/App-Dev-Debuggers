# MOTION_SPEC.md — Interaction & motion spec

> **Honesty statement:** Mobbin exposed **only static screenshots** for MLS on the free tier, with no video. **Zero animations were directly observed.** Every entry below is marked **INFERRED**: designed from static evidence (e.g. blurred carousel neighbors imply depth scaling) plus native iOS conventions. To make anything here **OBSERVED**, we need the recordings listed in §4.

Library: **react-native-reanimated 4.7.1** (+ `react-native-worklets` 0.13.0), **react-native-gesture-handler ~3.3.0**. These are the SDK 58 bundled versions. Native-stack transitions come from `react-native-screens` (UIKit), so they are native, not JS.

Global rules:
- **Reduce Motion:** read `useReducedMotion()` from Reanimated. When it's on, replace movement/scale with a 150ms opacity crossfade and disable parallax, number rolls and glows.
- Run animations on the UI thread only (shared values / `useAnimatedStyle`). Never animate layout via `setState`.
- Haptics: `expo-haptics` (`selectionAsync` for pickers/tabs, `impactAsync(Light)` for presses, `notificationAsync(Success|Error)` for results).
- Named presets (implemented once in `src/theme/motion.ts`):

| Token | Value |
|---|---|
| `spring.snappy` | `{ damping: 20, stiffness: 300, mass: 0.8 }`: presses, chips |
| `spring.smooth` | `{ damping: 26, stiffness: 180 }`: indicators, carousels |
| `spring.bouncy` | `{ damping: 14, stiffness: 220 }`: success badges only |
| `timing.fast` | 150ms, `Easing.out(Easing.quad)` |
| `timing.base` | 250ms, `Easing.bezier(0.2, 0, 0, 1)` (iOS "emphasized") |
| `timing.slow` | 450ms, `Easing.bezier(0.2, 0, 0, 1)` |

---

## 1. Core interactions

| # | Interaction | Trigger | Initial → Final | Properties | Duration / curve | Source |
|---|---|---|---|---|---|---|
| M1 | **Pressable scale** (cards, chips, pills) | `onPressIn` / `onPressOut` | scale 1 → 0.97 → 1; opacity 1 → 0.9 → 1 | `transform.scale`, `opacity` | in: `timing.fast`; out: `spring.snappy` | INFERRED (iOS norm) |
| M2 | **Primary white pill press** | press | scale 1 → 0.98; bg `#FFFDFE` → `#E6E6E8` | scale, bg color | `timing.fast` | INFERRED |
| M3 | **Disabled CTA** | form invalid / system alert up | bg white → `#D0D0D0`, text 100% → 60% | bg, opacity | `timing.base` | **Static evidence** (S8 shows dimmed Continue); transition INFERRED |
| M4 | **Tab dock switch** | tab press | old icon/label grey `#5A5C69` → new white; icon scale 1 → 1.08 → 1 | color, scale | `spring.snappy` + `selectionAsync` haptic | INFERRED |
| M5 | **Center raised tab button** | press | scale 1 → 0.92 → 1, glow shadow radius 0 → 12 → 0 (accent) | scale, shadowOpacity | `spring.bouncy` | INFERRED |
| M6 | **Underline tab indicator** (Match Detail: Overview / Timeline / Store…) | tab press or pager swipe | indicator x/width = previous tab → new tab; labels crossfade grey ↔ white | `translateX`, `width`, color | Tied to pager scroll offset (interpolated, 1:1 with finger); on tap `spring.smooth` | INFERRED (underline is observed static) |
| M7 | **Score ticker chip select** | tap chip in the top rail | chip bg `transparent` → `#2B2C30`; rail scrolls the chip to center; hero content crossfades | bg, scrollX, hero opacity | bg `timing.fast`; scroll `spring.smooth`; hero fade 200ms | INFERRED |
| M8 | **Push to detail** (Fixture → Match) | tap match card | native iOS push (slide from right, parallax underlay, edge-swipe back) | native | UIKit default (~350ms) | INFERRED, native-stack default |
| M9 | **Modal sheet** (Cart, Variant picker, Sync queue, Confirmations) | button | sheet slides up; backdrop dims to 40% | native formSheet + detents | UIKit default; interactive drag-to-dismiss | INFERRED (iOS convention) |
| M10 | **Pull-to-refresh** | overscroll on lists | native `RefreshControl` spinner, tint white | native | native | INFERRED |

## 2. Signature moments (the "art-directed" part)

| # | Interaction | Trigger | Initial → Final | Properties | Duration / curve | Source |
|---|---|---|---|---|---|---|
| S1 | **Club-color hero gradient** (Match Detail) | screen mount / match data load | gradient opacity 0 → 1, slight scale 1.05 → 1 on the color layer only | opacity, scale | `timing.slow` | Gradient **observed (static)**; entrance INFERRED |
| S2 | **Live score tick** | realtime score event (WS/SSE) | old digit slides up & fades out (y 0 → -24, op 1 → 0); new digit enters from y +24 → 0; pill flashes "GOAL"-style accent for 1.2s | translateY, opacity, bg | 300ms `timing.base` per digit; flash 1.2s then fade 250ms. Haptic `notificationAsync(Success)` only for the user's followed club | INFERRED (no live-match frames available) |
| S3 | **Timeline event insert** | new event appended | new row height 0 → auto, opacity 0 → 1, x −8 → 0 | Reanimated `Layout` + `FadeInLeft` entering | `spring.smooth` | INFERRED |
| S4 | **Compensating event (correction)** | compensating event appears | original row gets strike-through + 50% opacity; new row enters per S3 with a "Corrected" badge | opacity, text decoration | `timing.base` | INFERRED (NaSCon-specific) |
| S5 | **Jersey / product carousel** (Store, adapted from Select Club) | horizontal pan (Gesture Handler `Pan`, or snapping `FlatList` + `useAnimatedScrollHandler`) | per item, by distance from center d ∈ [-1, 1]: scale 1 → 0.78, opacity 1 → 0.45, blur 0 → 12, translateY 0 → 12 | scale, opacity, blur overlay opacity | 1:1 with scroll; snap `spring.smooth` | **Static evidence** (neighbors blurred, smaller); motion INFERRED |
| S6 | **Spotlight color crossfade** | carousel centered item changes | radial glow color A → B | color (interpolateColor on the snapped index) | `timing.slow` | **Static evidence** (Inter Miami vs Atlanta glow differ); transition INFERRED |
| S7 | **Picker strip (crests / variants)** | tap or synced with carousel | selected item scale 0.45 → 1 (≈18 → 44pt); underline glow fades in | scale, opacity | `spring.smooth` + `selectionAsync` | **Static evidence**; motion INFERRED |
| S8 | **Onboarding progress bar** | step change | fill width step n → n+1 | width (scaleX from left) | `timing.base` | **Static evidence** (20% → 40%); motion INFERRED |
| S9 | **Glass CTA** | press | blur intensity constant; overlay white 15% → 25% | overlay opacity, scale 0.98 | `timing.fast` | INFERRED |
| S10 | **Large-title header collapse** (Fixtures, Standings, Store) | vertical scroll | title 28pt → 17pt centered, gradient header height 120 → safe-area+44, gradient opacity 1 → 0.85 | fontSize via scale, translateY, opacity | 1:1 with scrollY (`interpolate`, clamp) | INFERRED (iOS large title convention) |

## 3. NaSCon-specific feedback motion (rubric "Feedback & error handling")

| # | Interaction | Trigger | Initial → Final | Properties | Duration / curve |
|---|---|---|---|---|---|
| N1 | **Connectivity pill** (always visible) | NetInfo change / sync start / end | Online (green dot) ↔ Offline (amber, slashed-cloud icon) ↔ Syncing (blue, rotating arrows) | bg color, icon crossfade, rotating icon (`withRepeat(withTiming(360°, 1000ms, linear))`) | color 250ms; label crossfade 150ms |
| N2 | **Offline banner** | goes offline | slides down under the header: y −40 → 0, op 0 → 1; auto-collapses to the pill after 3s | translateY, opacity, height | `spring.smooth` |
| N3 | **Queued action** | action saved offline | row enters with a "Pending" chip; the Sync tab badge counts up (number roll as S2) | entering layout anim | `spring.smooth` |
| N4 | **Per-action sync result** | `/offline-sync` response | chip Pending → Applied (green ✓) / Rejected (red ⚠ + plain-language reason expands below) | bg, icon, height expand | `timing.base`, stagger 80ms per row in `processed_order` |
| N5 | **Queue clear** | resolved items durably removed | rows collapse height → 0, op → 0 | exiting layout anim | `timing.base`, stagger 50ms |
| N6 | **Checkout pay** | tap Pay | button → spinner (width shrinks to circle 52pt) → ✓ check → navigate to Receipt | width, opacity, check path draw (react-native-svg `strokeDashoffset`) | 250ms morph, 400ms check, `notificationAsync(Success)` |
| N7 | **Out of stock / 409** | checkout conflict | button horizontal shake x 0 → ±8 → 0 ×3, error text fades in | translateX, opacity | 3× 60ms; `notificationAsync(Error)` |
| N8 | **Skeleton loading** | first load with no cache | shimmer gradient sweeping L → R over placeholder blocks | translateX of gradient | 1200ms linear, repeat; disabled under Reduce Motion |
| N9 | **Destructive confirmation** (release player, compensating event) | tap | native `Alert` (iOS) with destructive button style | native | native |

## 4. Reference material needed to convert INFERRED → OBSERVED

Screen recordings (`.mov`, from a real device running the MLS app, ideally 60fps):

1. **Onboarding:** welcome background (video or still?) → Create account → Select Favorite Club. **Swipe the jersey carousel slowly, then tap a crest in the strip.** (S5–S8)
2. **Tab dock:** tap each tab including the center raised button; scroll Home to see whether the dock hides/shrinks on scroll. (M4, M5)
3. **Home → Match Detail push + edge-swipe back**, then **tap 3 chips** in the top score ticker. (M7, M8, S1)
4. **Match Detail:** tap Overview → Videos → Play-By-Play → Lineups; also **swipe horizontally** between them, and scroll down to see whether the hero collapses. (M6, S10)
5. **A live match** with a goal arriving, if possible (or a replay of the in-app goal notification). (S2, S3)
6. **Pull-to-refresh** on Matches and Standings. (M10)
7. **Matches:** filter by date & by competition (sheet vs inline picker?). (M9)
8. **Standings, Clubs → View club → Roster, Profile → Logging in / Logging out:** screenshots are enough for these. Recordings only if something moves.
9. Any **loading/skeleton** state (turn on Network Link Conditioner "Very Bad Network"). (N8)
