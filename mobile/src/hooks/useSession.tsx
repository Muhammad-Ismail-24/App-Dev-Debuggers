import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { defaultAuthAdapter, type AuthAdapter } from '../auth';
import type { Session } from '../types/session';

interface SessionValue {
  session: Session | null;
  adapter: AuthAdapter;
  // Two steps so the login screen can play its success transition before the app swaps screens.
  verifyCredentials: (email: string, password: string) => Promise<Session>;
  establishSession: (session: Session) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

// In-memory only. Persisting the token belongs to security/tokenStorage (Keychain) once the
// backend adapter exists; nothing sensitive is written anywhere here.
export function SessionProvider({ children, adapter = defaultAuthAdapter }: { children: ReactNode; adapter?: AuthAdapter }) {
  const [session, setSession] = useState<Session | null>(null);
  const verifyCredentials = useCallback((email: string, password: string) => adapter.signIn(email, password), [adapter]);
  const signOut = useCallback(() => setSession(null), []);
  const value = useMemo<SessionValue>(
    () => ({ session, adapter, verifyCredentials, establishSession: setSession, signOut }),
    [session, adapter, verifyCredentials, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
