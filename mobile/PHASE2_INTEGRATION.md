> **Phase 2.5 update (2026-10-17):** §2–§3 are now implemented in source: tabs are Home · Fixtures · Store (raised center) · Standings · Profile,
> Clubs is a pushed root-stack screen, `App.tsx` wraps `SessionProvider`, `AppNavigator` swaps Login ↔ app stack on session,
> Login has the server-address row, `AuthField` was folded into `TextField`, and Profile has Account + Sign out.
> Score/Roster role actions show a "coming in the next phase" alert (Phase 3). Still unverified on a device: see IMPLEMENTATION_PLAN §8.

# PHASE2_INTEGRATION.md — wiring Login + Home into the Phase 1 shell

Phase 2 added **only new files** (plus an appended status section in `IMPLEMENTATION_PLAN.md`).
No Phase 1 file, `package.json`, `ios/` or API/storage module was edited, because Phase 1's
install/pod build was still running. The steps below are the edits still to be made once it finishes.

## 1. Preconditions (blocked on Phase 1)
`package.json` still lists only expo / react / react-native. These imports used by Phase 1 *and* Phase 2
are not installed yet: `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`,
`react-native-safe-area-context`, `react-native-screens`, `@react-navigation/*`, `expo-linear-gradient`,
`expo-blur`, `expo-haptics`, `expo-symbols`, `@react-native-community/netinfo`.
Phase 2 adds **no** dependencies (it uses RN `Image`, not `expo-image`).

## 2. Navigation decision needed: where does Home live?
`SCREEN_MAP.md` has no Home tab (Fixtures · Standings · Store · Clubs · Profile), but the Phase 2 brief asks for a Home dashboard.
Options (recommend A): **A)** make Home the first tab, replacing `Fixtures` as the left-most slot and moving fixtures to a
pushed `Fixtures` list reached from "All fixtures"; **B)** keep five tabs and render Home inside the Fixtures tab; **C)** add a
sixth tab (breaks the 5-slot dock with a raised center). This is a product call, so nothing was changed.

## 3. Edits to make
**`App.tsx`** — wrap the tree in the session provider and gate on it:
```tsx
<SessionProvider> … <Root /> </SessionProvider>
function Root() { const { session } = useSession(); return session ? <AppNavigator /> : <LoginScreen />; }
```
(`useSession`, `SessionProvider`: `src/hooks/useSession.tsx`; `LoginScreen`: `src/screens/LoginScreen.tsx`.)
Because the session is in memory only, relaunch returns to Login until the Keychain adapter below exists.

**`navigation/AppNavigator.tsx`** — register Home per the decision in §2 and inject navigation:
```tsx
function HomeTab() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return <HomeScreen
    onOpenMatch={(matchId) => nav.navigate('MatchDetail', { matchId })}
    onOpenFixtures={() => nav.navigate('Tabs', { screen: 'Fixtures' })}
    onOpenStandings={() => nav.navigate('Tabs', { screen: 'Standings' })}
    onOpenClubs={() => nav.navigate('Tabs', { screen: 'Clubs' })}
    onOpenClub={() => nav.navigate('Tabs', { screen: 'Clubs' })}   // ClubProfile route arrives in Phase 3
    onOpenProfile={() => nav.navigate('Tabs', { screen: 'Profile' })}
    onRoleAction={(a) => a === 'store' ? nav.navigate('Tabs', { screen: 'Store' }) : a === 'profile' ? nav.navigate('Tabs', { screen: 'Profile' }) : undefined /* score/roster: Phase 3 */}
  />;
}
```
**`navigation/FloatingTabBar.tsx`** — add `Home` to `tabConfig` if option A/B/C adds a tab; **`navigation/types.ts`** — add `Home: undefined` to `TabParamList`.

## 4. Seams to replace later (all typed, all isolated)
| Concern | Dev implementation (delete/replace) | Real implementation goes in |
|---|---|---|
| Sign-in | `auth/devAuthAdapter.ts`, `dev/demoAccounts.ts`, `dev/DevDemoChips.tsx` (required only under `__DEV__`; release builds fail closed with "Sign-in is not available yet") | a backend `AuthAdapter` in `auth/index.ts` once a login route is documented (none exists in `instructions.md`/`api/endpoints.ts`), plus JWT in `security/tokenStorage.ts` (Keychain) |
| Home data | `data/devHomeRepository.ts`, `dev/homeFixtures.ts` | a `HomeRepository` mapping documented endpoints → `types/league.ts` (read-through SQLite cache) |
| Role ids | UI ids in `types/session.ts` (`super_admin`, `organizer`, …) | map from the backend's role claim |

Dev scenarios for Home: `EXPO_PUBLIC_DEV_HOME_SCENARIO=ready|empty|error|slow`.
