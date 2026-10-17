import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { cartCount, cartReducer, cartSubtotal, type CartAction } from '../store/cartReducer';
import type { CartLine } from '../types/store';

interface CartValue {
  lines: CartLine[];
  count: number;
  subtotalMinor: number;
  dispatch: (a: CartAction) => void;
}

const CartContext = createContext<CartValue | null>(null);

// In-memory cart. Persisting it across launches belongs with the SQLite work (offline phase).
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, []);
  const value = useMemo<CartValue>(() => ({ lines, count: cartCount(lines), subtotalMinor: cartSubtotal(lines), dispatch }), [lines]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
