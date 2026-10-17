import assert from 'node:assert/strict';
(globalThis as any).__DEV__ = false;
const r = new URL('../src', import.meta.url).pathname.replace(/\/$/, '');
const { backendStoreRepository: repo, toCheckoutRequest } = await import(`${r}/data/backendStoreRepository.ts`);
const { OrderError, orderErrorMessage } = await import(`${r}/data/storeRepository.ts`);

const s: any = { role: 'viewer', userId: 'user-1' };
const draft = (extra: any = {}) => ({ orderId: 'ord-001', customerId: 'cust-001', items: [{ variantId: 'var-jersey-001-M', quantity: 1 }], discountCode: null, paymentToken: 'tok_success', ...extra });
const labels = { 'var-jersey-001-M': { name: 'Club Jersey', variantLabel: 'M' } };

// the exact documented request body — no extra keys, no prices, no contact details
assert.deepEqual(toCheckoutRequest(draft()), {
  order_id: 'ord-001', customer_id: 'cust-001', items: [{ variant_id: 'var-jersey-001-M', quantity: 1 }], discount_code: null, payment: { token: 'tok_success' },
});
assert.deepEqual(Object.keys(toCheckoutRequest(draft())).sort(), ['customer_id', 'discount_code', 'items', 'order_id', 'payment']);

// the spec's example success response (§5.12)
const specResponse = {
  order_id: 'ord-001', status: 'paid', currency: 'PKR',
  items: [{ variant_id: 'var-jersey-001-M', quantity: 1, unit_price_minor: 450000 }],
  subtotal_minor: 450000, discount_minor: 0, total_minor: 450000,
  payment: { authorization_id: 'auth_1', capture_id: 'cap_1', state: 'captured' },
  receipt: { payload: { order_id: 'ord-001', customer_id: 'cust-001', items: [], subtotal_minor: 450000, discount_minor: 0, total_minor: 450000, currency: 'PKR', paid_at: '2026-10-17T11:20:05Z' }, signature: 'ab'.repeat(32), pdf_base64: 'JVBERi0=' },
};

let calls: { url: string; init: any }[] = [];
const reply = (status: number, body: unknown) => async (url: any, init: any) => { calls.push({ url: String(url), init }); return { ok: status < 400, status, text: async () => JSON.stringify(body) } as any; };
const err = (code: string, message = 'm', status = 409) => reply(status, { error: { code, message, details: {} } });

(globalThis as any).fetch = reply(201, specResponse);
const rec = await repo.placeOrder(s, draft(), labels);
assert.equal(calls[0].url, 'http://localhost:8080/audit/v1/checkout'); assert.equal(calls[0].init.method, 'POST');
assert.deepEqual(JSON.parse(calls[0].init.body), toCheckoutRequest(draft()));
assert.equal(rec.source, 'backend'); assert.equal(rec.status, 'paid'); assert.equal(rec.totalMinor, 450000); assert.equal(rec.currency, 'PKR');
assert.equal(rec.lines[0].name, 'Club Jersey'); assert.equal(rec.lines[0].lineMinor, 450000); assert.equal(rec.createdAt, '2026-10-17T11:20:05Z');
assert.equal(rec.signature, 'ab'.repeat(32)); assert.equal(rec.pdfBase64, 'JVBERi0='); assert.equal(rec.payment!.captureId, 'cap_1');

// documented error codes
const expect = async (status: number, code: string, d = draft()) => {
  (globalThis as any).fetch = err(code, `Variant var-jersey-001-M has no stock left.`, status);
  await assert.rejects(repo.placeOrder(s, d, labels), (e: any) => { assert.ok(e instanceof OrderError); assert.equal(e.code, code); return true; });
};
await expect(409, 'OUT_OF_STOCK'); await expect(402, 'PAYMENT_DECLINED'); await expect(402, 'PAYMENT_CAPTURE_FAILED');
await expect(400, 'INVALID_DISCOUNT_CODE'); await expect(404, 'VARIANT_NOT_FOUND'); await expect(409, 'DUPLICATE_ORDER_ID'); await expect(400, 'VALIDATION_ERROR');
// out-of-stock names the variant when it can be identified
(globalThis as any).fetch = err('OUT_OF_STOCK', 'Variant var-jersey-001-L has no stock left.');
const two = draft({ items: [{ variantId: 'var-jersey-001-M', quantity: 1 }, { variantId: 'var-jersey-001-L', quantity: 1 }] });
await assert.rejects(repo.placeOrder(s, two, labels), (e: any) => e.variantId === 'var-jersey-001-L');
// no usable answer → NETWORK (retry-safe wording), never "placed"
(globalThis as any).fetch = async () => { throw new TypeError('Network request failed'); };
await assert.rejects(repo.placeOrder(s, draft(), labels), (e: any) => e.code === 'NETWORK');
(globalThis as any).fetch = err('INTERNAL', 'boom', 503);
await assert.rejects(repo.placeOrder(s, draft(), labels), (e: any) => e.code === 'NETWORK');
assert.match(orderErrorMessage(new OrderError('NETWORK', 'x')), /same order number/);
// malformed success body
(globalThis as any).fetch = reply(201, { order_id: 'x' });
await assert.rejects(repo.placeOrder(s, draft(), labels), (e: any) => e.code === 'UNKNOWN');

// catalogue: only the §5.5 seed product, with stock from GET /audit/v1/inventory/{variant_id}
calls = [];
(globalThis as any).fetch = async (url: any) => { calls.push({ url: String(url), init: {} }); const v = String(url).split('/').pop(); return { ok: true, status: 200, text: async () => JSON.stringify({ variant_id: v, stock: v!.endsWith('M') ? 0 : 5, reserved: 0 }) } as any; };
const cat = await repo.loadCatalog(s);
assert.deepEqual(cat.map((p: any) => p.id), ['prod-jersey-001']); assert.deepEqual(cat[0].variants.map((v: any) => v.stock), [0, 5]);
assert.deepEqual(calls.map((c) => c.url).sort(), ['http://localhost:8080/audit/v1/inventory/var-jersey-001-L', 'http://localhost:8080/audit/v1/inventory/var-jersey-001-M']);
console.log('checkout contract tests passed');
