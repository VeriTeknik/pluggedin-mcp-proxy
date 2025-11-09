/**
 * Smithery-compatible server entry point for Plugged.in MCP Proxy
 *
 * This module exports a createServer function and configuration schema
 * that Smithery can use to deploy the MCP proxy to the cloud using
 * Streamable HTTP transport.
 *
 * @see https://smithery.ai/docs/build/deployments/typescript
 */

import { z } from "zod";
import { createServer as createMCPServer } from "./mcp-proxy.js";
import { startStreamableHTTPServer } from "./streamable-http.js";
import { MIN_PORT, MAX_PORT, DEFAULT_PORT } from "./constants.js";

/**
 * Configuration schema for Smithery deployment
 * Smithery will auto-generate a configuration UI from this schema
 */
export const configSchema = z.object({
  PLUGGEDIN_API_KEY: z.string()
    .optional()
    .describe("Your Plugged.in API key for authenticated operations (see plugged.in/api-keys). Leave empty for tool discovery only."),
  PLUGGEDIN_API_BASE_URL: z.string()
    .optional()
    .default("https://plugged.in")
    .describe("Base URL for your Plugged.in instance (optional, defaults to https://plugged.in)"),
  PORT: z.string()
    .optional()
    .default("12006")
    .describe("Port for the HTTP server (defaults to 12006)"),
  REQUIRE_API_AUTH: z.string()
    .optional()
    .default("false")
    .describe("Require API key authentication for HTTP requests (true/false, defaults to false)"),
});

/**
 * Server factory function for Smithery Cloud deployment
 *
 * This function creates and starts the MCP proxy server with
 * Streamable HTTP transport, suitable for cloud deployment.
 *
 * @param config - Configuration object validated against configSchema
 * @returns Server instance with cleanup function
 */
export async function createServer(config: z.infer<typeof configSchema>) {
  // Set environment variables from config
  if (config.PLUGGEDIN_API_KEY) {
    process.env.PLUGGEDIN_API_KEY = config.PLUGGEDIN_API_KEY;
  }
  if (config.PLUGGEDIN_API_BASE_URL) {
    process.env.PLUGGEDIN_API_BASE_URL = config.PLUGGEDIN_API_BASE_URL;
  }

  // Parse configuration with validation
  let port = parseInt(config.PORT || String(DEFAULT_PORT), 10);
  if (isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
    port = DEFAULT_PORT;
  }
  const requireApiAuth = config.REQUIRE_API_AUTH === "true";

  // Create the MCP server
  const { server, cleanup: serverCleanup } = await createMCPServer();

  // Start Streamable HTTP server (required for Smithery Cloud)
  const transportCleanup = await startStreamableHTTPServer(server, {
    port,
    requireApiAuth,
    stateless: false, // Use stateful mode (session-based) for better performance
  });

  // Return server instance with cleanup function
  return {
    server,
    cleanup: async () => {
      await serverCleanup();
      await transportCleanup();
      await server.close();
    },
  };
}

/**
 * Export configuration schema for Smithery to generate UI
 */
export { configSchema as schema };
