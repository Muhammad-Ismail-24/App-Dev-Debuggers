import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { unlinkSync, existsSync } from 'node:fs';
const r = new URL('../src', import.meta.url).pathname.replace(/\/$/, '');
const { migrate } = await import(`${r}/storage/database.ts`);
const { LocalStore } = await import(`${r}/storage/localStore.ts`);
const { OfflineQueueRepository, toWireAction } = await import(`${r}/storage/offlineQueueRepository.ts`);
const { SyncManager } = await import(`${r}/sync/syncManager.ts`);

// Real SQLite file via Node's built-in driver, implementing the same SqlDriver interface.
function nodeDriver(file: string) {
  const db = new DatabaseSync(file);
  let depth = 0;
  return {
    close: () => db.close(),
    exec: async (sql: string) => { db.exec(sql); },
    run: async (sql: string, p: any[] = []) => { const x: any = db.prepare(sql).run(...p); return { changes: Number(x.changes), lastInsertRowId: Number(x.lastInsertRowid) }; },
    all: async (sql: string, p: any[] = []) => db.prepare(sql).all(...p) as any[],
    first: async (sql: string, p: any[] = []) => (db.prepare(sql).get(...p) as any) ?? null,
    transaction: async (fn: () => Promise<any>) => {
      if (depth++ === 0) db.exec('BEGIN');
      try { const v = await fn(); if (--depth === 0) db.exec('COMMIT'); return v; } catch (e) { if (--depth === 0) db.exec('ROLLBACK'); throw e; }
    },
  };
}

const file = '' + (await import('node:os')).tmpdir() + '/nascon-queue-test.db';
for (const f of [file, file + '-wal', file + '-shm']) if (existsSync(f)) unlinkSync(f);

const ev = (id: string, match = 'm1') => ({ type: 'score_event' as const, payload: { event_id: id, match_id: match, type: 'score', payload: { team_id: 't1', event_type: 'goal' } }, baseVersion: 3, summary: 'Goal for T1', entityId: match, dedupeKey: id });

// ---- session 1: enqueue offline, then "force-close" ----
let db = nodeDriver(file); await migrate(db);
let store = new LocalStore(db); let q = new OfflineQueueRepository(db);
const a = await q.enqueue(ev('evt-1')); const b = await q.enqueue(ev('evt-2')); const dup = await q.enqueue(ev('evt-1'));
assert.equal(a.created, true); assert.equal(dup.created, false); assert.equal(dup.item.actionId, a.item.actionId, 'duplicate enqueue returns existing');
await q.enqueue({ type: 'roster_transfer', baseVersion: 1, summary: 'Release Ali', entityId: 'p1', dedupeKey: 'tr-1', payload: { request_id: 'tr-1', league_id: 'lg', player_id: 'p1', type: 'release', from_squad_id: 'sq-a', to_squad_id: null, effective_date: '2026-09-30', loan_end_date: null, reason: 'x', requested_by: 'u' } });
const deviceId = await store.getDeviceId();
await store.setVersion('match', 'm1', 3);
db.close();

// ---- session 2: reopen the same file — queue must still be there, in order, with the exact envelope ----
db = nodeDriver(file); await migrate(db); store = new LocalStore(db); q = new OfflineQueueRepository(db);
let items = await q.list();
assert.deepEqual(items.map((i: any) => i.dedupeKey), ['evt-1', 'evt-2', 'tr-1'], 'survives restart, order preserved');
assert.ok(items.every((i: any) => i.status === 'pending'));
assert.equal(await store.getDeviceId(), deviceId, 'device id stable');
assert.equal(await store.getVersion('match', 'm1'), 3);
assert.deepEqual(Object.keys(toWireAction(items[0])).sort(), ['action_id', 'base_version', 'payload', 'queued_at', 'type']);
assert.match(items[0].queuedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
assert.ok(items[0].queuedAt <= items[1].queuedAt && items[1].queuedAt <= items[2].queuedAt);

// ---- sync: offline failure keeps everything queued (never "synced") ----
const calls: any[] = [];
let mode: 'down' | 'ok' | 'partial' | 'slow' = 'down';
const api = async (dev: string, actions: any[]) => {
  calls.push({ dev, ids: actions.map((x) => x.action_id) });
  if (mode === 'down') throw new Error('offline');
  const results = actions.map((x, i) => ({ action_id: x.action_id, status: x.payload.request_id ? 'rejected' : 'applied', resolution: x.payload.request_id ? 'server_wins' : 'appended', error_code: x.payload.request_id ? 'NOT_IN_SQUAD' : null, processed_order: i + 1, server_version: 10 + i, signature: x.payload.request_id ? null : 'ab'.repeat(32) }));
  return { device_id: dev, results: mode === 'partial' ? results.slice(0, 1) : results, summary: { applied: 0, rejected: 0, duplicate: 0 } };
};
const sync = new SyncManager(q, store, api as any, (e: any) => String(e.message));
let out = await sync.syncNow();
assert.equal(out.failed, 3); assert.equal(out.synced, 0);
items = await q.list(); assert.ok(items.every((i: any) => i.status === 'failed' && i.lastError === 'offline'));
assert.equal(await store.getLastSyncAt(), null, 'no sync time without a server answer');

// ---- partial answer: unanswered stays failed, not synced ----
mode = 'partial'; out = await sync.syncNow();
items = await q.list();
assert.deepEqual(items.map((i: any) => i.status), ['synced', 'failed', 'failed']);
assert.equal(items[0].resolution, 'appended'); assert.ok(items[0].signature);

// ---- recovery of an interrupted "syncing" row, then full answer ----
await db.run("UPDATE offline_queue SET status = 'syncing' WHERE seq = 2");
assert.equal(await q.recoverInterrupted(), 1);
mode = 'ok'; out = await sync.syncNow();
items = await q.list();
assert.deepEqual(items.map((i: any) => i.status), ['synced', 'synced', 'rejected']);
assert.equal(items[2].errorCode, 'NOT_IN_SQUAD'); assert.equal(items[2].resolution, 'server_wins');
assert.ok(await store.getLastSyncAt());
assert.equal(await store.getVersion('match', 'm1'), 10, 'server_version recorded for synced action');
// order sent was queue order on every call
for (const c of calls) assert.deepEqual(c.ids, [...c.ids].sort((x: string, y: string) => items.find((i: any) => i.actionId === x)!.seq - items.find((i: any) => i.actionId === y)!.seq));
assert.ok(calls.every((c) => c.dev === deviceId));

// ---- single flight: two concurrent syncs share one request ----
await q.enqueue(ev('evt-3')); const before = calls.length;
const [x, y] = await Promise.all([sync.syncNow(), sync.syncNow()]);
assert.equal(calls.length - before, 1, 'one request for concurrent callers'); assert.equal(x, y);

// ---- clearResolved removes only answered items ----
await q.enqueue(ev('evt-4'));
assert.equal(await q.clearResolved(), 4);
const left = await q.list(); assert.deepEqual(left.map((i: any) => [i.dedupeKey, i.status]), [['evt-4', 'pending']]);
// ---- cache ----
await store.putCache('score:m1', { v: 1 }); assert.deepEqual((await store.getCache<any>('score:m1'))!.value, { v: 1 });
// 100+ batching
for (let i = 0; i < 130; i++) await q.enqueue(ev(`bulk-${i}`));
const n0 = calls.length; mode = 'ok'; await sync.syncNow(); assert.equal(calls.length - n0, 2, 'two requests for 131 actions'); assert.ok(calls.slice(n0).every((c) => c.ids.length <= 100));
db.close();
console.log('queue tests passed');
