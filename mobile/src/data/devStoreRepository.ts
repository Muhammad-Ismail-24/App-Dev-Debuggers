// DEVELOPMENT ONLY — SIMULATED STORE. No backend, no payment, no real order. Receipts it returns
// are tagged source: 'dev-simulated' and labelled as such on screen. Mirrors the documented
// checkout rules (§5.12) so the UI paths can be exercised without a server.
// EXPO_PUBLIC_DEV_STORE_SCENARIO=ready|empty|error|slow (default ready).
import { devProducts } from '../dev/storeFixtures';
import type { OrderDraft, OrderReceipt, Product, VariantLabels } from '../types/store';
import { OrderError, type StoreRepository } from './storeRepository';

type Scenario = 'ready' | 'empty' | 'error' | 'slow';
const scenario = (process.env.EXPO_PUBLIC_DEV_STORE_SCENARIO as Scenario | undefined) ?? 'ready';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mutable copy so a "successful" order really lowers dev stock (shows sold-out states).
const stock = new Map<string, number>(devProducts.flatMap((p) => p.variants.map((x) => [x.id, x.stock] as const)));
const prices = new Map<string, number>(devProducts.flatMap((p) => p.variants.map((x) => [x.id, p.priceMinor] as const)));
const orders = new Map<string, { fingerprint: string; receipt: OrderReceipt }>();

const withStock = (p: Product): Product => ({ ...p, variants: p.variants.map((x) => ({ ...x, stock: stock.get(x.id) ?? 0 })) });

async function gate() {
  await wait(scenario === 'slow' ? 3500 : 600);
  if (scenario === 'error') throw new Error("Couldn't load the store right now.");
}

export const devStoreRepository: StoreRepository = {
  kind: 'dev-fixtures',
  async loadCatalog() {
    await gate();
    return scenario === 'empty' ? [] : devProducts.map(withStock);
  },
  async loadProduct(_s, id) {
    await gate();
    const p = devProducts.find((x) => x.id === id);
    if (!p) throw new Error('That product is no longer available.');
    return withStock(p);
  },
  async placeOrder(_s, draft: OrderDraft, labels: VariantLabels) {
    await wait(1100);
    const fingerprint = JSON.stringify([draft.customerId, draft.items, draft.discountCode, draft.paymentToken]);
    const prior = orders.get(draft.orderId);
    if (prior) {
      // Same id + same body → stored result. Same id + different body → 409.
      if (prior.fingerprint === fingerprint) return prior.receipt;
      throw new OrderError('DUPLICATE_ORDER_ID', 'Order id reused with a different body');
    }
    if (scenario === 'error') throw new OrderError('NETWORK', 'Simulated network failure');

    // Documented processing order: validate → variants exist → discount code → reserve → pay.
    for (const i of draft.items) if (!stock.has(i.variantId)) throw new OrderError('VARIANT_NOT_FOUND', 'Unknown variant', i.variantId);
    if (draft.discountCode !== null && draft.discountCode !== 'WELCOME10') throw new OrderError('INVALID_DISCOUNT_CODE', 'Unknown code');
    for (const i of draft.items) if ((stock.get(i.variantId) ?? 0) < i.quantity) throw new OrderError('OUT_OF_STOCK', 'Insufficient stock', i.variantId);
    // Declined / capture failure release the reservation: stock is untouched.
    if (draft.paymentToken === 'tok_declined') throw new OrderError('PAYMENT_DECLINED', 'Declined');
    if (draft.paymentToken === 'tok_capture_fail') throw new OrderError('PAYMENT_CAPTURE_FAILED', 'Capture failed');

    const lines = draft.items.map((i) => {
      const unit = prices.get(i.variantId)!;
      return { variantId: i.variantId, name: labels[i.variantId]?.name ?? i.variantId, variantLabel: labels[i.variantId]?.variantLabel ?? '', quantity: i.quantity, unitMinor: unit, lineMinor: unit * i.quantity };
    });
    const subtotalMinor = lines.reduce((s, l) => s + l.lineMinor, 0);
    const discountMinor = draft.discountCode ? Math.floor((subtotalMinor * 10) / 100) : 0; // §5.12: floor(subtotal * 10 / 100)

    draft.items.forEach((i) => stock.set(i.variantId, (stock.get(i.variantId) ?? 0) - i.quantity));
    const receipt: OrderReceipt = {
      orderId: draft.orderId, status: 'simulated', currency: 'PKR', lines, subtotalMinor, discountMinor,
      totalMinor: subtotalMinor - discountMinor, createdAt: new Date().toISOString(), source: 'dev-simulated',
    };
    orders.set(draft.orderId, { fingerprint, receipt });
    return receipt;
  },
};
