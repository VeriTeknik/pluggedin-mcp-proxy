import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CompatibilityCallToolResultSchema,
  ListToolsResultSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { getMcpServers } from "../fetch-pluggedinmcp.js";
import { getSessionKey, sanitizeName, getPluggedinMCPApiKey, getPluggedinMCPApiBaseUrl } from "../utils.js"; // Import API utils
import axios from "axios"; // Import axios
import { getSession } from "../sessions.js";
import { ConnectedClient } from "../client.js"; // Assuming ConnectedClient holds the session/client
import { ToolExecutionResult } from "../types.js";

const toolName = "tool_call"; // Renamed to match veyrax-mcp convention
const toolDescription = `
Executes a specific proxied MCP tool managed by PluggedinMCP.
Use 'get_tools' first to find the correct 'tool_name' (e.g., 'github__create_issue').
Requires a valid PluggedinMCP API key configured in the environment. The API key is used implicitly by the server based on its environment configuration.
`;

// Define the input schema for this tool
const CallPluggedinToolSchema = z.object({
  tool_name: z
    .string()
    .describe(
      "The prefixed name of the proxied tool to call (e.g., 'github__create_issue', 'google_calendar__list_events'). Get this from 'get_tools'."
    ),
  arguments: z // Renamed input parameter to match veyrax-mcp
    .record(z.any())
    .optional()
    .default({})
    .describe(
      "The arguments object required by the specific proxied tool being called."
    ),
});

// Removed logger

/**
 * Implementation for the 'tool_call' static tool.
 * Proxies a tool call to the appropriate downstream MCP server based on the prefixed tool name.
 */
// Removed ToolPlugin interface implementation
// Note: Class kept for reference but not exported (unused in current implementation)
class CallPluggedinToolTool {
  readonly name = toolName;
  readonly description = toolDescription;
  readonly inputSchema = CallPluggedinToolSchema;

  // Removed findClientForTool static method as it relied on removed tool-registry

  /**
   * Executes the 'tool_call' logic.
   * Finds the correct downstream server based on the prefixed tool name,
   * extracts the original tool name, and proxies the 'tools/call' request.
   * @param args - Validated input arguments containing 'tool_name' and 'arguments'.
   * @param meta - Optional request metadata containing progress tokens etc.
   * @returns A promise resolving to the ToolExecutionResult from the downstream server.
   */
  async execute(
    args: z.infer<typeof CallPluggedinToolSchema>,
    meta?: any
  ): Promise<ToolExecutionResult> {
    const { tool_name: toolName, arguments: toolArgs } = args;

    // Find the client session directly
    let clientForTool: ConnectedClient | null = null;
    let serverName = "unknown"; // Default server name
    let serverUuid: string | null = null;

    try {
      // First, check if the tool arguments contain a _serverUuid field
      // This would be the case if the tool was called directly from the get_tools response
      if (toolArgs && '_serverUuid' in toolArgs) {
        serverUuid = toolArgs._serverUuid;
        // Remove the _serverUuid field from the arguments before passing to the downstream server
        delete toolArgs._serverUuid;
      }
      
      // If we don't have a serverUuid from the arguments, try to get it from the API
      if (!serverUuid) {
        // Fetch tools from the API to find the server UUID for this tool
        const apiKey = getPluggedinMCPApiKey();
        const apiBaseUrl = getPluggedinMCPApiBaseUrl();
        
        if (apiKey && apiBaseUrl) {
          try {
            const response = await axios.get(
              `${apiBaseUrl}/api/tools`,
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                },
              }
            );
            
            let tools: any[] = [];
            if (response.data && response.data.tools && Array.isArray(response.data.tools)) {
              tools = response.data.tools;
            } else if (response.data && Array.isArray(response.data)) {
              tools = response.data;
            }
            
            // Find the tool with the matching name
            const matchingTool = tools.find((tool: any) => tool.name === toolName);
            if (matchingTool) {
              serverUuid = matchingTool.mcp_server_uuid || matchingTool._serverUuid;
            }
          } catch (error) {
            // Ignore API errors and fall back to the old method
          }
        }
      }
      
      // If we have a serverUuid, get the server params and session
      if (serverUuid) {
        const serverParamsMap = await getMcpServers(); // Fetch server configs
        const params = serverParamsMap[serverUuid];
        
        if (params) {
          serverName = params.name || serverUuid;
          const sessionKey = getSessionKey(serverUuid, params);
          // Attempt to get the session
          const session = await getSession(sessionKey, serverUuid, params);
          if (session) {
            clientForTool = session;
          }
        }
      }
      
      // If we still don't have a client, fall back to the old method of checking all servers
      if (!clientForTool) {
        const serverParamsMap = await getMcpServers(); // Fetch server configs
        for (const [uuid, params] of Object.entries(serverParamsMap)) {
          serverName = params.name || uuid;
          const sessionKey = getSessionKey(uuid, params);
          // Attempt to get the session
          const session = await getSession(sessionKey, uuid, params);
          if (session) {
            // Try to check if this server has the tool
            try {
              const toolsResponse = await session.client.request(
                { method: "tools/list", params: {} },
                ListToolsResultSchema
              );
              
              if (toolsResponse.tools.some((tool: Tool) => tool.name === toolName)) {
                clientForTool = session;
                break; // Found the matching server and session
              }
            } catch (error) {
              // Ignore errors and continue to the next server
            }
          }
        }
      }
    } catch (error) {
        // logger.error("Error finding client session for tool call:", error); // Removed logging
        return {
          isError: true,
          content: [{ type: "text", text: `Error finding origin server for tool: ${toolName}` }],
        };
    }

    // Handle cases where client wasn't found
    if (!clientForTool) {
        // logger.warn(`Could not find active session for tool: ${toolName}`); // Removed logging
        return {
          isError: true,
          content: [{ type: "text", text: `Error: Tool not found or origin server unavailable: ${toolName}` }],
        };
    }

    // Proceed with the tool call using the found client
    try {
      // logger.debug( // Removed logging
      //   `Proxying call to tool '${toolName}' on server '${serverName}' with args:`,
      //   toolArgs
      // );
      // Call the actual tool on the downstream client
      return await clientForTool.client.request(
        {
          method: "tools/call",
          params: {
            name: toolName,
            arguments: toolArgs || {},
            _meta: {
              progressToken: meta?.progressToken, // Use meta here
            },
          },
        },
        CompatibilityCallToolResultSchema // Use the schema that expects content/isError
      ) as ToolExecutionResult; // Explicitly cast the result
      // The result from client.request should match ToolExecutionResult structure after type update
      // return result; // Removed extraneous return
    } catch (error) {
      // logger.error( // Removed logging
      //   `Error calling tool '${toolName}' through ${serverName}:`,
      //   error
      // );
      // Return error structure matching ToolExecutionResult
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Error executing proxied tool: ${errorMessage}` }],
      };
    }
 }
}

// Removed plugin registration
