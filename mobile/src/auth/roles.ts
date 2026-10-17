import type { SFSymbol } from 'expo-symbols';
import type { Role } from '../types/session';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Platform Super-Admin',
  organizer: 'League Organizer',
  club_manager: 'Club Manager',
  player: 'Player',
  viewer: 'General Viewer',
};

export type RoleActionId = 'score' | 'roster' | 'store' | 'profile';

export interface RoleAction {
  id: RoleActionId;
  label: string;
  hint: string;
  icon: SFSymbol;
}

const ACTIONS: Record<RoleActionId, RoleAction> = {
  score: { id: 'score', label: 'Score a match', hint: 'Enter or correct live match events', icon: 'plus.forwardslash.minus' },
  roster: { id: 'roster', label: 'Manage roster', hint: 'Add, transfer, loan or release players', icon: 'person.2' },
  store: { id: 'store', label: 'Shop merchandise', hint: 'Browse club merchandise', icon: 'bag' },
  profile: { id: 'profile', label: 'My profile', hint: 'View your profile and settings', icon: 'person.crop.circle' },
};

// PRESENTATION ONLY. Hiding an action is a UX courtesy; the backend enforces every permission.
const BY_ROLE: Record<Role, RoleActionId[]> = {
  super_admin: ['score', 'roster'],
  organizer: ['score'],
  club_manager: ['roster'],
  player: ['profile'],
  viewer: ['store'],
};

export function quickActionsFor(role: Role): RoleAction[] {
  return BY_ROLE[role].map((id) => ACTIONS[id]);
}

// PRESENTATION ONLY (backend enforces): who sees the scoring / roster entry points.
export const canScoreMatches = (role: Role) => role === 'organizer' || role === 'super_admin';
export const canManageRoster = (role: Role) => role === 'club_manager' || role === 'super_admin';
