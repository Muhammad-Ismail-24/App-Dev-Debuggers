// DEVELOPMENT ONLY — SIMULATED AUTHENTICATION. Not a backend call, not a verified JWT.
// Sessions it returns are tagged source: 'dev-simulated' and the UI says so.
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../dev/demoAccounts';
import { AuthError, type AuthAdapter } from './authAdapter';

export const devAuthAdapter: AuthAdapter = {
  kind: 'dev-simulated',
  async signIn(email, password) {
    await new Promise((resolve) => setTimeout(resolve, 700)); // realistic latency for loading states
    const account = DEMO_ACCOUNTS.find((a) => a.email === email.trim().toLowerCase());
    if (!account || password !== DEMO_PASSWORD) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
    }
    return {
      userId: `dev-${account.role}`,
      email: account.email,
      displayName: account.displayName,
      role: account.role,
      source: 'dev-simulated',
    };
  },
};
