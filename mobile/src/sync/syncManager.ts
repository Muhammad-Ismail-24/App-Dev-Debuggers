import type { OfflineSyncResponse } from '../api/audit';
import type { LocalStore } from '../storage/localStore';
import { toWireAction, type OfflineQueueRepository, type QueueItem } from '../storage/offlineQueueRepository';
import { isoSeconds } from '../utils/ids';

export interface SyncOutcome {
  sent: number;
  synced: number;
  rejected: number;
  failed: number; // not confirmed by the server; still queued
  error?: string;
}

export type SyncApi = (deviceId: string, actions: ReturnType<typeof toWireAction>[]) => Promise<OfflineSyncResponse>;

// Sends queued actions to POST /audit/v1/offline-sync in queue order, one request at a time.
// Truth rules: an action becomes "synced" only from a result row in a response that was
// committed locally; any transport/parse problem leaves it queued as "failed".
export class SyncManager {
  private inFlight: Promise<SyncOutcome> | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly queue: OfflineQueueRepository,
    private readonly store: LocalStore,
    private readonly api: SyncApi,
    private readonly describeError: (e: unknown) => string,
  ) {}

  get syncing(): boolean {
    return this.inFlight !== null;
  }
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  // Single-flight: concurrent callers (reconnect + button + timer) share one run, so the same
  // action can never be in two requests at once.
  syncNow(): Promise<SyncOutcome> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
      this.emit();
    });
    this.emit();
    return this.inFlight;
  }

  private async run(): Promise<SyncOutcome> {
    const total: SyncOutcome = { sent: 0, synced: 0, rejected: 0, failed: 0 };
    const deviceId = await this.store.getDeviceId();
    // Loop only while a full batch (100) was processed, to drain bigger queues.
    for (;;) {
      const batch = await this.queue.takeBatch();
      if (batch.length === 0) break;
      total.sent += batch.length;

      let response: OfflineSyncResponse;
      try {
        response = await this.api(deviceId, batch.map(toWireAction));
        if (!response || !Array.isArray(response.results)) throw new Error('Unexpected response from the server.');
      } catch (e) {
        const message = this.describeError(e);
        await this.queue.markFailed(batch.map((b) => b.actionId), message);
        total.failed += batch.length;
        total.error = message;
        return total;
      }

      const tally = await this.queue.applyResults(batch, response.results);
      total.synced += tally.synced;
      total.rejected += tally.rejected;
      total.failed += tally.unanswered;
      await this.recordVersions(batch, response);
      // Only after the results are durably committed do we advertise a sync time.
      await this.store.setKv('last_sync_at', isoSeconds());
      if (batch.length < 100) break;
    }
    return total;
  }

  private async recordVersions(batch: QueueItem[], response: OfflineSyncResponse) {
    for (const r of response.results) {
      const item = batch.find((b) => b.actionId === r.action_id);
      if (!item || (r.status !== 'applied' && r.status !== 'duplicate')) continue;
      await this.store.setVersion(item.type === 'score_event' ? 'match' : 'player', item.entityId, r.server_version);
    }
  }
}
