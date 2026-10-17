import type { CartLine } from '../types/store';

export const MAX_LINE_QUANTITY = 10;

export type CartAction =
  | { type: 'add'; line: Omit<CartLine, 'quantity'>; quantity: number }
  | { type: 'setQuantity'; variantId: string; quantity: number }
  | { type: 'remove'; variantId: string }
  | { type: 'clear' };

const cap = (line: { maxQuantity: number }) => Math.max(0, Math.min(line.maxQuantity, MAX_LINE_QUANTITY));

// Pure reducer so cart behaviour is testable without React. Lines are keyed by variantId.
export function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const limit = cap(action.line);
      if (limit === 0 || action.quantity < 1) return state;
      const existing = state.find((l) => l.variantId === action.line.variantId);
      if (!existing) return [...state, { ...action.line, quantity: Math.min(action.quantity, limit) }];
      return state.map((l) =>
        l.variantId === action.line.variantId ? { ...l, maxQuantity: action.line.maxQuantity, quantity: Math.min(l.quantity + action.quantity, limit) } : l,
      );
    }
    case 'setQuantity':
      if (action.quantity < 1) return state.filter((l) => l.variantId !== action.variantId);
      return state.map((l) => (l.variantId === action.variantId ? { ...l, quantity: Math.min(Math.floor(action.quantity), cap(l)) } : l));
    case 'remove':
      return state.filter((l) => l.variantId !== action.variantId);
    case 'clear':
      return [];
  }
}

export const lineTotal = (l: CartLine) => l.unitMinor * l.quantity;
export const cartSubtotal = (lines: CartLine[]) => lines.reduce((sum, l) => sum + lineTotal(l), 0);
export const cartCount = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.quantity, 0);

// Changes whenever anything the backend would see changes — used to decide when a retry may
// reuse the same order id (same body) and when a new one is required (different body).
export const cartFingerprint = (lines: CartLine[]) =>
  lines.map((l) => `${l.variantId}x${l.quantity}@${l.unitMinor}`).sort().join('|');
