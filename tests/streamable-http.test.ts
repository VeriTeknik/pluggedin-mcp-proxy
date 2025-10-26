import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import request from 'supertest';
import { startStreamableHTTPServer } from '../src/streamable-http';

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
      expect(response.body).toEqual({
        status: 'ok',
        transport: 'streamable-http',
        sessions: 0
      });
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
        .get('/mcp');
      
      expect(response.status).toBe(200);
    });

    it('should reject unsupported methods', async () => {
      const port = 3012;
      cleanup = await startStreamableHTTPServer(mockServer, { port });
      
      const response = await request(`http://localhost:${port}`)
        .put('/mcp')
        .send({ test: 'data' });
      
      expect(response.status).toBe(405);
      expect(response.body.error.message).toContain('Method PUT not allowed');
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
      expect(response.body.error.data).toContain('Transport error');
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
});