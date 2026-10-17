// Plain-language copy for every code in the spec's Appendix B (+ transport failures).
// Raw codes are never shown as the explanation (PDF §8.4: "explained in plain language").
const COPY: Record<string, string> = {
  VALIDATION_ERROR: 'Some details were not accepted by the server. Check them and try again.',
  UNKNOWN_EVENT_TYPE: "That scoring event isn't defined for this sport.",
  INVALID_DISCOUNT_CODE: "That discount code isn't valid.",
  UNAUTHENTICATED: 'Your sign-in has expired. Sign in again.',
  FORBIDDEN: "Your account isn't allowed to do this.",
  PAYMENT_DECLINED: 'The payment was declined.',
  PAYMENT_CAPTURE_FAILED: 'The payment could not be completed.',
  SPORT_NOT_FOUND: "The sport for this match wasn't found.",
  MATCH_NOT_FOUND: "That match wasn't found on the server.",
  LEAGUE_NOT_FOUND: "That league wasn't found on the server.",
  EVENT_NOT_FOUND: "The event you tried to correct wasn't found.",
  PLAYER_NOT_FOUND: "That player wasn't found on the server.",
  SQUAD_NOT_FOUND: "That squad wasn't found on the server.",
  VARIANT_NOT_FOUND: "That product size wasn't found.",
  SPORT_EXISTS: 'That sport already exists.',
  LEAGUE_EXISTS: 'That league already exists.',
  MATCH_EXISTS: 'That match already exists.',
  DUPLICATE_EVENT_ID: 'This event id was already used for a different event.',
  DUPLICATE_ORDER_ID: 'This order id was already used for a different order.',
  ILLEGAL_TRANSITION: "The match can't move to that state right now (for example, it has already started or ended).",
  MATCH_NOT_IN_PROGRESS: "The match isn't in progress, so scores can't be added.",
  TIE_NOT_ALLOWED: "The match can't end level in this sport. Record a tie-break winner first.",
  INNINGS_COMPLETE: "This team's innings is already complete.",
  SERIES_ALREADY_DECIDED: 'The series is already decided.',
  INVALID_COMPENSATION: 'That event was already corrected, or it cannot be corrected.',
  NO_VALID_PAIRING: 'No valid pairing exists for this round.',
  OUT_OF_STOCK: 'That item is out of stock.',
  CROSS_TENANT_TRANSFER: 'Players cannot move between different organisations.',
  NOT_IN_SQUAD: "The player isn't in that squad any more.",
  TRANSFER_WINDOW_CLOSED: 'The transfer window is closed for that date.',
  PLAYER_ON_LOAN: 'The player is currently on loan and cannot be moved.',
  SQUAD_FULL: 'That squad is already full.',
  MIN_POSITION_VIOLATION: 'The move would leave the squad without enough players in that position.',
  INVALID_BASE_VERSION: 'This change was made against a newer version than the server has. Refresh and try again.',
  PAYLOAD_TOO_LARGE: 'The request was too large.',
  RATE_LIMITED: 'Too many requests. Try again in a moment.',
  TIMEOUT: "The server didn't answer in time.",
  NETWORK_ERROR: "Couldn't reach the server.",
};

export function explainErrorCode(code: string | null | undefined): string {
  if (!code) return 'The server rejected this change.';
  return COPY[code] ?? 'The server rejected this change.';
}

// What "server wins" means for the person, in one sentence.
export function explainRejection(code: string | null): string {
  return `${explainErrorCode(code)} The server's version was kept, so this change was not applied.`;
}

export const isTransportErrorCode = (code: string) => code === 'TIMEOUT' || code === 'NETWORK_ERROR';
