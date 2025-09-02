import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPrefixedToolName, parsePrefixedToolName } from '../src/mcp-proxy';

describe('UUID Tool Prefixing', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';
  const invalidUuid = 'not-a-valid-uuid';

  describe('createPrefixedToolName', () => {
    it('should create prefixed tool name with valid UUID', () => {
      const result = createPrefixedToolName(validUuid, 'read_file');
      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000__read_file');
    });

    it('should handle different tool names', () => {
      expect(createPrefixedToolName(validUuid, 'write_file')).toBe(`${validUuid}__write_file`);
      expect(createPrefixedToolName(validUuid, 'list-resources')).toBe(`${validUuid}__list-resources`);
      expect(createPrefixedToolName(validUuid, 'tool_with_123')).toBe(`${validUuid}__tool_with_123`);
    });

    it('should handle tool names with special characters', () => {
      expect(createPrefixedToolName(validUuid, 'tool.name')).toBe(`${validUuid}__tool.name`);
      expect(createPrefixedToolName(validUuid, 'tool-name')).toBe(`${validUuid}__tool-name`);
      expect(createPrefixedToolName(validUuid, 'tool_name')).toBe(`${validUuid}__tool_name`);
    });

    it('should work with different UUID formats', () => {
      const uuid1 = '123e4567-e89b-12d3-a456-426614174000';
      const uuid2 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const uuid3 = '00000000-0000-0000-0000-000000000000';

      expect(createPrefixedToolName(uuid1, 'tool')).toBe(`${uuid1}__tool`);
      expect(createPrefixedToolName(uuid2, 'tool')).toBe(`${uuid2}__tool`);
      expect(createPrefixedToolName(uuid3, 'tool')).toBe(`${uuid3}__tool`);
    });

    it('should handle empty or invalid inputs gracefully', () => {
      // These should still create the prefix, validation happens elsewhere
      expect(createPrefixedToolName('', 'tool')).toBe('__tool');
      expect(createPrefixedToolName(validUuid, '')).toBe(`${validUuid}__`);
      expect(createPrefixedToolName(invalidUuid, 'tool')).toBe(`${invalidUuid}__tool`);
    });
  });

  describe('parsePrefixedToolName', () => {
    it('should parse valid prefixed tool name', () => {
      const prefixed = '550e8400-e29b-41d4-a716-446655440000__read_file';
      const result = parsePrefixedToolName(prefixed);
      
      expect(result).not.toBe(null);
      expect(result?.originalName).toBe('read_file');
      expect(result?.serverUuid).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return null for non-prefixed names', () => {
      expect(parsePrefixedToolName('read_file')).toBe(null);
      expect(parsePrefixedToolName('tool_name')).toBe(null);
      expect(parsePrefixedToolName('some-tool')).toBe(null);
    });

    it('should return null for invalid UUID prefix', () => {
      expect(parsePrefixedToolName('invalid-uuid__tool')).toBe(null);
      expect(parsePrefixedToolName('12345__tool')).toBe(null);
      expect(parsePrefixedToolName('not-a-uuid__tool')).toBe(null);
    });

    it('should handle tool names with multiple underscores', () => {
      const prefixed = `${validUuid}__tool__with__many__underscores`;
      const result = parsePrefixedToolName(prefixed);
      
      expect(result).not.toBe(null);
      expect(result?.originalName).toBe('tool__with__many__underscores');
      expect(result?.serverUuid).toBe(validUuid);
    });

    it('should return null for malformed prefixes', () => {
      expect(parsePrefixedToolName(`${validUuid}_tool`)).toBe(null); // Single underscore
      // Three underscores means tool name starts with underscore - this is valid
      expect(parsePrefixedToolName(`${validUuid}___tool`)).toEqual({
        originalName: '_tool',
        serverUuid: validUuid
      });
      expect(parsePrefixedToolName(`__${validUuid}__tool`)).toBe(null); // Leading underscores make invalid UUID
    });

    it('should validate UUID format strictly', () => {
      // Invalid UUID v4 formats
      expect(parsePrefixedToolName('550e8400-e29b-41d4-a716-44665544000__tool')).toBe(null); // Too short
      expect(parsePrefixedToolName('550e8400-e29b-41d4-a716-4466554400000__tool')).toBe(null); // Too long
      expect(parsePrefixedToolName('550e8400-e29b-61d4-a716-446655440000__tool')).toBe(null); // Wrong version
      expect(parsePrefixedToolName('550e8400-e29b-41d4-c716-446655440000__tool')).toBe(null); // Wrong variant
    });

    it('should handle edge cases', () => {
      expect(parsePrefixedToolName(`${validUuid}__`)).toBe(null); // Empty tool name
      expect(parsePrefixedToolName('__tool')).toBe(null); // Empty UUID
      expect(parsePrefixedToolName('____')).toBe(null); // Only separators
    });

    it('should be case-insensitive for UUID', () => {
      const upperUuid = validUuid.toUpperCase();
      const result = parsePrefixedToolName(`${upperUuid}__tool`);
      
      expect(result).not.toBe(null);
      expect(result?.serverUuid.toLowerCase()).toBe(validUuid);
    });
  });

  describe('Integration with tool mapping', () => {
    it('should handle round-trip conversion', () => {
      const originalName = 'complex_tool_name_123';
      const serverUuid = '123e4567-e89b-12d3-a456-426614174000';
      
      const prefixed = createPrefixedToolName(serverUuid, originalName);
      const parsed = parsePrefixedToolName(prefixed);
      
      expect(parsed).not.toBe(null);
      expect(parsed?.originalName).toBe(originalName);
      expect(parsed?.serverUuid).toBe(serverUuid);
    });

    it('should maintain tool name integrity', () => {
      const toolNames = [
        'read_file',
        'write-file',
        'list.resources',
        'tool_with_CAPS',
        '123_numeric_start',
        'tool@special#chars'
      ];

      toolNames.forEach(name => {
        const prefixed = createPrefixedToolName(validUuid, name);
        const parsed = parsePrefixedToolName(prefixed);
        expect(parsed?.originalName).toBe(name);
      });
    });
  });

  describe('Backward compatibility', () => {
    it('should handle both prefixed and non-prefixed calls', () => {
      const prefixedName = `${validUuid}__read_file`;
      const nonPrefixedName = 'read_file';
      
      // Prefixed name should be parseable
      const prefixedResult = parsePrefixedToolName(prefixedName);
      expect(prefixedResult).not.toBe(null);
      expect(prefixedResult?.originalName).toBe('read_file');
      
      // Non-prefixed name should return null (indicating no prefix)
      const nonPrefixedResult = parsePrefixedToolName(nonPrefixedName);
      expect(nonPrefixedResult).toBe(null);
    });
  });

  describe('Performance', () => {
    it('should handle large numbers of prefixed tools efficiently', () => {
      const uuids = Array.from({ length: 1000 }, (_, i) => 
        `${i.toString().padStart(8, '0')}-e29b-41d4-a716-446655440000`
      );
      
      const start = Date.now();
      
      uuids.forEach(uuid => {
        const prefixed = createPrefixedToolName(uuid, 'tool');
        parsePrefixedToolName(prefixed);
      });
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should process 1000 tools in under 100ms
    });
  });
});