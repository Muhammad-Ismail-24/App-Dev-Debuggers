import { AuthError, type AuthAdapter } from './authAdapter';

export * from './authAdapter';
export { canManageRoster, canScoreMatches, quickActionsFor, ROLE_LABELS } from './roles';
export type { RoleAction, RoleActionId } from './roles';

// Release builds have no backend login route to call yet, so they fail closed instead of
// accepting demo credentials. Replace this with the real backend adapter when the route exists.
const unavailableAdapter: AuthAdapter = {
  kind: 'unavailable',
  async signIn() {
    throw new AuthError('BACKEND_AUTH_UNAVAILABLE', 'Backend login route not integrated');
  },
};

// Simulated sign-in is on in debug builds. A release build keeps it OFF unless it is built with
// EXPO_PUBLIC_ALLOW_SIMULATED_AUTH=1 — an explicit opt-in for a demo build, because the Part I
// spec documents no login route yet. Either way sessions are tagged 'dev-simulated' and the UI
// says so. Metro inlines the env var, so the adapter is stripped from builds that don't opt in.
export const SIMULATED_AUTH_ENABLED: boolean = __DEV__ || process.env.EXPO_PUBLIC_ALLOW_SIMULATED_AUTH === '1';

export const defaultAuthAdapter: AuthAdapter = SIMULATED_AUTH_ENABLED
  ? (require('./devAuthAdapter') as typeof import('./devAuthAdapter')).devAuthAdapter
  : unavailableAdapter;
