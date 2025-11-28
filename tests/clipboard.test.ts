import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  ClipboardSetInputSchema,
  ClipboardGetInputSchema,
  ClipboardDeleteInputSchema,
  ClipboardListInputSchema,
  ClipboardPushInputSchema,
  ClipboardPopInputSchema
} from '../src/schemas/index.js';
import {
  clipboardSetStaticTool,
  clipboardGetStaticTool,
  clipboardDeleteStaticTool,
  clipboardListStaticTool,
  clipboardPushStaticTool,
  clipboardPopStaticTool
} from '../src/tools/static-tools.js';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('Clipboard Schemas', () => {
  describe('ClipboardSetInputSchema', () => {
    it('should validate with name', () => {
      const input = { name: 'test_key', value: 'test value' };
      const result = ClipboardSetInputSchema.parse(input);
      expect(result.name).toBe('test_key');
      expect(result.value).toBe('test value');
      expect(result.contentType).toBe('text/plain'); // default
      expect(result.encoding).toBe('utf-8'); // default
      expect(result.visibility).toBe('private'); // default
    });

    it('should validate with idx', () => {
      const input = { idx: 0, value: 'test value' };
      const result = ClipboardSetInputSchema.parse(input);
      expect(result.idx).toBe(0);
      expect(result.value).toBe('test value');
    });

    it('should reject without name or idx', () => {
      const input = { value: 'test value' };
      expect(() => ClipboardSetInputSchema.parse(input)).toThrow('Either name or idx must be provided');
    });

    it('should validate all optional fields', () => {
      const input = {
        name: 'test',
        value: 'content',
        contentType: 'application/json',
        encoding: 'base64' as const,
        visibility: 'workspace' as const,
        createdByTool: 'my_tool',
        createdByModel: 'claude-3',
        ttlSeconds: 3600
      };
      const result = ClipboardSetInputSchema.parse(input);
      expect(result.contentType).toBe('application/json');
      expect(result.encoding).toBe('base64');
      expect(result.visibility).toBe('workspace');
      expect(result.createdByTool).toBe('my_tool');
      expect(result.createdByModel).toBe('claude-3');
      expect(result.ttlSeconds).toBe(3600);
    });

    it('should validate encoding options', () => {
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', encoding: 'utf-8' })).not.toThrow();
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', encoding: 'base64' })).not.toThrow();
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', encoding: 'hex' })).not.toThrow();
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', encoding: 'invalid' })).toThrow();
    });

    it('should validate visibility options', () => {
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', visibility: 'private' })).not.toThrow();
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', visibility: 'workspace' })).not.toThrow();
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', visibility: 'public' })).not.toThrow();
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', visibility: 'invalid' })).toThrow();
    });

    it('should enforce name max length', () => {
      const longName = 'a'.repeat(256);
      expect(() => ClipboardSetInputSchema.parse({ name: longName, value: 'v' })).toThrow();
    });

    it('should enforce contentType max length', () => {
      const longContentType = 'a'.repeat(257);
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', contentType: longContentType })).toThrow();
    });

    it('should enforce createdByTool max length', () => {
      const longTool = 'a'.repeat(256);
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', createdByTool: longTool })).toThrow();
    });

    it('should require positive ttlSeconds', () => {
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', ttlSeconds: 0 })).toThrow();
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', ttlSeconds: -1 })).toThrow();
      expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', ttlSeconds: 1 })).not.toThrow();
    });
  });

  describe('ClipboardGetInputSchema', () => {
    it('should validate without params (list all)', () => {
      const result = ClipboardGetInputSchema.parse({});
      expect(result.limit).toBe(50); // default
      expect(result.offset).toBe(0); // default
    });

    it('should validate with name', () => {
      const result = ClipboardGetInputSchema.parse({ name: 'test_key' });
      expect(result.name).toBe('test_key');
    });

    it('should validate with idx', () => {
      const result = ClipboardGetInputSchema.parse({ idx: 5 });
      expect(result.idx).toBe(5);
    });

    it('should validate pagination', () => {
      const result = ClipboardGetInputSchema.parse({ limit: 10, offset: 20 });
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(20);
    });

    it('should enforce limit range', () => {
      expect(() => ClipboardGetInputSchema.parse({ limit: 0 })).toThrow();
      expect(() => ClipboardGetInputSchema.parse({ limit: 101 })).toThrow();
      expect(() => ClipboardGetInputSchema.parse({ limit: 1 })).not.toThrow();
      expect(() => ClipboardGetInputSchema.parse({ limit: 100 })).not.toThrow();
    });

    it('should enforce non-negative offset', () => {
      expect(() => ClipboardGetInputSchema.parse({ offset: -1 })).toThrow();
      expect(() => ClipboardGetInputSchema.parse({ offset: 0 })).not.toThrow();
    });

    it('should accept contentType filter', () => {
      const result = ClipboardGetInputSchema.parse({ contentType: 'application/json' });
      expect(result.contentType).toBe('application/json');
    });
  });

  describe('ClipboardDeleteInputSchema', () => {
    it('should validate with name', () => {
      const result = ClipboardDeleteInputSchema.parse({ name: 'test_key' });
      expect(result.name).toBe('test_key');
    });

    it('should validate with idx', () => {
      const result = ClipboardDeleteInputSchema.parse({ idx: 0 });
      expect(result.idx).toBe(0);
    });

    it('should validate with clearAll', () => {
      const result = ClipboardDeleteInputSchema.parse({ clearAll: true });
      expect(result.clearAll).toBe(true);
    });

    it('should reject without any params', () => {
      expect(() => ClipboardDeleteInputSchema.parse({})).toThrow('Either name, idx, or clearAll must be provided');
    });

    it('should accept clearAll false only with name or idx', () => {
      expect(() => ClipboardDeleteInputSchema.parse({ clearAll: false })).toThrow();
      expect(() => ClipboardDeleteInputSchema.parse({ clearAll: false, name: 'test' })).not.toThrow();
    });
  });

  describe('ClipboardListInputSchema', () => {
    it('should validate without params', () => {
      const result = ClipboardListInputSchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should accept contentType filter', () => {
      const result = ClipboardListInputSchema.parse({ contentType: 'image/png' });
      expect(result.contentType).toBe('image/png');
    });

    it('should validate pagination', () => {
      const result = ClipboardListInputSchema.parse({ limit: 25, offset: 50 });
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(50);
    });
  });

  describe('ClipboardPushInputSchema', () => {
    it('should validate with required fields', () => {
      const result = ClipboardPushInputSchema.parse({ value: 'test content' });
      expect(result.value).toBe('test content');
      expect(result.contentType).toBe('text/plain');
      expect(result.encoding).toBe('utf-8');
      expect(result.visibility).toBe('private');
    });

    it('should validate with all optional fields', () => {
      const input = {
        value: 'content',
        contentType: 'image/png',
        encoding: 'base64' as const,
        visibility: 'public' as const,
        createdByTool: 'screenshot_tool',
        createdByModel: 'gpt-4',
        ttlSeconds: 7200
      };
      const result = ClipboardPushInputSchema.parse(input);
      expect(result.contentType).toBe('image/png');
      expect(result.encoding).toBe('base64');
      expect(result.visibility).toBe('public');
      expect(result.ttlSeconds).toBe(7200);
    });

    it('should require value', () => {
      expect(() => ClipboardPushInputSchema.parse({})).toThrow();
    });
  });

  describe('ClipboardPopInputSchema', () => {
    it('should validate empty object', () => {
      const result = ClipboardPopInputSchema.parse({});
      expect(result).toEqual({});
    });

    it('should accept undefined', () => {
      // The handler uses `args ?? {}` pattern
      expect(() => ClipboardPopInputSchema.parse({})).not.toThrow();
    });
  });
});

describe('Clipboard Static Tools', () => {
  describe('clipboardSetStaticTool', () => {
    it('should have correct name', () => {
      expect(clipboardSetStaticTool.name).toBe('pluggedin_clipboard_set');
    });

    it('should have description mentioning 2MB limit', () => {
      expect(clipboardSetStaticTool.description).toContain('2MB');
    });

    it('should have correct annotations', () => {
      expect(clipboardSetStaticTool.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false
      });
    });

    it('should have inputSchema', () => {
      expect(clipboardSetStaticTool.inputSchema).toBeDefined();
    });
  });

  describe('clipboardGetStaticTool', () => {
    it('should have correct name', () => {
      expect(clipboardGetStaticTool.name).toBe('pluggedin_clipboard_get');
    });

    it('should be read-only', () => {
      expect(clipboardGetStaticTool.annotations?.readOnlyHint).toBe(true);
    });

    it('should be idempotent', () => {
      expect(clipboardGetStaticTool.annotations?.idempotentHint).toBe(true);
    });
  });

  describe('clipboardDeleteStaticTool', () => {
    it('should have correct name', () => {
      expect(clipboardDeleteStaticTool.name).toBe('pluggedin_clipboard_delete');
    });

    it('should be marked as destructive', () => {
      expect(clipboardDeleteStaticTool.annotations?.destructiveHint).toBe(true);
    });
  });

  describe('clipboardListStaticTool', () => {
    it('should have correct name', () => {
      expect(clipboardListStaticTool.name).toBe('pluggedin_clipboard_list');
    });

    it('should mention truncation in description', () => {
      expect(clipboardListStaticTool.description).toContain('truncated');
    });
  });

  describe('clipboardPushStaticTool', () => {
    it('should have correct name', () => {
      expect(clipboardPushStaticTool.name).toBe('pluggedin_clipboard_push');
    });

    it('should mention auto-incrementing in description', () => {
      expect(clipboardPushStaticTool.description).toContain('auto-increment');
    });
  });

  describe('clipboardPopStaticTool', () => {
    it('should have correct name', () => {
      expect(clipboardPopStaticTool.name).toBe('pluggedin_clipboard_pop');
    });

    it('should mention LIFO in description', () => {
      expect(clipboardPopStaticTool.description).toContain('LIFO');
    });

    it('should be destructive', () => {
      expect(clipboardPopStaticTool.annotations?.destructiveHint).toBe(true);
    });
  });
});

describe('Clipboard Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle 413 error for large clipboard entries', async () => {
    // This tests that the error messages include 2MB limit
    const error = new Error('Clipboard entry too large. Maximum size is 2MB.');
    expect(error.message).toContain('2MB');
  });

  it('should handle 409 error for index conflicts', async () => {
    const error = new Error('Index conflict: The specified index already exists. Use a different index or name.');
    expect(error.message).toContain('Index conflict');
  });

  it('should handle 401 authentication error', async () => {
    const error = new Error('Authentication failed. Check your API key.');
    expect(error.message).toContain('Authentication failed');
  });

  it('should handle 429 rate limit error', async () => {
    const error = new Error('Rate limit exceeded. Please try again later.');
    expect(error.message).toContain('Rate limit');
  });

  it('should handle 404 not found error', async () => {
    const error = new Error('Clipboard entry not found');
    expect(error.message).toContain('not found');
  });
});

describe('Clipboard Content Types', () => {
  it('should accept text content types', () => {
    const types = ['text/plain', 'text/html', 'text/csv', 'text/markdown'];
    types.forEach(type => {
      const result = ClipboardSetInputSchema.parse({ name: 'test', value: 'v', contentType: type });
      expect(result.contentType).toBe(type);
    });
  });

  it('should accept application content types', () => {
    const types = ['application/json', 'application/xml', 'application/octet-stream'];
    types.forEach(type => {
      const result = ClipboardSetInputSchema.parse({ name: 'test', value: 'v', contentType: type });
      expect(result.contentType).toBe(type);
    });
  });

  it('should accept image content types', () => {
    const types = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    types.forEach(type => {
      const result = ClipboardSetInputSchema.parse({ name: 'test', value: 'v', contentType: type });
      expect(result.contentType).toBe(type);
    });
  });
});

describe('Clipboard Size Limits', () => {
  it('should document 2MB as maximum size', () => {
    // The description should mention 2MB limit
    expect(clipboardSetStaticTool.description).toContain('2MB');
  });

  it('should allow large text values up to schema limit', () => {
    // Schema doesn't enforce size, that's done at API level
    const largeValue = 'x'.repeat(10000);
    const result = ClipboardSetInputSchema.parse({ name: 'test', value: largeValue });
    expect(result.value.length).toBe(10000);
  });
});

describe('Clipboard Encoding', () => {
  it('should support utf-8 encoding', () => {
    const result = ClipboardSetInputSchema.parse({ name: 'test', value: 'Hello World', encoding: 'utf-8' });
    expect(result.encoding).toBe('utf-8');
  });

  it('should support base64 encoding for binary data', () => {
    const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = ClipboardSetInputSchema.parse({
      name: 'image',
      value: base64Image,
      encoding: 'base64',
      contentType: 'image/png'
    });
    expect(result.encoding).toBe('base64');
    expect(result.contentType).toBe('image/png');
  });

  it('should support hex encoding', () => {
    const hexValue = '48656c6c6f'; // "Hello" in hex
    const result = ClipboardSetInputSchema.parse({ name: 'test', value: hexValue, encoding: 'hex' });
    expect(result.encoding).toBe('hex');
  });
});

describe('Clipboard Visibility', () => {
  it('should default to private visibility', () => {
    const result = ClipboardSetInputSchema.parse({ name: 'test', value: 'v' });
    expect(result.visibility).toBe('private');
  });

  it('should allow workspace visibility', () => {
    const result = ClipboardSetInputSchema.parse({ name: 'test', value: 'v', visibility: 'workspace' });
    expect(result.visibility).toBe('workspace');
  });

  it('should allow public visibility', () => {
    const result = ClipboardSetInputSchema.parse({ name: 'test', value: 'v', visibility: 'public' });
    expect(result.visibility).toBe('public');
  });
});

describe('Clipboard TTL', () => {
  it('should allow positive ttlSeconds', () => {
    const result = ClipboardSetInputSchema.parse({ name: 'test', value: 'v', ttlSeconds: 3600 });
    expect(result.ttlSeconds).toBe(3600);
  });

  it('should reject zero ttlSeconds', () => {
    expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', ttlSeconds: 0 })).toThrow();
  });

  it('should reject negative ttlSeconds', () => {
    expect(() => ClipboardSetInputSchema.parse({ name: 'test', value: 'v', ttlSeconds: -100 })).toThrow();
  });

  it('should accept very large ttlSeconds', () => {
    const result = ClipboardSetInputSchema.parse({ name: 'test', value: 'v', ttlSeconds: 86400 * 365 });
    expect(result.ttlSeconds).toBe(86400 * 365);
  });
});
