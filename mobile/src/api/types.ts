// Wire-exact API JSON types. Keys stay snake_case exactly as on the wire.
export interface HealthResponse {
  status: 'ok';
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
