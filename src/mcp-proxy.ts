/**
 * Plugged.in MCP Proxy - UUID-based Tool Prefixing Implementation
 *
 * This module implements automatic UUID-based tool prefixing to resolve name collisions
 * in MCP clients. When multiple MCP servers provide tools with identical names,
 * this system prefixes each tool with its server's UUID to ensure uniqueness.
 *
 * FEATURES:
 * - Automatic UUID prefixing: {server_uuid}__{original_tool_name}
 * - Backward compatibility: Supports both prefixed and non-prefixed tool calls
 * - Configurable: Can be disabled via PLUGGEDIN_UUID_TOOL_PREFIXING=false
 * - Collision-free: Guarantees unique tool names across all servers
 *
 * CONFIGURATION:
 * - PLUGGEDIN_UUID_TOOL_PREFIXING: Set to 'false' to disable prefixing (default: true)
 *
 * USAGE:
 * 1. Tools are automatically prefixed when retrieved from /api/tools?prefix_tools=true
 * 2. MCP proxy handles both prefixed and non-prefixed tool calls seamlessly
 * 3. Existing integrations continue to work without modification
 *
 * EXAMPLES:
 * - Original: "read_file" from server "550e8400-e29b-41d4-a716-446655440000"
 * - Prefixed: "550e8400-e29b-41d4-a716-446655440000__read_file"
 * - Both forms are accepted for backward compatibility
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListResourceTemplatesRequestSchema,
  ResourceTemplate,
  CompatibilityCallToolResultSchema,
  GetPromptResultSchema,
  PromptMessage,
  PingRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getMcpServers } from "./fetch-pluggedinmcp.js";
import { getSessionKey, getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from "./utils.js";
import { cleanupAllSessions, getSession, initSessions } from "./sessions.js";
import axios from "axios";
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createRequire } from 'module';
import { ToolExecutionResult, ServerParameters } from "./types.js";
import { logMcpActivity, createExecutionTimer } from "./notification-logger.js";
import { 
  RateLimiter, 
  sanitizeErrorMessage, 
  validateRequestSize,
  withTimeout
} from "./security-utils.js";
import { debugLog, debugError } from "./debug-log.js";
import { withErrorHandling } from "./error-handler.js";
import {
  setupStaticTool,
  createDocumentStaticTool,
  listDocumentsStaticTool,
  searchDocumentsStaticTool,
  getDocumentStaticTool,
  updateDocumentStaticTool,
  clipboardSetStaticTool,
  clipboardGetStaticTool,
  clipboardDeleteStaticTool,
  clipboardListStaticTool,
  clipboardPushStaticTool,
  clipboardPopStaticTool,
  STATIC_TOOLS_COUNT
} from "./tools/static-tools.js";
import { StaticToolHandlers } from "./handlers/static-handlers.js";
import { formatCustomInstructionsForDiscovery } from "./utils/custom-instructions.js";
import { 
  parsePrefixedToolName as parseAnyPrefixedToolName,
  isValidUuid
} from "./slug-utils.js";

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

// Map to store prefixed tool name -> { originalName, serverUuid }
const toolToServerMap: Record<string, { originalName: string; serverUuid: string; }> = {};

// Configuration for UUID-based tool prefixing
// Set PLUGGEDIN_UUID_TOOL_PREFIXING=false to disable UUID prefixing (for backward compatibility)
// When enabled, tools are returned with format: {server_uuid}__{original_tool_name}
// When disabled, tools are returned with their original names
const UUID_TOOL_PREFIXING_ENABLED = process.env.PLUGGEDIN_UUID_TOOL_PREFIXING !== 'false'; // Default to true

/**
 * Creates a UUID-prefixed tool name
 * Format: {server_uuid}__{original_tool_name}
 */
export function createPrefixedToolName(serverUuid: string, originalName: string): string {
  return `${serverUuid}__${originalName}`;
}

/**
 * Parses a potentially prefixed tool name (UUID-based for backward compatibility)
 * Returns { originalName, serverUuid } or null if not prefixed
 */
export function parsePrefixedToolName(toolName: string): { originalName: string; serverUuid: string } | null {
  const parsed = parseAnyPrefixedToolName(toolName);
  
  if (!parsed || parsed.prefixType !== 'uuid') {
    return null; // Not a UUID-prefixed name
  }
  
  return {
    originalName: parsed.originalName,
    serverUuid: parsed.serverIdentifier
  };
}

// Interface for instruction data from API
interface InstructionData {
  description?: string;
  instruction?: string | any; // Can be string (JSON) or parsed object
  serverUuid?: string;
  _serverUuid?: string;
}

// Map to store custom instruction name -> instruction content
const instructionToServerMap: Record<string, InstructionData> = {};

// Define the static discovery tool schema using Zod
const DiscoverToolsInputSchema = z.object({
  server_uuid: z.string().uuid().optional().describe("Optional UUID of a specific server to discover. If omitted, attempts to discover all."),
  force_refresh: z.boolean().optional().default(false).describe("Set to true to bypass cache and force a fresh discovery. Defaults to false."),
}).describe("Triggers tool discovery for configured MCP servers in the Pluggedin App.");

// Define the static discovery tool structure
const discoverToolsStaticTool: Tool = {
    name: "pluggedin_discover_tools",
    description: "Triggers discovery of tools (and resources/templates) for configured MCP servers in the Pluggedin App.",
    inputSchema: zodToJsonSchema(DiscoverToolsInputSchema) as any,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false
    }
};

// Define the schema for asking questions to the knowledge base
const AskKnowledgeBaseInputSchema = z.object({
  query: z.string()
    .min(1, "Query cannot be empty")
    .max(1000, "Query too long")
    .describe("Your question or query to get AI-generated answers from the knowledge base.")
}).describe("Ask questions and get AI-generated answers from your knowledge base. Returns JSON with answer, sources, and metadata.");

// Define the static tool for asking questions to the knowledge base
const askKnowledgeBaseStaticTool: Tool = {
    name: "pluggedin_ask_knowledge_base",
    description: "Ask questions and get AI-generated answers from your knowledge base. Returns structured JSON with answer, document sources, and metadata.",
    inputSchema: zodToJsonSchema(AskKnowledgeBaseInputSchema) as any,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false
    }
};

// Define the static tool for sending custom notifications
const sendNotificationStaticTool: Tool = {
  name: "pluggedin_send_notification",
  description: "Send custom notifications through the Plugged.in system with optional email delivery. You can provide a custom title or let the system use a localized default.",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Optional notification title. If not provided, a localized default will be used. Consider generating a descriptive title based on the message content."
      },
      message: {
        type: "string",
        description: "The notification message content"
      },
      severity: {
        type: "string",
        enum: ["INFO", "SUCCESS", "WARNING", "ALERT"],
        description: "The severity level of the notification (defaults to INFO)",
        default: "INFO"
      },
      sendEmail: {
        type: "boolean",
        description: "Whether to also send the notification via email",
        default: false
      }
    },
    required: ["message"]
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false
  }
};

// Input schema for validation
const SendNotificationInputSchema = z.object({
  title: z.string().optional(),
  message: z.string().min(1, "Message cannot be empty"),
  severity: z.enum(["INFO", "SUCCESS", "WARNING", "ALERT"]).default("INFO"),
  sendEmail: z.boolean().optional().default(false),
});

// Define the static tool for listing notifications
const listNotificationsStaticTool: Tool = {
  name: "pluggedin_list_notifications",
  description: "List notifications from the Plugged.in system with optional filters for unread only and result limit",
  inputSchema: {
    type: "object",
    properties: {
      onlyUnread: {
        type: "boolean",
        description: "Filter to show only unread notifications",
        default: false
      },
      limit: {
        type: "integer",
        description: "Limit the number of notifications returned (1-100)",
        minimum: 1,
        maximum: 100
      }
    }
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true
  }
};

// Input schema for list notifications validation
const ListNotificationsInputSchema = z.object({
  onlyUnread: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(100).optional(),
});

// Define the static tool for marking notification as done
const markNotificationDoneStaticTool: Tool = {
  name: "pluggedin_mark_notification_done",
  description: "Mark a notification as done in the Plugged.in system",
  inputSchema: {
    type: "object",
    properties: {
      notificationId: {
        type: "string",
        description: "The ID of the notification to mark as read"
      }
    },
    required: ["notificationId"]
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true
  }
};

// Input schema for mark notification done validation
const MarkNotificationDoneInputSchema = z.object({
  notificationId: z.string().min(1, "Notification ID cannot be empty"),
});

// Define the static tool for deleting notification
const deleteNotificationStaticTool: Tool = {
  name: "pluggedin_delete_notification",
  description: "Delete a notification from the Plugged.in system",
  inputSchema: {
    type: "object",
    properties: {
      notificationId: {
        type: "string",
        description: "The ID of the notification to delete"
      }
    },
    required: ["notificationId"]
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true
  }
};

// Input schema for delete notification validation
const DeleteNotificationInputSchema = z.object({
  notificationId: z.string().min(1, "Notification ID cannot be empty"),
});


// Define the static prompt for proxy capabilities
const proxyCapabilitiesStaticPrompt = {
  name: "pluggedin_proxy_capabilities",
  description: "Learn about the Plugged.in MCP Proxy capabilities and available tools",
  arguments: []
} as const;

export const createServer = async () => {
  // Create rate limiters for different operations
  const toolCallRateLimiter = new RateLimiter(60000, 60); // 60 calls per minute
  const apiCallRateLimiter = new RateLimiter(60000, 100); // 100 API calls per minute
  
  const server = new Server(
    {
      name: "PluggedinMCP",
      version: packageJson.version,
    },
    {
      capabilities: {
        prompts: {}, // Enable prompt support capability
        resources: {},
        tools: {},
      },
    }
  );

  // List Tools Handler - Fetches tools from Pluggedin App API and adds static tool
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
     const apiKey = getPluggedinMCPApiKey();
     const baseUrl = getPluggedinMCPApiBaseUrl();
     
     // If no API key, return all static tools (for Smithery compatibility)
     // This path should be fast and not rate limited for tool discovery
     if (!apiKey || !baseUrl) {
       // Don't log to console for STDIO transport as it interferes with protocol
       return {
         tools: [
           setupStaticTool,
           discoverToolsStaticTool,
           askKnowledgeBaseStaticTool,
           createDocumentStaticTool,
           listDocumentsStaticTool,
           searchDocumentsStaticTool,
           getDocumentStaticTool,
           updateDocumentStaticTool,
           sendNotificationStaticTool,
           listNotificationsStaticTool,
           markNotificationDoneStaticTool,
           deleteNotificationStaticTool,
           clipboardSetStaticTool,
           clipboardGetStaticTool,
           clipboardDeleteStaticTool,
           clipboardListStaticTool,
           clipboardPushStaticTool,
           clipboardPopStaticTool
         ],
         nextCursor: undefined
       };
     }
     
     // Rate limit check only for authenticated API calls
     if (!apiCallRateLimiter.checkLimit()) {
       throw new Error("Rate limit exceeded. Please try again later.");
     }
     
     let fetchedTools: (Tool & { _serverUuid: string, _serverName?: string })[] = [];
     
     try {

       // Build API URL with prefixing parameter
       const apiUrl = new URL(`${baseUrl}/api/tools`);
       if (UUID_TOOL_PREFIXING_ENABLED) {
         apiUrl.searchParams.set('prefix_tools', 'true');
       }

       // Fetch the list of tools (which include original names and server info)
       // The API returns an object like { tools: [], message?: "..." }
       const response = await axios.get<{ tools: (Tool & { _serverUuid: string, _serverName?: string })[], message?: string }>(apiUrl.toString(), {
         headers: {
           Authorization: `Bearer ${apiKey}`,
         },
         timeout: 10000,
       });

       // Access the 'tools' array from the response payload
       fetchedTools = response.data?.tools || [];

       // Clear previous mapping and populate with new data
       Object.keys(toolToServerMap).forEach(key => delete toolToServerMap[key]); // Clear map

       // Create mappings for each tool to its server
       fetchedTools.forEach(tool => {
         if (tool.name && tool._serverUuid) {
           // Store mapping with the tool name as returned by API (may be prefixed or not)
           toolToServerMap[tool.name] = {
             originalName: tool.name, // Will be updated if prefixed
             serverUuid: tool._serverUuid
           };

           // If UUID prefixing is enabled and the tool name is not already prefixed,
           // we need to handle backward compatibility
           if (UUID_TOOL_PREFIXING_ENABLED) {
             // Use shared helper for parsing prefixed tool names
             const parsed = parseAnyPrefixedToolName(tool.name);
             if (parsed) {
               // Tool name is prefixed, extract original name
               toolToServerMap[tool.name].originalName = parsed.originalName;
               debugLog(`[ListTools Handler] Tool ${tool.name} is ${parsed.prefixType}-prefixed, original: ${parsed.originalName}`);
             } else {
               // Tool name is not prefixed, this might be for backward compatibility
               // In this case, the originalName should remain as tool.name
               debugLog(`[ListTools Handler] Tool ${tool.name} is not prefixed, using as-is for backward compatibility`);
             }
           }
         } else {
            debugError(`[ListTools Handler] Missing tool name or UUID for tool: ${tool.name}`);
         }
       });
       
       // Fetch server configurations with custom instructions
       let serverContexts = new Map();
       try {
         const serverParams = await getMcpServers(false);
         
         // Build server contexts with parsed constraints
         const { buildServerContextsMap } = await import('./utils/custom-instructions.js');
         serverContexts = buildServerContextsMap(Object.values(serverParams));
       } catch (contextError) {
         // Log error but continue without custom instructions
         debugError('[ListTools Handler] Failed to fetch server contexts:', contextError);
       }
       
       // Prepare the response payload with custom instructions and constraints in metadata
       const toolsForClient: Tool[] = fetchedTools.map(({ _serverUuid, _serverName, ...rest }) => {
         // Add custom instructions and constraints to tool metadata if available
         if (_serverUuid) {
           const context = serverContexts.get(_serverUuid);
           if (context) {
             const toolWithMetadata: any = {
               ...rest,
               metadata: {
                 ...(rest.metadata || {}),
                 server: _serverName || _serverUuid,
                 instructions: context.rawInstructions,
                 constraints: context.constraints,
                 formattedContext: context.formattedContext
               }
             };
             return toolWithMetadata;
           }
         }
         // Remove internal fields
         return rest;
       });

       // Note: Pagination not handled here, assumes API returns all tools

       // Always include the static tools
       const allToolsForClient = [
         discoverToolsStaticTool,
         askKnowledgeBaseStaticTool,
         createDocumentStaticTool,
         listDocumentsStaticTool,
         searchDocumentsStaticTool,
         getDocumentStaticTool,
         updateDocumentStaticTool,
         sendNotificationStaticTool,
         listNotificationsStaticTool,
         markNotificationDoneStaticTool,
         deleteNotificationStaticTool,
         clipboardSetStaticTool,
         clipboardGetStaticTool,
         clipboardDeleteStaticTool,
         clipboardListStaticTool,
         clipboardPushStaticTool,
         clipboardPopStaticTool,
         ...toolsForClient
       ];

       return { tools: allToolsForClient, nextCursor: undefined };

     } catch (error: unknown) {
       // Log API fetch error but still return the static tool
       let sanitizedError = "Failed to list tools";
       if (axios.isAxiosError(error) && error.response?.status) {
         // Only include status code, not full error details
         sanitizedError = `Failed to list tools (HTTP ${error.response.status})`;
       }
       debugError("[ListTools Handler Error]", error);
       throw new Error(sanitizedError);
     }
  });

  // List Resources Handler - Returns available resources from the knowledge base
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const { RESOURCE_REGISTRY } = await import('./resources/registry.js');
    const { ensureAuth } = await import('./resources/helpers.js');

    // Check auth status - always succeeds for non-auth resources
    const { key, base } = ensureAuth('pluggedin://setup', false);

    // Filter resources based on auth status
    return {
      resources: RESOURCE_REGISTRY
        .filter(r => !r.requiresAuth || (key && base))
        .map(({ uri, mimeType, name, description }) => ({
          uri,
          mimeType,
          name,
          description,
        })),
    };
  });

  // Read Resource Handler - Returns content of a specific resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const { RESOURCE_REGISTRY } = await import('./resources/registry.js');
    const { ensureAuth } = await import('./resources/helpers.js');

    // Find resource definition
    const def = RESOURCE_REGISTRY.find(r => r.uri === uri);
    if (!def) {
      throw new Error(`Resource not found: ${uri}`);
    }

    // Check authentication if required
    ensureAuth(uri, def.requiresAuth);

    // Return resource content
    return {
      contents: [
        {
          uri,
          mimeType: def.mimeType,
          text: def.getContent(),
        },
      ],
    };
  });

  // Call Tool Handler - Routes tool calls to the appropriate downstream server
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: requestedToolName, arguments: args } = request.params;
    const meta = request.params._meta;

    // Basic input validation
    if (!requestedToolName || typeof requestedToolName !== 'string') {
      throw new Error("Invalid tool name provided");
    }

    // Basic request size check (lightweight)
    if (!validateRequestSize(request.params, 50 * 1024 * 1024)) { // 50MB limit
      throw new Error("Request payload too large");
    }

    // Rate limit check for tool calls
    if (!toolCallRateLimiter.checkLimit()) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }

    try {
        // Handle static discovery tool first
        if (requestedToolName === discoverToolsStaticTool.name) {
            const validatedArgs = DiscoverToolsInputSchema.parse(args ?? {}); // Validate args
            const { server_uuid, force_refresh } = validatedArgs;

            const apiKey = getPluggedinMCPApiKey();
            const baseUrl = getPluggedinMCPApiBaseUrl();
            if (!apiKey || !baseUrl) {
                throw new Error("Pluggedin API Key or Base URL is not configured for discovery trigger.");
            }

            const timer = createExecutionTimer();
            let shouldRunDiscovery = force_refresh; // If force_refresh is true, always run discovery
            let existingDataSummary = "";

            // Check for existing data if not forcing refresh
            if (!force_refresh) {
                try {
                    // Check for existing tools, resources, prompts, and templates with timeout protection
                    const apiRequests = Promise.all([
                        axios.get(`${baseUrl}/api/tools`, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 }),
                        axios.get(`${baseUrl}/api/resources`, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 }),
                        axios.get(`${baseUrl}/api/prompts`, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 }),
                        axios.get(`${baseUrl}/api/resource-templates`, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 })
                    ]);
                    
                    const [toolsResponse, resourcesResponse, promptsResponse, templatesResponse] = await withTimeout(apiRequests, 15000);

                    const toolsCount = toolsResponse.data?.tools?.length || (Array.isArray(toolsResponse.data) ? toolsResponse.data.length : 0);
                    const resourcesCount = Array.isArray(resourcesResponse.data) ? resourcesResponse.data.length : 0;
                    const promptsCount = Array.isArray(promptsResponse.data) ? promptsResponse.data.length : 0;
                    const templatesCount = Array.isArray(templatesResponse.data) ? templatesResponse.data.length : 0;

                    const totalItems = toolsCount + resourcesCount + promptsCount + templatesCount;

                    if (totalItems > 0) {
                        // We have existing data, return it without running discovery
                        const staticToolsCount = STATIC_TOOLS_COUNT;
                        const totalToolsCount = toolsCount + staticToolsCount;
                        existingDataSummary = `Found cached data: ${toolsCount} dynamic tools + ${staticToolsCount} static tools = ${totalToolsCount} total tools, ${resourcesCount} resources, ${promptsCount} prompts, ${templatesCount} templates`;

                        const cacheMessage = server_uuid
                            ? `Returning cached discovery data for server ${server_uuid}. ${existingDataSummary}. Use force_refresh=true to update.\n\n`
                            : `Returning cached discovery data for all servers. ${existingDataSummary}. Use force_refresh=true to update.\n\n`;

                        // Format the actual data for the response
                        let dataContent = cacheMessage;

                        // Add static built-in tools section (always available)
                        dataContent += `## 🔧 Static Built-in Tools (Always Available):\n`;
                        dataContent += `**Discovery (1):**\n`;
                        dataContent += `1. **pluggedin_discover_tools** - Triggers discovery of tools for configured MCP servers\n`;
                        dataContent += `\n**Knowledge Base (1):**\n`;
                        dataContent += `2. **pluggedin_ask_knowledge_base** - Performs a RAG query against documents\n`;
                        dataContent += `\n**Notifications (3):**\n`;
                        dataContent += `3. **pluggedin_send_notification** - Send custom notifications with optional email\n`;
                        dataContent += `4. **pluggedin_list_notifications** - List notifications with filters\n`;
                        dataContent += `5. **pluggedin_mark_notification_done** - Mark a notification as done\n`;
                        dataContent += `6. **pluggedin_delete_notification** - Delete a notification\n`;
                        dataContent += `\n**Documents (5):**\n`;
                        dataContent += `7. **pluggedin_create_document** - Create AI-generated documents\n`;
                        dataContent += `8. **pluggedin_list_documents** - List documents with filtering\n`;
                        dataContent += `9. **pluggedin_search_documents** - Search documents semantically\n`;
                        dataContent += `10. **pluggedin_get_document** - Retrieve a specific document by ID\n`;
                        dataContent += `11. **pluggedin_update_document** - Update or append to a document\n`;
                        dataContent += `\n**Clipboard (7):**\n`;
                        dataContent += `12. **pluggedin_clipboard_set** - Set a clipboard entry by name or index\n`;
                        dataContent += `13. **pluggedin_clipboard_get** - Get clipboard entries with pagination\n`;
                        dataContent += `14. **pluggedin_clipboard_delete** - Delete clipboard entries\n`;
                        dataContent += `15. **pluggedin_clipboard_list** - List all clipboard entries (metadata only)\n`;
                        dataContent += `16. **pluggedin_clipboard_push** - Push to indexed clipboard (auto-increment)\n`;
                        dataContent += `17. **pluggedin_clipboard_pop** - Pop highest-indexed entry (LIFO)\n`;
                        dataContent += `\n`;
                        
                        // Add dynamic tools section (from MCP servers)
                        if (toolsCount > 0) {
                            const tools = toolsResponse.data?.tools || toolsResponse.data || [];
                            dataContent += `## ⚡ Dynamic MCP Tools (${toolsCount}) - From Connected Servers:\n`;
                            tools.forEach((tool: Tool, index: number) => {
                                dataContent += `${index + 1}. **${tool.name}**`;
                                if (tool.description) {
                                    dataContent += ` - ${tool.description}`;
                                }
                                dataContent += `\n`;
                            });
                            dataContent += `\n`;
                        } else {
                            dataContent += `## ⚡ Dynamic MCP Tools (0) - From Connected Servers:\n`;
                            dataContent += `No dynamic tools available. Add MCP servers to get more tools.\n\n`;
                        }
                        
                        // Add prompts section  
                        if (promptsCount > 0) {
                            dataContent += `## 💬 Available Prompts (${promptsCount}):\n`;
                            promptsResponse.data.forEach((prompt: { name: string; description?: string }, index: number) => {
                                dataContent += `${index + 1}. **${prompt.name}**`;
                                if (prompt.description) {
                                    dataContent += ` - ${prompt.description}`;
                                }
                                dataContent += `\n`;
                            });
                            dataContent += `\n`;
                        }
                        
                        // Add resources section
                        if (resourcesCount > 0) {
                            dataContent += `## 📄 Available Resources (${resourcesCount}):\n`;
                            resourcesResponse.data.forEach((resource: { uri: string; name: string; description?: string; mimeType?: string }, index: number) => {
                                dataContent += `${index + 1}. **${resource.name || resource.uri}**`;
                                if (resource.description) {
                                    dataContent += ` - ${resource.description}`;
                                }
                                if (resource.uri && resource.name !== resource.uri) {
                                    dataContent += ` (${resource.uri})`;
                                }
                                dataContent += `\n`;
                            });
                            dataContent += `\n`;
                        }
                        
                        // Add templates section
                        if (templatesCount > 0) {
                            dataContent += `## 📋 Available Resource Templates (${templatesCount}):\n`;
                            templatesResponse.data.forEach((template: ResourceTemplate, index: number) => {
                                dataContent += `${index + 1}. **${template.name || template.uriTemplate}**`;
                                if (template.description) {
                                    dataContent += ` - ${template.description}`;
                                }
                                if (template.uriTemplate && template.name !== template.uriTemplate) {
                                    dataContent += ` (${template.uriTemplate})`;
                                }
                                dataContent += `\n`;
                            });
                        }

                        // Add custom instructions section
                        dataContent += await formatCustomInstructionsForDiscovery();

                        // Log successful cache hit
                        logMcpActivity({
                            action: 'tool_call',
                            serverName: 'Discovery System (Cache)',
                            serverUuid: 'pluggedin_discovery_cache',
                            itemName: requestedToolName,
                            success: true,
                            executionTime: timer.stop(),
                        }).catch(() => {}); // Ignore notification errors

                        return {
                            content: [{ type: "text", text: dataContent }],
                            isError: false,
                        } as ToolExecutionResult;
                    } else {
                        // No existing data found, run discovery
                        shouldRunDiscovery = true;
                        existingDataSummary = "No cached dynamic data found";
                    }
                } catch (cacheError: unknown) {
                    // Error checking cache, show static tools and proceed with discovery

                    // Show static tools even when cache check fails
                    const staticToolsCount = 17;
                    const cacheErrorMessage = `Cache check failed, showing static tools. Will run discovery for dynamic tools.\n\n`;

                    let staticContent = cacheErrorMessage;
                    staticContent += `## 🔧 Static Built-in Tools (Always Available - 17 total):\n`;
                    staticContent += `**Discovery (1):** pluggedin_discover_tools\n`;
                    staticContent += `**Knowledge Base (1):** pluggedin_ask_knowledge_base\n`;
                    staticContent += `**Notifications (4):** pluggedin_send_notification, pluggedin_list_notifications, pluggedin_mark_notification_done, pluggedin_delete_notification\n`;
                    staticContent += `**Documents (5):** pluggedin_create_document, pluggedin_list_documents, pluggedin_search_documents, pluggedin_get_document, pluggedin_update_document\n`;
                    staticContent += `**Clipboard (7):** pluggedin_clipboard_set, pluggedin_clipboard_get, pluggedin_clipboard_delete, pluggedin_clipboard_list, pluggedin_clipboard_push, pluggedin_clipboard_pop\n`;
                    staticContent += `\n## ⚡ Dynamic MCP Tools - From Connected Servers:\n`;
                    staticContent += `Cache check failed. Running discovery to find dynamic tools...\n\n`;
                    staticContent += `Note: You can call pluggedin_discover_tools again to see the updated results.`;

                    // Log cache error but static tools shown
                    logMcpActivity({
                        action: 'tool_call',
                        serverName: 'Discovery System (Cache Error)',
                        serverUuid: 'pluggedin_discovery_cache_error',
                        itemName: requestedToolName,
                        success: true,
                        executionTime: timer.stop(),
                    }).catch(() => {}); // Ignore notification errors

                    // Also trigger discovery in background (fire and forget)
                    try {
                        const discoveryApiUrl = server_uuid
                            ? `${baseUrl}/api/discover/${server_uuid}`
                            : `${baseUrl}/api/discover/all`;

                        axios.post(discoveryApiUrl, { force_refresh: false }, {
                            headers: { Authorization: `Bearer ${apiKey}` },
                            timeout: 60000, // Background discovery timeout
                        }).catch(() => {}); // Fire and forget
                    } catch {
                        // Ignore discovery trigger errors
                    }

                    return {
                        content: [{ type: "text", text: staticContent }],
                        isError: false,
                    } as ToolExecutionResult;
                }
            }

            // Run discovery if needed
            if (shouldRunDiscovery) {
                // Define the API endpoint in pluggedin-app to trigger discovery
                const discoveryApiUrl = server_uuid
                    ? `${baseUrl}/api/discover/${server_uuid}` // Endpoint for specific server
                    : `${baseUrl}/api/discover/all`; // Endpoint for all servers

                if (force_refresh) {
                    // For force refresh, get cached data first AND trigger discovery in background
                    try {
                        // Fire-and-forget: trigger discovery in background
                        axios.post(discoveryApiUrl, { force_refresh: true }, {
                            headers: { Authorization: `Bearer ${apiKey}` },
                            timeout: 60000, // 60s timeout for background discovery
                        }).catch(() => {
                            // Ignore background discovery errors
                        });

                        // Get current cached data to show immediately
                        let forceRefreshContent = "";
                        
                        try {
                            // Fetch current cached data (use shorter timeout since this is just cache check)
                            const [toolsResponse, resourcesResponse, promptsResponse, templatesResponse] = await Promise.all([
                                axios.get(`${baseUrl}/api/tools`, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 5000 }),
                                axios.get(`${baseUrl}/api/resources`, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 5000 }),
                                axios.get(`${baseUrl}/api/prompts`, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 5000 }),
                                axios.get(`${baseUrl}/api/resource-templates`, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 5000 })
                            ]);

                            const toolsCount = toolsResponse.data?.tools?.length || (Array.isArray(toolsResponse.data) ? toolsResponse.data.length : 0);
                            const resourcesCount = Array.isArray(resourcesResponse.data) ? resourcesResponse.data.length : 0;
                            const promptsCount = Array.isArray(promptsResponse.data) ? promptsResponse.data.length : 0;
                            const templatesCount = Array.isArray(templatesResponse.data) ? templatesResponse.data.length : 0;

                            const staticToolsCount = 17; // Discovery, RAG, Notifications (4), Documents (5), Clipboard (7)
                            const totalToolsCount = toolsCount + staticToolsCount;

                            const refreshMessage = server_uuid
                                ? `🔄 Force refresh initiated for server ${server_uuid}. Discovery is running in background.\n\nShowing current cached data (${toolsCount} dynamic tools + ${staticToolsCount} static tools = ${totalToolsCount} total tools, ${resourcesCount} resources, ${promptsCount} prompts, ${templatesCount} templates):\n\n`
                                : `🔄 Force refresh initiated for all servers. Discovery is running in background.\n\nShowing current cached data (${toolsCount} dynamic tools + ${staticToolsCount} static tools = ${totalToolsCount} total tools, ${resourcesCount} resources, ${promptsCount} prompts, ${templatesCount} templates):\n\n`;

                            forceRefreshContent = refreshMessage;

                            // Add static built-in tools section (always available)
                            forceRefreshContent += `## 🔧 Static Built-in Tools (Always Available):\n`;
                            forceRefreshContent += `**Discovery (1):**\n`;
                            forceRefreshContent += `1. **pluggedin_discover_tools** - Triggers discovery of tools for configured MCP servers\n`;
                            forceRefreshContent += `\n**Knowledge Base (1):**\n`;
                            forceRefreshContent += `2. **pluggedin_ask_knowledge_base** - Performs a RAG query against documents\n`;
                            forceRefreshContent += `\n**Notifications (4):**\n`;
                            forceRefreshContent += `3. **pluggedin_send_notification** - Send custom notifications with optional email\n`;
                            forceRefreshContent += `4. **pluggedin_list_notifications** - List notifications with filters\n`;
                            forceRefreshContent += `5. **pluggedin_mark_notification_done** - Mark a notification as done\n`;
                            forceRefreshContent += `6. **pluggedin_delete_notification** - Delete a notification\n`;
                            forceRefreshContent += `\n**Documents (5):**\n`;
                            forceRefreshContent += `7. **pluggedin_create_document** - Create AI-generated documents\n`;
                            forceRefreshContent += `8. **pluggedin_list_documents** - List documents with filtering\n`;
                            forceRefreshContent += `9. **pluggedin_search_documents** - Search documents semantically\n`;
                            forceRefreshContent += `10. **pluggedin_get_document** - Retrieve a specific document by ID\n`;
                            forceRefreshContent += `11. **pluggedin_update_document** - Update or append to a document\n`;
                            forceRefreshContent += `\n**Clipboard (7):**\n`;
                            forceRefreshContent += `12. **pluggedin_clipboard_set** - Set a clipboard entry by name or index\n`;
                            forceRefreshContent += `13. **pluggedin_clipboard_get** - Get clipboard entries with pagination\n`;
                            forceRefreshContent += `14. **pluggedin_clipboard_delete** - Delete clipboard entries\n`;
                            forceRefreshContent += `15. **pluggedin_clipboard_list** - List all clipboard entries (metadata only)\n`;
                            forceRefreshContent += `16. **pluggedin_clipboard_push** - Push to indexed clipboard (auto-increment)\n`;
                            forceRefreshContent += `17. **pluggedin_clipboard_pop** - Pop highest-indexed entry (LIFO)\n`;
                            forceRefreshContent += `\n`;
                            
                            // Add dynamic tools section (from MCP servers)
                            if (toolsCount > 0) {
                                const tools = toolsResponse.data?.tools || toolsResponse.data || [];
                                forceRefreshContent += `## ⚡ Dynamic MCP Tools (${toolsCount}) - From Connected Servers:\n`;
                                tools.forEach((tool: Tool, index: number) => {
                                    forceRefreshContent += `${index + 1}. **${tool.name}**`;
                                    if (tool.description) {
                                        forceRefreshContent += ` - ${tool.description}`;
                                    }
                                    forceRefreshContent += `\n`;
                                });
                                forceRefreshContent += `\n`;
                            } else {
                                forceRefreshContent += `## ⚡ Dynamic MCP Tools (0) - From Connected Servers:\n`;
                                forceRefreshContent += `No dynamic tools available. Add MCP servers to get more tools.\n\n`;
                            }
                            
                            // Add prompts section  
                            if (promptsCount > 0) {
                                forceRefreshContent += `## 💬 Available Prompts (${promptsCount}):\n`;
                                promptsResponse.data.forEach((prompt: { name: string; description?: string }, index: number) => {
                                    forceRefreshContent += `${index + 1}. **${prompt.name}**`;
                                    if (prompt.description) {
                                        forceRefreshContent += ` - ${prompt.description}`;
                                    }
                                    forceRefreshContent += `\n`;
                                });
                                forceRefreshContent += `\n`;
                            }
                            
                            // Add resources section
                            if (resourcesCount > 0) {
                                forceRefreshContent += `## 📄 Available Resources (${resourcesCount}):\n`;
                                resourcesResponse.data.forEach((resource: { uri: string; name: string; description?: string; mimeType?: string }, index: number) => {
                                    forceRefreshContent += `${index + 1}. **${resource.name || resource.uri}**`;
                                    if (resource.description) {
                                        forceRefreshContent += ` - ${resource.description}`;
                                    }
                                    if (resource.uri && resource.name !== resource.uri) {
                                        forceRefreshContent += ` (${resource.uri})`;
                                    }
                                    forceRefreshContent += `\n`;
                                });
                                forceRefreshContent += `\n`;
                            }
                            
                            // Add templates section
                            if (templatesCount > 0) {
                                forceRefreshContent += `## 📋 Available Resource Templates (${templatesCount}):\n`;
                                templatesResponse.data.forEach((template: ResourceTemplate, index: number) => {
                                    forceRefreshContent += `${index + 1}. **${template.name || template.uriTemplate}**`;
                                    if (template.description) {
                                        forceRefreshContent += ` - ${template.description}`;
                                    }
                                    if (template.uriTemplate && template.name !== template.uriTemplate) {
                                        forceRefreshContent += ` (${template.uriTemplate})`;
                                    }
                                    forceRefreshContent += `\n`;
                                });
                                forceRefreshContent += `\n`;
                            }
                            
                            // Add custom instructions section
                            forceRefreshContent += await formatCustomInstructionsForDiscovery();
                            
                            forceRefreshContent += `📝 **Note**: Fresh discovery is running in background. Call pluggedin_discover_tools() again in 10-30 seconds to see if any new tools were discovered.`;

                        } catch (cacheError: unknown) {
                            // If we can't get cached data, just show static tools
                            forceRefreshContent = server_uuid 
                                ? `🔄 Force refresh initiated for server ${server_uuid}. Discovery is running in background.\n\nCould not retrieve cached data, showing static tools:\n\n`
                                : `🔄 Force refresh initiated for all servers. Discovery is running in background.\n\nCould not retrieve cached data, showing static tools:\n\n`;
                                
                            forceRefreshContent += `## 🔧 Static Built-in Tools (Always Available):\n`;
                            forceRefreshContent += `1. **pluggedin_discover_tools** - Triggers discovery of tools (and resources/templates) for configured MCP servers in the Pluggedin App\n`;
                            forceRefreshContent += `2. **pluggedin_ask_knowledge_base** - Performs a RAG query against documents in the Pluggedin App\n`;
                            forceRefreshContent += `3. **pluggedin_send_notification** - Send custom notifications through the Plugged.in system with optional email delivery\n`;
                            forceRefreshContent += `\n📝 **Note**: Fresh discovery is running in background. Call pluggedin_discover_tools() again in 10-30 seconds to see updated results.`;
                        }

                        // Log successful trigger
                        logMcpActivity({
                            action: 'tool_call',
                            serverName: 'Discovery System (Background)',
                            serverUuid: 'pluggedin_discovery_bg',
                            itemName: requestedToolName,
                            success: true,
                            executionTime: timer.stop(),
                        }).catch(() => {}); // Ignore notification errors
                        
                        return {
                            content: [{ type: "text", text: forceRefreshContent }],
                            isError: false,
                        } as ToolExecutionResult;

                    } catch (triggerError: any) {
                        // Even trigger failed, return error
                        const errorMsg = `Failed to trigger background discovery: ${triggerError.message}`;
                        
                        // Log failed trigger
                        logMcpActivity({
                            action: 'tool_call',
                            serverName: 'Discovery System',
                            serverUuid: 'pluggedin_discovery',
                            itemName: requestedToolName,
                            success: false,
                            errorMessage: errorMsg,
                            executionTime: timer.stop(),
                        }).catch(() => {}); // Ignore notification errors
                        
                        throw new Error(errorMsg);
                    }
                } else {
                    // For regular discovery (no force refresh), wait for completion
                    try {
                        const discoveryResponse = await axios.post(discoveryApiUrl, { force_refresh: false }, {
                            headers: { Authorization: `Bearer ${apiKey}` },
                            timeout: 30000, // 30s timeout for regular discovery
                        });

                        // Return success message from the discovery API response
                        const baseMessage = discoveryResponse.data?.message || "Discovery process initiated.";
                        const contextMessage = `${existingDataSummary}. ${baseMessage}\n\nNote: You can call pluggedin_discover_tools again to see the cached results including both static and dynamic tools.`;
                        
                        // Log successful discovery
                        logMcpActivity({
                            action: 'tool_call',
                            serverName: 'Discovery System',
                            serverUuid: 'pluggedin_discovery',
                            itemName: requestedToolName,
                            success: true,
                            executionTime: timer.stop(),
                        }).catch(() => {}); // Ignore notification errors
                        
                        return {
                            content: [{ type: "text", text: contextMessage }],
                            isError: false,
                        } as ToolExecutionResult;

                    } catch (apiError: unknown) {
                        // Log failed discovery
                        logMcpActivity({
                            action: 'tool_call',
                            serverName: 'Discovery System',
                            serverUuid: 'pluggedin_discovery',
                            itemName: requestedToolName,
                            success: false,
                            errorMessage: apiError instanceof Error ? apiError.message : String(apiError),
                            executionTime: timer.stop(),
                        }).catch(() => {}); // Ignore notification errors
                        
                         const errorMsg = axios.isAxiosError(apiError)
                            ? `API Error (${apiError.response?.status}): ${apiError.response?.data?.error || apiError.message}`
                            : (apiError instanceof Error ? apiError.message : 'Unknown error');
                         throw new Error(`Failed to trigger discovery via API: ${errorMsg}`);
                    }
                }
            }
        }

        // Handle static RAG query tool
        if (requestedToolName === askKnowledgeBaseStaticTool.name) {
            const validatedArgs = AskKnowledgeBaseInputSchema.parse(args ?? {}); // Validate args

            const apiKey = getPluggedinMCPApiKey();
            const baseUrl = getPluggedinMCPApiBaseUrl();
            if (!apiKey || !baseUrl) {
                throw new Error("Pluggedin API Key or Base URL is not configured for RAG query.");
            }

            // Define the API endpoint in pluggedin-app for RAG queries
            const ragApiUrl = `${baseUrl}/api/rag/query`;
            const timer = createExecutionTimer();

            try {
                // Make POST request with RAG query - always request metadata
                const ragResponse = await axios.post(ragApiUrl, {
                    query: validatedArgs.query,
                    includeMetadata: true // Always request metadata
                }, {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000, // Reduced timeout to prevent DoS
                });

                // Handle response - always return structured JSON
                let responseContent: any;

                if (typeof ragResponse.data === 'object' && ragResponse.data.answer) {
                    const { answer, sources = [], documentIds = [], documentVersions = [], relevanceScores = [] } = ragResponse.data;

                    // Build enhanced source objects if we have additional data
                    let enhancedSources = [];
                    if (sources.length > 0) {
                        enhancedSources = sources.map((source: string, index: number) => ({
                            name: source,
                            id: documentIds[index] || null,
                            version: documentVersions[index] || null,
                            relevance: relevanceScores[index] || null
                        }));
                    } else if (documentIds.length > 0) {
                        enhancedSources = documentIds.map((id: string, index: number) => ({
                            id: id,
                            version: documentVersions[index] || null,
                            relevance: relevanceScores[index] || null
                        }));
                    }

                    // Return structured JSON response
                    const structuredResponse = {
                        answer: answer || "No response received",
                        sources: enhancedSources.length > 0 ? enhancedSources : sources.length > 0 ? sources : documentIds,
                        metadata: {
                            query: validatedArgs.query,
                            sourceCount: sources.length || documentIds.length,
                            timestamp: new Date().toISOString()
                        }
                    };

                    responseContent = JSON.stringify(structuredResponse, null, 2);
                } else {
                    // Fallback for plain text responses from older API versions
                    const structuredResponse = {
                        answer: ragResponse.data || "No response generated",
                        sources: [],
                        metadata: {
                            query: validatedArgs.query,
                            sourceCount: 0,
                            timestamp: new Date().toISOString()
                        }
                    };
                    responseContent = JSON.stringify(structuredResponse, null, 2);
                }

                // Log successful RAG query
                logMcpActivity({
                    action: 'tool_call',
                    serverName: 'RAG System',
                    serverUuid: 'pluggedin_rag',
                    itemName: requestedToolName,
                    success: true,
                    executionTime: timer.stop(),
                }).catch(() => {}); // Ignore notification errors

                return {
                    content: [{ type: "text", text: responseContent }],
                    isError: false,
                } as ToolExecutionResult; // Cast to expected type

            } catch (apiError: unknown) {
                 // Log failed RAG query
                 logMcpActivity({
                     action: 'tool_call',
                     serverName: 'RAG System',
                     serverUuid: 'pluggedin_rag',
                     itemName: requestedToolName,
                     success: false,
                     errorMessage: apiError instanceof Error ? apiError.message : String(apiError),
                     executionTime: timer.stop(),
                 }).catch(() => {}); // Ignore notification errors
                 
                 // Sanitized error message to prevent information disclosure
                 const errorMsg = axios.isAxiosError(apiError) && apiError.response?.status
                    ? `RAG service error (${apiError.response.status})`
                    : "RAG service temporarily unavailable";
                 throw new Error(errorMsg);
            }
        }

        // Handle static send notification tool
        if (requestedToolName === sendNotificationStaticTool.name) {
            const validatedArgs = SendNotificationInputSchema.parse(args ?? {}); // Validate args

            const apiKey = getPluggedinMCPApiKey();
            const baseUrl = getPluggedinMCPApiBaseUrl();
            if (!apiKey || !baseUrl) {
                throw new Error("Pluggedin API Key or Base URL is not configured for custom notifications.");
            }

            // Define the API endpoint in pluggedin-app for custom notifications
            const notificationApiUrl = `${baseUrl}/api/notifications/custom`;
            const timer = createExecutionTimer();

            try {
                // Make POST request with notification data
                const notificationResponse = await axios.post(notificationApiUrl, {
                    title: validatedArgs.title,
                    message: validatedArgs.message,
                    severity: validatedArgs.severity,
                    sendEmail: validatedArgs.sendEmail,
                }, {
                    headers: { 
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000, // Increased timeout for notifications
                });

                // The API returns success confirmation
                const responseData = notificationResponse.data;
                const responseText = responseData?.message || "Notification sent successfully";
                
                // Log successful notification
                logMcpActivity({
                    action: 'tool_call',
                    serverName: 'Notification System',
                    serverUuid: 'pluggedin_notifications',
                    itemName: requestedToolName,
                    success: true,
                    executionTime: timer.stop(),
                }).catch(() => {}); // Ignore notification errors
                
                return {
                    content: [{ type: "text", text: responseText }],
                    isError: false,
                } as ToolExecutionResult; // Cast to expected type

            } catch (apiError: unknown) {
                 // Log failed notification
                 logMcpActivity({
                     action: 'tool_call',
                     serverName: 'Notification System',
                     serverUuid: 'pluggedin_notifications',
                     itemName: requestedToolName,
                     success: false,
                     errorMessage: apiError instanceof Error ? apiError.message : String(apiError),
                     executionTime: timer.stop(),
                 }).catch(() => {}); // Ignore notification errors
                 
                 // Sanitized error message
                 const errorMsg = axios.isAxiosError(apiError) && apiError.response?.status
                    ? `Notification service error (${apiError.response.status})`
                    : "Notification service temporarily unavailable";
                 throw new Error(errorMsg);
            }
        }

        // Handle static list notifications tool
        if (requestedToolName === listNotificationsStaticTool.name) {
            const validatedArgs = ListNotificationsInputSchema.parse(args ?? {}); // Validate args

            const apiKey = getPluggedinMCPApiKey();
            const baseUrl = getPluggedinMCPApiBaseUrl();
            if (!apiKey || !baseUrl) {
                throw new Error("Pluggedin API Key or Base URL is not configured for listing notifications.");
            }

            // Build query parameters
            const queryParams = new URLSearchParams();
            if (validatedArgs.onlyUnread) {
                queryParams.append('onlyUnread', 'true');
            }
            if (validatedArgs.limit) {
                queryParams.append('limit', validatedArgs.limit.toString());
            }

            const notificationApiUrl = `${baseUrl}/api/notifications${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
            const timer = createExecutionTimer();

            try {
                // Make GET request to list notifications
                const notificationResponse = await axios.get(notificationApiUrl, {
                    headers: { 
                        Authorization: `Bearer ${apiKey}`,
                    },
                    timeout: 15000,
                });

                const notifications = notificationResponse.data?.notifications || [];
                
                // Format the response for better readability
                let responseText = `Found ${notifications.length} notification${notifications.length !== 1 ? 's' : ''}`;
                if (validatedArgs.onlyUnread) {
                    responseText += ' (unread only)';
                }
                responseText += ':\n\n';
                
                if (notifications.length === 0) {
                    responseText += 'No notifications found.';
                } else {
                    notifications.forEach((notif: any, index: number) => {
                        responseText += `${index + 1}. **${notif.title}**\n`;
                        responseText += `   ID: ${notif.id} (use this ID for operations)\n`;
                        responseText += `   Type: ${notif.type} | Severity: ${notif.severity || 'N/A'}\n`;
                        responseText += `   Status: ${notif.read ? 'Read' : 'Unread'}${notif.completed ? ' | Completed' : ''}\n`;
                        responseText += `   Created: ${new Date(notif.created_at).toLocaleString()}\n`;
                        responseText += `   Message: ${notif.message}\n`;
                        if (notif.link) {
                            responseText += `   Link: ${notif.link}\n`;
                        }
                        responseText += '\n';
                    });
                    responseText += '💡 **Tip**: Use the UUID shown in the ID field when marking as read or deleting notifications.';
                }
                
                // Log successful list
                logMcpActivity({
                    action: 'tool_call',
                    serverName: 'Notification System',
                    serverUuid: 'pluggedin_notifications',
                    itemName: requestedToolName,
                    success: true,
                    executionTime: timer.stop(),
                }).catch(() => {}); // Ignore notification errors
                
                return {
                    content: [{ type: "text", text: responseText }],
                    isError: false,
                } as ToolExecutionResult;

            } catch (apiError: unknown) {
                 // Log failed list
                 logMcpActivity({
                     action: 'tool_call',
                     serverName: 'Notification System',
                     serverUuid: 'pluggedin_notifications',
                     itemName: requestedToolName,
                     success: false,
                     errorMessage: apiError instanceof Error ? apiError.message : String(apiError),
                     executionTime: timer.stop(),
                 }).catch(() => {}); // Ignore notification errors
                 
                 // Sanitized error message
                 const errorMsg = axios.isAxiosError(apiError) && apiError.response?.status
                    ? `Notification service error (${apiError.response.status})`
                    : "Notification service temporarily unavailable";
                 throw new Error(errorMsg);
            }
        }

        // Handle static mark notification as read tool
        if (requestedToolName === markNotificationDoneStaticTool.name) {
            const validatedArgs = MarkNotificationDoneInputSchema.parse(args ?? {}); // Validate args

            const apiKey = getPluggedinMCPApiKey();
            const baseUrl = getPluggedinMCPApiBaseUrl();
            if (!apiKey || !baseUrl) {
                throw new Error("Pluggedin API Key or Base URL is not configured for marking notifications.");
            }

            const notificationApiUrl = `${baseUrl}/api/notifications/${validatedArgs.notificationId}/completed`;
            const timer = createExecutionTimer();

            try {
                // Make PATCH request to mark notification as read
                const notificationResponse = await axios.patch(notificationApiUrl, {}, {
                    headers: { 
                        Authorization: `Bearer ${apiKey}`,
                    },
                    timeout: 15000,
                });

                const responseText = notificationResponse.data?.message || "Notification marked as done";
                
                // Log successful mark as done
                logMcpActivity({
                    action: 'tool_call',
                    serverName: 'Notification System',
                    serverUuid: 'pluggedin_notifications',
                    itemName: requestedToolName,
                    success: true,
                    executionTime: timer.stop(),
                }).catch(() => {}); // Ignore notification errors
                
                return {
                    content: [{ type: "text", text: responseText }],
                    isError: false,
                } as ToolExecutionResult;

            } catch (apiError: unknown) {
                 // Log failed mark as done
                 logMcpActivity({
                     action: 'tool_call',
                     serverName: 'Notification System',
                     serverUuid: 'pluggedin_notifications',
                     itemName: requestedToolName,
                     success: false,
                     errorMessage: apiError instanceof Error ? apiError.message : String(apiError),
                     executionTime: timer.stop(),
                 }).catch(() => {}); // Ignore notification errors
                 
                 // Handle specific error cases
                 let errorMsg = "Failed to mark notification as read";
                 if (axios.isAxiosError(apiError)) {
                     if (apiError.response?.status === 404) {
                         errorMsg = "Notification not found or not accessible";
                     } else if (apiError.response?.status) {
                         errorMsg = `Notification service error (${apiError.response.status})`;
                     }
                 }
                 throw new Error(errorMsg);
            }
        }

        // Handle static delete notification tool
        if (requestedToolName === deleteNotificationStaticTool.name) {
            const validatedArgs = DeleteNotificationInputSchema.parse(args ?? {}); // Validate args

            const apiKey = getPluggedinMCPApiKey();
            const baseUrl = getPluggedinMCPApiBaseUrl();
            if (!apiKey || !baseUrl) {
                throw new Error("Pluggedin API Key or Base URL is not configured for deleting notifications.");
            }

            const notificationApiUrl = `${baseUrl}/api/notifications/${validatedArgs.notificationId}`;
            const timer = createExecutionTimer();

            try {
                // Make DELETE request to delete notification
                const notificationResponse = await axios.delete(notificationApiUrl, {
                    headers: { 
                        Authorization: `Bearer ${apiKey}`,
                    },
                    timeout: 15000,
                });

                const responseText = notificationResponse.data?.message || "Notification deleted successfully";
                
                // Log successful delete
                logMcpActivity({
                    action: 'tool_call',
                    serverName: 'Notification System',
                    serverUuid: 'pluggedin_notifications',
                    itemName: requestedToolName,
                    success: true,
                    executionTime: timer.stop(),
                }).catch(() => {}); // Ignore notification errors
                
                return {
                    content: [{ type: "text", text: responseText }],
                    isError: false,
                } as ToolExecutionResult;

            } catch (apiError: unknown) {
                 // Log failed delete
                 logMcpActivity({
                     action: 'tool_call',
                     serverName: 'Notification System',
                     serverUuid: 'pluggedin_notifications',
                     itemName: requestedToolName,
                     success: false,
                     errorMessage: apiError instanceof Error ? apiError.message : String(apiError),
                     executionTime: timer.stop(),
                 }).catch(() => {}); // Ignore notification errors
                 
                 // Handle specific error cases
                 let errorMsg = "Failed to delete notification";
                 if (axios.isAxiosError(apiError)) {
                     if (apiError.response?.status === 404) {
                         errorMsg = "Notification not found or not accessible";
                     } else if (apiError.response?.status) {
                         errorMsg = `Notification service error (${apiError.response.status})`;
                     }
                 }
                 throw new Error(errorMsg);
            }
        }

        // Handle static tools (documents and clipboard) using StaticToolHandlers
        const staticHandlers = new StaticToolHandlers(toolToServerMap, instructionToServerMap);
        const staticTools = [
            // Document tools
            createDocumentStaticTool.name,
            listDocumentsStaticTool.name,
            searchDocumentsStaticTool.name,
            getDocumentStaticTool.name,
            updateDocumentStaticTool.name,
            // Clipboard tools
            clipboardSetStaticTool.name,
            clipboardGetStaticTool.name,
            clipboardDeleteStaticTool.name,
            clipboardListStaticTool.name,
            clipboardPushStaticTool.name,
            clipboardPopStaticTool.name
        ];

        if (staticTools.includes(requestedToolName)) {
            const result = await staticHandlers.handleStaticTool(requestedToolName, args);
            if (result) {
                return result;
            }
        }

        // Look up the downstream tool in our map
        let toolInfo = toolToServerMap[requestedToolName];
        let originalName: string;
        let serverUuid: string;

        if (toolInfo) {
            // Tool found directly in map
            originalName = toolInfo.originalName;
            serverUuid = toolInfo.serverUuid;
        } else {
            // Tool not found directly, try parsing as a prefixed name for backward compatibility
            const parsed = parseAnyPrefixedToolName(requestedToolName);
            if (parsed) {
                // This is a prefixed tool name that wasn't in our map
                // Try to find the tool by its original name and server identifier
                const originalToolInfo = Object.values(toolToServerMap).find(
                    info => info.originalName === parsed.originalName && (
                        parsed.prefixType === 'slug' || 
                        (parsed.prefixType === 'uuid' && info.serverUuid === parsed.serverIdentifier)
                    )
                );

                if (originalToolInfo) {
                    originalName = parsed.originalName;
                    serverUuid = originalToolInfo.serverUuid;
                    debugLog(`[CallTool Handler] Found ${parsed.prefixType}-prefixed tool: ${requestedToolName} -> ${originalName} on server ${serverUuid}`);
                } else {
                    throw new Error(`Tool not found: ${requestedToolName} (parsed as server ${parsed.prefixType} ${parsed.serverIdentifier}, tool ${parsed.originalName})`);
                }
            } else {
                // Not a prefixed name and not in map
                throw new Error(`Tool not found: ${requestedToolName}`);
            }
        }

        // Basic server UUID validation
        if (
            !serverUuid ||
            typeof serverUuid !== 'string' ||
            !isValidUuid(serverUuid)
        ) {
            throw new Error("Invalid server UUID format");
        }

        // Get the downstream server session
        const serverParams = await getMcpServers(true);
        
        const params = serverParams[serverUuid];
        if (!params) {
            throw new Error(`Configuration not found for server UUID: ${serverUuid} associated with tool ${requestedToolName}`);
        }
        const sessionKey = getSessionKey(serverUuid, params);
        const session = await getSession(sessionKey, serverUuid, params);

        if (!session) {
            throw new Error(`Session not found for server UUID: ${serverUuid}`);
        }

        // Get server context from static handlers if available
        let serverContext: any = undefined;
        if (staticHandlers) {
            // Use constraint map for efficient validation
            const constraints = staticHandlers.getConstraints(serverUuid);
            if (constraints) {
                // Check if the tool violates any constraints
                const { validateToolAgainstConstraints } = await import('./utils/custom-instructions.js');
                const constraintMap = new Map([[serverUuid, constraints]]);
                const validation = validateToolAgainstConstraints(originalName, serverUuid, constraintMap);
                if (!validation.valid) {
                    throw new Error(validation.reason || 'Tool execution blocked by server constraints');
                }
            }
            
            // Get the full context for metadata
            const context = staticHandlers.getServerContextByUuid(serverUuid);
            if (context) {
                // Add context to metadata for the downstream server
                serverContext = {
                    instructions: context.formattedContext,
                    constraints: Object.keys(context.constraints).length > 0 ? context.constraints : undefined,
                    isReadOnly: context.constraints.readonly
                };
            }
        }
        
        // Proxy the call to the downstream server using the original tool name
        const timer = createExecutionTimer();
        
        try {
            // Include server context in metadata if available
            const enhancedMeta = serverContext 
                ? { ...meta, serverContext } 
                : meta;
            
            const result = await session.client.request(
                { method: "tools/call", params: { name: originalName, arguments: args, _meta: enhancedMeta } },
                 CompatibilityCallToolResultSchema
            );

            // Log successful tool call
            logMcpActivity({
                action: 'tool_call',
                serverName: params.name || serverUuid,
                serverUuid,
                itemName: originalName,
                success: true,
                executionTime: timer.stop(),
            }).catch(() => {}); // Ignore notification errors

            // Return the result directly, casting to any to satisfy the handler's complex return type
            return result as any;
        } catch (toolError) {
            // Log failed tool call
            logMcpActivity({
                action: 'tool_call',
                serverName: params.name || serverUuid,
                serverUuid,
                itemName: originalName,
                success: false,
                errorMessage: toolError instanceof Error ? toolError.message : String(toolError),
                executionTime: timer.stop(),
            }).catch(() => {}); // Ignore notification errors
            
            // Re-throw the original error
            throw toolError;
        }

    } catch (error) {
      const sanitizedError = sanitizeErrorMessage(error);
      // Use requestedToolName here, which is in scope
      debugError(`[CallTool Handler Error] Tool: ${requestedToolName || 'unknown'}, Error: ${sanitizedError}`);

      // Re-throw the error for the SDK to format and send back to the client
      if (error instanceof Error) {
         // Create a new error with sanitized message to prevent info disclosure
         throw new Error(sanitizedError);
      } else {
         throw new Error(sanitizedError || "An unknown error occurred during tool execution");
      }
    }
  });

  // Get Prompt Handler - Handles static prompts, custom instructions, and standard prompts
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const meta = request.params._meta;
    const instructionPrefix = 'pluggedin_instruction_';
    const systemContextSuffix = '__system_context';

    // Handle static proxy capabilities prompt first
    if (name === proxyCapabilitiesStaticPrompt.name) {
      const timer = createExecutionTimer();
      
      try {
        // Log successful static prompt retrieval
        logMcpActivity({
          action: 'prompt_get',
          serverName: 'Proxy System',
          serverUuid: 'pluggedin_proxy',
          itemName: name,
          success: true,
          executionTime: timer.stop(),
        }).catch(() => {}); // Ignore notification errors
        
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `# Plugged.in MCP Proxy Capabilities

The Plugged.in MCP Proxy is a powerful gateway that provides access to multiple MCP servers and built-in tools. Here's what you can do:

## 🔧 Built-in Static Tools (17 Total)

### Discovery (1 tool)

#### 1. **pluggedin_discover_tools**
- **Purpose**: Trigger discovery of tools and resources from configured MCP servers
- **Parameters**:
  - \`server_uuid\` (optional): Discover from specific server, or all servers if omitted
  - \`force_refresh\` (optional): Set to true to trigger background discovery and return immediately (defaults to false)
- **Usage**: Returns cached data instantly if available. Use \`force_refresh=true\` to update data in background, then call again without force_refresh to see results.

### Knowledge Base (1 tool)

#### 2. **pluggedin_ask_knowledge_base**
- **Purpose**: Perform RAG (Retrieval-Augmented Generation) queries against your documents
- **Parameters**:
  - \`query\` (required): The search query (1-1000 characters)
- **Usage**: Search through uploaded documents and knowledge base

### Notifications (4 tools)

#### 3. **pluggedin_send_notification**
- **Purpose**: Send custom notifications through the Plugged.in system
- **Parameters**:
  - \`message\` (required): The notification message content
  - \`title\` (optional): Custom notification title
  - \`severity\` (optional): INFO, SUCCESS, WARNING, or ALERT (defaults to INFO)
  - \`sendEmail\` (optional): Whether to also send via email (defaults to false)
- **Usage**: Create custom notifications with optional email delivery

#### 4. **pluggedin_list_notifications**
- **Purpose**: List notifications from the Plugged.in system
- **Parameters**:
  - \`onlyUnread\` (optional): Filter to show only unread notifications (defaults to false)
  - \`limit\` (optional): Limit the number of notifications returned (1-100)
- **Usage**: Retrieve and check your notifications with optional filters

#### 5. **pluggedin_mark_notification_done**
- **Purpose**: Mark a notification as done
- **Parameters**:
  - \`notificationId\` (required): The ID of the notification to mark as done
- **Usage**: Update notification status to done

#### 6. **pluggedin_delete_notification**
- **Purpose**: Delete a notification
- **Parameters**:
  - \`notificationId\` (required): The ID of the notification to delete
- **Usage**: Remove notifications from your list

### Documents (5 tools)

#### 7. **pluggedin_create_document**
- **Purpose**: Create AI-generated documents in your library
- **Parameters**:
  - \`title\` (required): Document title (1-255 characters)
  - \`content\` (required): Document content
  - \`format\` (optional): md, txt, json, or html (defaults to md)
  - \`tags\` (optional): Tags for categorization (max 20)
  - \`category\` (optional): report, analysis, documentation, guide, research, code, or other
  - \`metadata\` (required): AI model info, context, visibility, etc.
- **Usage**: Save AI-generated content with full attribution and metadata

#### 8. **pluggedin_list_documents**
- **Purpose**: List documents with filtering and pagination
- **Parameters**:
  - \`filters\` (optional): Filter by source, model, dates, tags, category, search query
  - \`sort\` (optional): date_desc, date_asc, title, or size (defaults to date_desc)
  - \`limit\` (optional): Maximum documents to return (1-100, default 20)
  - \`offset\` (optional): Pagination offset (default 0)
- **Usage**: Browse and filter your document library

#### 9. **pluggedin_search_documents**
- **Purpose**: Search documents semantically
- **Parameters**:
  - \`query\` (required): Search query text (1-500 characters)
  - \`filters\` (optional): Filter by model, dates, tags, source
  - \`limit\` (optional): Maximum results (1-50, default 10)
- **Usage**: Find documents using semantic search

#### 10. **pluggedin_get_document**
- **Purpose**: Retrieve a specific document by ID
- **Parameters**:
  - \`documentId\` (required): Document UUID
  - \`includeContent\` (optional): Include full content (default false)
  - \`includeVersions\` (optional): Include version history (default false)
- **Usage**: Get detailed information about a specific document

#### 11. **pluggedin_update_document**
- **Purpose**: Update or append to an existing document
- **Parameters**:
  - \`documentId\` (required): Document UUID
  - \`operation\` (required): replace, append, or prepend
  - \`content\` (required): New content
  - \`metadata\` (optional): Update metadata (tags, change summary, etc.)
- **Usage**: Modify existing documents with version tracking

### Clipboard (7 tools)

#### 12. **pluggedin_clipboard_set**
- **Purpose**: Set a clipboard entry by name or index
- **Parameters**:
  - \`name\` (optional): Named key for semantic access (e.g., 'customer_context')
  - \`idx\` (optional): Numeric index for array-like access (e.g., 0, 1, 2)
  - \`value\` (required): The content to store
  - \`contentType\` (optional): MIME type (default 'text/plain')
  - \`encoding\` (optional): utf-8, base64, or hex (default utf-8)
  - \`visibility\` (optional): private, workspace, or public (default private)
  - \`ttlSeconds\` (optional): Time-to-live in seconds (default 24 hours)
- **Usage**: Store data by name or index. Named entries are upserted; indexed entries fail if index exists.

#### 13. **pluggedin_clipboard_get**
- **Purpose**: Get clipboard entries with pagination
- **Parameters**:
  - \`name\` (optional): Get entry by name
  - \`idx\` (optional): Get entry by index
  - \`contentType\` (optional): Filter by content type
  - \`limit\` (optional): Maximum entries (1-100, default 50)
  - \`offset\` (optional): Pagination offset (default 0)
- **Usage**: Without name/idx, lists all entries with pagination

#### 14. **pluggedin_clipboard_delete**
- **Purpose**: Delete clipboard entries
- **Parameters**:
  - \`name\` (optional): Delete entry by name
  - \`idx\` (optional): Delete entry by index
  - \`clearAll\` (optional): Delete all entries (default false)
- **Usage**: Remove entries by name, index, or clear all

#### 15. **pluggedin_clipboard_list**
- **Purpose**: List all clipboard entries (metadata only)
- **Parameters**:
  - \`contentType\` (optional): Filter by content type
  - \`limit\` (optional): Maximum entries (1-100, default 50)
  - \`offset\` (optional): Pagination offset (default 0)
- **Usage**: Get overview of clipboard with truncated values

#### 16. **pluggedin_clipboard_push**
- **Purpose**: Push to indexed clipboard with auto-incrementing index
- **Parameters**:
  - \`value\` (required): The content to push
  - \`contentType\` (optional): MIME type (default 'text/plain')
  - \`encoding\` (optional): utf-8, base64, or hex (default utf-8)
  - \`visibility\` (optional): private, workspace, or public (default private)
  - \`ttlSeconds\` (optional): Time-to-live in seconds (default 24 hours)
- **Usage**: Stack-like push operation with automatic indexing

#### 17. **pluggedin_clipboard_pop**
- **Purpose**: Pop the highest-indexed entry (LIFO behavior)
- **Parameters**: None
- **Usage**: Stack-like pop operation, removes and returns the last pushed entry

## 🔗 Proxy Features

### MCP Server Management
- **Auto-discovery**: Automatically discovers tools, prompts, and resources from configured servers
- **Session Management**: Maintains persistent connections to downstream MCP servers
- **Error Handling**: Graceful error handling and recovery for server connections

### Authentication & Security
- **API Key Authentication**: Secure access using your Plugged.in API key
- **Profile-based Access**: All operations are scoped to your active profile
- **Audit Logging**: All MCP activities are logged for monitoring and debugging

### Data Management
- **Document Library**: Full-featured document management with AI attribution and versioning
- **Clipboard Storage**: Temporary storage for data sharing between tools and sessions
- **Notification System**: Activity tracking and custom notifications with email delivery

## 🚀 Getting Started

1. **Configure Environment**: Set \`PLUGGEDIN_API_KEY\` and \`PLUGGEDIN_API_BASE_URL\`
2. **Discover Tools**: Run \`pluggedin_discover_tools\` to see available tools from your servers
3. **Use Tools**: Call any discovered tool through the proxy
4. **Query Documents**: Use \`pluggedin_ask_knowledge_base\` to search your knowledge base
5. **Manage Documents**: Use document tools to create, list, search, get, and update documents
6. **Use Clipboard**: Store temporary data with clipboard tools for sharing between operations
7. **Manage Notifications**: Send, list, mark as done, and delete notifications

## 📊 Monitoring

- Check the Plugged.in app notifications to see MCP activity logs
- Monitor execution times and success rates
- View custom notifications in the notification center
- Track document creation and clipboard usage

The proxy acts as a unified gateway to all your MCP capabilities while providing enhanced features like RAG, document management, clipboard storage, notifications, and comprehensive logging.`
              }
            }
          ]
        };
      } catch (error) {
        // Log failed static prompt retrieval
        logMcpActivity({
          action: 'prompt_get',
          serverName: 'Proxy System',
          serverUuid: 'pluggedin_proxy',
          itemName: name,
          success: false,
          errorMessage: error instanceof Error ? error.message : String(error),
          executionTime: timer.stop(),
        }).catch(() => {}); // Ignore notification errors
        
        throw error;
      }
    }

    try {
      const apiKey = getPluggedinMCPApiKey();
      const baseUrl = getPluggedinMCPApiBaseUrl();
      if (!apiKey || !baseUrl) {
        throw new Error("Pluggedin API Key or Base URL is not configured.");
      }

      // Check for both old and new naming patterns for custom instructions
      const isOldInstructionFormat = name.startsWith(instructionPrefix);
      const isNewInstructionFormat = name.endsWith(systemContextSuffix);
      
      if (isOldInstructionFormat || isNewInstructionFormat) {
        // --- Handle Custom Instruction Request ---
        const instructionData = instructionToServerMap[name];
        if (!instructionData) {
          throw new Error(`Custom instruction not found in map: ${name}. Try listing prompts again.`);
        }

        const timer = createExecutionTimer();
        
        try {
          // Custom instructions from the API should have an instruction field
          const messages: PromptMessage[] = [];
          
          // First check if there's an instruction field (the actual content)
          if (instructionData.instruction) {
            
            // Parse the instruction content - it should be a JSON array
            try {
              const parsedInstruction = typeof instructionData.instruction === 'string' 
                ? JSON.parse(instructionData.instruction)
                : instructionData.instruction;
                
              if (Array.isArray(parsedInstruction)) {
                for (const msg of parsedInstruction) {
                  // Handle simple strings (for backward compatibility or direct input)
                  if (typeof msg === 'string') {
                    messages.push({
                      role: "user",
                      content: {
                        type: "text",
                        text: msg
                      }
                    });
                  }
                  // Handle objects with content but no role
                  else if (typeof msg === 'object' && msg !== null) {
                    // Check if it has a role property
                    if (msg.role === "system") {
                      // Convert system messages to user messages with a prefix
                      messages.push({
                        role: "user",
                        content: {
                          type: "text",
                          text: `System: ${typeof msg.content === 'string' ? msg.content : msg.content?.text || msg.content}`
                        }
                      });
                    } else if (msg.role === "user" || msg.role === "assistant") {
                      // Keep user and assistant messages as-is
                      messages.push({
                        role: msg.role,
                        content: {
                          type: "text",
                          text: typeof msg.content === 'string' ? msg.content : msg.content?.text || msg.content
                        }
                      });
                    } else if (!msg.role && msg.content) {
                      // No role specified, treat as system message
                      messages.push({
                        role: "user",
                        content: {
                          type: "text",
                          text: `System: ${typeof msg.content === 'string' ? msg.content : msg.content?.text || msg.content}`
                        }
                      });
                    }
                  }
                }
              } else {
                // If not an array, use as a single message
                messages.push({
                  role: "assistant",
                  content: {
                    type: "text",
                    text: String(parsedInstruction)
                  }
                });
              }
            } catch (parseError) {
              // Log the parse error for debugging
              debugError(`[GetPrompt Handler] Failed to parse instruction for ${name}:`, parseError);
              
              // Return a clear warning message about the parsing failure
              // Convert system message to user message with prefix
              messages.push({
                role: "user",
                content: {
                  type: "text",
                  text: `System: Warning: Unable to parse instruction from API. The instruction data may be malformed. Raw value: ${JSON.stringify(instructionData.instruction).substring(0, 200)}...`
                }
              });
              
              // Include the raw instruction as fallback
              messages.push({
                role: "assistant",
                content: {
                  type: "text",
                  text: typeof instructionData.instruction === 'string' 
                    ? instructionData.instruction 
                    : JSON.stringify(instructionData.instruction)
                }
              });
            }
          } else if (instructionData.description) {
            // Fallback to description if no instruction field
            messages.push({
              role: "assistant",
              content: {
                type: "text",
                text: instructionData.description
              }
            });
          } else {
            messages.push({
              role: "assistant",
              content: {
                type: "text",
                text: "No instruction content available"
              }
            });
          }

          // Log successful custom instruction retrieval
          logMcpActivity({
            action: 'prompt_get',
            serverName: 'Custom Instructions',
            serverUuid: instructionData._serverUuid || 'unknown',
            itemName: name,
            success: true,
            executionTime: timer.stop(),
          }).catch(() => {}); // Ignore notification errors

          // Return the formatted messages
          return {
            messages: messages,
          } as z.infer<typeof GetPromptResultSchema>; // Ensure correct type

        } catch (apiError: unknown) {
           const errorMsg = axios.isAxiosError(apiError)
              ? `API Error (${apiError.response?.status}) fetching instruction ${name}: ${apiError.response?.data?.error || apiError.message}`
              : apiError instanceof Error ? apiError.message : String(apiError);
              
           // Log failed custom instruction retrieval
           logMcpActivity({
             action: 'prompt_get',
             serverName: 'Custom Instructions',
             serverUuid: instructionData?._serverUuid || 'unknown',
             itemName: name,
             success: false,
             errorMessage: errorMsg,
             executionTime: timer.stop(),
           }).catch(() => {}); // Ignore notification errors
           
           throw new Error(`Failed to fetch custom instruction details: ${errorMsg}`);
        }

      } else {
        // --- Handle Standard Prompt Request (Existing Logic) ---
        // 1. Call the resolve API endpoint to find which server has this prompt
        const resolveApiUrl = `${baseUrl}/api/resolve/prompt?name=${encodeURIComponent(name)}`;
        const resolveResponse = await axios.get<{uuid: string}>(resolveApiUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        });

        const resolvedData = resolveResponse.data;
        if (!resolvedData || !resolvedData.uuid) {
          throw new Error(`Could not resolve server details for prompt name: ${name}`);
        }

        // 2. Get FRESH server configuration using the same method as tools
        const serverParamsMap = await getMcpServers(true);
        const serverParams = serverParamsMap[resolvedData.uuid];
        
        if (!serverParams) {
          throw new Error(`Configuration not found for server UUID: ${resolvedData.uuid} associated with prompt ${name}`);
        }

        // 3. Get the downstream server session using fresh config
        const sessionKey = getSessionKey(serverParams.uuid, serverParams);
        const session = await getSession(sessionKey, serverParams.uuid, serverParams);

        if (!session) {
          await initSessions();
          const refreshedSession = await getSession(sessionKey, serverParams.uuid, serverParams);
          if (!refreshedSession) {
            throw new Error(`Session could not be established for server UUID: ${serverParams.uuid} handling prompt: ${name}`);
          }
          // Use the refreshed session
          const timer = createExecutionTimer();
          
          try {
            const result = await refreshedSession.client.request(
              { method: "prompts/get", params: { name, arguments: args, _meta: meta } },
              GetPromptResultSchema
            );
            
            // Log successful prompt retrieval
            logMcpActivity({
              action: 'prompt_get',
              serverName: serverParams.name || serverParams.uuid,
              serverUuid: serverParams.uuid,
              itemName: name,
              success: true,
              executionTime: timer.stop(),
            }).catch(() => {}); // Ignore notification errors
            
            return result;
          } catch (promptError) {
            // Log failed prompt retrieval
            logMcpActivity({
              action: 'prompt_get',
              serverName: serverParams.name || serverParams.uuid,
              serverUuid: serverParams.uuid,
              itemName: name,
              success: false,
              errorMessage: promptError instanceof Error ? promptError.message : String(promptError),
              executionTime: timer.stop(),
            }).catch(() => {}); // Ignore notification errors
            
            throw promptError;
          }
        } else {
          // Use the existing session
          const timer = createExecutionTimer();
          
          try {
            const result = await session.client.request(
              { method: "prompts/get", params: { name, arguments: args, _meta: meta } },
              GetPromptResultSchema
            );
            
            // Log successful prompt retrieval
            logMcpActivity({
              action: 'prompt_get',
              serverName: serverParams.name || serverParams.uuid,
              serverUuid: serverParams.uuid,
              itemName: name,
              success: true,
              executionTime: timer.stop(),
            }).catch(() => {}); // Ignore notification errors
            
            return result;
          } catch (promptError) {
            // Log failed prompt retrieval
            logMcpActivity({
              action: 'prompt_get',
              serverName: serverParams.name || serverParams.uuid,
              serverUuid: serverParams.uuid,
              itemName: name,
              success: false,
              errorMessage: promptError instanceof Error ? promptError.message : String(promptError),
              executionTime: timer.stop(),
            }).catch(() => {}); // Ignore notification errors
            
            throw promptError;
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = axios.isAxiosError(error)
        ? `API Error (${error.response?.status}) resolving/getting prompt ${name}: ${error.response?.data?.error || error.message}`
        : error instanceof Error
        ? error.message
        : `Unknown error getting prompt: ${name}`;
      debugError("[GetPrompt Handler Error]", errorMessage);
      throw new Error(`Failed to get prompt ${name}: ${errorMessage}`);
    }
  });

  // List Prompts Handler - Fetches aggregated list from Pluggedin App API
  // Extract ListPrompts handler logic for error handling
  const listPromptsHandler = withErrorHandling(async (request: any) => {
    const apiKey = getPluggedinMCPApiKey();
    const baseUrl = getPluggedinMCPApiBaseUrl();

    // If no API key, return only static prompts (for MCP best practices)
    if (!apiKey || !baseUrl) {
      return {
        prompts: [proxyCapabilitiesStaticPrompt],
        nextCursor: undefined
      };
    }

    const promptsApiUrl = `${baseUrl}/api/prompts`;

    // Only fetch standard prompts - custom instructions are now auto-injected via tool metadata
    const promptsResponse = await axios.get<z.infer<typeof ListPromptsResultSchema>["prompts"]>(promptsApiUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10000,
    });

    const standardPrompts = promptsResponse.data || [];

    // Only return standard prompts and static proxy capabilities
    // Custom instructions are now auto-injected via tool metadata
    const allPrompts = [
        proxyCapabilitiesStaticPrompt, // Add static proxy capabilities prompt
        ...standardPrompts
    ];

    // Wrap the combined array in the expected structure for the MCP response
    // Note: Pagination not handled here
    return { prompts: allPrompts, nextCursor: undefined };
  }, {
    action: 'list_prompts'
  });

  server.setRequestHandler(ListPromptsRequestSchema, listPromptsHandler);


  // List Resources Handler - Fetches aggregated list from Pluggedin App API
  // Extract ListResources handler logic for error handling
  const listResourcesHandler = withErrorHandling(async (request: any) => {
    const apiKey = getPluggedinMCPApiKey();
    const baseUrl = getPluggedinMCPApiBaseUrl();

    // If no API key, return empty resources (for MCP best practices)
    if (!apiKey || !baseUrl) {
      return {
        resources: [],
        nextCursor: undefined
      };
    }

    const apiUrl = `${baseUrl}/api/resources`; // Assuming this is the correct endpoint

    const response = await axios.get<z.infer<typeof ListResourcesResultSchema>["resources"]>(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 10000, // Add a timeout for the API call (e.g., 10 seconds)
    });

    // The API currently returns just the array, wrap it in the expected structure
    const resources = response.data || [];

    // Note: Pagination across servers via the API is not implemented here.
    // The API would need to support cursor-based pagination for this to work fully.
    return { resources: resources, nextCursor: undefined };
  }, {
    action: 'list_resources'
  });

  server.setRequestHandler(ListResourcesRequestSchema, listResourcesHandler);

  // Read Resource Handler - Simplified to only proxy
  // WARNING: This handler will likely fail now because resourceToClient is no longer populated.
  // It needs to be refactored to proxy the read request to the correct downstream server,
  // potentially by calling a new API endpoint on pluggedin-app or by re-establishing a session.
  // Refactored Read Resource Handler - Uses API to resolve URI to server details
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const meta = request.params._meta; // Pass meta along

    try {
        const apiKey = getPluggedinMCPApiKey();
        const baseUrl = getPluggedinMCPApiBaseUrl();
        if (!apiKey || !baseUrl) {
            throw new Error("Pluggedin API Key or Base URL is not configured for resource resolution.");
        }

        // 1. Call the new API endpoint to resolve the URI
        const resolveApiUrl = `${baseUrl}/api/resolve/resource?uri=${encodeURIComponent(uri)}`;

        const resolveResponse = await axios.get<ServerParameters>(resolveApiUrl, { // Expect ServerParameters type
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 10000, // Timeout for resolution call
        });

        const serverParams = resolveResponse.data;
        if (!serverParams || !serverParams.uuid) {
            throw new Error(`Could not resolve server details for URI: ${uri}`);
        }

        // 2. Get the downstream server session using resolved details
        const sessionKey = getSessionKey(serverParams.uuid, serverParams);
        // Ensure session is established before proceeding
        const session = await getSession(sessionKey, serverParams.uuid, serverParams);

        if (!session) {
            // Attempt to re-initialize sessions if not found (might happen on proxy restart)
            // This is a potential area for improvement (e.g., caching serverParams)
            debugError(`[ReadResource Handler] Session not found for ${serverParams.uuid}, attempting re-init...`);
            await initSessions(); // Re-initialize all sessions
            const refreshedSession = await getSession(sessionKey, serverParams.uuid, serverParams);
            if (!refreshedSession) {
               throw new Error(`Session could not be established for server UUID: ${serverParams.uuid} handling URI: ${uri}`);
            }
             // Use the refreshed session
             const timer = createExecutionTimer();
             
             try {
               const result = await refreshedSession.client.request(
                   { method: "resources/read", params: { uri, _meta: meta } }, // Pass original URI and meta
                   ReadResourceResultSchema
               );
               
               // Log successful resource read
               logMcpActivity({
                 action: 'resource_read',
                 serverName: serverParams.name || serverParams.uuid,
                 serverUuid: serverParams.uuid,
                 itemName: uri,
                 success: true,
                 executionTime: timer.stop(),
               }).catch(() => {}); // Ignore notification errors
               
               return result;
             } catch (resourceError) {
               // Log failed resource read
               logMcpActivity({
                 action: 'resource_read',
                 serverName: serverParams.name || serverParams.uuid,
                 serverUuid: serverParams.uuid,
                 itemName: uri,
                 success: false,
                 errorMessage: resourceError instanceof Error ? resourceError.message : String(resourceError),
                 executionTime: timer.stop(),
               }).catch(() => {}); // Ignore notification errors
               
               throw resourceError;
             }
        } else {
             // Use the existing session
             const timer = createExecutionTimer();
             
             try {
               const result = await session.client.request(
                   { method: "resources/read", params: { uri, _meta: meta } }, // Pass original URI and meta
                   ReadResourceResultSchema
               );
               
               // Log successful resource read
               logMcpActivity({
                 action: 'resource_read',
                 serverName: serverParams.name || serverParams.uuid,
                 serverUuid: serverParams.uuid,
                 itemName: uri,
                 success: true,
                 executionTime: timer.stop(),
               }).catch(() => {}); // Ignore notification errors
               
               return result;
             } catch (resourceError) {
               // Log failed resource read
               logMcpActivity({
                 action: 'resource_read',
                 serverName: serverParams.name || serverParams.uuid,
                 serverUuid: serverParams.uuid,
                 itemName: uri,
                 success: false,
                 errorMessage: resourceError instanceof Error ? resourceError.message : String(resourceError),
                 executionTime: timer.stop(),
               }).catch(() => {}); // Ignore notification errors
               
               throw resourceError;
             }
        }

    } catch (error: unknown) {
        const errorMessage = axios.isAxiosError(error)
            ? `API Error (${error.response?.status}) resolving URI ${uri}: ${error.response?.data?.error || error.message}`
            : error instanceof Error
            ? error.message
            : `Unknown error reading resource URI: ${uri}`;
        debugError("[ReadResource Handler Error]", errorMessage);
        // Let SDK handle error formatting
        throw new Error(`Failed to read resource ${uri}: ${errorMessage}`);
    }
  });

  // List Resource Templates Handler - Fetches aggregated list from Pluggedin App API
  // Extract ListResourceTemplates handler logic for error handling
  const listResourceTemplatesHandler = withErrorHandling(async (request: any) => {
    const apiKey = getPluggedinMCPApiKey();
    const baseUrl = getPluggedinMCPApiBaseUrl();

    // If no API key, return empty templates (for MCP best practices)
    if (!apiKey || !baseUrl) {
      return {
        resourceTemplates: [],
        nextCursor: undefined
      };
    }

    const apiUrl = `${baseUrl}/api/resource-templates`; // New endpoint

    // Fetch the list of templates
    // Assuming the API returns ResourceTemplate[] directly
    const response = await axios.get<ResourceTemplate[]>(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 10000, // Add a timeout
    });

    const templates = response.data || [];

    // Wrap the array in the expected structure for the MCP response
    return { resourceTemplates: templates, nextCursor: undefined }; // Pagination not handled
  }, {
    action: 'list_resource_templates'
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, listResourceTemplatesHandler);

  // Ping Handler - Responds to simple ping requests
  server.setRequestHandler(PingRequestSchema, async (request) => {
    // Return empty object for MCP spec compliance
    return {};
  });

  const cleanup = async () => {
    try {
      // Clean up sessions
      await cleanupAllSessions();
      
      // Clear tool mappings
      Object.keys(toolToServerMap).forEach(key => delete toolToServerMap[key]);
      Object.keys(instructionToServerMap).forEach(key => delete instructionToServerMap[key]);
      
      // Reset rate limiters
      toolCallRateLimiter.reset();
      apiCallRateLimiter.reset();
      
    } catch (error) {
      debugError("[Proxy Cleanup] Error during cleanup:", error);
    }
  };

  return { server, cleanup };
};
