import { newId } from '../utils/ids';

// order_id must match [A-Za-z0-9_.:-], 1–64 chars (spec §5.2). One shared generator (utils/ids).
export const newOrderId = (now = Date.now(), rand = Math.random): string => newId('ord', now, rand);

export interface OrderIdentity {
  fingerprint: string;
  id: string;
}

// Identical request body → the previous order_id (a retry replays idempotently).
// Any change → a fresh id, because the server answers 409 DUPLICATE_ORDER_ID for an id reused
// with a different body.
export function resolveOrderId(prev: OrderIdentity | null, body: unknown, generate: () => string = newOrderId): OrderIdentity {
  const fingerprint = JSON.stringify(body);
  return prev?.fingerprint === fingerprint ? prev : { fingerprint, id: generate() };
}
