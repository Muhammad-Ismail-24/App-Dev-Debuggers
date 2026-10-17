import type { Session } from '../types/session';

export type AuthErrorCode = 'INVALID_CREDENTIALS' | 'NETWORK' | 'BACKEND_AUTH_UNAVAILABLE';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

// The seam for authentication. The real implementation will call the backend login route
// once it is documented (none exists in instructions.md / api/endpoints.ts yet), store the
// JWT via security/tokenStorage (Keychain) and return a Session with source 'backend'.
export interface AuthAdapter {
  readonly kind: 'backend' | 'dev-simulated' | 'unavailable';
  signIn(email: string, password: string): Promise<Session>;
}

// Plain-language copy for every AuthError (PDF §8.6: no raw codes in the UI).
export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return 'Email or password is incorrect.';
      case 'NETWORK':
        return "Can't reach the server. Check your connection and server address.";
      case 'BACKEND_AUTH_UNAVAILABLE':
        return 'Sign-in is not available yet. Please try again later.';
    }
  }
  return 'Something went wrong while signing in. Please try again.';
}
