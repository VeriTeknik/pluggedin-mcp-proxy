# Smithery Compatibility Guide

## Overview

The pluggedin-mcp proxy now supports Smithery's requirements for tool discovery without authentication. This allows users to explore available tools before providing API credentials.

## Key Features

### 1. Lazy Authentication
- Tool discovery works without API key
- Authentication only required when invoking tools
- Three static tools available without authentication:
  - `pluggedin_discover_tools`
  - `pluggedin_rag_query`
  - `pluggedin_send_notification`

### 2. HTTP Transport Support
The `smithery.yaml` configuration uses HTTP transport with:
- Streamable HTTP endpoint at `/mcp`
- Stateless mode for better scalability
- Port configuration via PORT environment variable

### 3. Tool Discovery Flow
1. **Without API Key**: Returns only the three static tools
2. **With API Key**: Returns static tools plus all tools from connected MCP servers

## Configuration

The `smithery.yaml` file is configured for HTTP transport:
```yaml
startCommand:
  type: http
  endpoint: /mcp
  configSchema:
    type: object
    properties:
      PLUGGEDIN_API_KEY:
        type: string
        description: Your Plugged.in API key (optional for discovery)
```

## Testing with Smithery CLI

1. **Tool Discovery (no auth)**:
   ```bash
   npx -y @smithery/cli@latest inspect @VeriTeknik/pluggedin-mcp
   # When prompted for API key, just press Enter
   ```

2. **Full Access (with auth)**:
   ```bash
   npx -y @smithery/cli@latest inspect @VeriTeknik/pluggedin-mcp
   # Provide your API key when prompted
   ```

## Limitations

- Without an API key, only the three static tools are available
- These tools still require authentication to actually execute
- Full functionality requires a valid Plugged.in API key

## Deployment on Smithery

When deploying to Smithery's platform:
1. The server will run in stateless HTTP mode
2. Tools will be discoverable without authentication
3. Users can provide API keys through Smithery's configuration UI