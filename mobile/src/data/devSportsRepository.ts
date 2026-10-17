// DEVELOPMENT ONLY. Typed fixtures behind the real SportsRepository interface.
// EXPO_PUBLIC_DEV_SPORTS_SCENARIO=ready|empty|error|slow (default ready).
import { devClubProfile, devFixtures, devMatchDetail, devStandings } from '../dev/sportsFixtures';
import { devHomeData } from '../dev/homeFixtures';
import { NotFoundError, type SportsRepository } from './sportsRepository';

type Scenario = 'ready' | 'empty' | 'error' | 'slow';
const scenario = (process.env.EXPO_PUBLIC_DEV_SPORTS_SCENARIO as Scenario | undefined) ?? 'ready';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function gate() {
  await wait(scenario === 'slow' ? 3500 : 600);
  if (scenario === 'error') throw new Error("Couldn't load this right now.");
}

export const devSportsRepository: SportsRepository = {
  kind: 'dev-fixtures',
  async loadFixtures() {
    await gate();
    return scenario === 'empty' ? { competitions: [], matches: [] } : devFixtures;
  },
  async loadMatch(_s, id) {
    await gate();
    const d = devMatchDetail(id);
    if (!d) throw new NotFoundError('Match');
    return d;
  },
  async loadStandings() {
    await gate();
    return scenario === 'empty' ? { competitions: [], tables: [] } : devStandings;
  },
  async loadClub(_s, id) {
    await gate();
    const d = devClubProfile(id);
    if (!d) throw new NotFoundError('Club');
    return d;
  },
  async listClubs() {
    await gate();
    return scenario === 'empty' ? [] : devHomeData.clubs;
  },
};
