import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { randomUUID } from 'crypto';
import { debugLog, debugError } from './debug-log.js';

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
  const { port, requireApiAuth, stateless } = options;

  // CORS middleware - apply to ALL routes first (including static files)
  app.use((req: any, res: any, next: any) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Serve static files from .well-known directory (for Smithery discovery)
  // This must come AFTER CORS but BEFORE authentication
  app.use('/.well-known', express.static('.well-known', {
    setHeaders: (res, path) => {
      // Set proper Content-Type for mcp-config file
      if (path.endsWith('mcp-config')) {
        res.setHeader('Content-Type', 'application/json');
      }
    }
  }));

  // Also expose well-known under /mcp/.well-known to support reverse proxies that prefix routes
  app.use('/mcp/.well-known', express.static('.well-known', {
    setHeaders: (res, path) => {
      if (path.endsWith('mcp-config')) {
        res.setHeader('Content-Type', 'application/json');
      }
    }
  }));

  // Middleware to parse JSON bodies
  app.use(express.json());

  // Authentication middleware - only for MCP endpoint
  const setupMiddleware = (req: any, res: any, next: any) => {
    // Lazy authentication - only check for tool invocations
    if (req.path === '/mcp' && requireApiAuth && req.method === 'POST') {
      // Parse the request body to check if it's a tool invocation
      const body = req.body;
      if (body && typeof body === 'object') {
        const method = body.method;
        // Only require auth for tool/resource calls, not for capability discovery
        const requiresAuth = method && (
          method.startsWith('tools/') || 
          method.startsWith('resources/') ||
          method === 'tools/call' ||
          method === 'resources/read'
        );
        
        if (requiresAuth) {
          const authHeader = req.headers.authorization;
          const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
          
          if (!apiKey || apiKey !== process.env.PLUGGEDIN_API_KEY) {
            return res.status(401).json({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'Unauthorized: Invalid or missing API key'
              },
              id: body.id || null
            });
          }
        }
      }
    }
    
    next();
  };

  // Apply middleware to all routes
  app.use(setupMiddleware);

  // Shared MCP handler used for both /mcp and / routes
  const mcpHandler = async (req: any, res: any) => {
    try {
      let transport: StreamableHTTPServerTransport;
      let sessionId: string | undefined;

      if (stateless) {
        // Create a new transport for each request in stateless mode
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined // Disable session management in stateless mode
        });
        await server.connect(transport);
      } else {
        // Use session-based transport management
        sessionId = req.headers['mcp-session-id'] as string || randomUUID();
        
        if (!transports.has(sessionId)) {
          // Create a new transport for this session
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId!,
            onsessioninitialized: (id) => {
              debugLog(`Session initialized: ${id}`);
            }
          });
          transports.set(sessionId, transport);
          await server.connect(transport);
          
          // Set session ID in response header
          res.setHeader('mcp-session-id', sessionId);
        } else {
          transport = transports.get(sessionId)!;
        }
      }

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
          if (!stateless && sessionId && transports.has(sessionId)) {
            const transport = transports.get(sessionId)!;
            await transport.close();
            transports.delete(sessionId);
            res.status(200).json({ success: true, message: 'Session terminated' });
          } else if (!stateless && sessionId && !transports.has(sessionId)) {
            // Session ID provided but doesn't exist - return success as nothing to delete
            res.status(200).json({ success: true, message: 'Session not found' });
          } else if (stateless) {
            // In stateless mode, always return success
            res.status(200).json({ success: true, message: 'Stateless mode - no session to terminate' });
          } else {
            res.status(404).json({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'Session not found'
              }
            });
          }
          break;
          
        default:
          res.status(405).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: `Method ${req.method} not allowed`
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
          code: -32603,
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
