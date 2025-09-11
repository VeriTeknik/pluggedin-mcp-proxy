import axios from "axios";
import {
  getDefaultEnvironment,
  getPluggedinMCPApiBaseUrl,
  getPluggedinMCPApiKey,
} from "./utils.js";
import { debugLog, debugError } from "./debug-log.js";
// import { logger } from "./logging.js"; // No longer needed, get from container
// import { container } from "./di-container.js"; // Removed DI container
// import { Logger } from "./logging.js"; // Removed Logger type
import { ServerParameters } from "./types.js"; // Import ServerParameters type

let _mcpServersCache: Record<string, ServerParameters> | null = null;
let _mcpServersCacheTimestamp: number = 0;
const CACHE_TTL_MS = 1000; // 1 second cache TTL

// Removed logger

export async function getMcpServers(
  forceRefresh: boolean = false
): Promise<Record<string, ServerParameters>> {
  const currentTime = Date.now();
  const cacheAge = currentTime - _mcpServersCacheTimestamp;

  // Use cache if it exists, is not null, and either:
  // 1. forceRefresh is false, or
  // 2. forceRefresh is true but cache is less than 1 second old
  if (_mcpServersCache !== null && (!forceRefresh || cacheAge < CACHE_TTL_MS)) {
    return _mcpServersCache;
  }

  try {
    const apiKey = getPluggedinMCPApiKey();
    const apiBaseUrl = getPluggedinMCPApiBaseUrl();

    if (!apiKey || !apiBaseUrl) { // Also check apiBaseUrl
      // logger.error( // Removed logging
      //   "PLUGGEDIN_API_KEY or PLUGGEDIN_API_BASE_URL is not set. Cannot fetch MCP servers."
      // );
      // Return the last known cache if available, otherwise empty object
      return _mcpServersCache || {};
    }

    const headers = { Authorization: `Bearer ${apiKey}` };
    const response = await axios.get(`${apiBaseUrl}/api/mcp-servers`, {
      headers,
    });
    const data = response.data;

    const serverDict: Record<string, ServerParameters> = {};
    for (const serverParams of data) {
      const params: ServerParameters = {
        ...serverParams,
        type: serverParams.type || "STDIO",
      };

      // Process based on server type
      if (params.type === "STDIO") {
        if ("args" in params && !params.args) {
          params.args = undefined;
        }

        params.env = {
          ...getDefaultEnvironment(),
          ...(params.env || {}),
        };
      } else if (params.type === "SSE") {
        // For SSE servers, ensure url is present
        if (!params.url) {
          // logger.warn( // Removed logging
          //   `SSE server ${params.uuid} (${params.name}) is missing url field, skipping`
          // );
          continue;
        }
      } else if (params.type === "STREAMABLE_HTTP") {
        // Map streamableHTTPOptions to direct fields for backward compatibility
        // Merge headers for backward compatibility, streamableHTTPOptions.headers takes precedence
        params.headers = {
          ...(params.headers || {}),
          ...(params.streamableHTTPOptions?.headers || {}),
        };
        // For sessionId, streamableHTTPOptions.sessionId takes precedence if present
        params.sessionId = params.streamableHTTPOptions?.sessionId || params.sessionId;
        
        // Log if headers or sessionId are present
        if ((params.headers && Object.keys(params.headers).length > 0) || params.sessionId) {
          debugLog(`[MCP] StreamableHTTP server ${params.name}: headers=${Object.keys(params.headers || {}).length}, sessionId=${!!params.sessionId}`);
        }
        
        // Ensure url is present
        if (!params.url) {
          debugError(`StreamableHTTP server ${params.uuid} (${params.name}) is missing url field, skipping`);
          continue;
        }
      }

      const uuid = params.uuid;
      if (uuid) {
        serverDict[uuid] = params;
      }
    }

    _mcpServersCache = serverDict;
    _mcpServersCacheTimestamp = currentTime;
    // logger.debug(`Fetched and cached ${Object.keys(serverDict).length} MCP server configurations.`); // Removed logging
    return serverDict;
  } catch (error: any) { // Add type to error
    // logger.error("Failed to fetch MCP servers from API:", error.message || error); // Removed logging
    // Return the last known cache if available on error, otherwise empty object
    if (_mcpServersCache !== null) {
      // logger.warn("Returning stale MCP server cache due to fetch error."); // Removed logging
      return _mcpServersCache;
    }
    return {};
  }
}
