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
} from './constants.js';
import {
  corsMiddleware,
  versionMiddleware,
  acceptMiddleware,
  createAuthMiddleware,
  createWellKnownHandler,
  resolveTransport,
} from './middleware.js';

// Map to store active transports by session ID (for stateful mode)
const transports = new Map<string, StreamableHTTPServerTransport>();

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
      const transport = await resolveTransport(req, res, server, stateless, transports);
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
          } else if (sessionId && transports.has(sessionId)) {
            // Session exists, delete it
            const transport = transports.get(sessionId)!;
            await transport.close();
            transports.delete(sessionId);
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
          data: error instanceof Error ? error.message : String(error)
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
      sessions: stateless ? 0 : transports.size 
    });
  });

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
    // Close all active transports
    for (const [sessionId, transport] of transports) {
      try {
        await transport.close();
      } catch (error) {
        debugError(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    transports.clear();

    // Close the HTTP server
    return new Promise((resolve) => {
      httpServer.close(() => {
        debugLog('Streamable HTTP server stopped');
        resolve();
      });
    });
  };
}
