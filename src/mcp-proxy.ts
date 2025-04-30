import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  ListToolsResultSchema,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListResourceTemplatesRequestSchema,
  ListResourceTemplatesResultSchema,
  ResourceTemplate,
  CompatibilityCallToolResultSchema,
  GetPromptResultSchema,
  PromptMessage, // Import PromptMessage
  PingRequestSchema, // Import PingRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getMcpServers } from "./fetch-pluggedinmcp.js";
import { getSessionKey, sanitizeName, isDebugEnabled, getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from "./utils.js";
import { cleanupAllSessions, getSession, initSessions } from "./sessions.js";
import { ConnectedClient } from "./client.js";
import axios from "axios";
// Removed unused imports
// import { GetPluggedinToolsTool } from "./tools/get-pluggedin-tools.js"; // No longer needed?
// import { CallPluggedinToolTool } from "./tools/call-pluggedin-tool.js"; // No longer needed?
import { zodToJsonSchema } from 'zod-to-json-schema';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { ToolExecutionResult, ServerParameters } from "./types.js"; // Import ServerParameters
// Removed incorrect McpMessage import

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

// Map to store prefixed tool name -> { originalName, serverUuid }
const toolToServerMap: Record<string, { originalName: string; serverUuid: string; }> = {};
// Map to store prefixed instruction name -> serverUuid
const instructionToServerMap: Record<string, string> = {};

// Removed logger

// Define the static discovery tool schema using Zod
const DiscoverToolsInputSchema = z.object({
  server_uuid: z.string().uuid().optional().describe("Optional UUID of a specific server to discover. If omitted, attempts to discover all."),
}).describe("Triggers tool discovery for configured MCP servers in the Pluggedin App.");

// Define the static discovery tool structure
const discoverToolsStaticTool: Tool = {
    name: "pluggedin_discover_tools",
    description: "Triggers discovery of tools (and resources/templates) for configured MCP servers in the Pluggedin App.",
    inputSchema: zodToJsonSchema(DiscoverToolsInputSchema) as any,
};


// Removed old static tool instances (getToolsInstance, callToolInstance) as they are superseded by API fetching

export const createServer = async () => {
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
     let fetchedTools: (Tool & { _serverUuid: string, _serverName?: string })[] = [];
     try {
       const apiKey = getPluggedinMCPApiKey();
       const baseUrl = getPluggedinMCPApiBaseUrl();
       if (!apiKey || !baseUrl) {
         throw new Error("Pluggedin API Key or Base URL is not configured.");
       }

       const apiUrl = `${baseUrl}/api/tools`; // Assuming this is the correct endpoint

       // Fetch the list of tools (which include original names and server info)
       // The API returns an object like { tools: [], message?: "..." }
       const response = await axios.get<{ tools: (Tool & { _serverUuid: string, _serverName?: string })[], message?: string }>(apiUrl, {
         headers: {
           Authorization: `Bearer ${apiKey}`,
         },
         timeout: 10000,
       });

       // Access the 'tools' array from the response payload
       const fetchedTools = response.data?.tools || [];

       // Clear previous mapping and populate with new data
       Object.keys(toolToServerMap).forEach(key => delete toolToServerMap[key]); // Clear map
       
       // Create mappings for each tool to its server
       fetchedTools.forEach(tool => {
         // Store mapping with original name as the key
         if (tool.name && tool._serverUuid) {
            toolToServerMap[tool.name] = { 
              originalName: tool.name, // No transformation needed anymore
              serverUuid: tool._serverUuid 
            };
         } else {
            console.error(`[ListTools Handler] Missing tool name or UUID for tool: ${tool.name}`);
         }
       });

       // Prepare the response payload according to MCP spec { tools: Tool[] }
       // Remove the internal _serverUuid and _serverName before sending to client
       const toolsForClient: Tool[] = fetchedTools.map(({ _serverUuid, _serverName, ...rest }) => rest);

       // Note: Pagination not handled here, assumes API returns all tools

       // Always include the static discovery tool
       const allToolsForClient = [discoverToolsStaticTool, ...toolsForClient];

       return { tools: allToolsForClient, nextCursor: undefined };

     } catch (error: any) {
       // Log API fetch error but still return the static tool
       const errorMessage = axios.isAxiosError(error)
         ? `API Error (${error.response?.status}): ${error.message}`
         : error instanceof Error
         ? error.message
         : "Unknown error fetching tools from API";
       console.error("[ListTools Handler Error]", errorMessage);
       throw new Error(`Failed to list tools: ${errorMessage}`);
     }
  });

  // Call Tool Handler - Routes tool calls to the appropriate downstream server
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: requestedToolName, arguments: args } = request.params;
    const meta = request.params._meta;

    try {
        // Handle static discovery tool first
        if (requestedToolName === discoverToolsStaticTool.name) {
            console.error(`[CallTool Handler] Executing static tool: ${requestedToolName}`);
            const validatedArgs = DiscoverToolsInputSchema.parse(args ?? {}); // Validate args

            const apiKey = getPluggedinMCPApiKey();
            const baseUrl = getPluggedinMCPApiBaseUrl();
            if (!apiKey || !baseUrl) {
                throw new Error("Pluggedin API Key or Base URL is not configured for discovery trigger.");
            }

            // Define the API endpoint in pluggedin-app to trigger discovery
            // (This endpoint needs to be created in pluggedin-app)
            const discoveryApiUrl = validatedArgs.server_uuid
                ? `${baseUrl}/api/discover/${validatedArgs.server_uuid}` // Endpoint for specific server
                : `${baseUrl}/api/discover/all`; // Endpoint for all servers

            try {
                // Make POST request to trigger discovery
                const discoveryResponse = await axios.post(discoveryApiUrl, {}, { // Empty body for trigger
                    headers: { Authorization: `Bearer ${apiKey}` },
                    timeout: 30000, // Allow longer timeout for discovery trigger
                });

                // Return success message from the discovery API response
                const responseMessage = discoveryResponse.data?.message || "Discovery process initiated.";
                return {
                    content: [{ type: "text", text: responseMessage }],
                    isError: false,
                } as ToolExecutionResult; // Cast to expected type

            } catch (apiError: any) {
                 const errorMsg = axios.isAxiosError(apiError)
                    ? `API Error (${apiError.response?.status}): ${apiError.response?.data?.error || apiError.message}`
                    : apiError.message;
                 throw new Error(`Failed to trigger discovery via API: ${errorMsg}`);
            }
        }

        // Look up the downstream tool in our map using original name
        const toolInfo = toolToServerMap[requestedToolName];
        if (!toolInfo) {
            throw new Error(`Method not found: ${requestedToolName}`);
        }

        const { originalName, serverUuid } = toolInfo;

        // Get the downstream server session
        // Need to fetch server params again - potentially cache this?
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

        // Proxy the call to the downstream server using the original tool name
        console.error(`[CallTool Proxy] Calling tool '${originalName}' on server ${serverUuid}`);
        const result = await session.client.request(
            { method: "tools/call", params: { name: originalName, arguments: args, _meta: meta } },
             CompatibilityCallToolResultSchema
        );

        // Return the result directly, casting to any to satisfy the handler's complex return type
        return result as any;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Use requestedToolName here, which is in scope
      console.error(`[CallTool Handler Error] Tool: ${requestedToolName}, Error: ${errorMessage}`);

      // Re-throw the error for the SDK to format and send back to the client
      if (error instanceof Error) {
         throw error;
      } else {
         throw new Error(errorMessage || "An unknown error occurred during tool execution");
      }
    }
  });

  // Get Prompt Handler - Handles standard prompts (via resolve API + proxy) and custom instructions (via direct API call)
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const meta = request.params._meta;
    const instructionPrefix = 'pluggedin_instruction_';

    try {
      const apiKey = getPluggedinMCPApiKey();
      const baseUrl = getPluggedinMCPApiBaseUrl();
      if (!apiKey || !baseUrl) {
        throw new Error("Pluggedin API Key or Base URL is not configured.");
      }

      if (name.startsWith(instructionPrefix)) {
        // --- Handle Custom Instruction Request ---
        console.error(`[GetPrompt Handler] Detected custom instruction prefix for: ${name}`);
        const serverUuid = instructionToServerMap[name];
        console.error(`[GetPrompt Handler] Looked up serverUuid from instructionToServerMap: ${serverUuid}`); // Log UUID lookup
        if (!serverUuid) {
           console.error(`[GetPrompt Handler] Current instructionToServerMap:`, JSON.stringify(instructionToServerMap)); // Log the map content
          throw new Error(`Server UUID not found in map for custom instruction: ${name}. Try listing prompts again.`);
        }

        // Call the new app API endpoint to get instruction details
        // This endpoint needs to be created: /api/custom-instructions/[uuid]
        const instructionApiUrl = `${baseUrl}/api/custom-instructions/${serverUuid}`;
        console.error(`[GetPrompt Handler] Fetching instruction details from: ${instructionApiUrl}`);

        try {
          // Expecting the API to return { messages: PromptMessage[] }
          const response = await axios.get<{ messages: PromptMessage[] }>(instructionApiUrl, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 10000,
          });

          const instructionData = response.data;
          if (!instructionData || !Array.isArray(instructionData.messages)) {
             throw new Error(`Invalid response format from ${instructionApiUrl}`);
          }

          // Construct the GetPromptResult directly in the proxy
          return {
            messages: instructionData.messages,
          } as z.infer<typeof GetPromptResultSchema>; // Ensure correct type

        } catch (apiError: any) {
           const errorMsg = axios.isAxiosError(apiError)
              ? `API Error (${apiError.response?.status}) fetching instruction ${name}: ${apiError.response?.data?.error || apiError.message}`
              : apiError.message;
           throw new Error(`Failed to fetch custom instruction details: ${errorMsg}`);
        }

      } else {
        // --- Handle Standard Prompt Request (Existing Logic) ---
        console.error(`[GetPrompt Handler] No custom instruction prefix detected for: ${name}. Proceeding with standard prompt resolution.`);
        // 1. Call the resolve API endpoint
        const resolveApiUrl = `${baseUrl}/api/resolve/prompt?name=${encodeURIComponent(name)}`;
         console.error(`[GetPrompt Handler] Calling resolve API: ${resolveApiUrl}`); // Log API call
        const resolveResponse = await axios.get<ServerParameters>(resolveApiUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        });

        const serverParams = resolveResponse.data;
        if (!serverParams || !serverParams.uuid) {
          throw new Error(`Could not resolve server details for prompt name: ${name}`);
        }

        // 2. Get the downstream server session
        const sessionKey = getSessionKey(serverParams.uuid, serverParams);
        const session = await getSession(sessionKey, serverParams.uuid, serverParams);

        if (!session) {
          console.warn(`[GetPrompt Handler] Session not found for ${serverParams.uuid}, attempting re-init...`);
          await initSessions();
          const refreshedSession = await getSession(sessionKey, serverParams.uuid, serverParams);
          if (!refreshedSession) {
            throw new Error(`Session could not be established for server UUID: ${serverParams.uuid} handling prompt: ${name}`);
          }
          // Use the refreshed session
          console.error(`[GetPrompt Handler] Proxying get request for prompt '${name}' to server ${serverParams.name || serverParams.uuid}`);
          return await refreshedSession.client.request(
            { method: "prompts/get", params: { name, arguments: args, _meta: meta } },
            GetPromptResultSchema
          );
        } else {
          // Use the existing session
          console.error(`[GetPrompt Handler] Proxying get request for prompt '${name}' to server ${serverParams.name || serverParams.uuid}`);
          return await session.client.request(
            { method: "prompts/get", params: { name, arguments: args, _meta: meta } },
            GetPromptResultSchema
          );
        }
      }
    } catch (error: any) {
      const errorMessage = axios.isAxiosError(error)
        ? `API Error (${error.response?.status}) resolving/getting prompt ${name}: ${error.response?.data?.error || error.message}`
        : error instanceof Error
        ? error.message
        : `Unknown error getting prompt: ${name}`;
      console.error("[GetPrompt Handler Error]", errorMessage);
      throw new Error(`Failed to get prompt ${name}: ${errorMessage}`);
    }
  });

  // List Prompts Handler - Fetches aggregated list from Pluggedin App API
  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    try {
      const apiKey = getPluggedinMCPApiKey();
      const baseUrl = getPluggedinMCPApiBaseUrl();
      if (!apiKey || !baseUrl) {
        throw new Error("Pluggedin API Key or Base URL is not configured.");
      }

      const promptsApiUrl = `${baseUrl}/api/prompts`;
      const customInstructionsApiUrl = `${baseUrl}/api/custom-instructions`; // New endpoint for custom instructions

      // Fetch both standard prompts and custom instructions concurrently
      const [promptsResponse, customInstructionsResponse] = await Promise.all([
        axios.get<z.infer<typeof ListPromptsResultSchema>["prompts"]>(promptsApiUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        }),
        axios.get<z.infer<typeof ListPromptsResultSchema>["prompts"]>(customInstructionsApiUrl, { // Assuming custom instructions API returns the same format
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        })
      ]);

      const standardPrompts = promptsResponse.data || [];
      const customInstructionsAsPrompts = customInstructionsResponse.data || [];

      // Clear previous instruction mapping and populate with new data
      Object.keys(instructionToServerMap).forEach(key => delete instructionToServerMap[key]); // Clear map
      customInstructionsAsPrompts.forEach(instr => {
        if (instr.name && instr._serverUuid) {
          // Assert _serverUuid as string since the check ensures it's not undefined
          instructionToServerMap[instr.name] = instr._serverUuid as string;
        } else {
            console.error(`[ListPrompts Handler] Missing name or _serverUuid for custom instruction:`, instr);
        }
      });

      // Merge the results (Remove internal _serverUuid from custom instructions before sending to client)
      const allPrompts = [
          ...standardPrompts,
          ...customInstructionsAsPrompts.map(({ _serverUuid, ...rest }) => rest)
      ];

      // Wrap the combined array in the expected structure for the MCP response
      // Note: Pagination not handled here
      return { prompts: allPrompts, nextCursor: undefined };

    } catch (error: any) {
      const errorMessage = axios.isAxiosError(error)
        ? `API Error (${error.response?.status}): ${error.message}`
        : error instanceof Error
        ? error.message
        : "Unknown error fetching prompts or custom instructions from API";
      console.error("[ListPrompts Handler Error]", errorMessage);
      // Let SDK handle error formatting
      throw new Error(`Failed to list prompts: ${errorMessage}`);
    }
  });


  // List Resources Handler - Fetches aggregated list from Pluggedin App API
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    try {
      const apiKey = getPluggedinMCPApiKey();
      const baseUrl = getPluggedinMCPApiBaseUrl();
      if (!apiKey || !baseUrl) {
        throw new Error("Pluggedin API Key or Base URL is not configured.");
      }

      const apiUrl = `${baseUrl}/api/resources`; // Assuming this is the correct endpoint

      // console.error(`[Proxy - ListResources] Fetching from ${apiUrl}`); // Debug log

      const response = await axios.get<z.infer<typeof ListResourcesResultSchema>["resources"]>(apiUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 10000, // Add a timeout for the API call (e.g., 10 seconds)
      });

      // The API currently returns just the array, wrap it in the expected structure
      const resources = response.data || [];

      // console.error(`[Proxy - ListResources] Received ${resources.length} resources from API.`); // Debug log

      // Note: Pagination across servers via the API is not implemented here.
      // The API would need to support cursor-based pagination for this to work fully.
      return { resources: resources, nextCursor: undefined };

    } catch (error: any) {
      const errorMessage = axios.isAxiosError(error)
        ? `API Error (${error.response?.status}): ${error.message}`
        : error instanceof Error
        ? error.message
        : "Unknown error fetching resources from API";
      console.error("[ListResources Handler Error]", errorMessage);
      // Let SDK handle error formatting
      throw new Error(`Failed to list resources: ${errorMessage}`);
    }
  });

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
        // console.error(`[ReadResource Handler] Resolving URI via: ${resolveApiUrl}`); // Optional debug log

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
            console.warn(`[ReadResource Handler] Session not found for ${serverParams.uuid}, attempting re-init...`);
            await initSessions(); // Re-initialize all sessions
            const refreshedSession = await getSession(sessionKey, serverParams.uuid, serverParams);
            if (!refreshedSession) {
               throw new Error(`Session could not be established for server UUID: ${serverParams.uuid} handling URI: ${uri}`);
            }
             // Use the refreshed session
             console.error(`[ReadResource Handler] Proxying read request for URI '${uri}' to server ${serverParams.name || serverParams.uuid}`);
             const result = await refreshedSession.client.request(
                 { method: "resources/read", params: { uri, _meta: meta } }, // Pass original URI and meta
                 ReadResourceResultSchema
             );
             return result;
        } else {
             // Use the existing session
             console.error(`[ReadResource Handler] Proxying read request for URI '${uri}' to server ${serverParams.name || serverParams.uuid}`);
             const result = await session.client.request(
                 { method: "resources/read", params: { uri, _meta: meta } }, // Pass original URI and meta
                 ReadResourceResultSchema
             );
             return result;
        }

    } catch (error: any) {
        const errorMessage = axios.isAxiosError(error)
            ? `API Error (${error.response?.status}) resolving URI ${uri}: ${error.response?.data?.error || error.message}`
            : error instanceof Error
            ? error.message
            : `Unknown error reading resource URI: ${uri}`;
        console.error("[ReadResource Handler Error]", errorMessage);
        // Let SDK handle error formatting
        throw new Error(`Failed to read resource ${uri}: ${errorMessage}`);
    }
  });

  // List Resource Templates Handler - Fetches aggregated list from Pluggedin App API
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async (request) => {
    try {
      const apiKey = getPluggedinMCPApiKey();
      const baseUrl = getPluggedinMCPApiBaseUrl();
      if (!apiKey || !baseUrl) {
        throw new Error("Pluggedin API Key or Base URL is not configured.");
      }

      const apiUrl = `${baseUrl}/api/resource-templates`; // New endpoint

      // console.error(`[Proxy - ListResourceTemplates] Fetching from ${apiUrl}`); // Debug log

      // Fetch the list of templates
      // Assuming the API returns ResourceTemplate[] directly
      const response = await axios.get<ResourceTemplate[]>(apiUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 10000, // Add a timeout
      });

      const templates = response.data || [];

      // console.error(`[Proxy - ListResourceTemplates] Received ${templates.length} templates from API.`); // Debug log

      // Wrap the array in the expected structure for the MCP response
      return { resourceTemplates: templates, nextCursor: undefined }; // Pagination not handled

    } catch (error: any) {
      const errorMessage = axios.isAxiosError(error)
        ? `API Error (${error.response?.status}): ${error.message}`
        : error instanceof Error
        ? error.message
        : "Unknown error fetching resource templates from API";
      console.error("[ListResourceTemplates Handler Error]", errorMessage);
      // Let SDK handle error formatting
      throw new Error(`Failed to list resource templates: ${errorMessage}`);
    }
  });

  // Ping Handler - Responds to simple ping requests
  server.setRequestHandler(PingRequestSchema, async (request) => {
    console.error("[Ping Handler] Received ping request.");
    // Ping response should be an empty object for success
    return {};
  });

  const cleanup = async () => {
    await cleanupAllSessions();
  };

  return { server, cleanup };
};
