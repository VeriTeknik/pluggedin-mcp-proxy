/**
  * Test file for UUID and slug-based tool prefixing functionality
  * Run with: npx ts-node src/test-uuid-prefixing.ts
  */

import { createPrefixedToolName, parsePrefixedToolName } from './mcp-proxy.js';
import { createSlugPrefixedToolName, parseSlugPrefixedToolName, generateSlug } from './slug-utils.js';

// Test UUID and tool name
const testServerUuid = '550e8400-e29b-41d4-a716-446655440000';
const testToolName = 'read_file';
const testServerName = 'GitHub Server';
const testServerSlug = generateSlug(testServerName); // Should be 'github-server'

console.log('🧪 Testing UUID and Slug-based Tool Prefixing\n');

// Test 1: Create prefixed tool name
console.log('Test 1: Creating prefixed tool name');
const prefixedName = createPrefixedToolName(testServerUuid, testToolName);
console.log(`Input: serverUuid="${testServerUuid}", toolName="${testToolName}"`);
console.log(`Output: "${prefixedName}"`);
console.log(`Expected: "${testServerUuid}__${testToolName}"`);
console.log(`✅ Pass: ${prefixedName === `${testServerUuid}__${testToolName}` ? 'Yes' : 'No'}\n`);

// Test 2: Parse prefixed tool name
console.log('Test 2: Parsing prefixed tool name');
const parsed = parsePrefixedToolName(prefixedName);
console.log(`Input: "${prefixedName}"`);
console.log(`Parsed:`, parsed);
console.log(`Expected: { originalName: "${testToolName}", serverUuid: "${testServerUuid}" }`);
const parseCorrect = parsed &&
  parsed.originalName === testToolName &&
  parsed.serverUuid === testServerUuid;
console.log(`✅ Pass: ${parseCorrect ? 'Yes' : 'No'}\n`);

// Test 2.5: Test slug generation
console.log('Test 2.5: Slug generation');
const generatedSlug = generateSlug(testServerName);
console.log(`Input: "${testServerName}"`);
console.log(`Generated slug: "${generatedSlug}"`);
console.log(`Expected: "${testServerSlug}"`);
console.log(`✅ Pass: ${generatedSlug === testServerSlug ? 'Yes' : 'No'}\n`);

// Test 2.6: Create slug-prefixed tool name
console.log('Test 2.6: Creating slug-prefixed tool name');
const slugPrefixedName = createSlugPrefixedToolName(testServerSlug, testToolName);
console.log(`Input: serverSlug="${testServerSlug}", toolName="${testToolName}"`);
console.log(`Output: "${slugPrefixedName}"`);
console.log(`Expected: "${testServerSlug}__${testToolName}"`);
console.log(`✅ Pass: ${slugPrefixedName === `${testServerSlug}__${testToolName}` ? 'Yes' : 'No'}\n`);

// Test 2.7: Parse slug-prefixed tool name
console.log('Test 2.7: Parsing slug-prefixed tool name');
const parsedSlug = parseSlugPrefixedToolName(slugPrefixedName);
console.log(`Input: "${slugPrefixedName}"`);
console.log(`Parsed:`, parsedSlug);
console.log(`Expected: { originalName: "${testToolName}", serverSlug: "${testServerSlug}" }`);
const parseSlugCorrect = parsedSlug &&
  parsedSlug.originalName === testToolName &&
  parsedSlug.serverSlug === testServerSlug;
console.log(`✅ Pass: ${parseSlugCorrect ? 'Yes' : 'No'}\n`);

// Test 3: Parse non-prefixed tool name
console.log('Test 3: Parsing non-prefixed tool name');
const nonPrefixed = 'simple_tool';
const parsedNonPrefixed = parsePrefixedToolName(nonPrefixed);
console.log(`Input: "${nonPrefixed}"`);
console.log(`Parsed:`, parsedNonPrefixed);
console.log(`Expected: null`);
console.log(`✅ Pass: ${parsedNonPrefixed === null ? 'Yes' : 'No'}\n`);

// Test 4: Parse invalid UUID
console.log('Test 4: Parsing invalid UUID format');
const invalidUuid = 'invalid-uuid__tool_name';
const parsedInvalid = parsePrefixedToolName(invalidUuid);
console.log(`Input: "${invalidUuid}"`);
console.log(`Parsed:`, parsedInvalid);
console.log(`Expected: null`);
console.log(`✅ Pass: ${parsedInvalid === null ? 'Yes' : 'No'}\n`);

// Test 5: Edge cases
console.log('Test 5: Edge cases');
const edgeCases = [
  // '__' at the end, no tool name
  'uuid__',
  // '__' at the start, no uuid
  '__tool',
  // Multiple '__' in the string
  'uuid__tool__extra',
  // Tool name with underscores
  '550e8400-e29b-41d4-a716-446655440000__tool_with_underscores',
  // Tool name with dashes
  '550e8400-e29b-41d4-a716-446655440000__tool-with-dashes',
  // Tool name with special characters
  '550e8400-e29b-41d4-a716-446655440000__tool!@#$%^&*()',
  // Tool name with emoji
  '550e8400-e29b-41d4-a716-446655440000__tool🚀',
  // Very long tool name
  '550e8400-e29b-41d4-a716-446655440000__' + 'a'.repeat(256),
  // Empty string as tool name
  '550e8400-e29b-41d4-a716-446655440000__',
  // Whitespace-only tool name
  '550e8400-e29b-41d4-a716-446655440000__    ',
  // '__' at the start and end
  '__tool__',
  // '__' only
  '__',
  // UUID only, no '__'
  '550e8400-e29b-41d4-a716-446655440000',
];

console.log('UUID-based edge cases:');
edgeCases.forEach((testCase, index) => {
  const result = parsePrefixedToolName(testCase);
  console.log(`Edge case ${index + 1}: "${testCase}" -> ${result ? JSON.stringify(result) : 'null'}`);
});

// Test 6: Slug-based edge cases
console.log('\nTest 6: Slug-based edge cases');
const slugEdgeCases = [
  'slug__',
  '__tool',
  'slug__tool__extra',
  'github-server__tool_with_underscores',
  'github-server__tool-with-dashes',
  'invalid-slug!__tool',
  'Valid-Slug__tool'
];

slugEdgeCases.forEach((testCase, index) => {
  const result = parseSlugPrefixedToolName(testCase);
  console.log(`Slug edge case ${index + 1}: "${testCase}" -> ${result ? JSON.stringify(result) : 'null'}`);
});

console.log('\n🎉 UUID and Slug-based Prefixing Tests Complete!');