import axios, { AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Axios instance configured for the Pact API
 */
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; statusCode?: number }>) => {
    // Extract error message from response
    const message = error.response?.data?.message || error.message;

    // Use warn for network errors (backend down), error for actual API errors
    const isNetworkError = !error.response && error.code === 'ERR_NETWORK';
    const logMethod = isNetworkError ? console.warn : console.error;

    logMethod('[API Error]', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      message: isNetworkError ? 'Network error (is the backend running?)' : message,
    });
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
