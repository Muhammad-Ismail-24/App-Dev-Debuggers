import * as SQLite from 'expo-sqlite';
import type { SqlDriver, SqlValue } from './sqlDriver';

// expo-sqlite API as documented for SDK 58 (openDatabaseAsync / execAsync / runAsync /
// getAllAsync / getFirstAsync / withTransactionAsync). The database file lives in the app's
// documents area, so it survives force-quit and relaunch.
export async function openExpoSqliteDriver(name = 'nascon26.db'): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlValue[] = []) => {
      const r = await db.runAsync(sql, params);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: <T,>(sql: string, params: SqlValue[] = []) => db.getAllAsync<T>(sql, params),
    first: <T,>(sql: string, params: SqlValue[] = []) => db.getFirstAsync<T>(sql, params),
    transaction: async <T,>(fn: () => Promise<T>) => {
      let result!: T;
      await db.withTransactionAsync(async () => {
        result = await fn();
      });
      return result;
    },
  };
}
