import type { EventBody, OfflineAction, OfflineActionType, OfflineSyncResult, TransferBody } from '../api/audit';
import { newId, isoSeconds } from '../utils/ids';
import type { SqlDriver } from './sqlDriver';

// Client-side lifecycle. "synced" is only ever written from a server result row.
//   pending  – saved on device, not yet sent
//   syncing  – included in an in-flight request
//   synced   – server answered applied / duplicate (already on the server)
//   rejected – server answered rejected (final: server wins); reason in errorCode
//   failed   – the request itself failed (offline, timeout, 5xx); still queued, will be re-sent
export type QueueStatus = 'pending' | 'syncing' | 'synced' | 'rejected' | 'failed';

export interface QueueItem {
  seq: number;
  actionId: string;
  type: OfflineActionType;
  queuedAt: string;
  baseVersion: number;
  payload: EventBody | TransferBody;
  summary: string; // human text, e.g. "Goal for Team A"
  entityId: string; // match_id or player_id
  dedupeKey: string; // event_id / request_id
  status: QueueStatus;
  attempts: number;
  resolution: OfflineSyncResult['resolution'] | null;
  errorCode: string | null;
  serverVersion: number | null;
  signature: string | null;
  processedOrder: number | null;
  lastError: string | null;
  resolvedAt: string | null;
}

export interface EnqueueInput {
  type: OfflineActionType;
  payload: EventBody | TransferBody;
  baseVersion: number;
  summary: string;
  entityId: string;
  dedupeKey: string;
}

interface Row {
  seq: number; action_id: string; dedupe_key: string; type: OfflineActionType; queued_at: string; base_version: number;
  payload_json: string; summary: string; entity_id: string; status: QueueStatus; attempts: number; resolution: OfflineSyncResult['resolution'] | null;
  error_code: string | null; server_version: number | null; signature: string | null; processed_order: number | null;
  last_error: string | null; resolved_at: string | null;
}

const toItem = (r: Row): QueueItem => ({
  seq: r.seq, actionId: r.action_id, type: r.type, queuedAt: r.queued_at, baseVersion: r.base_version,
  payload: JSON.parse(r.payload_json), summary: r.summary, entityId: r.entity_id, dedupeKey: r.dedupe_key,
  status: r.status, attempts: r.attempts, resolution: r.resolution, errorCode: r.error_code, serverVersion: r.server_version,
  signature: r.signature, processedOrder: r.processed_order, lastError: r.last_error, resolvedAt: r.resolved_at,
});

// The exact §5.14 envelope; nothing else leaves the device.
export const toWireAction = (i: QueueItem): OfflineAction => ({
  action_id: i.actionId, type: i.type, queued_at: i.queuedAt, base_version: i.baseVersion, payload: i.payload,
});

export const MAX_ACTIONS_PER_REQUEST = 100;

export class OfflineQueueRepository {
  private listeners = new Set<() => void>();
  // The driver's transactions are not exclusive on-device, so every mutation runs one at a time.
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: SqlDriver) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((fn) => fn());
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  // Call once at startup: a request that was in flight when the app died has an unknown outcome.
  // Re-sending is safe because the server dedupes on (device_id, action_id) and answers duplicate.
  recoverInterrupted(): Promise<number> {
    return this.serial(async () => {
      const r = await this.db.run("UPDATE offline_queue SET status = 'pending' WHERE status = 'syncing'");
      if (r.changes) this.emit();
      return r.changes;
    });
  }

  // Idempotent on dedupeKey: re-enqueueing the same logical action returns the stored item.
  enqueue(input: EnqueueInput): Promise<{ item: QueueItem; created: boolean }> {
    return this.serial(async () => {
      const existing = await this.db.first<Row>('SELECT * FROM offline_queue WHERE dedupe_key = ?', [input.dedupeKey]);
      if (existing) return { item: toItem(existing), created: false };
      // queued_at never goes backwards (a clock change must not reorder actions).
      const last = await this.db.first<{ queued_at: string }>('SELECT queued_at FROM offline_queue ORDER BY seq DESC LIMIT 1');
      const now = isoSeconds();
      const queuedAt = last && last.queued_at > now ? last.queued_at : now;
      const actionId = newId('act');
      await this.db.run(
        `INSERT INTO offline_queue (action_id, dedupe_key, type, queued_at, base_version, payload_json, summary, entity_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [actionId, input.dedupeKey, input.type, queuedAt, input.baseVersion, JSON.stringify(input.payload), input.summary, input.entityId],
      );
      const row = (await this.db.first<Row>('SELECT * FROM offline_queue WHERE action_id = ?', [actionId]))!;
      this.emit();
      return { item: toItem(row), created: true };
    });
  }

  async list(): Promise<QueueItem[]> {
    return (await this.db.all<Row>('SELECT * FROM offline_queue ORDER BY seq ASC')).map(toItem);
  }

  async counts(): Promise<{ pending: number; failed: number; syncing: number; rejected: number; synced: number }> {
    const rows = await this.db.all<{ status: QueueStatus; n: number }>('SELECT status, COUNT(*) AS n FROM offline_queue GROUP BY status');
    const c = { pending: 0, failed: 0, syncing: 0, rejected: 0, synced: 0 };
    rows.forEach((r) => { c[r.status] = r.n; });
    return c;
  }

  // Claims up to 100 not-yet-synced items in queue order and marks them syncing.
  takeBatch(): Promise<QueueItem[]> {
    return this.serial(async () => {
      const rows = await this.db.all<Row>(
        "SELECT * FROM offline_queue WHERE status IN ('pending', 'failed') ORDER BY seq ASC LIMIT ?",
        [MAX_ACTIONS_PER_REQUEST],
      );
      if (rows.length === 0) return [];
      await this.db.transaction(async () => {
        for (const r of rows) await this.db.run("UPDATE offline_queue SET status = 'syncing', attempts = attempts + 1 WHERE seq = ?", [r.seq]);
      });
      this.emit();
      return rows.map((r) => ({ ...toItem(r), status: 'syncing' as const, attempts: r.attempts + 1 }));
    });
  }

  // The request never produced a usable answer: keep everything queued, in order.
  markFailed(actionIds: string[], message: string): Promise<void> {
    return this.serial(async () => {
      await this.db.transaction(async () => {
        for (const id of actionIds) await this.db.run("UPDATE offline_queue SET status = 'failed', last_error = ? WHERE action_id = ? AND status = 'syncing'", [message, id]);
      });
      this.emit();
    });
  }

  // Durably records the server's per-action answers in ONE transaction. Items the server did not
  // answer for stay failed — they are never presented as synced.
  applyResults(sent: QueueItem[], results: OfflineSyncResult[]): Promise<{ synced: number; rejected: number; unanswered: number }> {
    return this.serial(async () => {
      const byId = new Map(results.map((r) => [r.action_id, r]));
      const tally = { synced: 0, rejected: 0, unanswered: 0 };
      const now = isoSeconds();
      await this.db.transaction(async () => {
        for (const item of sent) {
          const r = byId.get(item.actionId);
          if (!r) {
            tally.unanswered += 1;
            await this.db.run("UPDATE offline_queue SET status = 'failed', last_error = ? WHERE action_id = ? AND status = 'syncing'", ['The server did not return a result for this action.', item.actionId]);
            continue;
          }
          const ok = r.status === 'applied' || r.status === 'duplicate';
          tally[ok ? 'synced' : 'rejected'] += 1;
          await this.db.run(
            `UPDATE offline_queue SET status = ?, resolution = ?, error_code = ?, server_version = ?, signature = ?,
               processed_order = ?, last_error = NULL, resolved_at = ? WHERE action_id = ? AND status = 'syncing'`,
            [ok ? 'synced' : 'rejected', r.resolution, r.error_code, r.server_version, r.signature, r.processed_order, now, item.actionId],
          );
        }
      });
      this.emit();
      return tally;
    });
  }

  // Removes only items the server has already answered. Pending/failed/syncing are never touched.
  clearResolved(): Promise<number> {
    return this.serial(async () => {
      const r = await this.db.run("DELETE FROM offline_queue WHERE status IN ('synced', 'rejected')");
      this.emit();
      return r.changes;
    });
  }

  dismiss(actionId: string): Promise<void> {
    return this.serial(async () => {
      await this.db.run("DELETE FROM offline_queue WHERE action_id = ? AND status IN ('synced', 'rejected')", [actionId]);
      this.emit();
    });
  }
}
