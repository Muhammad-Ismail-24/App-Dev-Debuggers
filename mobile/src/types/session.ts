// Presentation-layer session model. Role ids here are UI identifiers; the backend's wire
// values must be mapped in the real auth adapter (see PHASE2_INTEGRATION.md).
export type Role = 'super_admin' | 'organizer' | 'club_manager' | 'player' | 'viewer';

export interface Session {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  // 'dev-simulated' sessions never touched a backend. UI shows a notice for them.
  source: 'backend' | 'dev-simulated';
}
