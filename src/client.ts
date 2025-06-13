import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ServerParameters } from "./types.js";
import { createRequire } from 'module';
// import { container } from './di-container.js'; // Removed DI container
// import { Logger } from './logging.js'; // Removed Logger type

const customRequire = createRequire(import.meta.url);
const packageJson = customRequire('../package.json');

// Removed logger

const sleep = (time: number) =>
  new Promise<void>((resolve) => setTimeout(() => resolve(), time));
export interface ConnectedClient {
  client: Client;
  cleanup: () => Promise<void>;
}

export const createPluggedinMCPClient = (
  serverParams: ServerParameters
): { client: Client | undefined; transport: Transport | undefined } => {
  let transport: Transport | undefined;

  // Create the appropriate transport based on server type
  // Default to "STDIO" if type is undefined
  if (!serverParams.type || serverParams.type === "STDIO") {
    const stdioParams: StdioServerParameters = {
      command: serverParams.command || "",
      args: serverParams.args || undefined,
      env: serverParams.env || undefined,
      // Use default values for other optional properties
      // stderr and cwd will use their default values
    };
    transport = new StdioClientTransport(stdioParams);
  } else if (serverParams.type === "SSE" && serverParams.url) {
    transport = new SSEClientTransport(new URL(serverParams.url));
  } else {
    // logger.error(`Unsupported server type: ${serverParams.type} for server ${serverParams.name} (${serverParams.uuid})`); // Removed logging
    return { client: undefined, transport: undefined };
  }

  const client = new Client(
    {
      name: "PluggedinMCP",
      version: packageJson.version, // Use version from package.json
    },
    {
      capabilities: {
        prompts: {},
        resources: { subscribe: true },
        tools: {},
      },
    }
  );
  return { client, transport };
};

export const connectPluggedinMCPClient = async (
  client: Client,
  transport: Transport
): Promise<ConnectedClient | undefined> => {
  const waitFor = 2500;
  const retries = 3;
  let count = 0;
  let retry = true;

  while (retry) {
    try {
      await client.connect(transport);

      return {
        client,
        cleanup: async () => {
          await transport.close();
          await client.close();
        },
      };
    } catch (error) {
      count++;
      retry = count < retries;
      if (retry) {
        try {
          await client.close();
        } catch {}
        await sleep(waitFor);
      }
    }
  }
};
