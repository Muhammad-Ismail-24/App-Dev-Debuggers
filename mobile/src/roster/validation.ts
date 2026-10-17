import type { RosterChange } from '../api/audit';

// Client-side pre-check that mirrors the server's ordered rules in §5.11 for the steps the
// device can evaluate from data it holds (1, 4, 5, 6, 7, 8). Steps 2–3 (existence, tenant) are
// server-only. This only gives early, friendly errors — the backend is the authority, and a
// queued action can still be rejected later if server state moved on.
export interface RosterDraft {
  type: RosterChange;
  fromSquadId: string;
  toSquadId: string | null;
  effectiveDate: string;
  loanEndDate: string | null;
  reason: string;
}

export interface RosterContext {
  player: { squadId: string; position: string; onLoan?: boolean };
  transferWindow?: { open: string; close: string }; // inclusive
  destinationCount?: number;
  maxSquadSize?: number;
  fromSquadPositionCounts?: Record<string, number>;
  requiredPositions?: Record<string, number>;
}

export type RosterIssue = { code: string; field?: 'toSquadId' | 'effectiveDate' | 'loanEndDate' | 'reason'; message: string };

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateRosterDraft(d: RosterDraft, c: RosterContext): RosterIssue | null {
  // 1. schema / dates
  if (!isValidDate(d.effectiveDate)) return { code: 'VALIDATION_ERROR', field: 'effectiveDate', message: 'Enter the date as YYYY-MM-DD.' };
  if (d.type !== 'release' && !d.toSquadId) return { code: 'VALIDATION_ERROR', field: 'toSquadId', message: 'Choose the destination squad.' };
  if (d.type === 'loan') {
    if (!d.loanEndDate || !isValidDate(d.loanEndDate)) return { code: 'VALIDATION_ERROR', field: 'loanEndDate', message: 'Enter the loan end date as YYYY-MM-DD.' };
    if (d.loanEndDate <= d.effectiveDate) return { code: 'VALIDATION_ERROR', field: 'loanEndDate', message: 'The loan must end after it starts.' };
  }
  if (d.reason.trim().length === 0) return { code: 'VALIDATION_ERROR', field: 'reason', message: 'Add a short reason.' };
  // 4. player is in the stated from-squad
  if (c.player.squadId !== d.fromSquadId) return { code: 'NOT_IN_SQUAD', message: "The player isn't in that squad." };
  // 5. transfer window (release allowed any date)
  if (d.type !== 'release' && c.transferWindow && (d.effectiveDate < c.transferWindow.open || d.effectiveDate > c.transferWindow.close)) {
    return { code: 'TRANSFER_WINDOW_CLOSED', field: 'effectiveDate', message: `The transfer window runs ${c.transferWindow.open} to ${c.transferWindow.close}.` };
  }
  // 6. loaned players cannot be moved
  if (c.player.onLoan) return { code: 'PLAYER_ON_LOAN', message: 'The player is currently on loan.' };
  // 7. destination capacity
  if (d.type !== 'release' && c.maxSquadSize != null && c.destinationCount != null && c.destinationCount + 1 > c.maxSquadSize) {
    return { code: 'SQUAD_FULL', field: 'toSquadId', message: 'That squad is already full.' };
  }
  // 8. the from squad must still meet the minimum for this player's position
  const need = c.requiredPositions?.[c.player.position];
  const have = c.fromSquadPositionCounts?.[c.player.position];
  if (need != null && have != null && have - 1 < need) return { code: 'MIN_POSITION_VIOLATION', message: `The squad must keep at least ${need} ${c.player.position}.` };
  return null;
}
