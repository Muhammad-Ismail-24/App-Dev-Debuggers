import { REQUEST_TIMEOUT_MS } from '../config/environment';
import { ApiError } from './client';

// Plain-language copy for connection failures (PDF §8.6: never show raw codes).
// Shared by Profile → Server connection and the Login server-address row.
export function describeHealthError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'TIMEOUT') {
      return `The server didn't answer within ${REQUEST_TIMEOUT_MS / 1000} seconds. Check the address and that this device is on the same network.`;
    }
    if (e.code === 'NETWORK_ERROR') {
      return "Couldn't reach the server. Check the address (use the backend laptop's LAN IP, not localhost) and try again.";
    }
    return 'The server answered, but not as expected. Make sure the backend is running and up to date.';
  }
  return 'Something unexpected went wrong while contacting the server.';
}
