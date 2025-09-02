/**
 * Type definitions for slug-based tool prefixing
 */

/**
 * Represents a parsed tool name with slug prefix
 */
export interface ParsedSlugToolName {
  originalName: string;
  serverSlug: string;
}

/**
 * Represents a parsed tool name with UUID prefix
 */
export interface ParsedUuidToolName {
  originalName: string;
  serverUuid: string;
}

/**
 * Configuration for slug generation
 */
export interface SlugGenerationConfig {
  maxLength?: number;
  separator?: string;
  allowUnicode?: boolean;
  cacheEnabled?: boolean;
}

/**
 * Result of slug validation
 */
export interface SlugValidationResult {
  isValid: boolean;
  errors?: string[];
  sanitizedValue?: string;
}

/**
 * Tool mapping entry for prefixed tools
 */
export interface ToolMapping {
  originalName: string;
  serverIdentifier: string; // Can be UUID or slug
  prefixedName: string;
  serverName?: string;
  timestamp?: number;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  hitRate?: number;
  missRate?: number;
}

/**
 * Error types for slug operations
 */
export enum SlugErrorType {
  INVALID_INPUT = 'INVALID_INPUT',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  GENERATION_FAILED = 'GENERATION_FAILED',
  PARSING_FAILED = 'PARSING_FAILED',
  CACHE_ERROR = 'CACHE_ERROR'
}

/**
 * Custom error class for slug operations
 */
export class SlugError extends Error {
  constructor(
    public type: SlugErrorType,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SlugError';
  }
}