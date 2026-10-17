import type { ClubProfileData, ClubSummary, FixturesData, MatchDetailData, StandingsData } from '../types/league';
import type { Session } from '../types/session';

// Seam for the browsing screens (Fixtures, Match Detail, Standings, Club Profile). A backend
// implementation maps documented endpoints into these display models (with the SQLite
// read-through cache); data/devSportsRepository.ts serves typed fixtures. Screens only see this.
export interface SportsRepository {
  readonly kind: 'backend' | 'dev-fixtures';
  loadFixtures(session: Session): Promise<FixturesData>;
  loadMatch(session: Session, matchId: string): Promise<MatchDetailData>;
  loadStandings(session: Session): Promise<StandingsData>;
  loadClub(session: Session, clubId: string): Promise<ClubProfileData>;
  listClubs(session: Session): Promise<ClubSummary[]>;
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}
