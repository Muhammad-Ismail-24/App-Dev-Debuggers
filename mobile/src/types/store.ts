// Display models for the Store flow. Money is integer paisa (PKR minor units) end to end,
// as the spec requires; formatting happens only in store/money.ts.
export interface ProductVariant {
  id: string; // e.g. "var-jersey-001-M" — sent back exactly as received
  label: string; // "M", "One size"
  stock: number; // last known stock; the backend is authoritative at order time
}

export interface ProductImageRef {
  uri?: string;
  // Placeholder tint when no image exists (club/tenant color).
  tint: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  priceMinor: number;
  images: ProductImageRef[];
  variants: ProductVariant[];
}

export interface CartLine {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  unitMinor: number;
  quantity: number;
  // Stock known when added; caps the stepper. Not a reservation.
  maxQuantity: number;
  tint: string;
}

// The request the app sends — exactly the documented checkout body, in camelCase. No customer
// contact details and no client-side prices: the server prices the order from its own catalogue.
export interface OrderDraft {
  // Client-chosen, stable across retries of an identical request (replay → stored result).
  orderId: string;
  // The signed-in user's id. The spec requires a customer_id string and defines no other source.
  customerId: string;
  items: { variantId: string; quantity: number }[];
  discountCode: string | null;
  // Mock-gateway token (tok_success / tok_declined / tok_capture_fail). Never card data.
  paymentToken: string;
}

// Display-only names for the variants in a draft (the response carries variant ids only).
export type VariantLabels = Record<string, { name: string; variantLabel: string }>;

export interface ReceiptLine {
  variantId: string;
  name: string;
  variantLabel: string;
  quantity: number;
  unitMinor: number;
  lineMinor: number;
}

export interface OrderReceipt {
  orderId: string;
  status: string; // server value ("paid"), shown verbatim; "simulated" for dev receipts
  currency: string;
  lines: ReceiptLine[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  createdAt: string; // receipt.payload.paid_at
  // 'dev-simulated' receipts are labelled as such on screen and never look like real orders.
  source: 'backend' | 'dev-simulated';
  signature?: string;
  pdfBase64?: string;
  payment?: { authorizationId: string; captureId: string; state: string };
}

// Spec error codes (Appendix B) the checkout can return, plus client-side ones.
export type OrderErrorCode =
  | 'VALIDATION_ERROR' // 400
  | 'INVALID_DISCOUNT_CODE' // 400
  | 'VARIANT_NOT_FOUND' // 404
  | 'OUT_OF_STOCK' // 409
  | 'DUPLICATE_ORDER_ID' // 409 — same order_id, different body
  | 'PAYMENT_DECLINED' // 402
  | 'PAYMENT_CAPTURE_FAILED' // 402
  | 'NETWORK' // no usable answer (offline / timeout / 5xx)
  | 'UNKNOWN';
