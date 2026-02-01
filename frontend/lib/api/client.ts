import axios, { AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Axios instance configured for the Pact API
 */
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  // 120s timeout to match backend circuit breaker (synthesize can take 90s+)
  timeout: 120000,
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; statusCode?: number }>) => {
    // Extract error details explicitly (Axios errors have non-enumerable properties)
    const url = error.config?.url || 'unknown';
    const method = error.config?.method?.toUpperCase() || 'unknown';
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message || 'Unknown error';

    // Use warn for network errors (backend down), error for actual API errors
    const isNetworkError = !error.response && error.code === 'ERR_NETWORK';
    const logMethod = isNetworkError ? console.warn : console.error;

    // Log with explicit string formatting to avoid empty object issue
    const errorMessage = isNetworkError
      ? `Network error (is the backend running at ${API_URL}?)`
      : message;

    logMethod(`[API Error] ${method} ${url} - ${status || 'no status'}: ${errorMessage}`);

    return Promise.reject(error);
  }
);

// Request interceptor for logging in development
if (process.env.NODE_ENV === 'development') {
  apiClient.interceptors.request.use((config) => {
    console.debug('[API Request]', config.method?.toUpperCase(), config.url);
    return config;
  });
}
