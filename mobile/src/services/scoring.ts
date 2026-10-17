import { getScore, type ScoreLogEntry, type ScoreProjection } from '../api/audit';
import type { LocalStore } from '../storage/localStore';
import type { QueueItem } from '../storage/offlineQueueRepository';
import { devSportConfigs } from '../dev/sportConfigs';
import type { SportConfig } from '../types/sport';

export interface LoadedScore {
  projection: ScoreProjection;
  // True when the network failed and this is the last copy the device saw.
  stale: boolean;
  fetchedAt: string | null;
}

// GET /audit/v1/score/{match_id} with a durable read-through cache, so the screen still opens
// offline. A successful read also records the match version used as `base_version` for queued actions.
export async function loadScoreWithCache(store: LocalStore | null, matchId: string): Promise<LoadedScore> {
  try {
    const projection = await getScore(matchId);
    if (store) {
      await store.putCache(`score:${matchId}`, projection);
      await store.setVersion('match', matchId, projection.version);
    }
    return { projection, stale: false, fetchedAt: null };
  } catch (e) {
    const cached = store ? await store.getCache<ScoreProjection>(`score:${matchId}`) : null;
    if (cached) return { projection: cached.value, stale: true, fetchedAt: cached.updatedAt };
    throw e;
  }
}

// Sport config source. No documented read route exists yet, so this is the DEV table; returning
// null makes the screen offer a free-text event-type field instead of guessing event names.
export function loadSportConfig(sportId: string): SportConfig | null {
  return devSportConfigs[sportId] ?? null;
}

const CORRECTABLE = new Set(['score', 'discipline', 'tiebreak_winner']);
export const isCorrectable = (e: ScoreLogEntry) => CORRECTABLE.has(e.type) && !e.compensated;

// Queued-but-unconfirmed events for one match, oldest first, shown above server history.
export const pendingForMatch = (items: QueueItem[], matchId: string) =>
  items.filter((i) => i.type === 'score_event' && i.entityId === matchId && i.status !== 'synced');

export const humanize = (id: string) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
