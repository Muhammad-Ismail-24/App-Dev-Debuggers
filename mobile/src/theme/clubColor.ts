// Deterministic fallback club color (DESIGN_SYSTEM.md §1.3): 12 hues readable under white
// text + scrim. Used only when the backend supplies no color.
const PALETTE = [
  '#C0392B', '#D35400', '#B7950B', '#1E8449', '#117A65', '#1F618D',
  '#2E4BA0', '#6C3483', '#A93A7E', '#7B7D2E', '#2C7A9B', '#7D4A2A',
] as const;

export function clubColor(id: string, explicit?: string): string {
  if (explicit) return explicit;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
