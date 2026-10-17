import { useNetInfo } from '@react-native-community/netinfo';

export type ConnectivityStatus = 'checking' | 'online' | 'offline' | 'syncing';

// Uses interface connectivity (isConnected), NOT internet reachability: at the venue the
// backend is on a LAN/hotspot that may have no Internet, and that must still read "Online".
// The sync manager layers 'syncing' on top of this (see components/ConnectivityPill.tsx).
export function useConnectivity(): ConnectivityStatus {
  const { isConnected } = useNetInfo();
  if (isConnected === null) return 'checking';
  return isConnected ? 'online' : 'offline';
}
