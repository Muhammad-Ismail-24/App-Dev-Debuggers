// Default backend URL. Override at build time with EXPO_PUBLIC_API_BASE_URL, or at
// runtime via setApiBaseUrl(). From the Simulator on a Mac that is NOT running Docker,
// use http://<ISMAIL_LAN_IP>:8080 (never localhost).
export const DEFAULT_API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

export const REQUEST_TIMEOUT_MS = 5000;
