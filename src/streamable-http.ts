/**
 * Streamable HTTP Server Transport for MCP Proxy
 *
 * MCP Protocol Compliance:
 * - Headers use Title-Case per MCP spec (Mcp-Session-Id, Mcp-Protocol-Version)
 * - CORS headers expose custom headers to clients
 * - Protocol version validation (2024-11-05)
 * - JSON-RPC 2.0 compliant error codes
 *
 * JSON-RPC Error Codes Used:
 * - -32600: Invalid Request (malformed request, unsupported protocol version)
 * - -32601: Method not found (HTTP method not allowed)
 * - -32603: Internal error (server-side exception)
 * - -32001: Server error - Unauthorized (auth failure)
 * - -32000: Server error - Generic application error (session not found, etc.)
 */

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { debugLog, debugError } from './debug-log.js';
import {
  MCP_SESSION_ID_HEADER,
  JSON_RPC_ERROR_CODES,
  SESSION_TTL_MS,
  SESSION_CLEANUP_INTERVAL_MS,
  MAX_SESSIONS,
} from './constants.js';
import {
  corsMiddleware,
  versionMiddleware,
  acceptMiddleware,
  createAuthMiddleware,
  createWellKnownHandler,
  resolveTransport,
} from './middleware.js';

// Session metadata interface
interface SessionMetadata {
  transport: StreamableHTTPServerTransport;
  lastAccess: number;
}

// Map to store active sessions with metadata (for stateful mode)
const sessions = new Map<string, SessionMetadata>();

/**
 * Clean up expired sessions based on TTL
 * @returns Number of sessions cleaned up
 */
function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [sessionId, metadata] of sessions.entries()) {
    if (now - metadata.lastAccess > SESSION_TTL_MS) {
      try {
        metadata.transport.close().catch(error => {
          debugError(`Error closing expired session ${sessionId}:`, error);
        });
      } catch (error) {
        debugError(`Error closing expired session ${sessionId}:`, error);
      }
      sessions.delete(sessionId);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    debugLog(`Cleaned up ${cleanedCount} expired sessions`);
  }

  return cleanedCount;
}

/**
 * Evict oldest session when max sessions limit is reached (LRU eviction)
 */
function evictOldestSession(): void {
  if (sessions.size === 0) return;

  let oldestSessionId: string | null = null;
  let oldestAccessTime = Infinity;

  // Find session with oldest access time
  for (const [sessionId, metadata] of sessions.entries()) {
    if (metadata.lastAccess < oldestAccessTime) {
      oldestAccessTime = metadata.lastAccess;
      oldestSessionId = sessionId;
    }
  }

  if (oldestSessionId) {
    const metadata = sessions.get(oldestSessionId);
    if (metadata) {
      try {
        metadata.transport.close().catch(error => {
          debugError(`Error closing evicted session ${oldestSessionId}:`, error);
        });
      } catch (error) {
        debugError(`Error closing evicted session ${oldestSessionId}:`, error);
      }
      sessions.delete(oldestSessionId);
      debugLog(`Evicted oldest session ${oldestSessionId} (LRU eviction)`);
    }
  }
}

export interface StreamableHTTPOptions {
  port: number;
  requireApiAuth?: boolean;
  stateless?: boolean;
}

/**
 * Start a Streamable HTTP server for the MCP proxy
 * @param server The MCP server instance
 * @param options Configuration options
 * @returns Cleanup function to stop the HTTP server
 */
export async function startStreamableHTTPServer(
  server: Server,
  options: StreamableHTTPOptions
): Promise<() => Promise<void>> {
  const app = express();
  const { port, requireApiAuth = false, stateless = false } = options;

  // Apply middleware in order: CORS, version validation, accept normalization
  app.use(corsMiddleware);
  app.use(versionMiddleware);
  app.use(acceptMiddleware);

  // Serve static files from .well-known directory (for Smithery discovery)
  // This must come AFTER CORS but BEFORE authentication
  const wellKnownHandler = createWellKnownHandler();
  app.use('/.well-known', wellKnownHandler);
  app.use('/mcp/.well-known', wellKnownHandler);

  // Middleware to parse JSON bodies
  app.use(express.json());

  // Authentication middleware - only for MCP endpoint
  app.use(createAuthMiddleware(requireApiAuth));

  // Shared MCP handler used for both /mcp and / routes
  const mcpHandler = async (req: any, res: any) => {
    try {
      const transport = await resolveTransport(req, res, server, stateless, sessions);
      const sessionId = stateless ? undefined : (req.headers['mcp-session-id'] as string);

      // Handle different HTTP methods
      switch (req.method) {
        case 'POST':
          // POST requests have req.body parsed by express.json() middleware
          // Pass the parsed body to avoid "stream is not readable" error
          await transport.handleRequest(req, res, req.body);
          break;

        case 'GET':
          // GET requests (SSE) don't have a request body
          // Pass undefined explicitly as body parameter is optional
          await transport.handleRequest(req, res, undefined);
          break;
          
        case 'DELETE':
          // Handle session termination
          if (stateless) {
            // In stateless mode, always return success
            res.status(200).json({ success: true, message: 'Stateless mode - no session to terminate' });
          } else if (sessionId && sessions.has(sessionId)) {
            // Session exists, delete it
            const metadata = sessions.get(sessionId)!;
            await metadata.transport.close();
            sessions.delete(sessionId);
            res.status(200).json({ success: true, message: 'Session terminated' });
          } else {
            // Session ID not provided or doesn't exist - return success as nothing to delete
            res.status(200).json({ success: true, message: 'Session not found' });
          }
          break;

        default:
          res.status(405).json({
            jsonrpc: '2.0',
            error: {
              code: JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
              message: `HTTP method ${req.method} not allowed`
            }
          });
      }
      
      // Clean up transport in stateless mode
      if (stateless && req.method !== 'GET') {
        await transport.close();
      }
    } catch (error) {
      debugError('Error handling request:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
          message: 'Internal server error',
          // Only expose error details in development to prevent information disclosure
          ...(process.env.NODE_ENV === 'development' && {
            data: error instanceof Error ? error.message : String(error)
          })
        }
      });
    }
  };

  // MCP endpoint handler (preferred path)
  app.all('/mcp', mcpHandler);

  // Fallback root path handler for clients that POST to base URL
  app.all('/', mcpHandler);

  // Health check endpoint
  app.get('/health', (_req: any, res: any) => {
    res.json({
      status: 'ok',
      transport: 'streamable-http',
      sessions: stateless ? 0 : sessions.size,
      maxSessions: stateless ? 0 : MAX_SESSIONS
    });
  });

  // Set up periodic session cleanup (only in stateful mode)
  let cleanupInterval: NodeJS.Timeout | null = null;
  if (!stateless) {
    cleanupInterval = setInterval(() => {
      cleanupExpiredSessions();
    }, SESSION_CLEANUP_INTERVAL_MS);
    debugLog(`Session cleanup interval started (every ${SESSION_CLEANUP_INTERVAL_MS / 1000}s)`);
  }

  // Start the Express server
  const httpServer = app.listen(port, () => {
    debugLog(`Streamable HTTP server listening on port ${port}`);
    if (stateless) {
      debugLog('Running in stateless mode');
    } else {
      debugLog('Running in stateful mode (session-based)');
    }
    if (requireApiAuth) {
      debugLog('API authentication required');
    }
  });

  // Return cleanup function
  return async () => {
    // Clear cleanup interval
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      debugLog('Session cleanup interval stopped');
    }

    // Close all active sessions
    for (const [sessionId, metadata] of sessions) {
      try {
        await metadata.transport.close();
      } catch (error) {
        debugError(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    sessions.clear();

    // Close the HTTP server
    return new Promise((resolve) => {
      httpServer.close(() => {
        debugLog('Streamable HTTP server stopped');
        resolve();
      });
    });
  };
}
