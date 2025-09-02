/**
 * Slug utilities for MCP proxy
 * Used for slug-based tool prefixing to resolve name collisions
 * 
 * Security: All input is sanitized to prevent XSS attacks
 * Performance: Includes caching for frequently used slugs
 */

// Cache for generated slugs to improve performance
const slugCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

/**
 * Sanitizes input to prevent XSS attacks
 * @param input - The input string to sanitize
 * @returns Sanitized string
 */
function sanitizeInput(input: string): string {
  // Remove any HTML tags and script content
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[<>"'`]/g, ''); // Remove dangerous characters
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
  // Validate and sanitize input
  const validatedName = validateInput(name, 255);
  const sanitizedName = sanitizeInput(validatedName);
  
  // Check cache first
  const cacheKey = `slug:${sanitizedName}`;
  if (slugCache.has(cacheKey)) {
    return slugCache.get(cacheKey)!;
  }

  // Convert to lowercase and replace spaces/special chars with hyphens
  let slug = sanitizedName
    .toLowerCase()
    .trim()
    .normalize('NFD') // Normalize unicode characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

  // Ensure minimum length
  if (slug.length === 0) {
    slug = 'server';
  }

  // Ensure maximum length (reasonable for URLs)
  const MAX_SLUG_LENGTH = 50;
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.substring(0, MAX_SLUG_LENGTH).replace(/-$/, ''); // Remove trailing hyphen if truncated
  }

  // Cache the result (with size limit)
  if (slugCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (FIFO)
    const firstKey = slugCache.keys().next().value;
    if (firstKey) slugCache.delete(firstKey);
  }
  slugCache.set(cacheKey, slug);

  return slug;
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
  
  // Sanitize input to prevent XSS
  const sanitizedToolName = sanitizeInput(toolName);

  const prefixSeparator = '__';
  const separatorIndex = sanitizedToolName.indexOf(prefixSeparator);

  if (separatorIndex === -1) {
    return null; // Not a prefixed name
  }

  const potentialSlug = sanitizedToolName.substring(0, separatorIndex);
  const potentialOriginalName = sanitizedToolName.substring(separatorIndex + prefixSeparator.length);

  // Validate that the first part is a valid slug
  if (!isValidSlug(potentialSlug) || !potentialOriginalName) {
    return null; // Invalid slug or empty original name
  }

  return {
    originalName: potentialOriginalName,
    serverSlug: potentialSlug
  };
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