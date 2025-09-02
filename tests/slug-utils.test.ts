import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSlug,
  generateUniqueSlug,
  isValidSlug,
  createSlugPrefixedToolName,
  parseSlugPrefixedToolName,
  clearSlugCache,
  getSlugCacheSize
} from '../src/slug-utils';

describe('Slug Utilities', () => {
  beforeEach(() => {
    clearSlugCache();
  });

  describe('generateSlug', () => {
    it('should generate valid slug from normal string', () => {
      expect(generateSlug('Hello World')).toBe('hello-world');
      expect(generateSlug('Test Server 123')).toBe('test-server-123');
    });

    it('should handle special characters', () => {
      expect(generateSlug('Test@#$%Server')).toBe('testserver');
      expect(generateSlug('Hello!@#$%^&*()World')).toBe('helloworld');
    });

    it('should handle unicode characters', () => {
      expect(generateSlug('Café Société')).toBe('cafe-societe');
      expect(generateSlug('Über Alles')).toBe('uber-alles');
    });

    it('should handle multiple spaces and hyphens', () => {
      expect(generateSlug('Hello    World')).toBe('hello-world');
      expect(generateSlug('Test---Server')).toBe('test-server');
      expect(generateSlug('--Leading-Trailing--')).toBe('leading-trailing');
    });

    it('should handle empty-like inputs', () => {
      expect(() => generateSlug('   ')).toThrow('Input cannot be empty');
      expect(generateSlug('!@#$%')).toBe('server');
    });

    it('should truncate long names', () => {
      const longName = 'a'.repeat(100);
      const slug = generateSlug(longName);
      expect(slug.length).toBeLessThanOrEqual(50);
      expect(slug).not.toMatch(/-$/);
    });

    it('should throw error for invalid inputs', () => {
      expect(() => generateSlug(null as any)).toThrow('Input is required');
      expect(() => generateSlug(undefined as any)).toThrow('Input is required');
      expect(() => generateSlug(123 as any)).toThrow('Input must be a string');
      expect(() => generateSlug('')).toThrow('Input cannot be empty');
    });

    it('should prevent XSS attacks', () => {
      // After sanitization, script tags are completely removed
      // '<script>alert("xss")</script>' becomes '' which defaults to 'server'
      expect(generateSlug('<script>alert("xss")</script>')).toBe('server');
      // 'test<img src=x onerror=alert(1)>' becomes 'test' after sanitization
      expect(generateSlug('test<img src=x onerror=alert(1)>')).toBe('test');
    });

    it('should use cache for repeated calls', () => {
      const name = 'Test Server';
      const slug1 = generateSlug(name);
      expect(getSlugCacheSize()).toBe(1);
      
      const slug2 = generateSlug(name);
      expect(slug1).toBe(slug2);
      expect(getSlugCacheSize()).toBe(1);
    });
  });

  describe('generateUniqueSlug', () => {
    it('should return base slug if unique', () => {
      expect(generateUniqueSlug('test-server', [])).toBe('test-server');
      expect(generateUniqueSlug('hello', ['world'])).toBe('hello');
    });

    it('should append number for conflicts', () => {
      expect(generateUniqueSlug('test', ['test'])).toBe('test-1');
      expect(generateUniqueSlug('test', ['test', 'test-1'])).toBe('test-2');
      expect(generateUniqueSlug('test', ['test', 'test-1', 'test-2'])).toBe('test-3');
    });

    it('should handle many conflicts', () => {
      const existing = Array.from({ length: 100 }, (_, i) => 
        i === 0 ? 'test' : `test-${i}`
      );
      // The 101st item will be test-101 since we have test and test-1 through test-100
      expect(generateUniqueSlug('test', existing)).toMatch(/^test-\d+$/);
    });

    it('should use timestamp for extreme conflicts', () => {
      const existing = Array.from({ length: 101 }, (_, i) => 
        i === 0 ? 'test' : `test-${i}`
      );
      const slug = generateUniqueSlug('test', existing);
      expect(slug).toMatch(/^test-\d{8}$/);
    });

    it('should validate inputs', () => {
      expect(() => generateUniqueSlug('', [])).toThrow('Input cannot be empty');
      expect(() => generateUniqueSlug('test', null as any)).toThrow('existingSlugs must be an array');
    });

    it('should perform efficiently with Set lookup', () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => `slug-${i}`);
      const start = Date.now();
      const result = generateUniqueSlug('new-slug', largeArray);
      const duration = Date.now() - start;
      
      expect(result).toBe('new-slug');
      expect(duration).toBeLessThan(10); // Should be very fast
    });
  });

  describe('isValidSlug', () => {
    it('should validate correct slugs', () => {
      expect(isValidSlug('hello-world')).toBe(true);
      expect(isValidSlug('test123')).toBe(true);
      expect(isValidSlug('a-b-c-d')).toBe(true);
      expect(isValidSlug('server-1')).toBe(true);
    });

    it('should reject invalid slugs', () => {
      expect(isValidSlug('Hello-World')).toBe(false); // Uppercase
      expect(isValidSlug('hello world')).toBe(false); // Space
      expect(isValidSlug('hello_world')).toBe(false); // Underscore
      expect(isValidSlug('-hello')).toBe(false); // Leading hyphen
      expect(isValidSlug('hello-')).toBe(false); // Trailing hyphen
      expect(isValidSlug('')).toBe(false); // Empty
      expect(isValidSlug('a'.repeat(51))).toBe(false); // Too long
    });

    it('should handle non-string inputs', () => {
      expect(isValidSlug(null)).toBe(false);
      expect(isValidSlug(undefined)).toBe(false);
      expect(isValidSlug(123)).toBe(false);
      expect(isValidSlug({})).toBe(false);
    });
  });

  describe('createSlugPrefixedToolName', () => {
    it('should create prefixed tool names', () => {
      expect(createSlugPrefixedToolName('my-server', 'read_file')).toBe('my-server__read_file');
      expect(createSlugPrefixedToolName('test', 'tool_name')).toBe('test__tool_name');
    });

    it('should validate slug format', () => {
      expect(() => createSlugPrefixedToolName('Invalid-Slug', 'tool')).toThrow('Invalid server slug format');
      expect(() => createSlugPrefixedToolName('', 'tool')).toThrow('Input cannot be empty');
    });

    it('should sanitize tool name', () => {
      // After sanitization, '<script>alert</script>' becomes ''
      // But empty names should throw an error
      expect(() => createSlugPrefixedToolName('server', '<script>alert</script>')).toThrow('Tool name becomes empty after sanitization');
    });

    it('should validate inputs', () => {
      expect(() => createSlugPrefixedToolName(null as any, 'tool')).toThrow('Input is required');
      expect(() => createSlugPrefixedToolName('server', null as any)).toThrow('Input is required');
    });
  });

  describe('parseSlugPrefixedToolName', () => {
    it('should parse prefixed tool names', () => {
      expect(parseSlugPrefixedToolName('my-server__read_file')).toEqual({
        originalName: 'read_file',
        serverSlug: 'my-server'
      });
    });

    it('should return null for non-prefixed names', () => {
      expect(parseSlugPrefixedToolName('read_file')).toBe(null);
      expect(parseSlugPrefixedToolName('tool_name')).toBe(null);
    });

    it('should validate slug portion', () => {
      expect(parseSlugPrefixedToolName('Invalid__tool')).toBe(null); // Invalid slug
      expect(parseSlugPrefixedToolName('__tool')).toBe(null); // Empty slug
    });

    it('should handle edge cases', () => {
      expect(parseSlugPrefixedToolName('server__')).toBe(null); // Empty tool name
      expect(parseSlugPrefixedToolName('server__tool__with__underscores')).toEqual({
        originalName: 'tool__with__underscores',
        serverSlug: 'server'
      });
    });

    it('should handle non-string inputs', () => {
      expect(parseSlugPrefixedToolName(null)).toBe(null);
      expect(parseSlugPrefixedToolName(undefined)).toBe(null);
      expect(parseSlugPrefixedToolName(123)).toBe(null);
    });

    it('should sanitize input to prevent XSS', () => {
      const result = parseSlugPrefixedToolName('server__<script>alert</script>');
      // After sanitization 'server__<script>alert</script>' becomes 'server__'
      // which has empty original name, so should return null
      expect(result).toBe(null);
    });
  });

  describe('Cache Management', () => {
    it('should manage cache size', () => {
      expect(getSlugCacheSize()).toBe(0);
      
      generateSlug('test1');
      expect(getSlugCacheSize()).toBe(1);
      
      generateSlug('test2');
      expect(getSlugCacheSize()).toBe(2);
      
      clearSlugCache();
      expect(getSlugCacheSize()).toBe(0);
    });

    it('should limit cache size', () => {
      // Generate more than MAX_CACHE_SIZE (1000) entries
      for (let i = 0; i < 1005; i++) {
        generateSlug(`test-${i}`);
      }
      
      // Cache should not exceed MAX_CACHE_SIZE
      expect(getSlugCacheSize()).toBeLessThanOrEqual(1000);
    });
  });
});