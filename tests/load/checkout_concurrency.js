import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';

const purchased = new Counter('purchased');
const rejected = new Counter('out_of_stock');
const unexpected = new Counter('unexpected');
const base = __ENV.NASCON_API_URL || 'http://localhost:8080';
export const options = {
  scenarios: { checkout: { executor: 'per-vu-iterations', vus: 20, iterations: 1, maxDuration: '10s' } },
  thresholds: { purchased: ['count==1'], out_of_stock: ['count==19'], unexpected: ['count==0'],
                checks: ['rate==1'] },
};

export function setup() {
  const response = http.post(`${base}/audit/v1/reset`, JSON.stringify({ stock: { 'var-jersey-001-M': 1 } }),
    { headers: { 'Content-Type': 'application/json' } });
  if (response.status !== 200) fail(`Reset failed: ${response.status}`);
  return { run: String(Date.now()) };
}

export default function (data) {
  purchased.add(0); rejected.add(0); unexpected.add(0);
  const response = http.post(`${base}/audit/v1/checkout`, JSON.stringify({
    order_id: `load-${data.run}-${__VU}`, customer_id: `buyer-${__VU}`,
    items: [{ variant_id: 'var-jersey-001-M', quantity: 1 }],
    discount_code: null, payment: { token: 'tok_success' },
  }), { headers: { 'Content-Type': 'application/json' }, timeout: '10s' });
  if (response.status === 201) purchased.add(1);
  else if (response.status === 409 && response.json('error.code') === 'OUT_OF_STOCK') rejected.add(1);
  else unexpected.add(1);
}

export function teardown() {
  const response = http.get(`${base}/audit/v1/inventory/var-jersey-001-M`);
  check(response, { 'no overselling or outstanding reservation': r => r.status === 200 && r.json('stock') === 0 && r.json('reserved') === 0 });
}
