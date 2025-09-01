/**
 * Test script to demonstrate slug-based tool prefixing
 * This shows how the automatic tool name collision resolution works
 */

import { createSlugPrefixedToolName, parseSlugPrefixedToolName } from './slug-utils.js';

// Mock data representing tools from different servers
const mockTools = [
  { name: 'read_file', serverSlug: 'filesystem-server', serverUuid: '550e8400-e29b-41d4-a716-446655440000' },
  { name: 'read_file', serverSlug: 'code-intel-server', serverUuid: '550e8400-e29b-41d4-a716-446655440001' },
  { name: 'list_projects', serverSlug: 'task-manager', serverUuid: '550e8400-e29b-41d4-a716-446655440002' },
  { name: 'list_projects', serverSlug: 'project-explorer', serverUuid: '550e8400-e29b-41d4-a716-446655440003' },
  { name: 'search', serverSlug: 'web-search', serverUuid: '550e8400-e29b-41d4-a716-446655440004' },
];

console.log('🔧 Slug-Based Tool Prefixing Demonstration');
console.log('=' .repeat(50));

console.log('\n📋 Original Tools (showing name collisions):');
mockTools.forEach((tool, index) => {
  console.log(`${index + 1}. ${tool.name} (from ${tool.serverSlug})`);
});

console.log('\n✅ Prefixed Tools (collision-free):');
const prefixedTools = mockTools.map(tool => {
  const prefixedName = createSlugPrefixedToolName(tool.serverSlug, tool.name);
  console.log(`• ${prefixedName}`);
  return { ...tool, prefixedName };
});

console.log('\n🔄 Parsing Demonstration:');
prefixedTools.forEach(tool => {
  const parsed = parseSlugPrefixedToolName(tool.prefixedName);
  if (parsed) {
    console.log(`• "${tool.prefixedName}" → server: "${parsed.serverSlug}", tool: "${parsed.originalName}"`);
  }
});

console.log('\n📊 Collision Analysis:');
const originalNames = mockTools.map(t => t.name);
const uniqueOriginal = new Set(originalNames);
console.log(`• Original tool names: ${originalNames.length} total, ${uniqueOriginal.size} unique`);
console.log(`• Name collisions detected: ${originalNames.length - uniqueOriginal.size}`);

const prefixedNames = prefixedTools.map(t => t.prefixedName);
const uniquePrefixed = new Set(prefixedNames);
console.log(`• Prefixed tool names: ${prefixedNames.length} total, ${uniquePrefixed.size} unique`);
console.log(`• All prefixed names are unique: ${uniquePrefixed.size === prefixedNames.length ? '✅ YES' : '❌ NO'}`);

console.log('\n🎯 Benefits:');
console.log('• ✅ Automatic collision resolution');
console.log('• ✅ Human-readable server identifiers');
console.log('• ✅ Backward compatibility maintained');
console.log('• ✅ No manual configuration required');
console.log('• ✅ Works with Claude Code and other MCP clients');

console.log('\n🚀 Ready for production use!');