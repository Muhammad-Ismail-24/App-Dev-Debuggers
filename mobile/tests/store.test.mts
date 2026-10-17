import assert from 'node:assert/strict';
const r = new URL('../src', import.meta.url).pathname.replace(/\/$/, '');
const { formatPkr, formatPkrExact } = await import(`${r}/store/money.ts`);
const { cartReducer, cartSubtotal, cartCount, cartFingerprint, MAX_LINE_QUANTITY } = await import(`${r}/store/cartReducer.ts`);
const { validateOrderLines, normalizeDiscountCode } = await import(`${r}/store/checkoutValidation.ts`);
const { newOrderId, resolveOrderId } = await import(`${r}/store/orderId.ts`);

assert.equal(formatPkr(450000), 'Rs 4,500'); assert.equal(formatPkr(450050), 'Rs 4,500.50'); assert.equal(formatPkr(0), 'Rs 0'); assert.equal(formatPkr(123456789), 'Rs 1,234,567.89');
assert.equal(formatPkrExact(450000), 'PKR 4,500.00'); assert.equal(formatPkrExact(5), 'PKR 0.05');

const m = { variantId: 'var-m', productId: 'p1', productName: 'Jersey', variantLabel: 'M', unitMinor: 450000, maxQuantity: 1, tint: '#fff' };
const l = { ...m, variantId: 'var-l', variantLabel: 'L', maxQuantity: 5 };
let s: any[] = [];
s = cartReducer(s, { type: 'add', line: m, quantity: 3 });
assert.equal(s[0].quantity, 1, 'capped at stock 1');
s = cartReducer(s, { type: 'add', line: l, quantity: 2 });
s = cartReducer(s, { type: 'add', line: l, quantity: 2 });
assert.equal(s.find((x) => x.variantId === 'var-l').quantity, 4);
s = cartReducer(s, { type: 'add', line: l, quantity: 9 });
assert.equal(s.find((x) => x.variantId === 'var-l').quantity, 5, 'capped at stock 5');
assert.equal(cartSubtotal(s), 450000 * 6); assert.equal(cartCount(s), 6);
s = cartReducer(s, { type: 'setQuantity', variantId: 'var-l', quantity: 2 });
assert.equal(cartSubtotal(s), 450000 * 3);
const fp = cartFingerprint(s);
s = cartReducer(s, { type: 'setQuantity', variantId: 'var-l', quantity: 3 });
assert.notEqual(cartFingerprint(s), fp);
s = cartReducer(s, { type: 'setQuantity', variantId: 'var-l', quantity: 0 });
assert.equal(s.length, 1, 'qty 0 removes');
assert.deepEqual(cartReducer(s, { type: 'add', line: { ...m, variantId: 'oos', maxQuantity: 0 }, quantity: 1 }), s, 'out of stock ignored');
assert.equal(cartReducer(s, { type: 'remove', variantId: 'var-m' }).length, 0);
assert.equal(cartReducer(s, { type: 'clear' }).length, 0);
const big = cartReducer([], { type: 'add', line: { ...m, maxQuantity: 99 }, quantity: 50 }); assert.equal(big[0].quantity, MAX_LINE_QUANTITY);

assert.equal(validateOrderLines([]), 'Your cart is empty.');
const ok = (n: number) => ({ ...m, variantId: `v${n}`, quantity: 1 });
assert.equal(validateOrderLines(Array.from({ length: 10 }, (_, i) => ok(i))), null);
assert.match(validateOrderLines(Array.from({ length: 11 }, (_, i) => ok(i)))!, /at most 10/);
assert.match(validateOrderLines([ok(1), ok(1)])!, /twice/);
assert.match(validateOrderLines([{ ...ok(1), quantity: 11 }])!, /between 1 and 10/);
assert.equal(normalizeDiscountCode('  '), null); assert.equal(normalizeDiscountCode(' WELCOME10 '), 'WELCOME10');
const id = newOrderId(); assert.match(id, /^[A-Za-z0-9_.:-]{1,64}$/); assert.notEqual(id, newOrderId(Date.now(), () => 0.5));
// order_id stability: identical body keeps the id, any change gets a new one
let n = 0; const gen = () => `ord_${++n}`;
const body = { customerId: 'u1', items: [{ variantId: 'a', quantity: 1 }], discountCode: null, paymentToken: 'tok_success' };
const i1 = resolveOrderId(null, body, gen); const i2 = resolveOrderId(i1, { ...body }, gen);
assert.equal(i2.id, i1.id, 'identical retry keeps order_id');
assert.notEqual(resolveOrderId(i2, { ...body, paymentToken: 'tok_declined' }, gen).id, i1.id, 'changed token → new id');
assert.notEqual(resolveOrderId(i2, { ...body, discountCode: 'WELCOME10' }, gen).id, i1.id, 'changed code → new id');
console.log('store tests passed');
