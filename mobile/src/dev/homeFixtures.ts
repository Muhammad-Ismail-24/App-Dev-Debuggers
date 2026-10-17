// DEVELOPMENT FIXTURES — invented sample data, not API responses. Replace by implementing
// HomeRepository against the backend. Four sports are mixed on purpose so the UI never
// leans on one scoring format.
import type { ClubSummary, HomeData, MatchSummary, StandingRow, TeamRef } from '../types/league';

const t = (id: string, name: string, shortName: string, color?: string): TeamRef => ({ id, name, shortName, color });

const lions = t('c-lions', 'Islamabad Lions', 'ISL', '#C98A1B');
const falcons = t('c-falcons', 'Lahore Falcons', 'LHF', '#1F4E9C');
const titans = t('c-titans', 'Karachi Titans', 'KRT', '#7A2E8E');
const rangers = t('c-rangers', 'Peshawar Rangers Football Club', 'PSR', '#1E7A4F');
const sharks = t('c-sharks', 'Quetta Sharks', 'QTS', '#127C9A');
const kings = t('c-kings', 'Multan Kings', 'MLK', '#B33A3A');

// Relative to "now" so the dev data always looks current.
const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const matches: MatchSummary[] = [
  {
    id: 'm-1', competitionId: 'football-premier', competitionName: 'Premier League', sportLabel: 'Football',
    status: 'live', statusDetail: "67'", startsAt: at(-1.2), venue: 'Jinnah Stadium',
    home: { team: lions, scoreDisplay: '2' }, away: { team: falcons, scoreDisplay: '1' },
  },
  {
    id: 'm-2', competitionId: 'cricket-t20', competitionName: 'T20 Cup', sportLabel: 'Cricket',
    status: 'live', statusDetail: 'Over 14.2', startsAt: at(-2.5), venue: 'Gaddafi Ground',
    home: { team: titans, scoreDisplay: '112/3' }, away: { team: rangers, scoreDisplay: '187/6' },
  },
  {
    id: 'm-3', competitionId: 'basketball-city', competitionName: 'City Basketball', sportLabel: 'Basketball',
    status: 'scheduled', startsAt: at(3), venue: 'Arena One',
    home: { team: sharks }, away: { team: kings },
  },
];

const upcoming: MatchSummary[] = [
  { id: 'm-4', competitionId: 'football-premier', competitionName: 'Premier League', sportLabel: 'Football', status: 'scheduled', startsAt: at(5), venue: 'Jinnah Stadium', home: { team: rangers }, away: { team: titans } },
  { id: 'm-3', competitionId: 'basketball-city', competitionName: 'City Basketball', sportLabel: 'Basketball', status: 'scheduled', startsAt: at(3), venue: 'Arena One', home: { team: sharks }, away: { team: kings } },
  { id: 'm-5', competitionId: 'cricket-t20', competitionName: 'T20 Cup', sportLabel: 'Cricket', status: 'scheduled', startsAt: at(27), venue: 'Gaddafi Ground', home: { team: falcons }, away: { team: lions } },
  { id: 'm-6', competitionId: 'football-premier', competitionName: 'Premier League', sportLabel: 'Football', status: 'scheduled', startsAt: at(52), home: { team: kings }, away: { team: sharks } },
];

const row = (team: TeamRef, rank: number, played: number, points: number, q?: StandingRow['qualification']): StandingRow => ({ team, rank, played, points, qualification: q });

const clubs: ClubSummary[] = [lions, falcons, titans, rangers, sharks, kings].map((c) => ({
  id: c.id, name: c.name, shortName: c.shortName, color: c.color,
  venue: c.id === 'c-lions' ? 'Jinnah Stadium' : undefined,
}));

export const devHomeData: HomeData = {
  competitions: [
    { id: 'football-premier', name: 'Premier League' },
    { id: 'cricket-t20', name: 'T20 Cup' },
    { id: 'basketball-city', name: 'City Basketball' },
  ],
  featured: matches,
  upcoming,
  standings: [
    {
      competitionId: 'football-premier', competitionName: 'Premier League',
      rows: [row(lions, 1, 10, 24, 'qualified'), row(falcons, 2, 10, 21, 'qualified'), row(rangers, 3, 10, 17, 'playoff'), row(titans, 4, 10, 12), row(kings, 5, 10, 8, 'out')],
    },
    {
      competitionId: 'cricket-t20', competitionName: 'T20 Cup',
      rows: [row(titans, 1, 8, 12, 'qualified'), row(rangers, 2, 8, 10, 'qualified'), row(falcons, 3, 8, 8, 'playoff'), row(lions, 4, 8, 4)],
    },
  ],
  clubs,
};

export const devHomeEmpty: HomeData = { competitions: [], featured: [], upcoming: [], standings: [], clubs: [] };
