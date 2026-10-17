import { isoSeconds } from '../utils/ids';
import { newId } from '../utils/ids';
import type { SqlDriver } from './sqlDriver';

// Small durable key/value + JSON cache on the same SQLite database as the queue.
export class LocalStore {
  constructor(private readonly db: SqlDriver) {}

  async getKv(key: string): Promise<string | null> {
    return (await this.db.first<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]))?.value ?? null;
  }

  async setKv(key: string, value: string): Promise<void> {
    await this.db.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  // Stable per-install id sent as `device_id`; server dedupes on (device_id, action_id).
  async getDeviceId(): Promise<string> {
    const existing = await this.getKv('device_id');
    if (existing) return existing;
    const id = newId('dev');
    await this.setKv('device_id', id);
    return id;
  }

  async getLastSyncAt(): Promise<string | null> {
    return this.getKv('last_sync_at');
  }

  // Versions the device last saw (match → event count, player → audit entries) for base_version.
  async getVersion(kind: 'match' | 'player', id: string): Promise<number> {
    const v = await this.getKv(`version:${kind}:${id}`);
    return v === null ? 0 : Number(v);
  }

  async setVersion(kind: 'match' | 'player', id: string, version: number): Promise<void> {
    await this.setKv(`version:${kind}:${id}`, String(version));
  }

  async putCache(key: string, value: unknown): Promise<void> {
    await this.db.run(
      'INSERT INTO cache (key, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
      [key, JSON.stringify(value), isoSeconds()],
    );
  }

  async getCache<T>(key: string): Promise<{ value: T; updatedAt: string } | null> {
    const row = await this.db.first<{ json: string; updated_at: string }>('SELECT json, updated_at FROM cache WHERE key = ?', [key]);
    return row ? { value: JSON.parse(row.json) as T, updatedAt: row.updated_at } : null;
  }
}
