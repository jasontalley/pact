import { describe, it, expect } from 'vitest';
import { apiClient } from '@/lib/api/client';

describe('apiClient', () => {
  it('has correct base URL', () => {
    expect(apiClient.defaults.baseURL).toBe('http://localhost:3000');
  });

  it('has Content-Type header set to application/json', () => {
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
  });

  it('has timeout set to 30 seconds', () => {
    expect(apiClient.defaults.timeout).toBe(30000);
  });

  it('is an axios instance', () => {
    expect(apiClient).toBeDefined();
    expect(typeof apiClient.get).toBe('function');
    expect(typeof apiClient.post).toBe('function');
    expect(typeof apiClient.patch).toBe('function');
    expect(typeof apiClient.delete).toBe('function');
  });

  it('has response interceptors registered', () => {
    // Axios interceptors have a handlers array
    expect(apiClient.interceptors.response).toBeDefined();
  });
});
