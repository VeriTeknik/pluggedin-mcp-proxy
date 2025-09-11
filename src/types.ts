// src/types.ts

/**
 * Configuration parameters for a downstream MCP server,
 * typically fetched from the pluggedin-app API.
 * Matches the structure previously defined locally in fetch-pluggedinmcp.ts.
 */
export interface ServerParameters {
  uuid: string; // Added
  name: string;
  description?: string; // Added (optional based on original)
  command?: string | null; // Keep null possibility
  args?: string[] | null; // Keep null possibility
  env?: Record<string, string> | null; // Keep null possibility
  url?: string | null; // For SSE servers, keep null possibility
  type: 'STDIO' | 'SSE' | 'STREAMABLE_HTTP'; // Type of server connection
  created_at?: string; // Added (optional based on original)
  profile_uuid?: string; // Added (optional based on original)
  status?: string; // Added (optional based on original)
  // Streamable HTTP specific fields
  oauthToken?: string; // OAuth token for authentication
  headers?: Record<string, string>; // Custom headers for requests
  sessionId?: string; // Session ID for stateful connections
  oauth?: {
    clientId?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
  }; // OAuth configuration for authorization code flow
  // Custom instructions from API
  customInstructions?: string;
  customInstructionsDescription?: string;
  // StreamableHTTP options (from pluggedin-app encrypted storage)
  streamableHTTPOptions?: {
    headers?: Record<string, string>;
    sessionId?: string;
  };
  // Add other relevant fields fetched from the API if needed
}

/**
 * Represents the JSON schema definition for a tool's input.
 * Based on standard JSON Schema subset.
 */
export interface ToolSchema {
  type: string; // e.g., 'object', 'string', 'number'
  properties?: Record<string, any>; // For object type
  required?: string[]; // For object type
  items?: any; // For array type
  enum?: any[]; // For string or number types
  description?: string;
  default?: any;
  additionalProperties?: boolean | ToolSchema;
  // Add other relevant JSON Schema properties as needed
}

/**
 * Represents an MCP Tool definition.
 */
export interface Tool {
  name: string;
  description?: string;
  inputSchema: ToolSchema;
  // Add outputSchema if needed/available
}

/**
 * Represents the result structure returned by a tool execution call.
 * Aligns with CompatibilityCallToolResultSchema from MCP SDK, allowing various content types.
 * Content is optional as the SDK schema might represent states without content.
 */
export interface ToolExecutionResult {
  content?: Array< // Made content optional
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
    | Record<string, any> // Allow other potential object types as a fallback
  >;
  isError?: boolean;
}

/**
 * Represents a resource definition as returned by ListResources.
 * Based on MCP SDK Resource type, omitting content fields.
 */
export interface ResourceInfo {
  uri: string;
  name?: string;
  description?: string;
  mediaType?: string; // Note: MCP SDK uses mediaType
}

/**
 * Represents a resource template definition.
 * Based on MCP SDK ResourceTemplate type.
 */
export interface ResourceTemplate {
  uriTemplate: string; // URI template (RFC 6570)
  name?: string;
  description?: string;
  mediaType?: string; // Optional MIME type
}

/**
 * Structure for reporting tools to the pluggedin-app API.
 * Matches the interface defined in report-tools.ts.
 */
export interface PluggedinMCPToolReport extends Tool {
  mcp_server_uuid: string;
  status?: string; // e.g., 'ACTIVE', 'INACTIVE'
}

/**
 * Structure for reporting resources to the pluggedin-app API.
 * Matches the interface defined in report-tools.ts.
 */
export interface PluggedinMCPResourceReport extends ResourceInfo {
  mcp_server_uuid: string;
  // Add status if needed for resources
}

/**
 * Structure for caching tool names (stringified JSON list) with expiration.
 */
export interface ToolsCacheEntry {
  value: string;
  expiresAt: number;
}

// Add other shared types as needed throughout the project.
