// DEVELOPMENT FIXTURES — invented sample data, not API responses. Built on the Home fixtures so
// ids line up across screens. Replace by implementing SportsRepository against the backend.
import type {
  ClubProfileData, ClubSummary, FixturesData, MatchDetailData, MatchEvent, MatchSummary, StandingRow,
  StandingsData, TeamRef,
} from '../types/league';
import { devHomeData } from './homeFixtures';

const clubs = devHomeData.clubs;
export const teamOf = (id: string): TeamRef => {
  const c = clubs.find((x) => x.id === id)!;
  return { id: c.id, name: c.name, shortName: c.shortName, color: c.color };
};
const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const completed: MatchSummary[] = [
  { id: 'm-7', competitionId: 'football-premier', competitionName: 'Premier League', sportLabel: 'Football', status: 'final', startsAt: at(-26), venue: 'Jinnah Stadium', home: { team: teamOf('c-falcons'), scoreDisplay: '0' }, away: { team: teamOf('c-rangers'), scoreDisplay: '3' } },
  { id: 'm-8', competitionId: 'cricket-t20', competitionName: 'T20 Cup', sportLabel: 'Cricket', status: 'final', statusDetail: 'Titans won by 6 wickets', startsAt: at(-50), venue: 'Gaddafi Ground', home: { team: teamOf('c-lions'), scoreDisplay: '141/8' }, away: { team: teamOf('c-titans'), scoreDisplay: '142/4' } },
  { id: 'm-9', competitionId: 'basketball-city', competitionName: 'City Basketball', sportLabel: 'Basketball', status: 'final', startsAt: at(-74), venue: 'Arena One', home: { team: teamOf('c-kings'), scoreDisplay: '88' }, away: { team: teamOf('c-sharks'), scoreDisplay: '94' } },
];

const byId = new Map<string, MatchSummary>();
[...devHomeData.featured, ...devHomeData.upcoming, ...completed].forEach((m) => byId.set(m.id, m));
export const allMatches: MatchSummary[] = [...byId.values()].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));

export const devFixtures: FixturesData = { competitions: devHomeData.competitions, matches: allMatches };

const row = (id: string, rank: number, played: number, points: number, record: string, diff: string, q?: StandingRow['qualification']): StandingRow =>
  ({ team: teamOf(id), rank, played, points, record, diffDisplay: diff, qualification: q });

export const devStandings: StandingsData = {
  competitions: devHomeData.competitions,
  tables: [
    {
      competitionId: 'football-premier', competitionName: 'Premier League', recordLabel: 'W-D-L', diffLabel: 'GD',
      rows: [row('c-lions', 1, 10, 24, '7-3-0', '+14', 'qualified'), row('c-falcons', 2, 10, 21, '6-3-1', '+9', 'qualified'), row('c-rangers', 3, 10, 17, '5-2-3', '+4', 'playoff'), row('c-titans', 4, 10, 12, '3-3-4', '-1'), row('c-kings', 5, 10, 8, '2-2-6', '-12', 'out')],
      matches: allMatches.filter((m) => m.competitionId === 'football-premier'),
    },
    {
      competitionId: 'cricket-t20', competitionName: 'T20 Cup', recordLabel: 'W-L', diffLabel: 'NRR',
      rows: [row('c-titans', 1, 8, 12, '6-2', '+0.84', 'qualified'), row('c-rangers', 2, 8, 10, '5-3', '+0.41', 'qualified'), row('c-falcons', 3, 8, 8, '4-4', '-0.05', 'playoff'), row('c-lions', 4, 8, 4, '2-6', '-1.12')],
      matches: allMatches.filter((m) => m.competitionId === 'cricket-t20'),
    },
    {
      competitionId: 'basketball-city', competitionName: 'City Basketball', recordLabel: 'W-L', diffLabel: 'PD',
      rows: [row('c-sharks', 1, 6, 10, '5-1', '+41', 'qualified'), row('c-kings', 2, 6, 6, '3-3', '-8')],
      matches: allMatches.filter((m) => m.competitionId === 'basketball-city'),
    },
  ],
};

const ev = (id: string, kind: string, label: string, timeLabel: string, side: 'home' | 'away', actor?: string, symbol?: string, extra: Partial<MatchEvent> = {}): MatchEvent =>
  ({ id, kind, label, timeLabel, side, actor, symbol, ...extra });

const events: Record<string, MatchEvent[]> = {
  'm-1': [
    ev('e1', 'goal', 'Goal', "67'", 'home', 'A. Raza', 'soccerball'),
    ev('e2', 'card', 'Yellow card', "58'", 'away', 'M. Bashir', 'rectangle.portrait.fill'),
    ev('e3', 'goal', 'Goal', "41'", 'away', 'K. Ali', 'soccerball'),
    ev('e4', 'goal', 'Goal', "23'", 'home', 'S. Khan', 'soccerball', { corrected: true, correctedBy: 'Ruled offside' }),
    ev('e5', 'goal', 'Goal', "19'", 'home', 'S. Khan', 'soccerball'),
  ],
  'm-2': [
    ev('e6', 'wicket', 'Wicket', 'Over 14.2', 'home', 'Bowled · H. Iqbal', 'xmark.circle'),
    ev('e7', 'six', 'Six', 'Over 13.5', 'away', 'T. Shah', 'flame'),
  ],
  'm-7': [
    ev('e8', 'goal', 'Goal', "88'", 'away', 'J. Ahmed', 'soccerball'),
    ev('e9', 'goal', 'Goal', "52'", 'away', 'J. Ahmed', 'soccerball'),
    ev('e10', 'goal', 'Goal', "17'", 'away', 'F. Malik', 'soccerball'),
  ],
};

export function devMatchDetail(matchId: string): MatchDetailData | undefined {
  const match = byId.get(matchId);
  if (!match) return undefined;
  return {
    match,
    events: events[matchId] ?? [],
    pinned: matchId === 'm-1' || matchId === 'm-4'
      ? { id: 'prod-jersey-001', name: 'Islamabad Lions Home Jersey', priceDisplay: 'Rs 4,500', stockNote: 'Only 1 left in M' }
      : undefined,
    info: [
      { label: 'Competition', value: match.competitionName },
      ...(match.sportLabel ? [{ label: 'Sport', value: match.sportLabel }] : []),
      ...(match.venue ? [{ label: 'Venue', value: match.venue }] : []),
      { label: 'Kickoff', value: new Date(match.startsAt).toLocaleString() },
    ],
    ticker: allMatches.filter((m) => m.competitionId === match.competitionId || m.status === 'live').slice(0, 8),
  };
}

const positions = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
const first = ['Ali', 'Hamza', 'Bilal', 'Usman', 'Faisal', 'Zain', 'Omar', 'Hasan'];
const last = ['Raza', 'Khan', 'Malik', 'Shah', 'Iqbal', 'Ahmed', 'Bashir', 'Sheikh'];

export function devClubProfile(clubId: string): ClubProfileData | undefined {
  const club: ClubSummary | undefined = clubs.find((c) => c.id === clubId);
  if (!club) return undefined;
  const seed = clubId.length;
  const today = new Date();
  const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  return {
    club,
    rosterContext: {
      leagueId: 'lg-dev',
      squadId: clubId,
      otherSquads: clubs.filter((c) => c.id !== clubId).map((c) => ({ squadId: c.id, name: c.name, playerCount: 12 })),
      maxSquadSize: 15,
      requiredPositions: { Goalkeeper: 1 },
      transferWindow: { open: day(-30), close: day(30) },
    },
    venue: { name: club.venue ?? `${club.name.split(' ')[0]} Sports Complex`, address: 'Sector G-5, Islamabad', capacity: '18,000' },
    staff: [
      { id: 's1', name: `${first[seed % 8]} ${last[(seed + 3) % 8]}`, title: 'Head coach' },
      { id: 's2', name: `${first[(seed + 2) % 8]} ${last[(seed + 5) % 8]}`, title: 'Assistant coach' },
      { id: 's3', name: `${first[(seed + 4) % 8]} ${last[(seed + 1) % 8]}`, title: 'Team manager' },
    ],
    roster: Array.from({ length: 12 }, (_, i) => ({
      id: `${clubId}-p${i}`,
      name: `${first[(i + seed) % 8]} ${last[(i * 3 + seed) % 8]}`,
      position: positions[Math.min(3, Math.floor(i / 3))],
      number: String(i + 1),
      squadId: clubId,
      roleChip: i === 5 ? 'Captain' : i === 8 ? 'Vice' : i < 8 ? 'Starter' : 'Sub',
    })),
    fixtures: allMatches.filter((m) => m.home.team.id === clubId || m.away.team.id === clubId),
  };
}
