import type { CartLine } from '../types/store';

export const MAX_ORDER_ITEMS = 10; // spec §5.12: items 1–10

// Mirrors the documented request limits so an invalid cart is caught before a round trip.
// The server remains the authority. Returns a plain-language problem, or null if sendable.
export function validateOrderLines(lines: CartLine[]): string | null {
  if (lines.length === 0) return 'Your cart is empty.';
  if (lines.length > MAX_ORDER_ITEMS) return `An order can contain at most ${MAX_ORDER_ITEMS} different items. Remove some items from your cart.`;
  if (new Set(lines.map((l) => l.variantId)).size !== lines.length) return 'The cart has the same item twice.';
  if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 10)) return 'Each item must have a quantity between 1 and 10.';
  return null;
}

// Empty → null (the field is optional). Otherwise sent exactly as typed, trimmed; the server
// decides validity (only WELCOME10 is valid) and answers INVALID_DISCOUNT_CODE.
export function normalizeDiscountCode(input: string): string | null {
  const t = input.trim();
  return t.length === 0 ? null : t;
}
