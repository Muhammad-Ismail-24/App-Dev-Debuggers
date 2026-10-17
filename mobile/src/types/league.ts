// Sport-agnostic display models for Home. Scores are pre-formatted strings so the UI never
// assumes a scoring format (goals, runs/wickets, rounds...). Backend responses are mapped
// into these by a repository; components never see wire-format JSON.
export interface TeamRef {
  id: string;
  name: string;
  shortName: string;
  // Club color (hex). Falls back to a deterministic palette from `id` when absent.
  color?: string;
  logoUri?: string;
}

export type MatchStatus = 'scheduled' | 'live' | 'break' | 'final' | 'postponed';

export interface MatchSide {
  team: TeamRef;
  // Already formatted for display, e.g. "3", "187/4", "13". Absent before kickoff.
  scoreDisplay?: string;
}

export interface MatchSummary {
  id: string;
  competitionId: string;
  competitionName: string;
  // Free text from sport config ("Football", "Cricket"); never switch on it.
  sportLabel?: string;
  status: MatchStatus;
  // Live progress in the sport's own terms: "67'", "Q3 4:12", "Over 14.2", "Map 2".
  statusDetail?: string;
  startsAt: string; // ISO 8601
  venue?: string;
  home: MatchSide;
  away: MatchSide;
}

export type Qualification = 'qualified' | 'playoff' | 'out';

export interface StandingRow {
  team: TeamRef;
  rank: number;
  played: number;
  points: number;
  qualification?: Qualification;
  // Sport-specific extras, pre-formatted: "7-2-1" (W-D-L), "+12", "1.254" (net run rate)...
  record?: string;
  diffDisplay?: string;
}

export interface StandingsPreviewData {
  competitionId: string;
  competitionName: string;
  rows: StandingRow[];
}

// Full standings for one competition (Standings tab).
export interface StandingsTableData extends StandingsPreviewData {
  // Column captions come from the sport config, e.g. { record: "W-D-L", diff: "GD" }.
  recordLabel?: string;
  diffLabel?: string;
  matches: MatchSummary[]; // recent + upcoming matches of this competition
}

export interface StandingsData {
  competitions: CompetitionOption[];
  tables: StandingsTableData[];
}

export interface FixturesData {
  competitions: CompetitionOption[];
  matches: MatchSummary[];
}

// Event kinds come from the sport config; the UI shows `label` verbatim and never switches on `kind`.
export interface MatchEvent {
  id: string;
  kind: string;
  label: string; // "Goal", "Wicket", "Three-pointer"
  timeLabel: string; // "67'", "Over 14.2", "Q3 4:12"
  side: 'home' | 'away';
  actor?: string;
  symbol?: string; // optional SF Symbol name
  // Compensating-event model: a corrected event stays visible, struck through.
  corrected?: boolean;
  correctedBy?: string;
}

export interface PinnedProduct {
  id: string;
  name: string;
  priceDisplay: string; // already formatted ("Rs 4,500")
  stockNote?: string;
}

export interface MatchDetailData {
  match: MatchSummary;
  events: MatchEvent[];
  pinned?: PinnedProduct;
  info: { label: string; value: string }[];
  ticker: MatchSummary[]; // other matches of the round
}

export interface RosterPlayer {
  id: string;
  name: string;
  position: string;
  squadId?: string;
  onLoan?: boolean;
  number?: string;
  roleChip?: string; // "Captain", "Vice", "Starter", "Sub"
}

export interface StaffMember {
  id: string;
  name: string;
  title: string;
}

// What roster management needs to act on a club. All optional: when the backend/read route
// can't supply one, the form simply skips that local pre-check (the server still enforces it).
export interface RosterContextData {
  leagueId: string;
  squadId: string;
  otherSquads: { squadId: string; name: string; playerCount?: number }[];
  maxSquadSize?: number;
  requiredPositions?: Record<string, number>;
  transferWindow?: { open: string; close: string };
}

export interface ClubProfileData {
  club: ClubSummary;
  rosterContext?: RosterContextData;
  venue?: { name: string; address?: string; capacity?: string };
  staff: StaffMember[];
  roster: RosterPlayer[];
  fixtures: MatchSummary[];
}

export interface ClubSummary {
  id: string;
  name: string;
  shortName: string;
  color?: string;
  logoUri?: string;
  venue?: string;
  sportLabel?: string;
}

export interface CompetitionOption {
  id: string;
  name: string;
}

export interface HomeData {
  competitions: CompetitionOption[];
  featured: MatchSummary[];
  upcoming: MatchSummary[];
  standings: StandingsPreviewData[];
  clubs: ClubSummary[];
}
