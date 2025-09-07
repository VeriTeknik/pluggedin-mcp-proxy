import { GetPromptResultSchema, PromptMessage } from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

/**
 * Static prompts for the MCP proxy
 */
export const staticPrompts = {
  "mcp_discover": {
    name: "mcp_discover",
    description: "Comprehensive guide for discovering and using MCP tools in Plugged.in",
    arguments: []
  },
  "how_to_use_discovery": {
    name: "how_to_use_discovery",
    description: "Step-by-step instructions for discovering and connecting to MCP servers",
    arguments: []
  },
  "what_pluggedin_can_do_for_me": {
    name: "what_pluggedin_can_do_for_me",
    description: "Discover all the powerful features and tools Plugged.in offers to enhance your AI workflows",
    arguments: []
  }
};

/**
 * Get a static prompt by name
 */
export function getStaticPrompt(name: string): any | null {
  switch (name) {
    case "mcp_discover":
      return {
        description: staticPrompts.mcp_discover.description,
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `# Plugged.in MCP Discovery Guide (v${packageJson.version})

## 🚀 Welcome to Plugged.in MCP Proxy!

I help you connect to and use multiple MCP (Model Context Protocol) servers through a single, unified interface. Think of me as your gateway to a world of specialized AI tools and capabilities.

## 🔍 Discovery Process

### Step 1: Discover Available Tools
Start by running the \`pluggedin_discover_tools\` tool. This will:
- Connect to your configured MCP servers
- Retrieve all available tools, resources, and prompts
- Present them in an organized, prefixed format

### Step 2: Understanding Tool Names
All discovered tools are prefixed with their server UUID to avoid conflicts:
- Format: \`{server_uuid}__{tool_name}\`
- Example: \`550e8400-e29b-41d4-a716-446655440000__read_file\`, \`123e4567-e89b-12d3-a456-426614174000__create_issue\`
- This ensures unique tool names even when multiple servers have tools with identical names

### Step 3: Using Discovered Tools
Once discovered, simply call any tool by its prefixed name with appropriate arguments.

## 📋 Static Tools Always Available

These tools are built into Plugged.in and always available:

### Discovery & Information
1. **pluggedin_discover_tools** - Discover all available MCP tools
   - Optional: \`server_uuid\` to discover specific server
   - Optional: \`force_refresh\` to bypass cache

### RAG & Knowledge Management
2. **pluggedin_ask_knowledge_base** - Query your document knowledge base
   - Required: \`query\` - Your search query

### Notification System
3. **pluggedin_send_notification** - Send custom notifications
4. **pluggedin_list_notifications** - List your notifications
5. **pluggedin_mark_notification_done** - Mark notifications as done
6. **pluggedin_delete_notification** - Delete notifications

### Document Management
7. **pluggedin_create_document** - Create AI-generated documents
8. **pluggedin_list_documents** - List documents with filters
9. **pluggedin_search_documents** - Search documents semantically
10. **pluggedin_get_document** - Retrieve specific documents
11. **pluggedin_update_document** - Update existing documents

## 💡 Pro Tips

1. **First Time?** Always run \`pluggedin_discover_tools\` first
2. **Performance**: Discovery results are cached for efficiency
3. **Multiple Servers**: Tools from different servers work seamlessly together
4. **Notifications**: All tool usage is logged for your reference
5. **RAG Integration**: Documents you create are automatically indexed

## 🔧 Troubleshooting

- **No tools found?** Check your MCP server configuration in Plugged.in
- **Tool not working?** Ensure the server is properly connected
- **Need help?** The discovery tool shows server status and capabilities

## 📚 Example Workflow

\`\`\`
1. Discover tools: pluggedin_discover_tools
2. Create a document: pluggedin_create_document
3. Search documents: pluggedin_search_documents
4. Use server tools: 550e8400-e29b-41d4-a716-446655440000__read_file, 123e4567-e89b-12d3-a456-426614174000__create_pr, etc.
\`\`\`

Ready to explore? Start with \`pluggedin_discover_tools\`!`
          }
        } as PromptMessage]
      };

    case "how_to_use_discovery":
      return {
        description: staticPrompts.how_to_use_discovery.description,
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `# How to Use MCP Discovery in Plugged.in

## Quick Start

### 1. Run Discovery
\`\`\`
Tool: pluggedin_discover_tools
Arguments: {} (or {"force_refresh": true} to bypass cache)
\`\`\`

### 2. Review Available Tools
The discovery will show:
- **Server Name & Status**
- **Available Tools** with descriptions
- **Custom Instructions** (if any)
- **Resources & Prompts** (if available)

### 3. Use Discovered Tools
Call any tool using its prefixed name:
\`\`\`
Tool: servername_toolname
Arguments: { ...tool specific arguments... }
\`\`\`

## Understanding the Output

### Tool Format
Each tool is displayed as:
\`\`\`
- **servername_toolname**: Tool description
\`\`\`

### Server Organization
\`\`\`
## Server Name (UUID)
### Tools (count):
- tool list...
### Instructions (count):
- instruction list...
\`\`\`

## Advanced Usage

### 1. Discover Specific Server
\`\`\`
Tool: pluggedin_discover_tools
Arguments: {"server_uuid": "specific-server-uuid"}
\`\`\`

### 2. Force Refresh (Bypass Cache)
\`\`\`
Tool: pluggedin_discover_tools
Arguments: {"force_refresh": true}
\`\`\`

### 3. Combine with Document Creation
After discovery, you can create documents about discovered tools:
\`\`\`
Tool: pluggedin_create_document
Arguments: {
  "title": "Available MCP Tools Reference",
  "content": "...discovered tools documentation...",
  "format": "md",
  "metadata": {
    "model": {"name": "assistant", "provider": "anthropic"},
    "visibility": "private"
  }
}
\`\`\`

## Common Patterns

### Pattern 1: Discover → Use
1. \`pluggedin_discover_tools\` - Find available tools
2. \`550e8400-e29b-41d4-a716-446655440000__read_file\` - Use a discovered tool

### Pattern 2: Discover → Document → Search
1. \`pluggedin_discover_tools\` - Find tools
2. \`pluggedin_create_document\` - Document findings
3. \`pluggedin_search_documents\` - Search later

### Pattern 3: Notification Workflow
1. \`pluggedin_discover_tools\` - Initial discovery
2. Use various tools...
3. \`pluggedin_list_notifications\` - Check activity log

## Tips & Best Practices

1. **Cache Management**: Discovery results are cached for performance. Use \`force_refresh\` when servers are updated.

2. **UUID Prefixing**: Tools are prefixed with server UUIDs to avoid conflicts. A "read" tool from server "550e8400-e29b-41d4-a716-446655440000" becomes \`550e8400-e29b-41d4-a716-446655440000__read\`.

3. **Error Handling**: If a tool fails, check:
   - Is the server still connected?
   - Are the arguments correct?
   - Run discovery again to refresh

4. **Documentation**: Create documents about useful tool combinations for future reference.

5. **Activity Tracking**: All tool usage is logged. Check notifications to review your activity.

Need more help? Just ask!`
          }
        } as PromptMessage]
      };

    case "what_pluggedin_can_do_for_me":
      return {
        description: staticPrompts.what_pluggedin_can_do_for_me.description,
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `# What Plugged.in Can Do For Me 🚀

Plugged.in transforms how you work with AI by providing a unified platform for managing MCP servers, sharing knowledge, and collaborating with AI models. Here's everything I can help you with:

## 🔧 Built-in Tools (12 Powerful Features)

### 📡 **Discovery & Management**

#### 1. **pluggedin_discover_tools**
- **What it does**: Discover all available tools from your connected MCP servers
- **Parameters**: 
  - \`server_uuid\` (optional): Target specific server or discover all
  - \`force_refresh\` (optional): Force refresh to get latest tools
- **Why use it**: See all your available AI capabilities in one place

### 🆘 **Setup & Help**

#### 2. **pluggedin_setup**
- **What it does**: Get help setting up and using Plugged.in (no API key required)
- **Parameters**:
  - \`topic\` (optional): getting_started, api_key, configuration, or troubleshooting
- **Why use it**: Learn how to configure and use Plugged.in effectively

### 📚 **Document & Knowledge Management**

#### 3. **pluggedin_ask_knowledge_base**
- **What it does**: Search through your entire knowledge base using AI
- **Parameters**:
  - \`query\` (required): Your search question (1-1000 characters)
- **Why use it**: Find information across all your documents instantly

#### 4. **pluggedin_create_document**
- **What it does**: Save AI-generated content directly to your library
- **Parameters**:
  - \`title\` (required): Document title
  - \`content\` (required): The content to save
  - \`format\` (optional): md, txt, json, or html
  - \`tags\` (optional): Tags for organization
  - \`metadata\` (required): AI model information and visibility settings
- **Why use it**: Build a persistent knowledge base from AI conversations

#### 5. **pluggedin_list_documents**
- **What it does**: Browse your document library with smart filters
- **Parameters**:
  - \`filters\` (optional): Filter by source, model, date, tags, visibility
  - \`sort\` (optional): Sort by date, title, or size
  - \`limit\` & \`offset\` (optional): Pagination controls
- **Why use it**: Quickly find documents created by specific AI models or on certain topics

#### 6. **pluggedin_search_documents**
- **What it does**: Perform semantic search across all your documents
- **Parameters**:
  - \`query\` (required): Search query
  - \`filters\` (optional): Narrow results by model, date, tags
  - \`limit\` (optional): Number of results
- **Why use it**: Find relevant content even when you don't remember exact keywords

#### 7. **pluggedin_get_document**
- **What it does**: Retrieve a specific document with full details
- **Parameters**:
  - \`documentId\` (required): Document UUID
  - \`includeContent\` (optional): Get the full content
  - \`includeVersions\` (optional): See version history
- **Why use it**: Access complete document information including AI attribution

#### 8. **pluggedin_update_document**
- **What it does**: Update or append to existing AI-generated documents
- **Parameters**:
  - \`documentId\` (required): Document UUID
  - \`operation\` (required): replace, append, or prepend
  - \`content\` (required): New content
  - \`metadata\` (optional): Update tags and AI model info
- **Why use it**: Evolve documents over time with contributions from multiple AI models

### 🔔 **Notification System**

#### 9. **pluggedin_send_notification**
- **What it does**: Send custom notifications with optional email delivery
- **Parameters**:
  - \`message\` (required): Notification content
  - \`title\` (optional): Custom title
  - \`severity\` (optional): INFO, SUCCESS, WARNING, or ALERT
  - \`email\` (optional): Also send via email
- **Why use it**: Stay informed about important events and completions

#### 10. **pluggedin_list_notifications**
- **What it does**: View your notification history
- **Parameters**:
  - \`unreadOnly\` (optional): Filter unread only
  - \`limit\` (optional): Number to retrieve (1-100)
  - \`severity\` (optional): Filter by severity level
- **Why use it**: Never miss important updates from your AI workflows

#### 11. **pluggedin_mark_notification_done**
- **What it does**: Mark notifications as done
- **Parameters**:
  - \`notificationId\` (required): Notification ID
- **Why use it**: Keep your notification center organized

#### 12. **pluggedin_delete_notification**
- **What it does**: Remove notifications
- **Parameters**:
  - \`notificationId\` (required): Notification ID
- **Why use it**: Clean up processed notifications

## 🌟 Key Platform Features

### 🤖 **AI Document Exchange**
- **Cross-Model Collaboration**: Different AI models can build on each other's work
- **Version Control**: Track changes and contributions from multiple AI models
- **Attribution System**: Know which AI created or updated each document
- **Visibility Controls**: Keep documents private, share with workspace, or make public

### 🔐 **Security & Organization**
- **Profile-based Isolation**: Each workspace has its own isolated environment
- **API Key Authentication**: Secure access to all features
- **Activity Logging**: Complete audit trail of all operations
- **Rate Limiting**: Protection against abuse

### 🚀 **Getting Started**

1. **Set Up**: Configure \`PLUGGEDIN_API_KEY\` and \`PLUGGEDIN_API_BASE_URL\`
2. **Discover**: Use \`pluggedin_discover_tools\` to see all available capabilities
3. **Create**: Start building your AI knowledge base with \`pluggedin_create_document\`
4. **Search**: Find information instantly with \`pluggedin_ask_knowledge_base\` or \`pluggedin_search_documents\`
5. **Collaborate**: Let multiple AI models contribute to your documents

## 💡 **Common Use Cases**

### Building a Knowledge Base
- Save important AI conversations as documents
- Tag and organize by topic
- Search across all saved knowledge
- Update documents as you learn more

### AI Collaboration Workflows
- One AI creates initial documentation
- Another AI reviews and appends improvements
- Track all contributions with full attribution
- Build comprehensive resources over time

### Research & Analysis
- Store research findings from different AI models
- Search across all collected information
- Version control for evolving insights
- Share findings with your team

## 🎯 **Pro Tips**

1. **Use Tags**: Organize documents with meaningful tags for easy filtering
2. **Leverage Search**: Both RAG and semantic search help find information differently
3. **Version Everything**: AI-generated documents automatically track versions
4. **Set Visibility**: Choose who can see your documents (private, workspace, public)
5. **Check Notifications**: Stay updated on all activities in your workspace

Plugged.in transforms isolated AI conversations into a persistent, searchable, and collaborative knowledge ecosystem. Start exploring what it can do for you today!`
          }
        } as PromptMessage]
      };

    default:
      return null;
  }
}