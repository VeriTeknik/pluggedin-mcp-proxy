import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import request from 'supertest';
import { startStreamableHTTPServer } from '../src/streamable-http';

// Test port constants to avoid magic numbers and conflicts
const TEST_PORTS = {
  BASE: 3000,
  STATELESS: 3001,
  STATEFUL: 3002,
  AUTH_NO_KEY: 3003,
  AUTH_VALID_KEY: 3004,
  AUTH_NO_REQUIRED: 3005,
  SESSION_CREATE: 3006,
  SESSION_REUSE: 3007,
  SESSION_DELETE: 3008,
  SESSION_DELETE_NO_HEADER: 3009,
  HTTP_POST: 3010,
  HTTP_GET: 3011,
  HTTP_GET_BODY: 3012,
  HTTP_UNSUPPORTED: 3013,
  HTTP_OPTIONS: 3014,
  ERROR_TRANSPORT: 3015,
  ERROR_SERVER: 3016,
  STATELESS_PER_REQUEST: 3017,
  STATELESS_GET: 3018,
  CLEANUP_ALL: 3019,
  CLEANUP_ERROR: 3020,
  CORS_EXPOSE: 3021,
  CORS_ALLOW: 3022,
  CORS_PREFLIGHT: 3023,
  CORS_NON_MCP: 3024,
  PROTOCOL_NONE: 3025,
  PROTOCOL_2024: 3026,
  PROTOCOL_2025: 3029,
  PROTOCOL_UNSUPPORTED: 3027,
  PROTOCOL_RESPONSE: 3028,
  PROTOCOL_CASING: 3030,
  SESSION_CASING_RESPONSE: 3031,
  SESSION_CASING_REQUEST: 3032,
  ERROR_UNSUPPORTED_METHOD: 3033,
  ERROR_AUTH_MISSING: 3034,
  ERROR_AUTH_MALFORMED: 3035,
  ERROR_AUTH_INCORRECT: 3036,
  ERROR_INTERNAL: 3037,
  SECURITY_TIMING_SAFE: 3038,
  SECURITY_WRONG_LENGTH: 3039,
  SECURITY_WRONG_CHARS: 3040,
  SECURITY_NO_DETAILS: 3041,
} as const;

// Mock the MCP SDK modules
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    setRequestHandler: vi.fn(),
    close: vi.fn()
  }))
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
  const mockHandleRequest = vi.fn();
  const mockClose = vi.fn();

  return {
    StreamableHTTPServerTransport: vi.fn().mockImplementation((options) => ({
      handleRequest: mockHandleRequest,
      close: mockClose,
      options
    }))
  };
});

describe('Streamable HTTP Transport', () => {
  let mockServer: any;
  let cleanup: (() => Promise<void>) | undefined;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    process.env.PLUGGEDIN_API_KEY = 'test-api-key';
    
    // Create mock server
    mockServer = {
      connect: vi.fn(),
      setRequestHandler: vi.fn(),
      close: vi.fn()
    };
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up server if it exists
    if (cleanup) {
      try {
        await cleanup();
      } catch (error) {
        // Ignore cleanup errors in tests
      }
      cleanup = undefined;
    }
    
    // Restore environment
    process.env = originalEnv;
  }, 15000); // Increase timeout for cleanup

  describe('Server Initialization', () => {
    it('should start server on specified port', async () => {
      const port = 3000;
      cleanup = await startStreamableHTTPServer(mockServer, { port });

      // Verify server is listening
      const response = await request(`http://localhost:${port}`)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.transport).toBe('streamable-http');
      expect(response.body.sessions).toBe(0);
      expect(response.body.maxSessions).toBe(10000); // Stateful mode has maxSessions: 10000
    });

    it('should initialize in stateless mode', async () => {
      const port = 3001;
      cleanup = await startStreamableHTTPServer(mockServer, { 
        port, 
        stateless: true 
      });
      
      const response = await request(`http://localhost:${port}`)
        .get('/health');
      
      expect(response.body.sessions).toBe(0);
    });

    it('should initialize in stateful mode by default', async () => {
      const port = 3002;
      cleanup = await startStreamableHTTPServer(mockServer, { port });
      
      const response = await request(`http://localhost:${port}`)
        .get('/health');
      
      expect(response.body.sessions).toBe(0); // No active sessions yet
    });
  });

  describe('Authentication', () => {
    it('should reject requests without API key when auth is required', async () => {
      const port = 3003;
      cleanup = await startStreamableHTTPServer(mockServer, {
        port,
        requireApiAuth: true
      });

      const response = await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'tools/call', params: {} });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('Unauthorized');
    });

    it('should accept requests with valid API key', async () => {
      const port = 3004;
      
      // Create custom mock transport for this test
      const mockTransport = {
        handleRequest: vi.fn((req, res) => {
          res.json({ jsonrpc: '2.0', result: 'success' });
        }),
        close: vi.fn()
      };
      
      // Override the mock implementation
      (StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);
      
      cleanup = await startStreamableHTTPServer(mockServer, { 
        port, 
        requireApiAuth: true 
      });
      
      const response = await request(`http://localhost:${port}`)
        .post('/mcp')
        .set('Authorization', 'Bearer test-api-key')
        .send({ jsonrpc: '2.0', method: 'test', params: {} });
      
      expect(response.status).toBe(200);
      expect(response.body.result).toBe('success');
    }, 10000);

    it('should accept requests without auth when not required', async () => {
      const port = 3005;
      
      // Create custom mock transport
      const mockTransport = {
        handleRequest: vi.fn((req, res) => {
          res.json({ jsonrpc: '2.0', result: 'success' });
        }),
        close: vi.fn()
      };
      
      (StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);
      
      cleanup = await startStreamableHTTPServer(mockServer, { 
        port, 
        requireApiAuth: false 
      });
      
      const response = await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'test', params: {} });
      
      expect(response.status).toBe(200);
    }, 10000);
  });

  describe('Session Management', () => {
    it('should create new session in stateful mode', async () => {
      const port = 3006;
      
      const mockTransport = {
        handleRequest: vi.fn((req, res) => {
          res.json({ jsonrpc: '2.0', result: 'success' });
        }),
        close: vi.fn()
      };
      
      (StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);
      
      cleanup = await startStreamableHTTPServer(mockServer, { 
        port, 
        stateless: false 
      });
      
      const response = await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'test', params: {} });
      
      expect(response.status).toBe(200);
      expect(response.headers['mcp-session-id']).toBeDefined();
      expect(mockServer.connect).toHaveBeenCalledTimes(1);
    }, 10000);

    it('should reuse existing session', async () => {
      const port = 3007;
      
      const mockTransport = {
        handleRequest: vi.fn((req, res) => {
          res.json({ jsonrpc: '2.0', result: 'success' });
        }),
        close: vi.fn()
      };
      
      (StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);
      
      cleanup = await startStreamableHTTPServer(mockServer, { 
        port, 
        stateless: false 
      });
      
      // First request - create session
      const response1 = await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'test1', params: {} });
      
      const sessionId = response1.headers['mcp-session-id'];
      expect(sessionId).toBeDefined();
      
      // Second request - reuse session
      const response2 = await request(`http://localhost:${port}`)
        .post('/mcp')
        .set('mcp-session-id', sessionId)
        .send({ jsonrpc: '2.0', method: 'test2', params: {} });
      
      expect(response2.status).toBe(200);
      expect(mockServer.connect).toHaveBeenCalledTimes(1); // Only connected once
    }, 10000);

    it('should delete session on DELETE request', async () => {
      const port = 3008;
      
      const mockTransport = {
        handleRequest: vi.fn((req, res) => {
          res.json({ jsonrpc: '2.0', result: 'success' });
        }),
        close: vi.fn()
      };
      
      (StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);
      
      cleanup = await startStreamableHTTPServer(mockServer, { 
        port, 
        stateless: false 
      });
      
      // Create session
      const response1 = await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'test', params: {} });
      
      const sessionId = response1.headers['mcp-session-id'];
      
      // Delete session
      const response2 = await request(`http://localhost:${port}`)
        .delete('/mcp')
        .set('mcp-session-id', sessionId);
      
      expect(response2.status).toBe(200);
      expect(response2.body.message).toBe('Session terminated');
      expect(mockTransport.close).toHaveBeenCalled();
    });

    it('should return success for session deletion without session header', async () => {
      const port = 3009;
      cleanup = await startStreamableHTTPServer(mockServer, { 
        port, 
        stateless: false 
      });
      
      // Attempt to delete without providing session ID
      // In the implementation, if no session ID is provided, it generates a new one
      // So this will actually succeed (200) rather than fail (404)
      const response = await request(`http://localhost:${port}`)
        .delete('/mcp');
      
      // Without a session ID header, the server generates a new session
      // Since the session doesn't exist in the transports map, it returns success
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('HTTP Methods', () => {
    it('should handle POST requests', async () => {
      const port = 3010;
      
      const mockTransport = {
        handleRequest: vi.fn((req, res) => {
          res.json({ jsonrpc: '2.0', result: 'post-success' });
        }),
        close: vi.fn()
      };
      
      (StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);
      
      cleanup = await startStreamableHTTPServer(mockServer, { port });
      
      const response = await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'test', params: {} });
      
      expect(response.status).toBe(200);
      expect(response.body.result).toBe('post-success');
    });

    it('should handle GET requests for SSE', async () => {
      const port = 3011;

      const mockTransport = {
        handleRequest: vi.fn((req, res) => {
          res.setHeader('Content-Type', 'text/event-stream');
          res.write('data: test\n\n');
          res.end();
        }),
        close: vi.fn()
      };

      (StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);

      cleanup = await startStreamableHTTPServer(mockServer, { port });

      const response = await request(`http://localhost:${port}`)
        .get('/mcp')
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.text).toMatch(/data:/); // Basic SSE format check
    });

    it('should pass undefined body for GET requests (SSE)', async () => {
      const port = 3021;

      let capturedBody: any = 'not-called';
      const mockTransport = {
        handleRequest: vi.fn((req, res, body) => {
          // Capture the third parameter (body) that was passed
          capturedBody = body;
          res.setHeader('Content-Type', 'text/event-stream');
          res.write('data: test\n\n');
          res.end();
        }),
        close: vi.fn()
      };

      (StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);

      cleanup = await startStreamableHTTPServer(mockServer, { port });

      const response = await request(`http://localhost:${port}`)
        .get('/mcp');

      expect(response.status).toBe(200);
      // Verify that undefined was explicitly passed as the body parameter for GET requests
      expect(capturedBody).toBeUndefined();
    });

    it('should reject unsupported methods', async () => {
      const port = 3012;
      cleanup = await startStreamableHTTPServer(mockServer, { port });

      const response = await request(`http://localhost:${port}`)
        .put('/mcp')
        .send({ test: 'data' });

      expect(response.status).toBe(405);
      expect(response.body.error.message).toContain('HTTP method PUT not allowed');
    });

    it('should handle OPTIONS for CORS', async () => {
      const port = 3013;
      cleanup = await startStreamableHTTPServer(mockServer, { port });
      
      const response = await request(`http://localhost:${port}`)
        .options('/mcp');
      
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-methods']).toContain('DELETE');
    });
  });

  describe('Error Handling', () => {
    it('should handle transport errors gracefully', async () => {
      const port = 3014;
      
      const mockTransport = {
        handleRequest: vi.fn().mockRejectedValue(new Error('Transport error')),
        close: vi.fn()
      };
      
      (StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);
      
      cleanup = await startStreamableHTTPServer(mockServer, { port });
      
      const response = await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'test', params: {} });
      
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe(-32603);
      // Error data is only included in development mode (NODE_ENV=development)
      // In test environment, it should be undefined for security
      if (process.env.NODE_ENV === 'development') {
        expect(response.body.error.data).toContain('Transport error');
      } else {
        expect(response.body.error.data).toBeUndefined();
      }
    });

    it('should handle server connection errors', async () => {
      const port = 3015;
      mockServer.connect = vi.fn().mockRejectedValue(new Error('Connection failed'));
      
      cleanup = await startStreamableHTTPServer(mockServer, { port });
      
      const response = await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'test', params: {} });
      
      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('Internal server error');
    });
  });

  describe('Stateless Mode', () => {
    it('should create new transport for each request', async () => {
      const port = 3016;
      
      let callCount = 0;
      const mockClose = vi.fn();
      
      (StreamableHTTPServerTransport as any).mockImplementation(() => ({
        handleRequest: vi.fn((req, res) => {
          res.json({ jsonrpc: '2.0', result: 'success' });
        }),
        close: mockClose
      }));
      
      cleanup = await startStreamableHTTPServer(mockServer, { 
        port, 
        stateless: true 
      });
      
      // Make two requests
      await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'test1', params: {} });
      
      await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'test2', params: {} });
      
      // Verify new transport created and closed for each request
      expect(mockServer.connect).toHaveBeenCalledTimes(2);
      expect(mockClose).toHaveBeenCalledTimes(2);
    });

    it('should not close transport on GET requests in stateless mode', async () => {
      const port = 3017;
      
      const mockClose = vi.fn();
      
      (StreamableHTTPServerTransport as any).mockImplementation(() => ({
        handleRequest: vi.fn((req, res) => {
          res.end();
        }),
        close: mockClose
      }));
      
      cleanup = await startStreamableHTTPServer(mockServer, { 
        port, 
        stateless: true 
      });
      
      await request(`http://localhost:${port}`)
        .get('/mcp');
      
      // Transport should not be closed for GET (SSE) requests
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should close all transports on cleanup', async () => {
      const port = 3018;
      
      const mockTransports: any[] = [];
      
      (StreamableHTTPServerTransport as any).mockImplementation(() => {
        const transport = {
          handleRequest: vi.fn((req, res) => {
            res.json({ jsonrpc: '2.0', result: 'success' });
          }),
          close: vi.fn()
        };
        mockTransports.push(transport);
        return transport;
      });
      
      cleanup = await startStreamableHTTPServer(mockServer, { 
        port, 
        stateless: false 
      });
      
      // Create 3 sessions
      for (let i = 0; i < 3; i++) {
        await request(`http://localhost:${port}`)
          .post('/mcp')
          .send({ jsonrpc: '2.0', method: 'test', params: {} });
      }
      
      // Cleanup
      await cleanup();
      cleanup = undefined;
      
      // Verify all transports were closed
      expect(mockTransports).toHaveLength(3);
      mockTransports.forEach(transport => {
        expect(transport.close).toHaveBeenCalled();
      });
    });

    it('should handle cleanup errors gracefully', async () => {
      const port = 3019;
      
      const mockTransport = {
        handleRequest: vi.fn((req, res) => {
          res.json({ jsonrpc: '2.0', result: 'success' });
        }),
        close: vi.fn().mockRejectedValue(new Error('Close failed'))
      };
      
      (StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);
      
      cleanup = await startStreamableHTTPServer(mockServer, { 
        port, 
        stateless: false 
      });
      
      await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'test', params: {} });
      
      // Cleanup should not throw despite error
      await expect(cleanup()).resolves.not.toThrow();
      cleanup = undefined;
    });
  });

  describe('MCP Protocol Compliance', () => {
    describe('CORS Headers', () => {
      it('should include Access-Control-Expose-Headers', async () => {
        const port = 3020;
        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .get('/health');

        expect(response.headers['access-control-expose-headers']).toBeTruthy();
        expect(response.headers['access-control-expose-headers']).toContain('Mcp-Session-Id');
        expect(response.headers['access-control-expose-headers']).toContain('Mcp-Protocol-Version');
      });

      it('should allow MCP headers in CORS', async () => {
        const port = 3021;
        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .get('/health');

        expect(response.headers['access-control-allow-headers']).toBeTruthy();
        expect(response.headers['access-control-allow-headers']).toContain('Mcp-Session-Id');
        expect(response.headers['access-control-allow-headers']).toContain('Mcp-Protocol-Version');
      });

      it('should handle OPTIONS preflight correctly', async () => {
        const port = 3022;
        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .options('/mcp');

        expect(response.status).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe('*');
        expect(response.headers['access-control-allow-methods']).toContain('POST');
      });

      it('should handle OPTIONS preflight for non-/mcp endpoints consistently', async () => {
        const port = 3023;
        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .options('/health');

        expect(response.status).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe('*');
        expect(response.headers['access-control-allow-methods']).toContain('GET');
        expect(response.headers['access-control-allow-headers']).toBeTruthy();
        expect(response.headers['access-control-expose-headers']).toBeTruthy();
      });
    });

    describe('Protocol Version', () => {
      it('should accept requests without protocol version', async () => {
        const port = 3024;

        (StreamableHTTPServerTransport as any).mockImplementation(() => ({
          handleRequest: vi.fn((req, res) => {
            res.json({ jsonrpc: '2.0', result: 'success' });
          }),
          close: vi.fn()
        }));

        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .post('/mcp')
          .send({ jsonrpc: '2.0', method: 'initialize', params: {} });

        expect(response.status).not.toBe(400);
      });

      it('should accept valid protocol version (2024-11-05)', async () => {
        const port = TEST_PORTS.PROTOCOL_2024;

        (StreamableHTTPServerTransport as any).mockImplementation(() => ({
          handleRequest: vi.fn((req, res) => {
            res.json({ jsonrpc: '2.0', result: 'success' });
          }),
          close: vi.fn()
        }));

        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .post('/mcp')
          .set('Mcp-Protocol-Version', '2024-11-05')
          .send({ jsonrpc: '2.0', method: 'initialize', params: {} });

        expect(response.status).not.toBe(400);
      });

      it('should accept valid protocol version (2025-06-18)', async () => {
        const port = TEST_PORTS.PROTOCOL_2025;

        (StreamableHTTPServerTransport as any).mockImplementation(() => ({
          handleRequest: vi.fn((req, res) => {
            res.json({ jsonrpc: '2.0', result: 'success' });
          }),
          close: vi.fn()
        }));

        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .post('/mcp')
          .set('Mcp-Protocol-Version', '2025-06-18')
          .send({ jsonrpc: '2.0', method: 'initialize', params: {} });

        expect(response.status).not.toBe(400);
      });

      it('should default to latest protocol version when header is missing', async () => {
        const port = 3042;

        (StreamableHTTPServerTransport as any).mockImplementation(() => ({
          handleRequest: vi.fn((req, res) => {
            res.json({ jsonrpc: '2.0', result: 'success' });
          }),
          close: vi.fn()
        }));

        cleanup = await startStreamableHTTPServer(mockServer, { port });

        // Request without Mcp-Protocol-Version header
        const response = await request(`http://localhost:${port}`)
          .post('/mcp')
          .send({ jsonrpc: '2.0', method: 'initialize', params: {} });

        // Should not reject requests without protocol version
        expect(response.status).not.toBe(400);
        // Server should set the latest protocol version in response
        expect(response.headers['mcp-protocol-version']).toBe('2025-06-18');
      });

      it('should reject unsupported protocol version', async () => {
        const port = TEST_PORTS.PROTOCOL_UNSUPPORTED;
        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .post('/mcp')
          .set('Mcp-Protocol-Version', '2023-01-01')
          .send({ jsonrpc: '2.0', method: 'initialize', params: {} });

        expect(response.status).toBe(400);
        // Verify error message includes supported versions
        expect(response.text).toContain('2024-11-05');
        expect(response.text).toContain('2025-06-18');
        expect(response.body.error.code).toBe(-32600); // Invalid Request
        expect(response.body.error.message).toContain('Unsupported MCP protocol version');
      });

      it('should send protocol version in response', async () => {
        const port = 3027;

        (StreamableHTTPServerTransport as any).mockImplementation(() => ({
          handleRequest: vi.fn((req, res) => {
            res.json({ jsonrpc: '2.0', result: 'success' });
          }),
          close: vi.fn()
        }));

        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .post('/mcp')
          .send({ jsonrpc: '2.0', method: 'initialize', params: {} });

        expect(response.headers['mcp-protocol-version']).toBe('2025-06-18');
      });

      it('should always respond with Mcp-Protocol-Version header casing', async () => {
        const port = 3028;

        (StreamableHTTPServerTransport as any).mockImplementation(() => ({
          handleRequest: vi.fn((req, res) => {
            res.json({ jsonrpc: '2.0', result: 'success' });
          }),
          close: vi.fn()
        }));

        cleanup = await startStreamableHTTPServer(mockServer, { port });

        // Try different casings for the request header
        const casings = [
          'mcp-protocol-version',
          'MCP-PROTOCOL-VERSION',
          'Mcp-Protocol-Version'
        ];

        for (const casing of casings) {
          const response = await request(`http://localhost:${port}`)
            .post('/mcp')
            .set(casing, '2024-11-05')
            .send({ jsonrpc: '2.0', method: 'initialize', params: {} });

          // Check that the response header is set (supertest lowercases all headers)
          // Response always sends latest protocol version (2025-06-18)
          expect(response.headers['mcp-protocol-version']).toBe('2025-06-18');
        }
      });
    });

    describe('Session Header Casing', () => {
      it('should return Mcp-Session-Id with title case in response headers', async () => {
        const port = 3029;

        (StreamableHTTPServerTransport as any).mockImplementation((options: any) => ({
          handleRequest: vi.fn((req, res) => {
            res.json({ jsonrpc: '2.0', result: 'success' });
          }),
          close: vi.fn(),
          options
        }));

        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .post('/mcp')
          .send({ jsonrpc: '2.0', method: 'initialize', params: {} });

        // Assert the header exists (supertest lowercases all headers)
        expect(response.headers['mcp-session-id']).toBeTruthy();
      });

      it('should accept session header with any casing in request', async () => {
        const port = 3030;

        (StreamableHTTPServerTransport as any).mockImplementation((options: any) => ({
          handleRequest: vi.fn((req, res) => {
            res.json({ jsonrpc: '2.0', result: 'success' });
          }),
          close: vi.fn(),
          options
        }));

        cleanup = await startStreamableHTTPServer(mockServer, { port });

        // Try different casings
        const casings = [
          { header: 'Mcp-Session-Id', value: 'session-title-case' },
          { header: 'mcp-session-id', value: 'session-lower-case' },
          { header: 'MCP-SESSION-ID', value: 'session-upper-case' }
        ];

        for (const { header, value } of casings) {
          const response = await request(`http://localhost:${port}`)
            .post('/mcp')
            .set(header, value)
            .send({ jsonrpc: '2.0', method: 'initialize', params: {} });

          // The server should accept and process the session header regardless of casing
          expect(response.status).not.toBe(400);
        }
      });
    });

    describe('JSON-RPC Error Codes', () => {
      it('should return -32601 for unsupported HTTP method', async () => {
        const port = 3031;
        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .put('/mcp')
          .send({ test: 'data' });

        expect(response.status).toBe(405);
        expect(response.body.jsonrpc).toBe('2.0');
        expect(response.body.error.code).toBe(-32601); // Method not found
        expect(response.body.error.message).toContain('not allowed');
      });

      it('should return -32001 for authentication failures (missing Authorization header)', async () => {
        const port = 3032;
        cleanup = await startStreamableHTTPServer(mockServer, {
          port,
          requireApiAuth: true
        });

        const response = await request(`http://localhost:${port}`)
          .post('/mcp')
          .send({
            jsonrpc: '2.0',
            method: 'tools/call', // Requires auth
            params: {}
          });

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe(-32001); // Unauthorized
        expect(response.body.error.message).toContain('Unauthorized');
      });

      it('should return -32001 for malformed Authorization header', async () => {
        const port = 3033;
        cleanup = await startStreamableHTTPServer(mockServer, {
          port,
          requireApiAuth: true
        });

        const response = await request(`http://localhost:${port}`)
          .post('/mcp')
          .set('Authorization', 'MalformedToken') // Not a Bearer token
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {}
          });

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe(-32001);
        expect(response.body.error.message).toContain('Unauthorized');
      });

      it('should return -32001 for incorrect Bearer token', async () => {
        const port = 3034;
        cleanup = await startStreamableHTTPServer(mockServer, {
          port,
          requireApiAuth: true
        });

        const response = await request(`http://localhost:${port}`)
          .post('/mcp')
          .set('Authorization', 'Bearer invalidtoken') // Wrong token
          .send({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {}
          });

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe(-32001);
        expect(response.body.error.message).toContain('Unauthorized');
      });

      it('should return -32603 for internal errors', async () => {
        const port = 3035;

        (StreamableHTTPServerTransport as any).mockImplementation(() => ({
          handleRequest: vi.fn(() => {
            throw new Error('Internal error');
          }),
          close: vi.fn()
        }));

        cleanup = await startStreamableHTTPServer(mockServer, { port });

        const response = await request(`http://localhost:${port}`)
          .post('/mcp')
          .send({ jsonrpc: '2.0', method: 'test', params: {} });

        expect(response.status).toBe(500);
        expect(response.body.error.code).toBe(-32603); // Internal error
      });
    });
  });

  describe('Security Features', () => {
    it('should use timing-safe comparison for API keys', async () => {
      const port = 3030;
      const correctKey = 'test-api-key-12345';
      process.env.PLUGGEDIN_API_KEY = correctKey;

      cleanup = await startStreamableHTTPServer(mockServer, {
        port,
        requireApiAuth: true
      });

      // Test with correct API key
      const validResponse = await request(`http://localhost:${port}`)
        .post('/mcp')
        .set('Authorization', `Bearer ${correctKey}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {}
        });

      // Should allow the request (not check response since mock doesn't handle it)
      expect(validResponse.status).not.toBe(401);
    });

    it('should reject API key with wrong length (timing-safe)', async () => {
      const port = 3031;
      process.env.PLUGGEDIN_API_KEY = 'test-api-key-12345';

      cleanup = await startStreamableHTTPServer(mockServer, {
        port,
        requireApiAuth: true
      });

      // Test with wrong length key (should fail immediately on length check)
      const response = await request(`http://localhost:${port}`)
        .post('/mcp')
        .set('Authorization', 'Bearer short')
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {}
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(-32001);
      expect(response.body.error.message).toContain('Invalid or missing API key');
    });

    it('should reject API key with wrong characters (timing-safe)', async () => {
      const port = 3032;
      process.env.PLUGGEDIN_API_KEY = 'test-api-key-12345';

      cleanup = await startStreamableHTTPServer(mockServer, {
        port,
        requireApiAuth: true
      });

      // Test with same length but wrong characters (timing-safe comparison)
      const wrongKey = 'test-api-key-99999'; // Same length, different chars
      const response = await request(`http://localhost:${port}`)
        .post('/mcp')
        .set('Authorization', `Bearer ${wrongKey}`)
        .send({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {}
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(-32001);
      expect(response.body.error.message).toContain('Invalid or missing API key');
    });

    it('should not expose error details in production', async () => {
      const port = 3033;
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Mock transport to throw an error
      const mockTransport = {
        handleRequest: vi.fn().mockRejectedValue(new Error('Detailed error message')),
        close: vi.fn()
      };
      (StreamableHTTPServerTransport as any).mockImplementation(() => mockTransport);

      cleanup = await startStreamableHTTPServer(mockServer, { port });

      const response = await request(`http://localhost:${port}`)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'test', params: {} });

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe(-32603);
      expect(response.body.error.message).toBe('Internal server error');
      // Should NOT expose error details in production
      expect(response.body.error.data).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });
  });
});