// DEVELOPMENT ONLY. The five mandated demo accounts from instructions.md §4.2, used by the
// simulated auth adapter below. This file is imported only under `__DEV__` (see auth/index.ts);
// production auth must go through the backend.
import type { Role } from '../types/session';

export interface DemoAccount {
  email: string;
  role: Role;
  displayName: string;
  chipLabel: string;
}

export const DEMO_PASSWORD = 'Nascon@26';

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { email: 'admin@nascon.test', role: 'super_admin', displayName: 'Platform Admin', chipLabel: 'Admin' },
  { email: 'organizer@nascon.test', role: 'organizer', displayName: 'League Organizer', chipLabel: 'Organizer' },
  { email: 'manager@nascon.test', role: 'club_manager', displayName: 'Club Manager', chipLabel: 'Manager' },
  { email: 'player@nascon.test', role: 'player', displayName: 'Player', chipLabel: 'Player' },
  { email: 'viewer@nascon.test', role: 'viewer', displayName: 'Guest Viewer', chipLabel: 'Viewer' },
];
