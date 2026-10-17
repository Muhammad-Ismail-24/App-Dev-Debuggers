import { useCallback } from 'react';
import type { HomeRepository } from '../data/homeRepository';
import type { HomeData } from '../types/league';
import type { Session } from '../types/session';
import { useLoad } from './useLoad';

export type { LoadState as HomeState } from './useLoad';

// Home's loader is the shared useLoad (skeleton on first load, refresh keeps content).
export function useHomeData(repository: HomeRepository, session: Session) {
  const load = useCallback(() => repository.load(session), [repository, session]);
  return useLoad<HomeData>(load);
}
