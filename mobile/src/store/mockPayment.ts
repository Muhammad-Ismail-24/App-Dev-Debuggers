// The spec's mock payment gateway accepts fixed test tokens instead of card data. No card
// number is ever collected or sent by this app.
export const DEFAULT_MOCK_PAYMENT_TOKEN = 'tok_success';
export type MockPaymentToken = 'tok_success' | 'tok_declined' | 'tok_capture_fail';
