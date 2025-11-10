# Smithery Cloud Deployment

Deploy the plugged.in MCP Proxy to Smithery Cloud for hosted, always-available access to your MCP servers.

## What is Smithery?

[Smithery](https://smithery.ai) is a cloud platform for deploying and hosting MCP servers. It provides:
- **Zero-configuration deployment** - Deploy directly from GitHub
- **Automatic scaling** - Handle multiple concurrent connections
- **Built-in monitoring** - Track usage and performance
- **Easy configuration** - Web-based UI for settings

## Deploying to Smithery

1. **Visit Smithery**: Go to [smithery.ai](https://smithery.ai) and sign in
2. **Connect Repository**: Link your GitHub account and select the `pluggedin-mcp` repository
3. **Configure Settings**: Smithery will auto-detect the configuration from `smithery.yaml`
4. **Set API Key**: Enter your Plugged.in API key in the configuration UI
5. **Deploy**: Click deploy and your proxy will be available via HTTP

## Configuration Options

Smithery will present a configuration UI based on the exported schema. Available options:

| Setting | Description | Default |
|---------|-------------|---------|
| **PLUGGEDIN_API_KEY** | Your Plugged.in API key (required for full functionality) | - |
| **PLUGGEDIN_API_BASE_URL** | Base URL for your Plugged.in instance | `https://plugged.in` |
| **PORT** | HTTP server port | `12006` |
| **REQUIRE_API_AUTH** | Require API authentication for requests | `false` |

## Deployment Modes

### Smithery Cloud (HTTP Only)
- Uses Streamable HTTP transport
- Stateful session management
- Accessible via HTTPS endpoint
- Suitable for web applications and remote clients
- Configuration via Smithery UI

### Local CLI (STDIO)
- Uses STDIO transport (default)
- Direct process communication
- For Claude Desktop, Cline, Cursor
- Configuration via environment variables or CLI flags

## Using Your Deployed Proxy

Once deployed, connect to your Smithery-hosted proxy using the provided endpoint:

```bash
# Example connection URL (Smithery provides this)
https://your-deployment.smithery.ai/mcp
```

Configure your MCP client to use the HTTP endpoint:

```json
{
  "mcpServers": {
    "pluggedin-cloud": {
      "url": "https://your-deployment.smithery.ai/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

## Benefits of Cloud Deployment

- **24/7 Availability**: Your MCP proxy is always running
- **No Local Resources**: Offload processing to the cloud
- **Multiple Clients**: Share access across devices and applications
- **Automatic Updates**: Deploy new versions with a single click
- **Scalability**: Handle multiple concurrent sessions

## Dual Deployment Strategy

You can run both local and cloud instances:

**Local (STDIO)**: For Claude Desktop, Cursor, and Cline on your machine
```bash
npx -y @pluggedin/pluggedin-mcp-proxy@latest --pluggedin-api-key YOUR_KEY
```

**Cloud (HTTP)**: For web applications, remote access, and shared use
```
https://your-deployment.smithery.ai/mcp
```

Both instances connect to the same Plugged.in account, giving you flexibility in how you access your MCP servers.

## Technical Details

### Server Entry Point

The Smithery deployment uses `src/server.ts` which exports a `createServer` function and configuration schema:

```typescript
import { z } from "zod";
import { createServer as createMCPServer } from "./mcp-proxy.js";
import { startStreamableHTTPServer } from "./streamable-http.js";

export const configSchema = z.object({
  PLUGGEDIN_API_KEY: z.string().optional(),
  PLUGGEDIN_API_BASE_URL: z.string().optional().default("https://plugged.in"),
  PORT: z.string().optional().default("12006"),
  REQUIRE_API_AUTH: z.string().optional().default("false"),
});

export async function createServer(config: z.infer<typeof configSchema>) {
  // Configuration and server setup
  // Returns server instance with cleanup function
}
```

### Smithery YAML Configuration

The `smithery.yaml` file defines deployment settings:

```yaml
# Smithery Cloud Deployment Configuration
# See: https://smithery.ai/docs/build/deployments/typescript

# Server type and entry point
server:
  type: typescript
  # Smithery will use the exported createServer function
  module: src/server.ts

# MCP server metadata
mcp:
  name: plugged.in-mcp-proxy
  version: "1.10.5"
  description: "Unified MCP Hub - Aggregate multiple MCP servers into one connection"

# Docker configuration
docker:
  enabled: true
  file: Dockerfile
```

### Well-Known Discovery

The server exposes `.well-known/mcp-config` for Smithery discovery:

```json
{
  "schemaVersion": "1.0",
  "name": "pluggedin-mcp-proxy",
  "version": "1.10.5",
  "description": "Plugged.in MCP Proxy - Unified interface for multiple MCP servers",
  "capabilities": {
    "tools": true,
    "resources": true,
    "prompts": true
  }
}
```

## Troubleshooting

### Tool Discovery Issues

If tools aren't appearing in Smithery:

1. **Check API Key**: Ensure `PLUGGEDIN_API_KEY` is set correctly
2. **Verify API Base URL**: Confirm `PLUGGEDIN_API_BASE_URL` points to the right instance
3. **Check Logs**: Review Smithery deployment logs for errors
4. **Test Locally**: Verify the proxy works locally with the same configuration

### Authentication Errors

If you're getting 401 Unauthorized errors:

1. **API Key Format**: Ensure your API key is valid and not expired
2. **Check Headers**: Verify the `Authorization: Bearer YOUR_KEY` header is set
3. **Lazy Auth**: Note that auth is only required for tool/resource calls, not discovery

### Connection Timeouts

If connections are timing out:

1. **Network Issues**: Check if Smithery can reach `PLUGGEDIN_API_BASE_URL`
2. **API Availability**: Verify the Plugged.in instance is accessible
3. **Rate Limiting**: Check if you're hitting rate limits

### Protocol Version Errors (Fixed in v1.11.1)

If Smithery scanner fails with protocol version errors:

**Issue**: Scanner uses MCP protocol version `2025-06-18`, but older versions only supported `2024-11-05`

**Solution**: Upgrade to v1.11.1 or later, which supports both protocol versions:
```bash
# Pull latest version
docker pull ghcr.io/veriteknik/pluggedin-mcp:v1.11.1

# Or update your Smithery deployment to use the latest tag
```

**Supported Versions**:
- ✅ `2024-11-05` (backward compatibility)
- ✅ `2025-06-18` (Smithery scanner)

The server automatically accepts both versions and responds with the latest version (`2025-06-18`) in headers.

## See Also

- [Smithery Documentation](https://smithery.ai/docs)
- [Smithery Compatibility Guide](../SMITHERY_COMPATIBILITY.md)
- [Main README](../README.md)
- [MCP Specification](https://modelcontextprotocol.io/specification)
