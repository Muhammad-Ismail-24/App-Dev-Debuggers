// DEVELOPMENT ONLY. Serves typed fixtures through the real HomeRepository interface so
// loading / empty / error states can be exercised. Pick a scenario with
// EXPO_PUBLIC_DEV_HOME_SCENARIO=ready|empty|error|slow (default: ready).
import { devHomeData, devHomeEmpty } from '../dev/homeFixtures';
import { HomeLoadError, type HomeRepository } from './homeRepository';

type Scenario = 'ready' | 'empty' | 'error' | 'slow';
const scenario = (process.env.EXPO_PUBLIC_DEV_HOME_SCENARIO as Scenario | undefined) ?? 'ready';
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const devHomeRepository: HomeRepository = {
  kind: 'dev-fixtures',
  async load() {
    await wait(scenario === 'slow' ? 3500 : 800);
    if (scenario === 'error') throw new HomeLoadError("Couldn't load your dashboard.");
    return scenario === 'empty' ? devHomeEmpty : devHomeData;
  },
};
