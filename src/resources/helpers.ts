/**
 * Resource helper functions
 */

import { getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from '../utils.js';

export interface AuthResult {
  key: string | undefined;
  base: string | undefined;
}

/**
 * Ensures authentication for resources that require it
 * @param uri - Resource URI
 * @param requiresAuth - Whether the resource requires authentication
 * @returns API key and base URL
 * @throws Error if authentication is required but not provided
 */
export function ensureAuth(uri: string, requiresAuth: boolean): AuthResult {
  const key = getPluggedinMCPApiKey();
  const base = getPluggedinMCPApiBaseUrl();

  if (requiresAuth && (!key || !base)) {
    throw new Error(`API key required to access ${uri}`);
  }

  return { key, base };
}
