import type { OrderDraft, OrderErrorCode, OrderReceipt, Product, VariantLabels } from '../types/store';
import type { Session } from '../types/session';

// Seam for the Store. The backend implementation (data/backendStoreRepository.ts) speaks the
// documented checkout/inventory contract; data/devStoreRepository.ts simulates it.
export interface StoreRepository {
  readonly kind: 'backend' | 'dev-fixtures';
  loadCatalog(session: Session): Promise<Product[]>;
  loadProduct(session: Session, productId: string): Promise<Product>;
  // Idempotent on draft.orderId. Throws OrderError.
  placeOrder(session: Session, draft: OrderDraft, labels: VariantLabels): Promise<OrderReceipt>;
}

export class OrderError extends Error {
  readonly code: OrderErrorCode;
  readonly variantId?: string;
  constructor(code: OrderErrorCode, message: string, variantId?: string) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
    this.variantId = variantId;
  }
}

// Plain-language copy for every checkout failure (no raw codes in the UI).
export function orderErrorMessage(e: unknown): string {
  if (e instanceof OrderError) {
    switch (e.code) {
      case 'OUT_OF_STOCK':
        return 'Someone just bought the last one. Remove that item or pick another size, then try again.';
      case 'PAYMENT_DECLINED':
        return 'The payment was declined. Nothing was bought. Try again.';
      case 'PAYMENT_CAPTURE_FAILED':
        return 'The payment could not be completed. Nothing was bought and your items were released. Try again.';
      case 'INVALID_DISCOUNT_CODE':
        return "That discount code isn't valid. Check it or clear the field.";
      case 'VARIANT_NOT_FOUND':
        return "One of the items in your cart isn't available any more. Remove it and try again.";
      case 'DUPLICATE_ORDER_ID':
        return 'This order was already started with different contents. Go back, review your cart and try again.';
      case 'VALIDATION_ERROR':
        return 'The server did not accept this order. Check your cart and try again.';
      case 'NETWORK':
        return "We couldn't confirm your order. If you try again it is sent with the same order number, so it can't be charged twice.";
    }
  }
  return 'Something went wrong placing your order. Please try again.';
}
