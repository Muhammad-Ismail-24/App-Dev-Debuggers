// Minimal async SQL surface the offline stores need. The app implements it with expo-sqlite
// (storage/expoSqliteDriver.ts); tests implement it with Node's built-in SQLite so the real SQL,
// ordering and restart behaviour are exercised without a device.
export type SqlValue = string | number | null;

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number; lastInsertRowId: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  // All statements issued inside `fn` commit together or not at all.
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
