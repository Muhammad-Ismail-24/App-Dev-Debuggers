import { DEFAULT_API_BASE_URL, REQUEST_TIMEOUT_MS } from '../config/environment';
import { ENDPOINTS } from './endpoints';
import type { ApiErrorBody, HealthResponse } from './types';

let apiBaseUrl: string = DEFAULT_API_BASE_URL;

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function setApiBaseUrl(url: string): void {
  apiBaseUrl = url.trim().replace(/\/+$/, '');
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
      signal: controller.signal,
    });
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const err = (body as ApiErrorBody | undefined)?.error;
      throw new ApiError(
        response.status,
        err?.code ?? 'HTTP_ERROR',
        err?.message ?? `HTTP ${response.status}`,
      );
    }
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiError(0, 'TIMEOUT', `No response from ${apiBaseUrl} within ${REQUEST_TIMEOUT_MS} ms`);
    }
    throw new ApiError(0, 'NETWORK_ERROR', e instanceof Error ? e.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>(ENDPOINTS.health);
}
