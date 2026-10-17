// Client-generated identifiers must match [A-Za-z0-9_.:-], 1–64 chars, never contain "|" (spec §5.2).
export function newId(prefix: string, now = Date.now(), rand = Math.random): string {
  const suffix = Array.from({ length: 8 }, () => Math.floor(rand() * 36).toString(36)).join('');
  return `${prefix}_${now.toString(36)}_${suffix}`;
}

// Spec timestamps: ISO 8601 UTC "YYYY-MM-DDTHH:MM:SSZ" (no milliseconds).
export function isoSeconds(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
