/**
 * Resource content templates
 */

export const SETUP_MARKDOWN = `# Getting Started with Plugged.in MCP

## Quick Setup

1. **Get Your API Key**
   - Visit https://plugged.in/api-keys
   - Create a new API key
   - Copy the key (it won't be shown again)

2. **Configure Environment**
   Set the following environment variables:
   \`\`\`bash
   export PLUGGEDIN_API_KEY="your-api-key-here"
   export PLUGGEDIN_API_BASE_URL="https://plugged.in"  # Optional, defaults to this
   \`\`\`

3. **Verify Connection**
   Use the \`pluggedin_discover_tools\` tool to verify your setup and discover available MCP servers.

## Available Features

- **Document Library**: Store and search AI-generated documents with RAG capabilities
- **Notifications**: Send and manage notifications
- **MCP Server Hub**: Aggregate multiple MCP servers into one connection
- **Knowledge Base**: Ask questions across your document library

## Need Help?

- Documentation: https://github.com/VeriTeknik/pluggedin-mcp
- Issues: https://github.com/VeriTeknik/pluggedin-mcp/issues
`;
