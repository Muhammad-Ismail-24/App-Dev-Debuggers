// Real checkout against the documented contract (Part I §5.12) via the centralized API client.
import { ApiError } from '../api/client';
import { getInventory, postCheckout, type CheckoutRequest, type CheckoutResponse } from '../api/commerce';
import type { OrderDraft, OrderErrorCode, OrderReceipt, Product, VariantLabels } from '../types/store';
import { seededCatalogue } from './seededCatalogue';
import { OrderError, type StoreRepository } from './storeRepository';

const KNOWN: ReadonlySet<string> = new Set<OrderErrorCode>([
  'VALIDATION_ERROR', 'INVALID_DISCOUNT_CODE', 'VARIANT_NOT_FOUND', 'OUT_OF_STOCK', 'DUPLICATE_ORDER_ID', 'PAYMENT_DECLINED', 'PAYMENT_CAPTURE_FAILED',
]);

// Exactly the documented body, built only from the draft.
export function toCheckoutRequest(d: OrderDraft): CheckoutRequest {
  return {
    order_id: d.orderId,
    customer_id: d.customerId,
    items: d.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    discount_code: d.discountCode,
    payment: { token: d.paymentToken },
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function fromCheckoutResponse(r: CheckoutResponse, labels: VariantLabels): OrderReceipt {
  if (!r || !Array.isArray(r.items) || !isNum(r.total_minor) || !isNum(r.subtotal_minor) || !r.receipt?.payload) {
    throw new OrderError('UNKNOWN', 'Unexpected checkout response');
  }
  return {
    orderId: r.order_id,
    status: r.status,
    currency: r.currency,
    lines: r.items.map((i) => ({
      variantId: i.variant_id,
      name: labels[i.variant_id]?.name ?? i.variant_id,
      variantLabel: labels[i.variant_id]?.variantLabel ?? '',
      quantity: i.quantity,
      unitMinor: i.unit_price_minor,
      lineMinor: i.unit_price_minor * i.quantity,
    })),
    subtotalMinor: r.subtotal_minor,
    discountMinor: r.discount_minor,
    totalMinor: r.total_minor,
    createdAt: r.receipt.payload.paid_at,
    source: 'backend',
    signature: r.receipt.signature,
    pdfBase64: r.receipt.pdf_base64,
    payment: r.payment ? { authorizationId: r.payment.authorization_id, captureId: r.payment.capture_id, state: r.payment.state } : undefined,
  };
}

// The shared client keeps only code + message, not `details.variant_id`. For OUT_OF_STOCK we
// recover the variant from the server's message when it names one of the order's variants.
function mapError(e: unknown, draft: OrderDraft): OrderError {
  if (e instanceof OrderError) return e;
  if (e instanceof ApiError) {
    if (e.status === 0 || e.status >= 500) return new OrderError('NETWORK', e.message);
    if (KNOWN.has(e.code)) {
      const variantId = e.code === 'OUT_OF_STOCK'
        ? (draft.items.length === 1 ? draft.items[0].variantId : draft.items.find((i) => e.message.includes(i.variantId))?.variantId)
        : undefined;
      return new OrderError(e.code as OrderErrorCode, e.message, variantId);
    }
  }
  return new OrderError('UNKNOWN', e instanceof Error ? e.message : 'Unknown error');
}

export const backendStoreRepository: StoreRepository = {
  kind: 'backend',

  // No catalogue route is documented: show the seeded product with live stock per variant.
  async loadCatalog() {
    return Promise.all(seededCatalogue.map(withLiveStock));
  },
  async loadProduct(_s, productId) {
    const p = seededCatalogue.find((x) => x.id === productId);
    if (!p) throw new Error('That product is no longer available.');
    return withLiveStock(p);
  },

  async placeOrder(_s, draft, labels) {
    try {
      return fromCheckoutResponse(await postCheckout(toCheckoutRequest(draft)), labels);
    } catch (e) {
      throw mapError(e, draft);
    }
  },
};

async function withLiveStock(p: Product): Promise<Product> {
  const variants = await Promise.all(
    p.variants.map(async (v) => {
      try {
        return { ...v, stock: Math.max(0, (await getInventory(v.id)).stock) };
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return { ...v, stock: 0 };
        throw e;
      }
    }),
  );
  return { ...p, variants };
}
