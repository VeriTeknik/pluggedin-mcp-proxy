/**
 * MCP Protocol Constants
 *
 * These constants define the MCP protocol version and header names
 * to ensure consistency across the codebase and prevent typos.
 */

/**
 * Current MCP protocol version
 * @see https://spec.modelcontextprotocol.io/
 */
export const MCP_PROTOCOL_VERSION = '2024-11-05';

/**
 * HTTP header names for MCP protocol
 * Headers use Title-Case per MCP specification
 */
export const MCP_SESSION_ID_HEADER = 'Mcp-Session-Id';
export const MCP_PROTOCOL_VERSION_HEADER = 'Mcp-Protocol-Version';

/**
 * Port configuration constants
 */
export const MIN_PORT = 1;
export const MAX_PORT = 65535;
export const DEFAULT_PORT = 12006;

/**
 * JSON-RPC 2.0 error codes used in MCP
 * @see https://www.jsonrpc.org/specification
 */
export const JSON_RPC_ERROR_CODES = {
  /** Invalid Request - malformed request, unsupported protocol version */
  INVALID_REQUEST: -32600,
  /** Method not found - HTTP method not allowed */
  METHOD_NOT_FOUND: -32601,
  /** Internal error - server-side exception */
  INTERNAL_ERROR: -32603,
  /** Server error - Unauthorized (auth failure) */
  UNAUTHORIZED: -32001,
  /** Server error - Generic application error (session not found, etc.) */
  APPLICATION_ERROR: -32000,
} as const;
