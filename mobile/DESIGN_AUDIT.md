# DESIGN_AUDIT.md — MLS iOS reference audit (Phase 0)

**Reference:** Mobbin → MLS (iOS), app version id `24b013c9-…`
**Inspected:** 2026-10-17, signed-in Mobbin account on the **free tier** (no Pro).
**Author:** Zaheen (mobile) with AI assistance. Inspection only. No UI code was written.

---

## 1. Reference accessibility (read this first)

| Item | Status |
|---|---|
| Total MLS content on Mobbin | 133 screens, 133 UI elements, 40 flows |
| **Screens tab (free)** | **4 "Highlight" screens** viewable at full resolution: Splash, Select Your Favorite Club (Inter Miami), Home, Match Detail. Everything else is paywalled ("Access all 680,174 screens — Get Pro"). |
| **Flows tab (free)** | **Onboarding flow, 9 screens**, fully visible. The other 39 flows show only their **names** (sidebar). Thumbnails are server-blurred behind the paywall. |
| UI Elements tab (free) | 5 visible tiles, all duplicates of Onboarding screens. |
| Video / screen recordings | **None.** Mobbin shows static PNG frames only, so **no animation was directly observed.** |
| Image resolution | Home: 720×1680 (sampled). Match Detail: 1179×2556 (393×852 pt @3x). Pixel colors below were sampled from these images. |

**Unique screens actually inspected: 13**, listed in §3. I did not try to get around the paywall.

**What this means:** the static visual language (color, type, layout, components, composition) is well evidenced for Home, Match Detail, and Onboarding. **Every motion statement in `MOTION_SPEC.md` is inferred** from static frames and iOS conventions, and is labelled that way.

---

## 2. Overall art direction (observed)

1. **Dark, cinematic, broadcast-style.** Near-black base (`#191B1F`) with very large, soft color fields. There are no flat brand-colored headers. Color arrives as **light**: gradients, glows, spotlights.
2. **Club color is the hero.** Match Detail paints a diagonal gradient from the home club's color (Nashville yellow `#BEBB4F`) to the away club's (Montréal blue `#19377A`). Select Your Favorite Club tints its radial spotlight with the selected club's color (pink for Inter Miami, gold for Atlanta United). → Our tenant/club colors can drive the whole UI. That directly answers PDF §8.6 ("The tenant's logo and colors are applied").
3. **Glass over color.** The secondary CTAs ("Watch on TV", "Create an account", "Subscribe") are translucent frosted pills on top of the gradients.
4. **White solid pill = primary action.** "Continue" in onboarding is the only opaque white element on the screen. It is unmistakably the primary action.
5. **Large bold geometric display type, quiet grey metadata.** Strong typographic hierarchy: score > teams > status > metadata.
6. **Floating, rounded everything.** Floating tab-bar dock, rounded match cards with 1px hairline strokes, a hero card with large top radius, and a floating circular "Sidekick" FAB.
7. **Horizontal rails** for related content: match cards, score ticker, highlights, crest picker, jersey carousel. Vertical scrolling is reserved for sections.

---

## 3. Screen-by-screen inventory (observed screens only)

### S1 — Splash
- Pure dark background, MLS crest centered (white outline, ~100pt wide).
- Status bar light content. Nothing else.

### S2 — Welcome / auth gate
- Full-bleed, desaturated stadium photo (crowd, scarves). It could be a looping video; **cannot tell from a still.**
- Small white crest top-center (~40pt).
- Headline "30 teams. 30 seasons / Game on." in bold display type, centered, ~28pt, 2 lines.
- Sub-line "The Official MLS App", ~15pt, grey-white.
- Bottom third has a gradient wash: blue bottom-left → red bottom-right (league colors) fading to transparent.
- **Glass pill** "Create an account" (full width minus ~20pt margins, ~50pt tall, translucent white ~15%, white text).
- Plain text button "Sign in" under it.

### S3–S6 — Create MLS ID (web auth)
- Presented as a **SFSafariViewController-style sheet** (`Cancel`, lock + `id.mlssoccer.com`, reader/reload icons, bottom browser toolbar). Auth is web-based, white UI. It is **not** native app styling.
- Fields: email, password with eye toggle. **Live password-rule checklist** with green checkmarks for each satisfied rule (8 chars, 3 of 4 classes, etc.).
- Two consent checkboxes, black full-width "Continue", "OR" divider, "Continue with Apple".
- States seen: empty, keyboard focused (iOS keyboard with Passwords bar), filled + rules satisfied, checkboxes ticked.
- **Relevance:** we need **native** email + password (PDF §8.2), so we borrow only the *inline live validation* pattern, not the web sheet.

### S7–S8 — "Help Us Improve Your Experience" (ATT pre-prompt)
- Onboarding **progress bar** at top: ~160pt wide, 4pt tall, white fill on translucent track. Step 1 of the flow is ~20% filled.
- Large rounded outline "phone frame" line drawing (1pt, ~10% white) as a stage. Line-art goal with a full-color 3D ball.
- **Dark-red radial glow** from top-center down to the ball.
- Body copy centered, grey; white "Continue" pill at bottom.
- S8: system ATT alert over it. The Continue button greys out (`#D0D0D0`-ish) while the alert is up.

### S9–S10 — Select Your Favorite Club
- Progress bar ~40%. "Skip" text at top-right (grey `#B0AFB4`).
- Title "Select Your Favorite Club", 2 lines, ~26pt bold, centered.
- **Dropdown pill** "Inter Miami CF ⌄": dark translucent fill (`#474749`), ~36pt tall, fully rounded.
- **Jersey carousel:** centered jersey (~210pt wide) with neighbors peeking in at both screen edges. Neighbors are **blurred, darker and smaller**, which suggests depth.
- **Radial spotlight** behind the jersey, tinted with the club color (Inter Miami → mauve `#493C45` center; Atlanta → olive-gold). It fades to `#191B1F` at the edges.
- **Crest picker strip** near the bottom. All clubs in a row, the selected crest enlarged (~44pt vs ~18pt) with a **glowing underline** in club color under it.
- Opaque white "Continue" pill (`#FFFDFE`, ~52pt tall, ~16pt radius, black text).

### S11 — Home (tab root)
- **Header:** vertical gradient from blue (`#517DAE`) at top → purple (`#575571`) → maroon (`#432C38`) → base (`#1E1F25`) by ~120pt. Crest icon + large title "Home" (~28pt bold) left, hamburger right.
- Section label "Sun, Mar 30" (~17pt bold).
- **Match card rail** (horizontal). Card ~120×100pt, fill same as base, **1px stroke `#36383C`**, radius ~12pt. Content: "Regular Season" (grey `#9A9FA6`, 12pt) + kickoff time (white, right) / hairline divider / two rows of crest (20pt) + team abbreviation (bold 15pt) / broadcaster line (grey 11pt).
- **Promo banner:** full-width image card, radius ~12pt, with a glass "Subscribe" button.
- **Section header** "Your Next Watch" (bold 17pt) + "All Videos ›" (grey) at right.
- **Video card** full width, radius ~12pt, with a live score bug overlay.
- **Floating "Sidekick" FAB:** 44pt white circle with the crest + sparkle glyph, bottom-right above the tab dock.
- **Floating tab dock:** inset ~10pt from the edges, ~58pt tall, nearly black (`#08070C`), radius ~28pt. Five items: Home, Matches, **center raised circle** (`#4FAEFF`, ~52pt, crest glyph, protrudes above the dock), News, Standings. Icon + label (10pt), inactive grey `#5A5C69`, active white.

### S12 — Match Detail (pushed)
- **No tab dock** on this screen. It's a pushed, full-screen detail. The Sidekick FAB persists.
- **Score ticker** at top: a horizontal rail of compact chips (~108×62pt, radius ~10pt, stroke `#36383C`). Each shows "Full-time", 2 rows of crest + abbreviation + score in a small dark box. The **current match chip is filled lighter** (`#2B2C30`) to mark it as selected.
- **Hero card:** starts under the ticker, large top radius (~28pt). Background is a **diagonal gradient, home club color top-left (`#BEBB4F`) → neutral center (`#353A36`) → away club color right (`#19377A`)**, fading down into base `#4A4C4E`→`#1A1C1E`.
  - Back chevron (top-left), share icon (top-right), white.
  - "Regular Season / Sun, 23 Mar 2025" centered, 15pt.
  - Row: home crest (~50pt) + abbreviation below | **score "3" ~44pt heavy** | **status pill "Full-time"** (dark translucent `#3B3D31`-ish, ~16pt semibold) | **"0"** | away crest.
  - Venue line with pin glyph, grey.
  - Scorers: "Pérez 67′ / Bauer 62′ / Muyl 56′". Names white, minutes grey. Ball glyph next to the team column.
  - **Glass button** "Watch on TV", full width, ~50pt, radius ~14pt.
- **Underline tabs:** Overview (active, white, **2pt underline `#65B0F9`**), Videos, Play-By-Play, Lineups (grey, horizontally scrollable, clipped at edge).
- "Highlights" section with horizontal video cards (duration badge "▶ 7:00").

---

## 4. Unobserved flows (names only, from the sidebar)

These exist in the reference but were **not visible** (paywalled). Do not assume their design.

Onboarding (sub: Selecting a favorite club) · Home (Match detail; Your next watch → Watching a highlight; MLS Sidekick) · **Matches** (Match details → Enabling match notifications, Buy tickets; Filtering match by date; Filtering matches by competition) · **Clubs** (View club → Latest, Tickets, Schedule, Videos, **Roster**, Enabling club notifications) · Stats (Player stats detail, Club stats detail) · News (News detail) · **Standings** · **Profile** (Match tickets, Account, Following clubs, Following topics, Hiding scores, Notifications, Edit personal details, Deleting an account, **Logging out**, **Logging in**).

Bold = flows that matter most for NaSCon. See `SCREEN_MAP.md` §4 for exactly what to capture.

---

## 5. Visual system findings (summary; tokens in `DESIGN_SYSTEM.md`)

| Aspect | Finding | Evidence |
|---|---|---|
| Base background | `#191B1F` (Home) / `#181A1C` (Match). Not pure black. | sampled |
| Elevated surface | `#2B2C30` (selected chip) | sampled |
| Hairline stroke | `#36383C`, 1px | sampled |
| Secondary text | `#9A9FA6` | sampled |
| Tertiary / inactive | `#5A5C69` | sampled |
| Accent (brand) | `#4FAEFF` center tab button, `#65B0F9` tab underline | sampled |
| Tab dock fill | `#08070C` | sampled |
| Primary CTA | white pill `#FFFDFE` + dark text | sampled |
| Glass | ~12–18% white over blur, no stroke | visual |
| Typography | Bold, slightly wide geometric sans for display (custom MLS face, **not identifiable** from frames); neutral sans for body. | visual |
| Radius scale | ~10 (chips), ~12 (cards), ~14–16 (buttons), ~28 (hero, dock), full (pills, FAB) | visual estimate |
| Shadows | Almost none. Depth comes from light/blur/gradient, not drop shadows. | visual |
| Icons | Thin–regular outline glyphs (SF Symbols-like), white or grey | visual |
| Status bar | Light content on every screen except the white web-auth sheet | visual |

---

## 6. Gaps between the reference and our HCI rubric (PDF §8.6)

The reference is beautiful but not compliant on its own. We must deviate here:

| Rubric item | MLS behavior | NaSCon rule |
|---|---|---|
| Tap targets ≈ 48dp | Tab icons ~24pt with 10pt labels; ticker chips fine; back/share ~24pt glyphs | Every hit area ≥ 48×48pt (`hitSlop` on small glyphs) |
| Contrast | Minute grey on gradient (`#4B4D3C` region) is low contrast | Metadata ≥ 4.5:1 on its actual background; gradients get a dark scrim under text |
| Meaning not by color alone | Selected ticker chip = lighter fill only | Add text + icon (e.g. "LIVE" dot + label, "Q" badge + "Qualified" text) |
| Online/Offline/Syncing always visible | Not present | Persistent status pill in every header (see `SCREEN_MAP.md`) |
| Plain-language errors | n/a | Map every backend `error.code` to human copy |
| 360×640 + rotation | Built for 393×852 | Layouts must flex; no fixed widths except rails |
| Light mode | Reference is dark only; our `app.json` is `"userInterfaceStyle": "light"` | **Decision needed:** switch to `"dark"` (recommended, matches reference) |
