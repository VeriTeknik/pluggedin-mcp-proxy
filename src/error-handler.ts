/**
 * Centralized error handling for MCP proxy
 */

import { debugError } from './debug-log.js';
import axios from 'axios';

/**
 * Error types for categorization
 */
export enum ErrorType {
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  RATE_LIMIT = 'RATE_LIMIT',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  SERVER_ERROR = 'SERVER_ERROR',
  CLIENT_ERROR = 'CLIENT_ERROR',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Custom error class with additional context
 */
export class McpProxyError extends Error {
  constructor(
    public type: ErrorType,
    message: string,
    public statusCode?: number,
    public details?: Record<string, unknown>,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'McpProxyError';
  }
}

/**
 * Error context for logging and debugging
 */
interface ErrorContext {
  action: string;
  serverName?: string;
  serverUuid?: string;
  toolName?: string;
  resourceUri?: string;
  promptName?: string;
  userId?: string;
  requestId?: string;
}

/**
 * Categorizes errors based on their type
 */
export function categorizeError(error: unknown): ErrorType {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    
    if (!status) {
      return error.code === 'ECONNABORTED' ? ErrorType.TIMEOUT : ErrorType.NETWORK;
    }
    
    switch (status) {
      case 400:
        return ErrorType.VALIDATION;
      case 401:
        return ErrorType.AUTHENTICATION;
      case 403:
        return ErrorType.AUTHORIZATION;
      case 404:
        return ErrorType.RESOURCE_NOT_FOUND;
      case 429:
        return ErrorType.RATE_LIMIT;
      case 500:
      case 502:
      case 503:
      case 504:
        return ErrorType.SERVER_ERROR;
      default:
        return status >= 400 && status < 500 ? ErrorType.CLIENT_ERROR : ErrorType.SERVER_ERROR;
    }
  }
  
  if (error instanceof Error) {
    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return ErrorType.VALIDATION;
    }
    if (error.message.includes('timeout')) {
      return ErrorType.TIMEOUT;
    }
    if (error.message.includes('auth')) {
      return ErrorType.AUTHENTICATION;
    }
  }
  
  return ErrorType.UNKNOWN;
}

/**
 * Sanitizes error messages to prevent information disclosure
 */
export function sanitizeErrorMessage(error: unknown, context?: ErrorContext): string {
  const errorType = categorizeError(error);
  
  switch (errorType) {
    case ErrorType.VALIDATION:
      return 'Invalid request parameters';
    case ErrorType.AUTHENTICATION:
      return 'Authentication failed';
    case ErrorType.AUTHORIZATION:
      return 'Access denied';
    case ErrorType.RATE_LIMIT:
      return 'Rate limit exceeded. Please try again later';
    case ErrorType.TIMEOUT:
      return 'Request timed out';
    case ErrorType.NETWORK:
      return 'Network error occurred';
    case ErrorType.RESOURCE_NOT_FOUND:
      return context?.toolName 
        ? `Tool '${context.toolName}' not found`
        : context?.resourceUri
        ? `Resource '${context.resourceUri}' not found`
        : 'Resource not found';
    case ErrorType.SERVER_ERROR:
      return 'Service temporarily unavailable';
    default:
      return 'An unexpected error occurred';
  }
}

/**
 * Logs error with context and returns sanitized error
 */
export function handleError(
  error: unknown,
  context: ErrorContext,
  includeDetails: boolean = false
): McpProxyError {
  const errorType = categorizeError(error);
  const sanitizedMessage = sanitizeErrorMessage(error, context);
  
  // Log detailed error for debugging
  debugError(`[${context.action}] Error:`, {
    type: errorType,
    context,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  
  // Prepare details for response (if allowed)
  let details: Record<string, unknown> | undefined;
  if (includeDetails) {
    details = {
      action: context.action,
      errorType
    };
    
    if (axios.isAxiosError(error)) {
      details.statusCode = error.response?.status;
    }
  }
  
  return new McpProxyError(
    errorType,
    sanitizedMessage,
    axios.isAxiosError(error) ? error.response?.status : undefined,
    details,
    error
  );
}

/**
 * Wraps async functions with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: Omit<ErrorContext, 'requestId'>
): T {
  return (async (...args: Parameters<T>) => {
    const requestId = Math.random().toString(36).substring(7);
    try {
      return await fn(...args);
    } catch (error) {
      throw handleError(error, { ...context, requestId });
    }
  }) as T;
}

/**
 * Circuit breaker for handling repeated failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000, // 1 minute
    private readonly resetTimeout: number = 30000 // 30 seconds
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new McpProxyError(
          ErrorType.SERVER_ERROR,
          'Circuit breaker is open. Service temporarily unavailable.',
          503
        );
      }
    }
    
    try {
      const result = await fn();
      if (this.state === 'half-open') {
        this.reset();
      }
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
  
  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
      setTimeout(() => {
        this.state = 'half-open';
      }, this.resetTimeout);
    }
  }
  
  private reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = 'closed';
  }
  
  getState(): string {
    return this.state;
  }
}

/**
 * Retry logic with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors (4xx)
      if (axios.isAxiosError(error) && error.response?.status && error.response.status >= 400 && error.response.status < 500) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}