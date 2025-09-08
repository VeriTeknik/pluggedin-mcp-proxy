/**
 * Custom Instructions Utilities
 * Helper functions for extracting and managing custom instructions
 */

export interface ServerContext {
  instructions: string;
  serverId: string;
  isReadOnly?: boolean;
  constraints?: string[];
}

export interface McpMessage {
  role: "user" | "assistant";
  content: Array<{ type: "text"; text: string }> | string;
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
    return serverData.customInstructions;
  }
  
  // If it's a string, convert to message format
  if (typeof serverData.customInstructions === 'string') {
    return [{
      role: "user",
      content: [{ type: "text", text: serverData.customInstructions }]
    }];
  }
  
  return null;
}

/**
 * Parse instruction constraints from message content
 */
export function parseInstructionConstraints(instructions: McpMessage[]): {
  isReadOnly: boolean;
  rateLimit?: number;
  restrictions: string[];
} {
  const constraints = {
    isReadOnly: false,
    rateLimit: undefined as number | undefined,
    restrictions: [] as string[]
  };
  
  if (!instructions || instructions.length === 0) {
    return constraints;
  }
  
  // Analyze all instruction messages for constraints
  instructions.forEach(msg => {
    const text = typeof msg.content === 'string' 
      ? msg.content 
      : msg.content.map(c => c.text).join(' ');
    
    const lowerText = text.toLowerCase();
    
    // Check for read-only constraint
    if (lowerText.includes('read-only') || lowerText.includes('readonly')) {
      constraints.isReadOnly = true;
      constraints.restrictions.push('read-only');
    }
    
    // Check for rate limiting
    const rateMatch = lowerText.match(/(\d+)\s*requests?\s*per\s*(minute|hour|second)/);
    if (rateMatch) {
      const limit = parseInt(rateMatch[1]);
      const unit = rateMatch[2];
      // Convert to requests per minute for consistency
      if (unit === 'hour') {
        constraints.rateLimit = Math.ceil(limit / 60);
      } else if (unit === 'second') {
        constraints.rateLimit = limit * 60;
      } else {
        constraints.rateLimit = limit;
      }
    }
    
    // Check for other restrictions
    if (lowerText.includes('no delete') || lowerText.includes('no deletion')) {
      constraints.restrictions.push('no-delete');
    }
    if (lowerText.includes('no update') || lowerText.includes('no modification')) {
      constraints.restrictions.push('no-update');
    }
    if (lowerText.includes('no write')) {
      constraints.restrictions.push('no-write');
    }
  });
  
  return constraints;
}

/**
 * Convert custom instructions to a context string
 */
export function formatInstructionsAsContext(
  serverName: string, 
  instructions: McpMessage[]
): string {
  if (!instructions || instructions.length === 0) {
    return '';
  }
  
  let context = `[Server Context for ${serverName}]\n`;
  
  instructions.forEach((msg, index) => {
    const text = typeof msg.content === 'string' 
      ? msg.content 
      : msg.content.map(c => c.text).join(' ');
    
    if (msg.role === 'user') {
      context += `Instruction ${index + 1}: ${text}\n`;
    } else {
      context += `Note ${index + 1}: ${text}\n`;
    }
  });
  
  return context;
}

/**
 * Build server contexts map from server data
 */
export function buildServerContextsMap(servers: any[]): Record<string, ServerContext> {
  const contexts: Record<string, ServerContext> = {};
  
  servers.forEach(server => {
    if (!server.customInstructions) {
      return;
    }
    
    const instructions = extractCustomInstructions(server);
    if (!instructions) {
      return;
    }
    
    const constraints = parseInstructionConstraints(instructions);
    const instructionText = formatInstructionsAsContext(server.name, instructions);
    
    contexts[server.name] = {
      instructions: instructionText,
      serverId: server.uuid,
      isReadOnly: constraints.isReadOnly,
      constraints: constraints.restrictions
    };
  });
  
  return contexts;
}

/**
 * Check if a tool operation violates constraints
 */
export function validateAgainstConstraints(
  toolName: string,
  constraints: string[]
): { valid: boolean; reason?: string } {
  const lowerToolName = toolName.toLowerCase();
  
  // Check read-only constraint
  if (constraints.includes('read-only')) {
    const writeOperations = ['create', 'update', 'delete', 'write', 'modify', 'insert', 'drop', 'alter'];
    if (writeOperations.some(op => lowerToolName.includes(op))) {
      return { 
        valid: false, 
        reason: 'This server is configured as read-only. Write operations are not permitted.' 
      };
    }
  }
  
  // Check no-delete constraint
  if (constraints.includes('no-delete')) {
    if (lowerToolName.includes('delete') || lowerToolName.includes('remove') || lowerToolName.includes('drop')) {
      return { 
        valid: false, 
        reason: 'Delete operations are not permitted on this server.' 
      };
    }
  }
  
  // Check no-update constraint  
  if (constraints.includes('no-update')) {
    if (lowerToolName.includes('update') || lowerToolName.includes('modify') || lowerToolName.includes('alter')) {
      return { 
        valid: false, 
        reason: 'Update operations are not permitted on this server.' 
      };
    }
  }
  
  // Check no-write constraint
  if (constraints.includes('no-write')) {
    const writeOperations = ['create', 'write', 'insert', 'add'];
    if (writeOperations.some(op => lowerToolName.includes(op))) {
      return { 
        valid: false, 
        reason: 'Write operations are not permitted on this server.' 
      };
    }
  }
  
  return { valid: true };
}