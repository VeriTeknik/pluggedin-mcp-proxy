/**
 * Custom Instructions Utilities
 * Helper functions for extracting and managing custom instructions
 */

/**
 * Message format from MCP servers
 */
export interface McpMessage {
  role: "user" | "assistant";
  content: Array<{ type: "text"; text: string }> | string;
}

/**
 * Represents parsed constraints from custom instructions
 */
export interface Constraints {
  readonly?: boolean;
  noWrites?: boolean;
  noDeletes?: boolean;
  noUpdates?: boolean;
  rateLimit?: {
    count: number;
    unit: 'second' | 'minute' | 'hour';
  };
  allowedOperations?: string[];
  deniedOperations?: string[];
}

/**
 * Represents the processed server context
 */
export interface ProcessedServerContext {
  formattedContext: string;
  constraints: Constraints;
  rawInstructions: string;
  serverUuid: string;
  serverName: string;
}

/**
 * Legacy server context interface for backward compatibility
 */
export interface ServerContext {
  instructions: string;
  serverId: string;
  isReadOnly?: boolean;
  constraints?: string[];
}

/**
 * Processes custom instructions in a single pass to extract both formatted context and constraints
 */
export function processInstructions(
  serverName: string,
  serverUuid: string,
  messages: McpMessage[]
): ProcessedServerContext | null {
  if (!messages || messages.length === 0) {
    return null;
  }
  
  // Extract raw instruction text from messages
  let rawInstructions = '';
  messages.forEach(msg => {
    const text = typeof msg.content === 'string' 
      ? msg.content 
      : msg.content.map(c => c.text).join('\n');
    rawInstructions += (rawInstructions ? '\n' : '') + text;
  });
  
  if (!rawInstructions) {
    return null;
  }
  
  const constraints: Constraints = {};
  const lowerInstructions = rawInstructions.toLowerCase();
  
  // Parse constraints from instructions
  
  // Check for read-only constraint
  if (lowerInstructions.includes('read-only') || lowerInstructions.includes('readonly')) {
    constraints.readonly = true;
  }
  
  // Check for no-writes constraint
  if (lowerInstructions.includes('no write') || lowerInstructions.includes('no mutation')) {
    constraints.noWrites = true;
  }
  
  // Check for no-delete constraint
  if (lowerInstructions.includes('no delete') || lowerInstructions.includes('no deletion')) {
    constraints.noDeletes = true;
  }
  
  // Check for no-update constraint
  if (lowerInstructions.includes('no update') || lowerInstructions.includes('no modification')) {
    constraints.noUpdates = true;
  }
  
  // Extract rate limits
  const rateLimitMatch = rawInstructions.match(/(\d+)\s*requests?\s*per\s*(second|minute|hour)/i);
  if (rateLimitMatch) {
    constraints.rateLimit = {
      count: parseInt(rateLimitMatch[1], 10),
      unit: rateLimitMatch[2].toLowerCase() as 'second' | 'minute' | 'hour'
    };
  }
  
  // Extract allowed operations if specified
  const allowedMatch = rawInstructions.match(/allowed\s*operations?:\s*([^\n]+)/i);
  if (allowedMatch) {
    constraints.allowedOperations = allowedMatch[1]
      .split(/[,;]/)
      .map(op => op.trim().toLowerCase())
      .filter(Boolean);
  }
  
  // Extract denied operations if specified
  const deniedMatch = rawInstructions.match(/(?:denied|forbidden|prohibited)\s*operations?:\s*([^\n]+)/i);
  if (deniedMatch) {
    constraints.deniedOperations = deniedMatch[1]
      .split(/[,;]/)
      .map(op => op.trim().toLowerCase())
      .filter(Boolean);
  }
  
  // Format the instructions for display
  let formattedContext = `### Server Context: ${serverName}\n\n`;
  
  // Add the instructions
  const lines = rawInstructions.split('\n').map(line => line.trim()).filter(Boolean);
  
  // If already has markdown headers, preserve them
  if (lines.some(line => line.startsWith('#'))) {
    formattedContext += rawInstructions;
  } else {
    // Format as a bulleted list for better readability
    formattedContext += lines.map(line => `- ${line}`).join('\n');
  }
  
  // Add parsed constraints summary if any exist
  if (Object.keys(constraints).length > 0) {
    formattedContext += '\n\n**Constraints:**\n';
    if (constraints.readonly) formattedContext += '- Read-only access\n';
    if (constraints.noWrites) formattedContext += '- No write operations\n';
    if (constraints.noDeletes) formattedContext += '- No delete operations\n';
    if (constraints.noUpdates) formattedContext += '- No update operations\n';
    if (constraints.rateLimit) {
      formattedContext += `- Rate limit: ${constraints.rateLimit.count} requests per ${constraints.rateLimit.unit}\n`;
    }
    if (constraints.allowedOperations) {
      formattedContext += `- Allowed operations: ${constraints.allowedOperations.join(', ')}\n`;
    }
    if (constraints.deniedOperations) {
      formattedContext += `- Denied operations: ${constraints.deniedOperations.join(', ')}\n`;
    }
  }
  
  return {
    formattedContext,
    constraints,
    rawInstructions,
    serverUuid,
    serverName
  };
}

/**
 * Extract custom instructions from server data
 */
export function extractCustomInstructions(serverData: any): McpMessage[] | null {
  if (!serverData.customInstructions) {
    return null;
  }
  
  // Handle both array and single instruction formats
  if (Array.isArray(serverData.customInstructions)) {
    // Check if it's already in McpMessage format (has role and content)
    if (serverData.customInstructions.length > 0 && 
        typeof serverData.customInstructions[0] === 'object' &&
        'role' in serverData.customInstructions[0] &&
        'content' in serverData.customInstructions[0]) {
      return serverData.customInstructions;
    }
    
    // If it's a simple string array, convert each string to McpMessage format
    if (serverData.customInstructions.every((item: any) => typeof item === 'string')) {
      return serverData.customInstructions.map((text: string) => ({
        role: "user" as const,
        content: [{ type: "text" as const, text }]
      }));
    }
    
    return serverData.customInstructions;
  }
  
  // If it's a string, convert to message format
  if (typeof serverData.customInstructions === 'string') {
    return [{
      role: "user" as const,
      content: [{ type: "text" as const, text: serverData.customInstructions }]
    }];
  }
  
  return null;
}

/**
 * Validates a tool invocation against constraints using server UUID lookup
 */
export function validateToolAgainstConstraints(
  toolName: string,
  serverUuid: string,
  constraintMap: Map<string, Constraints>
): { valid: boolean; reason?: string } {
  const constraints = constraintMap.get(serverUuid);
  if (!constraints) {
    return { valid: true }; // No constraints means allowed
  }
  
  const lowerToolName = toolName.toLowerCase();
  
  // Check allowed operations first (whitelist)
  if (constraints.allowedOperations && constraints.allowedOperations.length > 0) {
    const isAllowed = constraints.allowedOperations.some(op => 
      lowerToolName.includes(op)
    );
    if (!isAllowed) {
      return {
        valid: false,
        reason: `This operation is not in the allowed list: ${constraints.allowedOperations.join(', ')}`
      };
    }
  }
  
  // Check denied operations (blacklist)
  if (constraints.deniedOperations && constraints.deniedOperations.length > 0) {
    const isDenied = constraints.deniedOperations.some(op => 
      lowerToolName.includes(op)
    );
    if (isDenied) {
      return {
        valid: false,
        reason: `This operation is explicitly denied for this server`
      };
    }
  }
  
  // Check read-only constraint
  if (constraints.readonly) {
    const readPatterns = ['select', 'fetch', 'get', 'read', 'list', 'search', 'find', 
                         'check', 'describe', 'view', 'show', 'inspect', 'browse', 'query', 'scan'];
    const writePatterns = ['write', 'update', 'delete', 'create', 'insert', 'modify', 
                          'alter', 'drop', 'truncate', 'execute', 'commit', 'rollback', 'put', 'post', 'patch'];
    
    // If it explicitly has a read pattern, it's likely safe
    const hasReadPattern = readPatterns.some(pattern => lowerToolName.includes(pattern));
    
    // If it has a write pattern, it's not allowed
    const hasWritePattern = writePatterns.some(pattern => lowerToolName.includes(pattern));
    
    if (hasWritePattern && !hasReadPattern) {
      return { 
        valid: false, 
        reason: 'This server is configured as read-only. Write operations are not allowed.' 
      };
    }
  }
  
  // Check specific constraints
  if (constraints.noWrites) {
    const writePatterns = ['write', 'create', 'insert', 'add', 'put', 'post'];
    const hasWritePattern = writePatterns.some(pattern => lowerToolName.includes(pattern));
    if (hasWritePattern) {
      return { 
        valid: false, 
        reason: 'Write operations are not allowed for this server.' 
      };
    }
  }
  
  if (constraints.noDeletes) {
    const deletePatterns = ['delete', 'remove', 'drop', 'destroy', 'purge'];
    const hasDeletePattern = deletePatterns.some(pattern => lowerToolName.includes(pattern));
    if (hasDeletePattern) {
      return { 
        valid: false, 
        reason: 'Delete operations are not allowed for this server.' 
      };
    }
  }
  
  if (constraints.noUpdates) {
    const updatePatterns = ['update', 'modify', 'alter', 'patch', 'edit', 'change'];
    const hasUpdatePattern = updatePatterns.some(pattern => lowerToolName.includes(pattern));
    if (hasUpdatePattern) {
      return { 
        valid: false, 
        reason: 'Update operations are not allowed for this server.' 
      };
    }
  }
  
  // Rate limiting would need to be implemented with actual tracking
  // For now, we just acknowledge the constraint exists
  
  return { valid: true };
}

/**
 * Creates a constraint map for efficient lookup by server UUID
 */
export function buildConstraintMap(
  serverContexts: Map<string, ProcessedServerContext>
): Map<string, Constraints> {
  const map = new Map<string, Constraints>();
  
  for (const [uuid, context] of serverContexts.entries()) {
    if (context.constraints) {
      map.set(uuid, context.constraints);
    }
  }
  
  return map;
}

/**
 * Build server contexts map from server data (returns UUID-keyed map)
 */
export function buildServerContextsMap(servers: any[]): Map<string, ProcessedServerContext> {
  const contexts = new Map<string, ProcessedServerContext>();
  
  servers.forEach(server => {
    const instructions = extractCustomInstructions(server);
    if (!instructions) {
      return;
    }
    
    const processedContext = processInstructions(
      server.name || server.uuid,
      server.uuid,
      instructions
    );
    
    if (processedContext) {
      contexts.set(server.uuid, processedContext);
    }
  });
  
  return contexts;
}

/**
 * Convert ProcessedServerContext to legacy ServerContext format
 */
export function toLegacyServerContext(processed: ProcessedServerContext): ServerContext {
  const constraints: string[] = [];
  
  if (processed.constraints.readonly) constraints.push('read-only');
  if (processed.constraints.noWrites) constraints.push('no-write');
  if (processed.constraints.noDeletes) constraints.push('no-delete');
  if (processed.constraints.noUpdates) constraints.push('no-update');
  
  return {
    instructions: processed.formattedContext,
    serverId: processed.serverUuid,
    isReadOnly: processed.constraints.readonly,
    constraints
  };
}

/**
 * Helper to format server instructions for discovery response
 */
export function formatServerInstructionsForDiscovery(
  contexts: Map<string, ProcessedServerContext>
): string {
  if (contexts.size === 0) return '';
  
  const sections: string[] = [];
  
  for (const context of contexts.values()) {
    sections.push(context.formattedContext);
  }
  
  return sections.join('\n\n---\n\n');
}

/**
 * Format custom instructions for discovery output
 * This function fetches MCP servers and formats their custom instructions
 * for display in the discovery response
 */
export async function formatCustomInstructionsForDiscovery(): Promise<string> {
  try {
    // Dynamic import to avoid circular dependency
    const { getMcpServers } = await import('../fetch-pluggedinmcp.js');
    const serverDict = await getMcpServers();
    const servers = Object.values(serverDict);
    const serverContexts = buildServerContextsMap(servers);
    
    if (serverContexts.size === 0) {
      return '';
    }
    
    let output = '\n## 🔧 Server Custom Instructions (Auto-Injected)\n';
    output += 'The following custom instructions are automatically provided to AI assistants:\n\n';
    
    for (const [uuid, context] of serverContexts.entries()) {
      output += `### ${context.serverName}\n`;
      output += `**Instructions:** ${context.rawInstructions}\n\n`;
    }
    
    return output;
  } catch (error) {
    // Silently skip custom instructions if there's an error
    return '';
  }
}