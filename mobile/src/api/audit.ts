// Typed wrappers for the documented /audit/v1 routes used by scoring, roster and sync
// (Part I PDF §5.9, §5.11, §5.14). Field names are wire-exact snake_case. Everything goes through
// the one centralized `request()` in client.ts. /audit/v1 routes take no Authorization header.
import { request } from './client';

export const AUDIT_PATHS = {
  events: '/audit/v1/events',
  score: (matchId: string) => `/audit/v1/score/${encodeURIComponent(matchId)}`,
  rosterTransfer: '/audit/v1/roster/transfer',
  rosterHistory: (playerId: string) => `/audit/v1/roster/history/${encodeURIComponent(playerId)}`,
  offlineSync: '/audit/v1/offline-sync',
} as const;

// ---- §5.9 events & score projection ----
export interface EventBody {
  event_id: string;
  match_id: string;
  // match_init | match_start | score | discipline | tiebreak_winner | match_end | compensation
  type: string;
  payload: Record<string, unknown>;
}

export interface EventResponse {
  event_id: string;
  match_id: string;
  type: string;
  sequence: number;
  match_version: number;
  signature: string;
}

export interface ScoreSide {
  team_id: string;
  score: number;
  wickets: number | null;
  balls: number | null;
  overs: string | null;
  fair_play: number;
}

export interface ScoreLogEntry {
  sequence: number;
  event_id: string;
  type: string;
  payload: Record<string, unknown>;
  signature: string;
  compensated: boolean;
  compensated_by: string | null;
}

export interface ScoreProjection {
  match_id: string;
  sport_id: string;
  league_id: string | null;
  status: 'upcoming' | 'in_progress' | 'completed';
  outcome: string;
  winner_team_id: string | null;
  tiebreak_winner_team_id: string | null;
  home: ScoreSide;
  away: ScoreSide;
  version: number;
  events: ScoreLogEntry[];
}

export const postEvent = (body: EventBody) => request<EventResponse>(AUDIT_PATHS.events, { method: 'POST', body: JSON.stringify(body) });
export const getScore = (matchId: string) => request<ScoreProjection>(AUDIT_PATHS.score(matchId));

// ---- §5.11 roster ----
export type RosterChange = 'transfer' | 'loan' | 'release';

export interface TransferBody {
  request_id: string;
  league_id: string;
  player_id: string;
  type: RosterChange;
  from_squad_id: string;
  to_squad_id: string | null; // null for release
  effective_date: string; // YYYY-MM-DD
  loan_end_date: string | null; // required (> effective_date) only for loan
  reason: string;
  requested_by: string;
}

export interface AuditEntry {
  audit_id: string;
  action: 'transfer' | 'loan' | 'release' | 'loan_return';
  player_id: string;
  league_id: string;
  from_squad_id: string | null;
  to_squad_id: string | null;
  effective_date: string;
  state: string;
  who: string;
  when: string;
  why: string;
}

export interface TransferResponse {
  request_id: string;
  status: string;
  state: 'active' | 'deferred_until_match_end';
  blocking_match_id: string | null;
  registration: Record<string, unknown> | null;
  audit_entry: AuditEntry;
}

export interface RosterHistory {
  player_id: string;
  as_of: string;
  league_id: string;
  current_squad_id: string | null;
  parent_squad_id: string | null;
  history: AuditEntry[];
}

export const postTransfer = (body: TransferBody) => request<TransferResponse>(AUDIT_PATHS.rosterTransfer, { method: 'POST', body: JSON.stringify(body) });
export const getRosterHistory = (playerId: string, asOf?: string) =>
  request<RosterHistory>(`${AUDIT_PATHS.rosterHistory(playerId)}${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ''}`);

// ---- §5.14 offline sync ----
export type OfflineActionType = 'score_event' | 'roster_transfer';

// The exact queued-action envelope.
export interface OfflineAction {
  action_id: string;
  type: OfflineActionType;
  queued_at: string;
  base_version: number;
  payload: EventBody | TransferBody;
}

export interface OfflineSyncResult {
  action_id: string;
  status: 'applied' | 'rejected' | 'duplicate';
  resolution: 'appended' | 'rebased_append' | 'skipped_duplicate' | 'server_wins';
  error_code: string | null;
  processed_order: number;
  server_version: number;
  signature: string | null;
}

export interface OfflineSyncResponse {
  device_id: string;
  results: OfflineSyncResult[];
  summary: { applied: number; rejected: number; duplicate: number };
}

export const postOfflineSync = (deviceId: string, actions: OfflineAction[]) =>
  request<OfflineSyncResponse>(AUDIT_PATHS.offlineSync, { method: 'POST', body: JSON.stringify({ device_id: deviceId, actions }) });
