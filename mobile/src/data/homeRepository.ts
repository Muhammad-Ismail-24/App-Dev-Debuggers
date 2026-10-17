import type { HomeData } from '../types/league';
import type { Session } from '../types/session';

// The seam between Home and its data. The backend implementation will map documented API
// responses into HomeData (and read through the SQLite cache); the dev implementation in
// data/devHomeRepository.ts serves typed fixtures. Screens only know this interface.
export interface HomeRepository {
  readonly kind: 'backend' | 'dev-fixtures';
  load(session: Session): Promise<HomeData>;
}

export class HomeLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HomeLoadError';
  }
}
