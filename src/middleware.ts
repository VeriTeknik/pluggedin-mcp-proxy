/**
 * Express Middleware for MCP Streamable HTTP Server
 *
 * This module contains reusable middleware functions for:
 * - CORS headers
 * - Protocol version validation
 * - Accept header normalization
 * - Authentication
 * - Static file serving for .well-known endpoints
 */

import express, { RequestHandler } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { randomUUID } from 'crypto';
import { debugLog } from './debug-log.js';
import {
  MCP_PROTOCOL_VERSION,
  MCP_SESSION_ID_HEADER,
  MCP_PROTOCOL_VERSION_HEADER,
  JSON_RPC_ERROR_CODES,
} from './constants.js';

/**
 * CORS middleware - allows cross-origin requests
 * Exposes custom MCP headers to clients per spec
 */
export const corsMiddleware: RequestHandler = (req: any, res: any, next: any) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    `Content-Type, Authorization, ${MCP_SESSION_ID_HEADER}, ${MCP_PROTOCOL_VERSION_HEADER}`
  );
  // MCP spec: Expose custom headers so clients can read them
  res.header(
    'Access-Control-Expose-Headers',
    `${MCP_SESSION_ID_HEADER}, ${MCP_PROTOCOL_VERSION_HEADER}`
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
};

/**
 * Protocol version validation middleware
 * Validates and sets MCP protocol version headers
 */
export const versionMiddleware: RequestHandler = (req: any, res: any, next: any) => {
  // Only validate on MCP endpoint requests
  if ((req.path === '/mcp' || req.path === '/') && req.method === 'POST') {
    const version = req.headers['mcp-protocol-version'];

    // Protocol version is optional but if provided, validate it
    if (version && version !== MCP_PROTOCOL_VERSION) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: JSON_RPC_ERROR_CODES.INVALID_REQUEST,
          message: `Unsupported MCP protocol version: ${version}. Supported: ${MCP_PROTOCOL_VERSION}`
        },
        id: null
      });
    }

    // Always send our protocol version in response
    res.setHeader(MCP_PROTOCOL_VERSION_HEADER, MCP_PROTOCOL_VERSION);
  }
  next();
};

/**
 * Accept header normalization middleware
 * Ensures both application/json and text/event-stream are acceptable
 */
export const acceptMiddleware: RequestHandler = (req: any, _res: any, next: any) => {
  const raw = (req.headers['accept'] as string | undefined)?.trim() || '';
  const parts = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const ensure = (mime: string) => {
    if (!parts.some((p) => p.includes(mime))) parts.push(mime);
  };
  ensure('application/json');
  ensure('text/event-stream');
  req.headers['accept'] = parts.join(', ');
  next();
};

/**
 * Creates authentication middleware factory
 * @param requireApiAuth - Whether to require API authentication
 */
export function createAuthMiddleware(requireApiAuth: boolean): RequestHandler {
  return (req: any, res: any, next: any) => {
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
                code: JSON_RPC_ERROR_CODES.UNAUTHORIZED,
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
}

/**
 * Creates a static file handler for .well-known endpoints
 * Sets proper Content-Type for mcp-config files
 */
export function createWellKnownHandler() {
  return express.static('.well-known', {
    setHeaders: (res, path) => {
      // Set proper Content-Type for mcp-config file
      if (path.endsWith('mcp-config')) {
        res.setHeader('Content-Type', 'application/json');
      }
    }
  });
}

/**
 * Resolves or creates a transport for the current request
 * Handles both stateful (session-based) and stateless modes
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param server - MCP server instance
 * @param stateless - Whether to use stateless mode
 * @param transports - Map of active transports (for stateful mode)
 */
export async function resolveTransport(
  req: any,
  res: any,
  server: Server,
  stateless: boolean,
  transports: Map<string, StreamableHTTPServerTransport>
): Promise<StreamableHTTPServerTransport> {
  if (stateless) {
    // Create a new transport for each request in stateless mode
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined // Disable session management in stateless mode
    });
    await server.connect(transport);
    return transport;
  }

  // Use session-based transport management
  // MCP spec: Use title case for custom headers
  const sessionId = req.headers['mcp-session-id'] as string || randomUUID();

  if (!transports.has(sessionId)) {
    // Create a new transport for this session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: (id) => {
        debugLog(`Session initialized: ${id}`);
      }
    });
    transports.set(sessionId, transport);
    await server.connect(transport);

    // Set session ID in response header (title case per MCP spec)
    res.setHeader(MCP_SESSION_ID_HEADER, sessionId);
  }

  return transports.get(sessionId)!;
}
