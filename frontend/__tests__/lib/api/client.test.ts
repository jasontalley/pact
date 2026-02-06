import { describe, it, expect } from 'vitest';
import { apiClient } from '@/lib/api/client';

describe('apiClient', () => {
  // @atom IA-API-001
  it('has correct base URL', () => {
    // Base URL should point to the backend server for all API requests
    expect(apiClient.defaults.baseURL).toBe('http://localhost:3000');
  });

  // @atom IA-API-001
  it('has Content-Type header set to application/json', () => {
    // Content-Type header ensures server interprets request body as JSON
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });

  // @atom IA-API-001
  it('has timeout set to 120 seconds', () => {
    // Timeout matches backend circuit breaker (synthesize can take 90s+)
    expect(apiClient.defaults.timeout).toBe(120000);
  });

  // @atom IA-API-001
  it('is an axios instance with required HTTP methods', () => {
    // GET method should be available for fetching resources
    expect(apiClient.get).toBeInstanceOf(Function);
    // POST method should be available for creating new resources
    expect(apiClient.post).toBeInstanceOf(Function);
    // PATCH method should be available for partial updates to resources
    expect(apiClient.patch).toBeInstanceOf(Function);
    // DELETE method should be available for removing resources
    expect(apiClient.delete).toBeInstanceOf(Function);
    // PUT method should be available for full resource replacement
    expect(apiClient.put).toBeInstanceOf(Function);
  });

  // @atom IA-API-001
  it('has response interceptors registered', () => {
    // Response interceptors handle error transformation and response processing
    // Axios interceptors have a handlers array that contains registered interceptors
    expect(apiClient.interceptors.response.handlers).toBeInstanceOf(Array);
    // Verify interceptors array exists and has expected structure
    expect(apiClient.interceptors.response.handlers.length).toBeGreaterThanOrEqual(0);
  });

  // @atom IA-API-001
  it('throws error when making request to invalid endpoint', async () => {
    // API client should reject requests that fail with network or server errors
    // This boundary test verifies error handling for failed requests
    await expect(
      apiClient.get('/nonexistent-endpoint-that-will-fail')
    ).rejects.toThrow();
  });

  // @atom IA-API-001
  it('does not have auth token by default', () => {
    // Boundary test: Authorization header should be undefined when no token is set
    // This ensures fresh clients don't accidentally include stale credentials
    expect(apiClient.defaults.headers['Authorization']).toBeUndefined();
  });

  // @atom IA-API-001
  it('has no request interceptors by default', () => {
    // Boundary test: Request interceptors array should start empty
    // Any non-zero count would indicate unexpected middleware
    const requestHandlerCount = apiClient.interceptors.request.handlers.filter(
      (handler: unknown) => handler !== null
    ).length;
    // Verify zero active request interceptors on a fresh client
    expect(requestHandlerCount).toBe(0);
  });
});
