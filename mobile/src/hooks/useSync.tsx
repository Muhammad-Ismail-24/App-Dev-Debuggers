import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { postEvent, postOfflineSync, postTransfer, type EventBody, type EventResponse, type TransferBody, type TransferResponse } from '../api/audit';
import { ApiError } from '../api/client';
import { submitAction, type SubmitOutcome } from '../services/submitAction';
import { migrate } from '../storage/database';
import { openExpoSqliteDriver } from '../storage/expoSqliteDriver';
import { LocalStore } from '../storage/localStore';
import { OfflineQueueRepository, type QueueItem } from '../storage/offlineQueueRepository';
import type { SqlDriver } from '../storage/sqlDriver';
import { useConnectivity } from '../sync/connectivity';
import { explainErrorCode } from '../sync/errorMessages';
import { SyncManager, type SyncOutcome } from '../sync/syncManager';

interface Counts {
  pending: number; syncing: number; failed: number; rejected: number; synced: number;
}

interface SyncValue {
  ready: boolean;
  // Set when the on-device database could not be opened. Offline actions cannot be saved then,
  // and the UI says so rather than pretending to queue.
  storageError: string | null;
  online: boolean;
  syncing: boolean;
  items: QueueItem[];
  counts: Counts;
  // pending + failed: saved on the device but not confirmed by the server.
  unsyncedCount: number;
  lastSyncAt: string | null;
  lastOutcome: SyncOutcome | null;
  store: LocalStore | null;
  syncNow: () => Promise<SyncOutcome | null>;
  clearResolved: () => Promise<void>;
  dismiss: (actionId: string) => Promise<void>;
  submitScoreEvent: (body: EventBody, summary: string) => Promise<SubmitOutcome<EventResponse>>;
  submitRosterTransfer: (body: TransferBody, summary: string) => Promise<SubmitOutcome<TransferResponse>>;
}

const EMPTY: Counts = { pending: 0, syncing: 0, failed: 0, rejected: 0, synced: 0 };
const SyncContext = createContext<SyncValue | null>(null);

const describeSyncError = (e: unknown) => (e instanceof ApiError ? (e.status === 0 ? explainErrorCode(e.code) : `${explainErrorCode(e.code)}`) : e instanceof Error ? e.message : 'Sync failed.');

interface Services { queue: OfflineQueueRepository; store: LocalStore; manager: SyncManager }

// App-wide owner of the persistent offline queue (SQLite) and its sync loop.
export function SyncProvider({ children, openDriver = openExpoSqliteDriver }: { children: ReactNode; openDriver?: () => Promise<SqlDriver> }) {
  const online = useConnectivity() === 'online';
  const [svc, setSvc] = useState<Services | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<SyncOutcome | null>(null);

  // Open + migrate the database once; recover anything that was mid-flight when the app died.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const db = await openDriver();
        await migrate(db);
        const queue = new OfflineQueueRepository(db);
        const store = new LocalStore(db);
        await queue.recoverInterrupted();
        const manager = new SyncManager(queue, store, postOfflineSync, describeSyncError);
        if (alive) setSvc({ queue, store, manager });
      } catch (e) {
        if (alive) setStorageError(e instanceof Error ? e.message : 'The on-device database could not be opened.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [openDriver]);

  const refresh = useCallback(async () => {
    if (!svc) return;
    setItems(await svc.queue.list());
    setLastSyncAt(await svc.store.getLastSyncAt());
  }, [svc]);

  useEffect(() => {
    if (!svc) return;
    void refresh();
    const offQueue = svc.queue.subscribe(() => void refresh());
    const offSync = svc.manager.subscribe(() => setSyncing(svc.manager.syncing));
    return () => {
      offQueue();
      offSync();
    };
  }, [svc, refresh]);

  const counts = useMemo<Counts>(() => items.reduce((c, i) => ({ ...c, [i.status]: c[i.status] + 1 }), { ...EMPTY }), [items]);
  const unsyncedCount = counts.pending + counts.failed + counts.syncing;

  const syncNow = useCallback(async () => {
    if (!svc) return null;
    const out = await svc.manager.syncNow();
    setLastOutcome(out);
    await refresh();
    return out;
  }, [svc, refresh]);

  // Auto-sync triggers: becoming reachable, app returning to foreground, and a slow retry tick.
  const unsyncedRef = useRef(unsyncedCount);
  unsyncedRef.current = unsyncedCount;
  useEffect(() => {
    if (online && svc && unsyncedRef.current > 0) void syncNow();
  }, [online, svc, syncNow]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && online && unsyncedRef.current > 0) void syncNow();
    });
    const timer = setInterval(() => {
      if (online && unsyncedRef.current > 0) void syncNow();
    }, 30_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [online, syncNow]);

  const submitScoreEvent = useCallback(
    async (body: EventBody, summary: string): Promise<SubmitOutcome<EventResponse>> => {
      const out = await submitAction({
        online,
        send: () => postEvent(body),
        enqueue: async () => {
          if (!svc) throw new Error(storageError ?? 'Offline storage is not ready yet.');
          const baseVersion = await svc.store.getVersion('match', body.match_id);
          return (await svc.queue.enqueue({ type: 'score_event', payload: body, baseVersion, summary, entityId: body.match_id, dedupeKey: body.event_id })).item;
        },
      });
      if (out.kind === 'sent' && svc) await svc.store.setVersion('match', body.match_id, out.response.match_version);
      return out;
    },
    [online, svc, storageError],
  );

  const submitRosterTransfer = useCallback(
    async (body: TransferBody, summary: string): Promise<SubmitOutcome<TransferResponse>> => {
      const out = await submitAction({
        online,
        send: () => postTransfer(body),
        enqueue: async () => {
          if (!svc) throw new Error(storageError ?? 'Offline storage is not ready yet.');
          const baseVersion = await svc.store.getVersion('player', body.player_id);
          return (await svc.queue.enqueue({ type: 'roster_transfer', payload: body, baseVersion, summary, entityId: body.player_id, dedupeKey: body.request_id })).item;
        },
      });
      if (out.kind === 'sent' && svc) await svc.store.setVersion('player', body.player_id, (await svc.store.getVersion('player', body.player_id)) + 1);
      return out;
    },
    [online, svc, storageError],
  );

  const value = useMemo<SyncValue>(
    () => ({
      ready: svc !== null, storageError, online, syncing, items, counts, unsyncedCount, lastSyncAt, lastOutcome,
      store: svc?.store ?? null,
      syncNow,
      clearResolved: async () => void (await svc?.queue.clearResolved()),
      dismiss: async (id) => void (await svc?.queue.dismiss(id)),
      submitScoreEvent, submitRosterTransfer,
    }),
    [svc, storageError, online, syncing, items, counts, unsyncedCount, lastSyncAt, lastOutcome, syncNow, submitScoreEvent, submitRosterTransfer],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  return ctx;
}
