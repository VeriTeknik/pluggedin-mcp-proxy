#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mcp-proxy.js";
import { Command } from "commander";
import { startStreamableHTTPServer } from "./streamable-http.js";

const program = new Command();

program
  .name("pluggedin-mcp-proxy")
  .description("PluggedinMCP MCP Server - The One MCP to manage all your MCPs")
  .option(
    "--pluggedin-api-key <key>",
    "API key for PluggedinMCP (can also be set via PLUGGEDIN_API_KEY env var)"
  )
  .option(
    "--pluggedin-api-base-url <url>",
    "Base URL for PluggedinMCP API (can also be set via PLUGGEDIN_API_BASE_URL env var)"
  )
  .option(
    "--transport <type>",
    "Transport type: stdio (default) or streamable-http",
    "stdio"
  )
  .option(
    "--port <number>",
    "Port for Streamable HTTP server (default: 12006)",
    "12006"
  )
  .option(
    "--stateless",
    "Enable stateless mode for Streamable HTTP (new transport per request)"
  )
  .option(
    "--require-api-auth",
    "Require API key authentication for Streamable HTTP requests"
  )
  // Allow unknown options and excess arguments to prevent errors when called by MCP inspector
  .allowUnknownOption()
  .allowExcessArguments()
  // Removed --report option
  .parse(process.argv);

const options = program.opts();

// Validate and sanitize command line arguments before setting environment variables
if (options['pluggedinApiKey']) {
  // Validate API key format (alphanumeric, hyphens, underscores)
  const sanitizedApiKey = String(options['pluggedinApiKey']).replace(/[^a-zA-Z0-9_-]/g, '');
  if (sanitizedApiKey.length > 0) {
    process.env.PLUGGEDIN_API_KEY = sanitizedApiKey;
  }
}
if (options.pluggedinApiBaseUrl) {
  // Validate URL format (basic URL characters only)
  const sanitizedUrl = String(options.pluggedinApiBaseUrl).replace(/[^a-zA-Z0-9:/.\\-_]/g, '');
  // Basic URL validation
  try {
    new URL(sanitizedUrl);
    process.env.PLUGGEDIN_API_BASE_URL = sanitizedUrl;
  } catch (error) {
    console.error("Invalid API base URL provided");
    process.exit(1);
  }
}

async function main() {
  // Removed --report flag handling

  try {
    // Create the MCP server
    const { server, cleanup: serverCleanup } = await createServer();
    
    // Initialize transport based on the selected type
    let transportCleanup: (() => Promise<void>) | null = null;
    
    if (options.transport === 'streamable-http') {
      // Streamable HTTP transport
      const port = parseInt(options.port, 10) || 12006;
      // Only log to console for HTTP transport, not STDIO
      console.log(`Starting Streamable HTTP server on port ${port}...`);
      
      transportCleanup = await startStreamableHTTPServer(server, {
        port,
        requireApiAuth: options.requireApiAuth,
        stateless: options.stateless
      });
      
      // For HTTP server, we don't need to handle stdin
    } else {
      // Default to STDIO transport
      const transport = new StdioServerTransport();
      await server.connect(transport);
      
      // Cleanup function for STDIO
      transportCleanup = async () => {
        await transport.close();
      };
      
      // Handle stdin for STDIO mode
      process.stdin.resume();
      process.stdin.on("end", () => process.exit(0));
      process.stdin.on("close", () => process.exit(0));
    }

    // Combined cleanup handler
    const handleExit = async () => {
      await serverCleanup();
      if (transportCleanup) {
        await transportCleanup();
      }
      await server.close();
      process.exit(0);
    };

    // Cleanup on exit signals
    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);

  } catch (error) {
    // Exit if startup fails
    process.exit(1);
  }
}

// Keep the outer catch for any unhandled promise rejections from main itself
main().catch((error) => {
  // Don't log to console for STDIO transport as it interferes with protocol
  process.exit(1); // Ensure exit on unhandled error
});
