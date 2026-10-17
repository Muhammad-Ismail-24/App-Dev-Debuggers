// DEVELOPMENT FIXTURES for sport configs. The Part I PDF documents no read route for a sport's
// config (only POST /audit/v1/sports), so the app cannot fetch event types from the backend yet.
// These mirror the four seeded sports in §5.5; event ids other than `goal` are not given
// verbatim there and are ASSUMED here. If a config is missing, the scoring screen falls back to
// a free-text event-type field instead of guessing.
import type { SportConfig } from '../types/sport';

const e = (id: string, label: string, hint?: string) => ({ id, label, hint });

export const devSportConfigs: Record<string, SportConfig> = {
  football: { sportId: 'football', name: 'Football', scoringModel: 'event', events: [e('goal', 'Goal', '1 point')] },
  basketball: {
    sportId: 'basketball', name: 'Basketball', scoringModel: 'event',
    events: [e('free_throw', 'Free throw', '1 point'), e('two_pointer', 'Two-pointer', '2 points'), e('three_pointer', 'Three-pointer', '3 points')],
  },
  cricket: {
    sportId: 'cricket', name: 'Cricket', scoringModel: 'innings',
    events: [e('dot_ball', 'Dot ball', '0 runs'), e('single', 'Single', '1 run'), e('two', 'Two', '2 runs'), e('four', 'Four', '4 runs'), e('six', 'Six', '6 runs'), e('wide', 'Wide', '1 run, not a legal ball'), e('no_ball', 'No ball', '1 run, not a legal ball'), e('wicket', 'Wicket', 'legal ball')],
  },
  esports: { sportId: 'esports', name: 'Esports', scoringModel: 'round', events: [e('round_win', 'Round win', '1 round')] },
};
