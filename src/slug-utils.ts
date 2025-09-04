/**
 * Slug utilities for MCP proxy
 * Used for slug-based tool prefixing to resolve name collisions
 * 
 * Security: All input is sanitized to prevent XSS attacks while allowing valid tool name characters
 * Performance: Uses LRU cache for frequently used slugs
 */

import slugify from 'slugify';
import QuickLRU from 'quick-lru';

// LRU cache for generated slugs to improve performance
const slugCache = new QuickLRU<string, string>({ maxSize: 1000 });

/**
 * Sanitizes input to prevent XSS attacks while allowing valid tool name characters.
 * Allowed characters: letters, numbers, spaces, dashes, underscores, and periods.
 * Removes HTML tags and script content.
 * @param input - The input string to sanitize
 * @returns Sanitized string
 */
function sanitizeInput(input: string): string {
  // Remove any HTML tags and script content
  let sanitized = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '');

  // Only allow valid tool name characters: letters, numbers, spaces, dashes, underscores, and periods
  sanitized = sanitized.replace(/[^a-zA-Z0-9 .\-_]/g, '');

  return sanitized;
}

/**
 * Sanitizes tool names less aggressively - removes HTML/script but preserves more characters.
 * This is suitable for UUID-based prefixes where the server identifier is already trusted.
 * @param input - The tool name to sanitize
 * @returns Sanitized string
 */
function sanitizeToolName(input: string): string {
  // Remove any HTML tags and script content for XSS prevention
  let sanitized = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '');

  // Remove only the most dangerous characters, preserve @ # and other tool-name chars
  sanitized = sanitized.replace(/[<>'"&]/g, '');

  return sanitized;
}

/**
 * Validates input parameters
 * @param name - The name to validate
 * @param maxLength - Maximum allowed length
 * @throws Error if validation fails
 */
function validateInput(name: unknown, maxLength: number = 255): string {
  if (name === null || name === undefined) {
    throw new Error('Input is required and cannot be null or undefined');
  }
  
  if (typeof name !== 'string') {
    throw new Error(`Input must be a string, received ${typeof name}`);
  }
  
  if (name.trim().length === 0) {
    throw new Error('Input cannot be empty or contain only whitespace');
  }
  
  if (name.length > maxLength) {
    throw new Error(`Input exceeds maximum length of ${maxLength} characters`);
  }
  
  return name;
}

/**
 * Generates a URL-friendly slug from a server name
 * @param name - The server name to convert to a slug
 * @returns A URL-friendly slug
 */
export function generateSlug(name: string): string {
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Server name must be a non-empty string');
  }

  return (
    slugCache.get(name) ||
    (() => {
      // First sanitize to remove HTML/script content and dangerous characters
      const sanitized = sanitizeInput(name);
      
      // Convert to lowercase and replace spaces/special chars with hyphens
      let slug = sanitized
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9.-]/g, '-')  // Replace non-alphanumeric (except . and -) with hyphens
        .replace(/-+/g, '-')           // Replace multiple hyphens with single hyphen
        .replace(/^-+|-+$/g, '');      // Trim leading/trailing hyphens
      
      // Limit length
      slug = slug.slice(0, 50).replace(/-+$/, '');
      
      const result = slug || 'server';
      slugCache.set(name, result);
      return result;
    })()
  );
}

/**
 * Generates a unique slug by appending a number if the base slug already exists
 * @param baseSlug - The base slug to make unique
 * @param existingSlugs - Array of existing slugs to check against
 * @returns A unique slug
 */
export function generateUniqueSlug(baseSlug: string, existingSlugs: string[]): string {
  // Validate inputs
  const validatedSlug = validateInput(baseSlug, 50);
  
  if (!Array.isArray(existingSlugs)) {
    throw new Error('existingSlugs must be an array');
  }
  
  // Use Set for O(1) lookup performance
  const existingSet = new Set(existingSlugs);
  
  if (!existingSet.has(validatedSlug)) {
    return validatedSlug;
  }

  let counter = 1;
  let uniqueSlug = `${validatedSlug}-${counter}`;
  
  const MAX_ITERATIONS = 100; // Reasonable limit
  
  while (existingSet.has(uniqueSlug) && counter < MAX_ITERATIONS) {
    counter++;
    uniqueSlug = `${validatedSlug}-${counter}`;
  }
  
  // If we still have collision after MAX_ITERATIONS, use timestamp
  if (existingSet.has(uniqueSlug)) {
    // Use shorter timestamp format (last 8 digits of epoch)
    const timestamp = Date.now().toString().slice(-8);
    uniqueSlug = `${validatedSlug}-${timestamp}`;
  }

  return uniqueSlug;
}

/**
 * Validates that a string is a valid slug format
 * @param slug - The slug to validate
 * @returns True if the slug is valid
 */
export function isValidSlug(slug: unknown): boolean {
  if (!slug || typeof slug !== 'string') {
    return false;
  }

  // Slug must be lowercase, contain only letters, numbers, and hyphens
  // Must not start or end with a hyphen
  const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  return slugRegex.test(slug) && slug.length > 0 && slug.length <= 50;
}

/**
 * Creates a slug-based tool name prefix
 * Format: {server_slug}__{original_tool_name}
 * @param serverSlug - The server slug
 * @param originalName - The original tool name
 * @returns The prefixed tool name
 */
export function createSlugPrefixedToolName(serverSlug: string, originalName: string): string {
  // Validate inputs
  const validatedSlug = validateInput(serverSlug, 50);
  const validatedName = validateInput(originalName, 255);
  
  if (!isValidSlug(validatedSlug)) {
    throw new Error(`Invalid server slug format: ${validatedSlug}`);
  }
  
  // Sanitize the original name to prevent XSS
  const sanitizedName = sanitizeInput(validatedName);
  
  // Check if sanitized name is empty after removing dangerous content
  if (!sanitizedName || sanitizedName.trim().length === 0) {
    throw new Error('Tool name becomes empty after sanitization');
  }
  
  return `${validatedSlug}__${sanitizedName}`;
}

/**
 * Parses a slug-prefixed tool name
 * @param toolName - The potentially prefixed tool name
 * @returns Object with originalName and serverSlug, or null if not prefixed
 */
export function parseSlugPrefixedToolName(toolName: unknown): { originalName: string; serverSlug: string } | null {
  if (!toolName || typeof toolName !== 'string') {
    return null;
  }
  
  const prefixSeparator = '__';
  const separatorIndex = (toolName as string).indexOf(prefixSeparator);

  if (separatorIndex === -1) {
    return null; // Not a prefixed name
  }

  const serverSlug = (toolName as string).slice(0, separatorIndex);
  const originalName = (toolName as string).slice(separatorIndex + prefixSeparator.length);

  // Validate that the first part is a valid slug
  if (!isValidSlug(serverSlug) || !originalName) {
    return null; // Invalid slug or empty original name
  }

  // Sanitize only the originalName to prevent XSS
  const sanitizedOriginalName = sanitizeInput(originalName);

  // Check if sanitized name is empty after removing dangerous content
  if (!sanitizedOriginalName || sanitizedOriginalName.trim().length === 0) {
    return null;
  }

  return { originalName: sanitizedOriginalName, serverSlug };
}

/**
 * Clears the slug cache (useful for testing or memory management)
 */
export function clearSlugCache(): void {
  slugCache.clear();
}

/**
 * Gets the current cache size (useful for monitoring)
 */
export function getSlugCacheSize(): number {
  return slugCache.size;
}

/**
 * Result of parsing a prefixed tool name
 */
export interface ParsedPrefixedToolName {
  originalName: string;
  serverIdentifier: string;
  prefixType: 'slug' | 'uuid';
}

/**
 * Validates UUID format
 * @param uuid - The UUID to validate
 * @returns True if the UUID format is valid
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Shared helper for parsing prefixed tool names (slug or UUID-based)
 * This reduces duplication and centralizes prefix detection logic
 * @param toolName - The potentially prefixed tool name
 * @returns Parsed result with originalName, serverIdentifier, and prefixType, or null if not prefixed
 */
export function parsePrefixedToolName(toolName: unknown): ParsedPrefixedToolName | null {
  if (!toolName || typeof toolName !== 'string') {
    return null;
  }
  
  const prefixSeparator = '__';
  const separatorIndex = toolName.indexOf(prefixSeparator);

  if (separatorIndex === -1) {
    return null; // Not a prefixed name
  }

  const serverIdentifier = toolName.slice(0, separatorIndex);
  const originalName = toolName.slice(separatorIndex + prefixSeparator.length);

  if (!serverIdentifier || !originalName) {
    return null; // Empty identifier or tool name
  }

  // Try UUID first (more specific format)
  if (isValidUuid(serverIdentifier)) {
    // Use less aggressive sanitization for UUID-based prefixes
    const sanitizedOriginalName = sanitizeToolName(originalName);
    return {
      originalName: sanitizedOriginalName,
      serverIdentifier,
      prefixType: 'uuid'
    };
  }

  // Try slug (broader format)
  if (isValidSlug(serverIdentifier)) {
    // Sanitize only the originalName to prevent XSS
    const sanitizedOriginalName = sanitizeInput(originalName);
    return {
      originalName: sanitizedOriginalName,
      serverIdentifier,
      prefixType: 'slug'
    };
  }

  return null; // Invalid identifier format
}