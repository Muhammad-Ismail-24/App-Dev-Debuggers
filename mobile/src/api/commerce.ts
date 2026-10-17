// Typed wrappers for the documented checkout and inventory routes (Part I PDF §5.12).
// Field names are wire-exact. All traffic goes through the one centralized request().
import { request } from './client';

export const COMMERCE_PATHS = {
  checkout: '/audit/v1/checkout',
  inventory: (variantId: string) => `/audit/v1/inventory/${encodeURIComponent(variantId)}`,
} as const;

// Exactly the documented request body — nothing else (no name/email/phone, no client prices).
export interface CheckoutRequest {
  order_id: string;
  customer_id: string;
  items: { variant_id: string; quantity: number }[]; // 1–10 items, quantity 1–10, unique variant_id
  discount_code: string | null; // only WELCOME10 is valid
  payment: { token: string }; // mock gateway token: tok_success | tok_declined | tok_capture_fail
}

export interface CheckoutResponseItem {
  variant_id: string;
  quantity: number;
  unit_price_minor: number;
}

export interface CheckoutResponse {
  order_id: string;
  status: string; // "paid"
  currency: string; // "PKR"
  items: CheckoutResponseItem[];
  subtotal_minor: number;
  discount_minor: number;
  total_minor: number;
  payment: { authorization_id: string; capture_id: string; state: string };
  receipt: {
    payload: Record<string, unknown> & { order_id: string; paid_at: string };
    signature: string;
    pdf_base64: string;
  };
}

export interface InventoryResponse {
  variant_id: string;
  stock: number; // units still available
  reserved: number; // held by in-flight checkouts
}

export const postCheckout = (body: CheckoutRequest) =>
  request<CheckoutResponse>(COMMERCE_PATHS.checkout, { method: 'POST', body: JSON.stringify(body) });
export const getInventory = (variantId: string) => request<InventoryResponse>(COMMERCE_PATHS.inventory(variantId));
