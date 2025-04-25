import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

/**
 * Creates a configured axios instance with default settings
 */
export function createHttpClient(config: AxiosRequestConfig): AxiosInstance {
  return axios.create({
    timeout: 10000,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    ...config,
  });
}

/**
 * Retries a failed HTTP request with exponential backoff
 */
export async function retryRequest<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryRequest(fn, retries - 1, delay * 2);
  }
}

/**
 * Checks if the error is a network error
 */
export function isNetworkError(error: any): boolean {
  return !error.response && error.request;
}

/**
 * Checks if the error is a rate limit error
 */
export function isRateLimitError(error: any): boolean {
  return error.response?.status === 429;
}

/**
 * Formats URL with query parameters
 */
export function formatUrl(baseUrl: string, path: string, params?: Record<string, string>): string {
  const url = new URL(path, baseUrl);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }
  return url.toString();
} 