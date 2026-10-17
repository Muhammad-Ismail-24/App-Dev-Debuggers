// DEVELOPMENT ONLY. Lets the checkout screen choose which documented mock token it sends
// (tok_success / tok_declined / tok_capture_fail) so decline handling can be exercised.
import type { MockPaymentToken } from '../store/mockPayment';

let token: MockPaymentToken = 'tok_success';
export const getDevPaymentToken = () => token;
export const setDevPaymentToken = (t: MockPaymentToken) => {
  token = t;
};
